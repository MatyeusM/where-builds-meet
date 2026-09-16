import { describe, expect, it } from "vitest";
import { buildRotationTimeline } from "../src/calculations/rotationTimeline";

describe("conditional action ordering", () => {
  it.each([false, true])("applies a conditional debuff after its triggering hit (enabled=%s)", (enabled) => {
    const timeline = buildRotationTimeline({
      rotation: { name: "Conditional application", steps: [{ type: "skill", skill: "Probe" }] },
      skills: {
        Probe: {
          name: "Probe",
          castTime: 1,
          tags: [],
          action: [
            { type: "damage", phyCoef: 1, time: 0.2 },
            {
              type: "apply",
              target: "target",
              value: "Mark",
              time: 0.2,
              requirement: [{ target: "self", value: "Enabled" }],
            },
            { type: "damage", phyCoef: 1, time: 0.6 },
          ],
        },
      },
      eventDefinitions: {},
      dots: {},
      effectDefinitions: { Mark: { duration: 2, maxStack: 1, effect: [] } },
      innerWayConditions: enabled ? ["Enabled"] : [],
      innerWayRules: [],
      setupEffects: [],
      weapons: [],
    });
    const row = timeline.find((row) => row.step.skill === "Probe")!;
    const hits = row.actions.flatMap((action, index) => (action.type === "damage" ? [row.actionStates[index]] : []));
    expect(hits).toHaveLength(2);
    expect(hits[0].debuffs.some((effect) => effect.name === "Mark")).toBe(false);
    expect(hits[1].debuffs.some((effect) => effect.name === "Mark")).toBe(enabled);
  });

  it.each([
    { enabled: true, equipped: true, expected: 0.25 },
    { enabled: false, equipped: true, expected: 0 },
    { enabled: true, equipped: false, expected: 0 },
  ])("gates delayed resource grants by condition and equipment: %j", ({ enabled, equipped, expected }) => {
    const timeline = buildRotationTimeline({
      rotation: {
        name: "Delayed resource",
        steps: [
          { type: "skill", skill: "Grant" },
          { type: "skill", skill: "Observe" },
        ],
      },
      skills: {
        Grant: {
          name: "Grant",
          castTime: 0.5,
          tags: [],
          action: [
            {
              type: "addResource",
              value: "Charge",
              amount: 0.25,
              time: 0.8,
              requirement: [
                { target: "self", value: "Enabled" },
                { target: "equippedMartialArt", value: "heavenwill" },
              ],
            },
          ],
        },
        Observe: {
          name: "Observe",
          castTime: 0.6,
          tags: [],
          action: [
            { type: "damage", phyCoef: 0, time: 0.1 },
            { type: "damage", phyCoef: 0, time: 0.5 },
          ],
        },
      },
      eventDefinitions: {},
      dots: {},
      effectDefinitions: {},
      innerWayConditions: enabled ? ["Enabled"] : [],
      innerWayRules: [],
      setupEffects: [],
      weapons: equipped ? ["heavenwill"] : [],
      initialResources: { Charge: 0 },
      resourceMaximums: { Charge: 1 },
    });
    const row = timeline.find((row) => row.step.skill === "Observe")!;
    expect(row.actionStates[0].resources.Charge).toBe(0);
    expect(row.actionStates[1].resources.Charge).toBe(expected);
  });
});
