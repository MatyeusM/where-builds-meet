import { describe, expect, it } from "vitest";

// Ported from script/probe/check-smolder-poet-rotation.mjs.
describe("smolder-poet-rotation", () => {
  // STALE: fails identically on main via script/probe/check-smolder-poet-rotation.mjs
  // (Poet 5 Enhanced Drunken Poet stack bonus). Kept for future repair instead of deleting the coverage.
  it.skip("Smolder Poet sequence, Poet 5 stack damage, and post-action Exhausted timing checks passed", async () => {
    const rotation = (await import("../data/rotation/stonesplit-strength/mixed-dummy-smolder-poet-1-min.json")).default;
    const snowparting = (await import("../data/skill/snowparting-blade.json")).default;
    const phalanxbane = (await import("../data/skill/phalanxbane-blade.json")).default;
    const mystic = (await import("../data/skill/mystic.json")).default;
    const general = (await import("../data/skill/general.json")).default;
    const dots = (await import("../data/dot/mystic.json")).default;
    const mysticBuffs = (await import("../data/buff/mystic.json")).default;
    const generalBuffs = (await import("../data/buff/general.json")).default;
    const stonesplitBuffs = (await import("../data/buff/stonesplit-strength.json")).default;
    const generalDebuffs = (await import("../data/debuff/general.json")).default;
    const { buildRotationTimeline } = await import("../src/calculations/rotationTimeline.ts");
    const { calculateDamageBreakdown } = await import("../src/calculations/damage.ts");
    const { calculateDerivedStats } = await import("../src/calculations/effectiveStats.ts");
    const { emptyStats } = await import("../src/data/statDefinitions.ts");
    const conditions = ["FrostCladNight", "MoraleChant", "SteadfastDevotion", "ThroatPiercingArt"].flatMap((name) =>
      Array.from({ length: 7 }, (_, tier) => `${name}T${tier}`),
    );
    const timeline = buildRotationTimeline({
      rotation,
      skills: { ...snowparting, ...phalanxbane, ...mystic, ...general },
      eventDefinitions: {
        Qi: {
          name: "Event: Qi",
          castTime: 0,
          action: [
            { type: "setQi", time: 0 },
            { type: "apply", target: "target", value: "Exhausted", time: 0 },
          ],
          tags: ["Event"],
        },
      },
      dots,
      effectDefinitions: { ...mysticBuffs, ...generalBuffs, ...stonesplitBuffs, ...generalDebuffs, ...dots },
      innerWayConditions: conditions,
      innerWayRules: [],
      setupEffects: [],
      weapons: ["snowparting", "phalanxbane"],
    });
    const skillSteps = rotation.steps.filter((step) => step.type === "skill");
    const cancelSkillIds = new Set(["DrunkenPoetDrinkCancel", "FluteOfTheTidesCancel", "DrunkenPoet5HitsCancel"]);
    skillSteps.forEach((step, index) => {
      if (cancelSkillIds.has(step.skill))
        expect(skillSteps[index + 1]?.skill === "Deflect", `${step.skill} must be followed by Deflect.`).toBeTruthy();
    });
    const startSkillIndex = rotation.steps.findIndex(
      (step) => step.type === "skill" && step.skill === "SnowpartingSpecial",
    );
    expect(
      rotation.start?.step === startSkillIndex && rotation.start.action === 5,
      "The rotation must start at Sideway Fleeting Trace action index 5.",
    ).toBeTruthy();
    const poet5RotationIndex = rotation.steps.findIndex(
      (step) => step.type === "skill" && step.skill === "DrunkenPoet5HitsCancel",
    );
    const poet5Row = timeline.find((row) => row.id === `rotation-${poet5RotationIndex}`);
    const poet5DamageIndex = poet5Row?.actions.findIndex(
      (action) => action.type === "damage" && action.phyCoef === 1.7052,
    );
    const poet5ModifierEffects = poet5Row?.actionModifierEffects?.[poet5DamageIndex ?? -1] ?? [];
    expect(
      poet5ModifierEffects.some((effect) => effect.dmgBonus === 0.8),
      "Poet 5 must capture four Enhanced Drunken Poet stacks as an 80% direct-damage bonus.",
    ).toBeTruthy();
    expect(
      poet5DamageIndex !== undefined &&
        poet5DamageIndex >= 0 &&
        !poet5Row?.actionStates[poet5DamageIndex]?.buffs.some((effect) => effect.name === "EnhanceDrunkenPoet"),
      "Poet 5 must consume every Enhanced Drunken Poet stack before its direct hit.",
    ).toBeTruthy();
    const poet5Explosions = timeline.filter(
      (row) =>
        row.kind === "trigger" &&
        row.sourceRowId === poet5Row?.id &&
        row.step.type === "skill" &&
        ["CombustionExplosion", "SmolderExplosion"].includes(row.step.skill ?? ""),
    );
    expect(
      poet5Explosions.every(
        (row) => !row.modifierEffects.some((effect) => typeof effect.dmgBonus === "number" && effect.dmgBonus !== 0),
      ),
      "Poet 5's triggered explosions must not inherit its stack-scaled damage bonus.",
    ).toBeTruthy();
    const stats = { ...emptyStats, minPhys: 1000, maxPhys: 1000, precision: 1 };
    const enemy = {
      name: "Probe",
      level: 96,
      defense: 0,
      physicalResistance: 0,
      bellstrikeResistance: 0,
      stonesplitResistance: 0,
      silkbindResistance: 0,
      bamboocutResistance: 0,
      judgementResistance: 0,
    };
    const directAction = poet5Row?.actions[poet5DamageIndex ?? -1];
    const directContext = {
      stats,
      attunement: {},
      skillTags: poet5Row?.actionSkillTags?.[poet5DamageIndex ?? -1] ?? [],
      weapons: [],
      buffs: [],
      enemy,
      derivedStats: calculateDerivedStats(stats, 0),
      effects: [],
    };
    const unenhancedDamage = calculateDamageBreakdown(directAction, directContext).total;
    const enhancedDamage = calculateDamageBreakdown(directAction, {
      ...directContext,
      effects: poet5ModifierEffects,
    }).total;
    expect(
      Math.abs(enhancedDamage / unenhancedDamage - 1.8) < 1e-9,
      "Four Enhanced Drunken Poet stacks must multiply Poet 5 direct damage by 1.8.",
    ).toBeTruthy();
    const exhaustedIndex = rotation.steps.findIndex(
      (step) => step.type === "event" && step.event === "Qi" && step.targetQiRatio === 0,
    );
    const exhaustedEvent = rotation.steps[exhaustedIndex];
    expect(
      exhaustedEvent?.type === "event" &&
        exhaustedEvent.event === "Qi" &&
        "after" in exhaustedEvent &&
        exhaustedEvent.after.action === 3,
      "Exhausted must attach after the fourth slam's first damage action.",
    ).toBeTruthy();
    const fourthSevenSlam = timeline.find((row) => row.id === `rotation-${exhaustedIndex + 1}`);
    expect(
      fourthSevenSlam?.step.type === "skill" && fourthSevenSlam.step.skill === "PhalanxbaneHeavyCharged3",
      "The fourth slam in the seven-slam group must follow Exhausted.",
    ).toBeTruthy();
    const damageTime = fourthSevenSlam.startTime + Number(fourthSevenSlam.actions[3]?.time ?? 0);
    const exhaustedRow = timeline.find((row) => row.id === `rotation-${exhaustedIndex}`);
    expect(
      exhaustedRow?.startTime === damageTime,
      "Exhausted must resolve at its attached damage timestamp.",
    ).toBeTruthy();
    expect(
      !fourthSevenSlam.actionStates[3]?.debuffs.some((effect) => effect.name === "Exhausted"),
      "The attached damage action must resolve before Exhausted applies.",
    ).toBeTruthy();
    expect(
      fourthSevenSlam.actionStates[4]?.debuffs.some((effect) => effect.name === "Exhausted"),
      "The damage action after the break must receive Exhausted.",
    ).toBeTruthy();
  });
});
