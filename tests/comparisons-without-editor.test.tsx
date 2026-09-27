// @vitest-environment jsdom
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, expect, it, vi } from "vitest"

import english from "../public/locales/en.json"
import App from "../src/App"
import { rotationBundleFingerprint } from "../src/calculations/calculationFingerprint"
import { calculateEditorTimeline } from "../src/calculations/editorTimeline"
import { calculateRotationBaseline } from "../src/calculations/rotationCalculator"
import { emptyRotationBreakdown, type RotationMetrics } from "../src/calculations/rotationMetrics"
import { initializeI18n } from "../src/i18n"
import { useRotationStore } from "../src/stores/rotationStore"
import { dpsDispatches, dpsResolves, resetDpsMock } from "./helpers/dpsStoreMock"

/**
 * A rotation's comparisons are data about the rotation rather than a view of it, so the
 * character sheet's priority panels are filled without the rotation editor ever being mounted.
 * These fail if the editor is what produces them again, which is what the panels used to wait for.
 */

const rotationId = "comparison-probe"

vi.mock("../src/stores/dpsStore", async () => {
  const { mockDpsStore } = await import("./helpers/dpsStoreMock")
  return mockDpsStore()
})

/** One measured stat, identified by the variant the worker was handed. */
function comparisonMetrics(request: { build: () => { statPriority?: Array<{ label: string }> } }): {
  metrics: RotationMetrics
} {
  const variant = request.build().statPriority?.[0]
  return {
    metrics: {
      totalDamage: 1,
      dps: 1,
      unscaledTotalDamage: 1,
      unscaledDps: 1,
      totalHealing: 0,
      hps: 0,
      breakdown: emptyRotationBreakdown(),
      statPriority: variant
        ? [{ label: variant.label, maxRoll: 10, dpsDifference: 100, increase: 1, hpsDifference: 0, healingIncrease: 0 }]
        : [],
      attunementPriority: [],
      innerWayPriority: [],
      setupComparisons: {},
    },
  }
}

dpsResolves("baseline", async request => calculateRotationBaseline(request.build()))
dpsResolves("comparisons", async request => comparisonMetrics(request as never))
dpsResolves("editorTimeline", async request => {
  const bundle = request.build()
  return { ...calculateEditorTimeline(bundle.timeline), fingerprint: rotationBundleFingerprint(bundle) }
})
dpsResolves("throughput", async () => ({ dps: 1, hps: 0, totalDamage: 1 }) as never)

let container: HTMLDivElement
let root: Root
globalThis.IS_REACT_ACT_ENVIRONMENT = true

beforeEach(async () => {
  resetDpsMock()
  localStorage.clear()
  sessionStorage.clear()
  localStorage.setItem("wwm-path-session-v1", "stonesplitStrength")
  localStorage.setItem("wwm-active-rotation-by-path-v1", JSON.stringify({ stonesplitStrength: rotationId }))
  localStorage.setItem(
    "wwm-rotation-list-session-v1",
    JSON.stringify([
      {
        id: rotationId,
        martialArts: ["stonecleaverHalberd", "stonecleaverGlaive"],
        rotation: {
          name: "Comparison probe",
          eventTimeReference: "battleStart",
          start: { step: 0, action: 0 },
          steps: [{ type: "skill", skill: "MountainCleaver" }],
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
      status: 200,
      json: async () => (url.endsWith("manifest.json") ? { default: "en", locales: ["en"] } : english),
      text: async () => "{}",
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
})

async function settle() {
  await Array.from({ length: 25 }).reduce(
    previous => previous.then(() => act(async () => vi.advanceTimersByTimeAsync(400))),
    Promise.resolve(),
  )
}

it("resolves a rotation's comparisons without the rotation editor being mounted", async () => {
  await act(async () => root.render(<App />))
  await settle()

  expect(container.querySelector(".rotation-editor-panel")).toBeNull()
  expect(dpsDispatches("comparisons").length).toBeGreaterThan(0)
  const metrics = useRotationStore.getState().result?.metrics
  expect(metrics?.statPriority.length).toBeGreaterThan(0)
})

it("shows the character sheet's priority rows without the rotation editor", async () => {
  await act(async () => root.render(<App />))
  await settle()

  // The panel's own placeholder told the reader to open the editor, which is no longer true and
  // would be the visible symptom of comparisons resolving only inside it.
  expect(container.textContent).not.toContain("Open the Rotation Editor")
  const rows = [...container.querySelectorAll(".priority-row")].map(row => row.textContent?.trim() ?? "")
  expect(rows.length).toBeGreaterThan(0)
  expect(rows.some(row => row.includes("Comparison probe") || row.length > 0)).toBe(true)
})
