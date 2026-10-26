// @vitest-environment jsdom
import { act } from "react"
import { createRoot } from "react-dom/client"
import { expect, it, vi } from "vitest"

import App from "@/App"
import { initializeI18n } from "@/i18n"

import english from "../public/locales/en.json"

vi.mock("@/stores/dpsStore", async () => {
  const { mockDpsStore } = await import("./helpers/dpsStoreMock")
  return mockDpsStore()
})

globalThis.IS_REACT_ACT_ENVIRONMENT = true

it("offers a shared build after fragment navigation in an open app tab", async () => {
  localStorage.clear()
  sessionStorage.clear()
  history.replaceState(null, "", location.pathname + location.search)
  vi.stubGlobal("matchMedia", () => ({ matches: false, addEventListener() {}, removeEventListener() {} }))
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => ({
      ok: true,
      json: async () => (url.endsWith("manifest.json") ? { default: "en", locales: ["en"] } : english),
    })),
  )
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute("open", "")
  }
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute("open")
  }
  await initializeI18n()
  const container = document.createElement("div")
  document.body.appendChild(container)
  const root = createRoot(container)

  try {
    await act(async () => root.render(<App />))
    const dialog = container.querySelector<HTMLDialogElement>(".shared-build-dialog")!
    expect(dialog.open).toBe(false)

    await act(async () => {
      history.pushState(null, "", "#build=example")
      window.dispatchEvent(new HashChangeEvent("hashchange"))
    })
    expect(dialog.open).toBe(true)

    await act(async () => dialog.querySelector<HTMLButtonElement>(".dialog-actions button")!.click())
    expect(dialog.open).toBe(false)
    expect(location.hash).toBe("")
  } finally {
    await act(async () => root.unmount())
    container.remove()
    vi.unstubAllGlobals()
    history.replaceState(null, "", location.pathname + location.search)
  }
})
