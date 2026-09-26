import { describe, expect, it } from "vitest"

import paths from "../data/path.json"
import { buildPresetRotationBundle } from "../src/application/graduation"
import { buildRotationTimeline, canAnchorAttachedEvent } from "../src/calculations/rotationTimeline"
import { loadDpsSnapshotFixtures } from "./helpers/dps-snapshot-fixtures"
import { probeLoad } from "./helpers/probe-loader"

describe("preset Qi event attachments", () => {
  const rotationPaths = [
    "/data/rotation/bamboocut-wind/wind-dummy-1-min-infinite-vitality.json",
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
    "/data/rotation/bamboocut-dust/dust-dummy-1-min.json",
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
    const battleStart = timeline.find(row => row.battleStartTime !== undefined)?.battleStartTime ?? 0
    const qiRows = timeline.filter(row => row.step.type === "event" && row.step.event === "Qi")
    expect(qiRows.length).toBeGreaterThan(0)
    for (const row of qiRows) {
      const setIndex = row.actions.findIndex(action => action.type === "setQi")
      expect(setIndex).toBeGreaterThanOrEqual(0)
      const nextState = row.actionStates[setIndex + 1]
      expect(nextState).toBeDefined()
      expect(nextState.targetQiRatio).toBeCloseTo(row.step.targetQiRatio, 8)
    }
    // An attached Qi step must land on the action it names. A fixed-time Qi step
    // carries no attachment and instead lands at its authored battle time, offset
    // by when the battle actually started.
    const attachedQiRows = qiRows.filter(row => (row.step.before ?? row.step.after) !== undefined)
    const fixedTimeQiRows = qiRows.filter(row => (row.step.before ?? row.step.after) === undefined)
    for (const row of attachedQiRows) {
      const attachment = row.step.before ?? row.step.after!
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
    }
    for (const row of fixedTimeQiRows) {
      expect(typeof row.step.startTime).toBe("number")
      expect(row.startTime).toBeCloseTo(battleStart + Number(row.step.startTime), 8)
    }
    // Every attachment to an executed in-window action must resolve, irrespective of preset ramp counts.
    for (const [index, step] of rotation.steps.entries()) {
      if (step.type !== "event" || step.event !== "Qi") continue
      const attachment = step.before ?? step.after
      // Fixed-time steps are positioned by their authored time, not by an anchor.
      if (!attachment) continue
      const nextIndex = rotation.steps.findIndex(
        (candidate, candidateIndex) => candidateIndex > index && canAnchorAttachedEvent(candidate, attachment),
      )
      const target = timeline.find(row => row.id === `rotation-${nextIndex}`)
      if (!target || target.skipped) continue
      const action = target.actions[attachment.action]
      if (attachment.action !== "start" && (!action || action.type === "inactive")) continue
      expect(
        qiRows.some(row => row.id === `rotation-${index}`),
        `Executed attachment ${index} to ${target.id}/${target.step.skill} action ${attachment.action} must retain its Qi event`,
      ).toBe(true)
    }
  })
})

describe("preset Qi ramp coverage", () => {
  // The meter only ever moves where the rotation says so, so a preset's events have
  // to read as a repeating descent: 0.5999 then 0.3999 then the 0 that applies
  // Exhausted, whose expiry is what refills the meter for the next ramp. Values off
  // this cycle silently skew every target-Qi requirement that data gates on.
  const RAMP = [0.5999, 0.3999, 0]

  it("descends each preset's meter in 0.5999 / 0.3999 / 0 ramps that land inside the fight", async () => {
    const cases = await loadDpsSnapshotFixtures()
    expect(cases.length).toBeGreaterThan(0)
    for (const { id, pathId, rotation, fixture } of cases) {
      const bundle = buildPresetRotationBundle(
        { pathId, ...fixture, rotation: { ...rotation, ping: fixture.ping }, skillOverrides: {} },
        fixture.build,
      )
      expect(bundle, `${id}: failed to build the production calculation bundle.`).toBeDefined()
      const timeline = buildRotationTimeline(bundle!.timeline)
      const battleStart = timeline.find(row => row.battleStartTime !== undefined)?.battleStartTime ?? 0
      const battleEnd = timeline.find(row => row.step.type === "event" && row.step.event === "BattleEnd")?.startTime
      expect(battleEnd, `${id}: a measured preset needs a Battle End cutoff.`).toBeDefined()
      const window = battleEnd! - battleStart
      const rows = timeline
        .filter(row => row.step.type === "event" && row.step.event === "Qi" && !row.skipped)
        .sort((left, right) => left.startTime - right.startTime)
        .map(row => ({ ratio: (row.step as { targetQiRatio: number }).targetQiRatio, at: row.startTime - battleStart }))
      expect(rows.length, `${id}: the first ramp is ${RAMP.join(" / ")} and must be complete.`).toBeGreaterThanOrEqual(
        RAMP.length,
      )
      expect(
        rows.slice(0, RAMP.length).map(row => row.ratio),
        `${id}: the first ramp is ${RAMP.join(" / ")}.`,
      ).toEqual(RAMP)
      rows.forEach((row, index) => {
        const ratio = RAMP[index % RAMP.length]
        expect(row.ratio, `${id}: Qi event ${index} must be ${ratio}.`).toBe(ratio)
        // An event at or past the cutoff can never fire, so it is dead data.
        expect(row.at, `${id}: Qi event ${index} falls outside the fight.`).toBeLessThan(window)
      })
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
    expect(states.map(state => state.debuffs.has("Depleted"))).toEqual([placement === "before", true, false])
    expect(states[0].targetQiRatio).toBe(placement === "before" ? 0 : 1)
    expect(states[1].targetQiRatio).toBe(0)
  })
})
