import { describe, it } from "vitest";
import assert from "node:assert/strict";

// Ported from script/probe/check-vendetta.mjs.
describe("vendetta", () => {
  it("Vendetta cumulative tiers, extended Rodent triggers, exact expiry, refresh, and expected/sampled checks passed", async () => {
    const cast = (skill) => ({ type: "skill", skill });
    const delay = (duration) => ({ type: "event", event: "Delay", duration });
    const vendetta = await import("../data/innerway/vendetta.json");
    const buffs = await import("../data/buff/bamboocut-wind.json");
    const mortal = await import("../data/skill/mortal-rope-dart.json");
    const infernal = await import("../data/skill/infernal-twinblades.json");
    const { buildRotationTimeline } = await import("../src/calculations/rotationTimeline.ts");
    const build = (tier, steps, roll) =>
      buildRotationTimeline(
        {
          rotation: { name: "Vendetta lifetime", steps },
          skills: { ...mortal, ...infernal },
          effectDefinitions: buffs,
          dots: {},
          eventDefinitions: {},
          weapons: ["infernalTwinblades", "mortalRopeDart"],
          innerWayConditions: [],
          setupEffects: [],
          innerWayRules: Array.from({ length: tier + 1 }, (_, index) =>
            (vendetta.effect["VendettaT" + index].effect ?? []).map((effect) => ({
              ...effect,
              source: "Vendetta",
              tier: index,
            })),
          ).flat(),
        },
        roll,
      );
    const rodent = (rows) => rows.filter((row) => row.step.skill === "Rodent");
    const lateAttack = [cast("RodentRampage"), delay(14), cast("InfernalLight1")];
    assert.equal(
      rodent(build(-1, lateAttack)).length,
      0,
      "Without Vendetta, the 10-second buff expires before the late attack",
    );
    for (const roll of [undefined, () => 0.5]) {
      for (let tier = 0; tier <= 6; tier++) {
        const duration = tier < 4 ? 15 : 20;
        const rows = build(tier, lateAttack, roll);
        assert.equal(rodent(rows).length, 1, "Every Vendetta tier retains T0 and enables attacks after ten seconds");
        const buff = rows.find((row) => row.step.skill === "InfernalLight1").actionStates[0].buffs.get("RodentRampage");
        assert.ok(
          Math.abs(buff.expiresAt - (duration + 0.541)) < 1e-9,
          "Vendetta sets the total duration to 15 seconds, upgraded to 20 at T4",
        );
        assert.equal(buff.stack, 1, "Duration extension preserves the one-stack cap");
        for (const [offset, expected] of [
          [-0.001, 1],
          [0, 0],
        ]) {
          const boundary = build(
            tier,
            [cast("RodentRampage"), delay(duration - 0.339 + offset), cast("InfernalLight1")],
            roll,
          );
          assert.equal(rodent(boundary).length, expected, "Rodent attacks stop at the selected tier's exact expiry");
        }
      }
    }
    assert.equal(
      rodent(build(0, [cast("RodentRampage"), delay(15 - 0.339), cast("InfernalLight1")])).length,
      0,
      "Extended buff expires at the exact 15-second boundary",
    );
    const refresh = build(0, [
      cast("RodentRampage"),
      delay(14),
      cast("RodentRampage"),
      delay(14),
      cast("InfernalLight1"),
    ]);
    assert.equal(rodent(refresh).length, 1, "Recasting refreshes the full extended lifetime");
    const refreshed = Array.from(
      refresh.find((row) => row.step.skill === "InfernalLight1").actionStates[0].buffs.values(),
    ).filter((buff) => buff.name === "RodentRampage");
    assert.equal(refreshed.length, 1, "Refresh still produces one buff");
    assert.ok(
      Math.abs(refreshed[0].expiresAt - 30.082) < 1e-9,
      "Refresh expiration is measured from the new application",
    );
    const { calculateRotationBaseline } = await import("../src/calculations/rotationCalculator.ts");
    const { calculateDerivedStats } = await import("../src/calculations/effectiveStats.ts");
    const { emptyStats } = await import("../src/data/statDefinitions.ts");
    const weapons = ["mortalRopeDart", "infernalTwinblades"];
    const stats = { ...emptyStats, minPhys: 100, maxPhys: 100, minBamboocut: 80, maxBamboocut: 80, precision: 1 };
    const enemy = {
      name: "Vendetta target",
      level: 96,
      defense: 0,
      physicalResistance: 0,
      bellstrikeResistance: 0,
      stonesplitResistance: 0,
      silkbindResistance: 0,
      bamboocutResistance: 0,
      judgementResistance: 0,
    };
    const damageRun = (withToken, t6 = false, setupEffects = []) =>
      calculateRotationBaseline({
        timeline: {
          rotation: {
            name: "Vendetta Token damage",
            steps: [
              cast("RodentRampage"),
              cast(withToken ? "BladeboundThreadCancel" : "Wait"),
              cast("InfernalLight1"),
              delay(0.5),
            ],
          },
          skills: { ...mortal, ...infernal, Wait: { castTime: 0.385, action: [] } },
          effectDefinitions: buffs,
          dots: {},
          eventDefinitions: {},
          weapons,
          innerWayConditions: [],
          innerWayRules: t6
            ? vendetta.effect.VendettaT6.effect.map((effect) => ({
                effect: {},
                ...effect,
                source: "Vendetta",
                tier: 6,
              }))
            : [],
          setupEffects,
        },
        startAnchor: { rowId: "rotation-0" },
        stats,
        derivedStats: calculateDerivedStats(stats, 0),
        enemy,
        weapons,
        attunement: {},
        statPriority: [],
        attunementPriority: [],
        innerWayPriority: [],
        setupComparisons: {},
      });
    const close = (a, b, message) => assert.ok(Math.abs(a - b) < 1e-8, message + ": " + a + " vs " + b);
    const procDamage = (result) => {
      const row = result.timeline.find((row) => row.step.skill === "Rodent");
      return result.actionBreakdowns[row.id + ":0"].total;
    };
    const unbuffed = damageRun(false);
    const token = damageRun(true);
    const tokenT6 = damageRun(true, true);
    close(procDamage(token) / procDamage(unbuffed), 1.5, "Vendetta Token adds 50% Rodent base damage");
    close(procDamage(tokenT6) / procDamage(unbuffed), 1.95, "T6 adds a separate 30% Rodent damage bonus");
    close(procDamage(damageRun(false, true)), procDamage(unbuffed), "T6 has no effect without the self buff");
    close(
      token.actionBreakdowns["rotation-2:0"].total,
      unbuffed.actionBreakdowns["rotation-2:0"].total,
      "Token does not increase ordinary light damage",
    );
    const existingBonuses = [{ effect: { baseDMGBonus: 0.2, dmgBonus: 0.4 } }];
    close(
      procDamage(damageRun(true, true, existingBonuses)) / procDamage(unbuffed),
      1.7 * 1.7,
      "Base damage and Category 1 bonuses add within their own categories",
    );
    for (const roll of [undefined, () => 0.5]) {
      const rows = build(
        -1,
        [cast("BladeboundThreadCancel"), cast("BladeboundThreadCancel"), cast("InfernalLight1")],
        roll,
      );
      const casts = rows.filter((row) => row.step.skill === "BladeboundThreadCancel");
      close(casts[0].effectiveCastTime, 0.385, "Cancel cast ends at the supplied hit time");
      close(casts[0].actions[0].time, 0.385, "Cancel hit uses the supplied local time");
      assert.ok(!casts[0].actionStates[0].buffs.has("VendettaToken"), "Token is applied after the initial damage");
      close(casts[1].startTime, 8, "Repeated cancel casts honor the eight-second cooldown");
      const active = Array.from(
        rows.find((row) => row.step.skill === "InfernalLight1").actionStates[0].buffs.values(),
      ).filter((buff) => buff.name === "VendettaToken");
      assert.equal(active.length, 1, "Reapplication refreshes one Token buff");
      assert.equal(active[0].stack, 1, "Token does not stack damage on recast");
      close(active[0].expiresAt, 18.385, "Token refresh starts ten seconds at its new application");
      for (const [tier, duration] of [
        [-1, 10],
        [0, 15],
        [1, 20],
        [6, 20],
      ]) {
        const lifetime = build(
          tier,
          [cast("BladeboundThreadCancel"), delay(duration - 0.339), cast("InfernalLight1")],
          roll,
        );
        const hit = lifetime.find((row) => row.step.skill === "InfernalLight1");
        assert.ok(!hit.actionStates[0].buffs.has("VendettaToken"), "Token expires at its exact tier-adjusted boundary");
        const before = build(tier, [cast("BladeboundThreadCancel"), cast("InfernalLight1")], roll).find(
          (row) => row.step.skill === "InfernalLight1",
        );
        close(
          before.actionStates[0].buffs.get("VendettaToken").expiresAt,
          0.385 + duration,
          "Token duration uses the selected tier",
        );
      }
    }
    const mortalTalents = await import("../data/martial-art/mortal-rope-dart.json");
    const debuffs = await import("../data/debuff/bamboocut-wind.json");
    const { martialArtEffectsForRank } = await import("../src/data/martialArtTalents.ts");
    for (const rank of [12, 13]) {
      const rows = buildRotationTimeline({
        rotation: { name: "Bladebound talent", steps: [cast("BladeboundThreadCancel"), cast("InfernalLight1")] },
        skills: { ...mortal, ...infernal },
        effectDefinitions: { ...buffs, ...debuffs },
        dots: {},
        eventDefinitions: {},
        weapons,
        innerWayRules: [],
        innerWayConditions: [],
        setupEffects: martialArtEffectsForRank({ mortalRopeDart: mortalTalents }, weapons, rank),
      });
      const corrosion = rows
        .find((row) => row.step.skill === "InfernalLight1")
        .actionStates[0].debuffs.get("BoneCorrosion");
      assert.equal(Boolean(corrosion), rank === 13, "Bladebound Thread activates Bone Corrosion only with the talent");
      if (corrosion) close(corrosion.expiresAt, 5.385, "Bone Corrosion starts its five-second lifetime at the hit");
    }
  });
});
