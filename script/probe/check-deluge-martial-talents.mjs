import assert from "node:assert/strict";
import { createServer } from "vite";

const server = await createServer({
  configFile: false,
  server: { middlewareMode: true },
  appType: "custom",
  logLevel: "silent",
});
const close = (actual, expected, message) =>
  assert(Math.abs(actual - expected) < 1e-9, `${message}: ${actual} != ${expected}`);
try {
  const panacea = (await server.ssrLoadModule("/data/martial-art/panacea-fan.json")).default;
  const soulshade = (await server.ssrLoadModule("/data/martial-art/soulshade-umbrella.json")).default;
  const { martialArtEffectsForRank } = await server.ssrLoadModule("/src/data/martialArtTalents.ts");
  const { calculateStatsWithEffects, resolveFormulaValue } = await server.ssrLoadModule(
    "/src/calculations/statEffects.ts",
  );
  const { calculateDamageBreakdown } = await server.ssrLoadModule("/src/calculations/damage.ts");
  const { calculateDerivedStats } = await server.ssrLoadModule("/src/calculations/effectiveStats.ts");
  const { requirementsPass } = await server.ssrLoadModule("/src/calculations/rotationTimeline.ts");
  const { emptyStats } = await server.ssrLoadModule("/src/data/statDefinitions.ts");
  const arts = { panaceaFan: panacea, soulshadeUmbrella: soulshade };
  for (const weapon of Object.keys(arts)) {
    const effects = martialArtEffectsForRank(arts, [weapon], 13).filter((e) => !e.requirement);
    const stats = calculateStatsWithEffects({ ...emptyStats, agility: 280, minSilkbind: 230 }, effects, 0).stats;
    close(stats.minSilkbind, 328, "Attribute talent enters raw minimum");
    close(stats.maxSilkbind, 196, "Attribute talent enters raw maximum");
    switch (weapon) {
      case "panaceaFan":
        close(stats.crit, 0.08512, "Panacea Critical Rate cap");
        close(stats.silkbindDmgBonus, 0.11, "Panacea attribute damage cap");
        close(stats.silkbindHealingBonus, 0.11, "Panacea attribute healing cap");
        break;
      case "soulshadeUmbrella":
        close(stats.minPhys, 73.92, "Soulshade Physical Attack cap");
        close(stats.silkbindPenetration, 22, "Soulshade penetration cap");
        break;
    }
  }
  const effectsFor = (weapons, tags) =>
    martialArtEffectsForRank(arts, weapons, 13)
      .filter((e) => requirementsPass(e.requirement, [], [], tags, new Set(), weapons))
      .map((e) => e.effect ?? e);
  for (const [minPhys, bonus] of [
    [0, 0.05],
    [375, 0.175],
    [750, 0.3],
    [1000, 0.3],
  ]) {
    for (const [weapon, tag, otherTag, key] of [
      ["panaceaFan", "Heavy", "Light", "healingBonus"],
      ["soulshadeUmbrella", "Special", "Heavy", "criticalHealingBonus"],
    ]) {
      const value = (tags) =>
        effectsFor([weapon], tags).reduce((sum, e) => {
          switch (typeof e[key]) {
            case "number":
              return sum + e[key];
            case "object":
              return sum + (e[key]?.formula ? resolveFormulaValue(e[key].formula, { minPhys }) : 0);
            default:
              return sum;
          }
        }, 0);
      close(value([tag]), bonus, "Base and scaling healing bonuses sum and cap");
      close(value([otherTag]), 0, "Healing bonus requires its attack tag");
    }
  }
  const stats = { ...emptyStats, minPhys: 100, maxPhys: 100, precision: 0.8 };
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
  const damage = (weapons, tags = ["Mystic"], includePrecision = true) =>
    calculateDamageBreakdown(
      { phyCoef: 1 },
      {
        stats,
        derivedStats: calculateDerivedStats(stats, 0),
        enemy,
        attunement: {},
        weapons,
        skillTags: tags,
        buffs: [],
        effects: effectsFor(weapons, tags).filter((effect) => includePrecision || !effect.convert),
      },
    );
  const alone = damage(["soulshadeUmbrella"]);
  const paired = damage(["soulshadeUmbrella", "panaceaFan"]);
  close(
    damage(["soulshadeUmbrella", "panaceaFan"], ["Mystic"], false).total / alone.total,
    1.2,
    "Paired Mystic damage bonus remains 20% independently of Precision",
  );
  close(paired.outcomeRates.abrasion, 0, "Mystic Precision removes Abrasion with both martial arts equipped");
  close(paired.outcomeRates.normal, 1, "Mystic Precision transfers Abrasion probability to Normal");
  close(damage(["panaceaFan"]).outcomeRates.abrasion, 0.2, "Panacea alone does not grant Mystic Precision");
  close(
    damage(["soulshadeUmbrella", "panaceaFan"], ["Light"]).outcomeRates.abrasion,
    0.2,
    "Mystic Precision does not affect non-Mystic attacks",
  );
  console.log(
    "Deluge talents: datamined stats, healing caps/tag gating, Mystic bonus, and conditional Mystic Precision passed.",
  );
} finally {
  await server.close();
}
