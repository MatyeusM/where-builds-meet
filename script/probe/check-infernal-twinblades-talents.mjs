import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createServer } from "vite";

const server = await createServer({
  configFile: false,
  server: { middlewareMode: true },
  appType: "custom",
  logLevel: "silent",
});
const readJson = async (path) => JSON.parse(await readFile(path, "utf8"));
const cast = (skill) => ({ type: "skill", skill });
const delay = (duration) => ({ type: "event", event: "Delay", duration });
const close = (actual, expected, message) =>
  assert(Math.abs(actual - expected) < 1e-8, `${message}: ${actual} != ${expected}`);

try {
  const { buildRotationTimeline } = await server.ssrLoadModule("/src/calculations/rotationTimeline.ts");
  const { martialArtEffectsForRank } = await server.ssrLoadModule("/src/data/martialArtTalents.ts");
  const { calculateStatsWithEffects } = await server.ssrLoadModule("/src/calculations/statEffects.ts");
  const { calculateRotationBaseline } = await server.ssrLoadModule("/src/calculations/rotationCalculator.ts");
  const { calculateDerivedStats } = await server.ssrLoadModule("/src/calculations/effectiveStats.ts");
  const { calculateDamageBreakdown } = await server.ssrLoadModule("/src/calculations/damage.ts");
  const { emptyStats } = await server.ssrLoadModule("/src/data/statDefinitions.ts");
  const general = await readJson("data/skill/general.json");
  const talent = await readJson("data/martial-art/infernal-twinblades.json");
  const effects = {
    ...(await readJson("data/buff/bamboocut-kite.json")),
    ...(await readJson("data/buff/bamboocut-wind.json")),
    ...(await readJson("data/buff/mystic.json")),
    Existing: { duration: 10 },
    Direct: { duration: 10 },
    Indirect: { duration: 10 },
    Listener: { duration: 10 },
    Permanent: {},
    NoRefresh: { duration: 10, refresh: false, maxStack: 5 },
    Enemy: { duration: 10 },
  };
  const apply = (value, extra = {}) => ({ type: "apply", target: "self", value, time: 0, ...extra });
  const skills = {
    ...general,
    // Deliberately long, ordinary cooldown isolates the reset from future charge semantics.
    AddledMind: { castTime: 0, cooldown: 100, action: [] },
    Observe: { castTime: 0, action: [{ type: "damage", phyCoef: 1, time: 0 }] },
    Ordinary: { castTime: 0, action: [apply("Existing"), apply("Direct"), apply("NoRefresh")] },
    ProbeDodge: {
      castTime: 0,
      tags: ["PerfectDodge"],
      action: [
        apply("Direct", { duration: 5 }),
        apply("Permanent"),
        apply("NoRefresh"),
        apply("Enemy", { target: "target" }),
        { type: "trigger", value: "Helper", time: 0 },
      ],
    },
    Helper: {
      castTime: 0,
      damageGroup: { id: "SeparateOwner", name: "Separate Owner" },
      action: [{ type: "trigger", value: "NestedHelper", time: 1 }],
    },
    NestedHelper: {
      castTime: 0,
      tags: ["Triggered"],
      action: [apply("Indirect"), { type: "damage", phyCoef: 1, time: 0 }],
    },
    Extend: {
      castTime: 0,
      tags: ["PerfectDodge"],
      action: [{ type: "extend", target: "self", value: "Direct", duration: 2, time: 0 }],
    },
    EmptyDodge: { castTime: 0, tags: ["PerfectDodge"], action: [] },
  };
  const setupEffects = martialArtEffectsForRank({ infernalTwinblades: talent }, ["infernalTwinblades"], 13);
  const build = (steps, extra = {}) =>
    buildRotationTimeline({
      rotation: { name: "Infernal Twinblades talent probe", steps },
      skills,
      effectDefinitions: effects,
      eventDefinitions: {},
      dots: {},
      innerWayConditions: ["Etherwrath4P", "BreakingPointT6", "Mystery"],
      innerWayRules: [],
      setupEffects,
      weapons: ["infernalTwinblades"],
      ...extra,
    });
  const observed = (rows) => rows.filter((row) => row.step.skill === "Observe");
  const buff = (row, name) => row.buffs.find((entry) => entry.name === name);

  for (const dodge of ["PerfectDodge", "PerfectDodgeCancel"]) {
    for (const enabled of [false, true]) {
      const [row] = observed(build([cast(dodge), cast("Observe")], { setupEffects: enabled ? setupEffects : [] }));
      for (const name of ["Etherwrath", "Disintegration", "MysteryDMGBoost"]) {
        close(buff(row, name).expiresAt, effects[name].duration * (enabled ? 1.4 : 1), `${dodge} ${name} duration`);
      }
    }
  }
  for (const procRoll of [undefined, () => 0.25]) {
    const rows = build(
      [
        cast("Ordinary"),
        delay(1),
        cast("ProbeDodge"),
        delay(1),
        cast("Observe"),
        cast("Extend"),
        cast("Observe"),
        delay(11),
        cast("Observe"),
      ],
      {
        procRoll,
        setupEffects: [
          ...setupEffects,
          {
            trigger: {
              event: "damage",
              requirement: [{ target: "skillTag", value: "Triggered" }],
              action: apply("Listener"),
            },
          },
        ],
      },
    );
    const [first, extended, later] = observed(rows);
    close(buff(first, "Direct").expiresAt, 8, "Explicit application duration is scaled once");
    close(
      buff(first, "Indirect").expiresAt,
      16,
      "Nested triggered buff inherits original cast tags across damage ownership",
    );
    close(buff(first, "Listener").expiresAt, 16, "On-damage trigger application inherits the same buff source");
    close(buff(first, "Existing").expiresAt, 10, "Unrelated active buff is unchanged");
    close(buff(first, "NoRefresh").expiresAt, 10, "Non-refreshing stack application preserves expiry");
    assert.equal(buff(first, "Permanent").expiresAt, undefined);
    close(first.debuffs.find((entry) => entry.name === "Enemy").expiresAt, 11, "Debuffs are unchanged");
    close(buff(extended, "Direct").expiresAt, 10, "Explicit extensions are not multiplied");
    assert(!buff(later, "Existing") && !buff(later, "Direct"), "Ordinary expirations still remove buffs");
    assert(
      buff(later, "Indirect") && buff(later, "Listener"),
      "Extended indirect buffs remain active past base expiry",
    );
    assert.deepEqual(
      rows.find((row) => row.step.skill === "NestedHelper").skill.tags,
      ["Triggered"],
      "Buff origin does not alter damage tags",
    );
  }

  const resetRows = build([
    cast("AddledMind"),
    cast("PerfectDodgeCancel"),
    cast("AddledMind"),
    delay(29),
    cast("PerfectDodge"),
    cast("Observe"),
    delay(0.5),
    cast("PerfectDodgeCancel"),
    cast("AddledMind"),
    delay(1),
    cast("PerfectDodgeCancel"),
    cast("AddledMind"),
  ]);
  assert.deepEqual(
    resetRows.filter((row) => row.step.skill === "AddledMind").map((row) => row.startTime),
    [0, 0, 30, 130],
    "Reset is immediate, shared across dodge variants, and available exactly at 30 seconds",
  );
  close(
    buff(observed(resetRows)[0], "Etherwrath").expiresAt,
    29 + effects.Etherwrath.duration * 1.4,
    "Duration bonus remains active during reset cooldown",
  );
  const unenhanced = build([cast("AddledMind"), cast("PerfectDodgeCancel"), cast("AddledMind")], { setupEffects: [] });
  assert.equal(unenhanced.at(-1).startTime, 100, "Without talent a dodge cannot reset the skill");
  const empty = build([cast("AddledMind"), cast("EmptyDodge"), cast("AddledMind")]);
  assert.equal(empty.at(-1).startTime, 0, "Start trigger runs even for skills without actions");
  assert.deepEqual(
    empty.find((row) => row.step.skill === "EmptyDodge").actions,
    [],
    "Lifecycle trigger is not a synthetic displayed action",
  );
  const waiting = build([cast("AddledMind"), cast("AddledMind")], {
    skills: {
      ...skills,
      AddledMind: { ...skills.AddledMind, action: [{ type: "trigger", value: "DelayedDodge", time: 0 }] },
      DelayedDodge: { castTime: 0, action: [{ type: "trigger", value: "PerfectDodgeCancel", time: 5 }] },
    },
  });
  assert.equal(
    waiting.find((row) => row.rotationIndex === 1).startTime,
    5,
    "Triggered dodge wakes a pending cast before its old cooldown",
  );

  const unconditional = setupEffects.filter((effect) => !effect.requirement);
  for (const [agility, bonus] of [
    [0, 0],
    [140, 36.96],
    [280, 73.92],
    [560, 73.92],
  ]) {
    const sheet = calculateStatsWithEffects({ ...emptyStats, agility, minPhys: 100, maxPhys: 1000 }, unconditional, 0);
    close(sheet.stats.minPhys, 100 + bonus, "Agility talent scales and caps at the datamined rate");
  }
  for (const [baseMin, penetration] of [
    [0, 6.5856],
    [102, 13.44],
    [230, 22],
    [500, 22],
  ]) {
    const sheet = calculateStatsWithEffects(
      { ...emptyStats, minBamboocut: baseMin, maxBamboocut: 1000 },
      [...unconditional, { statStage: "food", effectiveStat: { minBamboocut: 100 } }],
      0,
      ["infernalTwinblades"],
    );
    close(sheet.rawStats.minBamboocut, baseMin + 98, "Flat Min Bamboocut enters raw stats once");
    close(sheet.rawStats.maxBamboocut, 1196, "Flat Max Bamboocut enters raw stats once");
    close(
      sheet.stats.bamboocutPenetration,
      penetration,
      "Penetration includes flat talents and excludes effective food",
    );
  }
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
  const calculate = (minPhys, active, extra = {}) => {
    const stats = { ...emptyStats, agility: 280, minPhys, maxPhys: 2000, precision: 1, crit: 1, ...extra.stats };
    return calculateRotationBaseline({
      timeline: {
        rotation: {
          name: "Flamelash",
          steps: [
            ...(active ? [{ type: "event", event: "Buff", before: { action: "start" }, buff: "Flamelash" }] : []),
            cast("Hit"),
          ],
        },
        skills: {
          Hit: {
            castTime: 1,
            tags: ["MartialArts", "InfernalTwinblades"],
            action: [{ type: "damage", phyCoef: 1, time: 0 }],
          },
        },
        eventDefinitions: { Buff: { action: [{ type: "apply", target: "self", time: 0 }] } },
        dots: {},
        effectDefinitions: effects,
        innerWayConditions: [],
        innerWayRules: [],
        setupEffects,
        weapons: ["infernalTwinblades"],
        ...extra.timeline,
      },
      startAnchor: { rowId: active ? "rotation-1" : "rotation-0" },
      stats,
      derivedStats: calculateDerivedStats(stats, 0),
      enemy,
      attunement: {},
      weapons: ["infernalTwinblades"],
      statPriority: [],
      attunementPriority: [],
      innerWayPriority: [],
      setupComparisons: {},
    });
  };
  for (const [minPhys, bonus] of [
    [0, 0.05],
    [375, 0.175],
    [750, 0.3],
    [1000, 0.3],
  ]) {
    const ordinary = calculate(minPhys, false);
    const enhanced = calculate(minPhys, true);
    const criticalRate = Object.values(ordinary.actionBreakdowns)[0].outcomeRates.critical;
    close(
      enhanced.metrics.totalDamage - ordinary.metrics.totalDamage,
      ((minPhys + 73.92 + 2000) / 2) * criticalRate * bonus,
      "Flamelash gates critical damage and scales from raw attack before the Agility talent",
    );
  }
  close(
    calculate(750, true, { stats: { crit: 0 } }).metrics.totalDamage,
    calculate(750, false, { stats: { crit: 0 } }).metrics.totalDamage,
    "Flamelash does not increase normal-hit damage",
  );
  const lifecycle = calculate(750, false, {
    timeline: {
      rotation: {
        name: "Flamelash lifecycle",
        steps: [
          cast("Hit"),
          cast("Enter"),
          cast("Hit"),
          delay(1),
          cast("Hit"),
          cast("Enter"),
          cast("Hit"),
          cast("Exit"),
          cast("Hit"),
        ],
      },
      skills: {
        Hit: { castTime: 1, action: [{ type: "damage", phyCoef: 1, time: 0 }] },
        Enter: { castTime: 0, action: [apply("Flamelash", { duration: 2 })] },
        Exit: { castTime: 0, action: [{ type: "consume", target: "self", value: "Flamelash", stack: "all", time: 0 }] },
      },
    },
  });
  const damage = lifecycle.timeline
    .filter((row) => row.step.skill === "Hit")
    .map((row) => lifecycle.actionBreakdowns[`${row.id}:0`].total);
  assert(damage[1] > damage[0] && damage[3] > damage[0], "Existing status applications enable Flamelash damage");
  close(damage[2], damage[0], "Expiration removes the bonus at its exact boundary");
  close(damage[4], damage[0], "Consumption removes the bonus before the following hit");

  const attributeStats = {
    ...emptyStats,
    precision: 1,
    minBellstrike: 100,
    maxBellstrike: 100,
    minStonesplit: 100,
    maxStonesplit: 100,
    minSilkbind: 100,
    maxSilkbind: 100,
    minBamboocut: 100,
    maxBamboocut: 100,
  };
  const attributeDamage = calculateDamageBreakdown(
    { phyCoef: 0, attrCoef: 1 },
    {
      stats: attributeStats,
      derivedStats: calculateDerivedStats(attributeStats, 0, {}, ["infernalTwinblades"]),
      enemy,
      attunement: {},
      skillTags: ["MartialArts", "InfernalTwinblades"],
      weapons: ["infernalTwinblades"],
      buffs: [],
      effects: talent.talent[13].find((entry) => entry.name === "Attr. Attack DMG Up").effect,
    },
  );
  close(attributeDamage.bellstrike, 100, "Non-primary attribute damage is retained");
  close(attributeDamage.stonesplit, 100, "Stonesplit damage remains a normal attribute channel");
  close(attributeDamage.silkbind, 100, "Silkbind damage remains a normal attribute channel");
  close(attributeDamage.bamboocut, 150, "Bamboocut receives exactly one 50% primary multiplier");
  console.log(
    "Infernal Twinblades: rank-13 stat scaling, conditional Flamelash damage, status lifecycle, attribute channels, dodge durations, and charge reset passed.",
  );
} finally {
  await server.close();
}
