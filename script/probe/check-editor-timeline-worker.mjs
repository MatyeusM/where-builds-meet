import assert from "node:assert/strict";
import { createServer } from "vite";

const server = await createServer({
  configFile: false,
  server: { middlewareMode: true },
  appType: "custom",
  logLevel: "silent",
});
try {
  const { calculateEditorTimeline } = await server.ssrLoadModule("/src/calculations/editorTimeline.ts");
  const { pendingEditorTimeline, sameEditorRevision } = await server.ssrLoadModule("/src/editorTimelinePreview.ts");
  const { calculateRotationBaseline } = await server.ssrLoadModule("/src/calculations/rotationCalculator.ts");
  const { emptyStats } = await server.ssrLoadModule("/src/data/statDefinitions.ts");
  const { calculateDerivedStats } = await server.ssrLoadModule("/src/calculations/effectiveStats.ts");
  const rotation = {
    name: "Async editor",
    start: { step: 1 },
    steps: [
      { type: "skill", skill: "Hit" },
      { type: "skill", skill: "Hit" },
    ],
  };
  const input = {
    rotation,
    skills: { Hit: { castTime: 1, cooldown: 10, action: [{ type: "damage", time: 0, phyCoef: 1, attrCoef: 0 }] } },
    eventDefinitions: {},
    dots: {},
    effectDefinitions: {},
    innerWayConditions: [],
    innerWayRules: [],
    setupEffects: [],
    weapons: [],
  };
  const resolved = calculateEditorTimeline(input);
  assert.equal(resolved.rotation, rotation);
  assert.equal(resolved.rotation.start.step, 1);
  assert.equal(resolved.timeline.find((row) => row.rotationIndex === 1).startTime, 10);
  assert.deepEqual(calculateEditorTimeline({ ...input, rotation: resolved.rotation }).rotation, resolved.rotation);

  const draft = {
    ...resolved.rotation,
    steps: [resolved.rotation.steps[1], { type: "skill", skill: "New" }, resolved.rotation.steps[0]],
  };
  const pending = pendingEditorTimeline({ ...input, rotation: draft }, resolved);
  assert.deepEqual(
    pending.map((row) => row.step.skill),
    ["Hit", "New", "Hit"],
  );
  assert.equal(pending[0].startTime, 10, "Previous timing must not reorder the editable draft");
  assert.equal(pending[1].actions.length, 0, "A new step must not run combat calculation while awaiting its worker");
  assert.ok(pending.every((row) => row.pendingCalculation));
  const revision = { id: "a", context: "build", rotation };
  assert.ok(sameEditorRevision(revision, { ...revision }));
  for (const changed of [{ rotation: structuredClone(rotation) }, { id: "b" }, { context: "new build" }]) {
    assert.equal(sameEditorRevision(revision, { ...revision, ...changed }), false);
  }

  const stats = { ...emptyStats, minPhys: 100, maxPhys: 100, precision: 1 };
  const enemy = {
    name: "Probe",
    level: 1,
    defense: 0,
    physicalResistance: 0,
    bellstrikeResistance: 0,
    stonesplitResistance: 0,
    silkbindResistance: 0,
    bamboocutResistance: 0,
    judgementResistance: 0,
  };
  const bundle = {
    timeline: { ...input, rotation: resolved.rotation },
    startAnchor: { rowId: "rotation-0" },
    stats,
    derivedStats: calculateDerivedStats(stats, 0),
    enemy,
    attunement: { physicalPenetration: 0, formlessPenetration: 0 },
    weapons: [],
    statPriority: [],
    attunementPriority: [],
    innerWayPriority: [],
    setupComparisons: {},
  };
  assert.deepEqual(
    calculateRotationBaseline(bundle, resolved.timeline).metrics,
    calculateRotationBaseline(bundle).metrics,
  );

  const workers = [];
  class ControlledWorker {
    listeners = new Map();
    constructor() {
      workers.push(this);
    }
    addEventListener(type, listener) {
      this.listeners.set(type, listener);
    }
    postMessage(message) {
      this.message = message;
    }
    terminate() {
      this.terminated = true;
    }
    reply(result) {
      this.listeners.get("message")({ data: { id: this.message.id, editorTimeline: result } });
    }
  }
  globalThis.Worker = ControlledWorker;
  const client = await server.ssrLoadModule("/src/calculations/rotationWorkerClient.ts");
  let currentRevision = revision;
  let accepted;
  const first = client.requestEditorTimeline(bundle, { key: "editor:a" }).then((result) => {
    if (sameEditorRevision(currentRevision, revision)) accepted = result;
  });
  currentRevision = { ...revision, rotation: draft };
  workers[0].reply({ ...resolved, fingerprint: "old" });
  await first;
  assert.equal(accepted, undefined, "Late completion must not replace a newer edit");
  client.supersedeRotationCalculationRequests();
  assert.ok(!workers[0].terminated, "An idle prepared-timeline worker should survive batch supersession");
  const second = client.requestEditorTimeline(bundle, { key: "editor:a" });
  workers[0].reply({ ...resolved, fingerprint: "latest" });
  assert.equal((await second).fingerprint, "latest");
  client.disposeRotationCalculationWorker();
  console.log(
    "Editor timeline worker probe passed: live cooldown waits, stable authored input, anchors, pending edits, stale-result rejection, and baseline reuse.",
  );
} finally {
  await server.close();
}
