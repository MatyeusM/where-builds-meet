import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { createServer } from "vite";

const server = await createServer({
  configFile: false,
  server: { middlewareMode: true },
  appType: "custom",
  logLevel: "silent",
});
const readJson = async (path) => JSON.parse(await readFile(path, "utf8"));

try {
  const { martialArtEffectsForRank } = await server.ssrLoadModule("/src/data/martialArtTalents.ts");
  const { calculateRotationBaseline } = await server.ssrLoadModule("/src/calculations/rotationCalculator.ts");
  const { calculateStatsWithEffects } = await server.ssrLoadModule("/src/calculations/statEffects.ts");
  const { calculateDerivedStats } = await server.ssrLoadModule("/src/calculations/effectiveStats.ts");
  const { emptyStats } = await server.ssrLoadModule("/src/data/statDefinitions.ts");
  const profiles = await readJson("data/breakthrough.json");
  const arts = await Promise.all(
    (await readdir("data/martial-art"))
      .filter((file) => file.endsWith(".json"))
      .map((file) => readJson(`data/martial-art/${file}`)),
  );
  for (const art of arts) {
    assert(art.talent.every(Array.isArray), `${art.name} must have a talent array at every rank slot`);
    for (const profile of Object.values(profiles))
      assert(
        Array.isArray(art.talent[profile.martialArtTalentRank]),
        `${art.name} must define the rank selected by breakthrough ${profile.name}`,
      );
  }

  const shared = { stat: { minPhys: 10, maxPhys: 10 } };
  const definitions = {
    infernalTwinblades: {
      talent: [
        [],
        [
          {
            name: "Reset rank",
            effect: [
              shared,
              {
                trigger: {
                  event: "skillStart",
                  requirement: [{ target: "skillTag", value: "PerfectDodge" }],
                  action: { type: "clearCD", value: "Attack" },
                },
              },
            ],
          },
        ],
        [{ name: "Attack rank", effect: [{ stat: { minPhys: 20, maxPhys: 20 } }] }],
      ],
    },
  };
  const before = structuredClone(definitions);
  const selected = (rank) => martialArtEffectsForRank(definitions, ["infernalTwinblades", "infernalTwinblades"], rank);
  const stats = { ...emptyStats, minPhys: 100, maxPhys: 100, precision: 1 };
  const results = [0, 1, 2, 3].map((rank) => {
    const setupEffects = selected(rank);
    const sheet = calculateStatsWithEffects(stats, setupEffects, 0);
    const result = calculateRotationBaseline({
      timeline: {
        rotation: {
          name: "Rank behavior",
          steps: [
            { type: "skill", skill: "Attack" },
            { type: "skill", skill: "Dodge" },
            { type: "skill", skill: "Attack" },
          ],
        },
        skills: {
          Attack: { castTime: 1, cooldown: 10, action: [{ type: "damage", phyCoef: 1, time: 0 }] },
          Dodge: { castTime: 0, tags: ["PerfectDodge"], action: [] },
        },
        eventDefinitions: {},
        dots: {},
        effectDefinitions: {},
        innerWayConditions: [],
        innerWayRules: [],
        setupEffects,
        weapons: [],
      },
      startAnchor: { rowId: "rotation-0" },
      stats,
      derivedStats: calculateDerivedStats(stats, 0),
      enemy: {
        name: "Probe",
        level: 1,
        defense: 0,
        physicalResistance: 0,
        bellstrikeResistance: 0,
        stonesplitResistance: 0,
        silkbindResistance: 0,
        bamboocutResistance: 0,
        judgementResistance: 0,
      },
      attunement: { physicalPenetration: 0, formlessPenetration: 0 },
      weapons: [],
      statPriority: [],
      attunementPriority: [],
      innerWayPriority: [],
      setupComparisons: {},
    });
    return { attack: sheet.stats.minPhys, duration: result.duration, totalDamage: result.metrics.totalDamage };
  });
  assert.deepEqual(
    results,
    [
      { attack: 100, duration: 11, totalDamage: 200 },
      { attack: 110, duration: 2, totalDamage: 220 },
      { attack: 120, duration: 11, totalDamage: 240 },
      { attack: 100, duration: 11, totalDamage: 200 },
    ],
    "Only the selected rank affects stats, damage, and cooldown timing; empty/missing ranks have no effects and duplicate weapons do not double talents",
  );
  assert.deepEqual(definitions, before, "Selecting a rank must not mutate bundled effects");

  const gauntlets = arts.find((art) => art.name === "Heavenwill Gauntlets");
  const rope = arts.find((art) => art.name === "Skygrasp Rope Dart");
  const current = { heavenwill: gauntlets, skygrasp: rope };
  for (const profile of Object.values(profiles)) {
    const effects = martialArtEffectsForRank(current, ["heavenwill", "skygrasp"], profile.martialArtTalentRank);
    const sheet = calculateStatsWithEffects(
      { ...emptyStats, minBamboocut: 100, maxBamboocut: 200 },
      effects.filter((effect) => !effect.requirement),
      0,
      ["heavenwill", "skygrasp"],
    );
    assert.equal(
      sheet.rawStats.minBamboocut,
      296,
      `Breakthrough ${profile.name} selects both real rank-13 attribute talents`,
    );
    assert(
      Math.abs(sheet.stats.bamboocutDmgBonus - 296 * 0.000336) < 1e-9,
      "Ranked talent formulas still read the shared raw-stat stage",
    );
  }
  console.log(
    "Talent ranks: configured data coverage, independent selection, deduplication, raw-stat formulas, worker damage, and timeline changes passed.",
  );
} finally {
  await server.close();
}
