import { isDeepStrictEqual } from "node:util";

export const dpsSnapshotTolerance = 0.05;

export function compareDpsSnapshots(expected, actual) {
  const failures = [];
  for (const pathId of [...new Set([...Object.keys(expected), ...Object.keys(actual)])].sort()) {
    const before = expected[pathId];
    const after = actual[pathId];
    if (!before || !after) {
      failures.push(
        `${pathId}: ${before ? "path no longer covered; review snapshot removal" : "missing DPS snapshot"}.`,
      );
      continue;
    }
    const valid = [before, after].every((value) =>
      [value.dps, value.totalDamage, value.duration].every((number) => Number.isFinite(number) && number > 0),
    );
    if (!valid) {
      failures.push(`${pathId}: snapshot and calculated DPS, damage, and duration must be finite and positive.`);
      continue;
    }
    if (!isDeepStrictEqual(before.fixture, after.fixture)) {
      failures.push(`${pathId}: preset or environment changed; review the new fixture before updating its snapshot.`);
    }
    const delta = after.dps - before.dps;
    if (Math.abs(delta) >= before.dps * dpsSnapshotTolerance) {
      failures.push(
        `${pathId}: DPS ${before.dps.toFixed(2)} -> ${after.dps.toFixed(2)} (${delta >= 0 ? "+" : ""}${((delta / before.dps) * 100).toFixed(2)}%); limit is less than 5% in either direction.`,
      );
    }
  }
  return failures;
}
