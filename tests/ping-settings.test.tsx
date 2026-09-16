// @vitest-environment jsdom
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, expect, it, vi } from "vitest"

import english from "../public/locales/en.json"
import App from "../src/App"
import { requestRotationBaseline, requestEditorTimeline } from "../src/calculations/rotationWorkerClient"
import { initializeI18n } from "../src/i18n"

vi.mock("../src/calculations/rotationWorkerClient", () => ({
  requestRotationBaseline: vi.fn(() => new Promise(() => {})),
  requestRotationComparisons: vi.fn(() => new Promise(() => {})),
  requestEditorTimeline: vi.fn(() => new Promise(() => {})),
  supersedeRotationCalculationRequests: vi.fn(),
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
  expect(button, text).toBeDefined()
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
it("persists Settings ping, fixes preset ping, and resets custom overrides to inheritance", async () => {
  await act(async () => root.render(<App />))
  await click("Settings")
  const control = () => container.querySelector(".settings-panel input[type=number]") as HTMLInputElement
  expect(control().value).toBe("40")
  await fill(control(), "")
  expect(control().value).toBe("")
  expect(JSON.parse(localStorage.getItem("wwm-settings-session-v1")!).ping).toBe(40)
  await fill(control(), "1000")
  expect(control().value).toBe("1000")
  await commit(control(), "enter")
  expect(control().value).toBe("999")
  await fill(control(), "-5")
  expect(control().value).toBe("-5")
  await commit(control())
  expect(control().value).toBe("0")
  await fill(control(), "")
  expect(control().value).toBe("")
  await fill(control(), "85")
  await commit(control())
  expect(JSON.parse(localStorage.getItem("wwm-settings-session-v1")!).ping).toBe(85)
  await act(async () => {
    await vi.advanceTimersByTimeAsync(300)
  })
  const bundles = [
    ...vi.mocked(requestRotationBaseline).mock.calls,
    ...vi.mocked(requestEditorTimeline).mock.calls,
  ].map(([bundle]) => bundle)
  expect(bundles.some(bundle => bundle.timeline.rotation.ping === 40)).toBe(true)
  expect(bundles.some(bundle => bundle.timeline.rotation.ping === 85)).toBe(false)
  await act(async () => root.unmount())
  root = createRoot(container)
  await act(async () => root.render(<App />))
  await click("Settings")
  expect(control().value).toBe("85")
  await click("Rotation Editor")
  const presetPing = container.querySelector(".rotation-ping-field")!
  expect(presetPing.querySelector("input")?.disabled).toBe(true)
  expect(presetPing.querySelector("input")?.value).toBe("40")
  expect(presetPing.querySelector(".stat-reset-button")).toBeNull()
  expect(presetPing.previousElementSibling?.textContent).toContain("Group Type")
  await click("Duplicate")
  let customPing = container.querySelector(
    'input[title="Leave blank to use the ping from Settings."]',
  ) as HTMLInputElement
  expect(customPing.disabled).toBe(false)
  await fill(customPing, "1000")
  expect(customPing.value).toBe("1000")
  await commit(customPing)
  expect(customPing.value).toBe("999")
  await fill(customPing, "-5")
  await commit(customPing, "enter")
  expect(customPing.value).toBe("0")
  expect(customPing.closest("label")?.classList.contains("modified-field")).toBe(true)
  await click("Save")
  const rotations = JSON.parse(localStorage.getItem("wwm-rotation-list-session-v1")!)
  expect(rotations.some((entry: { rotation: { ping?: number } }) => entry.rotation.ping === 0)).toBe(true)
  const reset = customPing.closest("label")!.querySelector<HTMLButtonElement>(".stat-reset-button")!
  expect(reset).toBeDefined()
  await act(async () => reset.click())
  customPing = container.querySelector(".rotation-ping-field input") as HTMLInputElement
  expect(customPing.closest("label")?.classList.contains("modified-field")).toBe(false)
  expect(customPing.closest("label")?.querySelector(".stat-reset-button")).toBeNull()
  await act(async () => {
    await vi.advanceTimersByTimeAsync(300)
  })
  expect(vi.mocked(requestEditorTimeline).mock.calls.some(([bundle]) => bundle.timeline.rotation.ping === 85)).toBe(
    true,
  )
  expect(customPing.value).toBe("")
  expect(customPing.placeholder).toBe("85")
  const pendingRequests = vi.mocked(requestEditorTimeline).mock.calls.length
  await fill(customPing, "45")
  expect(customPing.closest("label")?.classList.contains("modified-field")).toBe(true)
  expect(customPing.closest("label")?.querySelector(".stat-reset-button")).not.toBeNull()
  expect(vi.mocked(requestEditorTimeline).mock.calls).toHaveLength(pendingRequests)
  expect(container.textContent).not.toContain("Calculating timeline")
  await commit(customPing, "enter")
  expect(customPing.closest("label")?.querySelector(".stat-reset-button")).not.toBeNull()
  expect(container.textContent).not.toContain("Calculating timeline")
})
