import { readdir, readFile } from "node:fs/promises"

import { assert, describe, expect, it } from "vitest"

import { resolvePing } from "../src/calculations/combatDefaults"
import { loadDpsSnapshotFixtures, selectDpsSnapshotUpdates } from "./helpers/dps-snapshot-fixtures"
import { compareDpsSnapshots } from "./helpers/dps-snapshot-guard.mjs"

describe("rotation DPS snapshot fixtures", () => {
  it("discovers every non-empty preset with a compatible build", async () => {
    const cases = await loadDpsSnapshotFixtures()
    const snapshots = JSON.parse(await readFile("tests/snapshots/rotation-dps.json", "utf8"))
    const paths = JSON.parse(await readFile("data/path.json", "utf8"))
    const files = await readdir("data/rotation", { recursive: true })
    const expected = []
    const rotations = await Promise.all(
      files
        .filter(file => file.endsWith(".json"))
        .map(async file => ({ file, rotation: JSON.parse(await readFile("data/rotation/" + file, "utf8")) })),
    )
    for (const { file, rotation } of rotations) {
      assert(Number.isFinite(rotation.ping), "Preset must store its own ping: " + file)
      assert(resolvePing(rotation.ping, 85) === rotation.ping, "Preset ping must ignore Settings: " + file)
      if (!rotation.steps.length) continue
      const group = file.replaceAll("\\", "/").split("/")[0]
      const pathId = Object.keys(paths).find(id => paths[id].buildGroup === group)
      assert(pathId !== undefined, "Rotation has no path: " + file)
      expected.push(pathId + "/" + file.replaceAll("\\", "/").split("/").at(-1)!.slice(0, -5))
    }
    expect(cases.map(c => c.id).sort()).toEqual(expected.sort())
    await Promise.all(
      cases.map(async entry => {
        const build = JSON.parse(
          await readFile("data/build/" + entry.buildGroup + "/" + entry.fixture.build + ".json", "utf8"),
        )
        expect(build.martialArts.slice().sort()).toEqual(entry.fixture.martialArts.slice().sort())
        expect(entry.fixture.ping).toBe(entry.rotation.ping)
      }),
    )
    expect(compareDpsSnapshots(snapshots.cases, snapshots.cases)).toEqual([])
  })
  it("updates one rotation, an entire path, or all cases without accepting unrelated results", () => {
    const ids = ["kite/regular", "kite/bp", "deluge/wts"]
    expect(selectDpsSnapshotUpdates("", ids)).toEqual([])
    expect(selectDpsSnapshotUpdates("kite/regular", ids)).toEqual(["kite/regular"])
    expect(selectDpsSnapshotUpdates("kite", ids)).toEqual(["kite/bp", "kite/regular"])
    expect(selectDpsSnapshotUpdates("kite/bp deluge/wts", ids)).toEqual(["deluge/wts", "kite/bp"])
    expect(selectDpsSnapshotUpdates("all", ids)).toEqual(ids)
    for (const selector of ["missing", "kite kite/bp", "kite/bp kite/bp", "kit"])
      expect(() => selectDpsSnapshotUpdates(selector, ids)).toThrow(
        /Unknown DPS snapshot selector|Overlapping DPS snapshot selectors/,
      )
  })
  it("detects a sibling rotation regression or missing baseline independently", () => {
    const sample = (dps: number) => ({ fixture: { build: "same" }, dps, totalDamage: dps * 60, duration: 60 })
    const old = { "kite/regular": sample(100), "kite/bp": sample(100) }
    expect(compareDpsSnapshots(old, { ...old, "kite/regular": sample(99), "kite/bp": sample(101) })).toHaveLength(2)
    expect(compareDpsSnapshots(old, { "kite/regular": old["kite/regular"] })).toHaveLength(1)
  })
})
