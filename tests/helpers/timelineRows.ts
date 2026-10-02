import assert from "node:assert/strict"

import type { TimelineRow } from "@/calculations/rotationTimeline"

/**
 * Look a timeline row up the way a spec means to.
 *
 * Reading a row straight out of `find` left every use of it possibly undefined,
 * and a rotation that stopped carrying the row failed on the next line as a
 * `TypeError` rather than as the assertion that had stopped holding. Naming the
 * missing row says which expectation broke.
 */

/** The single row that casts `skill`. */
export function rowCasting(rows: TimelineRow[], skill: string): TimelineRow {
  const row = rows.find(candidate => candidate.step.skill === skill)
  assert(row, `Expected a timeline row casting ${skill}.`)
  return row
}

/** The single row carrying `id`. */
export function rowWithId<T extends { id: string }>(rows: readonly T[], id: string): T {
  const row = rows.find(candidate => candidate.id === id)
  assert(row, `Expected a row with id ${id}.`)
  return row
}
