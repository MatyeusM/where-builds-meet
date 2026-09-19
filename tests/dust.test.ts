import { describe, expect, it } from "vitest"

import buffs from "../data/buff/bamboocut-dust.json"
import mysticBuffs from "../data/buff/mystic.json"
import debuffs from "../data/debuff/bamboocut-dust.json"
import light from "../data/innerway/light-anew.json"
import phantom from "../data/innerway/phantom-rally.json"
import song from "../data/innerway/song-of-tang.json"
import towline from "../data/innerway/towline-sweep.json"
import umbrellaArt from "../data/martial-art/everspring-umbrella.json"
import ropeArt from "../data/martial-art/unfettered-rope-dart.json"
import umbrella from "../data/skill/everspring-umbrella.json"
import general from "../data/skill/general.json"
import mystic from "../data/skill/mystic.json"
import rope from "../data/skill/unfettered-rope-dart.json"
import draft from "../doc/drafts/dust-1-min.json"
import { calculateRotationBaseline, type RotationSimulationBundle } from "../src/calculations/rotationCalculator"
import { type InnerWayEffectRule, type EditableObject } from "../src/calculations/rotationTimeline"
import { martialArtEffectsForRank } from "../src/data/martialArtTalents"
import { emptyStats } from "../src/data/statDefinitions"
import { mergeImportedRotationEntries } from "../src/rotationTransfer"

const cast = (skill: string) => ({ type: "skill" as const, skill })
const delay = (duration: number) => ({ type: "event" as const, event: "Delay", duration })
const catalogs = { SongOfTang: song, PhantomRally: phantom, TowlineSweep: towline, LightAnew: light }
function bundle(selected: Partial<Record<keyof typeof catalogs, number>> = {}): RotationSimulationBundle {
  const rules: InnerWayEffectRule[] = []
  const conditions: string[] = []
  for (const [id, tier] of Object.entries(selected)) {
    const tiers = catalogs[id as keyof typeof catalogs].effect as Record<
      string,
      { effect?: EditableObject[]; trigger?: EditableObject[] }
    >
    for (let n = 0; n <= tier; n++) {
      conditions.push(`${id}T${n}`)
      const entry = tiers[`${id}T${n}`]
      for (const effect of entry.effect ?? [])
        rules.push({ ...effect, effect: (effect.effect ?? {}) as EditableObject, source: id, tier: n })
      for (const trigger of entry.trigger ?? [])
        rules.push({ requirement: trigger.requirement, trigger, effect: {}, source: id, tier: n })
    }
  }
  return {
    timeline: {
      rotation: { name: "Dust behavior", steps: [] },
      skills: {
        ...umbrella,
        ...rope,
        Hit: {
          name: "Hit",
          castTime: 1,
          tags: ["MartialArts", "DirectDamage"],
          action: [{ type: "damage", time: 0, phyCoef: 1, attrCoef: 0 }],
        },
        Mark: {
          name: "Mark",
          castTime: 0,
          action: [
            { type: "apply", target: "target", value: "Soulbreak", time: 0 },
            { type: "apply", target: "self", value: "SoulReturn", time: 0 },
          ],
        },
        Resonate: {
          name: "Resonate",
          castTime: 1,
          tags: ["MartialArts", "MartialArtEffect", "PhantomResonance"],
          action: [{ type: "damage", phyCoef: 1.08, attrCoef: 1.08, time: 0 }],
        },
        Catch: { name: "Catch", castTime: 1, tags: ["EverspringUmbrella", "PerfectCatch"], action: [] },
        Candle: {
          name: "Candle",
          castTime: 0,
          action: [{ type: "apply", target: "target", value: "Candlelight", stack: 5, time: 0 }],
        },
      },
      effectDefinitions: { ...buffs, ...debuffs },
      maxHP: 10000,
      dots: {},
      eventDefinitions: {
        SelfHP: { name: "Self HP", castTime: 0, action: [{ type: "setHP", time: 0 }] },
        Move: { name: "Move", castTime: 0, action: [{ type: "move", time: 0 }] },
      },
      weapons: ["everspring", "unfettered"],
      innerWayConditions: conditions,
      innerWayRules: rules,
      setupEffects: [],
    },
    startAnchor: { rowId: "rotation-0" },
    stats: { ...emptyStats, minPhys: 1000, maxPhys: 1000, precision: 1, crit: 1, maxHp: 10000, critDmgBonus: 0.5 },
    enemy: {
      name: "Dust target",
      level: 96,
      defense: 0,
      physicalResistance: 0,
      bellstrikeResistance: 0,
      stonesplitResistance: 0,
      silkbindResistance: 0,
      bamboocutResistance: 0,
      judgementResistance: 0,
    },
    weapons: ["everspring", "unfettered"],
    attunement: {},
    statPriority: [],
    attunementPriority: [],
    innerWayPriority: [],
    setupComparisons: {},
  }
}
function stacks(result: ReturnType<typeof calculateRotationBaseline>, name: string) {
  return result.timeline
    .filter(row => row.step.type === "skill" && row.step.skill === "Hit")
    .map(row => row.actionStates?.[0].buffs.get(name)?.stack ?? 0)
}

describe("Dust WIP mechanics", () => {
  it.each([
    { tier: 0, count: undefined, active: false },
    { tier: 0, count: 2, active: false },
    { tier: 0, count: 3, active: true },
    { tier: 3, count: 2, active: false },
    { tier: 4, count: 1, active: false },
    { tier: 4, count: 2, active: true },
  ])("Light Anew T$tier uses enemy count $count independently of party size", ({ tier, count, active }) => {
    const input = bundle({ LightAnew: tier })
    input.timeline.rotation.enemyCount = count
    input.timeline.rotation.groupSize = 10
    input.timeline.rotation.steps = [cast("Hit"), cast("Hit")]
    const result = calculateRotationBaseline(input)
    const hits = result.timeline.filter(row => row.step.type === "skill" && row.step.skill === "Hit")
    expect(hits[0].actionStates[0].debuffs.has("Candlelight")).toBe(false)
    expect(hits[1].actionStates[0].debuffs.get("Candlelight")?.stack ?? 0).toBe(Number(active))
    const amounts = hits.map(row => result.actionBreakdowns[`${row.id}:0`].total)
    expect(amounts[1] / amounts[0]).toBeCloseTo(active ? 1.02 : 1)
  })
  it("rate-limits automatic Candlelight applications, caps stacks, and expires them", () => {
    const input = bundle({ LightAnew: 4 })
    input.timeline.rotation.enemyCount = 2
    input.timeline.skills.Hit.castTime = 0.25
    input.timeline.rotation.steps = [...Array.from({ length: 12 }, () => cast("Hit")), delay(5), cast("Hit")]
    const result = calculateRotationBaseline(input)
    const hits = result.timeline.filter(row => row.step.type === "skill" && row.step.skill === "Hit")
    expect(hits.map(row => row.actionStates[0].debuffs.get("Candlelight")?.stack ?? 0)).toEqual([
      0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 5, 0,
    ])
  })
  it.each([
    { tier: 3, count: 2, expected: [0, 1, 1, 2, 2, 3] },
    { tier: 4, count: 1, expected: [0, 1, 1, 2, 2, 3] },
    { tier: 4, count: 2, expected: [0, 2, 2, 4, 4, 5] },
    { tier: 6, count: 3, expected: [0, 2, 2, 4, 4, 5] },
  ])("Song of Tang T$tier uses enemy count $count for its additional stack", ({ tier, count, expected }) => {
    const input = bundle({ SongOfTang: tier })
    input.timeline.rotation.enemyCount = count
    input.timeline.skills.Hit.castTime = 0.25
    input.timeline.rotation.steps = Array.from({ length: 6 }, () => cast("Hit"))
    expect(stacks(calculateRotationBaseline(input), "TangMelody")).toEqual(expected)
  })
  it.each([false, true])("applies Towline stacks per hit in the four-hit opener, Soulbound=%s", soulbound => {
    const input = bundle({ TowlineSweep: 0 })
    input.timeline.initialBuffs = soulbound ? [{ name: "Soulbound", stack: 1 }] : []
    const imported = mergeImportedRotationEntries([], draft).entries[0].rotation
    const opener = imported.steps[imported.start!.step]
    input.timeline.rotation.steps = [opener, cast("Hit")]
    const result = calculateRotationBaseline(input)
    const release = result.timeline.find(
      row => row.kind === "rotation" && row.step.type === "skill" && row.step.skill !== "Hit",
    )!
    const hit = result.timeline.find(row => row.step.type === "skill" && row.step.skill === "Hit")!
    expect(release.actionStates[10].debuffs.get("SoulLoss")?.stack).toBe(soulbound ? 6 : 3)
    expect(hit.actionStates[0].debuffs.get("SoulLoss")?.stack ?? 0).toBe(soulbound ? 0 : 4)
    expect(hit.actionStates[0].debuffs.has("Soulbreak")).toBe(soulbound)
    expect(hit.actionStates[0].buffs.has("Soulbound")).toBe(false)
  })
  it("adds Soul Loss after each Soul Sweep hit and grants none for its cancel", () => {
    const input = bundle()
    input.timeline.rotation.steps = [cast("SoulSweep"), cast("Hit")]
    const result = calculateRotationBaseline(input)
    const sweep = result.timeline.find(row => row.step.type === "skill" && row.step.skill === "SoulSweep")!
    expect([1, 3, 5].map(index => sweep.actionStates[index].debuffs.get("SoulLoss")?.stack ?? 0)).toEqual([0, 1, 2])
    const hit = result.timeline.find(row => row.step.type === "skill" && row.step.skill === "Hit")!
    expect(hit.actionStates[0].debuffs.get("SoulLoss")?.stack).toBe(3)
    const canceled = bundle()
    canceled.timeline.rotation.steps = [cast("SoulSweepCancel"), cast("Hit")]
    const cancelHit = calculateRotationBaseline(canceled).timeline.find(
      row => row.step.type === "skill" && row.step.skill === "Hit",
    )!
    expect(cancelHit.actionStates[0].debuffs.has("SoulLoss")).toBe(false)
  })
  it.each([false, true])("snapshots Soulbound for all seven Piercing Dart sweep applications: %s", soulbound => {
    const input = bundle()
    input.timeline.initialBuffs = soulbound ? [{ name: "Soulbound", stack: 1 }] : []
    input.timeline.rotation.steps = [cast("PiercingDartCharge"), cast("Hit"), cast("PiercingDart"), cast("Hit")]
    const result = calculateRotationBaseline(input)
    const hits = result.timeline.filter(row => row.step.type === "skill" && row.step.skill === "Hit")
    expect(hits[0].actionStates[0].buffs.has("Soulbound")).toBe(soulbound)
    expect(hits[0].actionStates[0].debuffs.has("SoulLoss")).toBe(false)
    expect(hits[1].actionStates[0].buffs.has("Soulbound")).toBe(false)
    expect(hits[1].actionStates[0].debuffs.has("SoulLoss")).toBe(false)
    expect(hits[1].actionStates[0].debuffs.has("Soulbreak")).toBe(soulbound)
    expect(hits[1].actionStates[0].buffs.has("SoulReturn")).toBe(soulbound)
  })
  it("lets Towline Sweep apply Soul Loss even on an unbound release", () => {
    const input = bundle({ TowlineSweep: 0 })
    input.timeline.rotation.steps = [cast("PiercingDart"), cast("Hit")]
    const result = calculateRotationBaseline(input)
    const hit = result.timeline.find(row => row.step.type === "skill" && row.step.skill === "Hit")!
    expect(hit.actionStates[0].debuffs.has("Soulbreak")).toBe(true)
  })
  it("shares the ten-second cooldown between normal and canceled Soul Sweep", () => {
    const input = bundle()
    input.timeline.rotation.steps = [cast("SoulSweepCancel"), cast("SoulSweep"), cast("SoulSweepCancel")]
    const result = calculateRotationBaseline(input)
    const casts = result.timeline.filter(row => row.kind === "rotation" && row.step.type === "skill")
    expect(casts[1].startTime - casts[0].startTime).toBeCloseTo(10)
    expect(casts[2].startTime - casts[1].startTime).toBeCloseTo(10)
  })
  it("preserves Soulbound through time and charging, then consumes it on Piercing Dart cast", () => {
    const input = bundle()
    input.timeline.rotation.steps = [
      cast("SoulSweepCancel"),
      delay(30),
      cast("PiercingDartCharge"),
      cast("Hit"),
      cast("PiercingDart"),
      cast("Hit"),
    ]
    const result = calculateRotationBaseline(input)
    const hits = result.timeline.filter(row => row.step.type === "skill" && row.step.skill === "Hit")
    expect(hits[0].actionStates[0].buffs.has("Soulbound")).toBe(true)
    expect(hits[0].actionStates[0].buffs.get("Soulbound")?.expiresAt).toBeUndefined()
    expect(hits[1].actionStates[0].buffs.has("Soulbound")).toBe(false)
  })
  it.each([0, 1])("converts seven Soul Loss stacks and respects base or Towline T%i durations", tier => {
    const input = bundle({ TowlineSweep: tier })
    input.timeline.skills.Loss = {
      name: "Loss",
      castTime: 1,
      action: [{ type: "apply", target: "target", value: "SoulLoss", time: 0 }],
    }
    input.timeline.rotation.steps = [
      ...Array.from({ length: 6 }, () => cast("Loss")),
      cast("Hit"),
      cast("Loss"),
      cast("Hit"),
      delay(22),
      cast("Hit"),
    ]
    const result = calculateRotationBaseline(input)
    const hits = result.timeline.filter(row => row.step.type === "skill" && row.step.skill === "Hit")
    expect(hits[0].actionStates[0].debuffs.get("SoulLoss")?.stack).toBe(6)
    expect(hits[0].actionStates[0].debuffs.has("Soulbreak")).toBe(false)
    const active = hits[1].actionStates[0]
    expect(active.debuffs.has("SoulLoss")).toBe(false)
    const expectedDuration = [12, 21][tier]
    for (const state of [active.debuffs.get("Soulbreak")!, active.buffs.get("SoulReturn")!])
      expect(state.expiresAt! - state.appliedAt!).toBe(expectedDuration)
    expect(hits[2].actionStates[0].debuffs.has("Soulbreak")).toBe(false)
    expect(hits[2].actionStates[0].buffs.has("SoulReturn")).toBe(false)
    expect(
      result.actionBreakdowns[`${hits[1].id}:0`].total / result.actionBreakdowns[`${hits[0].id}:0`].total,
    ).toBeCloseTo(1.05)
  })
  it("expires unfinished Soul Loss stacks after five seconds", () => {
    const input = bundle()
    input.timeline.skills.Loss = {
      name: "Loss",
      castTime: 0,
      action: [{ type: "apply", target: "target", value: "SoulLoss", stack: 6, time: 0 }],
    }
    input.timeline.rotation.steps = [cast("Loss"), delay(5), cast("Hit")]
    const result = calculateRotationBaseline(input)
    const hit = result.timeline.find(row => row.step.type === "skill" && row.step.skill === "Hit")!
    expect(hit.actionStates[0].debuffs.has("SoulLoss")).toBe(false)
    expect(hit.actionStates[0].debuffs.has("Soulbreak")).toBe(false)
  })
  it("imports the draft and resolves its movement attachments and 60-second cutoff", () => {
    const imported = mergeImportedRotationEntries([], draft)
    expect(imported.importedCount).toBe(1)
    const rotation = imported.entries[0].rotation
    const input = bundle()
    input.timeline.skills = { ...input.timeline.skills, ...general, ...mystic }
    input.timeline.effectDefinitions = { ...input.timeline.effectDefinitions, ...mysticBuffs }
    input.timeline.rotation = rotation
    input.startAnchor = { rowId: `rotation-${rotation.start!.step}`, actionIndex: rotation.start!.action }
    for (const step of rotation.steps.filter(step => step.type === "skill")) {
      expect(input.timeline.skills[step.skill!]).toBeDefined()
    }
    const result = calculateRotationBaseline(input)
    expect(result.duration).toBe(60)
    expect(result.metrics.totalDamage).toBeGreaterThan(0)
    expect(result.baseline.every(entry => entry.timelineTime - result.anchorTime < 60)).toBe(true)
    const fullFlute = result.timeline.find(row => row.step.type === "skill" && row.step.skill === "FluteOfTheTides")!
    expect(fullFlute.actionStates[2].distance).toBe(1)
    expect(fullFlute.actionStates[3].distance).toBe(9)
    for (const row of result.timeline.filter(
      row => row.step.type === "skill" && row.step.skill === "SoaringSpin2" && row.actionStates[3],
    )) {
      expect(row.actionStates[3].distance).toBe(1)
    }
  })
  it("applies Soulbound at zero before the unmeasured Soul Sweep hits", () => {
    const input = bundle()
    input.timeline.rotation.steps = [cast("SoulSweep"), cast("Hit")]
    const result = calculateRotationBaseline(input)
    const sweep = result.timeline.find(row => row.step.type === "skill" && row.step.skill === "SoulSweep")!
    const hits = result.baseline.filter(entry => entry.context.skillTags.includes("SoulSweep"))
    expect(hits).toHaveLength(3)
    expect(hits.map(entry => entry.timelineTime)).toEqual([sweep.startTime, sweep.startTime, sweep.startTime])
    for (const index of [1, 2, 3])
      expect(sweep.actionStates[index].buffs.get("Soulbound")?.appliedAt).toBeCloseTo(sweep.startTime)
    const followup = result.timeline.find(row => row.step.type === "skill" && row.step.skill === "Hit")!
    expect(followup.actionStates[0].buffs.get("Soulbound")?.appliedAt).toBeCloseTo(sweep.startTime)
    const amounts = hits.map(entry => result.actionBreakdowns[entry.id!].total)
    expect(amounts[1] / amounts[0]).toBeCloseTo(0.35 / 0.3)
    expect(amounts[2]).toBeCloseTo(amounts[1])
  })
  it("applies Soulbound at the start of a canceled Soul Sweep without damage", () => {
    const input = bundle()
    input.timeline.rotation.steps = [cast("SoulSweepCancel"), cast("Hit")]
    const result = calculateRotationBaseline(input)
    const cancel = result.timeline.find(row => row.step.type === "skill" && row.step.skill === "SoulSweepCancel")!
    const followup = result.timeline.find(row => row.step.type === "skill" && row.step.skill === "Hit")!
    expect(followup.actionStates[0].buffs.get("Soulbound")?.appliedAt).toBeCloseTo(cancel.startTime)
    expect(result.baseline.filter(entry => entry.context.skillTags.includes("SoulSweep"))).toHaveLength(0)
  })
  it("uses explicit catches to grant one-use Fragrant Song and consumes Delicate on charged umbrella attacks", () => {
    const input = bundle({ PhantomRally: 1 })
    input.timeline.setupEffects = martialArtEffectsForRank({ everspring: umbrellaArt }, ["everspring"], 13)
    input.timeline.rotation.steps = [
      cast("ScarletSpin"),
      cast("ScarletSpinPerfectCatch"),
      cast("ScarletSpinPerfectCatch"),
      cast("ScarletSpinPerfectCatch"),
      cast("ScarletSpinEnd"),
      cast("DreamwroughtBubbles"),
      cast("Hit"),
    ]
    const result = calculateRotationBaseline(input)
    const throws = result.timeline.filter(row => row.kind === "rotation" && row.step.type === "skill")
    expect(throws[1].actionStates[0].buffs.has("FallingBlossoms")).toBe(false)
    expect(throws[4].actionStates[0].buffs.get("FragrantSong")?.stack).toBe(1)
    expect(throws[4].modifierEffects.some(effect => effect.SteadfastGuaranteedCrit === true)).toBe(true)
    expect(throws[5].actionStates[0].buffs.has("FragrantSong")).toBe(false)
    expect(throws[5].actionStates[0].buffs.get("FragrantSongDelicate")?.stack).toBe(1)
    expect(throws[6].actionStates[0].buffs.has("FragrantSongDelicate")).toBe(false)
    expect(throws[6].actionStates[0].buffs.has("FlowerBurial")).toBe(false)
  })
  it("selects Burn and Bury damage by target state without damaging an unmarked target", () => {
    const run = (state?: string) => {
      const input = bundle()
      if (state) input.timeline.initialDebuffs = [{ name: state, stack: 1 }]
      input.timeline.rotation.steps = [cast("BurnAndBury"), delay(1)]
      return calculateRotationBaseline(input).metrics.totalDamage
    }
    expect(run()).toBe(0)
    expect(run("SoulLoss")).toBeGreaterThan(0)
    expect(run("Soulbreak") / run("SoulLoss")).toBeCloseTo((1.3 / 0.78) * 1.05)
  })
  it("applies Tang Melody after hits, rate limits it, caps it, and expires it", () => {
    const input = bundle({ SongOfTang: 0 })
    input.timeline.skills.Hit.castTime = 0.5
    input.timeline.rotation.steps = [...Array.from({ length: 12 }, () => cast("Hit")), delay(5), cast("Hit")]
    expect(stacks(calculateRotationBaseline(input), "TangMelody")).toEqual([0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 5, 0])
    const enhanced = bundle({ SongOfTang: 3 })
    enhanced.timeline.skills.Hit.castTime = 0.5
    enhanced.timeline.rotation.steps = [...Array.from({ length: 6 }, () => cast("Hit")), delay(5), cast("Hit")]
    expect(stacks(calculateRotationBaseline(enhanced), "TangMelody")).toEqual([0, 1, 2, 3, 4, 5, 5])
  })
  it("restricts Tang Melody critical damage by HP until T6 and to martial arts", () => {
    const damage = (tier: number, hp: number, martial = true) => {
      const input = bundle({ SongOfTang: tier })
      input.timeline.rotation.steps = [
        { type: "event", event: "SelfHP", before: { action: "start" }, currentHPRatio: hp / 100 },
        cast("Hit"),
        cast("Hit"),
      ]
      if (!martial) input.timeline.skills.Hit.tags = ["Mystic"]
      const result = calculateRotationBaseline(input)
      return result.actionBreakdowns["rotation-2:0"].total / result.actionBreakdowns["rotation-1:0"].total
    }
    expect(damage(0, 100)).toBeCloseTo(1.52 / 1.5)
    expect(damage(0, 50)).toBe(1)
    expect(damage(0, 25)).toBe(1)
    expect(damage(6, 25)).toBeGreaterThan(1)
    expect(damage(6, 25, false)).toBe(1)
  })
  it("applies Phantom Chime after resonance and increases its damage at T4", () => {
    const run = (tier: number) => {
      const input = bundle({ PhantomRally: tier })
      input.timeline.rotation.steps = Array.from({ length: 7 }, () => cast("Resonate"))
      return calculateRotationBaseline(input)
    }
    const result = run(3)
    const hits = result.baseline.filter(entry => entry.context.skillTags.includes("PhantomResonance"))
    expect(hits.map(entry => entry.activeDebuffStacks?.PhantomChime ?? 0)).toEqual([0, 1, 2, 3, 4, 5, 5])
    const enhanced = run(4)
    expect(
      enhanced.actionBreakdowns[enhanced.baseline[0].id!].total / result.actionBreakdowns[hits[0].id!].total,
    ).toBeCloseTo(1.2)
    expect(run(2).baseline.every(entry => !entry.activeDebuffStacks?.PhantomChime)).toBe(true)
  })
  it("settles Soulbreak from final recorded damage on expiry and T6 refresh without replay recursion", () => {
    for (const tier of [4, 6]) {
      const input = bundle({ TowlineSweep: tier })
      input.timeline.skills.Snap = { ...input.timeline.skills.Hit, name: "Snap", tags: ["MartialArts", "BurnAndBury"] }
      input.timeline.rotation.steps = [cast("Mark"), cast("Hit"), cast("Snap"), cast("Hit"), delay(22)]
      const result = calculateRotationBaseline(input)
      const payouts = result.baseline.filter(entry => entry.replay)
      expect(payouts).toHaveLength(tier === 6 ? 2 : 1)
      for (const entry of payouts) {
        const expected =
          entry.replay!.sourceEntryIds.reduce((sum, id) => sum + result.actionBreakdowns[id].total, 0) *
          (tier === 6 ? 0.1 : 0.05)
        expect(result.actionBreakdowns[entry.id!].total).toBeCloseTo(expected)
        expect(entry.replay!.sourceEntryIds.every(id => !payouts.some(payout => payout.id === id))).toBe(true)
      }
      expect(payouts.at(-1)!.timelineTime).toBe(tier === 6 ? 22 : 21)
    }
  })
  it("requires five Candlelight stacks and distance strictly above eight for the larger T6 bonus", () => {
    const damage = (distance: number, stack: number) => {
      const input = bundle({ LightAnew: 6 })
      input.timeline.skills.Candle.action[0].stack = stack
      input.timeline.rotation.steps = [
        cast("Candle"),
        { type: "event", event: "Move", before: { action: "start" }, distance },
        cast("Hit"),
      ]
      const result = calculateRotationBaseline(input)
      return result.actionBreakdowns["rotation-2:0"].total
    }
    expect(damage(9, 5) / damage(8, 5)).toBeCloseTo(1.06 / 1.03)
    expect(damage(9, 4)).toBe(damage(8, 4))
  })
  it("converts three timely Perfect Catches into Fragrant Song and caps Delicate at four", () => {
    const run = (rank: number, gap = 0) => {
      const input = bundle({ PhantomRally: 1 })
      input.timeline.setupEffects = martialArtEffectsForRank({ everspring: umbrellaArt }, ["everspring"], rank)
      input.timeline.rotation.steps = Array.from({ length: 15 }, () => [cast("Catch"), delay(gap)]).flat()
      input.timeline.rotation.steps.push(cast("Hit"))
      return calculateRotationBaseline(input).timeline.find(
        row => row.step.type === "skill" && row.step.skill === "Hit",
      )!.actionStates![0].buffs
    }
    expect(run(13).get("FallingBlossoms")).toBeUndefined()
    expect(run(13).get("FragrantSong")?.stack).toBe(1)
    expect(run(13).get("FragrantSongDelicate")?.stack).toBe(4)
    expect(run(0).get("FragrantSong")).toBeUndefined()
    expect(run(13, 5).get("FragrantSong")).toBeUndefined()
  })
})

describe("Dust confirmed damage and cooldown rules", () => {
  it.each([
    { times: [0, 0, 0, 0, 0, 0, 0], ready: 9.5 },
    { times: [0, 0.1, 0.49, 0.5, 0.99, 1, 1.5], ready: 8 },
  ])("Charged Combo rate-limits hits at $times", ({ times, ready }) => {
    const input = bundle()
    input.timeline.rotation.ping = 0
    input.timeline.cooldownPolicy = "wait"
    input.timeline.setupEffects = martialArtEffectsForRank({ unfettered: ropeArt }, ["unfettered"], 13)
    // Synthetic damage verifies the rule without inventing the real damage mapping or timing.
    input.timeline.skills.PiercingDart = {
      ...rope.PiercingDart,
      action: times.map(time => ({ type: "damage", time, phyCoef: 1, attrCoef: 0 })),
    }
    input.timeline.rotation.steps = [cast("SoulSweepCancel"), cast("PiercingDart"), cast("SoulSweep")]
    const result = calculateRotationBaseline(input)
    const sweep = result.timeline.find(row => row.step.type === "skill" && row.step.skill === "SoulSweep")!
    expect(sweep.startTime).toBeCloseTo(ready)
  })
  it("Burn and Bury adds its bonus to vs Boss instead of multiplying it", () => {
    const input = bundle()
    input.stats.vsBossDmg = 0.2
    input.timeline.rotation.steps = [cast("Mark"), cast("BurnAndBury")]
    const boosted = calculateRotationBaseline(input)
    input.timeline.skills.BurnAndBury = { ...rope.BurnAndBury, modifier: [] }
    const base = calculateRotationBaseline(input)
    const damage = (result: ReturnType<typeof calculateRotationBaseline>) => {
      const row = result.timeline.find(row => row.step.type === "skill" && row.step.skill === "BurnAndBury")!
      return result.actionBreakdowns[`${row.id}:1`].total
    }
    expect(damage(boosted) / damage(base)).toBeCloseTo(1.5 / 1.2)
  })
})

it.each([15, 16])("Towline T6 refreshes target Soulbreak within 15m: distance %s", distance => {
  const input = bundle({ TowlineSweep: 6 })
  input.timeline.rotation.steps = [
    cast("Mark"),
    cast("Hit"),
    { type: "event", event: "Move", before: { action: "start" }, distance },
    cast("BurnAndBury"),
    cast("Hit"),
    delay(22),
  ]
  const result = calculateRotationBaseline(input)
  const payouts = result.baseline.filter(entry => entry.replay)
  expect(payouts).toHaveLength(distance === 15 ? 2 : 1)
  expect(payouts.at(-1)!.timelineTime).toBe(distance === 15 ? 22 : 21)
  const lastHit = result.timeline.findLast(row => row.step.type === "skill" && row.step.skill === "Hit")!
  expect(lastHit.actionStates[0].buffs.get("SoulReturn")?.expiresAt).toBe(22)
})
