import { create } from "zustand"

import type { PathId } from "@/application/contracts"
import { activeBuildByPathStorageKey, activeBuildStorageKey } from "@/application/persistence/keys"
import { loadPathSelectionIds, withPathSelection, type PathSelectionIds } from "@/application/persistence/pathSelection"
import { buildListStorageKey, loadBuildState, serializeBuildState, type BuildState } from "@/gear"
import { setPersistentItem } from "@/persistentStorage"

/**
 * The builds the user has and the gear they are made of.
 *
 * Preset and user-defined builds are one list, and the gear inventory is shared between all of
 * them — a build records which item ids it equips rather than carrying copies — so they are
 * stored as one record and held here as one value. Editing a build and editing the inventory are
 * the same act of storing the list, which is why they do not drift apart here.
 *
 * `activeBuildId` is the legacy single-selection field inside that record. It is not stored:
 * persistence is the per-path map below, which a build list cannot express because a session has
 * one active build per path rather than one overall. The two are the same fact at two levels, so
 * the mutators that move one move both.
 *
 * Read with selectors, like `rotationStore` and unlike the calculation cache in `dpsStore`. Every
 * mutator stores what it sets.
 */
export type GearStore = {
  buildState: BuildState
  activeBuildIdsByPath: PathSelectionIds

  /**
   * Reads the stored builds, inventory, and per-path selection.
   *
   * The store is a module singleton, so reading storage while it is being defined would make its
   * contents depend on when the module happened to be imported. The application boots it
   * explicitly instead, once per mount, before anything reads it.
   */
  initialise: (pathId: PathId) => void
  /**
   * Applies a change to the build list or the inventory and stores the result, which cannot drift
   * apart. Covers creating, renaming, duplicating and deleting a build, equipping gear, and
   * importing a build from a file or the official export.
   */
  updateBuildState: (update: (state: BuildState) => BuildState) => void
  /** Records the active build for one path, and for the session as a whole. */
  selectBuildForPath: (id: string, pathId: PathId) => void
  /** Writes a whole selection map, which is what switching paths resolves. */
  setBuildsByPath: (ids: PathSelectionIds) => void
}

const persist = (state: BuildState) => setPersistentItem(buildListStorageKey, serializeBuildState(state))

export const useGearStore = create<GearStore>()((set, get) => ({
  buildState: { entries: [], activeBuildId: "", gearItems: [] },
  activeBuildIdsByPath: {},

  initialise: pathId =>
    set({
      buildState: loadBuildState(),
      activeBuildIdsByPath: loadPathSelectionIds(activeBuildByPathStorageKey, activeBuildStorageKey, pathId),
    }),

  updateBuildState: update => {
    const next = update(get().buildState)
    // The stored record holds the entries and the inventory, not the active selection, so a change
    // that only moves the selection has nothing to store.
    const current = get().buildState
    if (next.entries !== current.entries || next.gearItems !== current.gearItems) persist(next)
    set({ buildState: next })
  },

  selectBuildForPath: (id, pathId) => {
    const current = get().activeBuildIdsByPath
    const next = withPathSelection(current, pathId, id)
    if (next !== current) setPersistentItem(activeBuildByPathStorageKey, JSON.stringify(next))
    set({
      activeBuildIdsByPath: next,
      buildState: get().buildState.activeBuildId === id ? get().buildState : { ...get().buildState, activeBuildId: id },
    })
  },

  setBuildsByPath: ids => {
    if (ids === get().activeBuildIdsByPath) return
    setPersistentItem(activeBuildByPathStorageKey, JSON.stringify(ids))
    set({ activeBuildIdsByPath: ids })
  },
}))
