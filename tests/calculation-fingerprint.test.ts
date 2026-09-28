import { assert, describe, it } from "vitest"

// Ported from script/probe/check-calculation-fingerprint-cache.mjs.
describe("calculation-fingerprint", () => {
  it("Fingerprint probe passed", async () => {
    const { calculationFingerprint, rotationBundleFingerprint } =
      await import("@/calculations/calculationFingerprint.ts")
    const setupA = calculationFingerprint({ stats: { minPhys: 1 }, selector: "A", rotation: ["SkillA"] })
    const setupB = calculationFingerprint({ stats: { minPhys: 2 }, selector: "B", rotation: ["SkillA"] })
    const setupC = calculationFingerprint({ stats: { minPhys: 3 }, selector: "C", rotation: ["SkillA"] })

    assert(new Set([setupA, setupB, setupC]).size === 3, "Distinct setup inputs produced duplicate fingerprints.")

    const namedRotationBundle = (name, skill, weapons = ["snowparting", "phalanxbane"]) => ({
      timeline: { rotation: { name, steps: [{ type: "skill", skill }] } },
      weapons,
    })
    const rotationA = rotationBundleFingerprint(namedRotationBundle("First name", "SkillA"))
    const renamedRotationA = rotationBundleFingerprint(namedRotationBundle("Renamed", "SkillA"))
    const rotationB = rotationBundleFingerprint(namedRotationBundle("First name", "SkillB"))
    const reversedMartialArts = rotationBundleFingerprint(
      namedRotationBundle("First name", "SkillA", ["phalanxbane", "snowparting"]),
    )
    assert(rotationA === renamedRotationA, "Display-only rotation names changed the calculation fingerprint.")
    assert(rotationA !== rotationB, "Different rotation step content produced the same fingerprint.")
    assert(rotationA !== reversedMartialArts, "Different ordered martial-art selections produced the same fingerprint.")

    const rotationSettings = [
      ["target HP", { targetHP: 100000 }],
      ["practice target", { targetType: "Boss" }],
      ["group size", { groupSize: 5 }],
      ["enemy count", { enemyCount: 3 }],
      ["infinite Vitality", { infiniteVitality: true }],
      ["battle-start event timing", { eventTimeReference: "battleStart" }],
      ["battle start anchor", { start: { step: 0, action: 0 } }],
    ]
    const baseRotation = { name: "Settings", steps: [{ type: "skill", skill: "SkillA" }], groupSize: 1 }
    const baseSettingsFingerprint = rotationBundleFingerprint({ timeline: { rotation: baseRotation }, weapons: [] })
    for (const [label, setting] of rotationSettings) {
      const changedFingerprint = rotationBundleFingerprint({
        timeline: { rotation: { ...baseRotation, ...setting } },
        weapons: [],
      })
      assert(
        changedFingerprint !== baseSettingsFingerprint,
        `Changing ${label} did not change the rotation calculation fingerprint.`,
      )
    }
  })
})
