import * as v from "valibot"

import { normalizeBuildSetupOverrides, type BuildSetup, type BuildSetupOverrides } from "../../gear"
import { getPersistentItem } from "../../persistentStorage"
import { buildSetupOverridesInputSchema } from "../../schemas/buildSetup"
import { parseJson } from "../../schemas/json"
import {
  arsenalStorageKey,
  bowRingSetStorageKey,
  buildSetupOverrideStorageKey,
  gearSetStorageKey,
  legacyInnerWayStorageKey,
} from "./keys"

export function loadBuildSetupOverrides(baseline: BuildSetup): BuildSetupOverrides {
  try {
    const saved = getPersistentItem(buildSetupOverrideStorageKey)
    if (saved !== null) {
      const parsed = parseJson(buildSetupOverridesInputSchema, saved)
      return parsed.success ? normalizeBuildSetupOverrides(parsed.output) : {}
    }
    const legacy: Record<string, unknown> = {}
    const assignObject = (storageKey: string) => {
      const value = getPersistentItem(storageKey)
      if (value === null) return
      const parsed = parseJson(buildSetupOverridesInputSchema, value)
      if (parsed.success) Object.assign(legacy, parsed.output)
    }
    const innerWays = getPersistentItem(legacyInnerWayStorageKey)
    if (innerWays !== null) {
      const parsed = parseJson(v.array(v.looseObject({ innerWay: v.string(), tier: v.string() })), innerWays)
      if (parsed.success) legacy.innerWays = parsed.output
    }
    assignObject(gearSetStorageKey)
    const bowRingSet = getPersistentItem(bowRingSetStorageKey)
    if (bowRingSet !== null) legacy.bowRingSet = bowRingSet
    const arsenal = getPersistentItem(arsenalStorageKey)
    if (arsenal !== null) legacy.arsenal = arsenal
    const parsed = normalizeBuildSetupOverrides(legacy)
    return Object.fromEntries(
      Object.entries(parsed).filter(
        ([key, value]) =>
          !sameBuildSetupValue(
            key as keyof BuildSetup,
            value as BuildSetup[keyof BuildSetup],
            baseline[key as keyof BuildSetup],
          ),
      ),
    ) as BuildSetupOverrides
  } catch {
    return {}
  }
}

export function sameBuildSetupValue(
  key: keyof BuildSetup,
  left: BuildSetup[keyof BuildSetup],
  right: BuildSetup[keyof BuildSetup],
) {
  return key === "weaponSets" || key === "armorSets" || key === "innerWays"
    ? JSON.stringify(left) === JSON.stringify(right)
    : left === right
}
