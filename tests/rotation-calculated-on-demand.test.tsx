// @vitest-environment jsdom
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, expect, it, vi } from "vitest"

import App from "../src/App"
import { rotationBundleFingerprint } from "../src/calculations/calculationFingerprint"
import { calculateEditorTimeline } from "../src/calculations/editorTimeline"
import { calculateRotationBaseline } from "../src/calculations/rotationCalculator"
import { dpsRequests, dpsResolves, resetDpsMock } from "./helpers/dpsStoreMock"

/**
 * A path with several rotations, so this fails if the editor calculates rotations the
 * user has not asked for. Only the active one is needed on first render; the rest are
 * calculated when selected.
 */
const rotations = [
  "dummy-1-min",
  "dummy-1-min-wts",
  "dummy-1-min-wts-team",
  "dummy-infinite-vitality-1-min",
  "dummy-smolder-poet-1-min",
]

vi.mock("../src/stores/dpsStore", async () => {
  const { mockDpsStore } = await import("./helpers/dpsStoreMock")
  return mockDpsStore()
})

dpsResolves("editorTimeline", async request => {
  const bundle = request.build()
  return {
    rotation: bundle.timeline.rotation,
    timeline: calculateEditorTimeline(bundle.timeline).timeline,
    fingerprint: rotationBundleFingerprint(bundle),
  }
})

dpsResolves("baseline", async request => calculateRotationBaseline(request.build()))

/**
 * Comparisons only need to resolve for the batch to publish; their numbers are not what
 * this test measures, and calculating every variant for real would dominate the runtime.
 */
const emptyMetrics = () => ({
  totalDamage: 1,
  dps: 1,
  unscaledTotalDamage: 1,
  unscaledDps: 1,
  totalHealing: 0,
  hps: 0,
  breakdown: { skills: [], casts: [], categories: [], damageTypes: [] },
  statPriority: [],
  attunementPriority: [],
  innerWayPriority: [],
  setupComparisons: {},
})
dpsResolves("comparisons", async () => ({ metrics: emptyMetrics() as never }))

let container: HTMLDivElement
let root: Root
globalThis.IS_REACT_ACT_ENVIRONMENT = true

beforeEach(async () => {
  resetDpsMock()
  localStorage.clear()
  sessionStorage.clear()
  localStorage.setItem("wwm-path-session-v1", "stonesplitStrength")
  localStorage.setItem("wwm-active-rotation-by-path-v1", JSON.stringify({ stonesplitStrength: "dummy-1-min-wts" }))
  localStorage.setItem(
    "wwm-rotation-list-session-v1",
    JSON.stringify(
      rotations.map(id => ({
        id,
        martialArts: ["stonecleaverHalberd", "stonecleaverGlaive"],
        rotation: {
          name: id,
          eventTimeReference: "battleStart",
          start: { step: 0, action: 0 },
          steps: [{ type: "skill", skill: "MountainCleaver" }],
        },
      })),
    ),
  )
  vi.useFakeTimers()
  vi.stubGlobal("matchMedia", () => ({ matches: false, addEventListener() {}, removeEventListener() {} }))
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok: true, status: 200, json: async () => ({}), text: async () => "{}" })),
  )
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

/**
 * Rotation names a baseline was actually built for. Graduation presets are excluded:
 * they build bundles for preset builds, not for the rotations in the list.
 */
function calculatedRotations() {
  return dpsRequests("baseline")
    .filter(request => !request.cacheKey.startsWith("graduation:"))
    .map(request => (request.build().timeline.rotation.name as string).trim())
}

/** Display names in the rotation list, and which one is active. */
function listedRotations() {
  const items = [...container.querySelectorAll<HTMLElement>(".rotation-list-item")]
  return items.map(item => ({
    name: item.querySelector(".rotation-select-button")?.textContent?.trim() ?? "",
    active: item.classList.contains("active"),
  }))
}

it("does not calculate every rotation on first render", async () => {
  await act(async () => root.render(<App />))
  await settle()

  // Stored entries merge with the path's bundled presets, so the list is longer than what
  // this test stores. Only the active rotation and the one being edited are ever needed;
  // the rest are calculated when selected.
  const listed = listedRotations()
  expect(listed.length).toBeGreaterThanOrEqual(rotations.length)
  const calculated = new Set(calculatedRotations())
  expect(
    calculated.size,
    `expected at most the active and edited rotations, got ${[...calculated].join(", ")}`,
  ).toBeLessThanOrEqual(2)
  expect(calculated.size).toBeLessThan(listed.length)
})

it("calculates a rotation when it is selected", async () => {
  await act(async () => root.render(<App />))
  await settle()
  const before = calculatedRotations()

  const idleName = listedRotations().find(entry => !entry.active)?.name ?? ""
  const target = [...container.querySelectorAll<HTMLButtonElement>(".rotation-select-button")].find(
    button => button.textContent?.trim() === idleName,
  )
  expect(target).toBeDefined()
  await act(async () => target!.click())
  await settle()

  const after = calculatedRotations()
  expect(after.length).toBeGreaterThan(before.length)
  expect(after).toContain(idleName)
})
