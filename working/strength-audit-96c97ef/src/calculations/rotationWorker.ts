import {
  calculateRotationBaseline,
  calculateRotationComparisons,
  calculateRotationMetrics,
  calculateRotationSimulation,
  type RotationCalculationBundle,
  type RotationSimulationBaseline,
  type RotationSimulationBundle,
} from "./rotationCalculator";
import { withCalculationBenchmark } from "./calculationBenchmark";
import { compactInnerWayResults } from "./compactInnerWayResults";
import { calculateEditorTimeline } from "./editorTimeline";
import { rotationBundleFingerprint } from "./rotationCalculationCache";

type WorkerRequest = {
  id: number;
  bundle: RotationCalculationBundle | RotationSimulationBundle;
  mode?: "calculation" | "simulation" | "baseline" | "comparisons" | "editorTimeline";
  cacheKey?: string;
  baseline?: RotationSimulationBaseline;
};

const baselineCache = new Map<string, RotationSimulationBaseline>();
const editorTimelineCache = new Map<string, ReturnType<typeof calculateEditorTimeline>["timeline"]>();

function benchmarkLabel(
  mode: NonNullable<WorkerRequest["mode"]>,
  bundle: RotationCalculationBundle | RotationSimulationBundle,
) {
  if (!("timeline" in bundle)) return `${mode}: legacy calculation bundle`;
  const rotationName = bundle.timeline.rotation.name || "Unnamed rotation";
  if (mode !== "comparisons") return `${mode}: ${rotationName}`;
  const variants = [
    ...bundle.statPriority,
    ...bundle.attunementPriority,
    ...bundle.innerWayPriority,
    ...Object.values(bundle.setupComparisons).flat(),
  ];
  const labels = variants.map((variant) => variant.label).filter(Boolean);
  return labels.length > 0 ? `${mode}: ${rotationName} — ${labels.join(", ")}` : `${mode}: ${rotationName}`;
}

self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const { id, bundle, cacheKey } = event.data;
  try {
    const mode = event.data.mode ?? "calculation";
    const calculate = () => {
      switch (mode) {
        case "editorTimeline": {
          const editorBundle = bundle as RotationSimulationBundle;
          const editorTimeline = calculateEditorTimeline(editorBundle.timeline);
          const start = editorTimeline.rotation.start;
          const fingerprint = rotationBundleFingerprint({
            ...editorBundle,
            timeline: { ...editorBundle.timeline, rotation: editorTimeline.rotation },
            startAnchor: {
              rowId: `rotation-${start?.step ?? 0}`,
              ...(start?.action === undefined ? {} : { actionIndex: start.action }),
            },
          });
          editorTimelineCache.set(fingerprint, editorTimeline.timeline);
          if (editorTimelineCache.size > 8) editorTimelineCache.delete(editorTimelineCache.keys().next().value!);
          return { editorTimeline: { ...editorTimeline, fingerprint } };
        }
        case "baseline": {
          if (!cacheKey) throw new Error("A baseline cache key is required");
          const fingerprint = rotationBundleFingerprint(bundle as RotationSimulationBundle);
          const prepared = editorTimelineCache.get(fingerprint);
          editorTimelineCache.delete(fingerprint);
          const calculated = calculateRotationBaseline(bundle as RotationSimulationBundle, prepared);
          baselineCache.set(cacheKey, calculated);
          if (baselineCache.size > 64) baselineCache.delete(baselineCache.keys().next().value!);
          return compactInnerWayResults(calculated);
        }
        case "comparisons": {
          if (!cacheKey) throw new Error("A comparison cache key is required");
          const baseline = baselineCache.get(cacheKey) ?? event.data.baseline;
          if (!baseline) throw new Error(`No cached baseline exists for ${cacheKey}`);
          baselineCache.set(cacheKey, baseline);
          return {
            metrics: calculateRotationComparisons(bundle as RotationSimulationBundle, baseline, (completed, total) => {
              self.postMessage({ id, progress: total > 0 ? completed / total : 1 });
            }),
          };
        }
        case "simulation":
          return calculateRotationSimulation(bundle as RotationSimulationBundle);
        case "calculation":
          return { metrics: calculateRotationMetrics(bundle as RotationCalculationBundle) };
      }
    };
    const result = import.meta.env.DEV
      ? withCalculationBenchmark(benchmarkLabel(mode, bundle), calculate)
      : calculate();
    self.postMessage({ id, ...result });
  } catch (error) {
    self.postMessage({ id, error: error instanceof Error ? error.message : String(error) });
  }
};
