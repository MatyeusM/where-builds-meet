import { describe, expect, it } from "vitest";

// Ported from script/probe/check-rotation-options.mjs.
describe("rotation-options", () => {
  it("Legacy Auto HP, Dummy Attack, and Infinite Vitality behavior remains valid", async () => {
    const { buildRotationTimeline } = await import("../src/calculations/rotationTimeline.ts");
    const commonInput = {
      dots: {},
      effectDefinitions: {},
      innerWayConditions: [],
      innerWayRules: [],
      setupEffects: [],
      weapons: [],
      eventDefinitions: {
        HP: {
          name: "Event: HP",
          castTime: 0,
          action: [{ type: "setTargetHP", time: 0 }],
          tags: ["Event"],
        },
        TakeDamage: {
          name: "Event: Take Damage",
          castTime: 0,
          action: [{ type: "takeDamage", time: 0 }],
          tags: ["Event"],
        },
        BattleEnd: {
          name: "Event: Battle End",
          castTime: 0,
          action: [],
          tags: ["Event"],
        },
      },
    };

    const legacyRotation = {
      name: "Automatic HP probe",
      autoHP: true,
      eventTimeReference: "battleStart" as const,
      steps: [{ type: "skill" as const, skill: "ObserveHP" }],
    };
    const hpTimeline = buildRotationTimeline({
      ...commonInput,
      rotation: legacyRotation,
      skills: {
        ObserveHP: {
          name: "Observe HP",
          castTime: 10,
          action: Array.from({ length: 11 }, (_, time) => ({ type: "damage", phyCoef: 1, attrCoef: 1, time })),
          tags: ["General"],
        },
      },
    });
    const hpRow = hpTimeline.find((row) => row.step.type === "skill");
    const automaticRows = hpTimeline.filter(
      (row) => row.step.type === "event" && row.step.event === "HP" && row.step.automatic,
    );
    expect(
      automaticRows.length === 0,
      "A legacy Auto HP flag must not generate duration-dependent HP events.",
    ).toBeTruthy();
    expect(
      Object.values(hpRow.actionStates).every((state) => state.targetHPRatio === 0.99),
      "Without manual HP events or maximum target HP, legacy rotations retain the ordinary 99% target state.",
    ).toBeTruthy();

    const vitalityTimeline = buildRotationTimeline({
      ...commonInput,
      rotation: {
        name: "Infinite Vitality probe",
        infiniteVitality: true,
        steps: [{ type: "skill", skill: "SpendVitality" }],
      },
      skills: {
        SpendVitality: {
          name: "Spend Vitality",
          castTime: 2,
          action: [
            { type: "consumeResource", value: "Vitality", amount: 50, time: 0 },
            { type: "damage", phyCoef: 1, attrCoef: 1, time: 1 },
            { type: "addResource", value: "Vitality", amount: 10, time: 1 },
            { type: "consumeResource", value: "Vitality", amount: "all", time: 2 },
            { type: "damage", phyCoef: 1, attrCoef: 1, time: 2 },
          ],
          tags: ["Mystic"],
        },
      },
      initialResources: { Vitality: 100 },
      resourceMaximums: { Vitality: 100 },
    });
    expect(
      Object.values(vitalityTimeline[0].actionStates).every((state) => state.resources.Vitality === 100),
      "An infinite resource must remain at its maximum through gains and every form of consumption.",
    ).toBeTruthy();

    const dummyAttackTimeline = buildRotationTimeline({
      ...commonInput,
      rotation: {
        name: "Dummy Attack probe",
        dummyAttack: true,
        eventTimeReference: "battleStart",
        steps: [
          { type: "skill", skill: "ObserveDamage" },
          { type: "event", event: "BattleEnd", startTime: 18 },
        ],
      },
      skills: {
        ObserveDamage: {
          name: "Observe Damage",
          castTime: 18,
          action: [{ type: "damage", phyCoef: 1, attrCoef: 1, time: 17.9 }],
          tags: ["General"],
        },
      },
      maxHP: 2000,
    });
    const dummyAttackRows = dummyAttackTimeline.filter(
      (row) => row.step.type === "event" && row.step.event === "TakeDamage" && row.step.automatic === "dummyAttack",
    );
    expect(
      dummyAttackRows.length === 6 &&
        dummyAttackRows.every((row, index) => Math.abs(row.startTime - (5.5 + Math.floor(index / 2) * 6)) < 1e-9),
      "Dummy Attack must create two generated 200-damage events together every six seconds from 5.5s until Battle End.",
    ).toBeTruthy();
    expect(
      dummyAttackRows.every((row) => row.actions[0]?.damage === 200),
      "Every generated Dummy Attack hit must deal exactly 200 damage.",
    ).toBeTruthy();
    const observedDamageRow = dummyAttackTimeline.find(
      (row) => row.step.type === "skill" && row.step.skill === "ObserveDamage",
    );
    expect(
      observedDamageRow?.actionStates[0]?.currentHP === 800,
      "Generated Dummy Attack hits must update the same Self HP state as manual Take Damage events.",
    ).toBeTruthy();
  });
});
