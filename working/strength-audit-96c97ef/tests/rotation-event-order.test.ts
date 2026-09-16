import { describe, expect, it } from "vitest";

// Ported from script/probe/check-rotation-event-order.mjs.
describe("rotation-event-order", () => {
  it("Rotation event ordering checks passed", async () => {
    const { attachedEventSiblingIndex, reorderAttachedEventWithinTarget } = await import("../src/rotationEditing.ts");
    const target = { action: 0 };
    const steps = [
      { type: "event", event: "Move", before: target, distance: 3 },
      { type: "event", event: "Buff", before: target, buff: "Cadence" },
      { type: "event", event: "Debuff", before: target, debuff: "Vulnerable" },
      { type: "skill", skill: "Avalanche" },
    ];
    const movedUp = reorderAttachedEventWithinTarget(steps, 1, -1);
    expect(movedUp?.movedIndex === 0, "The middle event should move above its same-target sibling.").toBeTruthy();
    expect(
      movedUp?.steps[0]?.event === "Buff",
      "The reordered event should occupy its sibling's position.",
    ).toBeTruthy();
    expect(
      movedUp?.steps[3]?.skill === "Avalanche",
      "Reordering events must not move their anchor skill.",
    ).toBeTruthy();

    const movedDown = reorderAttachedEventWithinTarget(steps, 1, 1);
    expect(movedDown?.movedIndex === 2, "The middle event should move below its same-target sibling.").toBeTruthy();
    expect(movedDown?.steps[2]?.event === "Buff", "Downward reordering should preserve the event itself.").toBeTruthy();

    const afterEventSteps = [
      { type: "event", event: "Qi", after: target, targetQiRatio: 0 },
      { type: "event", event: "Buff", before: target, buff: "Cadence" },
      { type: "skill", skill: "Avalanche" },
    ];
    expect(
      attachedEventSiblingIndex(afterEventSteps, 0, 1) === -1,
      "Before- and after-action events must remain separate ordering groups.",
    ).toBeTruthy();

    const takeDamageSteps = [
      { type: "event", event: "Qi", before: target, targetQiRatio: 0 },
      { type: "event", event: "Buff", before: target, buff: "Cadence" },
      { type: "event", event: "TakeDamage", startTime: 1, damage: 100 },
      { type: "skill", skill: "Avalanche" },
    ];
    const movedAroundTakeDamage = reorderAttachedEventWithinTarget(takeDamageSteps, 0, 1);
    expect(
      movedAroundTakeDamage?.steps[1]?.event === "Qi",
      "Attached events must share and reorder within a fixed-time Take Damage anchor.",
    ).toBeTruthy();
    const dragonTarget = { action: 8 };
    const dragonEventsAcrossTakeDamage = [
      { type: "event", event: "Buff", before: dragonTarget, buff: "SurgingWaves" },
      { type: "event", event: "SelfHP", before: dragonTarget, currentHPRatio: 0.2 },
      { type: "event", event: "TakeDamage", startTime: 1, damage: 1 },
      { type: "skill", skill: "DragonHeadTide" },
    ];
    expect(
      attachedEventSiblingIndex(dragonEventsAcrossTakeDamage, 0, 1) === 1,
      "Take Damage must not split events targeting an action that only the following skill provides.",
    ).toBeTruthy();
  });
});
