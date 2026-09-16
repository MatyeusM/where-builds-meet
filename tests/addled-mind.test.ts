import { describe, expect, it } from "vitest"

import buffs from "../data/buff/bamboocut-wind.json"
import echoes from "../data/innerway/echoes-of-oblivion.json"
import infernal from "../data/skill/infernal-twinblades.json"
import { buildRotationTimeline } from "../src/calculations/rotationTimeline.ts"

const cast = () => ({ type: "skill", skill: "AddledMind" })
const input = (active = false, count = 1) => ({
  rotation: { name: "Addled Mind", steps: Array.from({ length: count }, cast) },
  skills: infernal,
  effectDefinitions: buffs,
  dots: {},
  eventDefinitions: {},
  weapons: ["infernalTwinblades", "mortalRopeDart"],
  initialBuffs: active ? [{ name: "Flamelash", stack: 1 }] : [],
  innerWayConditions: [],
  innerWayRules: [],
  setupEffects: [],
})
const castRows = rows => rows.filter(row => row.step.skill === "AddledMind" && !row.skipped)

describe("Addled Mind", () => {
  it.each([false, true])(
    "Echoes T4 restores a charge before the next cast would need to wait, Flamelash=%s",
    active => {
      const castCount = infernal.AddledMind.cooldownUses + 1
      const timeline = input(active, castCount)
      const withoutEchoes = castRows(buildRotationTimeline(timeline))
      expect(withoutEchoes).toHaveLength(castCount)
      const previous = withoutEchoes.at(-2)
      expect(withoutEchoes.at(-1).startTime).toBeGreaterThan(previous.startTime + previous.effectiveCastTime)
      const withEchoes = castRows(
        buildRotationTimeline({
          ...timeline,
          innerWayConditions: ["EchoesOfOblivionT4"],
          innerWayRules: [
            { source: "EchoesOfOblivion", tier: 4, effect: {}, trigger: echoes.effect.EchoesOfOblivionT4.trigger[0] },
          ],
        }),
      )
      expect(withEchoes).toHaveLength(castCount)
      withEchoes.slice(1).forEach((row, index) => {
        const previous = withEchoes[index]
        expect(row.startTime).toBeCloseTo(previous.startTime + previous.effectiveCastTime, 9)
      })
    },
  )
})
