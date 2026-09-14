import { readdir, readFile } from "node:fs/promises";
import type { RotationRecord } from "../../src/calculations/rotationTimeline";
import type { buildPresetRotationBundle } from "../../src/App";
type Environment = Parameters<typeof buildPresetRotationBundle>[0];

const dataRoot = new URL("../../data/", import.meta.url);
// Rotations without an override use their path's default build.
export const snapshotBuildOverrides: Record<string, string> = {
  "bamboocutKite/dummy-1-min-infinite-vitality": "kite-fully-relayed-min",
  "stonesplitStrength/pure-dummy-1-min": "pure-fully-relayed-min",
  "stonesplitStrength/pure-dummy-1-min-2": "pure-fully-relayed-min",
  "stonesplitStrength/mixed-dummy-1-min-double-stab": "mixed-fully-relayed-double-min",
};
export const dpsSnapshotEnvironment = {
  breakthrough: "17",
  ping: 40,
  food: "SimmeringFishSlices",
  divinecraft: "Fire",
  script: "None",
  globalDebuffs: {
    phantomChime: false,
    qiImbalance: false,
    soulShaken: false,
    vulnerable: false,
    fearfulBlade: false,
    qingyisCharm: "none" as const,
    floatingGrace: "none" as const,
  },
};
export async function loadDpsSnapshotFixtures() {
  const paths = JSON.parse(await readFile(new URL("path.json", dataRoot), "utf8"));
  const cases = [];
  for (const pathId of Object.keys(paths).sort()) {
    const definition = paths[pathId];
    if (definition.status !== "available") continue;
    const directory = new URL("rotation/" + definition.buildGroup + "/", dataRoot);
    for (const file of (await readdir(directory)).filter((file) => file.endsWith(".json")).sort()) {
      const rotationId = file.slice(0, -5);
      const id = pathId + "/" + rotationId;
      const rotation = JSON.parse(await readFile(new URL(file, directory), "utf8")) as RotationRecord & {
        martialArts: Environment["martialArts"];
      };
      if (!rotation.steps.length) continue;
      cases.push({
        id,
        pathId: pathId as Environment["pathId"],
        buildGroup: definition.buildGroup as string,
        rotation,
        fixture: {
          build: snapshotBuildOverrides[id] ?? (definition.defaultBuild as string),
          rotation: rotationId,
          martialArts: rotation.martialArts!,
          ...dpsSnapshotEnvironment,
        },
      });
    }
  }
  if (!cases.length) throw new Error("No preset rotations found for DPS snapshots.");
  for (const id of Object.keys(snapshotBuildOverrides))
    if (!cases.some((entry) => entry.id === id)) throw new Error("Stale snapshot build override: " + id);
  return cases;
}
export function selectDpsSnapshotUpdates(raw: string, caseIds: string[]): string[] {
  if (!raw.trim()) return [];
  if (raw.trim() === "all") return [...caseIds];
  const tokens = raw.trim().split(/\s+/);
  const selected = new Set<string>();
  for (const token of tokens) {
    const matches = caseIds.filter((id) => id === token || id.startsWith(token + "/"));
    if (!matches.length) throw new Error("Unknown DPS snapshot selector: " + token);
    for (const id of matches) {
      if (selected.has(id)) throw new Error("Overlapping DPS snapshot selectors: " + id);
      selected.add(id);
    }
  }
  return [...selected].sort();
}
