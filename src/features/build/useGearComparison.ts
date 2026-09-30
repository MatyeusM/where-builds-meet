import { useMemo } from "react"

import type { MeasurementContext } from "@/calculations/rotationCalculationBundle"
import type { RotationRecord } from "@/calculations/rotationTimeline"
import type { BuildEntry, GearItem, GearSlot } from "@/gear"

import { useBuildThroughputs, type ThroughputTarget } from "./useBuildThroughputs"

/** The key the equipped item's own reading is held under. A candidate is keyed by its item id. */
const equippedKey = "equipped"

/**
 * What one item would do to the build that has the equipped item in this slot.
 *
 * A single-slot swap is a build whose loadout names a different item, so it is measured through
 * the same path as any other build rather than as a variant of a baseline. That matters: a swap
 * re-resolves the sheet, including the armour set tiers whose four points the swapped piece
 * competes for, so a variant that only patched the stats would be measuring a sheet the game
 * cannot produce.
 *
 * The swap is written the way `equip` writes it, because that is the state clicking Equip reaches.
 * An item is never in two slots, so moving one has to take it out of wherever it was.
 */
function buildWithSwappedItem(build: BuildEntry, slot: GearSlot, item: GearItem): BuildEntry {
  return {
    ...build,
    equipped: {
      ...Object.fromEntries(Object.entries(build.equipped ?? {}).filter(([, id]) => id !== item.id)),
      [slot]: item.id,
    },
  }
}

/**
 * The candidates in one slot that are on screen, measured against the item it has equipped.
 *
 * A reading is a whole rotation, so this is bounded by what the reader can see rather than by the
 * inventory: opening a slot asks only about the cards in view. Scrolling brings the next ones in.
 * The equipped item is never a candidate of itself; it is the reading everything else is weighed
 * against, and the card says so in words instead of showing it a difference of zero.
 */
export function useGearComparison(input: {
  build: BuildEntry | undefined
  slot: GearSlot
  candidates: readonly GearItem[]
  /** The item the slot has equipped, which is the reading every candidate is compared to. */
  equippedId: string | undefined
  /** The candidates currently on screen, reported by their own cards. */
  visibleItemIds: ReadonlySet<string>
  gearItems: GearItem[]
  context: MeasurementContext
  rotation: RotationRecord | undefined
}) {
  const { build, slot, candidates, equippedId, visibleItemIds, gearItems, context, rotation } = input

  const targets = useMemo<ThroughputTarget[]>(() => {
    if (!build) return []
    return [
      { key: equippedKey, build },
      ...candidates
        .filter(item => item.id !== equippedId && visibleItemIds.has(item.id))
        .map(item => ({ key: item.id, build: buildWithSwappedItem(build, slot, item) })),
    ]
  }, [build, slot, candidates, equippedId, visibleItemIds])

  const readings = useBuildThroughputs({ targets, gearItems, context, rotation })
  const reference = readings[equippedKey]

  return {
    /** The reference every candidate is weighed against, absent until it has been measured. */
    reference,
    readingFor: (itemId: string) => (itemId === equippedId ? reference : readings[itemId]),
  }
}
