import { describe, expect, it } from "vitest"

import { calculateGlobalStatState } from "@/application/characterComposition"
import { buildPresetInventory, calculateEquippedGearEffects, defaultBuildPresets } from "@/gear"

describe("Jade starter builds", () => {
  it.each([96, 100] as const)("reaches approximately 80% effective critical rate at gear tier %s", tier => {
    for (const id of ["jade-fully-relayed-min", "jade-fully-relayed-max"]) {
      const preset = defaultBuildPresets.find(build => build.id === id)!
      const inventory = buildPresetInventory(preset, tier)
      const gear = calculateEquippedGearEffects(inventory, ["vernalUmbrella", "inkwellFan"])
      const result = calculateGlobalStatState(
        {},
        { weapons: ["vernalUmbrella", "inkwellFan"], breakthrough: tier === 96 ? "17" : "18", ping: 40 },
        { rawStat: gear.stats },
        preset.setup!,
        { food: "SimmeringFishSlices", script: "None", divinecraft: "Fire" },
        "silkbindJade",
      )
      expect(result.derivedStats.effectiveCrit).toBeGreaterThanOrEqual(0.79)
      expect(result.derivedStats.effectiveCrit).toBeLessThanOrEqual(0.8)
      expect(gear.stats.umbrellaDmgBoost).toBeGreaterThan(0)
      expect(gear.stats.hengBladeDmgBoost ?? 0).toBe(0)
    }
  })
})
