// @vitest-environment jsdom
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, expect, it, vi } from "vitest"

import { CalculationStatus as CategoryStatus } from "@/application/results/CalculationStatus"
import { initializeI18n } from "@/i18n"
import { useRotationStore } from "@/stores/rotationStore"

import english from "../public/locales/en.json"

globalThis.IS_REACT_ACT_ENVIRONMENT = true

let container: HTMLDivElement
let root: Root

beforeEach(async () => {
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
  // A baseline reports no progress while it runs, which is the state these describe.
  useRotationStore.getState().startCategory("baseline")
  container = document.createElement("div")
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(async () => {
  useRotationStore.getState().clear()
  await act(async () => root.unmount())
  container.remove()
})

async function render(category: "baseline" | "statPriority") {
  await act(async () => root.render(<CategoryStatus category={category} />))
  const element = container.querySelector<HTMLElement>("[data-calculation-status]")
  return { text: element?.textContent ?? "", busy: element?.hasAttribute("data-busy") ?? false }
}

it("describes a calculation that reports no progress without a percentage", async () => {
  const { text, busy } = await render("baseline")
  expect(busy).toBe(true)
  expect(text).toBe("Recalculating…")
  expect(text).not.toContain("%")
})

it("describes a calculation that reports progress with the fraction it measured", async () => {
  await act(async () => {
    useRotationStore.getState().startCategory("statPriority")
    useRotationStore.getState().progressCategory("statPriority", 0.42)
  })
  const { text } = await render("statPriority")
  expect(text).toBe("Recalculating… 42%")
})

it("reports a measured zero as zero rather than as an absent measurement", async () => {
  await act(async () => {
    useRotationStore.getState().startCategory("statPriority")
    useRotationStore.getState().progressCategory("statPriority", 0)
  })
  const { text } = await render("statPriority")
  expect(text).toBe("Recalculating… 0%")
})
