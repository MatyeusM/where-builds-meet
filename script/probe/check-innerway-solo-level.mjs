import assert from "node:assert/strict";
import { createServer } from "vite";

const server = await createServer({
  configFile: false,
  server: { middlewareMode: true },
  appType: "custom",
  logLevel: "silent",
});
try {
  const { innerWayDefinitionForSoloLevel, innerWayDefinitions } = await server.ssrLoadModule(
    "/src/data/innerWayDefinitions.ts",
  );
  const { calculateStatsWithEffects, calculateStatsWithOverrides } = await server.ssrLoadModule(
    "/src/calculations/statEffects.ts",
  );
  const { emptyStats } = await server.ssrLoadModule("/src/data/statDefinitions.ts");
  const { martialArtEffectsForRank } = await server.ssrLoadModule("/src/data/martialArtTalents.ts");
  const close = (actual, expected, message) =>
    assert.ok(Math.abs(actual - expected) < 1e-8, `${message}: ${actual} !== ${expected}`);
  const definition = {
    name: "Level probe",
    tags: [],
    altersTimeline: false,
    effect: {
      ProbeT0: { trigger: [{ action: [{ type: "apply", value: "ProbeBuff" }] }] },
      ProbeT2: {
        effect: [{ rawStat: { minPhys: { bySoloLevel: [null, 10, 20] }, maxPhys: { bySoloLevel: [null, 20, 40] } } }],
      },
      ProbeT5: { effect: [{ rawStat: { critDmgBonus: 0.04 } }] },
    },
  };
  const original = structuredClone(definition);
  const talents = {
    skystrikeGauntlets: {
      talent: [
        [],
        [{ name: "Scaling", effect: [{ stat: { maxPhys: { formula: { source: "minPhys", multiplier: 2 } } } }] }],
      ],
    },
  };
  const effects = (level, rank) => [
    ...Object.values(innerWayDefinitionForSoloLevel(definition, level).effect).flatMap((tier) => tier.effect ?? []),
    ...martialArtEffectsForRank(talents, ["skystrikeGauntlets"], rank),
  ];
  const lower = calculateStatsWithEffects(emptyStats, effects(1, 1), 0);
  const higher = calculateStatsWithEffects(emptyStats, effects(2, 1), 0);
  close(lower.rawStats.minPhys, 10, "Solo Level must select an exact raw contribution");
  close(higher.rawStats.minPhys, 20, "Changing Solo Level must replace, not sum, levels");
  close(lower.stats.maxPhys, 40, "Talent formulas must read the resolved raw level bonus");
  close(higher.stats.maxPhys, 80, "Level changes must propagate through the same talent rank");
  close(
    calculateStatsWithEffects(emptyStats, effects(2, 0), 0).rawStats.minPhys,
    20,
    "Talent rank must not select the Inner Way level",
  );
  close(higher.stats.critDmgBonus, lower.stats.critDmgBonus, "Fixed tier bonuses must not scale with level");
  close(
    calculateStatsWithEffects(emptyStats, effects(0, 1), 0).rawStats.minPhys,
    0,
    "An unavailable table slot must contribute no raw bonus",
  );
  for (const level of [1, 2]) {
    const overridden = calculateStatsWithOverrides(emptyStats, effects(level, 1), 0, { minPhys: 100 }, []);
    close(overridden.stats.minPhys, 100, "A saved final-stat override must remain exact when Solo Level changes");
  }
  assert.deepEqual(definition, original, "Resolving different Solo Levels must not mutate imported definitions");
  assert.deepEqual(
    innerWayDefinitionForSoloLevel(definition, 2).effect.ProbeT0,
    original.effect.ProbeT0,
    "Level resolution must preserve combat triggers",
  );
  assert.throws(
    () => innerWayDefinitionForSoloLevel(definition, 3),
    RangeError,
    "Missing levels must not silently reuse another level",
  );
  assert.throws(() => innerWayDefinitionForSoloLevel(definition, 1.5), RangeError);

  const eonpourStats = (level) =>
    calculateStatsWithEffects(
      emptyStats,
      innerWayDefinitionForSoloLevel(innerWayDefinitions.Eonpour, level).effect.EonpourT2.effect,
      0,
    ).rawStats;
  close(eonpourStats(16).minPhys, 74.4, "Solo Level 16 must use source index 15");
  close(eonpourStats(17).minPhys, 77.9, "Solo Level 17 must use source index 16");

  const profiles = (await server.ssrLoadModule("/data/breakthrough.json")).default;
  for (const profile of Object.values(profiles)) {
    for (const entry of Object.values(innerWayDefinitions)) {
      const resolved = innerWayDefinitionForSoloLevel(entry, profile.soloLevel);
      for (const tier of Object.values(resolved.effect)) {
        for (const effect of tier.effect ?? []) {
          for (const amount of Object.values(effect.rawStat ?? {}))
            assert.ok(
              typeof amount === "number" && Number.isFinite(amount),
              "Worker effects must contain resolved numeric stats",
            );
        }
      }
    }
  }

  const { buildPresetRotationBundle } = await server.ssrLoadModule("/src/App.tsx");
  const path = (await server.ssrLoadModule("/data/path.json")).default.bamboocutKite;
  const build = (breakthrough) =>
    buildPresetRotationBundle(
      {
        pathId: "bamboocutKite",
        martialArts: ["heavenwill", "skygrasp"],
        breakthrough,
        rotation: { name: "Solo Level probe", steps: [{ type: "skill", skill: "HeavenShaker" }] },
        food: "None",
        divinecraft: "None",
        script: "None",
        globalDebuffs: {},
        skillOverrides: {},
      },
      path.defaultBuild,
    );
  const bundles = ["16", "17"].map(build);
  const t2Rules = (bundle) => bundle.timeline.innerWayRules.filter((rule) => rule.tier === 2 && rule.effect.rawStat);
  assert.notDeepEqual(
    t2Rules(bundles[0]),
    t2Rules(bundles[1]),
    "The production preset worker bundle must resolve the selected Solo Level",
  );
  assert.deepEqual(
    bundles[0].timeline.setupEffects.filter((effect) => effect.statStage === "talent"),
    bundles[1].timeline.setupEffects.filter((effect) => effect.statStage === "talent"),
    "Breakthroughs with the same talent rank must retain identical martial-art talents",
  );
  console.log(
    "Inner Way Solo Level selection, raw-stat formulas, overrides, and production worker bundle checks passed.",
  );
} finally {
  await server.close();
}
