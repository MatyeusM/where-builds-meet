import { readFile, writeFile } from "node:fs/promises";
import { createServer } from "vite";
import { format } from "prettier";
import { compareDpsSnapshots } from "./dps-snapshot-guard.mjs";

const snapshotFile = new URL("./snapshots/path-dps.json", import.meta.url);
const paths = JSON.parse(await readFile(new URL("../../data/path.json", import.meta.url), "utf8"));
const pathIds = Object.keys(paths)
  .filter((id) => paths[id].status === "available")
  .sort();
if (!pathIds.length) throw new Error("No implemented paths found for DPS snapshots.");
const args = process.argv.slice(2);
let updateIds = [];
switch (args[0]) {
  case undefined:
    break;
  case "--update":
    updateIds = args.slice(1);
    if (updateIds.length === 1 && updateIds[0] === "--all") updateIds = pathIds;
    if (
      !updateIds.length ||
      new Set(updateIds).size !== updateIds.length ||
      updateIds.some((id) => !pathIds.includes(id))
    ) {
      throw new Error(
        `Choose reviewed paths explicitly: npm run snapshots:dps:update -- <pathId...> (or --all). Available: ${pathIds.join(", ")}`,
      );
    }
    break;
  default:
    throw new Error("Usage: npm run test:dps, or npm run snapshots:dps:update -- <pathId...|--all>");
}
let snapshot;
try {
  snapshot = JSON.parse(await readFile(snapshotFile, "utf8"));
  if (
    snapshot.schemaVersion !== 1 ||
    !snapshot.cases ||
    typeof snapshot.cases !== "object" ||
    Array.isArray(snapshot.cases)
  ) {
    throw new Error("Invalid DPS snapshot format.");
  }
} catch (error) {
  if (error.code !== "ENOENT" || !updateIds.length) throw error;
  snapshot = { schemaVersion: 1, cases: {} };
}

// Explicit settings prevent browser preferences or changing defaults from moving the baseline.
const environment = {
  breakthrough: "17",
  food: "SimmeringFishSlices",
  divinecraft: "Fire",
  script: "None",
  globalDebuffs: {
    phantomChime: false,
    qiImbalance: false,
    soulShaken: false,
    vulnerable: false,
    fearfulBlade: false,
    qingyisCharm: "none",
    floatingGrace: "none",
  },
};
const server = await createServer({
  configFile: false,
  server: { middlewareMode: true },
  appType: "custom",
  logLevel: "silent",
  optimizeDeps: { noDiscovery: true, include: [] },
});
try {
  const { buildPresetRotationBundle } = await server.ssrLoadModule("/src/App.tsx");
  const { calculateRotationBaseline } = await server.ssrLoadModule("/src/calculations/rotationCalculator.ts");
  const actual = {};
  for (const pathId of pathIds) {
    const path = paths[pathId];
    const rotation = (await server.ssrLoadModule(`/data/rotation/${path.buildGroup}/${path.defaultRotation}.json`))
      .default;
    const fixture = {
      build: path.defaultBuild,
      rotation: path.defaultRotation,
      martialArts: path.lockedWeapons,
      ...environment,
    };
    const bundle = buildPresetRotationBundle(
      { pathId, martialArts: path.lockedWeapons, rotation, ...environment, skillOverrides: {} },
      path.defaultBuild,
    );
    if (!bundle) throw new Error(`${pathId}: failed to build the production preset calculation bundle.`);
    const { metrics, duration } = calculateRotationBaseline(bundle);
    actual[pathId] = { fixture, dps: metrics.dps, totalDamage: metrics.totalDamage, duration };
    const previous = snapshot.cases[pathId]?.dps;
    const change =
      previous > 0
        ? `; baseline ${previous.toFixed(2)}, change ${(((metrics.dps - previous) / previous) * 100).toFixed(2)}%`
        : "; no accepted baseline";
    console.log(`${pathId}: ${metrics.dps.toFixed(2)} DPS${change}`);
  }
  // Reject invalid outputs even when the user explicitly requests an update.
  const invalid = compareDpsSnapshots(actual, actual);
  if (invalid.length) throw new Error(invalid.join("\n"));
  if (updateIds.length) {
    const next = { ...snapshot.cases };
    for (const pathId of updateIds) next[pathId] = actual[pathId];
    if (args[1] === "--all") for (const id of Object.keys(next)) if (!pathIds.includes(id)) delete next[id];
    const value = {
      schemaVersion: 1,
      cases: Object.fromEntries(Object.entries(next).sort(([a], [b]) => a.localeCompare(b))),
    };
    await writeFile(snapshotFile, await format(JSON.stringify(value), { parser: "json", printWidth: 120 }), "utf8");
    console.log(`Updated reviewed DPS snapshots: ${updateIds.join(", ")}. Inspect and commit the snapshot diff.`);
  } else {
    const failures = compareDpsSnapshots(snapshot.cases, actual);
    if (failures.length)
      throw new Error(
        `${failures.join("\n")}\nReview each change. Fix regressions; update only paths whose changes have been confirmed correct. Never refresh snapshots automatically to make this check pass.`,
      );
    console.log("All implemented paths remain within 5% of their accepted DPS snapshots.");
  }
} finally {
  await server.close();
}
