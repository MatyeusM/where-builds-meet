import { describe, expect, it } from "vitest"

// Ported from script/probe/check-skill-cooldowns.mjs.
describe("skill-cooldowns", () => {
  it("Skill and group cooldown windows, multiple uses, editor waits, and cooldown modifiers passed", async () => {
    const { buildRotationTimeline } = await import("../src/calculations/rotationTimeline.ts")
    const { calculateEditorTimeline } = await import("../src/calculations/editorTimeline.ts")
    const { default: snowpartingSkills } = await import("../data/skill/snowparting-blade.json")
    const { default: phalanxbaneSkills } = await import("../data/skill/phalanxbane-blade.json")
    const { default: mysticSkills } = await import("../data/skill/mystic.json")
    const build = (rotation, skills, innerWayConditions = [], overrides = {}) =>
      buildRotationTimeline({
        rotation,
        skills,
        eventDefinitions: {},
        dots: {},
        effectDefinitions: {},
        innerWayConditions,
        innerWayRules: [],
        setupEffects: [],
        weapons: [],
        cooldownPolicy: "wait",
        ...overrides,
      })

    const tabRows = build(
      {
        name: "Heng Tab cooldown",
        ping: 40,
        steps: Array.from({ length: 3 }, () => ({ type: "skill", skill: "SnowpartingConversion" })),
      },
      snowpartingSkills,
    ).filter(row => row.kind === "rotation" && row.step.type === "skill")
    ;[0.04, 3.08, 6.12].forEach((time, index) => expect(tabRows[index].startTime).toBeCloseTo(time, 8))
    expect(tabRows[1].cooldownWait).toBeCloseTo(2.44, 8)

    const multiUseSkills = {
      First: { castTime: 1, cooldown: 12, cooldownUses: 2, action: [] },
      Second: { castTime: 1, cooldown: 12, cooldownUses: 2, action: [] },
    }
    const multiUseRotation = {
      name: "Per-skill multi-use cooldown probe",
      steps: [
        { type: "skill", skill: "First" },
        { type: "skill", skill: "Second" },
        { type: "skill", skill: "First" },
        { type: "skill", skill: "First" },
      ],
    }
    const multiUseTimeline = build(multiUseRotation, multiUseSkills)
    const explicitRows = multiUseTimeline.filter(row => row.kind === "rotation" && row.step.type === "skill")
    expect(
      explicitRows[0].startTime === 0,
      "The first cast must start its cooldown window without waiting.",
    ).toBeTruthy()
    expect(
      explicitRows[1].startTime === 1,
      "A different skill must maintain an independent cooldown window.",
    ).toBeTruthy()
    expect(explicitRows[2].startTime === 2, "The second allowed cast of First must remain available.").toBeTruthy()
    expect(
      explicitRows[3].startTime === 12,
      "The third cast of First must wait for its own window to end.",
    ).toBeTruthy()
    expect(
      explicitRows[3].cooldownWait === 9,
      "The timeline must expose the exact wait required by the third cast.",
    ).toBeTruthy()

    const editor = calculateEditorTimeline({
      rotation: multiUseRotation,
      skills: multiUseSkills,
      eventDefinitions: {},
      dots: {},
      effectDefinitions: {},
      innerWayConditions: [],
      innerWayRules: [],
      setupEffects: [],
      weapons: [],
    })
    expect(
      editor.rotation === multiUseRotation,
      "Cooldown waits must not rewrite authored rotation steps.",
    ).toBeTruthy()
    expect(
      editor.timeline.find(row => row.rotationIndex === 3).startTime === 12,
      "Editor uses live cooldown timing.",
    ).toBeTruthy()

    const delays = rows =>
      rows.filter(row => row.step.type === "event" && row.step.event === "Delay" && row.step.automatic === "cooldown")
    const editorWait = delays(editor.timeline)
    expect(
      editorWait.length === 1 && editorWait[0].startTime === 3 && editorWait[0].step.duration === 9,
      "The editor must show the elapsed cooldown wait as one automatic Delay row.",
    ).toBeTruthy()
    expect(
      editorWait[0].rotationIndex === undefined &&
        editorWait[0].actions.length === 0 &&
        editorWait[0].effectiveCastTime === 9,
      "Generated waits have no editable step index or combat actions and display their actual duration.",
    ).toBeTruthy()
    const { mergeCalculatedTimelineState } = await import("../src/calculations/rotationTimeline.ts")
    expect(
      delays(mergeCalculatedTimelineState(editor.timeline, multiUseTimeline)).length === 1,
      "Merging calculated results retains exactly one displayed wait.",
    ).toBeTruthy()
    const waitSkills = { Wait: { castTime: 1, cooldown: 10, action: [] } }
    const waitSteps = [
      { type: "skill", skill: "Wait" },
      { type: "skill", skill: "Wait" },
    ]
    const resetRows = build(
      { name: "Reset during wait", steps: [...waitSteps, { type: "event", event: "Controlled", startTime: 4 }] },
      waitSkills,
      [],
      { eventDefinitions: { Controlled: { castTime: 0, action: [{ type: "clearCD", value: "Wait", time: 0 }] } } },
    )
    expect(
      delays(resetRows).length === 1 &&
        delays(resetRows)[0].step.duration === 3 &&
        resetRows.find(row => row.rotationIndex === 1).startTime === 4,
      "An early cooldown reset shortens the displayed wait without delaying the accepted cast.",
    ).toBeTruthy()
    const cutoffRows = build(
      { name: "End during wait", steps: [...waitSteps, { type: "event", event: "BattleEnd", startTime: 5 }] },
      waitSkills,
      [],
      { eventDefinitions: { BattleEnd: { castTime: 0, action: [] } } },
    )
    expect(
      delays(cutoffRows).length === 1 &&
        delays(cutoffRows)[0].startTime === 1 &&
        delays(cutoffRows)[0].step.duration === 4,
      "An unfinished cooldown wait ends at Battle End.",
    ).toBeTruthy()
    const { withUnresolvedEditorSteps } = await import("../src/editorTimelinePreview.ts")
    const cutoffPreview = withUnresolvedEditorSteps(
      {
        rotation: {
          name: "End during wait",
          steps: [...waitSteps, { type: "event", event: "BattleEnd", startTime: 5 }],
        },
        skills: waitSkills,
        eventDefinitions: {},
      },
      cutoffRows,
    )
    expect(
      cutoffPreview.some(row => row.rotationIndex === 1 && row.skipped),
      "A generated wait must not hide the editor placeholder for the cast cut off by Battle End.",
    ).toBeTruthy()
    expect(
      delays(build({ name: "Skip unavailable", steps: waitSteps }, waitSkills, [], { cooldownPolicy: "skip" }))
        .length === 0,
      "Skipped casts do not produce wait rows.",
    ).toBeTruthy()

    const sharedCooldownSkills = {
      Short: { castTime: 1, cooldown: 10, cooldownGroup: "Shared", action: [] },
      Long: { castTime: 2, cooldown: 10, cooldownGroup: "Shared", action: [] },
    }
    const sharedCooldownRows = build(
      {
        name: "Shared cooldown probe",
        steps: [
          { type: "skill", skill: "Short" },
          { type: "skill", skill: "Long" },
        ],
      },
      sharedCooldownSkills,
    ).filter(row => row.kind === "rotation" && row.step.type === "skill")
    expect(
      sharedCooldownRows[1].startTime === 10,
      "Different skill variants in one group must share a cooldown window.",
    ).toBeTruthy()

    const legion = {
      Legion: {
        castTime: 0.5,
        cooldown: 20,
        action: [],
        modifier: [{ requirement: [{ target: "self", value: "SteadfastDevotionT1" }], effect: { cooldown: 1 } }],
      },
    }
    const legionRotation = {
      name: "Cooldown modifier probe",
      steps: [
        { type: "skill", skill: "Legion" },
        { type: "skill", skill: "Legion" },
      ],
    }
    const ordinaryLegion = build(legionRotation, legion).filter(row => row.step.type === "skill")
    const steadfastLegion = build(legionRotation, legion, ["SteadfastDevotionT1"]).filter(
      row => row.step.type === "skill",
    )
    expect(ordinaryLegion[1].startTime === 20, "Legion Summon must normally wait for its full cooldown.").toBeTruthy()
    expect(
      steadfastLegion[1].startTime === 1,
      "Steadfast T1 must override Legion Summon's cooldown to one second.",
    ).toBeTruthy()

    const actualSkills = { ...snowpartingSkills, ...phalanxbaneSkills }
    const actualRows = (skillIds, conditions = []) =>
      build(
        { name: "Data cooldown probe", steps: skillIds.map(skill => ({ type: "skill", skill })) },
        actualSkills,
        conditions,
      ).filter(row => row.kind === "rotation" && row.step.type === "skill")
    const stabSequence = actualRows(["SnowpartingQ", "SnowpartingQStab", "SnowpartingQ"])
    expect(
      Math.abs(stabSequence[2].startTime - (stabSequence[1].startTime + stabSequence[1].effectiveCastTime)) < 0.000001,
      "Stab must not consume a General's Bane use.",
    ).toBeTruthy()
    expect(
      actualRows(["SnowpartingQ", "SnowpartingQ", "SnowpartingQ"])[2].startTime === 12,
      "The third cast of the same General's Bane definition must wait for its two-use window.",
    ).toBeTruthy()
    expect(
      actualRows(["SnowpartingSpecial", "SnowpartingSpecial"])[1].startTime === 20,
      "The real Fleeting Trace definition must enforce its cooldown.",
    ).toBeTruthy()
    expect(
      actualRows(["PhalanxbaneQ", "PhalanxbaneQ"])[1].startTime === 15,
      "The real Total Annihilation definition must enforce its cooldown.",
    ).toBeTruthy()
    expect(
      actualRows(["PhalanxbaneSpecial", "PhalanxbaneSpecial"])[1].startTime === 20 &&
        actualRows(["PhalanxbaneSpecial", "PhalanxbaneSpecial"], ["SteadfastDevotionT1"])[1].startTime === 1.167,
      "The real Legion Summon definition must use its normal cooldown and Steadfast T1 override.",
    ).toBeTruthy()

    const mysticRows = (first, second) =>
      build(
        {
          name: "Mystic shared cooldown probe",
          steps: [
            { type: "skill", skill: first },
            { type: "skill", skill: second },
          ],
        },
        mysticSkills,
      ).filter(row => row.kind === "rotation" && row.step.type === "skill")
    ;[
      ["SoaringSpin1", "SoaringSpin2", 12],
      ["DragonsBreath1", "DragonsBreath2", 6],
      ["DragonsBreathSmolder1", "DragonsBreathSmolder2", 12],
      ["FluteOfTheTidesCancel", "FluteOfTheTides", 25],
      ["BurstingNine", "BurstingNine2Shots", 30],
    ].forEach(([first, second, readyAt]) => {
      expect(
        mysticRows(first, second)[1].startTime === readyAt,
        `${first} and ${second} must share their ${readyAt}-second cooldown window.`,
      ).toBeTruthy()
    })
  })
})
