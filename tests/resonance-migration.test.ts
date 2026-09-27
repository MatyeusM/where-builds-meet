import { expect, it } from "vitest"

import { deserializeSkillOverrides, serializeSkillOverrides } from "../src/skillOverrides"

it("preserves customized shared Resonance damage and routes across migration and reload", () => {
  const overrides = deserializeSkillOverrides({
    version: 3,
    overrides: {
      Everspring: {
        Resonance: { action: [{ type: "damage", time: 0, phyCoef: 7 }] },
        PhantomUmbrellaSummon: { action: [{ type: "trigger", value: "Resonance", time: 0, inheritTags: true }] },
        DreamwroughtBubblesRelease: {
          action: [{ type: "trigger", value: "PhantomUmbrellaSummon", time: 0.8, inheritTags: true }],
        },
      },
    },
  })
  const skills = overrides.Everspring!
  expect(skills.Resonance.action).toEqual(skills.BubblesResonance.action)
  expect(skills.BubblesResonance.action?.[0].phyCoef).toBe(7)
  expect(skills.Resonance.tags).toContain("MartialArt")
  expect(skills.BubblesResonance.tags).toEqual(expect.arrayContaining(["Heavy", "Charged"]))
  expect(skills.BubblesResonance.tags).not.toContain("MartialArt")
  expect(skills.BubblesPhantomUmbrellaSummon.action?.[0].value).toBe("BubblesResonance")
  expect(skills.DreamwroughtBubblesRelease.action?.[0].value).toBe("BubblesPhantomUmbrellaSummon")
  expect(skills.PhantomUmbrellaSummon.action?.[0]).not.toHaveProperty("inheritTags")
  expect(deserializeSkillOverrides(JSON.parse(serializeSkillOverrides(overrides)))).toEqual(overrides)
})

it("keeps new Scarlet Spin-only overrides separate after saving", () => {
  const original = { Everspring: { Resonance: { action: [{ type: "damage", phyCoef: 7 }] } } }
  expect(deserializeSkillOverrides(JSON.parse(serializeSkillOverrides(original)))).toEqual(original)
})
