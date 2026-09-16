import { describe, it } from "vitest";
import assert from "node:assert/strict";

// Ported from script/probe/check-editor-timeline-worker.mjs.
describe("editor-timeline-worker", () => {
  it("Editor timeline worker probe passed: live cooldown waits, stable authored input, anchors, pending edits, stale-result rejection, and baseline reuse", async () => {
    try {
      const { calculateEditorTimeline } = await import("../src/calculations/editorTimeline.ts");
      const { pendingEditorTimeline, sameEditorRevision } = await import("../src/editorTimelinePreview.ts");
      const { calculateRotationBaseline } = await import("../src/calculations/rotationCalculator.ts");
      const { emptyStats } = await import("../src/data/statDefinitions.ts");
      const { calculateDerivedStats } = await import("../src/calculations/effectiveStats.ts");
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
        pending.map((row) => row.id),
        resolved.timeline.map((row) => row.id),
      );
      assert.deepEqual(
        pending.map((row) => row.startTime),
        resolved.timeline.map((row) => row.startTime),
      );
      assert.ok(
        pending.some((row) => row.step.automatic === "cooldown"),
        "Generated waits remain mounted",
      );
      assert.equal(pending.find((row) => row.id === "rotation-0").rotationIndex, 2);
      assert.equal(pending.find((row) => row.id === "rotation-1").rotationIndex, 0);
      assert.ok(
        pending.every((row) => !row.pendingCalculation),
        "Keep chronological display order",
      );
      const changed = { ...rotation.steps[0], skill: "New" };
      const changedAgain = { ...changed, skill: "Newest" };
      const replacements = new WeakMap([
        [rotation.steps[0], changed],
        [changed, changedAgain],
      ]);
      const edited = pendingEditorTimeline(
        { ...input, rotation: { ...rotation, steps: [changedAgain] } },
        resolved,
        replacements,
      );
      assert.equal(
        edited.find((row) => row.id === "rotation-0").rotationIndex,
        0,
        "Repeated edits keep targeting the same draft step",
      );
      assert.equal(
        edited.find((row) => row.id === "rotation-1").rotationIndex,
        undefined,
        "Deleted rows cannot edit a different step",
      );
      assert.equal(
        edited.find((row) => row.id === "rotation-0").step.skill,
        "Hit",
        "Display changes atomically on completion",
      );
      const initial = pendingEditorTimeline({ ...input, rotation: draft });
      assert.ok(initial.every((row) => row.pendingCalculation && row.actions.length === 0));
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
      assert.ok(calculateRotationBaseline(bundle).duration > 0);

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
      const client = await import("../src/calculations/rotationWorkerClient.ts");
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
      const obsolete = client.requestEditorTimeline(bundle, { key: "editor:a" });
      const rejected = assert.rejects(obsolete, /superseded/);
      client.cancelEditorTimelineRequest("editor:a");
      assert.ok(workers[0].terminated, "An obsolete running editor build is terminated");
      const replacement = client.requestEditorTimeline(bundle, { key: "editor:a" });
      workers[0].reply({ ...resolved, fingerprint: "cancelled" });
      workers[1].reply({ ...resolved, fingerprint: "replacement" });
      await rejected;
      assert.equal((await replacement).fingerprint, "replacement");
      client.disposeRotationCalculationWorker();
    } finally {
      delete globalThis.Worker;
    }
  });
});
