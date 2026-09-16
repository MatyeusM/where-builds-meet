import assert from "node:assert/strict"

import { describe, it } from "vitest"

import { probeLoad } from "./helpers/probe-loader.js"

// Ported from script/probe/check-draught-innerways.mjs.
describe("draught-innerways", () => {
  it("Draught tier progression, damage/healing channels, and attunement override checks passed", async () => {
    const { innerWayEntriesForTag, innerWayDefinitionForSoloLevel } = await probeLoad(
      "/src/data/innerWayDefinitions.ts",
    )
    const { emptyStats } = await import("../src/data/statDefinitions.ts")
    const { calculateStatsWithEffects } = await import("../src/calculations/statEffects.ts")
    const { calculateDerivedStats } = await import("../src/calculations/effectiveStats.ts")
    const { calculateDamageBreakdown } = await import("../src/calculations/damage.ts")
    const { calculateHealingBreakdown } = await import("../src/calculations/healing.ts")
    const { resolveAttunementStats } = await import("../src/calculations/attunementStats.ts")
    const base = {
      ...emptyStats,
      minPhys: 100,
      maxPhys: 200,
      minBamboocut: 100,
      maxBamboocut: 200,
      minSilkbind: 100,
      maxSilkbind: 200,
      precision: 1,
      crit: 0.1,
      critDmgBonus: 0.5,
    }
    const context = (stats, weapons, attunement = {}) => ({
      stats,
      derivedStats: calculateDerivedStats(stats, 0, {}, weapons),
      weapons,
      attunement,
      effects: [],
      buffs: [],
      skillTags: [],
      enemy: {
        name: "Draught probe",
        level: 96,
        defense: 0,
        physicalResistance: 0,
        bellstrikeResistance: 0,
        stonesplitResistance: 0,
        silkbindResistance: 0,
        bamboocutResistance: 0,
        judgementResistance: 0,
      },
    })
    const close = (actual, expected, message) =>
      assert.ok(Math.abs(actual - expected) < 1e-8, `${message}: ${actual} !== ${expected}`)
    const draught = new Map(
      innerWayEntriesForTag("BamboocutDraught").map(([id, definition]) => [
        id,
        innerWayDefinitionForSoloLevel(definition, 17),
      ]),
    )
    for (const id of ["Eonpour", "Skyspeak", "Mistwing", "Volutefit"]) {
      assert.ok(draught.has(id), `${id} must be selectable on Draught`)
      const definition = draught.get(id)
      const damage = []
      for (let tier = 0; tier <= 6; tier++) {
        const effects = Array.from(
          { length: tier + 1 },
          (_, index) => definition.effect[`${id}T${index}`].effect ?? [],
        ).flat()
        const resolved = calculateStatsWithEffects(base, effects, 0, ["skystrikeGauntlets", "rivenTwinblades"])
        damage.push(
          calculateDamageBreakdown(
            { type: "damage", phyCoef: 1, attrCoef: 1 },
            context(resolved.stats, ["skystrikeGauntlets", "rivenTwinblades"]),
          ).total,
        )
      }
      assert.ok(damage[2] > damage[1], `${id} T2 must improve damage through character stats`)
      assert.ok(damage[5] > damage[4], `${id} T5 must improve damage while retaining T2`)
      for (const tier of [1, 3, 4, 6])
        close(damage[tier], damage[tier - 1], `${id} T${tier} must preserve the previous tier's output`)
    }
    const penetration = calculateStatsWithEffects(base, draught.get("Volutefit").effect.VolutefitT5.effect, 0).stats
      .formlessPenetration
    for (const weapons of [
      ["skystrikeGauntlets", "rivenTwinblades"],
      ["panaceaFan", "soulshadeUmbrella"],
    ]) {
      for (const calculate of [calculateDamageBreakdown, calculateHealingBreakdown]) {
        const action = {
          type: calculate === calculateHealingBreakdown ? "heal" : "damage",
          phyCoef: 1,
          attrCoef: 1,
          silkbindCoef: 1,
        }
        const raw = calculate(action, context({ ...base, formlessPenetration: penetration }, weapons))
        const attuned = calculate(action, context(base, weapons, { formlessPenetration: penetration }))
        close(raw.total, attuned.total, "Raw Formless Penetration must match the existing attunement channel")
      }
    }
    const attunement = resolveAttunementStats(
      { formlessPenetration: 0 },
      { formlessPenetration: 10 },
      { formlessPenetration: 20 },
      { formlessPenetration: penetration },
    )
    close(attunement.displayed.formlessPenetration, 20, "The displayed final attunement override must remain exact")
    close(
      attunement.calculation.formlessPenetration + penetration,
      20,
      "The raw contribution must not be counted twice",
    )
  })
})
