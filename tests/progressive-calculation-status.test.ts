import { assert, describe, it } from "vitest"

// Ported from script/probe/check-progressive-calculation-status.mjs.
describe("progressive-calculation-status", () => {
  it("Progressive calculation status probe passed", async () => {
    const {
      beginRotationCalculation,
      completeRotationCalculationCategory,
      endRotationCalculation,
      getRotationCalculationStatus,
      publishRotationCategoryProgress,
      rotationCalculationCategories,
    } = await import("../src/calculations/rotationMetrics.ts")
    const expectedOrder = [
      "baseline",
      "statPriority",
      "attunementPriority",
      "weaponSets",
      "armorSets",
      "bowRingSet",
      "arsenal",
      "globalDebuffs",
      "innerWays",
      "script",
      "divinecraft",
      "food",
    ]
    assert(
      JSON.stringify(rotationCalculationCategories) === JSON.stringify(expectedOrder),
      "Progressive calculation categories are not in the required order.",
    )

    beginRotationCalculation()
    const started = getRotationCalculationStatus()
    assert(
      !rotationCalculationCategories.some(
        category => !started[category].recalculating || started[category].progress !== undefined,
      ),
      "Every category must begin pending, reporting no progress until it measures some.",
    )

    publishRotationCategoryProgress("statPriority", 0.5)
    const progressing = getRotationCalculationStatus()
    assert(
      !(progressing.statPriority.progress !== 0.5 || progressing.attunementPriority.progress !== undefined),
      "Category progress must update independently, and only for the category that reported it.",
    )

    completeRotationCalculationCategory("statPriority")
    const completed = getRotationCalculationStatus()
    assert(
      !(completed.statPriority.recalculating || completed.statPriority.progress !== undefined),
      "A completed category must be idle, carrying no progress to report.",
    )

    endRotationCalculation()
    assert(
      !rotationCalculationCategories.some(category => getRotationCalculationStatus()[category].recalculating),
      "Ending a calculation must clear every remaining category status.",
    )
  })
})
