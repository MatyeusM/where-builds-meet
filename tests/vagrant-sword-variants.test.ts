import assert from "node:assert/strict"

import { describe, it } from "vitest"

import swordMorph from "../data/innerway/sword-morph.json"
import namelessSwordSkills from "../data/skill/nameless-sword.json"
import { calculateDerivedStats } from "../src/calculations/effectiveStats"
import { calculateRotationBaseline } from "../src/calculations/rotationCalculator"
import { emptyStats } from "../src/data/statDefinitions"

const weaponIds = ["namelessSword", "namelessSpear"] as never[]

describe("vagrant-sword-charge-variants", () => {
  it("swaps Vagrant Sword's single wave for the three sword energies under Sword Morph", async () => {
    const { defaultSkillMaps, defaultEditorMaps } = await import("../src/application/gameData/skills")
    const stats = { ...emptyStats, minPhys: 100, maxPhys: 100, minBellstrike: 100, maxBellstrike: 100, precision: 1 }
    const run = (tiers: string[], shielded: boolean) =>
      calculateRotationBaseline({
        timeline: {
          rotation: {
            name: "Vagrant Sword",
            steps: shielded
              ? [
                  { type: "skill", skill: "RaiseShield" },
                  { type: "skill", skill: "VagrantSword2" },
                ]
              : [{ type: "skill", skill: "VagrantSword2" }],
          },
          skills: {
            ...(defaultSkillMaps.NamelessSword as Record<string, unknown>),
            RaiseShield: {
              castTime: 0,
              tags: ["General"],
              action: [{ type: "apply", target: "self", value: "Shield", duration: 30, time: 0 }],
            },
          },
          effectDefinitions: { ...defaultEditorMaps.Buff, ...defaultEditorMaps.Debuff },
          initialResources: {},
          dots: {},
          eventDefinitions: {},
          innerWayRules: [],
          innerWayConditions: tiers,
          setupEffects: [],
          weapons: weaponIds,
        },
        stats,
        derivedStats: calculateDerivedStats(stats, 0),
        enemy: {
          name: "Vagrant Sword probe",
          level: 96,
          defense: 0,
          physicalResistance: 0,
          bellstrikeResistance: 0,
          stonesplitResistance: 0,
          silkbindResistance: 0,
          bamboocutResistance: 0,
          judgementResistance: 0,
        },
        weapons: weaponIds,
        attunement: {},
        startAnchor: { rowId: "rotation-0" },
        statPriority: [],
        attunementPriority: [],
        innerWayPriority: [],
        setupComparisons: {},
      })

    const damageFor = (result: ReturnType<typeof run>, skill: string) =>
      result.timeline
        .filter(row => row.skill?.name === skill)
        .flatMap(row =>
          row.actions.flatMap((action, index) => {
            const hit = result.actionBreakdowns[`${row.id}:${index}`]
            return action.type === "damage" && hit ? [{ name: row.skill!.name, total: hit.total }] : []
          }),
        )

    const plain = run([], false)
    const plainHits = damageFor(plain, "Vagrant Sword [Charge Tier 2]")
    assert.equal(plainHits.length, 1, "Without Sword Morph the release is a single wave")
    assert.equal(damageFor(plain, "Sword Energy 1").length, 0, "No sword energy without Sword Morph")

    // An unshielded release stays on the single wave even with the Inner Way selected.
    assert.equal(
      run(["SwordMorphT0"], false).timeline.filter(row => row.skill?.name === "Sword Energy 1").length,
      0,
      "Sword Morph needs the Qi shield active",
    )

    const morphed = run(["SwordMorphT0"], true)
    assert.equal(
      damageFor(morphed, "Vagrant Sword [Charge Tier 2]").length,
      0,
      "The three-wave route replaces the single wave rather than adding to it",
    )
    const energies = [1, 2, 3].map(index => damageFor(morphed, `Sword Energy ${index}`))
    energies.forEach((hits, offset) => assert.equal(hits.length, 1, `Sword Energy ${offset + 1} must land once`))
    const [first, second, third] = energies.map(hits => hits[0].total)
    assert.ok(
      first < second && second < third,
      `Sword energy damage must grow per wave, got ${energies.map(hits => hits[0].total)}`,
    )
    assert.ok(first + second + third > plainHits[0].total, "The three waves together must out-damage the single wave")

    // The sword energies are what the Nameless Sword `SwordEnergy` talents match.
    for (const index of [1, 2, 3] as const) {
      const tags = namelessSwordSkills[`SwordEnergy${index}`].tags as string[]
      assert.ok(tags.includes("SwordEnergy"), `Sword Energy ${index} needs the SwordEnergy tag`)
      assert.ok(tags.includes("Triggered"), `Sword Energy ${index} must stay out of the castable selector`)
      for (const category of ["Charged", "Heavy"])
        assert.ok(tags.includes(category), `Sword Energy ${index} must repeat the parent's ${category} tag`)
    }
    assert.ok(
      Object.keys(swordMorph.effect).includes("SwordMorphT0"),
      "Sword Morph must publish the T0 condition the release reads",
    )
  })
})
