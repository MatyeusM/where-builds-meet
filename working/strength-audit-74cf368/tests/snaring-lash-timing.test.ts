import { it, expect } from "vitest";
import { buildRotationTimeline, type TimelineBuildInput } from "../src/calculations/rotationTimeline";
import skills from "../data/skill/skygrasp-rope-dart.json";
it.each([
  { skill: "SnaringLashCancel", duration: 0.365, hitTimes: [0.405] },
  { skill: "SnaringLash", duration: 1.315, hitTimes: [0.405, 1.271, 1.288] },
])("$skill lands before its Falcon and debuff, then releases the next cast", ({ skill, duration, hitTimes }) => {
  const input: TimelineBuildInput = {
    rotation: {
      name: "Snaring Lash cancel",
      ping: 40,
      steps: [
        { type: "skill", skill },
        { type: "skill", skill: "Follow" },
      ],
    },
    skills: { ...skills, Follow: { castTime: 1, action: [] } },
    eventDefinitions: {},
    effectDefinitions: { HeavensMight: { duration: 24, maxStack: 1 } },
    dots: {},
    innerWayConditions: ["SkyGrippedT0"],
    innerWayRules: [],
    setupEffects: [],
    weapons: [],
  };
  const rows = buildRotationTimeline(input);
  const cast = rows.find((r) => r.step.type === "skill" && r.step.skill === skill)!;
  const falcon = rows.find((r) => r.step.type === "skill" && r.step.skill === "SnaringLashFalcon")!;
  const follow = rows.find((r) => r.step.type === "skill" && r.step.skill === "Follow")!;
  expect(cast.effectiveCastTime).toBeCloseTo(duration);
  const hits = cast.actions.flatMap((action, index) => (action.type === "damage" ? [index] : []));
  expect(hits).toHaveLength(hitTimes.length);
  for (const [index, actionIndex] of hits.entries()) {
    expect(cast.startTime + Number(cast.actions[actionIndex].time)).toBeCloseTo(hitTimes[index]);
    if (index > 0) expect(cast.actionStates[actionIndex].debuffs.some((b) => b.name === "HeavensMight")).toBe(true);
  }
  expect(cast.startTime + Number(cast.actions[0].time)).toBeCloseTo(0.405);
  expect(cast.actionStates[0].debuffs.some((b) => b.name === "HeavensMight")).toBe(false);
  expect(falcon.startTime).toBeCloseTo(0.405);
  expect(falcon.sourceRowId).toBe(cast.id);
  expect(follow.startTime).toBeCloseTo(0.08 + duration);
  expect(follow.debuffs.find((b) => b.name === "HeavensMight")?.appliedAt).toBeCloseTo(0.405);
  expect(falcon.actions.filter((a) => a.type === "damage")).toHaveLength(3);
  expect(falcon.actionStates[2]).toBeDefined();
});
