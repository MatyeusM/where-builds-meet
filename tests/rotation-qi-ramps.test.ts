import { describe, expect, it } from "vitest"

import paths from "../data/path.json"
import { buildPresetRotationBundle } from "../src/App"
import { buildRotationTimeline } from "../src/calculations/rotationTimeline"
import { probeLoad } from "./helpers/probe-loader"

describe("preset Qi event attachments", () => {
  const rotationPaths = [
    "/data/rotation/stonesplit-strength/mixed-dummy-1-min.json",
    "/data/rotation/stonesplit-strength/mixed-dummy-infinite-vitality-1-min.json",
    "/data/rotation/stonesplit-strength/mixed-dummy-smolder-poet-1-min.json",
    "/data/rotation/stonesplit-strength/mixed-dummy-1-min-double-stab.json",
    "/archive/rotation/stonesplit-strength/mixed-horse-tamer-standard-27s.json",
    "/archive/rotation/stonesplit-strength/mixed-horse-tamer-standard-27s-no-fcn.json",
    "/data/rotation/stonesplit-strength/pure-dummy-1-min.json",
    "/archive/rotation/stonesplit-strength/pure-horse-tamer-standard-27s.json",
    "/data/rotation/stonesplit-might/dummy-1-min.json",
    "/data/rotation/bamboocut-kite/dummy-1-min-infinite-vitality.json",
    "/data/rotation/bamboocut-kite/dummy-1-min-iv-bp.json",
  ]
  it.each(rotationPaths)("resolves authored Qi attachments using production inputs: %s", async rotationPath => {
    const rotation = (await probeLoad(rotationPath)).default
    const [pathId, path] = Object.entries(paths).find(([, path]) => rotationPath.includes("/" + path.buildGroup + "/"))!
    const bundle = buildPresetRotationBundle(
      {
        pathId,
        martialArts: path.lockedWeapons,
        rotation,
        breakthrough: "17",
        food: "None",
        divinecraft: "None",
        script: "None",
        skillOverrides: {},
        globalDebuffs: {
          phantomChime: false,
          qiImbalance: false,
          soulShaken: false,
          vulnerable: false,
          fearfulBlade: false,
          qingyisCharm: "none",
          floatingGrace: "none",
        },
      },
      path.defaultBuild,
    )
    expect(bundle).toBeDefined()
    const timeline = buildRotationTimeline(bundle!.timeline)
    const qiRows = timeline.filter(row => row.step.type === "event" && row.step.event === "Qi")
    expect(qiRows.length).toBeGreaterThan(0)
    for (const row of qiRows) {
      const attachment = row.step.before ?? row.step.after
      expect(attachment).toBeDefined()
      const source = timeline.find(candidate => candidate.id === row.sourceRowId)!
      expect(source).toBeDefined()
      const trigger =
        attachment.trigger === undefined
          ? undefined
          : source.actions.filter(action => action.type === "trigger")[attachment.trigger]
      const target =
        attachment.trigger === undefined
          ? source
          : timeline.find(
              candidate =>
                candidate.kind === "trigger" &&
                candidate.triggerSource === "skill" &&
                candidate.sourceRowId === source.id &&
                candidate.step.skill === trigger?.value,
            )
      expect(target).toBeDefined()
      const expectedTime =
        target!.startTime + (attachment.action === "start" ? 0 : Number(target!.actions[attachment.action].time ?? 0))
      expect(row.startTime).toBeCloseTo(expectedTime, 8)
      const setIndex = row.actions.findIndex(action => action.type === "setQi")
      expect(setIndex).toBeGreaterThanOrEqual(0)
      const nextState = row.actionStates[setIndex + 1]
      expect(nextState).toBeDefined()
      expect(nextState.targetQiRatio).toBeCloseTo(row.step.targetQiRatio, 8)
    }
    // Every attachment to an executed in-window action must resolve, irrespective of preset ramp counts.
    for (const [index, step] of rotation.steps.entries()) {
      if (step.type !== "event" || step.event !== "Qi") continue
      const attachment = step.before ?? step.after
      const nextIndex = rotation.steps.findIndex(
        (candidate, candidateIndex) => candidateIndex > index && candidate.type === "skill",
      )
      const target = timeline.find(row => row.id === `rotation-${nextIndex}`)
      if (!target || target.skipped) continue
      const action = target.actions[attachment.action]
      if (attachment.action !== "start" && (!action || action.type === "inactive")) continue
      expect(
        qiRows.some(row => row.id === `rotation-${index}`),
        "An executed attachment must not lose its Qi event",
      ).toBe(true)
    }
  })
})

describe("Qi attachment ordering", () => {
  it.each(["before", "after"])("applies %s the selected hit and expires independently", placement => {
    const timeline = buildRotationTimeline({
      rotation: {
        name: "Attachment ordering",
        steps: [
          { type: "event", event: "Qi", [placement]: { action: 0 }, targetQiRatio: 0 },
          { type: "skill", skill: "Probe" },
        ],
      },
      skills: {
        Probe: {
          name: "Probe",
          castTime: 2,
          tags: [],
          action: [0.2, 0.6, 1.3].map(time => ({ type: "damage", phyCoef: 1, time })),
        },
      },
      eventDefinitions: {
        Qi: {
          name: "Qi",
          castTime: 0,
          action: [
            { type: "setQi", time: 0 },
            {
              type: "apply",
              target: "target",
              value: "Depleted",
              time: 0,
              requirement: [{ target: "resource", value: "Qi", comparison: "==", amount: 0 }],
            },
          ],
        },
      },
      effectDefinitions: { Depleted: { duration: 1, maxStack: 1, effect: [] } },
      dots: {},
      innerWayConditions: [],
      innerWayRules: [],
      setupEffects: [],
      weapons: [],
    })
    const row = timeline.find(row => row.step.skill === "Probe")!
    const states = row.actions.map((_, index) => row.actionStates[index])
    expect(states.map(state => state.debuffs.some(effect => effect.name === "Depleted"))).toEqual([
      placement === "before",
      true,
      false,
    ])
    expect(states[0].targetQiRatio).toBe(placement === "before" ? 0 : 1)
    expect(states[1].targetQiRatio).toBe(0)
  })
})
