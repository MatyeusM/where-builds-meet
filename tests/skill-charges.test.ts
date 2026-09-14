import { describe, it } from "vitest";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

// Ported from script/probe/check-skill-charges.mjs.
describe("skill-charges", () => {
  it("Independent charge recovery, partial/full resets, shared groups, readiness, triggered casts, talent cooldown, and editor waits passed", async () => {
    const cast = (skill) => ({ type: "skill", skill });
    const delay = (duration) => ({ type: "event", event: "Delay", duration });
    const clear = (charges) => ({
      type: "clearCD",
      value: "AddledMind",
      ...(charges === undefined ? {} : { charges }),
      time: 0,
    });

    const { buildRotationTimeline } = await import("../src/calculations/rotationTimeline.ts");
    const { calculateEditorTimeline } = await import("../src/calculations/editorTimeline.ts");
    const general = JSON.parse(await readFile("data/skill/general.json", "utf8"));
    const talent = JSON.parse(await readFile("data/martial-art/infernal-twinblades.json", "utf8"));
    // Isolate cooldown scheduling from the skill's attack duration and hit events.
    const charged = {
      ...JSON.parse(await readFile("data/skill/infernal-twinblades.json", "utf8")).AddledMind,
      castTime: 0,
      action: [],
      modifier: [],
    };
    const skills = {
      ...general,
      AddledMind: charged,
      RestoreOne: { castTime: 0, action: [clear(1)] },
      RestoreAll: { castTime: 0, action: [clear()] },
      CheckReady: {
        castTime: 0,
        action: [
          {
            type: "apply",
            target: "self",
            value: "Ready",
            time: 0,
            requirement: [{ target: "skillCooldown", value: "AddledMind", comparison: "ready" }],
          },
        ],
      },
      Observe: { castTime: 0, action: [] },
    };
    const input = (steps, extra = {}) => ({
      rotation: { name: "Independent charge probe", steps },
      skills,
      eventDefinitions: {},
      dots: {},
      effectDefinitions: { Ready: { duration: 0.1 } },
      innerWayConditions: [],
      innerWayRules: [],
      setupEffects: [],
      weapons: [],
      ...extra,
    });
    const build = (steps, extra) => buildRotationTimeline(input(steps, extra));
    const times = (rows) =>
      rows.filter((row) => row.step.skill === "AddledMind" && !row.skipped).map((row) => row.startTime);
    const staggered = [cast("AddledMind"), delay(2), cast("AddledMind"), delay(2), cast("AddledMind")];
    const more = Array.from({ length: 3 }, () => cast("AddledMind"));
    assert.deepEqual(
      times(build([...staggered, ...more])),
      [0, 2, 4, 15, 17, 19],
      "Each spent charge recovers 15 seconds after its own cast",
    );

    const restoredSteps = [...staggered, delay(1), cast("RestoreOne"), ...more];
    assert.deepEqual(
      times(build(restoredSteps)),
      [0, 2, 4, 5, 17, 19],
      "Restoring one charge preserves both other timers and consumes the next recovering charge",
    );
    assert.deepEqual(
      times(build([...staggered, delay(1), cast("RestoreAll"), ...more, cast("AddledMind")])),
      [0, 2, 4, 5, 5, 5, 20],
      "Unqualified clearCD restores every charge and new uses start new timers",
    );
    assert.deepEqual(
      times(build([cast("RestoreOne"), cast("RestoreOne"), ...more, cast("AddledMind")])),
      [0, 0, 0, 15],
      "Restoring at full capacity cannot bank extra charges",
    );
    assert.deepEqual(
      times(build([...staggered, delay(11), cast("RestoreOne"), ...more])),
      [0, 2, 4, 15, 15, 19],
      "Recovery at the reset boundary happens naturally before an additional charge is restored",
    );

    const readyRows = build([
      cast("AddledMind"),
      cast("CheckReady"),
      cast("Observe"),
      delay(0.2),
      cast("AddledMind"),
      cast("AddledMind"),
      cast("CheckReady"),
      cast("Observe"),
      cast("RestoreOne"),
      cast("CheckReady"),
      cast("Observe"),
    ]);
    assert.deepEqual(
      readyRows
        .filter((row) => row.step.skill === "Observe")
        .map((row) => row.buffs.some((effect) => effect.name === "Ready")),
      [true, false, true],
      "skillCooldown requirements reflect remaining and restored charges",
    );

    const grouped = {
      ...skills,
      AddledMind: { ...charged, cooldownGroup: "SharedCharges" },
      Variant: { ...charged, cooldownGroup: "SharedCharges" },
      RestoreOne: { castTime: 0, action: [{ ...clear(1), value: "Variant" }] },
    };
    const groupedRows = build(
      [
        cast("AddledMind"),
        delay(2),
        cast("Variant"),
        delay(2),
        cast("AddledMind"),
        delay(1),
        cast("RestoreOne"),
        cast("Variant"),
        cast("AddledMind"),
      ],
      { skills: grouped },
    );
    assert.deepEqual(
      groupedRows.filter((row) => ["AddledMind", "Variant"].includes(row.step.skill)).map((row) => row.startTime),
      [0, 2, 4, 5, 17],
      "Variants share charges and restore by the same cooldown group",
    );

    const trigger = (time) => ({ type: "trigger", value: "AddledMind", time });
    const triggeredRows = build([cast("Driver")], {
      skills: {
        ...skills,
        Driver: {
          castTime: 20,
          action: [
            trigger(0),
            trigger(2),
            trigger(4),
            trigger(5),
            { ...clear(1), time: 6 },
            trigger(6),
            trigger(7),
            trigger(17),
          ],
        },
      },
    });
    assert.deepEqual(
      times(triggeredRows),
      [0, 2, 4, 6, 17],
      "Triggers consume the same independent charges and are rejected instead of waiting",
    );
    const mixedRows = build([cast("Driver"), ...more], {
      skills: { ...skills, Driver: { castTime: 4, action: [trigger(0), trigger(2)] } },
    });
    assert.deepEqual(times(mixedRows), [0, 2, 4, 15, 17], "Explicit casts share the pool consumed by triggers");

    const waiting = build([...more, cast("AddledMind"), cast("AddledMind")], {
      skills: {
        ...skills,
        AddledMind: { ...charged, action: [{ type: "trigger", value: "DelayedReset", time: 0 }] },
        DelayedReset: { castTime: 0, cooldown: 30, action: [{ ...clear(1), time: 5 }] },
      },
    });
    assert.deepEqual(
      times(waiting),
      [0, 0, 0, 5, 15],
      "A partial reset wakes one waiting cast without duplicating it or restoring a second charge",
    );
    const skipped = build([...more, cast("AddledMind")], { cooldownPolicy: "skip" });
    assert.equal(skipped.at(-1).skipped, true, "Skip policy remains available for depleted charges");

    const talentEffects = talent.talent[13].flatMap((entry) => entry.effect ?? []);
    const dodgeSteps = [
      ...more,
      cast("PerfectDodgeCancel"),
      cast("AddledMind"),
      cast("PerfectDodgeCancel"),
      cast("AddledMind"),
      delay(15),
      cast("AddledMind"),
      cast("AddledMind"),
      cast("AddledMind"),
      cast("PerfectDodgeCancel"),
      cast("AddledMind"),
      cast("PerfectDodgeCancel"),
      cast("AddledMind"),
    ];
    for (const procRoll of [undefined, () => 0.2]) {
      assert.deepEqual(
        times(build(dodgeSteps, { setupEffects: talentEffects, procRoll })),
        [0, 0, 0, 0, 15, 30, 30, 30, 30, 45],
        "Actual talent restores exactly one charge with its shared 30-second cooldown in expected and sampled timelines",
      );
    }
    const editorInput = input(restoredSteps);
    const editor = calculateEditorTimeline(editorInput);
    assert.equal(editor.rotation, editorInput.rotation, "Charge waits never rewrite authored rotation steps");
    assert.deepEqual(times(editor.timeline), [0, 2, 4, 5, 17, 19], "Editor uses the shared charge timeline");

    const modified = build([...staggered, ...more], {
      skills: { ...skills, AddledMind: { ...charged, modifier: [{ requirement: [], effect: { cooldown: 8 } }] } },
    });
    assert.deepEqual(
      times(modified),
      [0, 2, 4, 8, 10, 12],
      "Cast-start cooldown modifiers apply to each independent recovery",
    );
  });
});
