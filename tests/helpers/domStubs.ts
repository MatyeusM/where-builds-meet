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
