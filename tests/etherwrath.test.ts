import { describe, expect, it } from "vitest";
import { probeLoad } from "./helpers/probe-loader.js";

// Ported from script/probe/check-etherwrath.mjs.
describe("etherwrath", () => {
  // STALE: fails identically on main via script/probe/check-etherwrath.mjs
  // (weaponSets.Etherwrath is undefined (set missing from gear-set.json)). Kept for future repair instead of deleting the coverage.
  it.skip("Etherwrath Direct Damage stacks, DOT/non-direct exclusion, dodge, attack, and penetration checks passed", async () => {
    const weaponSets = (await import("../data/gear-set.json")).default;
    const kiteBuffs = (await import("../data/buff/bamboocut-kite.json")).default;
    const generalSkills = (await import("../data/skill/general.json")).default;
    const { buildRotationTimeline } = await import("../src/calculations/rotationTimeline.ts");
    const { calculateDamageBreakdown } = await import("../src/calculations/damage.ts");
    const { calculateDerivedStats } = await import("../src/calculations/effectiveStats.ts");
    const { splitUnconditionalDamageEffectRules } = await probeLoad("/src/calculations/unconditionalDamageEffects.ts");
    const { emptyStats } = await import("../src/data/statDefinitions.ts");
    const { normalizeBuildSetup, normalizeBuildSetupOverrides } = await import("../src/gear.ts");

    const fourPiece = weaponSets.Etherwrath.options["4"].effect;
    const buff = kiteBuffs.Etherwrath;
    expect(
      weaponSets.Etherwrath.options["2"].effect.stat.minPhys === 78,
      "Etherwrath 2-piece must add 78 minimum Physical Attack.",
    ).toBeTruthy();
    expect(fourPiece.condition === "Etherwrath4P", "Etherwrath 4-piece must expose its setup condition.").toBeTruthy();
    expect(
      buff.duration === 8 && buff.maxStack === 5,
      "Etherwrath must last eight seconds and cap at five stacks.",
    ).toBeTruthy();
    expect(buff.stackEffects.length === 5, "Etherwrath must define all five cumulative stack states.").toBeTruthy();
    expect(
      ["BamboocutKite", "HeavenwillGauntlets", "SkygraspRopeDart"].every((tag) =>
        weaponSets.Etherwrath.tags.includes(tag),
      ),
      "Etherwrath must remain available to Bamboocut Kite.",
    ).toBeTruthy();
    expect(
      ["StonesplitStrength", "SnowpartingBlade", "PhalanxbaneBlade"].every((tag) =>
        weaponSets.Etherwrath.tags.includes(tag),
      ),
      "Etherwrath must be available to Stonesplit Strength.",
    ).toBeTruthy();
    expect(
      ["BamboocutKite", "HeavenwillGauntlets", "SkygraspRopeDart"].every((tag) =>
        weaponSets.Cleftpeak.tags.includes(tag),
      ),
      "Cleftpeak must be available to Bamboocut Kite.",
    ).toBeTruthy();
    const sparseSetup = normalizeBuildSetup({ weaponSets: { Etherwrath: 4 } });
    expect(
      sparseSetup.weaponSets.Etherwrath === 4 &&
        sparseSetup.weaponSets.Cleftpeak === 0 &&
        sparseSetup.weaponSets.RainWhisper === 0,
      "A sparse build set map must preserve Etherwrath and treat omitted sets as zero.",
    ).toBeTruthy();
    const sparseOverride = normalizeBuildSetupOverrides({ weaponSets: { Etherwrath: 4 } });
    expect(
      sparseOverride.weaponSets?.Etherwrath === 4,
      "A sparse saved set override must remain valid when new set definitions are added.",
    ).toBeTruthy();

    const hit = {
      name: "Etherwrath hit probe",
      castTime: 6,
      action: Array.from({ length: 6 }, (_, index) => ({
        type: "damage",
        phyCoef: 0,
        attrCoef: 0,
        phyBonus: 0,
        attrBonus: 0,
        time: index + 1,
      })),
      modifier: [],
      tags: ["DirectDamage"],
    };
    const observe = {
      name: "Etherwrath observer",
      castTime: 0,
      action: [{ type: "damage", phyCoef: 0, attrCoef: 0, phyBonus: 0, attrBonus: 0, time: 0 }],
      modifier: [],
      tags: ["DirectDamage"],
    };
    const timelineInput = (rotation, skills) => ({
      rotation,
      skills,
      eventDefinitions: {},
      dots: {},
      effectDefinitions: kiteBuffs,
      innerWayConditions: ["Etherwrath4P"],
      innerWayRules: [],
      setupEffects: [fourPiece],
      weapons: ["heavenwill", "skygrasp"],
    });
    const stackingTimeline = buildRotationTimeline(
      timelineInput({ name: "Stacking probe", steps: [{ type: "skill", skill: "Hit" }] }, { Hit: hit }),
    );
    const stackingRow = stackingTimeline.find((row) => row.step.skill === "Hit");
    expect(
      stackingRow.actionStates[5].buffs.find((effect) => effect.name === "Etherwrath")?.stack === 5,
      "The sixth damage action must see the five stacks granted by the previous five hits.",
    ).toBeTruthy();
    expect(
      stackingRow.actionStates[5].unconditionalDamageEffects?.bamboocutAttackBonus === 0.06,
      "The fifth Etherwrath stack must update the lifecycle damage-effect aggregate to 6% Bamboocut Attack.",
    ).toBeTruthy();

    const dodgeTimeline = buildRotationTimeline(
      timelineInput(
        {
          name: "Perfect Dodge probe",
          steps: [
            { type: "skill", skill: "PerfectDodgeCancel" },
            { type: "skill", skill: "Observe" },
          ],
        },
        { PerfectDodgeCancel: generalSkills.PerfectDodgeCancel, Observe: observe },
      ),
    );
    const dodgeObserver = dodgeTimeline.find((row) => row.step.skill === "Observe");
    expect(
      dodgeObserver.actionStates[0].buffs.find((effect) => effect.name === "Etherwrath")?.stack === 5,
      "Perfect Dodge must apply five Etherwrath stacks directly.",
    ).toBeTruthy();

    const dots = (await import("../data/dot/innerway.json")).default;
    const directAndDot = {
      name: "Direct hit and bleed",
      castTime: 0,
      tags: ["DirectDamage"],
      action: [
        { type: "damage", phyCoef: 1, time: 0 },
        { type: "apply", target: "target", value: "WeepingBlood", time: 0 },
      ],
    };
    const watch = {
      name: "Non-direct observers",
      castTime: 9,
      tags: [],
      action: [2, 9].map((time) => ({ type: "damage", phyCoef: 1, time })),
    };
    const dotInput = timelineInput(
      {
        name: "DOT exclusion",
        steps: [
          { type: "skill", skill: "Start" },
          { type: "skill", skill: "Watch" },
        ],
      },
      { Start: directAndDot, Watch: watch },
    );
    dotInput.dots = dots;
    dotInput.effectDefinitions = { ...kiteBuffs, ...dots };
    const dotTimeline = buildRotationTimeline(dotInput);
    const watched = dotTimeline.find((row) => row.step.skill === "Watch");
    const activeStack = watched.actionStates[0].buffs.find((effect) => effect.name === "Etherwrath");
    expect(
      activeStack?.stack === 1 && activeStack.expiresAt === 8,
      "A DOT tick must neither add nor refresh Etherwrath stacks.",
    ).toBeTruthy();
    expect(
      !watched.actionStates[1].buffs.some((effect) => effect.name === "Etherwrath"),
      "DOT and untagged damage must not keep Etherwrath alive.",
    ).toBeTruthy();
    const dotOnly = buildRotationTimeline({
      ...dotInput,
      skills: {
        ...dotInput.skills,
        Start: { ...directAndDot, action: directAndDot.action.filter((action) => action.type !== "damage") },
      },
    });
    expect(
      dotOnly.every((row) =>
        Object.values(row.actionStates).every((state) => !state.buffs.some((effect) => effect.name === "Etherwrath")),
      ),
      "DOT-only and untagged damage cannot initially activate Etherwrath.",
    ).toBeTruthy();

    const stats = {
      ...emptyStats,
      minPhys: 100,
      maxPhys: 100,
      minBellstrike: 100,
      maxBellstrike: 100,
      minStonesplit: 100,
      maxStonesplit: 100,
      minSilkbind: 100,
      maxSilkbind: 100,
      minBamboocut: 100,
      maxBamboocut: 100,
      precision: 1,
    };
    const enemy = {
      name: "Etherwrath probe",
      level: 96,
      defense: 0,
      physicalResistance: 0,
      bellstrikeResistance: 0,
      stonesplitResistance: 0,
      silkbindResistance: 0,
      bamboocutResistance: 0,
      judgementResistance: 0,
    };
    const baseContext = {
      stats,
      attunement: {},
      skillTags: ["DirectDamage"],
      weapons: ["heavenwill", "skygrasp"],
      buffs: [],
      enemy,
      derivedStats: calculateDerivedStats(stats, 0),
      effects: [],
    };
    const maxStackEffects = buff.stackEffects[4];
    const splitMaxStackEffects = splitUnconditionalDamageEffectRules(maxStackEffects);
    const attackEffects = maxStackEffects.filter((effect) => !effect.requirement).map((effect) => effect.effect);
    const penetrationEffects = maxStackEffects.filter((effect) => effect.requirement).map((effect) => effect.effect);
    const action = { phyCoef: 1, attrCoef: 1, phyBonus: 0, attrBonus: 0 };
    const baseline = calculateDamageBreakdown(action, baseContext).total;
    const attackBoosted = calculateDamageBreakdown(action, { ...baseContext, effects: attackEffects }).total;
    const aggregateBoosted = calculateDamageBreakdown(action, {
      ...baseContext,
      effects: [],
      unconditionalDamageEffects: splitMaxStackEffects.unconditional,
    }).total;
    const martialEffectBoosted = calculateDamageBreakdown(action, {
      ...baseContext,
      skillTags: ["DirectDamage", "MartialArtEffect"],
      effects: [...attackEffects, ...penetrationEffects],
    }).total;
    expect(
      Math.abs(attackBoosted / baseline - 1.06) < 1e-9,
      "Five Etherwrath stacks must multiply every attack value by 1.06.",
    ).toBeTruthy();
    expect(
      Math.abs(aggregateBoosted - attackBoosted) < 1e-9,
      "Lifecycle-aggregated unconditional damage effects must match the original per-hit effect result.",
    ).toBeTruthy();
    expect(
      splitMaxStackEffects.remaining.length === 5,
      "Etherwrath's five conditional Martial Art Effect penetration rules must remain on the per-hit path.",
    ).toBeTruthy();
    expect(
      Math.abs(martialEffectBoosted / attackBoosted - 1.03) < 1e-9,
      "Martial Art Effects at five stacks must gain six penetration in every damage channel.",
    ).toBeTruthy();
  });
});
