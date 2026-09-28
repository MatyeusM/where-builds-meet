import defaultSetup from "@gamedata/default-setup.json"
import { create } from "zustand"

import { settingsForPath } from "@/application/characterComposition"
import type { CalculatorSettings, LayoutMode, PathId, SetupSelections } from "@/application/contracts"
import { defaultSettings } from "@/application/gameData/setup"
import {
  developmentModeStorageKey,
  divinecraftStorageKey,
  foodStorageKey,
  layoutPreviewStorageKey,
  pathStorageKey,
  scriptStorageKey,
  settingsStorageKey,
} from "@/application/persistence/keys"
import {
  loadDevMode,
  loadDivinecraft,
  loadFood,
  loadLayoutPreview,
  loadScript,
  loadSelectedPath,
  loadSettings,
} from "@/application/persistence/settings"
import { setPersistentItem } from "@/persistentStorage"

/**
 * What the user chose about the session rather than about a rotation: the path they are on, the
 * weapons and ping on it, the setup options, the development toggle, and the layout preview.
 *
 * Read with selectors, like `rotationStore` and unlike the calculation cache in `dpsStore`:
 * these are values the interface mirrors, so a component that displays one should re-render
 * when it changes.
 *
 * Every mutator stores what it sets, so state and storage cannot drift apart. Two of these
 * values are deliberately not rewritten on load — see `initialise`.
 */
export type SettingsStore = {
  /** Gates the work-in-progress paths, the test-preset builds, and the unreleased locales. */
  devMode: boolean
  /** The chosen layout while `devMode` is on. The effective layout is derived in `App`, because
   *  it also depends on the live viewport, which is not a stored value. */
  layoutPreview: LayoutMode
  pathId: PathId
  /** Weapons, breakthrough and ping. `breakthrough` is a runtime choice: it is never stored, so a
   *  newly released tier does not get frozen by a saved session. */
  settings: CalculatorSettings
  setupSelections: SetupSelections

  /**
   * Reads the stored session, and normalises the three values that were normalised on load.
   *
   * The store is a module singleton, so reading storage while it is being defined would make its
   * contents depend on when the module happened to be imported. The application boots it
   * explicitly instead, once per mount, before anything reads it.
   *
   * `compactViewport` is passed in rather than read here because the viewport is not a stored
   * value: it is a live media query that `App` already subscribes to, and reading it twice would
   * mean two subscriptions to the same query.
   */
  initialise: (compactViewport: boolean) => void
  setDevMode: (enabled: boolean) => void
  setLayoutPreview: (mode: LayoutMode) => void
  /** Stores the path on its own. Switching path is orchestrated by `App`, which has to settle the
   *  build and rotation selections with it. */
  setPath: (pathId: PathId) => void
  /** Accepts a value or an update, as the `useState` setter this replaces did. */
  setSettings: (next: CalculatorSettings | ((current: CalculatorSettings) => CalculatorSettings)) => void
  setSetupSelection: <K extends keyof SetupSelections>(key: K, value: SetupSelections[K]) => void
}

const setupStorageKey = { food: foodStorageKey, script: scriptStorageKey, divinecraft: divinecraftStorageKey } as const

const setupSelectionKeys = Object.keys(setupStorageKey) as Array<keyof SetupSelections>

/**
 * Breakthrough is left out on purpose: it is loaded as a default and chosen per session, so
 * storing it would pin a saved session to whatever the tiers were when it was saved.
 */
const persistSettings = (settings: CalculatorSettings) =>
  setPersistentItem(settingsStorageKey, JSON.stringify({ weapons: settings.weapons, ping: settings.ping }))

/** A fresh install's values, so the store is coherent before `initialise` replaces them. */
const initialSettings: CalculatorSettings = { ...defaultSettings }

/**
 * Reads the stored session, in dependency order: `devMode` first, because the path a saved
 * session resolves to depends on it, and the settings are derived from the path.
 */
const loadSession = (compactViewport: boolean) => {
  const devMode = loadDevMode()
  const pathId = loadSelectedPath(devMode)
  const settings = settingsForPath(loadSettings(), pathId)
  const setupSelections: SetupSelections = { food: loadFood(), script: loadScript(), divinecraft: loadDivinecraft() }
  // These three were written on mount by the effects this store replaces, which is what migrates
  // a legacy weapon pair and normalises a stored path. `devMode` and `layoutPreview` were only
  // ever written when changed, so they are not rewritten here.
  setPersistentItem(pathStorageKey, pathId)
  persistSettings(settings)
  for (const key of setupSelectionKeys) setPersistentItem(setupStorageKey[key], setupSelections[key])
  return { devMode, layoutPreview: loadLayoutPreview(compactViewport), pathId, settings, setupSelections }
}

export const useSettingsStore = create<SettingsStore>()((set, get) => ({
  devMode: false,
  layoutPreview: "pc",
  pathId: "stonesplitStrength",
  settings: initialSettings,
  setupSelections: { food: defaultSetup.food, script: "None", divinecraft: defaultSetup.divinecraft },

  initialise: compactViewport => set(loadSession(compactViewport)),

  setDevMode: enabled => {
    setPersistentItem(developmentModeStorageKey, String(enabled))
    set({ devMode: enabled })
  },

  setLayoutPreview: mode => {
    setPersistentItem(layoutPreviewStorageKey, mode)
    set({ layoutPreview: mode })
  },

  setPath: pathId => {
    setPersistentItem(pathStorageKey, pathId)
    set({ pathId })
  },

  setSettings: next => {
    const settings = typeof next === "function" ? next(get().settings) : next
    persistSettings(settings)
    set({ settings })
  },

  setSetupSelection: (key, value) => {
    setPersistentItem(setupStorageKey[key], value)
    set({ setupSelections: { ...get().setupSelections, [key]: value } })
  },
}))
