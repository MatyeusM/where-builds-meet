import assert from "node:assert/strict"

import { describe, it } from "vitest"

import { probeLoad } from "./helpers/probe-loader"

const cast = skill => ({ type: "skill", skill })
const delay = duration => ({ type: "event", event: "Delay", duration })
const close = (actual, expected, message) =>
  assert.ok(Math.abs(actual - expected) < 1e-8, `${message}: ${actual} !== ${expected}`)

describe("weapon-set-four-piece", () => {
  it("checks conditional set behavior and simulation", async () => {
    const load = async path => (await probeLoad(path)).default
    const sets = await load("/data/gear-set.json")
    const general = await load("/data/skill/general.json")
    const generalBuffs = await load("/data/buff/general.json")
    const strengthBuffs = await load("/data/buff/stonesplit-strength.json")
    const { calculateRotationBaseline, calculateSimulatedRotationRun } = await probeLoad(
      "/src/calculations/rotationCalculator.ts",
    )
    const { buildRotationTimeline } = await probeLoad("/src/calculations/rotationTimeline.ts")
    const { calculateStatsWithEffects } = await probeLoad("/src/calculations/statEffects.ts")
    const { calculateDerivedStats } = await probeLoad("/src/calculations/effectiveStats.ts")
    const { emptyStats } = await probeLoad("/src/data/statDefinitions.ts")
    const weapons = ["infernalTwinblades", "mortalRopeDart"]
    const baseStats = {
      ...emptyStats,
      minPhys: 100,
      maxPhys: 200,
      minBamboocut: 100,
      maxBamboocut: 100,
      precision: 1,
      maxHp: 1000,
      criticalHealingBonus: 0.5,
    }
    const enemy = {
      name: "Set probe",
      level: 96,
      defense: 0,
      physicalResistance: 0,
      bellstrikeResistance: 0,
      stonesplitResistance: 0,
      silkbindResistance: 0,
      bamboocutResistance: 0,
      judgementResistance: 0,
    }
    const effectsFor = (name, tier) => {
      const value = sets[name].options[tier].effect
      return Array.isArray(value) ? value : [value]
    }
    const bundle = (
      name,
      tier,
      {
        tags = ["DirectDamage"],
        prep = [],
        action = { type: "damage", phyCoef: 1, attrCoef: 1 },
        steps = [cast("Probe")],
        stats: override = {},
        castTime = 1,
      } = {},
    ) => {
      const setupEffects = effectsFor(name, tier)
      const stats = calculateStatsWithEffects({ ...baseStats, ...override }, setupEffects, 0).stats
      return {
        timeline: {
          rotation: { name: "Four-piece probe", steps },
          skills: {
            ...general,
            Probe: { name: "Probe", castTime, action: [...prep, { ...action, time: castTime }], tags },
          },
          effectDefinitions: {
            ...generalBuffs,
            ...strengthBuffs,
            BoneCorrosion: { duration: 10, maxStack: 1 },
            QiImbalance: { duration: 10, maxStack: 1 },
          },
          dots: {},
          eventDefinitions: { TakeDamage: { action: [{ type: "takeDamage", time: 0 }] } },
          weapons,
          innerWayConditions: setupEffects.flatMap(effect => (effect.condition ? [effect.condition] : [])),
          innerWayRules: [],
          setupEffects,
          maxHP: stats.maxHp,
        },
        startAnchor: { rowId: "rotation-0" },
        stats,
        derivedStats: calculateDerivedStats(stats, 0),
        enemy,
        weapons,
        attunement: {},
        statPriority: [],
        attunementPriority: [],
        innerWayPriority: [],
        setupComparisons: {},
      }
    }
    const run = (name, tier, options) => calculateRotationBaseline(bundle(name, tier, options))
    const damage = result => Object.values(result.actionBreakdowns).at(-1)
    const hp = ratio => ({ type: "setTargetHP", targetHPRatio: ratio, time: 0 })
    const qi = ratio => ({ type: "setQi", targetQiRatio: ratio, time: 0 })
    const debuff = value => ({ type: "apply", target: "target", value, time: 0 })
    for (const [ratio, bonus] of [
      [0.5, 0],
      [0.5001, 0.05],
      [0.5499, 0.05],
      [0.55, 0.06],
      [0.6, 0.07],
      [0.65, 0.08],
      [0.7, 0.09],
      [0.7499, 0.09],
      [0.75, 0.1],
      [1, 0.1],
    ]) {
      const options = { prep: [hp(ratio)] }
      close(
        damage(run("SwayingHeights", 4, options)).total / damage(run("SwayingHeights", 2, options)).total,
        1 + bonus,
        `Swaying Heights at ${ratio * 100}% HP`,
      )
    }
    for (const tags of [
      ["DirectDamage", "Light"],
      ["DirectDamage", "Rodent"],
      ["DirectDamage", "Light", "Rodent"],
      ["DirectDamage", "Heavy"],
      ["DirectDamage", "MartialArt"],
    ]) {
      const matches = tags.includes("Light") || tags.includes("Rodent")
      for (const [prep, lowQi] of [
        [[qi(0.4)], false],
        [[qi(0.3999)], true],
        [[qi(0.8), debuff("BoneCorrosion")], true],
        [[qi(0.8), debuff("QiImbalance")], true],
        [[qi(0.3999), debuff("BoneCorrosion"), debuff("QiImbalance")], true],
      ]) {
        const options = { tags, prep }
        const before = damage(run("Swallowcall", 2, options))
        const after = damage(run("Swallowcall", 4, options))
        const multiplier = matches ? 1.12 * (lowQi ? 1.06 : 1) : 1
        close(after.physical / before.physical, multiplier, "Swallowcall Physical channel and eligibility")
        close(after.bamboocut / before.bamboocut, multiplier, "Swallowcall Bamboocut channel and eligibility")
      }
    }
    const crossing = {
      tags: ["DirectDamage", "Light"],
      prep: [qi(0.39), { type: "damage", phyCoef: 1, time: 0.2 }, { ...qi(0.4), time: 0.5 }],
      action: { type: "damage", phyCoef: 1 },
    }
    const before = run("Swallowcall", 2, crossing).actionBreakdowns
    const after = run("Swallowcall", 4, crossing).actionBreakdowns
    close(
      after["rotation-0:1"].total / before["rotation-0:1"].total,
      1.12 * 1.06,
      "Low-Qi bonus applies before state change",
    )
    close(after["rotation-0:3"].total / before["rotation-0:3"].total, 1.12, "Low-Qi bonus stops at exactly 40%")
    for (const shield of [false, true]) {
      const options = {
        tags: ["Heal"],
        stats: { crit: 0.5 },
        action: { type: "heal", phyCoef: 1 },
        prep: shield ? [{ type: "apply", target: "self", value: "Shield", time: 0 }] : [],
      }
      const before = run("RainWhisper", 2, options).metrics.totalHealing
      const after = run("RainWhisper", 4, options).metrics.totalHealing
      close(
        after / before,
        (1 + 0.5 * (shield ? 0.75 : 0.6)) / 1.25,
        "Rain Whisper adds critical healing with the shield condition",
      )
      close(
        run("RainWhisper", 4, { ...options, stats: { crit: 0 } }).metrics.totalHealing,
        run("RainWhisper", 2, { ...options, stats: { crit: 0 } }).metrics.totalHealing,
        "Rain Whisper does not boost noncritical healing",
      )
    }
    const deflectOptions = {
      steps: [
        cast("DeflectSuccessful"),
        cast("Probe"),
        { type: "event", event: "TakeDamage", startTime: 0.1, damage: 200 },
      ],
    }
    for (const roll of [undefined, () => 0.5]) {
      const selected = buildRotationTimeline(bundle("Cleftpeak", 4, deflectOptions).timeline, roll)
      const hit = selected.find(row => row.step.skill === "Probe").actionStates[0]
      assert.equal(hit.buffs.get("Cleftpeak").stack, 5, "Successful Deflect immediately grants five stacks")
      for (const [tier, skill] of [
        [2, "DeflectSuccessful"],
        [4, "Deflect"],
      ]) {
        const rows = buildRotationTimeline(
          bundle("Cleftpeak", tier, { steps: [cast(skill), cast("Probe")] }).timeline,
          roll,
        )
        assert.ok(
          !rows.find(row => row.step.skill === "Probe").actionStates[0].buffs.has("Cleftpeak"),
          "Ordinary Deflect and two-piece selection grant no stacks before damage",
        )
      }
      const expired = buildRotationTimeline(
        bundle("Cleftpeak", 4, {
          steps: [
            cast("DeflectSuccessful"),
            delay(5),
            cast("Probe"),
            { type: "event", event: "TakeDamage", startTime: 0.1, damage: 200 },
          ],
        }).timeline,
        roll,
      )
      assert.ok(
        !expired.find(row => row.step.skill === "Probe").actionStates[0].buffs.has("Cleftpeak"),
        "Deflect stacks expire after five seconds",
      )
    }
    for (const [tag, bonus] of [
      ["SnowpartingBlade", 0.13],
      ["ThundercryBlade", 0.13],
      ["VernalUmbrella", 0.13],
      ["HeavenwillGauntlets", 0.05],
    ]) {
      const options = { ...deflectOptions, tags: ["DirectDamage", "Light", "VariedCombo", tag] }
      close(
        damage(run("Cleftpeak", 4, options)).total / damage(run("Cleftpeak", 2, options)).total,
        1 + bonus,
        "Cleftpeak varied-combo bonus is limited to the named martial arts",
      )
    }
    const simulatedOptions = { tags: ["DirectDamage", "Light"], prep: [qi(0.39)] }
    const sampled = tier => calculateSimulatedRotationRun(bundle("Swallowcall", tier, simulatedOptions), () => 0.5)
    close(
      sampled(4).resolvedSequence.at(-1).breakdown.total / sampled(2).resolvedSequence.at(-1).breakdown.total,
      1.12 * 1.06,
      "Simulation applies the same Swallowcall multipliers",
    )
    console.log(
      "Weapon four-piece checks passed: HP/Qi boundaries, damage channels, critical healing, Deflect selection/expiry, martial-art scope, and simulation.",
    )
  })
})
