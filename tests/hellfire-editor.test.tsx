// @vitest-environment jsdom
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { assert, afterEach, beforeEach, expect, it, vi } from "vitest"

import english from "../public/locales/en.json"
import App from "../src/App"
import { requestEditorTimeline } from "../src/calculations/rotationWorkerClient"
import { initializeI18n } from "../src/i18n"

vi.mock("../src/calculations/rotationWorkerClient", () => ({
  requestRotationBaseline: vi.fn<() => Promise<unknown>>(() => new Promise(() => {})),
  requestRotationComparisons: vi.fn<() => Promise<unknown>>(() => new Promise(() => {})),
  requestEditorTimeline: vi.fn<() => Promise<unknown>>(() => new Promise(() => {})),
  supersedeRotationCalculationRequests: vi.fn<() => void>(),
  cancelEditorTimelineRequest: vi.fn<() => void>(),
}))

let container: HTMLDivElement
let root: Root
globalThis.IS_REACT_ACT_ENVIRONMENT = true
beforeEach(async () => {
  localStorage.clear()
  sessionStorage.clear()
  vi.useFakeTimers()
  vi.stubGlobal("matchMedia", () => ({ matches: false, addEventListener() {}, removeEventListener() {} }))
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => ({
      ok: true,
      json: async () => (url.endsWith("manifest.json") ? { default: "en", locales: ["en"] } : english),
    })),
  )
  await initializeI18n()
  container = document.createElement("div")
  document.body.appendChild(container)
  root = createRoot(container)
})
afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})
async function click(text: string) {
  const button = [...container.querySelectorAll("button")].find(node => node.textContent?.trim() === text)
  assert(button !== undefined, text)
  await act(async () => button!.click())
}
async function fill(input: HTMLInputElement, value: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value)
    input.dispatchEvent(new Event("input", { bubbles: true }))
  })
}
async function commit(input: HTMLInputElement, trigger: "enter" | "blur" = "blur") {
  await act(async () => {
    if (trigger === "enter") input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }))
    else input.dispatchEvent(new FocusEvent("focusout", { bubbles: true }))
  })
}
it("adds a timed Hellfire event, edits signed amounts, and saves it", async () => {
  await act(async () => root.render(<App />))
  await click("Rotation Editor")
  await click("Duplicate")
  const selects = [...container.querySelectorAll<HTMLSelectElement>('select[aria-label="Skill or event"]')]
  expect(selects.length).toBeGreaterThan(1)
  const select = selects[1]
  const groups = [...select.querySelectorAll("optgroup")]
  const groupLabels = groups.map(group => group.label)
  expect(groupLabels.slice(-2)).toEqual(["Events", "Action"])
  expect(groupLabels).toContain("Mystic")
  expect(groupLabels).toContain("General")
  for (const skillGroup of groups.slice(0, -2)) expect(skillGroup.querySelectorAll("option").length).toBeGreaterThan(0)
  expect([...groups[groups.length - 1].querySelectorAll("option")].map(option => option.textContent)).toEqual([
    "Action: Delay",
    "Action: Switch Martial Art",
  ])
  await act(async () => {
    select.value = "__event:Hellfire"
    select.dispatchEvent(new Event("change", { bubbles: true }))
  })
  const amount = container.querySelector<HTMLInputElement>(
    'input[aria-label="Hellfire change (+ adds / - subtracts)"]',
  )!
  expect(amount).not.toBeNull()
  await fill(amount, "-12.5")
  await commit(amount)
  expect(amount.value).toBe("-12.5")
  const time = amount.closest(".rotation-table-row")!.querySelector<HTMLInputElement>("input.rotation-event-time")!
  await fill(time, "3.25")
  await commit(time)
  await click("Save")
  const entries = JSON.parse(localStorage.getItem("wwm-rotation-list-session-v1")!)
  expect(entries.flatMap((entry: { rotation: { steps: unknown[] } }) => entry.rotation.steps)).toContainEqual({
    type: "event",
    event: "Hellfire",
    startTime: 3.25,
    amount: -12.5,
  })
  await fill(amount, "25")
  await commit(amount)
  await act(async () => {
    await vi.advanceTimersByTimeAsync(300)
  })
  expect(
    vi
      .mocked(requestEditorTimeline)
      .mock.calls.some(([bundle]) =>
        bundle.timeline.rotation.steps.some(
          step => step.type === "event" && step.event === "Hellfire" && step.amount === 25,
        ),
      ),
  ).toBe(true)
})

it("allows a Delay action in a one-skill rotation", async () => {
  localStorage.setItem("wwm-path-session-v1", "silkbindDeluge")
  localStorage.setItem("wwm-active-rotation-by-path-v1", JSON.stringify({ silkbindDeluge: "one-skill" }))
  localStorage.setItem(
    "wwm-rotation-list-session-v1",
    JSON.stringify([
      {
        id: "one-skill",
        martialArts: ["panaceaFan", "soulshadeUmbrella"],
        rotation: {
          name: "One skill",
          eventTimeReference: "battleStart",
          start: { step: 0 },
          steps: [{ type: "skill", skill: "Defense" }],
        },
      },
    ]),
  )
  await act(async () => root.render(<App />))
  await click("Rotation Editor")
  await act(async () => vi.advanceTimersByTimeAsync(200))
  const select = container.querySelector<HTMLSelectElement>('select[aria-label="Skill or event"]')!
  expect(select).not.toBeNull()
  await act(async () => {
    select.value = "__event:Delay"
    select.dispatchEvent(new Event("change", { bubbles: true }))
    await vi.advanceTimersByTimeAsync(200)
  })
  const bundle = vi
    .mocked(requestEditorTimeline)
    .mock.calls.map(([value]) => value)
    .reverse()
    .find(value => value?.timeline?.rotation?.name === "One skill")
  expect(bundle?.timeline.rotation.steps[0]).toMatchObject({ type: "event", event: "Delay" })
})

it("retains generated rows until the latest complete editor revision arrives", async () => {
  const { pendingEditorTimeline } = await import("../src/editorTimelinePreview")
  type Result = Awaited<ReturnType<typeof requestEditorTimeline>>
  const requests: { result: Result; resolve: (result: Result) => void }[] = []
  vi.mocked(requestEditorTimeline).mockImplementation(
    bundle =>
      new Promise(resolve => {
        const timeline = pendingEditorTimeline(bundle.timeline).map(row =>
          Object.assign({}, row, { pendingCalculation: false }),
        )
        timeline.push({
          ...timeline[0],
          id: "generated-wait",
          rotationIndex: undefined,
          startTime: 0.5,
          step: { type: "event", event: "Delay", duration: 2, automatic: "cooldown" },
        })
        requests.push({
          resolve,
          result: { rotation: bundle.timeline.rotation, timeline, fingerprint: `revision-${requests.length}` },
        })
      }),
  )
  await act(async () => root.render(<App />))
  await click("Rotation Editor")
  await click("Duplicate")
  await act(async () => {
    await vi.advanceTimersByTimeAsync(100)
  })
  await act(async () => {
    requests[0].resolve(requests[0].result)
  })
  const rows = () => [...container.querySelectorAll(".rotation-table-row")]
  const originalRows = rows()
  const select = container.querySelector<HTMLSelectElement>('select[aria-label="Skill or event"]')!
  const originalValue = select.value
  const alternate = [...select.options].find(
    option => !option.value.startsWith("__") && option.value !== originalValue,
  )!
  await act(async () => {
    select.value = alternate.value
    select.dispatchEvent(new Event("change", { bubbles: true }))
    await vi.advanceTimersByTimeAsync(100)
  })
  expect(rows()).toEqual(originalRows)
  expect(select.isConnected).toBe(true)
  expect(select.value).toBe(originalValue)
  await act(async () => {
    select.value = alternate.value
    select.dispatchEvent(new Event("change", { bubbles: true }))
    await vi.advanceTimersByTimeAsync(100)
  })
  expect(requests).toHaveLength(3)
  await act(async () => {
    requests[1].resolve(requests[1].result)
  })
  expect(select.value).toBe(originalValue)
  expect(rows()).toEqual(originalRows)
  await act(async () => {
    requests[2].resolve(requests[2].result)
  })
  expect(select.value).toBe(alternate.value)
})

it.each([0, 1, 3])("preserves the neighboring row's viewport position when deleting item %i", async deletePosition => {
  const { pendingEditorTimeline } = await import("../src/editorTimelinePreview")
  type Result = Awaited<ReturnType<typeof requestEditorTimeline>>
  const requests: { result: Result; resolve: (result: Result) => void }[] = []
  vi.mocked(requestEditorTimeline).mockImplementation(
    bundle =>
      new Promise(resolve => {
        const timeline = pendingEditorTimeline(bundle.timeline).map(row =>
          Object.assign({}, row, { pendingCalculation: false }),
        )
        requests.push({
          resolve,
          result: { rotation: bundle.timeline.rotation, timeline, fingerprint: `delete-${requests.length}` },
        })
      }),
  )
  await act(async () => root.render(<App />))
  await click("Rotation Editor")
  await click("Duplicate")
  await act(async () => {
    await vi.advanceTimersByTimeAsync(100)
  })
  await act(async () => {
    requests[0].resolve(requests[0].result)
  })
  const scroll = container.querySelector<HTMLElement>(".rotation-scroll-content")!
  const rows = [...scroll.querySelectorAll<HTMLElement>(".rotation-table-row[data-rotation-step-index]")].filter(
    row => row.querySelector<HTMLButtonElement>('button[aria-label="Delete step"]')?.disabled === false,
  )
  expect(rows.length).toBeGreaterThan(deletePosition)
  const deleted = rows[deletePosition]
  const rowIndexes = rows.map(row => Number(row.dataset.rotationStepIndex))
  const deletedIndex = rowIndexes[deletePosition]
  let layoutShift = 0
  const bounds = vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (
    this: HTMLElement,
  ) {
    const index = this.classList.contains("rotation-table-row") ? Number(this.dataset.rotationStepIndex) : undefined
    return { top: 100 + (index === undefined ? 0 : index * 40 + layoutShift) } as DOMRect
  })
  try {
    scroll.scrollTop = 300
    await act(async () => {
      deleted.querySelector<HTMLButtonElement>('button[aria-label="Delete step"]')!.click()
      await vi.advanceTimersByTimeAsync(100)
    })
    expect(scroll.scrollTop).toBe(300)
    expect(requests).toHaveLength(2)
    const deletedCount = requests[0].result.rotation.steps.length - requests[1].result.rotation.steps.length
    const deletionStart = deletedIndex - deletedCount + 1
    const anchorIndex =
      rowIndexes
        .slice(0, deletePosition)
        .reverse()
        .find(index => index < deletionStart) ??
      rowIndexes.slice(deletePosition + 1).find(index => index > deletedIndex)!
    const newAnchorIndex = anchorIndex > deletedIndex ? anchorIndex - deletedCount : anchorIndex
    layoutShift = 60
    await act(async () => {
      requests[1].resolve(requests[1].result)
    })
    expect(scroll.scrollTop).toBe(300 + 60 + (newAnchorIndex - anchorIndex) * 40)
  } finally {
    bounds.mockRestore()
  }
})
