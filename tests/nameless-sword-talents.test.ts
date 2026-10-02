import { describe, it } from "vitest"

import { martialArtDefinitions } from "@/application/gameData/martialArts"
import { emptyAttunementStats } from "@/calculations/attunementStats"
import type { DamageContext } from "@/calculations/damage"
import type { CharacterStats } from "@/types"

import { effectState } from "../src/calculations/trackedEffectState"
import { assertClose } from "./helpers/floatEquality"
import { probeLoad } from "./helpers/probe-loader.js"

// Ported from script/probe/check-nameless-sword-talents.mjs.
describe("nameless-sword-talents", () => {
  // Every float check below asserts through the shared assertClose helper, which the
  // rule cannot see from outside this callback.
  // oxlint-disable-next-line vitest/expect-expect
  it("Nameless Sword talent calculation checks passed", async () => {
    const namelessSword = (await import("../data/martial-art/nameless-sword.json")).default
    const { calculateStatsWithEffects, resolveRawStatFormulas } = await probeLoad<
      typeof import("../src/calculations/statEffects")
    >("/src/calculations/statEffects.ts")
    const { calculateDerivedStats } = await import("../src/calculations/effectiveStats.ts")
    const { calculateDamageBreakdown } = await import("../src/calculations/damage.ts")
    const { requirementsPass } = await import("../src/calculations/rotationTimeline.ts")
    const { emptyStats } = await import("../src/data/statDefinitions.ts")

    const statResult = calculateStatsWithEffects(
      { ...emptyStats, momentum: 280, maxBellstrike: 459 },
      martialArtDefinitions.namelessSword.talent[13].flatMap(talent => talent.effect ?? []),
      0,
    )
    assertClose(
      statResult.stats.maxPhys,
      73.92,
      1e-9,
      "Momentum scaling must grant the capped Max Physical Attack bonus.",
    )
    assertClose(statResult.stats.minBellstrike, 98, 1e-9, "Bellstrike Attribute Up must grant Min Bellstrike Attack.")
    assertClose(statResult.stats.maxBellstrike, 655, 1e-9, "Bellstrike Attribute Up must grant Max Bellstrike Attack.")
    assertClose(
      statResult.stats.bellstrikePenetration,
      22,
      1e-9,
      "Bellstrike penetration must reach its cap at 655 Max Bellstrike Attack.",
    )

    const rank = namelessSword.talent[13].flatMap(talent =>
      (talent.effect ?? []).flatMap(entry =>
        "effect" in entry
          ? [{ effect: entry.effect, requirement: "requirement" in entry ? entry.requirement : undefined }]
          : [],
      ),
    )
    // Rank 13's conditional damage sheets. The app declares a talent effect as a
    // stat sheet, so these have no declared shape and are read as the untyped
    // objects the damage pipeline already reads them as.
    const hpRule = rank.find(rule => "hpDMGBonus" in rule.effect)
    const affinityRule = rank.find(rule => "affinityDmgBonus" in rule.effect)
    if (!hpRule || !affinityRule) throw new Error("Nameless Sword conditional damage talent rules were not found.")

    if (
      !requirementsPass(
        affinityRule.requirement,
        effectState([]),
        effectState([]),
        ["SwordEnergy"],
        new Set(),
        ["namelessSword", "namelessSpear"],
        {},
        { targetQiPercentage: 39.99 },
      ) ||
      !requirementsPass(
        affinityRule.requirement,
        effectState([]),
        effectState([{ name: "QiImbalance" }]),
        ["SwordEnergy"],
        new Set(),
        ["namelessSword", "namelessSpear"],
        {},
        { targetQiPercentage: 100 },
      ) ||
      requirementsPass(
        affinityRule.requirement,
        effectState([]),
        effectState([]),
        ["SwordEnergy"],
        new Set(),
        ["namelessSword", "namelessSpear"],
        {},
        { targetQiPercentage: 40 },
      )
    )
      throw new Error("Sword Qi Affinity Enhancement must require sub-40% Qi or Qi Imbalance at hit time.")

    const damageStats: CharacterStats = { ...emptyStats, minPhys: 1500, maxPhys: 1500, precision: 1, affinity: 1 }
    const enemy = {
      name: "Probe",
      level: 96,
      defense: 0,
      physicalResistance: 0,
      bellstrikeResistance: 0,
      stonesplitResistance: 0,
      silkbindResistance: 0,
      bamboocutResistance: 0,
      judgementResistance: 0,
    }
    const context: DamageContext = {
      stats: damageStats,
      attunement: emptyAttunementStats,
      skillTags: ["SwordEnergy"],
      weapons: ["namelessSword", "namelessSpear"],
      buffs: [],
      enemy,
      derivedStats: calculateDerivedStats(damageStats, 0),
      effects: [],
    }
    const baseline = calculateDamageBreakdown({ phyCoef: 1, attrCoef: 1 }, { ...context, effects: [] })
    const hpEnhanced = calculateDamageBreakdown(
      { phyCoef: 1, attrCoef: 1 },
      { ...context, effects: [resolveRawStatFormulas(hpRule.effect, damageStats)] },
    )
    const affinityEnhanced = calculateDamageBreakdown(
      { phyCoef: 1, attrCoef: 1 },
      { ...context, effects: [affinityRule.effect] },
    )
    assertClose(hpEnhanced.physical / baseline.physical, 1.2, 1e-9, "Sword Energy HP damage must cap at 20%.")
    assertClose(
      affinityEnhanced.physical / baseline.physical,
      1 + (baseline.outcomeRates?.affinity ?? 0) * 0.18,
      1e-9,
      "Sword Energy Affinity damage must cap at 18% at 1500 Max Physical Attack.",
    )
  })
})
