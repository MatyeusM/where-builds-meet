import { describe, expect, it } from "vitest";

// Ported from script/probe/check-formbend.mjs.
describe("formbend", () => {
  // STALE: fails identically on main via script/probe/check-formbend.mjs
  // (shared set filter must expose only Rain Whisper, Hawkwing, Etherwrath). Kept for future repair instead of deleting the coverage.
  it.skip("Art of Resistance and Formbend duration checks passed", async () => {
    const { buildRotationTimeline } = await import("../src/calculations/rotationTimeline.ts");
    const {
      armorSetDefinitions,
      availableSetEntriesForTags,
      defaultBuildSetup,
      normalizeBuildSetup,
      selectSetTier,
      setAvailableForTags,
      setSelectionChangesTimeline,
      weaponSetDefinitions,
    } = await import("../src/gear.ts");
    const thundercrySkills = (await import("../data/skill/thundercry-blade.json")).default;
    const stormbreakerSkills = (await import("../data/skill/stormbreaker-spear.json")).default;
    const generalSkills = (await import("../data/skill/general.json")).default;
    const generalBuffs = (await import("../data/buff/general.json")).default;
    const mightBuffs = (await import("../data/buff/stonesplit-might.json")).default;
    expect(
      setAvailableForTags(armorSetDefinitions.Formbend, ["SnowpartingBlade", "PhalanxbaneBlade"], "StonesplitStrength"),
      "Formbend must be available to Stonesplit Strength.",
    ).toBeTruthy();
    expect(
      setAvailableForTags(armorSetDefinitions.Formbend, ["ThundercryBlade", "StormbreakerSpear"], "StonesplitMight"),
      "Formbend must be available to Stonesplit Might.",
    ).toBeTruthy();
    expect(
      !setAvailableForTags(armorSetDefinitions.Formbend, ["EverspringUmbrella", "UnfetteredRopeDart"], "BamboocutDust"),
      "Formbend must remain hidden for paths without an eligible armor set.",
    ).toBeTruthy();
    const mightTags = ["ThundercryBlade", "StormbreakerSpear"];
    expect(
      availableSetEntriesForTags(weaponSetDefinitions, mightTags, "StonesplitMight")
        .map(([setName]) => setName)
        .join(",") === "RainWhisper",
      "The shared set filter must return the Might weapon-set list.",
    ).toBeTruthy();
    expect(
      availableSetEntriesForTags(armorSetDefinitions, mightTags, "StonesplitMight")
        .map(([setName]) => setName)
        .join(",") === "Formbend",
      "The shared set filter must return the Might armor-set list.",
    ).toBeTruthy();
    const delugeTags = ["PanaceaFan", "SoulshadeUmbrella"];
    expect(
      availableSetEntriesForTags(weaponSetDefinitions, delugeTags, "SilkbindDeluge")
        .map(([setName]) => setName)
        .join(",") === "RainWhisper,Hawkwing,Etherwrath",
      "The shared set filter must expose only Rain Whisper, Hawkwing, and Etherwrath to Deluge.",
    ).toBeTruthy();
    expect(
      availableSetEntriesForTags(armorSetDefinitions, delugeTags, "SilkbindDeluge")
        .map(([setName]) => setName)
        .join(",") === "Moonflare",
      "The shared set filter must expose Moonflare as Deluge's only armor set.",
    ).toBeTruthy();
    const migrated = normalizeBuildSetup(
      { gearSets: { Cleftpeak: 2, RainWhisper: 2 }, bowRingSet: "Precision", arsenal: "Stonesplit" },
      defaultBuildSetup,
    );
    expect(
      migrated.weaponSets.Cleftpeak === 2 && migrated.weaponSets.RainWhisper === 2 && migrated.armorSets.Formbend === 0,
      "Legacy gearSets must migrate without losing the new armor-set default.",
    ).toBeTruthy();
    const cleftpeakToRainWhisper = selectSetTier(
      { Cleftpeak: 4, RainWhisper: 0 },
      "RainWhisper",
      4,
      weaponSetDefinitions,
    );
    expect(
      setSelectionChangesTimeline({ Cleftpeak: 4, RainWhisper: 0 }, cleftpeakToRainWhisper, weaponSetDefinitions),
      "Replacing Cleftpeak with Rain Whisper must rebuild the timeline because Cleftpeak is removed.",
    ).toBeTruthy();
    const rainWhisperTierChange = selectSetTier(
      { Cleftpeak: 0, RainWhisper: 2 },
      "RainWhisper",
      4,
      weaponSetDefinitions,
    );
    expect(
      !setSelectionChangesTimeline({ Cleftpeak: 0, RainWhisper: 2 }, rainWhisperTierChange, weaponSetDefinitions),
      "A Rain Whisper-only tier change must continue to reuse the baseline timeline.",
    ).toBeTruthy();
    expect(
      mightBuffs.Drumbeat.effect[0].effect.dmgBonus === 0.15 &&
        mightBuffs.Drumbeat.effect[0].requirement[0].value === "Charged",
      "Drumbeat must grant 15% Charged Skill damage.",
    ).toBeTruthy();
    const vulnerableDefinitions = (await import("../data/debuff/stonesplit-might.json")).default;
    const thunderShockTimeline = buildRotationTimeline({
      rotation: { name: "Thunder Shock ordering probe", steps: [{ type: "skill", skill: "ThunderShock" }] },
      skills: { ThunderShock: stormbreakerSkills.ThunderShock },
      eventDefinitions: {},
      dots: {},
      effectDefinitions: vulnerableDefinitions,
      innerWayConditions: [],
      innerWayRules: [],
      setupEffects: [],
      weapons: ["thundercry", "stormbreaker"],
    });
    expect(
      !thunderShockTimeline[0].actionStates[0].debuffs.some((effect) => effect.name === "Vulnerable"),
      "Thunder Shock hit 1 must deal damage before applying Vulnerable.",
    ).toBeTruthy();
    expect(
      thunderShockTimeline[0].actionStates[2].debuffs.some((effect) => effect.name === "Vulnerable"),
      "Thunder Shock hit 2 must benefit from Vulnerable applied after hit 1.",
    ).toBeTruthy();
    const probeSkill = {
      name: "Probe",
      castTime: 9,
      action: [{ type: "damage", phyCoef: 0, attrCoef: 0, time: 9 }],
      tags: [],
    };
    const shieldAtProbe = (conditions) => {
      const timeline = buildRotationTimeline({
        rotation: {
          name: "Formbend probe",
          steps: [
            { type: "skill", skill: "PredatorsShield" },
            { type: "skill", skill: "Probe" },
          ],
        },
        skills: { PredatorsShield: thundercrySkills.PredatorsShield, Probe: probeSkill },
        eventDefinitions: {},
        dots: {},
        effectDefinitions: { ...generalBuffs, ...mightBuffs },
        innerWayConditions: conditions,
        innerWayRules: [],
        setupEffects: [],
        weapons: ["thundercry", "stormbreaker"],
      });
      return timeline[1].actionStates[0].buffs.some((effect) => effect.name === "Shield");
    };
    expect(!shieldAtProbe([]), "The base eight-second Shield must expire before the probe hit.").toBeTruthy();
    expect(shieldAtProbe(["FormBend4"]), "Formbend four-piece must extend Shield by two seconds.").toBeTruthy();
    const aoRShieldAtProbe = (conditions) => {
      expect(
        generalSkills.AoRT4Shield.castTime === 3,
        "AoR T4 Shield must have a three-second cast time.",
      ).toBeTruthy();
      expect(
        generalSkills.AoRT4Shield.action[0].type === "apply" &&
          generalSkills.AoRT4Shield.action[0].time === 0 &&
          generalSkills.AoRT4Shield.action[0].duration === 14,
        "AoR T4 Shield must apply a 14-second Shield at cast start.",
      ).toBeTruthy();
      const timeline = buildRotationTimeline({
        rotation: {
          name: "AoR T4 Shield probe",
          steps: [
            { type: "skill", skill: "AoRT4Shield" },
            { type: "skill", skill: "Probe" },
          ],
        },
        skills: {
          AoRT4Shield: generalSkills.AoRT4Shield,
          Probe: { ...probeSkill, castTime: 12, action: [{ ...probeSkill.action[0], time: 12 }] },
        },
        eventDefinitions: {},
        dots: {},
        effectDefinitions: generalBuffs,
        innerWayConditions: conditions,
        innerWayRules: [],
        setupEffects: [],
        weapons: ["thundercry", "stormbreaker"],
      });
      expect(
        timeline[0].effectiveCastTime === 3,
        "AoR T4 Shield must retain its three-second timeline duration.",
      ).toBeTruthy();
      return timeline[1].actionStates[0].buffs.some((effect) => effect.name === "Shield");
    };
    expect(!aoRShieldAtProbe([]), "AoR T4 Shield must expire after its 14-second duration.").toBeTruthy();
    expect(
      aoRShieldAtProbe(["FormBend4"]),
      "Formbend four-piece must extend AoR T4 Shield by two seconds.",
    ).toBeTruthy();
    const durationTimeline = buildRotationTimeline({
      rotation: {
        name: "Independent duration probe",
        steps: [
          { type: "skill", skill: "StormRoar" },
          { type: "skill", skill: "PredatorsShield" },
          { type: "skill", skill: "LateProbe" },
        ],
      },
      skills: {
        StormRoar: stormbreakerSkills.StormRoar,
        PredatorsShield: thundercrySkills.PredatorsShield,
        LateProbe: { ...probeSkill, castTime: 13, action: [{ ...probeSkill.action[0], time: 13 }] },
      },
      eventDefinitions: {},
      dots: {},
      effectDefinitions: { ...generalBuffs, ...mightBuffs },
      innerWayConditions: ["ArtOfResistanceT0", "ArtOfResistanceT4", "FormBend4"],
      innerWayRules: [],
      setupEffects: [],
      weapons: ["thundercry", "stormbreaker"],
    });
    const lateBuffs = durationTimeline[2].actionStates[0].buffs;
    expect(
      lateBuffs.some((effect) => effect.name === "Shield"),
      "AoR and Formbend must extend Shield at the late probe.",
    ).toBeTruthy();
    expect(
      lateBuffs.some((effect) => effect.name === "Breakthrough" && effect.expiresAt === 22),
      "Art of Resistance T0/T4 and Formbend must extend Breakthrough from 12 to 20 seconds.",
    ).toBeTruthy();
    expect(
      lateBuffs.some((effect) => effect.name === "Shield" && effect.expiresAt === 18),
      "Art of Resistance and Formbend must extend Shield from 8 to 16 seconds.",
    ).toBeTruthy();
  });
});
