import { describe, it } from "vitest";
import assert from "node:assert/strict";

// Ported from script/probe/check-rodent-rampage.mjs.
describe("rodent-rampage", () => {
  it("Infernal stage timing, Rodent cadence/lifetime, T6 gating, dynamic damage, and expected/sampled checks passed", async () => {
    const cast = (skill) => ({ type: "skill", skill });
    const delay = (duration) => ({ type: "event", event: "Delay", duration });
    const close = (a, b, message) => assert.ok(Math.abs(a - b) < 1e-9, message + ": " + a + " vs " + b);
    const infernal = await import("../data/skill/infernal-twinblades.json");
    const mortal = await import("../data/skill/mortal-rope-dart.json");
    const buffs = await import("../data/buff/bamboocut-wind.json");
    const { buildRotationTimeline } = await import("../src/calculations/rotationTimeline.ts");
    const { calculateRotationBaseline } = await import("../src/calculations/rotationCalculator.ts");
    const { calculateDamageBreakdown, calculateSimulatedDamageBreakdown } =
      await import("../src/calculations/damage.ts");
    const { calculateDerivedStats } = await import("../src/calculations/effectiveStats.ts");
    const { emptyStats } = await import("../src/data/statDefinitions.ts");
    const slow = {
      castTime: 0.5,
      martialArt: "snowparting",
      weapon: "HengBlade",
      tags: ["MartialArts", "SnowpartingBlade", "Light"],
      action: [
        { type: "damage", time: 0.1, phyCoef: 1 },
        { type: "damage", time: 0.2, phyCoef: 1 },
      ],
    };
    const input = (steps, extra = {}) => ({
      rotation: { name: "Rodent stages", steps },
      skills: {
        ...infernal,
        ...mortal,
        Slow: slow,
        MortalLight: {
          ...slow,
          martialArt: "mortalRopeDart",
          weapon: "RopeDart",
          tags: ["MartialArts", "MortalRopeDart", "Light"],
        },
        Heavy: { ...slow, tags: ["MartialArts", "Heavy"] },
        Combo: { martialArt: "snowparting", weapon: "HengBlade", tags: slow.tags, subAction: ["Slow", "Slow"] },
        LateDriver: { castTime: 0, action: [{ type: "trigger", time: 0, value: "LateLight" }] },
        LateLight: {
          ...slow,
          tags: [...slow.tags, "Triggered"],
          action: [
            { type: "damage", phyCoef: 1, time: 0.1 },
            { type: "damage", phyCoef: 1, time: 0.8 },
          ],
        },
      },
      effectDefinitions: buffs,
      dots: {},
      eventDefinitions: {},
      innerWayConditions: ["EchoesOfOblivionT6"],
      innerWayRules: [],
      setupEffects: [],
      weapons: ["infernalTwinblades", "mortalRopeDart"],
      initialBuffs: [{ name: "Flamelash", stack: 1 }],
      ...extra,
    });
    const rodentRows = (rows) => rows.filter((row) => row.step.skill === "Rodent");
    const build = (steps, extra = {}, roll) => buildRotationTimeline(input(steps, extra), roll);
    const ids = [
      "InfernalLight1",
      "InfernalLight2",
      "InfernalLight3",
      "InfernalLight4",
      "InfernalFlamelashLight1",
      "InfernalFlamelashLight2",
      "InfernalFlamelashLight3",
      "InfernalFlamelashLight4",
      "InfernalFlamelashLight5",
    ];
    for (const roll of [undefined, () => 0.5]) {
      const rows = build([cast("RodentRampage"), ...ids.map(cast)], {}, roll);
      assert.equal(
        rodentRows(rows).length,
        11,
        "Nine stages produce nine Rodents plus two T6 extras, in expected and sampled timelines",
      );
      const castRows = rows.filter((row) => ids.includes(row.step.skill));
      close(
        castRows.at(-1).startTime + castRows.at(-1).effectiveCastTime,
        6.588,
        "Interrupt timings determine the rotation endpoint",
      );
      let offset = 0.541;
      for (const [index, [duration, firstHit, hitCount]] of [
        [0.43, 0.339, 1],
        [0.47, 0.242, 2],
        [0.6, 0.248, 2],
        [0.529, 0.167, 2],
        [0.357, 0.104, 2],
        [0.5, 0.294, 1],
        [0.8, 0.253, 8],
        [0.96, 0.345, 5],
        [1.401, 0.342, 5],
      ].entries()) {
        const row = castRows[index];
        close(row.startTime, offset, "Each stage starts after the previous interrupt");
        assert.equal(
          row.actions.filter((a) => a.type === "damage").length,
          hitCount,
          "Stage keeps every original damage hit: " + row.step.skill,
        );
        const procs = rodentRows(rows).filter((proc) => Math.abs(proc.startTime - (offset + firstHit)) < 1e-9);
        assert.equal(procs.length, index === 8 ? 3 : 1, "Rodent fires only on the first hit of each stage");
        assert.ok(
          procs.every((proc) => proc.currentMartialArt === "infernalTwinblades"),
          "Triggered Rodent does not switch the active martial art",
        );
        offset += duration;
      }
    }
    assert.equal(rodentRows(build([cast("InfernalFlamelashLight5")])).length, 0, "FA5 requires the active Rodent buff");
    assert.equal(
      rodentRows(build([cast("RodentRampage"), cast("InfernalFlamelashLight5")], { innerWayConditions: [] })).length,
      1,
      "Without T6 FA5 triggers one Rodent",
    );
    assert.equal(
      rodentRows(build([cast("RodentRampage"), cast("InfernalFlamelashLight5")], { initialBuffs: [] })).length,
      1,
      "The T6 extras require Flamelash",
    );
    assert.equal(
      rodentRows(build([cast("RodentRampage"), cast("MortalLight"), cast("MortalLight")])).length,
      2,
      "Mortal triggers every stage",
    );
    assert.equal(
      rodentRows(build([cast("RodentRampage"), cast("Slow")])).length,
      0,
      "A multi-hit stage from another art is only one count",
    );
    assert.equal(
      rodentRows(build([cast("RodentRampage"), cast("Slow"), cast("Heavy"), cast("Slow")])).length,
      1,
      "Other arts trigger every two stages and heavy hits do not advance progress",
    );
    assert.equal(
      rodentRows(build([cast("RodentRampage"), cast("Combo")])).length,
      1,
      "Multi-action components count as separate stages",
    );
    const refreshed = build([cast("RodentRampage"), cast("Slow"), cast("RodentRampage"), cast("Slow")]);
    assert.equal(rodentRows(refreshed).length, 1, "Refresh preserves the half-complete counter");
    const applications = refreshed.filter((row) => row.kind === "rotation" && row.step.skill === "RodentRampage");
    close(applications[1].startTime, 1.041, "Rodent Rampage has no cooldown");
    const latest = refreshed
      .find((row) => row.step.skill === "Slow" && row.startTime > 1.1)
      .actionStates[0].buffs.filter((buff) => buff.name === "RodentRampage");
    assert.equal(latest.length, 1, "Refreshing never duplicates the buff");
    assert.equal(latest[0].stack, 1, "The buff stays capped at one stack");
    close(latest[0].expiresAt, 11.582, "Refresh gives ten seconds from the new application time");
    const expired = build([
      cast("RodentRampage"),
      cast("Slow"),
      delay(10),
      cast("RodentRampage"),
      cast("Slow"),
      cast("Slow"),
    ]);
    assert.equal(rodentRows(expired).length, 1, "Expiry resets progress before the next activation");
    assert.ok(rodentRows(expired)[0].startTime > 12, "Only the second new stage triggers after reapplication");
    assert.equal(
      rodentRows(build([cast("RodentRampage"), delay(9.9), cast("MortalLight")])).length,
      0,
      "Buff is inactive at its exact expiry",
    );
    assert.equal(
      rodentRows(build([cast("LateDriver"), cast("RodentRampage"), delay(1)])).length,
      0,
      "Applying the buff mid-stage cannot turn a later hit into another stage",
    );

    const stats = { ...emptyStats, minPhys: 100, maxPhys: 100, minBamboocut: 80, maxBamboocut: 80, precision: 1 };
    const enemy = {
      name: "Rodent target",
      level: 96,
      defense: 0,
      physicalResistance: 0,
      bellstrikeResistance: 0,
      stonesplitResistance: 0,
      silkbindResistance: 0,
      bamboocutResistance: 0,
      judgementResistance: 0,
    };
    const context = {
      stats,
      derivedStats: calculateDerivedStats(stats, 0),
      attunement: {},
      skillTags: mortal.Rodent.tags,
      weapons: ["infernalTwinblades", "mortalRopeDart"],
      buffs: [],
      effects: [],
      enemy,
    };
    for (const [distance, coef] of [
      [4.999, 0.348974526316],
      [5, 0.348974526316],
      [11.999, 0.348974526316],
      [12, 0],
      [20, 0],
    ]) {
      for (const calculate of [
        calculateDamageBreakdown,
        (a, c) => calculateSimulatedDamageBreakdown(a, c, () => 0.5),
      ]) {
        close(
          calculate(mortal.Rodent.action[0], { ...context, distance }).total,
          calculate({ phyCoef: coef, attrCoef: coef }, context).total,
          "PvE Rodent uses its final nonmatching coefficient below distance 12",
        );
      }
    }
    const bundle = (conditions) => ({
      timeline: input([cast("RodentRampage"), cast("InfernalFlamelashLight5")], { innerWayConditions: conditions }),
      startAnchor: { rowId: "rotation-0" },
      stats,
      derivedStats: context.derivedStats,
      enemy,
      attunement: {},
      weapons: context.weapons,
      statPriority: [],
      attunementPriority: [],
      innerWayPriority: [],
      setupComparisons: {},
    });
    const base = calculateRotationBaseline(bundle([]));
    const t6 = calculateRotationBaseline(bundle(["EchoesOfOblivionT6"]));
    const total = (result) => Object.values(result.actionBreakdowns).reduce((sum, entry) => sum + entry.total, 0);
    const rodent = base.baseline.find((entry) => entry.context.skillTags.includes("Rodent"));
    assert(rodent, "Base rotation resolves a Rodent attack");
    close(
      total(t6) - total(base),
      2 * calculateDamageBreakdown(rodent.action, rodent.context).total,
      "Central worker calculation adds exactly two Rodent attacks for T6",
    );
  });
});
