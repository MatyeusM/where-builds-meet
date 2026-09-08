import type { DamageContext } from "./damage";
import { finishCalculationPhase, startCalculationPhase } from "./calculationBenchmark";
import {
  calculateActionStats,
  type ResolvedStats,
  type StatEffectContainer,
  type EffectiveStatEffectContainer,
} from "./statEffects";

// The baseline is immutable. Reuse the last numerical contribution for each skill snapshot.
const cache = new WeakMap<object, { key: string; stats: ResolvedStats }>();

/** Shared action boundary for damage and healing. Formula functions consume only the resolved snapshot. */
export function resolveActionStatContext(context: DamageContext): DamageContext {
  const started = import.meta.env.DEV ? startCalculationPhase() : 0;
  const detectionStarted = import.meta.env.DEV ? startCalculationPhase() : 0;
  const contributions: Array<StatEffectContainer & EffectiveStatEffectContainer> = [];
  for (const effect of context.effects) {
    if (effect.stat || effect.effectiveStat)
      contributions.push(effect as StatEffectContainer & EffectiveStatEffectContainer);
  }
  const fixed: Record<string, number> = {};
  for (const [key, value] of Object.entries(context.unconditionalDamageEffects ?? {}))
    if (key.startsWith("stat.")) fixed[key.slice(5)] = value;
  if (Object.keys(fixed).length) contributions.push({ stat: fixed });
  if (import.meta.env.DEV) finishCalculationPhase("damageStatEffectDetection", detectionStarted);
  if (!contributions.length) {
    if (import.meta.env.DEV) finishCalculationPhase("damageStatResolution", started);
    return context;
  }
  const key = JSON.stringify([
    context.enemy.judgementResistance,
    context.weapons,
    contributions.map((effect) => [effect.stat, effect.effectiveStat]),
  ]);
  let cached = cache.get(context.stats);
  if (!cached || cached.key !== key) {
    const pipelineStarted = import.meta.env.DEV ? startCalculationPhase() : 0;
    cached = {
      key,
      stats: calculateActionStats(context.stats, contributions, context.enemy.judgementResistance, context.weapons),
    };
    cache.set(context.stats, cached);
    if (import.meta.env.DEV) finishCalculationPhase("damageStatPipeline", pipelineStarted);
  }
  if (import.meta.env.DEV) finishCalculationPhase("damageStatResolution", started);
  return { ...context, stats: cached.stats, derivedStats: cached.stats };
}
