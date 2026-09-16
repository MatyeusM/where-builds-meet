// Runtime loader for probe specs that are only known dynamically (rotation
// paths, skill-file loops). Static specifiers are imported directly; this
// helper covers the remaining computed cases. Probe specs are root-absolute
// (`/src/...`, `/data/...`); this helper lives in tests/helpers/, two levels
// below the root like the former script/probe/ checks did relative to theirs,
// so a `../..` prefix resolves them.
export const probeLoad = (path: string) => import(/* @vite-ignore */ `../..${path}`)
