// @vitest-environment jsdom
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, expect, it, vi } from "vitest"

import english from "../public/locales/en.json"
import App from "../src/App"
import { calculateEditorTimeline, type EditorTimelineResult } from "../src/calculations/editorTimeline"
import type { RotationSimulationBundle } from "../src/calculations/rotationCalculator"
import { initializeI18n } from "../src/i18n"

vi.mock("../src/calculations/rotationWorkerClient", () => ({
  requestRotationBaseline: vi.fn<() => Promise<unknown>>(() => new Promise(() => {})),
  requestRotationComparisons: vi.fn<() => Promise<unknown>>(() => new Promise(() => {})),
  requestEditorTimeline: vi.fn<(bundle: RotationSimulationBundle) => Promise<EditorTimelineResult>>(async bundle => ({
    ...calculateEditorTimeline(bundle.timeline),
    fingerprint: "editor-test",
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
  expect(button).toBeDefined()
  await act(async () => button!.click())
}

it("keeps the rendered gear bookmarklet executable when saved and run on the dashboard", async () => {
  await act(async () => root.render(<App />))
  await click("Build")
  await act(async () => vi.dynamicImportSettled())
  const bookmarklet = container.querySelector<HTMLAnchorElement>(".official-bookmarklet")
  expect(bookmarklet).not.toBeNull()
  const url = bookmarklet!.getAttribute("href")!
  expect(url.startsWith("javascript:")).toBe(true)
  const roleInfo = { name: "Bookmarklet test", wearEquipsDetailed: [{ id: "test-gear" }] }
  localStorage.setItem("getAreaServer", JSON.stringify(roleInfo))
  const writeText = vi.fn<(value: string) => Promise<void>>(async () => {})
  vi.stubGlobal("navigator", { clipboard: { writeText } })
  vi.stubGlobal("alert", vi.fn())
  const runBookmarklet = new Function(decodeURIComponent(url.slice("javascript:".length)))
  await act(async () => runBookmarklet())
  expect(writeText).toHaveBeenCalledTimes(1)
  expect(JSON.parse(writeText.mock.calls[0][0]).roleInfo).toEqual(roleInfo)
})

it("opens action anchors on selection but allows their rows to remain collapsed", async () => {
  localStorage.setItem("wwm-path-session-v1", "silkbindDeluge")
  localStorage.setItem("wwm-active-rotation-by-path-v1", JSON.stringify({ silkbindDeluge: "anchor-a" }))
  localStorage.setItem(
    "wwm-rotation-list-session-v1",
    JSON.stringify(
      ["a", "b"].map(id => ({
        id: `anchor-${id}`,
        martialArts: ["panaceaFan", "soulshadeUmbrella"],
        rotation: {
          name: `Anchor ${id}`,
          eventTimeReference: "battleStart",
          start: { step: 0, action: 0 },
          steps: [{ type: "skill", skill: "SereneBreeze" }],
        },
      })),
    ),
  )
  await act(async () => root.render(<App />))
  await click("Rotation Editor")
  await act(async () => vi.advanceTimersByTimeAsync(150))
  const expandButton = () => container.querySelector<HTMLButtonElement>(".rotation-expand-button")!
  expect(expandButton().getAttribute("aria-expanded")).toBe("true")
  await act(async () => expandButton().click())
  expect(expandButton().getAttribute("aria-expanded")).toBe("false")
  await act(async () => vi.advanceTimersByTimeAsync(300))
  expect(expandButton().getAttribute("aria-expanded")).toBe("false")
  await click("Anchor b")
  expect(expandButton().getAttribute("aria-expanded")).toBe("true")
  await act(async () => expandButton().click())
  expect(expandButton().getAttribute("aria-expanded")).toBe("false")
  await click("Anchor a")
  expect(expandButton().getAttribute("aria-expanded")).toBe("true")
})
