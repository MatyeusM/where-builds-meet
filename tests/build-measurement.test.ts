import { assert, describe, it } from "vitest"

import { breakthroughProfile } from "../src/application/gameData/setup"
import { buildMeasurement, type MeasurementContext } from "../src/calculations/rotationCalculationBundle"
import { defaultBuildPresets, type BuildEntry } from "../src/gear"
import { defaultGlobalDebuffs } from "../src/globalDebuffs"
import { loadDpsSnapshotFixtures } from "./helpers/dps-snapshot-fixtures"
import { dpsSnapshotEnvironment } from "./helpers/dps-snapshot-fixtures"

/**
 * A build that is not the active one is measured from the same assembly the rotation editor
 * uses, so these pin the properties that make its number mean anything: that the gear belongs
 * to the build being measured, that the same build always measures to the same key so the
 * cache can answer it, and that unsaved setup edits are not borrowed from another build.
 */
async function fixture() {
  const fixtures = await loadDpsSnapshotFixtures()
  const entry = fixtures.find(candidate => candidate.id === "stonesplitStrength/mixed-dummy-1-min")
  assert(entry, "The strength fixture must exist.")
  const settings = {
    weapons: entry.fixture.martialArts,
    breakthrough: dpsSnapshotEnvironment.breakthrough,
    ping: dpsSnapshotEnvironment.ping,
  }
  const context: MeasurementContext = {
    environment: {
      pathId: entry.pathId,
      settings,
      setupSelections: {
        food: dpsSnapshotEnvironment.food,
        script: dpsSnapshotEnvironment.script,
        divinecraft: dpsSnapshotEnvironment.divinecraft,
      },
      skillOverrides: {},
      globalDebuffs: dpsSnapshotEnvironment.globalDebuffs,
      enemy: breakthroughProfile(settings),
    },
    statOverrides: {},
    attunementOverrides: {},
  }
  return { rotation: entry.rotation, context, presets: defaultBuildPresets }
}

function presetEntry(id: string): BuildEntry {
  const preset = defaultBuildPresets.find(candidate => candidate.id === id)
  assert(preset, `The ${id} preset must exist.`)
  return { id: `build-${id}`, name: id, isDefault: true, presetId: id }
}

describe("measuring a build that is not the active one", () => {
  it("measures the gear of the build it was given, not the active build's", async () => {
    const { rotation, context, presets } = await fixture()
    const first = presetEntry(presets[0].id)
    const second = presetEntry(presets[1].id)
    assert.notEqual(first.presetId, second.presetId, "The comparison needs two different builds.")

    const a = buildMeasurement({ build: first, gearItems: [], context, rotation })
    const b = buildMeasurement({ build: second, gearItems: [], context, rotation })

    assert.notEqual(
      a.cacheKey,
      b.cacheKey,
      "Two builds measured to the same key, so one would be answered with the other's numbers.",
    )
    assert.notDeepEqual(
      a.bundle.stats,
      b.bundle.stats,
      "Two builds produced the same stats, so the gear is not reaching the calculation.",
    )
  })

  it("measures the same build to the same key every time, so a revisit is answered from the cache", async () => {
    const { rotation, context, presets } = await fixture()
    const build = presetEntry(presets[0].id)
    const first = buildMeasurement({ build, gearItems: [], context, rotation })
    const second = buildMeasurement({ build: presetEntry(presets[0].id), gearItems: [], context, rotation })
    assert.equal(second.cacheKey, first.cacheKey, "The same build measured to two different keys.")
  })

  it("applies unsaved setup edits to the build they were made on and to no other", async () => {
    const { rotation, context, presets } = await fixture()
    const build = presetEntry(presets[0].id)
    const saved = buildMeasurement({ build, gearItems: [], context, rotation })

    const edited: MeasurementContext = {
      ...context,
      buildSetupOverrides: { buildId: build.id, overrides: { arsenal: "Stonesplit" } },
    }
    const withEdits = buildMeasurement({ build, gearItems: [], context: edited, rotation })
    assert.notEqual(
      withEdits.cacheKey,
      saved.cacheKey,
      "An unsaved setup edit did not reach the build it was made on, so the sheet and its DPS disagree.",
    )

    // The same edit, carried while measuring some other build, must leave that build alone: the
    // edits belong to whichever build's sheet is on screen, not to every build.
    const other = presetEntry(presets[1].id)
    const asSaved = buildMeasurement({ build: other, gearItems: [], context, rotation })
    const borrowed = buildMeasurement({ build: other, gearItems: [], context: edited, rotation })
    assert.equal(
      borrowed.cacheKey,
      asSaved.cacheKey,
      "Another build's unsaved setup edits leaked into a build that was only being compared.",
    )
  })

  it("resolves a build that no longer exists to an empty sheet rather than the active build's", async () => {
    const { rotation, context, presets } = await fixture()
    const missing = buildMeasurement({ build: undefined, gearItems: [], context, rotation })
    const aBuild = buildMeasurement({ build: presetEntry(presets[0].id), gearItems: [], context, rotation })
    assert.notEqual(missing.cacheKey, aBuild.cacheKey, "A missing build was measured as a real one.")
  })

  it("leaves the sheet's own overrides out of the bundle key when nothing is overridden", async () => {
    const { rotation, context, presets } = await fixture()
    const plain = buildMeasurement({ build: presetEntry(presets[0].id), gearItems: [], context, rotation })
    const withEmptyOverrides: MeasurementContext = {
      ...context,
      buildSetupOverrides: { buildId: "some-other-build", overrides: {} },
    }
    const same = buildMeasurement({
      build: presetEntry(presets[0].id),
      gearItems: [],
      context: withEmptyOverrides,
      rotation,
    })
    assert.equal(same.cacheKey, plain.cacheKey, "An empty override changed what a build measures to.")
  })
})

describe("global debuff selection", () => {
  it("is read as a stable value, so a re-render does not look like a changed selection", async () => {
    const { loadGlobalDebuffs } = await import("../src/globalDebuffs")
    assert.equal(loadGlobalDebuffs(), loadGlobalDebuffs(), "Reading the selection twice produced two objects.")
    assert.deepEqual(loadGlobalDebuffs(), defaultGlobalDebuffs)
  })
})
