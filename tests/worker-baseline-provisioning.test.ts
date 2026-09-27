import { assert, describe, it, vi } from "vitest"

/**
 * The worker keeps its baseline cache per instance and reads it by the cache key the
 * client sends, falling back to a baseline supplied in the message and throwing when
 * neither is present. This drives the real store and transport against a worker that
 * reproduces that behaviour exactly, so the number of variants a comparison sweep
 * produces is tested against the cache it has to fit in.
 */
function faithfulWorker() {
  const baselineCache = new Map<string, unknown>()
  return class FaithfulWorker {
    listeners = new Map()
    terminated = false
    sent: any[] = []
    addEventListener(type: string, listener: (event: any) => void) {
      const list = this.listeners.get(type) ?? []
      list.push(listener)
      this.listeners.set(type, list)
    }
    postMessage(message: any) {
      this.sent.push(message)
      queueMicrotask(() => {
        if (this.terminated) return
        try {
          if (message.mode === "baseline") {
            baselineCache.set(message.cacheKey, { metrics: { dps: 1, breakdown: {} } })
            if (baselineCache.size > 64) baselineCache.delete(baselineCache.keys().next().value!)
            this.reply(message, { metrics: { dps: 1, breakdown: {} } })
            return
          }
          if (message.mode === "comparisons") {
            const baseline = baselineCache.get(message.cacheKey) ?? message.baseline
            if (!baseline) throw new Error(`No cached baseline exists for ${message.cacheKey}`)
            baselineCache.set(message.cacheKey, baseline)
            this.reply(message, { metrics: { dps: 2, breakdown: {} } })
            return
          }
          this.reply(message, {})
        } catch (error) {
          this.reply(message, { error: error instanceof Error ? error.message : String(error) })
        }
      })
    }
    reply(message: any, payload: Record<string, unknown>) {
      for (const listener of this.listeners.get("message") ?? []) {
        listener({ data: { id: message.id, ...payload } })
      }
    }
    terminate() {
      this.terminated = true
    }
  }
}

async function loadStore() {
  vi.resetModules()
  const Worker = faithfulWorker()
  vi.stubGlobal("Worker", Worker)
  const workers: InstanceType<typeof Worker>[] = []
  const Original = Worker
  class Tracking extends Original {
    constructor() {
      super()
      workers.push(this as InstanceType<typeof Original>)
    }
  }
  vi.stubGlobal("Worker", Tracking)
  const { useDpsStore } = await import("../src/stores/dpsStore.ts")
  return { useDpsStore, workers }
}

const bundle = { timeline: { rotation: { name: "Sweep", steps: [] } }, weapons: [] } as never
const baselineResult = { metrics: { dps: 1, breakdown: {} } } as never

async function sweep(useDpsStore: any, variantCount: number, keyFor: (index: number) => string) {
  const store = () => useDpsStore.getState()
  const rotationKey = "rotation-fingerprint"
  await store().ensure({ kind: "baseline", cacheKey: rotationKey, build: () => bundle })
  // Sequential because that is how a comparison sweep runs: each variant's baseline is
  // the same, but the store's in-flight bookkeeping is only exercised in that order.
  return Array.from({ length: variantCount }, (_, index) => index).reduce(
    (previous, index) =>
      previous.then(results =>
        store()
          .ensure({
            kind: "comparisons" as const,
            cacheKey: `${rotationKey}:${keyFor(index)}`,
            build: () => bundle,
            baseline: () => baselineResult,
            priority: 350,
          })
          .then(result => [...results, result]),
      ),
    Promise.resolve([] as Promise<unknown>[]),
  )
}

describe("calculation worker baseline provisioning", () => {
  it("serves a full comparison sweep when every variant keys the baseline separately", async () => {
    const { useDpsStore, workers } = await loadStore()
    const variantCount = 120
    const results = await sweep(useDpsStore, variantCount, index => `variant-${index}`)
    assert.equal(results.length, variantCount, "The sweep did not complete.")
    assert.ok(
      results.every(result => result.metrics.dps === 2),
      "A comparison variant resolved without a baseline.",
    )
    // Each per-variant key makes the client hold a baseline copy it will not send again.
    const seeded = workers
      .flatMap(worker => worker.sent)
      .filter(message => message.mode === "comparisons" && message.baseline)
    assert.ok(seeded.length > 0, "No variant carried a baseline, so this proved nothing.")
    useDpsStore.getState().dispose()
  })

  it("serves a repeated variant from the store without reaching a worker again", async () => {
    const { useDpsStore, workers } = await loadStore()
    useDpsStore.getState().reset()
    await sweep(useDpsStore, 3, () => "shared-key")
    const sent = workers.flatMap(worker => worker.sent).filter(message => message.mode === "comparisons")
    assert.equal(
      sent.length,
      1,
      `A repeated variant reached a worker ${sent.length} times instead of being served from the store.`,
    )
    useDpsStore.getState().dispose()
  })
})
