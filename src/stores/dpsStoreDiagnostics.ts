import type { DpsEntry, DpsKind } from "./dpsStore"

/**
 * Cache occupancy reporting for local development. The store has no other observer, so
 * without this the only way to see whether a calculation was reused or recomputed is to
 * instrument it. A fan-out writes many entries in quick succession, so reports are
 * coalesced and an unchanged summary is not reprinted.
 */
const enabled = import.meta.env.DEV && import.meta.env.MODE !== "test"

const reportDelayMs = 250
let pending: ReturnType<typeof setTimeout> | undefined
let latest: { entries: ReadonlyMap<string, DpsEntry>; retention: Record<DpsKind, number> } | undefined
let lastSummary = ""

type KindSummary = { kind: DpsKind; ready: number; pending: number; failed: number; limit: number }

function summarize(entries: ReadonlyMap<string, DpsEntry>, retention: Record<DpsKind, number>) {
  const rows: KindSummary[] = []
  for (const kind of Object.keys(retention) as DpsKind[]) {
    rows.push({ kind, ready: 0, pending: 0, failed: 0, limit: retention[kind] })
  }
  const byKind = new Map(rows.map(row => [row.kind, row]))
  for (const entry of entries.values()) {
    const row = byKind.get(entry.kind)
    if (!row) continue
    if (entry.status === "ready") row.ready += 1
    else if (entry.status === "pending") row.pending += 1
    else row.failed += 1
  }
  return rows
}

function render(rows: KindSummary[], total: number) {
  const held = rows.filter(row => row.limit > 0)
  const body = held.map(row => `${row.kind} ${row.ready}/${row.limit}`).join("  ")
  const inflight = rows.flatMap(row => (row.pending > 0 ? [`${row.kind} pending ${row.pending}`] : []))
  return [`total ${total}`, body, ...inflight].filter(Boolean).join("  |  ")
}

export function reportDpsCache(entries: ReadonlyMap<string, DpsEntry>, retention: Record<DpsKind, number>) {
  if (!enabled) return
  // The newest snapshot wins: a burst keeps overwriting this while the report is
  // pending, so the flushed report describes where the burst settled rather than
  // the first write in it.
  latest = { entries, retention }
  if (pending) return
  pending = setTimeout(() => {
    pending = undefined
    const snapshot = latest
    if (!snapshot) return
    const rows = summarize(snapshot.entries, snapshot.retention)
    const summary = render(rows, snapshot.entries.size)
    if (summary === lastSummary) return
    lastSummary = summary
    console.groupCollapsed(`[DPS cache] ${summary}`)
    console.table(rows)
    console.info("Held results resolve without building a bundle. `useDpsStore.getState().entries` lists them.")
    console.groupEnd()
  }, reportDelayMs)
}

/** Print the current occupancy immediately instead of waiting for the coalesced report. */
export function logDpsCacheNow(entries: ReadonlyMap<string, DpsEntry>, retention: Record<DpsKind, number>) {
  if (!enabled) return
  if (pending) clearTimeout(pending)
  pending = undefined
  lastSummary = ""
  reportDpsCache(entries, retention)
}
