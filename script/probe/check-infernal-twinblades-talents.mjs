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
  const setupEffects = talent.talent[13].flatMap((entry) => entry.effect ?? []);
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
  console.log(
    "Infernal Twinblades: dodge buff durations, trigger ancestry, refresh behavior, and shared 30-second reset passed.",
  );
} finally {
  await server.close();
}
