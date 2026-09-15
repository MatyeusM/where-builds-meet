import { resolvePing } from "../src/calculations/combatDefaults";
import { describe, expect, it } from "vitest";
import { readdir, readFile } from "node:fs/promises";
import { loadDpsSnapshotFixtures, selectDpsSnapshotUpdates } from "./helpers/dps-snapshot-fixtures";
import { compareDpsSnapshots } from "./helpers/dps-snapshot-guard.mjs";

describe("rotation DPS snapshot fixtures", () => {
  it("discovers every non-empty preset with a compatible build", async () => {
    const cases = await loadDpsSnapshotFixtures();
    const snapshots = JSON.parse(await readFile("tests/snapshots/rotation-dps.json", "utf8"));
    const paths = JSON.parse(await readFile("data/path.json", "utf8"));
    const files = await readdir("data/rotation", { recursive: true });
    const expected = [];
    for (const file of files.filter((file) => file.endsWith(".json"))) {
      const rotation = JSON.parse(await readFile("data/rotation/" + file, "utf8"));
      expect(Number.isFinite(rotation.ping), "Preset must store its own ping: " + file).toBe(true);
      expect(resolvePing(rotation.ping, 85), "Preset ping must ignore Settings: " + file).toBe(rotation.ping);
      if (!rotation.steps.length) continue;
      const group = file.replaceAll("\\", "/").split("/")[0];
      const pathId = Object.keys(paths).find((id) => paths[id].buildGroup === group);
      expect(pathId, "Rotation has no path: " + file).toBeDefined();
      expect(paths[pathId!].status, "Non-empty preset must be included in DPS coverage: " + file).toBe("available");
      expected.push(pathId + "/" + file.replaceAll("\\", "/").split("/").at(-1)!.slice(0, -5));
    }
    expect(cases.map((c) => c.id).sort()).toEqual(expected.sort());
    for (const entry of cases) {
      const build = JSON.parse(
        await readFile("data/build/" + entry.buildGroup + "/" + entry.fixture.build + ".json", "utf8"),
      );
      expect(build.martialArts.slice().sort()).toEqual(entry.fixture.martialArts.slice().sort());
      expect(entry.fixture.ping).toBe(entry.rotation.ping);
    }
    expect(compareDpsSnapshots(snapshots.cases, snapshots.cases)).toEqual([]);
  });
  it("updates one rotation, an entire path, or all cases without accepting unrelated results", () => {
    const ids = ["kite/regular", "kite/bp", "deluge/wts"];
    expect(selectDpsSnapshotUpdates("", ids)).toEqual([]);
    expect(selectDpsSnapshotUpdates("kite/regular", ids)).toEqual(["kite/regular"]);
    expect(selectDpsSnapshotUpdates("kite", ids)).toEqual(["kite/bp", "kite/regular"]);
    expect(selectDpsSnapshotUpdates("kite/bp deluge/wts", ids)).toEqual(["deluge/wts", "kite/bp"]);
    expect(selectDpsSnapshotUpdates("all", ids)).toEqual(ids);
    for (const selector of ["missing", "kite kite/bp", "kite/bp kite/bp", "kit"])
      expect(() => selectDpsSnapshotUpdates(selector, ids)).toThrow();
  });
  it("detects a sibling rotation regression or missing baseline independently", () => {
    const sample = (dps: number) => ({ fixture: { build: "same" }, dps, totalDamage: dps * 60, duration: 60 });
    const old = { "kite/regular": sample(100), "kite/bp": sample(100) };
    expect(compareDpsSnapshots(old, { ...old, "kite/regular": sample(99), "kite/bp": sample(101) })).toHaveLength(2);
    expect(compareDpsSnapshots(old, { "kite/regular": old["kite/regular"] })).toHaveLength(1);
  });
});
