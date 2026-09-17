import type { AttunementStats } from "./damage"

export type AttunementOverrides = Partial<AttunementStats>

export type AttunementTagFilter = {
  /** All entries must match; a nested array matches any one of its tags. */
  tags?: Array<string | string[]>
  excludeTags?: string[]
}

export function attunementMatchesSkill(filter: AttunementTagFilter | undefined, skillTags: string[]) {
  const included =
    filter?.tags?.every(tag =>
      typeof tag === "string" ? skillTags.includes(tag) : tag.some(alternative => skillTags.includes(alternative)),
    ) ?? true
  return included && !filter?.excludeTags?.some(tag => skillTags.includes(tag))
}

/** Keep UI overrides final while hit calculation inputs exclude bonuses applied through character stats. */
export function resolveAttunementStats(
  defaults: AttunementStats,
  equipped: Partial<AttunementStats>,
  overrides: AttunementOverrides,
  characterStatBonuses: Partial<AttunementStats>,
) {
  const calculation = { ...defaults }
  const displayed = { ...defaults }

  for (const key of Object.keys(defaults) as Array<keyof AttunementStats>) {
    const bonus = characterStatBonuses[key] ?? 0
    const hasOverride = Object.prototype.hasOwnProperty.call(overrides, key)
    const displayedValue = hasOverride ? (overrides[key] ?? 0) : (equipped[key] ?? 0) + bonus
    displayed[key] = displayedValue
    calculation[key] = displayedValue - bonus
  }

  return { calculation, displayed }
}
