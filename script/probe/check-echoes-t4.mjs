import assert from "node:assert/strict";
import { createServer } from "vite";
const server = await createServer({
  configFile: false,
  server: { middlewareMode: true },
  appType: "custom",
  logLevel: "silent",
});
const cast = (skill) => ({ type: "skill", skill });
const damage = (time, extra = {}) => ({ type: "damage", phyCoef: 1, time, ...extra });
try {
  const load = async (path) => (await server.ssrLoadModule(path)).default;
  const { buildRotationTimeline } = await server.ssrLoadModule("/src/calculations/rotationTimeline.ts");
  const { calculateEditorTimeline } = await server.ssrLoadModule("/src/calculations/editorTimeline.ts");
  const infernal = await load("/data/skill/infernal-twinblades.json");
  const echoes = await load("/data/innerway/echoes-of-oblivion.json");
  const talent = await load("/data/martial-art/infernal-twinblades.json");
  const trigger = echoes.effect.EchoesOfOblivionT4.trigger[0];
  const rule = { source: "EchoesOfOblivion", tier: 4, effect: {}, trigger };
  const spent = [cast("AddledMind"), cast("AddledMind"), cast("AddledMind")];
  const times = (rows) =>
    rows.filter((row) => row.step.skill === "AddledMind" && !row.skipped).map((row) => row.startTime);
  const input = (actions, extra = {}) => ({
    rotation: {
      name: "Echoes T4 charge reset",
      steps: [...spent, cast("Driver"), ...spent, { type: "event", event: "Delay", duration: 30 }],
    },
    skills: {
      ...infernal,
      Driver: { castTime: 0, action: [{ type: "trigger", value: "Hits", time: 0 }] },
      Hits: { castTime: 0, tags: ["Triggered", "DirectDamage"], action: actions },
      ChanceBurst: {
        castTime: 0,
        tags: ["Triggered", "DirectDamage"],
        action: Array.from({ length: 6 }, () => damage(0)),
      },
    },
    effectDefinitions: {},
    dots: {},
    eventDefinitions: {},
    weapons: ["infernalTwinblades", "mortalRopeDart"],
    innerWayConditions: ["EchoesOfOblivionT4"],
    innerWayRules: [rule],
    setupEffects: [],
    ...extra,
  });
  const build = (actions, { procRoll, ...extra } = {}) => buildRotationTimeline(input(actions, extra), procRoll);
  const six = Array.from({ length: 6 }, () => damage(1));
  assert.deepEqual(
    times(build(six)),
    [0, 0, 0, 1, 15, 15],
    "Six same-time hits restore exactly one charge and wake one waiting cast",
  );
  assert.deepEqual(
    times(build(six, { innerWayRules: [], innerWayConditions: [] })),
    [0, 0, 0, 15, 15, 15],
    "Without T4 all three charges recover after 15 seconds",
  );
  assert.deepEqual(times(build(six.slice(1))), [0, 0, 0, 15, 15, 15], "Five hits do not reset a charge");
  assert.deepEqual(
    times(build([0, 0.4, 0.8, 1.2, 1.6, 2].map((time) => damage(time)))),
    [0, 0, 0, 2, 15, 15],
    "The rolling window includes its exact two-second boundary",
  );
  assert.deepEqual(
    times(build([0, 0.4, 0.8, 1.2, 1.6, 2.01].map((time) => damage(time)))),
    [0, 0, 0, 15, 15, 15],
    "Hits older than two seconds cannot complete the threshold",
  );
  assert.deepEqual(
    times(build([...six, ...[9.1, 9.4, 9.7, 10, 10.3, 10.6, 10.9, 11].map((time) => damage(time))])),
    [0, 0, 0, 1, 11, 15],
    "The ten-second cooldown is independent; hits during cooldown remain in the rolling window",
  );
  const repeated = [...six, ...six.map((action) => ({ ...action, time: 1.1 }))];
  assert.deepEqual(
    times(build(repeated)),
    [0, 0, 0, 1, 15, 15],
    "A second rapid burst cannot bypass the trigger cooldown",
  );
  for (const probability of [0, 0.25, 0.999, 1]) {
    assert.deepEqual(
      times(build([...six.slice(1), damage(1, { hitProbability: probability, damageScale: probability })])),
      [0, 0, 0, 15, 15, 15],
      "Probability-weighted rows never complete the expected hit threshold, even at weight one",
    );
  }
  assert.deepEqual(
    times(build(six.map((action) => ({ ...action, damageScale: 0.5 })))),
    [0, 0, 0, 1, 15, 15],
    "Damage scaling alone must not exclude definite hits",
  );
  assert.deepEqual(
    times(build([{ type: "trigger", value: "ChanceBurst", chance: 0.5, time: 1 }])),
    [0, 0, 0, 15, 15, 15],
    "A real expected chance-triggered burst must not reset Addled Mind",
  );
  assert.deepEqual(
    times(build([{ type: "trigger", value: "ChanceBurst", chance: 0.5, time: 1 }], { procRoll: () => 0 })),
    [0, 0, 0, 1, 15, 15],
    "Sampled successful procs consist of actual hits and can reset a charge",
  );
  assert.deepEqual(
    times(build([{ type: "trigger", value: "ChanceBurst", chance: 0.5, time: 1 }], { procRoll: () => 0.9 })),
    [0, 0, 0, 15, 15, 15],
    "Sampled failed procs do not contribute hits",
  );
  assert.deepEqual(
    times(build([...six.slice(1), { type: "heal", phyCoef: 1, time: 1 }])),
    [0, 0, 0, 15, 15, 15],
    "Healing does not complete a damage-hit window",
  );
  const staggered = input(
    six.map((action) => ({ ...action, time: 1 })),
    {
      rotation: {
        name: "Preserve independent timers",
        steps: [
          cast("AddledMind"),
          { type: "event", event: "Delay", duration: 2 },
          cast("AddledMind"),
          { type: "event", event: "Delay", duration: 2 },
          cast("AddledMind"),
          cast("Driver"),
          ...spent,
        ],
      },
    },
  );
  assert.deepEqual(
    times(buildRotationTimeline(staggered)),
    [0, 2, 4, 5, 17, 19],
    "One restored charge must preserve both other recovery times",
  );
  const full = input(six, {
    rotation: {
      name: "No banking at capacity",
      steps: [cast("Driver"), { type: "event", event: "Delay", duration: 2 }, ...spent, cast("AddledMind")],
    },
  });
  assert.deepEqual(
    times(buildRotationTimeline(full)),
    [2, 2, 2, 17],
    "A reset at full capacity cannot bank an extra charge",
  );
  const isolated = {
    ...rule,
    source: "IndependentProbe",
    trigger: { ...trigger, action: [{ type: "addResource", value: "ProbeResets", amount: 1 }] },
  };
  const isolationRows = build(repeated, { innerWayRules: [rule, isolated] });
  assert.equal(isolationRows.at(-1).resources.ProbeResets, 1, "Each trigger owns its own cooldown and hit history");
  const editorInput = input(six);
  const editor = calculateEditorTimeline(editorInput);
  assert.equal(editor.rotation, editorInput.rotation, "Reset-driven waiting must not mutate the saved rotation");
  assert.deepEqual(
    times(editor.timeline),
    [0, 0, 0, 1, 15, 15],
    "Editor and calculation must share the same reset timing",
  );
  // A dodge talent reset must not start or consume the separate T4 cooldown.
  const combined = input(six, {
    rotation: {
      name: "Independent dodge and T4 resets",
      steps: [...spent, cast("Dodge"), cast("AddledMind"), cast("Driver"), cast("AddledMind"), cast("AddledMind")],
    },
    setupEffects: talent.talent[13].flatMap((entry) => entry.effect ?? []),
  });
  combined.skills.Dodge = { castTime: 0, tags: ["PerfectDodge"], action: [] };
  assert.deepEqual(
    times(buildRotationTimeline(combined)),
    [0, 0, 0, 0, 1, 15],
    "Dodge charge restoration and T4 use independent cooldowns",
  );
  console.log(
    "Echoes T4 rolling window, definite-hit filtering, cooldown isolation, charge restoration, and waiting casts passed.",
  );
} finally {
  await server.close();
}
