import { assert, describe, it, vi } from "vitest"

/**
 * The dev-only occupancy report is the only visibility into whether a calculation was
 * reused or recomputed, so it is covered rather than trusted: it must collapse a burst
 * into one report, reprint when occupancy changes, and stay silent in a test build.
 */
async function withStore(mode: string) {
  vi.resetModules()
  vi.stubEnv("MODE", mode)
  vi.stubEnv("DEV", true)
  class FakeWorker {
    listeners = new Map()
    addEventListener(type: string, listener: (event: any) => void) {
      const list = this.listeners.get(type) ?? []
      list.push(listener)
      this.listeners.set(type, list)
    }
    postMessage(message: any) {
      queueMicrotask(() => {
        for (const listener of this.listeners.get("message") ?? []) {
          listener({ data: { id: message.id, metrics: { dps: 1, breakdown: {} } } })
        }
      })
    }
    terminate() {}
  }
  vi.stubGlobal("Worker", FakeWorker)
  return import("../src/stores/dpsStore.ts")
}

const bundle = { timeline: { rotation: { name: "Diagnostics", steps: [] } }, weapons: [] } as never

function captureConsole() {
  const groups: string[] = []
  const tables: unknown[][] = []
  vi.spyOn(console, "groupCollapsed").mockImplementation((label?: string) => {
    if (label !== undefined) groups.push(label)
  })
  vi.spyOn(console, "table").mockImplementation(rows => {
    tables.push(rows as unknown[])
  })
  vi.spyOn(console, "info").mockImplementation(() => {})
  return { groups, tables, restore: () => vi.restoreAllMocks() }
}

/** Long enough for the report's coalescing delay to have elapsed. */
const settle = () => new Promise(resolve => setTimeout(resolve, 300))

describe("dps-store-diagnostics", () => {
  it("collapses a burst into one report and reprints when occupancy changes", async () => {
    const { useDpsStore } = await withStore("development")
    const console_ = captureConsole()
    try {
      const store = () => useDpsStore.getState()
      await Promise.all(
        Array.from({ length: 12 }, (_, index) =>
          store().ensure({ kind: "baseline", cacheKey: `burst-${index}`, build: () => bundle }),
        ),
      )
      await settle()
      assert.equal(console_.groups.length, 1, "A burst of calculations did not collapse into one report.")
      assert.match(console_.groups[0], /baseline 12\/64/, `Unexpected report: ${console_.groups[0]}`)

      await settle()
      assert.equal(console_.groups.length, 1, "An unchanged summary was reprinted.")

      await store().ensure({ kind: "baseline", cacheKey: "burst-extra", build: () => bundle })
      await settle()
      assert.equal(console_.groups.length, 2, "A changed summary was not reported.")
      assert.match(console_.groups[1], /baseline 13\/64/, `Unexpected report: ${console_.groups[1]}`)

      const rows = console_.tables.at(-1) as Array<Record<string, unknown>>
      assert.equal(rows.find(row => row.kind === "baseline")!.ready, 13)
      assert.equal(rows.find(row => row.kind === "baseline")!.limit, 64)
      assert.equal(rows.find(row => row.kind === "editorTimeline")!.limit, 0)
      store().dispose()
    } finally {
      console_.restore()
    }
  })

  it("reports a retention bound being reached", async () => {
    const { useDpsStore } = await withStore("development")
    const console_ = captureConsole()
    try {
      const store = () => useDpsStore.getState()
      await Promise.all(
        Array.from({ length: 70 }, (_, index) =>
          store().ensure({ kind: "baseline", cacheKey: `fill-${index}`, build: () => bundle }),
        ),
      )
      await settle()
      assert.match(console_.groups.at(-1)!, /baseline 64\/64/, "Occupancy did not stop at the retention bound.")
      store().dispose()
    } finally {
      console_.restore()
    }
  })

  it("stays silent in a test build", async () => {
    const { useDpsStore } = await withStore("test")
    const console_ = captureConsole()
    try {
      await useDpsStore.getState().ensure({ kind: "baseline", cacheKey: "quiet", build: () => bundle })
      await settle()
      assert.deepEqual(console_.groups, [], "The cache reported occupancy in a test build.")
    } finally {
      console_.restore()
    }
  })
})
