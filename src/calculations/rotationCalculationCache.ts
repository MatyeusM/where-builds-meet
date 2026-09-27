import type { RotationSimulationBaseline } from "./rotationCalculator"
import type { RotationMetrics } from "./rotationMetrics"

function writeBounded<Value>(cache: Map<string, Value>, key: string, value: Value, maximumEntries: number) {
  cache.delete(key)
  cache.set(key, value)
  while (cache.size > maximumEntries) cache.delete(cache.keys().next().value!)
}

export class RotationCalculationCache {
  readonly #baselines = new Map<string, RotationSimulationBaseline>()
  readonly #variants = new Map<string, RotationMetrics>()

  baseline(fingerprint: string) {
    return this.#baselines.get(fingerprint)
  }

  storeBaseline(fingerprint: string, result: RotationSimulationBaseline) {
    writeBounded(this.#baselines, fingerprint, result, 64)
  }

  variant(fingerprint: string, variantFingerprint: string) {
    return this.#variants.get(`${fingerprint}:${variantFingerprint}`)
  }

  storeVariant(fingerprint: string, variantFingerprint: string, result: RotationMetrics) {
    writeBounded(this.#variants, `${fingerprint}:${variantFingerprint}`, result, 4096)
  }
}
