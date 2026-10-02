import assert from "node:assert/strict"

import type { TimelineRow } from "@/calculations/rotationTimeline"

/**
 * The single timeline row that casts `skill`.
 *
 * Reading the row straight out of `find` left every use of it possibly
 * undefined, and a rotation that stopped casting the skill failed on the next
 * line as a `TypeError` rather than as the assertion it was. Naming the missing
 * skill says which expectation broke.
 */
export function rowCasting(rows: TimelineRow[], skill: string): TimelineRow {
  const row = rows.find(candidate => candidate.step.skill === skill)
  assert(row, `Expected a timeline row casting ${skill}.`)
  return row
}
