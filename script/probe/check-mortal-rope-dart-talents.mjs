import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createServer } from "vite";

const server = await createServer({
  configFile: false,
  server: { middlewareMode: true },
  appType: "custom",
  logLevel: "silent",
});
const close = (actual, expected, message) =>
  assert(Math.abs(actual - expected) < 1e-8, `${message}: ${actual} != ${expected}`);

try {
  const { martialArtEffectsForRank } = await server.ssrLoadModule("/src/data/martialArtTalents.ts");
  const { calculateStatsWithEffects } = await server.ssrLoadModule("/src/calculations/statEffects.ts");
  const { calculateDerivedStats } = await server.ssrLoadModule("/src/calculations/effectiveStats.ts");
  const { calculateRotationBaseline } = await server.ssrLoadModule("/src/calculations/rotationCalculator.ts");
  const { emptyStats } = await server.ssrLoadModule("/src/data/statDefinitions.ts");
  const { buildRotationTimeline } = await server.ssrLoadModule("/src/calculations/rotationTimeline.ts");
  const definitions = {
    mortalRopeDart: JSON.parse(await readFile("data/martial-art/mortal-rope-dart.json", "utf8")),
    infernalTwinblades: JSON.parse(await readFile("data/martial-art/infernal-twinblades.json", "utf8")),
  };
  const weapons = ["mortalRopeDart"];
  const setupEffects = martialArtEffectsForRank(definitions, weapons, 13);
  const unconditional = setupEffects.filter((effect) => !effect.requirement);
  for (const [agility, crit] of [
    [0, 0],
    [140, 0.04256],
    [280, 0.08512],
    [560, 0.08512],
  ]) {
    const sheet = calculateStatsWithEffects({ ...emptyStats, agility }, unconditional, 0, weapons);
    close(sheet.stats.crit, crit, "Agility conversion scales and stops at its cap");
  }
  for (const [baseMin, bonus] of [
    [0, 0.032928],
    [102, 0.0672],
    [230, 0.11],
    [500, 0.11],
  ]) {
    const sheet = calculateStatsWithEffects(
      { ...emptyStats, minBamboocut: baseMin, maxBamboocut: 1000 },
      [...unconditional, { statStage: "food", effectiveStat: { minBamboocut: 100 } }],
      0,
      weapons,
    );
    close(sheet.rawStats.minBamboocut, baseMin + 98, "Minimum attribute talent enters raw stats");
    close(sheet.rawStats.maxBamboocut, 1196, "Maximum attribute talent enters raw stats");
    close(sheet.stats.bamboocutDmgBonus, bonus, "Attribute conversion includes flat talents but excludes later food");
  }

  const calculate = (minPhys, rodent, extraEffects = [], selectedWeapons = weapons) => {
    const stats = {
      ...emptyStats,
      minPhys,
      maxPhys: 2000,
      precision: 1,
      minBamboocut: 102,
      maxBamboocut: 804,
      minBellstrike: 100,
      maxBellstrike: 100,
      minStonesplit: 100,
      maxStonesplit: 100,
      minSilkbind: 100,
      maxSilkbind: 100,
    };
    const result = calculateRotationBaseline({
      timeline: {
        rotation: { name: "Rodent talent probe", steps: [{ type: "skill", skill: "Hit" }] },
        skills: {
          Hit: {
            castTime: 1,
            tags: ["MartialArts", "MortalRopeDart", ...(rodent ? ["Rodent"] : [])],
            action: [{ type: "damage", phyCoef: 1, attrCoef: 1, time: 0 }],
          },
        },
        setupEffects: [...martialArtEffectsForRank(definitions, selectedWeapons, 13), ...extraEffects],
        weapons: selectedWeapons,
        effectDefinitions: {},
        eventDefinitions: {},
        dots: {},
        innerWayConditions: [],
        innerWayRules: [],
      },
      startAnchor: { rowId: "rotation-0" },
      stats,
      derivedStats: calculateDerivedStats(stats, 0),
      enemy: {
        name: "Probe",
        level: 96,
        defense: 0,
        physicalResistance: 0,
        bellstrikeResistance: 0,
        stonesplitResistance: 0,
        silkbindResistance: 0,
        bamboocutResistance: 0,
        judgementResistance: 0,
      },
      attunement: {},
      weapons: selectedWeapons,
      statPriority: [],
      attunementPriority: [],
      innerWayPriority: [],
      setupComparisons: {},
    });
    return Object.values(result.actionBreakdowns)[0];
  };
  for (const [minPhys, bonus] of [
    [0, 0.09],
    [375, 0.15],
    [750, 0.21],
    [1500, 0.21],
  ]) {
    const ordinary = calculate(minPhys, false);
    const rodent = calculate(minPhys, true);
    close(ordinary.physical, (minPhys + 2000) / 2, "Ordinary attacks have no Rodent bonus");
    close(
      rodent.physical - ordinary.physical,
      ((minPhys + 2000) / 2) * bonus,
      "Rodent Physical bonus has a fixed base and capped scaling",
    );
    close(
      ordinary.bamboocut,
      600 * 1.5 * 1.0672,
      "Flat attribute stats, converted bonus, and primary multiplier each apply once",
    );
    close(
      rodent.bamboocut - ordinary.bamboocut,
      600 * 1.5 * bonus,
      "Rodent Bamboocut bonus adds to the attribute talent",
    );
    for (const channel of ["bellstrike", "stonesplit", "silkbind"]) {
      close(rodent[channel], 100, `${channel} receives no Rodent bonus or primary multiplier`);
    }
  }
  const food = [{ statStage: "food", effectiveStat: { minPhys: 500 } }];
  close(
    calculate(375, true, food).physical / calculate(375, false, food).physical,
    1.15,
    "Food attack does not feed the talent formula",
  );
  const paired = ["mortalRopeDart", "infernalTwinblades"];
  const agility = [{ rawStat: { agility: 280 } }];
  close(
    calculate(375, true, agility, paired).physical / calculate(375, false, agility, paired).physical,
    1.15,
    "Infernal's Agility-to-attack talent does not feed Rodent scaling",
  );
  const debuffs = JSON.parse(await readFile("data/debuff/bamboocut-wind.json", "utf8"));
  const cast = (skill) => ({ type: "skill", skill });
  const delay = (duration) => ({ type: "event", event: "Delay", duration });
  const rows = buildRotationTimeline({
    rotation: {
      name: "Bone Corrosion refresh",
      steps: [
        cast("Apply"),
        cast("Observe"),
        delay(4),
        cast("Apply"),
        cast("Observe"),
        delay(1),
        cast("Observe"),
        delay(4),
        cast("Observe"),
      ],
    },
    skills: {
      Apply: { castTime: 0, action: [{ type: "apply", target: "target", value: "BoneCorrosion", time: 0 }] },
      Observe: { castTime: 0, action: [{ type: "damage", phyCoef: 1, time: 0 }] },
    },
    effectDefinitions: debuffs,
    eventDefinitions: {},
    dots: {},
    innerWayConditions: [],
    innerWayRules: [],
    setupEffects,
    weapons,
  });
  const observed = rows.filter((row) => row.step.skill === "Observe");
  const corrosion = (row) => row.debuffs.find((effect) => effect.name === "BoneCorrosion");
  close(corrosion(observed[0]).expiresAt, 5, "Bone Corrosion starts with a five-second lifetime");
  close(corrosion(observed[1]).expiresAt, 9, "Reapplication refreshes its expiration");
  assert.equal(corrosion(observed[1]).stack, 1, "Reapplication cannot add a second stack");
  assert(corrosion(observed[2]), "Refreshed Bone Corrosion survives the original expiration");
  assert(!corrosion(observed[3]), "Bone Corrosion expires at the refreshed boundary");
  console.log(
    "Mortal Rope Dart: rank-13 stats, Rodent damage, raw-stat isolation, and Bone Corrosion refresh/expiration passed.",
  );
} finally {
  await server.close();
}
