import { describe, expect, it } from "vitest";

// Ported from script/probe/check-rotation-anchor.mjs.
describe("rotation-anchor", () => {
  it("Rotation start-anchor damage and hit-count checks passed", async () => {
    const { calculateRotationBaseline, calculateRotationComparisons, calculateRotationSimulation } =
      await import("../src/calculations/rotationCalculator.ts");
    const { buildRotationTimeline } = await import("../src/calculations/rotationTimeline.ts");
    const { calculateDerivedStats } = await import("../src/calculations/effectiveStats.ts");
    const { emptyStats } = await import("../src/data/statDefinitions.ts");
    const stats = { ...emptyStats, minPhys: 100, maxPhys: 100, precision: 1 };
    const attunement = {
      physicalPenetration: 0,
      formlessPenetration: 0,
      phalanxbaneChargedBoost: 0,
      phalanxbaneMartialBoost: 0,
      snowpartingChargedBoost: 0,
      snowpartingVariedComboBoost: 0,
      snowpartingMartialBoost: 0,
    };
    const enemy = {
      name: "Probe",
      level: 1,
      defense: 0,
      physicalResistance: 0,
      bellstrikeResistance: 0,
      stonesplitResistance: 0,
      silkbindResistance: 0,
      bamboocutResistance: 0,
      judgementResistance: 0,
    };
    const timeline = {
      rotation: { name: "Anchor probe", steps: [{ type: "skill", skill: "ProbeSkill" }] },
      skills: {
        ProbeSkill: {
          name: "Probe Skill",
          castTime: 2,
          tags: [],
          action: [
            { type: "damage", time: 0, phyCoef: 1, attrCoef: 1 },
            { type: "damage", time: 1, phyCoef: 1, attrCoef: 1 },
            { type: "damage", time: 1, phyCoef: 1, attrCoef: 1 },
            { type: "damage", time: 2, phyCoef: 1, attrCoef: 1 },
          ],
        },
      },
      eventDefinitions: {},
      dots: {},
      effectDefinitions: {},
      innerWayConditions: [],
      innerWayRules: [],
      setupEffects: [],
      weapons: [],
    };
    const bundle = {
      timeline,
      startAnchor: { rowId: "rotation-0", actionIndex: 2 },
      stats,
      attunement,
      enemy,
      derivedStats: calculateDerivedStats(stats, enemy.judgementResistance),
      weapons: [],
      statPriority: [{ label: "Maximum Physical Attack", stats: { ...stats, maxPhys: 110 } }],
      attunementPriority: [],
      innerWayPriority: [],
      setupComparisons: {},
    };
    const result = calculateRotationSimulation(bundle);
    const cachedBaseline = calculateRotationBaseline(bundle);
    const comparisonProgress = [];
    const cachedComparisons = calculateRotationComparisons(bundle, cachedBaseline, (completed, total) =>
      comparisonProgress.push([completed, total]),
    );

    expect(!result.actionBreakdowns["rotation-0:0"], "An action before the anchor time must be ignored.").toBeTruthy();
    expect(
      !result.actionBreakdowns["rotation-0:1"],
      "An earlier action at the anchor timestamp must be ignored.",
    ).toBeTruthy();
    expect(result.actionBreakdowns["rotation-0:2"], "The starting action must be calculated.").toBeTruthy();
    expect(result.actionBreakdowns["rotation-0:3"], "Actions after the anchor must be calculated.").toBeTruthy();
    expect(
      result.metrics.breakdown.skills[0]?.hits === 2,
      "Ignored actions must not contribute to hit count.",
    ).toBeTruthy();
    expect(result.metrics.totalDamage > 0, "Calculated actions must still contribute damage.").toBeTruthy();
    expect(
      cachedBaseline.metrics.statPriority.length === 0,
      "A baseline-only calculation must not calculate comparison rows.",
    ).toBeTruthy();
    expect(
      cachedComparisons.totalDamage === result.metrics.totalDamage,
      "Cached comparison metrics must reuse the baseline total damage.",
    ).toBeTruthy();
    expect(
      cachedComparisons.statPriority[0]?.dpsDifference === result.metrics.statPriority[0]?.dpsDifference,
      "Cached comparison results must match a full simulation.",
    ).toBeTruthy();
    expect(
      JSON.stringify(comparisonProgress) ===
        JSON.stringify([
          [0, 1],
          [1, 1],
        ]),
      "Comparison progress must equal completed variants divided by the total variant count.",
    ).toBeTruthy();
    const triggerTimeline = buildRotationTimeline({
      rotation: { name: "Trigger source probe", steps: [{ type: "skill", skill: "SourceSkill" }] },
      skills: {
        SourceSkill: {
          name: "Source Skill",
          castTime: 1,
          tags: [],
          action: [{ type: "damage", time: 1, phyCoef: 1, attrCoef: 1 }],
        },
        TriggeredProbe: {
          name: "Triggered Probe",
          castTime: 0,
          cooldown: 10,
          tags: ["Triggered"],
          action: [{ type: "damage", time: 0, phyCoef: 1, attrCoef: 1 }],
        },
      },
      eventDefinitions: {},
      dots: {},
      effectDefinitions: {},
      innerWayConditions: [],
      innerWayRules: [
        {
          source: "Probe",
          tier: 0,
          effect: {},
          trigger: { event: "damage", action: { type: "trigger", value: "TriggeredProbe" } },
        },
      ],
      setupEffects: [],
      weapons: [],
    });
    expect(
      triggerTimeline.find((row) => row.kind === "trigger")?.sourceRowId === "rotation-0",
      "Inner Way-triggered actions must retain their originating base skill row.",
    ).toBeTruthy();
    const durationTimeline = {
      rotation: { name: "Duration probe", steps: [{ type: "skill", skill: "DurationSkill" }] },
      skills: {
        DurationSkill: {
          name: "Duration Skill",
          castTime: 1,
          tags: [],
          action: [{ type: "damage", time: 1, phyCoef: 1, attrCoef: 1 }],
        },
      },
      eventDefinitions: {},
      dots: {},
      effectDefinitions: {},
      innerWayConditions: [],
      innerWayRules: [],
      setupEffects: [],
      weapons: [],
    };
    const longerDurationTimeline = {
      ...durationTimeline,
      skills: {
        DurationSkill: {
          name: "Duration Skill",
          castTime: 2,
          tags: [],
          action: [{ type: "damage", time: 2, phyCoef: 1, attrCoef: 1 }],
        },
      },
    };
    const durationBundle = {
      ...bundle,
      timeline: durationTimeline,
      startAnchor: { rowId: "rotation-0" },
      statPriority: [],
      innerWayPriority: [{ label: "Longer timeline", timeline: longerDurationTimeline }],
    };
    const durationBaseline = calculateRotationBaseline(durationBundle);
    const durationComparison = calculateRotationComparisons(durationBundle, durationBaseline);
    expect(durationBaseline.duration === 1, "The duration probe baseline must last one second.").toBeTruthy();
    expect(
      Math.abs(durationComparison.innerWayPriority[0].dpsDifference + durationBaseline.metrics.dps / 2) < 1e-9,
      "A rebuilt two-second variant must use its own duration instead of the one-second baseline duration.",
    ).toBeTruthy();
  });
});
