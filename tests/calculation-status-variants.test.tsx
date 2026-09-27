// @vitest-environment jsdom
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, expect, it, vi } from "vitest"

import english from "../public/locales/en.json"
import { CalculationStatus as CategoryStatus } from "../src/application/results/CalculationStatus"
import {
  beginRotationCalculation,
  endRotationCalculation,
  publishRotationCategoryProgress,
} from "../src/calculations/rotationMetrics"
import { initializeI18n } from "../src/i18n"

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
  beginRotationCalculation()
  container = document.createElement("div")
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(async () => {
  endRotationCalculation()
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
  await act(async () => publishRotationCategoryProgress("statPriority", 0.42))
  const { text } = await render("statPriority")
  expect(text).toBe("Recalculating… 42%")
})

it("reports a measured zero as zero rather than as an absent measurement", async () => {
  await act(async () => publishRotationCategoryProgress("statPriority", 0))
  const { text } = await render("statPriority")
  expect(text).toBe("Recalculating… 0%")
})
