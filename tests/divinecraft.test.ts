import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";

// Ported from script/probe/check-divinecraft.mjs.
describe("divinecraft", () => {
  it("Divinecraft damage and healing-triggered Vitality checks passed", async () => {
    const definitions = (await import("../data/divinecraft.json")).default;
    const defaultSetup = (await import("../data/default-setup.json")).default;

    const damage = await import("../src/calculations/damage.ts");
    const timelineCalculation = await import("../src/calculations/rotationTimeline.ts");
    const statDefinitions = await import("../src/data/statDefinitions.ts");
    const effectiveStats = await import("../src/calculations/effectiveStats.ts");

    expect(
      Object.keys(definitions).length === 8,
      "Divinecraft data must contain seven effects and the None choice.",
    ).toBeTruthy();
    expect(defaultSetup.divinecraft === "Fire", "Fire must be the default Divinecraft.").toBeTruthy();
    expect(
      definitions.PoisonFire.available !== false && definitions.PoisonWater.available !== false,
      "The two Poison-first choices must be available.",
    ).toBeTruthy();
    for (const definition of Object.values(definitions)) {
      if (definition.image)
        expect(
          existsSync(`public/divinecraft/${definition.image}`),
          `Missing Divinecraft image: ${definition.image}`,
        ).toBeTruthy();
    }

    const stats = { ...statDefinitions.emptyStats, minPhys: 100, maxPhys: 100 };
    const context = {
      stats,
      attunement: {
        physicalPenetration: 0,
        formlessPenetration: 0,
        phalanxbaneChargedBoost: 0,
        phalanxbaneMartialBoost: 0,
        snowpartingChargedBoost: 0,
        snowpartingVariedComboBoost: 0,
        snowpartingMartialBoost: 0,
      },
      weapons: ["snowparting"],
      skillTags: [],
      buffs: [],
      enemy: {
        name: "Probe",
        level: 1,
        defense: 0,
        physicalResistance: 0,
        bellstrikeResistance: 0,
        stonesplitResistance: 0,
        silkbindResistance: 0,
        bamboocutResistance: 0,
        judgementResistance: 0,
      },
      derivedStats: effectiveStats.calculateDerivedStats(stats, 0),
      effects: [],
    };
    const damageFor = (id) =>
      damage.calculateDamageBreakdown({ phyCoef: 1, attrCoef: 1 }, { ...context, effects: [definitions[id].effect] })
        .total;
    const baseline = damage.calculateDamageBreakdown({ phyCoef: 1, attrCoef: 1 }, context).total;
    expect(
      Math.abs(damageFor("Fire") / baseline - 1.015) < 1e-9,
      "Fire HP damage must apply as a 1.5% Category 1 bonus.",
    ).toBeTruthy();
    expect(
      Math.abs(damageFor("WaterFire") / baseline - 1.014) < 1e-9,
      "Water-Fire HP damage must apply as a 1.4% Category 1 bonus.",
    ).toBeTruthy();
    expect(
      Math.abs(damageFor("WaterPoison") / baseline - 1.01) < 1e-9,
      "Water-Poison HP damage must apply as a 1% Category 1 bonus.",
    ).toBeTruthy();
    expect(
      Math.abs(damageFor("PoisonFire") / baseline - 1.014) < 1e-9,
      "Poison-Fire HP damage must apply as a 1.4% Category 1 bonus.",
    ).toBeTruthy();
    expect(
      Math.abs(damageFor("PoisonWater") / baseline - 1.01) < 1e-9,
      "Poison-Water HP damage must apply as a 1% Category 1 bonus.",
    ).toBeTruthy();
    expect(
      Math.abs(damageFor("FireWater") - damageFor("Fire")) < 1e-9,
      "A healing-triggered resource effect must not alter direct damage.",
    ).toBeTruthy();
    expect(
      Math.abs(damageFor("FirePoison") - damageFor("Fire")) < 1e-9,
      "Stored Qi damage must remain inert until implemented.",
    ).toBeTruthy();

    const vitalityAfterHeals = (id) => {
      const timeline = timelineCalculation.buildRotationTimeline({
        rotation: {
          name: `${id} healing trigger probe`,
          steps: [
            { type: "skill", skill: "HealingSequence" },
            { type: "skill", skill: "Observe" },
          ],
        },
        skills: {
          HealingSequence: {
            name: "Healing Sequence",
            castTime: 6.1,
            action: [
              { type: "heal", phyCoef: 1, silkbindCoef: 1, time: 0 },
              { type: "heal", phyCoef: 1, silkbindCoef: 1, time: 2.9 },
              { type: "heal", phyCoef: 1, silkbindCoef: 1, time: 3 },
              { type: "heal", phyCoef: 1, silkbindCoef: 1, time: 6 },
            ],
          },
          Observe: { name: "Observe", castTime: 0, action: [] },
        },
        eventDefinitions: {},
        dots: {},
        effectDefinitions: {},
        innerWayConditions: [],
        innerWayRules: [],
        setupEffects: [definitions[id].effect],
        weapons: [],
        initialResources: { Vitality: 0 },
        resourceMaximums: { Vitality: 100 },
      });
      return timeline.find((row) => row.step.type === "skill" && row.step.skill === "Observe")?.resources.Vitality;
    };

    [
      ["FireWater", 2.4],
      ["WaterFire", 3],
      ["WaterPoison", 3],
      ["PoisonWater", 2.4],
    ].forEach(([id, expected]) => {
      expect(
        Math.abs(vitalityAfterHeals(id) - expected) < 1e-9,
        `${id} must grant Vitality on the first heal and again at each three-second cooldown boundary.`,
      ).toBeTruthy();
    });
    expect(
      vitalityAfterHeals("Fire") === 0,
      "Divinecraft without a healing trigger must not grant Vitality.",
    ).toBeTruthy();
  });
});
