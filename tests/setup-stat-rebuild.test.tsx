// @vitest-environment jsdom
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, expect, it, vi } from "vitest"

import english from "../public/locales/en.json"
import App from "../src/App"
import { calculateEditorTimeline, type EditorTimelineResult } from "../src/calculations/editorTimeline"
import { rotationBundleFingerprint } from "../src/calculations/rotationCalculationCache"
import { calculateRotationBaseline, type RotationSimulationBundle } from "../src/calculations/rotationCalculator"
import { getRotationMetrics } from "../src/calculations/rotationMetrics"
import { requestRotationBaseline } from "../src/calculations/rotationWorkerClient"
import type { ResolvedStats } from "../src/calculations/statEffects"
import { initializeI18n } from "../src/i18n"

vi.mock("../src/calculations/rotationWorkerClient", () => ({
  requestRotationBaseline: vi.fn<typeof requestRotationBaseline>(async bundle => {
    if (bundle.timeline.rotation.name !== "Setup regression") return new Promise<never>(() => {})
    return calculateRotationBaseline(bundle)
  }),
  requestRotationComparisons: vi.fn<() => Promise<never>>(() => new Promise(() => {})),
  requestEditorTimeline: vi.fn<(bundle: RotationSimulationBundle) => Promise<EditorTimelineResult>>(async bundle => ({
    ...calculateEditorTimeline(bundle.timeline),
    fingerprint: rotationBundleFingerprint(bundle),
  })),
  cancelEditorTimelineRequest: vi.fn<() => void>(),
  supersedeRotationCalculationRequests: vi.fn<() => void>(),
}))

let container: HTMLDivElement
let root: Root
globalThis.IS_REACT_ACT_ENVIRONMENT = true

beforeEach(async () => {
  localStorage.clear()
  sessionStorage.clear()
  localStorage.setItem("wwm-path-session-v1", "silkbindDeluge")
  localStorage.setItem("wwm-active-rotation-by-path-v1", JSON.stringify({ silkbindDeluge: "setup-regression" }))
  localStorage.setItem(
    "wwm-rotation-list-session-v1",
    JSON.stringify([
      {
        id: "setup-regression",
        martialArts: ["panaceaFan", "soulshadeUmbrella"],
        rotation: {
          name: "Setup regression",
          eventTimeReference: "battleStart",
          start: { step: 0, action: 0 },
          steps: [{ type: "skill", skill: "SoaringSpin1" }],
        },
      },
    ]),
  )
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

async function settle() {
  await act(async () => vi.advanceTimersByTimeAsync(150))
  await act(async () => vi.advanceTimersByTimeAsync(300))
}

async function choose(selector: string, name: string) {
  const button = [...container.querySelectorAll<HTMLButtonElement>(`${selector} button`)].find(node =>
    node.textContent?.startsWith(name),
  )
  expect(button).toBeDefined()
  await act(async () => button!.click())
  await settle()
}

function latestBundle() {
  const calls = vi
    .mocked(requestRotationBaseline)
    .mock.calls.filter(
      ([, , options]) => options?.key === "baseline:setup-regression" || options?.key === "preview:setup-regression",
    )
  expect(calls.length).toBeGreaterThan(0)
  return calls.at(-1)![0]
}

it("rebuilds food stats before publishing DPS and restores the cached original on a round trip", async () => {
  await act(async () => root.render(<App />))
  await settle()
  const fishBundle = latestBundle()
  const fishDps = getRotationMetrics()!.dps
  expect(fishDps).toBeGreaterThan(0)

  await choose(".setup-option-list-food", "None")
  const noneBundle = latestBundle()
  expect(rotationBundleFingerprint(noneBundle)).not.toBe(rotationBundleFingerprint(fishBundle))
  expect(noneBundle.stats.minPhys).toBe(fishBundle.stats.minPhys)
  expect((noneBundle.stats as ResolvedStats).effectiveMinPhys).toBeLessThan(
    (fishBundle.stats as ResolvedStats).effectiveMinPhys,
  )
  expect((noneBundle.stats as ResolvedStats).effectiveMaxPhys).toBeLessThan(
    (fishBundle.stats as ResolvedStats).effectiveMaxPhys,
  )
  expect(getRotationMetrics()!.dps).toBeLessThan(fishDps)
  expect(localStorage.getItem("wwm-food-session-v1")).toBe("None")

  const requestsBeforeReturn = vi.mocked(requestRotationBaseline).mock.calls.length
  await choose(".setup-option-list-food", "Simmering Fish Slices")
  expect(vi.mocked(requestRotationBaseline).mock.calls).toHaveLength(requestsBeforeReturn)
  expect(getRotationMetrics()!.dps).toBeCloseTo(fishDps, 8)
})

it("keeps Script and Divinecraft selections in the same calculation as the character sheet", async () => {
  await act(async () => root.render(<App />))
  await settle()
  const originalStats = latestBundle().stats
  const fireDps = getRotationMetrics()!.dps
  await choose(".divinecraft-option-list", "None")
  const noneDps = getRotationMetrics()!.dps
  expect(noneDps).toBeLessThan(fireDps)
  expect(latestBundle().stats).toEqual(originalStats)
  await choose(".script-option-list", "Insight Script")
  expect(getRotationMetrics()!.dps).toBeGreaterThan(noneDps)
  expect(latestBundle().stats).toEqual(originalStats)
  await choose(".script-option-list", "None")
  expect(getRotationMetrics()!.dps).toBeCloseTo(noneDps, 8)
  await choose(".divinecraft-option-list", "Fire")
  expect(getRotationMetrics()!.dps).toBeCloseTo(fireDps, 8)
})

it.each([
  { name: "breakthrough", selector: ".breakthrough-control select", value: "16" },
  { name: "Inner Way tier", selector: ".inner-way-row select:nth-of-type(2)", value: "T0" },
])("rebuilds character stats when $name changes", async ({ selector, value }) => {
  await act(async () => root.render(<App />))
  await settle()
  const before = latestBundle()
  const beforeDps = getRotationMetrics()!.dps
  const select = container.querySelector<HTMLSelectElement>(selector)!
  const original = select.value
  expect(original).not.toBe(value)
  await act(async () => {
    select.value = value
    select.dispatchEvent(new Event("change", { bubbles: true }))
  })
  await settle()
  expect(latestBundle().stats).not.toEqual(before.stats)
  expect(getRotationMetrics()!.dps).not.toBe(beforeDps)
  await act(async () => {
    select.value = original
    select.dispatchEvent(new Event("change", { bubbles: true }))
  })
  await settle()
  expect(getRotationMetrics()!.dps).toBeCloseTo(beforeDps, 8)
})

it("rebuilds edited stats and preserves final-value overrides across food changes", async () => {
  await act(async () => root.render(<App />))
  await settle()
  const beforeDps = getRotationMetrics()!.dps
  const beforeStats = latestBundle().stats
  const input = [...container.querySelectorAll<HTMLLabelElement>("label.field")]
    .find(label => label.textContent?.startsWith("Min Physical Attack"))!
    .querySelector<HTMLInputElement>("input")!
  const target = Math.ceil(beforeStats.minPhys + 1000)
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, String(target))
    input.dispatchEvent(new Event("input", { bubbles: true }))
  })
  await act(async () => input.dispatchEvent(new FocusEvent("focusout", { bubbles: true })))
  await settle()
  expect(latestBundle().stats.minPhys).toBe(target)
  expect(getRotationMetrics()!.dps).toBeGreaterThan(beforeDps)
  const fishDps = getRotationMetrics()!.dps
  await choose(".setup-option-list-food", "None")
  expect(latestBundle().stats.minPhys).toBe(target)
  expect(getRotationMetrics()!.dps).toBeLessThan(fishDps)
  expect(JSON.parse(localStorage.getItem("wwm-stat-overrides-v1")!).minPhys).toBe(target)
})
