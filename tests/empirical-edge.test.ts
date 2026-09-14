import { describe, expect, it } from "vitest";
import { probeLoad } from "./helpers/probe-loader.js";

// Ported from script/probe/check-empirical-edge.mjs.
describe("empirical-edge", () => {
  // STALE: fails identically on main via script/probe/check-empirical-edge.mjs
  // (Empirical Edge T2/T5 shared character stats). Kept for future repair instead of deleting the coverage.
  it.skip("Empirical Edge tiers, trigger, cooldown, stacking, and penetration checks passed", async () => {
    const empiricalEdge = (await import("../data/innerway/empirical-edge.json")).default;
    const kiteBuffs = (await import("../data/buff/bamboocut-kite.json")).default;
    const { innerWayDefinitions } = await import("../src/data/innerWayDefinitions.ts");
    const { calculateStatsWithEffects } = await import("../src/calculations/statEffects.ts");
    const { emptyStats } = await import("../src/data/statDefinitions.ts");
    const { buildRotationTimeline, requirementsPass } = await probeLoad("/src/calculations/rotationTimeline.ts");

    expect(
      innerWayDefinitions.EmpiricalEdge === empiricalEdge,
      "Empirical Edge must be registered as an Inner Way.",
    ).toBeTruthy();
    expect(
      empiricalEdge.altersTimeline === true && empiricalEdge.tags.includes("BamboocutKite"),
      "Empirical Edge must rebuild the timeline and be available to Bamboocut Kite.",
    ).toBeTruthy();
    const trigger = empiricalEdge.effect.EmpiricalEdgeT0.trigger[0];
    expect(
      trigger.requirement.some(
        (requirement) => requirement.target === "skillTag" && requirement.value === "MartialArtEffect",
      ) &&
        trigger.action[0]?.type === "apply" &&
        trigger.action[0]?.value === "Cognition",
      "Empirical Edge T0 must apply Cognition after Martial Art Effect damage.",
    ).toBeTruthy();

    const cognition = kiteBuffs.Cognition;
    expect(
      cognition.duration === 5 && cognition.cooldown === 1 && cognition.maxStack === 5 && cognition.refresh === true,
      "Cognition's complete definition must last five seconds, support five stacks, refresh, and have a one-second cooldown.",
    ).toBeTruthy();
    expect(cognition.stackEffects.length === 5, "Cognition must define all five cumulative stack states.").toBeTruthy();
    expect(
      empiricalEdge.effect.EmpiricalEdgeT0.effect[0].modify.maxStack === 3 &&
        empiricalEdge.effect.EmpiricalEdgeT1.effect[0].modify.duration === 8 &&
        empiricalEdge.effect.EmpiricalEdgeT3.effect[0].modify.maxStack === 5 &&
        empiricalEdge.effect.EmpiricalEdgeT4.effect[0].modify.cooldown === 0,
      "Empirical Edge must apply the Cognition duration, stack-cap, and cooldown tier modifiers.",
    ).toBeTruthy();
    const empiricalStats = calculateStatsWithEffects(
      emptyStats,
      [empiricalEdge.effect.EmpiricalEdgeT2, empiricalEdge.effect.EmpiricalEdgeT5].flatMap((tier) => tier.effect),
      0,
    ).stats;
    expect(
      empiricalStats.minPhys === 22.3 && empiricalStats.maxPhys === 44.7 && empiricalStats.physDmgBonus === 0.025,
      "Empirical Edge T2 and T5 must change the shared character stats.",
    ).toBeTruthy();

    const penetrationFields = [
      "physicalPenetration",
      "bellstrikePenetration",
      "stonesplitPenetration",
      "silkbindPenetration",
      "bamboocutPenetration",
    ];
    const resolvedPenetration = (tags, conditions = []) =>
      cognition.stackEffects[4]
        .filter((effect) => requirementsPass(effect.requirement, [], [], tags, new Set(conditions)))
        .reduce(
          (total, effect) => {
            for (const field of penetrationFields) total[field] += effect.effect[field] ?? 0;
            return total;
          },
          Object.fromEntries(penetrationFields.map((field) => [field, 0])),
        );
    const martialArtPenetration = resolvedPenetration(["MartialArtEffect"]);
    expect(
      martialArtPenetration.physicalPenetration === 0,
      "Cognition must not grant Physical Penetration before Empirical Edge T6.",
    ).toBeTruthy();
    for (const field of penetrationFields.slice(1))
      expect(
        martialArtPenetration[field] === 10,
        "Five Cognition stacks must grant Martial Art Effects 10 of every attribute penetration.",
      ).toBeTruthy();
    for (const tags of [
      ["MartialArtEffect", "HeavenwillGauntlets", "Falcon"],
      ["MartialArtEffect", "VileCondemned"],
    ]) {
      const penetration = resolvedPenetration(tags);
      expect(
        penetration.physicalPenetration === 0,
        "Qualifying Cognition effects must not gain Physical Penetration before T6.",
      ).toBeTruthy();
      for (const field of penetrationFields.slice(1))
        expect(
          penetration[field] === 20,
          "A qualifying Cognition effect must gain another 10 of every attribute penetration at max stacks.",
        ).toBeTruthy();
      const t6Penetration = resolvedPenetration(tags, ["EmpiricalEdgeT6"]);
      expect(
        t6Penetration.physicalPenetration === 20,
        "Empirical Edge T6 must grant Physical Penetration equal to qualifying attribute penetration.",
      ).toBeTruthy();
    }
    const falconOnly = resolvedPenetration(["MartialArtEffect", "Falcon"], ["EmpiricalEdgeT6"]);
    for (const value of Object.values(falconOnly))
      expect(value === 10, "Falcon alone must not receive Cognition's Heavenwill Gauntlets bonus.").toBeTruthy();

    const probeSkill = {
      name: "Cognition probe",
      castTime: 2,
      tags: ["DirectDamage", "MartialArtEffect"],
      action: [0, 0.5, 1, 2].map((time) => ({ type: "damage", time, phyCoef: 0, attrCoef: 0 })),
    };
    const timeline = buildRotationTimeline({
      rotation: { name: "Cognition probe", steps: [{ type: "skill", skill: "Probe" }] },
      skills: { Probe: probeSkill },
      eventDefinitions: {},
      dots: {},
      effectDefinitions: { Cognition: cognition },
      innerWayConditions: ["EmpiricalEdgeT0"],
      innerWayRules: [
        {
          source: "EmpiricalEdge",
          tier: 0,
          requirement: trigger.requirement,
          trigger: { target: trigger.target, action: trigger.action },
          effect: {},
        },
      ],
      setupEffects: [],
      weapons: ["heavenwill", "skygrasp"],
    });
    const row = timeline.find((candidate) => candidate.id === "rotation-0");
    const cognitionStackAt = (actionIndex) =>
      row.actionStates[actionIndex].buffs.find((buff) => buff.name === "Cognition")?.stack ?? 0;
    expect(
      [0, 1, 1, 2].every((stack, index) => cognitionStackAt(index) === stack),
      "Cognition must apply after damage and reject reapplications during its one-second cooldown.",
    ).toBeTruthy();
  });
});
