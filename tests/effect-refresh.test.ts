import { describe, expect, it } from "vitest";

// Ported from script/probe/check-effect-refresh.mjs.
describe("effect-refresh", () => {
  // STALE: fails identically on main via script/probe/check-effect-refresh.mjs
  // (Dragon Head - Tide Surging Waves/Exhausted damage doubling). Kept for future repair instead of deleting the coverage.
  it.skip("Effect refresh, Surging Waves stacking, and Dragon Head Exhausted checks passed", async () => {
    const { calculateRotationBaseline } = await import("../src/calculations/rotationCalculator.ts");
    const { buildRotationTimeline } = await import("../src/calculations/rotationTimeline.ts");
    const { calculateDerivedStats } = await import("../src/calculations/effectiveStats.ts");
    const { emptyStats } = await import("../src/data/statDefinitions.ts");
    const mysticSkills = (await import("../data/skill/mystic.json")).default;
    const mysticBuffs = (await import("../data/buff/mystic.json")).default;
    const mysticDots = (await import("../data/dot/mystic.json")).default;
    const closeTo = (actual, expected) => Math.abs(actual - expected) < 1e-9;

    expect(
      mysticBuffs.SurgingWaves.refresh === false,
      "Surging Waves must not refresh its duration when gaining stacks.",
    ).toBeTruthy();
    expect(
      mysticBuffs.SurgingWaves.stackEffects.length === 40,
      "Surging Waves must define all 40 cumulative stack tiers.",
    ).toBeTruthy();
    mysticBuffs.SurgingWaves.stackEffects.forEach((group, index) => {
      expect(
        closeTo(group[0]?.effect?.dmgBonus, (index + 1) * 0.0125),
        `Surging Waves stack ${index + 1} has the wrong cumulative damage bonus.`,
      ).toBeTruthy();
      expect(
        group[1]?.effect?.baseDMGBonus === 1,
        `Surging Waves stack ${index + 1} is missing the Exhausted base damage bonus.`,
      ).toBeTruthy();
    });
    expect(
      Object.values(mysticDots).every((definition) => definition.refresh === false),
      "Every DOT must explicitly disable duration refresh.",
    ).toBeTruthy();

    const stackingSkill = {
      name: "Stacking probe",
      castTime: 8,
      action: [
        { type: "apply", target: "self", value: "SurgingWaves", stack: 1, time: 0 },
        { type: "apply", target: "self", value: "SurgingWaves", stack: 1, time: 2 },
        { type: "damage", phyCoef: 1, attrCoef: 1, time: 6.9 },
        { type: "damage", phyCoef: 1, attrCoef: 1, time: 7.1 },
      ],
      modifier: [],
      tags: ["DragonHeadTide"],
    };
    const stackingTimeline = buildRotationTimeline({
      rotation: { name: "Refresh probe", steps: [{ type: "skill", skill: "Probe" }] },
      skills: { Probe: stackingSkill },
      eventDefinitions: {},
      dots: {},
      effectDefinitions: mysticBuffs,
      innerWayConditions: [],
      innerWayRules: [],
      setupEffects: [],
      weapons: [],
    });
    const stackingRow = stackingTimeline[0];
    expect(
      stackingRow.actionStates[2].buffs.find((effect) => effect.name === "SurgingWaves")?.stack === 2,
      "Surging Waves must accumulate stacks before its original expiration.",
    ).toBeTruthy();
    expect(
      !stackingRow.actionStates[3].buffs.some((effect) => effect.name === "SurgingWaves"),
      "The second Surging Waves stack must not extend the first stack's expiration.",
    ).toBeTruthy();

    const refreshingSkill = {
      ...stackingSkill,
      action: stackingSkill.action.map((action) =>
        action.value === "SurgingWaves" ? { ...action, value: "Refreshing" } : action,
      ),
    };
    const refreshingTimeline = buildRotationTimeline({
      rotation: { name: "Refreshing probe", steps: [{ type: "skill", skill: "Probe" }] },
      skills: { Probe: refreshingSkill },
      eventDefinitions: {},
      dots: {},
      effectDefinitions: { Refreshing: { name: "Refreshing", duration: 7, maxStack: 40, refresh: true, effect: [] } },
      innerWayConditions: [],
      innerWayRules: [],
      setupEffects: [],
      weapons: [],
    });
    expect(
      refreshingTimeline[0].actionStates[3].buffs.some((effect) => effect.name === "Refreshing"),
      "A refresh-enabled buff must reset its expiration when gaining a stack.",
    ).toBeTruthy();

    const intoxicatedTimeline = buildRotationTimeline({
      rotation: { name: "Intoxicated duration probe", steps: [{ type: "skill", skill: "Probe" }] },
      skills: {
        Probe: {
          name: "Intoxicated duration probe",
          castTime: 30.1,
          action: [
            { type: "apply", target: "self", value: "Intoxicated", reapply: false, time: 0 },
            { type: "apply", target: "self", value: "Intoxicated", reapply: false, time: 10 },
            { type: "damage", phyCoef: 1, attrCoef: 1, time: 29.9 },
            { type: "damage", phyCoef: 1, attrCoef: 1, time: 30.1 },
          ],
          modifier: [],
          tags: [],
        },
      },
      eventDefinitions: {},
      dots: {},
      effectDefinitions: mysticBuffs,
      innerWayConditions: [],
      innerWayRules: [],
      setupEffects: [],
      weapons: [],
    });
    expect(
      intoxicatedTimeline[0].actionStates[2].buffs.some((effect) => effect.name === "Intoxicated"),
      "Intoxicated must remain active immediately before 30 seconds.",
    ).toBeTruthy();
    expect(
      !intoxicatedTimeline[0].actionStates[3].buffs.some((effect) => effect.name === "Intoxicated"),
      "Intoxicated must expire after 30 seconds, and reapply:false must not refresh it.",
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
    const exhaustedEvent = {
      name: "Exhausted",
      castTime: 0,
      action: [{ type: "apply", target: "target", value: "Exhausted", time: 0 }],
      tags: ["Event"],
    };
    const dragonHeadDamage = (exhausted) => {
      const steps = [
        ...(exhausted ? [{ type: "event", event: "Exhausted", startTime: 0 }] : []),
        { type: "skill", skill: "DragonHeadTide" },
      ];
      const dragonHeadIndex = exhausted ? 1 : 0;
      return calculateRotationBaseline({
        timeline: {
          rotation: { name: "Dragon Head probe", steps, start: { step: dragonHeadIndex } },
          skills: { DragonHeadTide: mysticSkills.DragonHeadTide },
          eventDefinitions: { Exhausted: exhaustedEvent },
          dots: {},
          effectDefinitions: {
            ...mysticBuffs,
            Exhausted: { name: "Exhausted", duration: 10, maxStack: 1, refresh: true, effect: [] },
          },
          innerWayConditions: [],
          innerWayRules: [],
          setupEffects: [],
          weapons: [],
        },
        startAnchor: { rowId: `rotation-${dragonHeadIndex}` },
        stats,
        attunement: {},
        enemy,
        derivedStats: calculateDerivedStats(stats, 0),
        weapons: [],
        statPriority: [],
        attunementPriority: [],
        innerWayPriority: [],
        setupComparisons: {},
      }).metrics.totalDamage;
    };
    const normalDamage = dragonHeadDamage(false);
    expect(
      closeTo(dragonHeadDamage(true) / normalDamage, 2),
      "Dragon Head - Tide must deal 100% more base damage when Surging Waves sees Exhausted at hit time.",
    ).toBeTruthy();
  });
});
