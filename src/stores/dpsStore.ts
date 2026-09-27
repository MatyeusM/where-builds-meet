import { create } from "zustand"

import type { EditorTimelineResult } from "../calculations/editorTimeline"
import type { RotationSimulationBaseline, RotationSimulationBundle } from "../calculations/rotationCalculator"
import type { RotationMetrics } from "../calculations/rotationMetrics"
import {
  cancelCalculation,
  dispatchCalculation,
  disposeCalculationWorkers,
  supersedeCalculations,
  type TransportResult,
} from "../calculations/rotationWorkerTransport"
import { reportDpsCache } from "./dpsStoreDiagnostics"

/**
 * The single entry point for calculation work. Every baseline, comparison and editor
 * timeline is requested here, so the worker pool is reached from one place and a given
 * calculation runs once however many callers ask for it.
 */

export type DpsResults = {
  editorTimeline: EditorTimelineResult
  baseline: RotationSimulationBaseline
  comparisons: { metrics: RotationMetrics }
}
export type DpsKind = keyof DpsResults

export type DpsEntry<Result = unknown> = {
  cacheKey: string
  kind: DpsKind
  status: "pending" | "ready" | "failed"
  progress: number
  result?: Result
  error?: string
}

export type DpsRequest<K extends DpsKind> = {
  kind: K
  /** Identity of the calculation. Requests sharing a cache key share one worker job. */
  cacheKey: string
  /**
   * Builds the worker bundle and runs only when the result is not already held, so a
   * repeat request costs a map lookup instead of a bundle construction and a dispatch.
   */
  build: () => RotationSimulationBundle
  priority?: number
  onProgress?: (progress: number) => void
  /** Comparisons resolve against a baseline rather than calculating from scratch. */
  baseline?: () => RotationSimulationBaseline
}

/**
 * A baseline carries a whole timeline and a comparison only metrics, so they are
 * retained apart. An editor timeline is a preview keyed by rotation rather than by
 * revision, so holding one would answer a later revision with an earlier timeline; the
 * worker keeps its own short-lived copy and the store holds none.
 */
const retentionByKind: Record<DpsKind, number> = { editorTimeline: 0, baseline: 64, comparisons: 4096 }

const isRetained = (kind: DpsKind) => retentionByKind[kind] > 0

/**
 * In-flight work, kept outside the store so its state stays serialisable. Two callers
 * asking for the same calculation join one job instead of queueing a second.
 */
const inFlight = new Map<string, Promise<TransportResult>>()

/**
 * Bumped when a batch is superseded. A request outlives the batch that started it when
 * the workers are torn down underneath it, and its rejection would otherwise land on
 * whatever now holds the same key, marking a live request failed and untracking it.
 */
let generation = 0

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

/** Map order is insertion order, so the first ready entry of a kind is the oldest. */
function evictOverflow(entries: Map<string, DpsEntry>, kind: DpsKind) {
  const limit = retentionByKind[kind]
  const retained = [...entries].filter(([, entry]) => entry.kind === kind && entry.status === "ready")
  for (let index = 0; retained.length - index > limit; index += 1) entries.delete(retained[index][0])
}

export type DpsStore = {
  entries: ReadonlyMap<string, DpsEntry>
  ensure: <K extends DpsKind>(request: DpsRequest<K>) => Promise<DpsResults[K]>
  /** Read a held result without scheduling anything. */
  peek: <K extends DpsKind>(cacheKey: DpsRequest<K>["cacheKey"]) => DpsResults[K] | undefined
  supersede: () => void
  cancel: (cacheKey: string) => void
  dispose: () => void
  reset: () => void
}

export const useDpsStore = create<DpsStore>()((set, get) => {
  /**
   * Re-insert so a refreshed entry counts as newest rather than inheriting the
   * position it first took, which would make it the next eviction candidate.
   */
  const put = (entry: DpsEntry) =>
    set(state => {
      const entries = new Map(state.entries)
      entries.delete(entry.cacheKey)
      entries.set(entry.cacheKey, entry)
      if (entry.status === "ready") evictOverflow(entries, entry.kind)
      reportDpsCache(entries, retentionByKind)
      return { entries }
    })

  return {
    entries: new Map(),

    peek: cacheKey => get().entries.get(cacheKey)?.result as never,

    ensure: async <K extends DpsKind>(request: DpsRequest<K>) => {
      const { cacheKey, kind } = request
      const running = inFlight.get(cacheKey)
      if (running) return (await running) as DpsResults[K]

      const startedAt = generation
      const held = get().entries.get(cacheKey)
      if (isRetained(kind) && held?.status === "ready") return held.result as DpsResults[K]

      if (isRetained(kind)) put({ cacheKey, kind, status: "pending", progress: 0 })

      const job = (async () => {
        const bundle = request.build()
        return dispatchCalculation({
          mode: kind,
          bundle,
          key: cacheKey,
          cacheKey: kind === "editorTimeline" ? undefined : cacheKey,
          baseline: request.baseline?.(),
          priority: request.priority,
          onProgress: progress => {
            request.onProgress?.(progress)
            if (generation !== startedAt) return
            set(state => {
              const current = state.entries.get(cacheKey)
              if (current?.status !== "pending") return state
              const entries = new Map(state.entries)
              entries.set(cacheKey, { ...current, progress })
              return { entries }
            })
          },
        })
      })()

      inFlight.set(cacheKey, job)
      /** Only the batch that started this request may record its outcome. */
      const settle = (entry: DpsEntry) => {
        if (generation === startedAt && isRetained(kind)) put(entry)
      }

      try {
        const result = (await job) as DpsResults[K]
        settle({ cacheKey, kind, status: "ready", progress: 1, result })
        return result
      } catch (error) {
        settle({ cacheKey, kind, status: "failed", progress: 1, error: errorMessage(error) })
        throw error
      } finally {
        if (inFlight.get(cacheKey) === job) inFlight.delete(cacheKey)
      }
    },

    supersede: () => {
      generation += 1
      inFlight.clear()
      // Held results stay valid across a supersede; only in-flight bookkeeping does not.
      set(state => {
        const entries = new Map([...state.entries].filter(([, entry]) => entry.status === "ready"))
        reportDpsCache(entries, retentionByKind)
        return { entries }
      })
      supersedeCalculations()
    },

    cancel: cacheKey => cancelCalculation(cacheKey),

    dispose: () => {
      inFlight.clear()
      disposeCalculationWorkers()
    },

    reset: () => {
      inFlight.clear()
      const entries = new Map<string, DpsEntry>()
      reportDpsCache(entries, retentionByKind)
      set({ entries })
    },
  }
})

export function selectDpsEntry(cacheKey: string) {
  return (state: DpsStore) => state.entries.get(cacheKey)
}
