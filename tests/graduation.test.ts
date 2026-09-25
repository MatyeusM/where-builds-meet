import { assert, describe, it } from "vitest"

import { typedPathDefinitions } from "../src/application/gameData/paths"
import {
  buildGraduationBundleSet,
  selectHighestGraduationResult,
  type GraduationPresetEnvironment,
} from "../src/application/graduation"
import { calculateRotationBaseline } from "../src/calculations/rotationCalculator"
import { loadDpsSnapshotFixtures } from "./helpers/dps-snapshot-fixtures"

describe("graduation", () => {
  it("selects the highest-DPS Strength graduate for each playstyle rotation", async () => {
    const fixtures = await loadDpsSnapshotFixtures()
    const scenarios = [
      { rotationId: "stonesplitStrength/mixed-dummy-1-min", winningBuildId: "mixed-full-min" },
      { rotationId: "stonesplitStrength/pure-dummy-1-min", winningBuildId: "pure-full-min" },
    ] as const

    for (const scenario of scenarios) {
      const fixture = fixtures.find(entry => entry.id === scenario.rotationId)
      assert(fixture, `${scenario.rotationId} fixture must exist.`)
      const path = typedPathDefinitions[fixture.pathId]
      const environment: GraduationPresetEnvironment = {
        pathId: fixture.pathId,
        martialArts: fixture.fixture.martialArts,
        rotation: { ...fixture.rotation, ping: fixture.fixture.ping },
        breakthrough: fixture.fixture.breakthrough,
        globalDebuffs: fixture.fixture.globalDebuffs,
        food: fixture.fixture.food,
        script: fixture.fixture.script,
        divinecraft: fixture.fixture.divinecraft,
        graduatedBuildIds: path.graduated,
        skillOverrides: {},
      }
      const prepared = buildGraduationBundleSet(environment)
      assert(prepared, `${scenario.rotationId} must resolve its graduate builds.`)
      const candidateIds = prepared.candidates.map(candidate => candidate.buildId)
      assert.lengthOf(candidateIds, 2)
      assert.include(candidateIds, "mixed-full-min")
      assert.include(candidateIds, "pure-full-min")

      const baselines = prepared.candidates.map(candidate => calculateRotationBaseline(candidate.bundle))
      const highest = selectHighestGraduationResult(baselines)
      assert(highest, `${scenario.rotationId} must select a calculated preset.`)
      const highestIndex = baselines.indexOf(highest)
      assert.equal(highest.metrics.dps, Math.max(...baselines.map(result => result.metrics.dps)))
      assert.equal(candidateIds[highestIndex], scenario.winningBuildId)
      assert.isAbove(highest.metrics.dps, 0)
    }
  })
})
