import assert from "node:assert/strict";
import { createServer } from "vite";
import { readFile } from "node:fs/promises";

const server = await createServer({
  configFile: false,
  server: { middlewareMode: true },
  appType: "custom",
  logLevel: "silent",
});
try {
  const { emptyStats } = await server.ssrLoadModule("/src/data/statDefinitions.ts");
  const { calculateStatsWithEffects, calculateStatsWithOverrides, calculateActionStats } = await server.ssrLoadModule(
    "/src/calculations/statEffects.ts",
  );
  const { calculateRotationBaseline, calculateRotationComparisons } = await server.ssrLoadModule(
    "/src/calculations/rotationCalculator.ts",
  );
  const { resolveActionStatContext } = await server.ssrLoadModule("/src/calculations/actionStats.ts");
  const food = {
    ...JSON.parse(await readFile("data/food.json", "utf8")).SimmeringFishSlices.effect,
    statStage: "food",
  };
  const talent = { statStage: "talent", stat: { minPhys: { formula: { source: "minPhys", multiplier: 0.1 } } } };
  const base = { ...emptyStats, minPhys: 1000, maxPhys: 2000, precision: 1 };
  const sheet = calculateStatsWithEffects(base, [talent, food], 0, []);
  assert.equal(sheet.rawStats.minPhys, 1000);
  assert.equal(sheet.stats.minPhys, 1220);
  assert.equal(sheet.stats.maxPhys, 2240);
  assert.equal(sheet.stats.effectiveMinPhys, 1220);
  assert.equal(sheet.stats, sheet.derivedStats, "Derived fields live in the same object");
  assert.deepEqual(sheet, calculateStatsWithEffects(base, [food, talent], 0, []));
  const twoTalents = calculateStatsWithEffects(base, [talent, talent], 0, []);
  assert.equal(twoTalents.stats.minPhys, 1200, "Both talents must read raw 1000, not each other's output");
  const capped = calculateStatsWithEffects({ ...base, directCrit: 0.25 }, [], 0, []);
  assert.equal(capped.rawStats.directCrit, 0.25);
  assert.equal(capped.stats.directCrit, 0.2);
  assert.equal(calculateActionStats(capped.stats, [{ stat: { directCrit: -0.02 } }], 0, []).directCrit, 0.2);
  assert.equal(calculateActionStats(capped.stats, [{ stat: { directCrit: -0.1 } }], 0, []).directCrit, 0.15);
  const override = calculateStatsWithOverrides(base, [talent, food], 0, { minPhys: 1500 }, []);
  assert.ok(Math.abs(override.stats.minPhys - 1500) < 1e-5, "Stored final-value overrides remain honored");
  const enemy = {
    level: 96,
    defense: 0,
    physicalResistance: 0,
    bellstrikeResistance: 0,
    stonesplitResistance: 0,
    silkbindResistance: 0,
    bamboocutResistance: 0,
    judgementResistance: 0,
  };
  const definitions = {
    Global: { duration: 5, maxStack: 1, effect: [{ effect: { stat: { minPhys: 50, maxPhys: 50 } } }] },
    Temporary: { duration: 0.5, maxStack: 1, effect: [{ effect: { stat: { minPhys: 100, maxPhys: 100 } } }] },
  };
  const setupEffects = [
    food,
    { requirement: [{ target: "skillTag", value: "Charged" }], stat: { minPhys: 10, maxPhys: 10 } },
  ];
  const plainSheet = calculateStatsWithEffects(base, [food], 0, []);
  const bundle = {
    stats: plainSheet.stats,
    rawStats: plainSheet.rawStats,
    baseStats: base,
    derivedStats: plainSheet.stats,
    enemy,
    weapons: [],
    attunement: {},
    startAnchor: { rowId: "rotation-0" },
    statPriority: [],
    attunementPriority: [],
    innerWayPriority: [],
    setupComparisons: {},
    timeline: {
      rotation: { name: "Stat stages", steps: [{ type: "skill", skill: "Hit" }] },
      skills: {
        Hit: {
          name: "Hit",
          castTime: 1,
          tags: ["DirectDamage", "Charged"],
          modifier: [],
          action: [
            { type: "damage", phyCoef: 1, time: 0 },
            { type: "apply", target: "self", value: "Temporary", time: 0.1 },
            { type: "damage", phyCoef: 1, time: 0.2 },
            { type: "damage", phyCoef: 1, time: 0.8 },
            { type: "heal", phyCoef: 1, time: 1 },
          ],
        },
      },
      setupEffects,
      eventDefinitions: {},
      dots: {},
      effectDefinitions: definitions,
      innerWayRules: [],
      innerWayConditions: [],
      weapons: [],
      initialBuffs: [{ name: "Global", stack: 1 }],
    },
  };
  const result = calculateRotationBaseline(bundle);
  const entries = result.baseline;
  const damages = entries
    .filter((entry) => entry.action.type === "damage")
    .map((entry) => result.actionBreakdowns[entry.id].total);
  assert.deepEqual(damages, [1740, 1840, 1740], "Food survives skill/global/action stages and temporary expiration");
  assert.equal(entries[0].context.stats.minPhys, 1180, "Skill baseline includes the global contribution exactly once");
  const healed = entries.find((entry) => entry.action.type === "heal");
  assert.equal(result.actionBreakdowns[healed.id].healing.total, 1740);
  const during = resolveActionStatContext(entries[1].context);
  const repeat = resolveActionStatContext({ ...entries[1].context, effects: [...entries[1].context.effects] });
  assert.equal(during.stats, repeat.stats, "Unchanged numerical combat contributions reuse the resolved action stats");
  const variants = { ...bundle, setupComparisons: { food: [{ label: "None", setupEffects: setupEffects.slice(1) }] } };
  const compared = calculateRotationComparisons(variants, result);
  assert.equal(
    compared.setupComparisons.food[0].dpsDifference,
    -540,
    "Food removal adjusts a copied sheet without losing skill/global bonuses",
  );
  assert.equal(bundle.stats.minPhys, 1120, "Baseline sheet remains immutable");
  // Real Kite talent formulas: resource-conditioned modifiers must not erase food or skill bonuses.
  const gauntlets = JSON.parse(await readFile("data/martial-art/heavenwill-gauntlets.json", "utf8"));
  const rope = JSON.parse(await readFile("data/martial-art/skygrasp-rope-dart.json", "utf8"));
  const martial = [...gauntlets.talent, ...rope.talent].flatMap((t) =>
    t.effect.map((effect) => ({ ...effect, statStage: "talent" })),
  );
  for (const withFood of [false, true]) {
    const setup = [...martial, ...(withFood ? [food] : [])];
    const prepared = calculateStatsWithEffects(
      base,
      setup.filter((effect) => !effect.requirement),
      0,
      [],
    );
    const kiteBundle = {
      ...bundle,
      stats: prepared.stats,
      rawStats: prepared.rawStats,
      derivedStats: prepared.stats,
      timeline: {
        ...bundle.timeline,
        setupEffects: setup,
        initialResources: { HeavensWill: 1 },
        skills: { Hit: { ...bundle.timeline.skills.Hit, tags: ["DirectDamage", "Falcon"] } },
      },
    };
    const kite = calculateRotationBaseline(kiteBundle);
    const context = resolveActionStatContext(kite.baseline[0].context);
    assert.equal(context.stats.minPhys, 1050 + (withFood ? 120 : 0));
    assert.equal(context.stats.effectiveCritDmgBonus, 0.3, "Talent source remains raw, independent of food and buffs");
  }
  console.log(
    "Stat stages passed: raw talent inputs, order independence, food retention, global baseline, expiration, caps, overrides, cache reuse, comparison deltas, healing and actual Kite talents.",
  );
} finally {
  await server.close();
}
