import assert from "node:assert/strict"

import { describe, it } from "vitest"

import battleAnthem from "../data/innerway/battle-anthem.json"
import namelessSpear from "../data/martial-art/nameless-spear.json"
import { calculateDerivedStats } from "../src/calculations/effectiveStats"
import { calculateRotationBaseline } from "../src/calculations/rotationCalculator"
import { requirementsPass } from "../src/calculations/rotationTimeline"
import { effectState } from "../src/calculations/trackedEffectState"
import { emptyStats } from "../src/data/statDefinitions"

const weaponIds = ["namelessSword", "namelessSpear"] as never[]

describe("splendor-endurance", () => {
  it("starts Endurance full so the low-Endurance talent and Battle Anthem spending tier resolve", async () => {
    const stats = { ...emptyStats, minPhys: 100, maxPhys: 100, precision: 1, maxEndurance: 90 }
    const enemy = {
      name: "Splendor probe",
      level: 96,
      defense: 0,
      physicalResistance: 0,
      bellstrikeResistance: 0,
      stonesplitResistance: 0,
      silkbindResistance: 0,
      bamboocutResistance: 0,
      judgementResistance: 0,
    }
    // Mirrors innerWayEffectRulesFor: a tier entry's inner effect becomes the rule
    // effect, and selecting a tier includes every tier below it.
    const rules = tier => {
      const collected: { effect: Record<string, unknown>; source: string; tier: number }[] = []
      for (let current = 0; current <= tier; current += 1) {
        const definition = battleAnthem.effect[`BattleAnthemT${current}`] as {
          effect?: { effect?: Record<string, unknown> }[]
        }
        for (const item of definition.effect ?? [])
          if (item?.effect) collected.push({ effect: item.effect, source: "BattleAnthem", tier: current })
      }
      return collected
    }
    const run = (tier: number, spend: number, recover = 0) =>
      calculateRotationBaseline({
        timeline: {
          rotation: {
            name: "Splendor",
            steps: [
              { type: "skill", skill: "Spend" },
              ...(recover ? [{ type: "skill" as const, skill: "Recover" }] : []),
              { type: "skill", skill: "Hit" },
            ],
          },
          skills: {
            Spend: {
              castTime: 0,
              tags: ["DirectDamage", "MartialArts", "Charged", "Sword", "NamelessSword"],
              action: [{ type: "consumeResource", value: "Endurance", amount: spend, time: 0 }],
            },
            Recover: {
              castTime: 0,
              tags: ["MartialArts", "Sword", "NamelessSword"],
              action: [{ type: "addResource", value: "Endurance", amount: recover, time: 0 }],
            },
            Hit: {
              castTime: 0,
              ignorePing: true,
              tags: ["DirectDamage", "MartialArts", "Charged", "Sword", "NamelessSword"],
              action: [{ type: "damage", phyCoef: 1, attrCoef: 1, time: 0 }],
            },
          },
          effectDefinitions: {},
          initialResources: { Endurance: stats.maxEndurance },
          resourceMaximums: { Endurance: stats.maxEndurance },
          dots: {},
          eventDefinitions: {},
          innerWayRules: rules(tier),
          innerWayConditions: [`BattleAnthemT${tier}`],
          setupEffects: [],
          weapons: weaponIds,
        },
        stats,
        derivedStats: calculateDerivedStats(stats, 0),
        enemy,
        weapons: weaponIds,
        attunement: {},
        startAnchor: { rowId: "rotation-0" },
        statPriority: [],
        attunementPriority: [],
        innerWayPriority: [],
        setupComparisons: {},
      })

    // Endurance is seeded from its maximum, so T6's spending segment resolves 0
    // rather than failing to resolve at all.
    const close = (actual: number, expected: number, message: string) =>
      assert.ok(Math.abs(actual - expected) < 1e-8, `${message}: ${actual} !== ${expected}`)
    // T0 and T4 are both cumulative flat Charged bonuses, so T6 adds its segment on top.
    // The segment reads Endurance currently below its maximum, not a running total of spend.
    close(run(6, 0).metrics.totalDamage, 115, "A full meter leaves only the flat T0 and T4 bonuses")
    close(run(6, 30).metrics.totalDamage, 121, "30 below maximum reaches the 6% step")
    close(run(6, 40).metrics.totalDamage, 123, "Exactly 40 below maximum enters the 8% step")
    close(run(6, 50).metrics.totalDamage, 125, "The bonus caps at 10%")
    close(run(6, 80).metrics.totalDamage, 125, "Spending past the cap must not exceed 10%")
    close(run(6, 50, 20).metrics.totalDamage, 121, "Recovering 20 must read as 30 below maximum again, not 50")
    close(
      run(6, 50, 50).metrics.totalDamage,
      115,
      "Recovering the full spend returns to a full meter and drops the T6 segment entirely",
    )
    close(run(4, 30).metrics.totalDamage, 115, "T4 alone grants its own 15% without the T6 spending segment")

    // The below-60% branch of Affinity DMG Up is now a real, satisfiable condition.
    const affinityRule = namelessSpear.talent[13]
      .flatMap(talent => talent.effect ?? [])
      .find(rule => (rule.effect as { affinityDmgBonus?: unknown })?.affinityDmgBonus)
    assert.ok(affinityRule?.requirement, "Nameless Spear Affinity DMG Up must declare a requirement")
    const passes = (endurancePercentage: number | undefined) =>
      requirementsPass(
        affinityRule.requirement,
        effectState([]),
        effectState([]),
        [],
        new Set(),
        weaponIds,
        {},
        { endurancePercentage },
      )
    assert.equal(passes(100), false, "A full Endurance meter must not satisfy the low-Endurance branch")
    assert.equal(passes(59.9), true)
    assert.equal(passes(60), false, "Exactly 60% Endurance is not below 60%")
    assert.equal(passes(undefined), false, "An untracked Endurance must leave the branch unsatisfied")
  })
})
