import { describe, expect, it } from "vitest";

// Ported from script/probe/check-defense-resistance-effects.mjs.
describe("defense-resistance-effects", () => {
  it("Enemy defense, Physical Resistance, and Qingyi's Charm checks passed", async () => {
    const { calculateDamageBreakdown, calculateSimulatedDamageBreakdown } =
      await import("../src/calculations/damage.ts");
    const { calculateDerivedStats } = await import("../src/calculations/effectiveStats.ts");
    const { emptyStats } = await import("../src/data/statDefinitions.ts");
    const charms = (await import("../data/debuff/innerway.json")).default;
    const phantomChime = (await import("../data/debuff/bamboocut-dust.json")).default.PhantomChime;
    const closeTo = (actual, expected) => Math.abs(actual - expected) < 1e-9;
    const stats = { ...emptyStats, minPhys: 1000, maxPhys: 1000, precision: 1 };
    const enemy = {
      name: "Probe",
      level: 96,
      defense: 408,
      physicalResistance: 0,
      bellstrikeResistance: 0,
      stonesplitResistance: 0,
      silkbindResistance: 0,
      bamboocutResistance: 0,
      judgementResistance: 0,
    };
    const baseContext = {
      stats,
      attunement: {},
      skillTags: [],
      weapons: [],
      buffs: [],
      enemy,
      derivedStats: calculateDerivedStats(stats, 0),
      effects: [],
    };
    const damage = (effects) =>
      calculateDamageBreakdown({ phyCoef: 1, attrCoef: 1 }, { ...baseContext, effects }).physical;
    const baseline = damage([]);
    const reducedDefense = damage([{ defenseBonus: -0.06 }]);
    const reducedResistance = damage([{ physicalResistance: -10 }]);
    const combined = damage([{ defenseBonus: -0.06, physicalResistance: -10 }]);

    expect(closeTo(baseline, 592), "Probe baseline must use the unadjusted 408 defense.").toBeTruthy();
    expect(closeTo(reducedDefense, 616.48), "A -6% defense adjustment must reduce 408 defense to 383.52.").toBeTruthy();
    expect(
      closeTo(reducedResistance / baseline, 1.05),
      "Reducing Physical Resistance by 10 must use the flat resistance formula.",
    ).toBeTruthy();
    expect(
      closeTo(combined, 616.48 * 1.05),
      "Defense and resistance reductions must apply through their separate formula stages.",
    ).toBeTruthy();

    const simulatedBaseline = calculateSimulatedDamageBreakdown(
      { phyCoef: 1, attrCoef: 1 },
      { ...baseContext },
      () => 0.5,
    ).physical;
    const simulatedCombined = calculateSimulatedDamageBreakdown(
      { phyCoef: 1, attrCoef: 1 },
      { ...baseContext, effects: [{ defenseBonus: -0.06, physicalResistance: -10 }] },
      () => 0.5,
    ).physical;
    expect(
      closeTo(simulatedCombined / simulatedBaseline, combined / baseline),
      "The simulator must use the same defense and resistance adjustments.",
    ).toBeTruthy();

    const expectedT0 = [-0.006, -0.012, -0.018, -0.024, -0.03];
    const expectedT1 = [-0.012, -0.024, -0.036, -0.048, -0.06];
    const values = (definition) => definition.stackEffects.map((group) => group[0].effect.defenseBonus);
    expect(
      JSON.stringify(values(charms.QingyisCharmT0)) === JSON.stringify(expectedT0),
      "Qingyi's Charm T0 stack progression is incorrect.",
    ).toBeTruthy();
    expect(
      JSON.stringify(values(charms.QingyisCharmT1)) === JSON.stringify(expectedT1),
      "Qingyi's Charm T1 stack progression is incorrect.",
    ).toBeTruthy();
    expect(
      JSON.stringify(values(charms.QingyisCharmT6)) === JSON.stringify(expectedT1),
      "Qingyi's Charm T6 must retain T1's 1.2% per-stack progression.",
    ).toBeTruthy();
    expect(
      charms.QingyisCharmT6.stackEffects[4][0].effect.physicalResistance === -10,
      "Qingyi's Charm T6 must reduce Physical Resistance by 10 only at five stacks.",
    ).toBeTruthy();
    expect(
      JSON.stringify(phantomChime.stackEffects.map((group) => group[0].effect.physicalResistance)) ===
        JSON.stringify([-2, -4, -6, -8, -10]),
      "Phantom Chime's cumulative Physical Resistance progression is incorrect.",
    ).toBeTruthy();
    expect(
      phantomChime.duration === 5 && phantomChime.maxStack === 5,
      "Phantom Chime must last five seconds and cap at five stacks.",
    ).toBeTruthy();
  });
});
