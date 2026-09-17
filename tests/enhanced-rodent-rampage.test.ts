import { describe, expect, it } from "vitest"

import buffs from "../data/buff/bamboocut-wind.json"
import echoes from "../data/innerway/echoes-of-oblivion.json"
import vendetta from "../data/innerway/vendetta.json"
import infernal from "../data/skill/infernal-twinblades.json"
import mortal from "../data/skill/mortal-rope-dart.json"
import { buildRotationTimeline, type RotationStep, type TimelineBuildInput } from "../src/calculations/rotationTimeline"

const cast = (skill: string): RotationStep => ({ type: "skill", skill })
const delay = (duration: number): RotationStep => ({ type: "event", event: "Delay", duration })
function input(steps: RotationStep[], tier = -1): TimelineBuildInput {
  return {
    rotation: { name: "Enhanced Rodent Rampage", ping: 0, steps },
    skills: { ...mortal, ...infernal },
    effectDefinitions: buffs,
    eventDefinitions: {},
    dots: {},
    innerWayConditions: [],
    setupEffects: [],
    weapons: ["mortalRopeDart", "infernalTwinblades"],
    innerWayRules: Array.from({ length: tier + 1 }, (_, index) => {
      const definition = vendetta.effect[`VendettaT${index}` as keyof typeof vendetta.effect]
      return ("effect" in definition ? definition.effect : []).map(effect =>
        Object.assign({}, effect, { source: "Vendetta", tier: index }),
      )
    }).flat(),
    initialResources: { Hellfire: 0 },
    resourceMaximums: { Hellfire: 80 },
  }
}
const rodentTimes = (rows: ReturnType<typeof buildRotationTimeline>) =>
  rows
    .filter(row => row.step.skill === "Rodent")
    .flatMap(row =>
      row.actions.filter(action => action.type === "damage").map(action => row.startTime + Number(action.time)),
    )
const opener = [cast("RodentsResilienceCharge"), cast("RodentRampage")]
const appliedAt = 2.041

for (const sampled of [false, true]) {
  const build = (data: TimelineBuildInput) => buildRotationTimeline(data, sampled ? () => 0.5 : undefined)
  describe(`Enhanced Rodent Rampage (sampled=${sampled})`, () => {
    it.each([
      [-1, 10],
      [0, 15],
      [3, 15],
      [4, 20],
      [6, 20],
    ])("lands once per second through expiry at tier %s", (tier, duration) => {
      const rows = build(input([...opener, delay(21)], tier))
      const times = rodentTimes(rows)
      expect(times).toHaveLength(duration)
      rows
        .filter(row => row.step.skill === "Rodent")
        .forEach((row, index) => expect(row.startTime).toBeCloseTo(appliedAt + index + 0.5))
      times.forEach((time, index) => expect(time).toBeCloseTo(appliedAt + index + 1))
    })
    it("does not trigger automatic attacks without a charge or beyond Battle End", () => {
      expect(rodentTimes(build(input([cast("RodentRampage"), delay(25)])))).toEqual([])
      const cut = build(
        input([...opener, delay(20), { type: "event", event: "BattleEnd", startTime: appliedAt + 3.2 }]),
      )
      expect(rodentTimes(cut)).toHaveLength(3)
      expect(rodentTimes(build(input(opener)))).toEqual([])
    })
    it("preserves automatic cadence through duration refresh and replaces ERR with RR when charges run out", () => {
      const refreshed = build(input([...opener, delay(2.2), cast("RodentRampage"), delay(11)]))
      const times = rodentTimes(refreshed)
      expect(times).toHaveLength(13)
      times.forEach((time, index) => expect(time).toBeCloseTo(appliedAt + index + 1))
      const replaced = build(input([...opener, cast("RodentRampage"), cast("RodentRampage"), delay(11)]))
      expect(rodentTimes(replaced)).toHaveLength(1) // Preserved cadence launches no second Rodent before replacement.
      const light = build(input([cast("RodentRampage"), ...opener, cast("InfernalLight1Rodent")])).find(
        row => row.step.skill === "InfernalLight1Rodent",
      )!
      expect(
        Array.from(light.buffs.values())
          .filter(buff => ["RodentRampage", "EnhancedRodentRampage"].includes(buff.name))
          .map(buff => buff.name),
      ).toEqual(["EnhancedRodentRampage"])
    })
    it.each([
      "InfernalLight1Rodent",
      "InfernalLight3Rodent",
      "InfernalLight4Rodent",
      "InfernalFlamelashLight4Rodent",
      "InfernalFlamelashLight5Cancel",
    ])("retains coordinated and T6 attacks for %s", skill => {
      const data = input([...opener, cast(skill), delay(0.6)])
      data.initialBuffs = [{ name: "Flamelash", stack: 1 }]
      data.innerWayConditions = ["EchoesOfOblivionT6"]
      const times = rodentTimes(build(data))
      const isCancel = skill === "InfernalFlamelashLight5Cancel"
      expect(times).toHaveLength(isCancel ? 4 : 1)
      expect(times.filter(time => Math.abs(time - appliedAt - (isCancel ? 0.842 : 0.5)) < 1e-6)).toHaveLength(
        isCancel ? 3 : 1,
      )
    })
    it.each([12, 20])("blocks all Rodent routes out of range and resumes after moving back from %s", distance => {
      const data = input([
        cast("MoveOut"),
        ...opener,
        cast("InfernalFlamelashLight5Cancel"),
        cast("InfernalLight1Rodent"),
        delay(1.2),
        cast("MoveIn"),
        cast("InfernalLight1Rodent"),
        delay(1.1),
      ])
      data.skills.MoveOut = { castTime: 0, action: [{ type: "move", distance, time: 0 }] }
      data.skills.MoveIn = { castTime: 0, action: [{ type: "move", distance: 5, time: 0 }] }
      data.initialBuffs = [
        { name: "Samsara", stack: 1 },
        { name: "Flamelash", stack: 1 },
      ]
      data.innerWayConditions = ["EchoesOfOblivionT6"]
      data.innerWayRules = [
        { source: "EchoesOfOblivion", tier: 3, effect: {}, trigger: echoes.effect.EchoesOfOblivionT3.trigger[0] },
      ]
      // Use damage-free out-of-range FA5 actions so Hellfire only measures Rodent income.
      data.skills.InfernalFlamelashLight5Cancel = {
        ...infernal.InfernalFlamelashLight5Cancel,
        action: infernal.InfernalFlamelashLight5Cancel.action.filter(action => action.type === "trigger"),
      }
      const rows = build(data)
      const returnedAt = rows.find(row => row.step.skill === "MoveIn")!.startTime
      const times = rodentTimes(rows)
      expect(times).toHaveLength(2)
      expect(times[0]).toBeCloseTo(returnedAt + 0.5)
      expect(times[1]).toBeCloseTo(appliedAt + 3)
      expect(rows[0].timelineResourceSummary!.Hellfire.final).toBe(2)
    })
    it("earns Hellfire through Samsara from automatic hits, including the last tick", () => {
      const data = input([...opener, delay(11)])
      data.skills.SamsaraStart = {
        castTime: 0,
        action: [{ type: "apply", target: "self", value: "Samsara", duration: 30, time: 0 }],
      }
      data.rotation.steps.unshift(cast("SamsaraStart"))
      data.innerWayRules = [
        { source: "EchoesOfOblivion", tier: 3, effect: {}, trigger: echoes.effect.EchoesOfOblivionT3.trigger[0] },
      ]
      const rows = build(data)
      expect(rows[0].timelineResourceSummary!.Hellfire.final).toBe(10)
      for (const [offset, expected] of [
        [0.999, 0],
        [1.001, 1],
      ]) {
        const cut = {
          ...data,
          rotation: {
            ...data.rotation,
            steps: [
              ...data.rotation.steps,
              { type: "event" as const, event: "BattleEnd" as const, startTime: appliedAt + offset },
            ],
          },
        }
        expect(build(cut)[0].timelineResourceSummary!.Hellfire.final).toBe(expected)
      }
      data.innerWayRules = []
      expect(build(data)[0].timelineResourceSummary!.Hellfire.final).toBe(0)
    })
  })
}
