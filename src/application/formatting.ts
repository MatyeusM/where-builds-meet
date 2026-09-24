import type { SkillRecord } from "../calculations/rotationTimeline"
import { dataText } from "../i18n"
import { allSkillDefinitions, skillDataNamespaceById } from "./gameData/skills"

export function formatNumber(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/0+$/, "").replace(/\.$/, "")
}

export function formatDamageNumber(value: number) {
  const rounded = Number(value.toFixed(2))
  return rounded === 0 ? "0" : rounded.toFixed(2)
}

export type ThroughputChannel = "damage" | "healing"

export function displayedDelta(value: number) {
  return Number(value.toFixed(2))
}

export function formatDelta(value: number) {
  const delta = displayedDelta(value)
  return delta === 0 ? "0" : delta.toFixed(2)
}

export function deltaPrefix(value: number) {
  return displayedDelta(value) > 0 ? "+" : ""
}

export function throughputDeltaClass(value: number, channel: ThroughputChannel) {
  const delta = displayedDelta(value)
  if (delta === 0) return "throughput-neutral"
  switch (channel) {
    case "damage":
      return delta > 0 ? "damage-positive" : "damage-negative"
    case "healing":
      return delta > 0 ? "healing-positive" : "healing-negative"
  }
}

export function skillFieldText(skillId: string, skill: SkillRecord | undefined, field: "name" | "shortName") {
  const value = skill?.[field]?.trim()
  if (!value) return field === "name" ? skillId : ""
  const namespace = skillDataNamespaceById.get(skillId)
  const defaultValue = allSkillDefinitions[skillId]?.[field]?.trim()
  return namespace && value === defaultValue ? dataText(`data.skill.${namespace}.${skillId}.${field}`, value) : value
}

export function skillDisplayName(skill: SkillRecord | undefined, fallback = "", skillId = fallback) {
  const name = skillFieldText(skillId, skill, "name")
  const shortName = skillFieldText(skillId, skill, "shortName")
  return shortName ? `${name} (${shortName})` : name
}

export function formatResourceRange(value: number, range: { minimum: number; maximum: number } | undefined) {
  if (!range || Math.abs(range.maximum - range.minimum) < 1e-9) return formatNumber(value)
  return `${formatNumber(range.minimum)} ~ ${formatNumber(range.maximum)}`
}
