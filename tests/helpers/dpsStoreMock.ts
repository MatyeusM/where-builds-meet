import { vi } from "vitest"

/**
 * Stand-in for the calculation store. Tests that render the editor only need to
 * control what a calculation resolves to, so a request stays pending unless a test
 * registers a handler for its kind. Held results are cached per cache key, so a repeat
 * request resolves without dispatching again, as the real store does.
 */
const mock = {
  handlers: new Map<string, (request: any) => Promise<unknown>>(),
  requests: [] as any[],
  dispatches: [] as any[],
  held: new Map<string, unknown>(),
}

/**
 * Forget held results and recorded requests so each test starts from an empty store.
 * Registered handlers survive, matching a per-file stand-in that a test may re-register.
 */
export function resetDpsMock() {
  mock.requests.length = 0
  mock.dispatches.length = 0
  mock.held.clear()
}

/** Register the result for one calculation kind. Unhandled kinds never settle. */
export function dpsResolves(kind: string, handler: (request: any) => Promise<unknown>) {
  mock.handlers.set(kind, handler)
}

export function dpsRequests(kind: string) {
  return mock.requests.filter(request => request.kind === kind)
}

/** Requests that actually reached a worker, as opposed to resolving from a held result. */
export function dpsDispatches(kind: string) {
  return mock.dispatches.filter(request => request.kind === kind)
}

/**
 * Bundles handed to the worker for one kind. A request builds its bundle lazily, so
 * tests that assert on the bundle build it here rather than reaching into the thunk.
 */
export function dpsBundles(kind: string) {
  return dpsDispatches(kind).map(request => request.build())
}

/**
 * The store holds no editor timeline, because that result is keyed by rotation rather
 * than by revision and would answer a later revision with an earlier timeline.
 */
const retained = (kind: string) => kind !== "editorTimeline"

export function mockDpsStore() {
  const never = () => new Promise<never>(() => {})
  return {
    useDpsStore: {
      getState: () => ({
        entries: new Map(mock.held),
        ensure: vi.fn<(request: any) => Promise<unknown>>(async request => {
          mock.requests.push(request)
          if (retained(request.kind) && mock.held.has(request.cacheKey)) return mock.held.get(request.cacheKey)
          mock.dispatches.push(request)
          const handler = mock.handlers.get(request.kind)
          if (!handler) return never()
          const result = await handler(request)
          if (retained(request.kind)) mock.held.set(request.cacheKey, result)
          return result
        }),
        peek: vi.fn<(cacheKey: string) => unknown>(cacheKey => mock.held.get(cacheKey)),
        supersede: vi.fn<() => void>(),
        cancel: vi.fn<(cacheKey: string) => void>(),
        dispose: vi.fn<() => void>(),
        reset: vi.fn<() => void>(),
      }),
    },
    selectDpsEntry: () => undefined,
  }
}
