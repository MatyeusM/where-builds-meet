import assert from "node:assert/strict";
import { createServer } from "vite";

const server = await createServer({
  configFile: false,
  server: { middlewareMode: true },
  appType: "custom",
  logLevel: "silent",
});
try {
  const { buildRotationTimeline } = await server.ssrLoadModule("/src/calculations/rotationTimeline.ts");
  const { calculateRotationBaseline, calculateSimulatedRotationRun } = await server.ssrLoadModule(
    "/src/calculations/rotationCalculator.ts",
  );
  const { simulateRotation } = await server.ssrLoadModule("/src/calculations/simulationCalculator.ts");
  const { calculateDerivedStats } = await server.ssrLoadModule("/src/calculations/effectiveStats.ts");
  const { emptyStats } = await server.ssrLoadModule("/src/data/statDefinitions.ts");
  const { innerWayAvailableForTag } = await server.ssrLoadModule("/src/data/innerWayDefinitions.ts");
  const way = (await server.ssrLoadModule("/data/innerway/fivefold-bleed.json")).default;
  const dots = (await server.ssrLoadModule("/data/dot/innerway.json")).default;
  // Retain exact-cadence regression coverage; the battle-grid probe tests the authored approximation.
  const exactDots = structuredClone(dots);
  delete exactDots.WeepingBlood.periodic.expectedTickAlignment;
  const { PiercingDamage: piercingDefinition } = (await server.ssrLoadModule("/data/skill/general.json")).default;
  // Isolate independent application histories; the full feedback chain is tested
  // separately with the unmodified skill in check-fivefold-bleed-loops.mjs.
  const PiercingDamage = {
    ...piercingDefinition,
    tags: piercingDefinition.tags.filter((tag) => tag !== "DirectDamage"),
  };
  const rule = { source: "FivefoldBleed", tier: 0, effect: {}, trigger: way.effect.FivefoldBleedT0.trigger[0] };
  const close = (actual, expected, message) =>
    assert.ok(Math.abs(actual - expected) < 1e-8, `${message}: ${actual} != ${expected}`);
  const inputFor = (times, tags = ["DirectDamage"]) => ({
    rotation: { name: "Bleed probe", steps: [{ type: "skill", skill: "Hits" }] },
    skills: {
      PiercingDamage,
      Hits: {
        name: "Hits",
        castTime: Math.max(...times) + 7,
        tags,
        action: times.map((time) => ({ type: "damage", phyCoef: 1, time })),
      },
    },
    dots: exactDots,
    effectDefinitions: exactDots,
    eventDefinitions: {},
    innerWayConditions: ["FivefoldBleedT0"],
    innerWayRules: [rule],
    setupEffects: [],
    weapons: ["panaceaFan", "soulshadeUmbrella"],
  });
  const ticks = (rows) => rows.filter((row) => row.kind === "dot");
  const times = (rows) => ticks(rows).map((row) => Math.round(row.startTime * 100) / 100);
  const single = buildRotationTimeline(inputFor([0]), () => 0);
  assert.deepEqual(times(single), [1.01, 2.01, 3.01, 4.01]);
  assert.equal(ticks(single)[0].actions[0].damageScale, 1);
  const refreshed = buildRotationTimeline(inputFor([0, 1.51]), () => 0);
  assert.deepEqual(times(refreshed), [1.01, 2.01, 3.01, 4.01, 5.01, 6.01]);
  assert.deepEqual(
    ticks(refreshed).map((row) => row.actions[0].damageScale),
    [1, 1, 1, 1, 1, 1],
  );
  assert.equal(ticks(buildRotationTimeline(inputFor([0, 1]), () => 0.1)).length, 0, "Roll at 10% boundary must fail.");
  assert.equal(
    ticks(buildRotationTimeline(inputFor([0], ["DOT"]), () => 0)).length,
    0,
    "DOT must not recursively proc the bleed.",
  );
  const capped = buildRotationTimeline(inputFor([0, 0.1, 0.2, 0.3, 0.4, 4.5]), () => 0);
  const bursts = (rows) => rows.filter((row) => row.step.skill === "PiercingDamage");
  assert.deepEqual(
    bursts(capped).map((row) => row.startTime),
    [0.4],
  );
  assert.ok(ticks(capped).every((row) => row.actions[0].damageScale === 1));
  assert.deepEqual(
    times(capped),
    [5.51, 6.51, 7.51, 8.51],
    "Consumption cancels old ticks; the next application starts fresh.",
  );
  assert.ok(
    bursts(capped)[0].debuffs.every((effect) => effect.name !== "WeepingBlood"),
    "The burst must see the consumed state.",
  );
  const tenHits = buildRotationTimeline(inputFor(Array(10).fill(0)), () => 0);
  assert.equal(bursts(tenHits).length, 2, "Ten successful simultaneous applications must produce exactly two bursts.");
  assert.equal(ticks(tenHits).length, 0);
  assert.ok(
    tenHits.every((row) =>
      Object.values(row.actionStates).every((state) =>
        state.debuffs.every((effect) => effect.name !== "WeepingBlood" || effect.stack < 5),
      ),
    ),
  );
  assert.deepEqual(
    times(buildRotationTimeline(inputFor([0, 5]), () => 0)),
    [1.01, 2.01, 3.01, 4.01, 6.01, 7.01, 8.01, 9.01],
  );
  assert.ok(innerWayAvailableForTag("FivefoldBleed", "SilkbindDeluge"));

  // Exhaust all proc histories independently of the expected-state algorithm.
  for (const hitTimes of [[0], [0, 1.51], [0, 0, 0, 0, 0, 0], [0, 1.01, 4.7, 5, 6.2, 12]]) {
    const input = inputFor(hitTimes);
    const expectedTicks = new Map();
    const expectedBursts = new Map();
    for (let mask = 0; mask < 2 ** hitTimes.length; mask++) {
      let index = 0;
      let probability = 1;
      const rolled = buildRotationTimeline(input, () => {
        const success = (mask & (1 << index++)) !== 0;
        probability *= success ? 0.1 : 0.9;
        return success ? 0 : 0.99;
      });
      for (const row of ticks(rolled)) {
        const key = Math.round(row.startTime * 10000);
        const current = expectedTicks.get(key) ?? { stack: 0, probability: 0 };
        current.stack += probability * row.actions[0].damageScale;
        current.probability += probability;
        expectedTicks.set(key, current);
      }
      for (const row of bursts(rolled)) {
        const key = Math.round(row.startTime * 10000);
        expectedBursts.set(key, (expectedBursts.get(key) ?? 0) + probability);
      }
    }
    const expected = ticks(buildRotationTimeline(input));
    assert.equal(expected.length, expectedTicks.size);
    for (const row of expected) {
      const oracle = expectedTicks.get(Math.round(row.startTime * 10000));
      close(row.actions[0].damageScale, oracle.stack, "Exact expected unscaled tick damage");
      close(row.actions[0].hitProbability, oracle.probability, "Exact expected hit count");
    }
    const actualBursts = new Map();
    for (const row of bursts(buildRotationTimeline(input))) {
      const key = Math.round(row.startTime * 10000);
      actualBursts.set(key, (actualBursts.get(key) ?? 0) + row.actions[0].hitProbability);
      close(row.actions[0].damageScale, row.actions[0].hitProbability, "One burst per threshold branch");
    }
    assert.equal(actualBursts.size, expectedBursts.size);
    for (const [time, probability] of expectedBursts)
      close(actualBursts.get(time), probability, "Exact expected burst count");
  }

  const stats = { ...emptyStats, minPhys: 100, maxPhys: 100, minSilkbind: 10000, maxSilkbind: 10000, precision: 1 };
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
  const bundle = {
    timeline: inputFor([0]),
    startAnchor: { rowId: "rotation-0" },
    stats,
    attunement: {},
    enemy,
    derivedStats: calculateDerivedStats(stats, 0),
    weapons: ["panaceaFan", "soulshadeUmbrella"],
    statPriority: [],
    attunementPriority: [],
    innerWayPriority: [],
    setupComparisons: {},
  };
  const baseline = calculateRotationBaseline(bundle);
  const fiveHitBundle = { ...bundle, timeline: inputFor(Array(5).fill(0)) };
  const fiveHitExpected = calculateRotationBaseline(fiveHitBundle);
  close(
    fiveHitExpected.metrics.breakdown.skills.find((skill) => skill.id === "PiercingDamage").damage,
    100 * 0.1 ** 5,
    "Expected burst has only its physical coefficient",
  );
  const fiveHitSimulated = calculateSimulatedRotationRun(fiveHitBundle, () => 0);
  const burstResults = fiveHitSimulated.resolvedSequence.filter(
    ({ entry }) => entry.action.type === "damage" && !entry.context.skillTags.includes("DirectDamage"),
  );
  assert.equal(burstResults.length, 1);
  close(burstResults[0].breakdown.total, 100, "Burst deals 100% physical coefficient with no attribute contribution");
  assert.equal(burstResults[0].entry.context.isDot, false, "Burst does not receive DOT-only multipliers");

  const manualInput = inputFor([0]);
  manualInput.skills.Hits.castTime = 7;
  manualInput.skills.Hits.action = [
    { type: "apply", target: "target", value: "WeepingBlood", stack: 4, time: 0 },
    { type: "apply", target: "target", value: "WeepingBlood", stack: 1, time: 0.5 },
    { type: "damage", phyCoef: 1, time: 0.5 },
  ];
  manualInput.innerWayRules = [];
  const manual = buildRotationTimeline(manualInput);
  assert.equal(bursts(manual).length, 1, "Ordinary apply actions use the same threshold rule");
  assert.equal(ticks(manual).length, 0, "Ordinary applications cancel pending DOT ticks atomically");
  assert.ok(
    manual
      .find((row) => row.id === "rotation-0")
      .actionStates[2].debuffs.every((effect) => effect.name !== "WeepingBlood"),
  );
  const generic = {
    ...manualInput,
    skills: {
      Burst: PiercingDamage,
      Hits: {
        name: "Generic threshold",
        castTime: 7,
        action: [
          { type: "apply", target: "self", value: "ThresholdBuff", stack: 2, time: 0 },
          { type: "apply", target: "self", value: "ThresholdBuff", stack: 2, time: 0.5 },
          { type: "damage", phyCoef: 1, time: 0.5 },
        ],
      },
    },
    dots: {},
    effectDefinitions: {
      ThresholdBuff: { duration: 5, maxStack: 3, onMaxStack: { consume: "all", trigger: "Burst" } },
    },
  };
  const genericRows = buildRotationTimeline(generic);
  assert.equal(
    genericRows.filter((row) => row.step.skill === "Burst").length,
    1,
    "Thresholds use the data-defined cap and skill, including overflow",
  );
  assert.ok(
    genericRows
      .find((row) => row.id === "rotation-0")
      .actionStates[2].buffs.every((effect) => effect.name !== "ThresholdBuff"),
  );
  const uncappedInput = inputFor([0, 0.1, 0.2, 0.3, 0.4, 4.5]);
  const { onMaxStack: _threshold, ...ordinaryDot } = dots.WeepingBlood;
  uncappedInput.dots = { WeepingBlood: ordinaryDot };
  uncappedInput.effectDefinitions = uncappedInput.dots;
  const ordinaryRows = buildRotationTimeline(uncappedInput, () => 0);
  assert.equal(bursts(ordinaryRows).length, 0);
  assert.ok(
    ticks(ordinaryRows).every(
      (row) =>
        row.actions[0].damageScale === 1 &&
        row.actionStates[0].debuffs.find((effect) => effect.name === "WeepingBlood")?.stack === 5,
    ),
    "Effects without a threshold rule retain capped stacks without multiplying tick damage",
  );
  assert.equal(times(ordinaryRows).at(-1), 9.01, "Ordinary capped applications still refresh duration");
  const bleed = baseline.metrics.breakdown.skills.find((skill) => skill.id === "WeepingBlood");
  close(bleed.damage, 4 * 2 * 0.1, "Expected physical-only damage");
  close(bleed.hits, 4 * 0.1, "Expected tick count");
  const splitCasts = calculateRotationBaseline({
    ...bundle,
    timeline: {
      ...bundle.timeline,
      rotation: {
        name: "Two bleed sources",
        steps: [
          { type: "skill", skill: "First" },
          { type: "skill", skill: "Second" },
        ],
      },
      skills: {
        First: {
          name: "First",
          castTime: 1.51,
          tags: ["DirectDamage"],
          action: [{ type: "damage", phyCoef: 1, time: 0 }],
        },
        Second: {
          name: "Second",
          castTime: 7,
          tags: ["DirectDamage"],
          action: [{ type: "damage", phyCoef: 1, time: 0 }],
        },
      },
    },
  });
  close(
    splitCasts.metrics.breakdown.casts.find((cast) => cast.skillId === "First").damage,
    100,
    "Earlier cast excludes Inner Way damage",
  );
  close(
    splitCasts.metrics.breakdown.casts.find((cast) => cast.skillId === "Second").damage,
    100,
    "Refreshing cast excludes Inner Way damage",
  );
  close(
    splitCasts.metrics.breakdown.casts.find((cast) => cast.skillId === "FivefoldBleed").damage,
    0.09 * 8 + 0.09 * 8 + 0.01 * 12,
    "All refresh histories contribute to the shared Inner Way group",
  );
  const success = calculateSimulatedRotationRun(bundle, () => 0);
  close(
    success.resolvedSequence
      .filter(({ entry }) => entry.context.isDot)
      .reduce((sum, { breakdown }) => sum + breakdown.total, 0),
    8,
    "Rolled bleed damage",
  );
  const noProc = simulateRotation(bundle, 1, () => 0.99);
  close(noProc.runs[0].totalDamage, 100, "Damage-only simulations must rebuild chance-proc timelines");
  const withProc = simulateRotation(bundle, 1, () => 0);
  close(withProc.runs[0].totalDamage, 108, "Simulation must include successful DOTs");

  const system = (await server.ssrLoadModule("/data/system.json")).default;
  const withResources = {
    ...bundle.timeline,
    initialResources: { Vitality: 0 },
    resourceMaximums: { Vitality: 100 },
    innerWayRules: [rule],
    innerWayConditions: [...bundle.timeline.innerWayConditions, "FuryHarvestT3"],
    resourceEvents: system.resourceEvents,
  };
  const resourceRows = buildRotationTimeline(withResources);
  close(
    ticks(resourceRows).at(-1).resources.Vitality,
    2.1 + 2.1 * 0.1,
    "Expected base recovery shares its cooldown and weights accepted DOT recovery by tick probability",
  );
  const guaranteedResources = buildRotationTimeline(withResources, () => 0);
  close(
    ticks(guaranteedResources).at(-1).resources.Vitality,
    4.2,
    "Simulation resources must use concrete tick hits and the base recovery cooldown",
  );

  const healingInput = {
    ...bundle.timeline,
    skills: {
      Hits: {
        ...bundle.timeline.skills.Hits,
        action: [
          { type: "damage", phyCoef: 1, time: 0 },
          { type: "heal", phyCoef: 1, silkbindCoef: 1, time: 0.5 },
        ],
      },
    },
  };
  let rolls = 0;
  const withHealing = calculateSimulatedRotationRun({ ...bundle, timeline: healingInput }, () => {
    rolls++;
    return rolls === 1 ? 0 : 0.99;
  });
  close(
    withHealing.resolvedSequence
      .filter(({ entry }) => entry.context.isDot)
      .reduce((sum, { breakdown }) => sum + breakdown.total, 0),
    8,
    "Healing feedback must preserve the proc roll",
  );

  const dense = buildRotationTimeline(inputFor(Array.from({ length: 220 }, (_, index) => index * 0.037)));
  assert.ok(ticks(dense).length > 1000, "Dense rotations must retain the union of possible tick cadences");
  assert.ok(
    ticks(dense).at(-1).startTime > 12,
    "Expected branches must not truncate the timeline at the ordinary event budget",
  );
  console.log(
    "Fivefold Bleed chance, atomic threshold bursts, fresh cadence, generic application rules, exhaustive expected-state and simulation checks passed.",
  );
} finally {
  await server.close();
}
