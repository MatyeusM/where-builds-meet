import { assert, describe, expect, it } from "vitest"

// Ported from script/probe/check-attunement.mjs.
describe("attunement", () => {
  it("Attunement tag and standalone multiplier checks passed", async () => {
    const { calculateDamageBreakdown } = await import("../src/calculations/damage.ts")
    const { calculateRotationBaseline } = await import("../src/calculations/rotationCalculator.ts")
    const { calculateDerivedStats } = await import("../src/calculations/effectiveStats.ts")
    const { emptyStats } = await import("../src/data/statDefinitions.ts")
    const thundercrySkills = (await import("../data/skill/thundercry-blade.json")).default
    const closeTo = (actual, expected) => Math.abs(actual - expected) < 1e-9
    const stats = { ...emptyStats, minPhys: 100, maxPhys: 100, precision: 1 }
    const enemy = {
      name: "Attunement probe",
      level: 96,
      defense: 0,
      physicalResistance: 0,
      bellstrikeResistance: 0,
      stonesplitResistance: 0,
      silkbindResistance: 0,
      bamboocutResistance: 0,
      judgementResistance: 0,
    }
    const baseAttunement = {
      physicalPenetration: 0,
      formlessPenetration: 0,
      phalanxbaneChargedBoost: 0,
      phalanxbaneMartialBoost: 0,
      snowpartingChargedBoost: 0,
      snowpartingVariedComboBoost: 0,
      snowpartingMartialBoost: 0,
      thundercryChargedBoost: 0,
    }
    const damage = (attunement, skillTags) =>
      calculateDamageBreakdown(
        { phyCoef: 1, attrCoef: 1 },
        {
          stats,
          attunement,
          skillTags,
          weapons: [],
          buffs: [],
          enemy,
          derivedStats: calculateDerivedStats(stats, enemy.judgementResistance),
          effects: [],
        },
      ).total
    const infernalSkills = (await import("../data/skill/infernal-twinblades.json")).default
    for (const [skill, expectedMultiplier] of [
      [infernalSkills.AddledMind, 1.06],
      [infernalSkills.InfernalLight1, 1],
    ] as const) {
      const baseline = damage(baseAttunement, skill.tags)
      const boosted = damage({ ...baseAttunement, infernalMartialBoost: 0.06 }, skill.tags)
      expect(boosted / baseline).toBeCloseTo(expectedMultiplier, 9)
    }

    const baseline = damage(baseAttunement, ["PhalanxbaneBlade", "Charged"])
    const oneMatching = damage({ ...baseAttunement, phalanxbaneChargedBoost: 0.06 }, ["PhalanxbaneBlade", "Charged"])
    const missingTag = damage({ ...baseAttunement, phalanxbaneChargedBoost: 0.06 }, ["PhalanxbaneBlade"])
    const wrongWeapon = damage({ ...baseAttunement, phalanxbaneChargedBoost: 0.06 }, ["SnowpartingBlade", "Charged"])
    const twoMatching = damage({ ...baseAttunement, phalanxbaneChargedBoost: 0.06, phalanxbaneMartialBoost: 0.06 }, [
      "PhalanxbaneBlade",
      "Charged",
      "MartialArt",
    ])
    const penetrated = damage({ ...baseAttunement, physicalPenetration: 10 }, [])

    assert(
      closeTo(oneMatching / baseline, 1.06),
      "A matching armor attunement must apply as a standalone 1 + attunement DMG Bonus multiplier.",
    )
    assert(closeTo(missingTag, baseline), "An armor attunement must require every configured skill tag.")
    assert(closeTo(wrongWeapon, baseline), "An armor attunement must not apply to another weapon's skills.")
    assert(
      closeTo(twoMatching / baseline, 1.12),
      "Matching armor attunement bonuses must sum inside the standalone multiplier.",
    )
    assert(
      closeTo(penetrated / baseline, 1.05),
      "A weapon attunement without skill-match tags must apply to its penetration channel.",
    )

    const cleaveBundle = attunement => ({
      timeline: {
        rotation: { name: "Thundercry attunement probe", steps: [{ type: "skill", skill: "StonebreakerCleave" }] },
        skills: {
          StonebreakerCleave: thundercrySkills.StonebreakerCleave,
          StonebreakerQuake: thundercrySkills.StonebreakerQuake,
        },
        eventDefinitions: {},
        dots: {},
        effectDefinitions: {},
        innerWayConditions: [],
        innerWayRules: [],
        setupEffects: [],
        weapons: ["thundercry", "stormbreaker"],
      },
      startAnchor: { rowId: "rotation-0" },
      stats,
      attunement,
      enemy,
      derivedStats: calculateDerivedStats(stats, enemy.judgementResistance),
      weapons: ["thundercry", "stormbreaker"],
      statPriority: [],
      attunementPriority: [],
      innerWayPriority: [],
      setupComparisons: {},
    })
    const cleaveBaseline = calculateRotationBaseline(cleaveBundle(baseAttunement))
    const cleaveBoosted = calculateRotationBaseline(cleaveBundle({ ...baseAttunement, thundercryChargedBoost: 0.06 }))
    const damageBySkill = (result, skillId) => {
      const row = result.timeline.find(candidate => candidate.step.skill === skillId)
      if (!row) throw new Error(`Missing ${skillId} timeline row.`)
      return result.actionBreakdowns[`${row.id}:0`]?.total ?? 0
    }
    assert(
      closeTo(
        damageBySkill(cleaveBoosted, "StonebreakerCleave") / damageBySkill(cleaveBaseline, "StonebreakerCleave"),
        1.06,
      ),
      "Thundercry Charged attunement must apply to Stonebreaker Cleave.",
    )
    assert(
      closeTo(damageBySkill(cleaveBoosted, "StonebreakerQuake"), damageBySkill(cleaveBaseline, "StonebreakerQuake")),
      "Thundercry Charged attunement must exclude Stonebreaker Quake without removing its Charged tag.",
    )
  })

  // A castable skill can hand its damage to triggered component skills. Every tag-gated
  // boost must reach those components, so the boost follows the hit rather than the button.
  it("attunement boosts reach triggered damage components", async () => {
    const { calculateRotationBaseline } = await import("../src/calculations/rotationCalculator.ts")
    const { calculateDerivedStats } = await import("../src/calculations/effectiveStats.ts")
    const { emptyStats } = await import("../src/data/statDefinitions.ts")
    const rope = (await import("../data/skill/unfettered-rope-dart.json")).default
    const stats = { ...emptyStats, minPhys: 100, maxPhys: 100, precision: 1 }
    const enemy = {
      name: "Attunement probe",
      level: 96,
      defense: 0,
      physicalResistance: 0,
      bellstrikeResistance: 0,
      stonesplitResistance: 0,
      silkbindResistance: 0,
      bamboocutResistance: 0,
      judgementResistance: 0,
    }
    const bundle = attunement => ({
      timeline: {
        rotation: { name: "Unfettered attunement probe", steps: [{ type: "skill", skill: "PiercingDart4Hits" }] },
        skills: rope,
        eventDefinitions: {},
        dots: {},
        effectDefinitions: {},
        innerWayConditions: [],
        innerWayRules: [],
        setupEffects: [],
        weapons: ["unfettered"],
      },
      startAnchor: { rowId: "rotation-0" },
      stats,
      attunement,
      enemy,
      derivedStats: calculateDerivedStats(stats, enemy.judgementResistance),
      weapons: ["unfettered"],
      statPriority: [],
      attunementPriority: [],
      innerWayPriority: [],
      setupComparisons: {},
    })
    const sweepIds = new Set(
      Object.keys(rope).filter(id => (rope[id].action ?? []).some(action => action.type === "damage")),
    )
    const sweepTotal = attunement => {
      const result = calculateRotationBaseline(bundle(attunement))
      const sweeps = result.timeline.filter(row => row.kind === "trigger" && sweepIds.has(row.step.skill))
      expect(sweeps).toHaveLength(4)
      return sweeps.reduce((sum, row) => sum + (result.actionBreakdowns[`${row.id}:0`]?.total ?? 0), 0)
    }
    const base = sweepTotal({})
    const boosted = sweepTotal({ unfetteredChargedBoost: 0.06 })
    assert(base > 0, "Piercing Dart must deal damage through its triggered sweep components.")
    expect(boosted / base).toBeCloseTo(1.06, 9)
  })

  it("triggered damage components inherit their parent's skill categories", async () => {
    const { allSkillDefinitions } = await import("../src/application/gameData/skills.ts")
    const skillCategories = ["Charged", "Special", "MartialArt", "Light", "Heavy", "VariedCombo", "Pursuit"]
    const missing = []
    for (const [id, skill] of Object.entries(allSkillDefinitions)) {
      for (const action of skill.action ?? []) {
        if (action.type !== "trigger" || typeof action.value !== "string") continue
        const component = allSkillDefinitions[action.value]
        if (!component) continue
        const componentTags = component.tags ?? []
        const dealsDamage = (component.action ?? []).some(entry => entry.type === "damage" || entry.type === "heal")
        if (!dealsDamage) continue
        // inheritTags appends the parent's tags, and MartialArtEffect marks a separate
        // summoned attack that is deliberately not categorised by the skill that raised it.
        if (action.inheritTags === true || componentTags.includes("MartialArtEffect")) continue
        const absent = skillCategories.filter(
          category => (skill.tags ?? []).includes(category) && !componentTags.includes(category),
        )
        if (absent.length > 0) missing.push(`${id} -> ${action.value} (${absent.join(", ")})`)
      }
    }
    assert(
      missing.length === 0,
      `Triggered damage components must keep their parent's skill categories so tag-gated boosts reach them: ${missing.join("; ")}`,
    )
  })
})
