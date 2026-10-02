import type { EffectDefinition, SkillRecord } from "@/calculations/rotationTimeline"

/**
 * Narrow a shipped data file to the type the calculation takes.
 *
 * TypeScript infers a JSON module's shape literally, so a string the data means
 * as a member of a union widens to `string` and an object the data means as one
 * alternative widens to their common shape. The shipped content is right; only
 * the inferred type drifts from what the calculation declares. Specs that feed a
 * data file straight into a fixture pass it through here, so the one cast this
 * needs is stated once with its reason rather than repeated at every import.
 */
export function asSkillRecords(file: unknown): Record<string, SkillRecord> {
  return file as Record<string, SkillRecord>
}

export function asEffectDefinitions(file: unknown): Record<string, EffectDefinition> {
  return file as Record<string, EffectDefinition>
}
