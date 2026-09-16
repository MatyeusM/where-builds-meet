import { it } from "vitest";
import { writeFileSync } from "node:fs";
import { buildPresetRotationBundle } from "../../../src/App";
import { calculateRotationBaseline } from "../../../src/calculations/rotationCalculator";
import { loadDpsSnapshotFixtures } from "../../../tests/helpers/dps-snapshot-fixtures";
it("diagnose timing", async () => {
  const entry = (await loadDpsSnapshotFixtures()).find(
    (x) => x.id === "stonesplitStrength/mixed-dummy-infinite-vitality-1-min",
  )!;
  const outputs = [];
  for (const castTime of [1.832, 1.605]) {
    const bundle = buildPresetRotationBundle(
      { pathId: entry.pathId, ...entry.fixture, rotation: entry.rotation, skillOverrides: {} },
      entry.fixture.build,
    )!;
    bundle.timeline.skills = {
      ...bundle.timeline.skills,
      SnowpartingLightCharged: { ...bundle.timeline.skills.SnowpartingLightCharged, castTime },
    };
    const result = calculateRotationBaseline(bundle);
    const actions = result.timeline
      .flatMap((row) =>
        row.actions.map((action, i) => ({
          skill: row.step.skill,
          index: row.rotationIndex,
          action: i,
          time: row.startTime + action.time,
          damage: result.actionBreakdowns[`${row.id}:${i}`]?.total ?? 0,
          state: row.actionStates[i],
        })),
      )
      .filter((a) => a.damage > 0);
    outputs.push({ castTime, dps: result.metrics.dps, duration: result.duration, actions });
  }
  writeFileSync(
    "working/strength-timing-details.json",
    JSON.stringify(outputs, (_k, v) => (v instanceof Map ? Object.fromEntries(v) : v), 2),
  );
  const old = outputs[0].actions,
    now = outputs[1].actions;
  console.log(
    "DPS",
    outputs.map((x) => x.dps),
  );
  for (let i = 0; i < Math.max(old.length, now.length); i++)
    if (Math.abs((now[i]?.damage ?? 0) - (old[i]?.damage ?? 0)) > 0.001)
      console.log(JSON.stringify({ old: old[i], now: now[i] }));
});
