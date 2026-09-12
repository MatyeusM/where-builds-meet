import assert from "node:assert/strict";
import { compareDpsSnapshots } from "./dps-snapshot-guard.mjs";

const sample = (dps = 100) => ({
  fixture: { build: "example", rotation: "one-minute" },
  dps,
  totalDamage: dps * 60,
  duration: 60,
});
const baseline = { example: sample() };
for (const dps of [95.001, 100, 104.999]) {
  assert.deepEqual(compareDpsSnapshots(baseline, { example: sample(dps) }), []);
}
for (const dps of [95, 105, 80, 120, 0, -1, NaN, Infinity]) {
  assert(compareDpsSnapshots(baseline, { example: sample(dps) }).length > 0, `Must block ${dps} DPS`);
}
assert(compareDpsSnapshots({}, baseline).length > 0, "New implemented paths need snapshots");
assert(compareDpsSnapshots(baseline, {}).length > 0, "Coverage cannot silently disappear");
assert(compareDpsSnapshots(baseline, { example: { ...sample(), fixture: { build: "changed" } } }).length > 0);
assert(compareDpsSnapshots({ example: sample(0) }, baseline).length > 0, "Invalid baselines cannot bypass the gate");
assert.deepEqual(baseline.example, sample(), "Comparisons never update the accepted baseline");
console.log(
  "DPS snapshot guard: bidirectional 5% boundary, invalid results, fixture changes, and coverage checks passed.",
);
