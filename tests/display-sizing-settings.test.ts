// @vitest-environment jsdom
import { beforeEach, expect, it } from "vitest"

import { displaySizingStorageKey } from "@/application/persistence/keys"
import { useSettingsStore } from "@/stores/settingsStore"

beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
  useSettingsStore.getState().initialise(false)
})

it("defaults to original sizing and persists all user choices across initialization", () => {
  expect(useSettingsStore.getState().displaySizing).toBe("default")
  for (const mode of ["screen", "window", "default"] as const) {
    useSettingsStore.getState().setDisplaySizing(mode)
    expect(localStorage.getItem(displaySizingStorageKey)).toBe(mode)
    useSettingsStore.setState({ displaySizing: mode === "default" ? "screen" : "default" })
    useSettingsStore.getState().initialise(false)
    expect(useSettingsStore.getState().displaySizing).toBe(mode)
  }
})

it("keeps the desktop preference when initializing in mobile layout", () => {
  useSettingsStore.getState().setDisplaySizing("screen")
  useSettingsStore.getState().initialise(true)
  expect(useSettingsStore.getState().displaySizing).toBe("screen")
})

it("falls back to original sizing for an unrecognized stored choice", () => {
  localStorage.setItem(displaySizingStorageKey, "unknown")
  useSettingsStore.getState().initialise(false)
  expect(useSettingsStore.getState().displaySizing).toBe("default")
})

it.each([
  ["fit", "window"],
  ["browser", "default"],
])("preserves the earlier saved %s choice as %s", (saved, expected) => {
  localStorage.setItem(displaySizingStorageKey, saved)
  useSettingsStore.getState().initialise(false)
  expect(useSettingsStore.getState().displaySizing).toBe(expected)
})
