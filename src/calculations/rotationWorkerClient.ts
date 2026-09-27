import type { EditorTimelineResult } from "./editorTimeline"
import type {
  RotationCalculationBundle,
  RotationSimulationBaseline,
  RotationSimulationBundle,
  RotationSimulationResult,
  RotationActionBreakdown,
} from "./rotationCalculator"
import type { RotationMetrics } from "./rotationMetrics"
import type { TimelineRow } from "./rotationTimeline"

type WorkerResult =
  | RotationSimulationBaseline
  | RotationSimulationResult
  | { metrics: RotationMetrics }
  | { editorTimeline: EditorTimelineResult }
type RequestMode = "calculation" | "simulation" | "baseline" | "comparisons" | "editorTimeline"
type RequestOptions = { key?: string; priority?: number; onProgress?: (progress: number) => void }

type CalculationRequest = {
  bundle: RotationCalculationBundle | RotationSimulationBundle
  mode: RequestMode
  cacheKey?: string
  baseline?: RotationSimulationBaseline
  key: string
  priority: number
  sequence: number
  retryCount: number
  onProgress?: (progress: number) => void
  resolve: (result: WorkerResult) => void
  reject: (error: Error) => void
}

type WorkerResultMessage = {
  id: number
  metrics?: RotationMetrics
  editorTimeline?: EditorTimelineResult
  timeline?: TimelineRow[]
  anchorTime?: number
  duration?: number
  actionBreakdowns?: Record<string, RotationActionBreakdown>
  baseline?: RotationSimulationBaseline["baseline"]
  compactedInnerWayResults?: boolean
  expectedOutcomeBuffSchedule?: RotationSimulationBaseline["expectedOutcomeBuffSchedule"]
  mysticVitalityDamageScale?: number
  progress?: number
  error?: string
}

/**
 * A slot mirrors the baseline cache its worker keeps for itself. A `comparisons`
 * request reads `baselineCache` inside the worker and throws when the key is
 * absent, so the key set has to be per slot: one shared set would let a job land
 * on a slot that never ran the baseline and suppress the caller-supplied fallback.
 */
type WorkerSlot = {
  worker: Worker
  running?: { id: number; request: CalculationRequest }
  baselineKeys: Set<string>
  idleSince: number
}

const maxWorkers = 4
let slots: WorkerSlot[] = []
let requestId = 0
let requestSequence = 0
let pending: CalculationRequest[] = []
let idleCounter = 0

function workerBudget() {
  const cores = typeof navigator === "undefined" ? 2 : (navigator.hardwareConcurrency ?? 2)
  return Math.max(1, Math.min(maxWorkers, cores - 1))
}

/**
 * Tear down every worker, rejecting whatever each one was running plus the queue.
 * Interrupted requests are captured before the slots are cleared, otherwise the
 * rejections find nothing left to settle and the callers hang forever.
 */
function teardownSlots(message: string) {
  const error = new Error(message)
  const interrupted = slots.flatMap(slot => (slot.running ? [slot.running.request] : []))
  const doomed = slots
  slots = []
  const queued = pending
  pending = []
  doomed.forEach(slot => {
    slot.worker.terminate()
    slot.running = undefined
  })
  interrupted.forEach(request => request.reject(error))
  queued.forEach(request => request.reject(error))
}

function higherPriorityFirst(left: CalculationRequest, right: CalculationRequest) {
  return right.priority - left.priority || left.sequence - right.sequence
}

/** Prefer a slot that already cached the requested baseline over cloning it again. */
function pickSlot(request: CalculationRequest) {
  const free = slots.filter(slot => !slot.running)
  if (request.cacheKey) {
    const holding = free.find(slot => slot.baselineKeys.has(request.cacheKey!))
    if (holding) return holding
  }
  return free.reduce((oldest, slot) => (slot.idleSince < oldest.idleSince ? slot : oldest))
}

function removeSlot(slot: WorkerSlot) {
  const index = slots.indexOf(slot)
  if (index < 0) return false
  slots.splice(index, 1)
  slot.worker.terminate()
  return true
}

function translateResult(request: CalculationRequest, message: WorkerResultMessage): WorkerResult {
  if (message.error) throw new Error(message.error)
  if (message.editorTimeline) return { editorTimeline: message.editorTimeline }
  if (!message.metrics) throw new Error("Rotation calculation worker returned no result")
  if (request.mode !== "simulation" && request.mode !== "baseline") return { metrics: message.metrics }
  return {
    metrics: message.metrics,
    timeline: message.timeline ?? [],
    anchorTime: message.anchorTime ?? 0,
    duration: message.duration ?? 0,
    actionBreakdowns: message.actionBreakdowns ?? {},
    ...(message.baseline ? { baseline: message.baseline } : {}),
    ...(message.compactedInnerWayResults ? { compactedInnerWayResults: true } : {}),
    ...(message.expectedOutcomeBuffSchedule
      ? { expectedOutcomeBuffSchedule: message.expectedOutcomeBuffSchedule }
      : {}),
    ...(message.mysticVitalityDamageScale !== undefined
      ? { mysticVitalityDamageScale: message.mysticVitalityDamageScale }
      : {}),
  }
}

function settleSlotFailure(slot: WorkerSlot, message: string, cause?: unknown) {
  if (!removeSlot(slot)) return
  const interrupted = slot.running?.request
  slot.running = undefined
  if (interrupted) requeueOrReject(interrupted, cause instanceof Error ? cause : new Error(message))
  dispatchPending()
}

function requeueOrReject(request: CalculationRequest, error: Error) {
  if (request.retryCount < 1) pending.push({ ...request, retryCount: request.retryCount + 1 })
  else request.reject(error)
}

function createSlot(): WorkerSlot {
  const slot: WorkerSlot = { worker: undefined as unknown as Worker, baselineKeys: new Set(), idleSince: 0 }
  const createdWorker = new Worker(new URL("./rotationWorker.ts", import.meta.url), { type: "module" })
  slot.worker = createdWorker

  createdWorker.addEventListener("message", (event: MessageEvent<WorkerResultMessage>) => {
    if (slots.indexOf(slot) < 0) return
    const running = slot.running
    if (!running || event.data.id !== running.id) return
    if (typeof event.data.progress === "number") {
      running.request.onProgress?.(event.data.progress)
      return
    }
    const completed = running.request
    slot.running = undefined
    slot.idleSince = ++idleCounter
    if (completed.cacheKey && (completed.mode === "baseline" || completed.baseline)) {
      slot.baselineKeys.add(completed.cacheKey)
    }
    try {
      completed.resolve(translateResult(completed, event.data))
    } catch (error) {
      completed.reject(error instanceof Error ? error : new Error("Rotation calculation failed"))
    }
    dispatchPending()
  })

  createdWorker.addEventListener("error", event => {
    settleSlotFailure(slot, event.message || "Rotation calculation worker failed")
  })
  createdWorker.addEventListener("messageerror", () => {
    settleSlotFailure(slot, "Rotation calculation worker returned an unreadable result")
  })

  slots.push(slot)
  return slot
}

function dispatchTo(slot: WorkerSlot, request: CalculationRequest) {
  const id = ++requestId
  slot.running = { id, request }
  try {
    slot.worker.postMessage({
      id,
      bundle: request.bundle,
      mode: request.mode,
      cacheKey: request.cacheKey,
      ...(!request.cacheKey || slot.baselineKeys.has(request.cacheKey) ? {} : { baseline: request.baseline }),
    })
  } catch (error) {
    slot.running = undefined
    removeSlot(slot)
    requeueOrReject(request, error instanceof Error ? error : new Error("Rotation calculation worker failed"))
  }
}

function dispatchPending() {
  pending.sort(higherPriorityFirst)
  while (pending.length > 0) {
    let free = slots.filter(slot => !slot.running)
    if (free.length === 0) {
      if (slots.length >= workerBudget()) return
      free = [createSlot()]
    }
    const next = pending.shift()!
    dispatchTo(pickSlot(next) ?? free[0], next)
  }
}

function enqueue(
  request: Omit<CalculationRequest, "key" | "priority" | "sequence" | "retryCount">,
  options: RequestOptions = {},
) {
  const queued: CalculationRequest = {
    ...request,
    key: options.key ?? `${request.mode}:${++requestSequence}`,
    priority: options.priority ?? 0,
    sequence: ++requestSequence,
    retryCount: 0,
    onProgress: options.onProgress,
  }
  const replacedIndex = pending.findIndex(candidate => candidate.key === queued.key)
  if (replacedIndex >= 0) {
    pending[replacedIndex].reject(new Error("Calculation superseded by a newer request"))
    pending.splice(replacedIndex, 1)
  }
  pending.push(queued)
  dispatchPending()
}

/** Queue requests by priority and replace stale pending work with the same key. */
export function requestRotationCalculation(bundle: RotationCalculationBundle, options?: RequestOptions) {
  return new Promise<RotationMetrics>((resolve, reject) => {
    enqueue(
      {
        bundle,
        mode: "calculation",
        resolve: result => resolve((result as { metrics: RotationMetrics }).metrics),
        reject,
      },
      options,
    )
  })
}

export function requestRotationSimulation(bundle: RotationSimulationBundle, options?: RequestOptions) {
  return new Promise<RotationSimulationResult>((resolve, reject) => {
    enqueue(
      { bundle, mode: "simulation", resolve: result => resolve(result as RotationSimulationResult), reject },
      options,
    )
  })
}

export function requestRotationBaseline(bundle: RotationSimulationBundle, cacheKey: string, options?: RequestOptions) {
  return new Promise<RotationSimulationBaseline>((resolve, reject) => {
    enqueue(
      { bundle, mode: "baseline", cacheKey, resolve: result => resolve(result as RotationSimulationBaseline), reject },
      options,
    )
  })
}

export function requestRotationComparisons(
  bundle: RotationSimulationBundle,
  cacheKey: string,
  baseline: RotationSimulationBaseline,
  options?: RequestOptions,
) {
  return new Promise<RotationMetrics>((resolve, reject) => {
    enqueue(
      {
        bundle,
        mode: "comparisons",
        cacheKey,
        baseline,
        resolve: result => resolve((result as { metrics: RotationMetrics }).metrics),
        reject,
      },
      options,
    )
  })
}

/** Stop the active calculation batch so its replacement starts without stale queued work or worker cache. */
export function supersedeRotationCalculationRequests() {
  // Idle workers hold no stale requests; keeping them preserves their prepared editor timeline.
  if (pending.length === 0 && slots.every(slot => !slot.running)) return
  teardownSlots("Calculation superseded by a newer batch")
}

export function disposeRotationCalculationWorker() {
  teardownSlots("Calculation worker disposed")
}

/** Cancel only this editor's obsolete build, preserving unrelated queued work. */
export function cancelEditorTimelineRequest(key: string) {
  const matches = (request: CalculationRequest) => request.mode === "editorTimeline" && request.key === key
  const error = new Error("Calculation superseded by a newer editor revision")
  pending = pending.filter(request => {
    if (!matches(request)) return true
    request.reject(error)
    return false
  })
  const interrupted = slots.find(slot => slot.running && matches(slot.running.request))
  if (interrupted) {
    const request = interrupted.running!.request
    removeSlot(interrupted)
    request.reject(error)
  }
  dispatchPending()
}

export function requestEditorTimeline(bundle: RotationSimulationBundle, options?: RequestOptions) {
  return new Promise<EditorTimelineResult>((resolve, reject) => {
    enqueue(
      {
        bundle,
        mode: "editorTimeline",
        resolve: result => resolve((result as { editorTimeline: EditorTimelineResult }).editorTimeline),
        reject,
      },
      options,
    )
  })
}
