import assert from "node:assert/strict"

import type { TimelineRow } from "@/calculations/rotationTimeline"

/**
 * Look a row up the way a spec means to.
 *
 * Reading a row straight out of `find` left every use of it possibly undefined,
 * and a rotation that stopped carrying the row failed on the next line as a
 * `TypeError` rather than as the assertion that had stopped holding. Naming the
 * missing row says which expectation broke.
 */

/** The single timeline row that casts `skill`. */
export function rowCasting(rows: TimelineRow[], skill: string): TimelineRow {
  const row = rows.find(candidate => candidate.step.skill === skill)
  assert(row, `Expected a timeline row casting ${skill}.`)
  return row
}

/**
 * The single timeline row carrying `id`.
 *
 * This is an overload rather than one generic on purpose. A single generic
 * infers its element type from whatever it was handed, so a loosely typed array
 * came back as `{ id: string }` with every other field silently dropped. Naming
 * the timeline row first keeps that mistake from losing fields; the second
 * signature still serves the other row shapes, which do carry an id.
 */
export function rowWithId(rows: readonly TimelineRow[], id: string): TimelineRow
export function rowWithId<T extends { id: string }>(rows: readonly T[], id: string): T
export function rowWithId<T extends { id: string }>(rows: readonly T[], id: string): T {
  const row = rows.find(candidate => candidate.id === id)
  assert(row, `Expected a row with id ${id}.`)
  return row
}
