/**
 * The persistence specs only need storage, so they stand in a window carrying
 * just that. A full `Window` is not buildable by hand in a spec, and the app
 * reads nothing else off it.
 */
export function windowWithStorage(storage: {
  localStorage: Storage
  sessionStorage: Storage
}): Window & typeof globalThis {
  return { localStorage: storage.localStorage, sessionStorage: storage.sessionStorage } as unknown as Window &
    typeof globalThis
}

/**
 * A window whose storage is whatever `globalThis` currently holds.
 *
 * A spec that walks a spec through several migrations re-points the globals
 * between phases, so the window has to track them rather than capture one value.
 */
export function windowOverGlobalStorage(): Window & typeof globalThis {
  return {
    get localStorage() {
      return globalThis.localStorage
    },
    get sessionStorage() {
      return globalThis.sessionStorage
    },
  } as unknown as Window & typeof globalThis
}

/**
 * Storage that only reads. The persistence specs seed a value and let the app
 * read it back, so the write half is never exercised and is left inert.
 */
export function readOnlyStorage(read: (key: string) => string | null): Storage {
  const inert: Storage = {
    get length() {
      return 0
    },
    key: () => null,
    getItem: () => null,
    setItem: () => {},
    removeItem: () => {},
    clear: () => {},
  }
  return { ...inert, getItem: read } as Storage
}
