import { describe, expect, it } from "vitest";
import { probeLoad } from "./helpers/probe-loader.js";
import { readdir, readFile } from "node:fs/promises";

// Ported from script/probe/check-innerway-stat-visibility.mjs.
describe("innerway-stat-visibility", () => {
  it("Inner Way T2/T5 stat visibility checks passed", async () => {
    const { allStatDefinitions, emptyStats } = await import("../src/data/statDefinitions.ts");
    const { calculateStatsWithEffects } = await import("../src/calculations/statEffects.ts");
    const { calculateDerivedStats } = await import("../src/calculations/effectiveStats.ts");
    const { calculateDamageBreakdown } = await import("../src/calculations/damage.ts");
    const { calculateHealingBreakdown } = await import("../src/calculations/healing.ts");
    const { resolveAttunementStats } = await import("../src/calculations/attunementStats.ts");
    const { innerWayDefinitions, innerWayDefinitionForSoloLevel } = await probeLoad("/src/data/innerWayDefinitions.ts");
    const visibleStats = new Set(allStatDefinitions.map(({ key }) => key));
    const innerWayFiles = (await readdir("data/innerway")).filter((fileName) => fileName.endsWith(".json"));

    expect(
      !visibleStats.has("physicalPenetration") && "physicalPenetration" in emptyStats,
      "Physical Penetration must remain a shared calculation stat rather than a Character Stats field.",
    ).toBeTruthy();
    expect(
      "physicalResistance" in emptyStats && !visibleStats.has("physicalResistance"),
      "Physical Resistance must remain available to calculations but hidden from Character Stats.",
    ).toBeTruthy();

    const physicalPenetrationOutput = (physicalPenetration, calculate) => {
      const stats = { ...emptyStats, minPhys: 100, maxPhys: 100, precision: 1, physicalPenetration };
      return calculate(
        { type: calculate === calculateHealingBreakdown ? "heal" : "damage", phyCoef: 1, attrCoef: 1 },
        {
          stats,
          attunement: {},
          skillTags: [],
          weapons: [],
          buffs: [],
          enemy: {
            name: "Inner Way stat visibility probe",
            level: 96,
            defense: 0,
            physicalResistance: 10,
            bellstrikeResistance: 0,
            stonesplitResistance: 0,
            silkbindResistance: 0,
            bamboocutResistance: 0,
            judgementResistance: 0,
          },
          derivedStats: calculateDerivedStats(stats, 0),
          effects: [],
        },
      ).total;
    };
    expect(
      physicalPenetrationOutput(5.1, calculateDamageBreakdown) > physicalPenetrationOutput(0, calculateDamageBreakdown),
      "The Physical Penetration character stat must increase physical damage.",
    ).toBeTruthy();
    expect(
      physicalPenetrationOutput(5.1, calculateHealingBreakdown) >
        physicalPenetrationOutput(0, calculateHealingBreakdown),
      "The Physical Penetration character stat must increase physical healing.",
    ).toBeTruthy();

    for (const fileName of innerWayFiles) {
      const definition = innerWayDefinitionForSoloLevel(
        JSON.parse(await readFile(`data/innerway/${fileName}`, "utf8")),
        17,
      );
      const id = Object.keys(definition.effect)[0].replace(/T0$/, "");
      expect(
        innerWayDefinitions[id]?.name === definition.name,
        `${fileName} must be registered under its tier ID prefix.`,
      ).toBeTruthy();
      for (const tier of [2, 5]) {
        const tierDefinition = Object.entries(definition.effect ?? {}).find(([key]) => key.endsWith(`T${tier}`))?.[1];
        if (!tierDefinition?.effect) continue;
        for (const effect of tierDefinition.effect) {
          expect(
            effect.rawStat && !effect.requirement && !effect.target && !effect.modify,
            `${definition.name} T${tier} must express its unconditional bonus through the shared stat pipeline.`,
          ).toBeTruthy();
          for (const stat of Object.keys(effect.rawStat)) {
            expect(stat in emptyStats, `${definition.name} T${tier} uses unknown stat ${stat}.`).toBeTruthy();
            expect(
              stat === "physicalPenetration" ||
                stat === "formlessPenetration" ||
                stat === "physicalResistance" ||
                visibleStats.has(stat),
              `${definition.name} T${tier} stat ${stat} must be visible in its Stats-page section.`,
            ).toBeTruthy();
            const resolved = calculateStatsWithEffects(emptyStats, [effect], 0);
            const resolvedStats = resolved.stats;
            expect(
              resolved.rawStats[stat] === effect.rawStat[stat],
              `${definition.name} T${tier} must contribute before talent formulas.`,
            ).toBeTruthy();
            expect(
              effect.rawStat[stat] === 0 || resolvedStats[stat] !== emptyStats[stat],
              `${definition.name} T${tier} stat ${stat} must affect the shared character-stat result.`,
            ).toBeTruthy();
          }
        }
      }
    }

    const attunementDefaults = { physicalPenetration: 0, formlessPenetration: 0 };
    const resolvedAttunement = resolveAttunementStats(
      attunementDefaults,
      { physicalPenetration: 10 },
      {},
      { physicalPenetration: 5.1 },
    );
    expect(
      resolvedAttunement.displayed.physicalPenetration === 15.1 &&
        resolvedAttunement.calculation.physicalPenetration === 10,
      "Inner Way Physical Penetration must update the displayed Attunement Stats total without duplicating its calculation.",
    ).toBeTruthy();
  });
});
