import { isDeepStrictEqual } from "node:util"

export const dpsSnapshotTolerance = 0.01

export function compareDpsSnapshots(expected, actual) {
  const failures = []
  for (const caseId of [...new Set([...Object.keys(expected), ...Object.keys(actual)])].sort()) {
    const before = expected[caseId]
    const after = actual[caseId]
    if (!before || !after) {
      failures.push(
        `${caseId}: ${before ? "rotation no longer covered; review snapshot removal" : "missing DPS snapshot"}.`,
      )
      continue
    }
    const valid = [before, after].every(value =>
      [value.dps, value.totalDamage, value.duration].every(number => Number.isFinite(number) && number > 0),
    )
    if (!valid) {
      failures.push(`${caseId}: snapshot and calculated DPS, damage, and duration must be finite and positive.`)
      continue
    }
    if (!isDeepStrictEqual(before.fixture, after.fixture)) {
      failures.push(`${caseId}: preset or environment changed; review the new fixture before updating its snapshot.`)
    }
    const delta = after.dps - before.dps
    if (Math.abs(delta) >= before.dps * dpsSnapshotTolerance) {
      failures.push(
        `${caseId}: DPS ${before.dps.toFixed(2)} -> ${after.dps.toFixed(2)} (${delta >= 0 ? "+" : ""}${((delta / before.dps) * 100).toFixed(2)}%); limit is less than ${dpsSnapshotTolerance * 100}% in either direction.`,
      )
    }
  }
  return failures
}
