import { afterEach, describe, expect, it, vi } from "vitest";
import * as scheduler from "../src/calculations/rotationTimeline";
import {
  calculateRotationBaseline,
  calculateRotationComparisons,
  calculateSimulatedRotationRun,
} from "../src/calculations/rotationCalculator";
import { buildPresetRotationBundle } from "../src/App";
import { resolveActionStatContext } from "../src/calculations/actionStats";
import { loadDpsSnapshotFixtures, dpsSnapshotEnvironment } from "./helpers/dps-snapshot-fixtures";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

async function windBundle() {
  const fixture = (await loadDpsSnapshotFixtures()).find(
    (entry) => entry.id === "bamboocutWind/wind-dummy-1-min-infinite-vitality",
  )!;
  return buildPresetRotationBundle(
    {
      ...dpsSnapshotEnvironment,
      pathId: fixture.pathId,
      martialArts: fixture.rotation.martialArts,
      rotation: fixture.rotation,
      skillOverrides: {},
    },
    fixture.fixture.build,
  )!;
}

function observeTraversals() {
  const original = scheduler.buildRotationTimeline;
  const actions: Set<string>[] = [];
  let factories = 0;
  const build = vi.spyOn(scheduler, "buildRotationTimeline").mockImplementation((input, random, createResolver) => {
    const visited = new Set<string>();
    actions.push(visited);
    return original(
      input,
      random,
      createResolver
        ? (passInput, rows, effects) => {
            factories++;
            const resolver = createResolver(passInput, rows, effects);
            return Object.assign(
              (row: scheduler.TimelineRow, index: number) => {
                const key = `${row.id}:${index}`;
                expect(visited.has(key), `Repeated action ${key}`).toBe(false);
                visited.add(key);
                return resolver(row, index);
              },
              { onCastEnd: resolver.onCastEnd },
            );
          }
        : undefined,
    );
  });
  return {
    build,
    actions,
    get factories() {
      return factories;
    },
  };
}

describe("single-pass calculation", () => {
  it("resolves a Wind baseline, feedback variant, and sampled run once each", async () => {
    const bundle = await windBundle();
    const observed = observeTraversals();
    const baseline = calculateRotationBaseline(bundle);
    expect(observed.build).toHaveBeenCalledTimes(1);
    expect(observed.factories).toBe(1);
    expect(baseline.metrics.dps).toBeGreaterThan(0);
    const effectLists = baseline.baseline.map((entry) => entry.context.effects);
    expect(new Set(effectLists).size).toBeLessThan(effectLists.length);
    const context = {
      ...baseline.baseline[0].context,
      effects: [],
      unconditionalDamageEffects: { "stat.minPhys": 10 },
    };
    const prepared = resolveActionStatContext(context);
    const changed = resolveActionStatContext({ ...context, unconditionalDamageEffects: { "stat.minPhys": 20 } });
    expect(changed.stats.minPhys).toBeCloseTo(prepared.stats.minPhys + 10);
    expect(resolveActionStatContext({ ...context, unconditionalDamageEffects: { "stat.minPhys": 10 } }).stats).toBe(
      prepared.stats,
    );
    expect(baseline.timeline[0].battleStartTime).toBe(baseline.anchorTime);
    expect(observed.actions[0].size).toBeGreaterThan(baseline.baseline.length);
    calculateRotationComparisons(
      {
        ...bundle,
        statPriority: [],
        innerWayPriority: [],
        setupComparisons: {},
        attunementPriority: [
          {
            label: "Penetration",
            attunement: { ...bundle.attunement, physicalPenetration: bundle.attunement.physicalPenetration + 1 },
          },
        ],
      },
      baseline,
    );
    expect(observed.build).toHaveBeenCalledTimes(2);
    expect(calculateSimulatedRotationRun(bundle, () => 0.5).resolvedSequence.length).toBeGreaterThan(0);
    expect(observed.build).toHaveBeenCalledTimes(3);
    expect(observed.factories).toBe(3);
  });

  it("reuses the complete preview calculation for its matching baseline request", async () => {
    const bundle = await windBundle();
    const observed = observeTraversals();
    const worker = { onmessage: undefined as ((event: { data: unknown }) => void) | undefined, postMessage: vi.fn() };
    vi.stubGlobal("self", worker);
    await import("../src/calculations/rotationWorker");
    worker.onmessage!({ data: { id: 1, mode: "editorTimeline", bundle } });
    worker.onmessage!({ data: { id: 2, mode: "baseline", cacheKey: "single-pass-preview", bundle } });
    expect(worker.postMessage).toHaveBeenCalledTimes(2);
    expect(worker.postMessage.mock.calls[1][0].error).toBeUndefined();
    expect(worker.postMessage.mock.calls[1][0].metrics.dps).toBeGreaterThan(0);
    expect(observed.build).toHaveBeenCalledTimes(1);
    expect(observed.factories).toBe(1);
  });
});
