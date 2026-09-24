import type { AttunementOverrides } from "../../calculations/attunementStats"
import type { AttunementStats } from "../../calculations/damage"
import { attunementData } from "../../gear"
import { getPersistentItem } from "../../persistentStorage"
import { parseJson } from "../../schemas/json"
import { attunementMapSchema } from "../../schemas/storage"
import { attunementOverrideStorageKey, attunementStorageKey, legacyAttunementStorageKey } from "./keys"

export const defaultAttunementStats = Object.fromEntries(
  Object.keys(attunementData).map(key => [key, 0]),
) as AttunementStats
export const percentageAttunementKeys = new Set<keyof AttunementStats>(
  Object.entries(attunementData)
    .filter(([, definition]) => definition.percentage)
    .map(([key]) => key as keyof AttunementStats),
)

export function loadAttunementStats() {
  const currentSaved = getPersistentItem(attunementStorageKey)
  const isLegacy = currentSaved === null
  const parsed = parseJson(attunementMapSchema, currentSaved ?? getPersistentItem(legacyAttunementStorageKey) ?? "null")
  if (!parsed.success) return { ...defaultAttunementStats }
  return Object.fromEntries(
    Object.keys(defaultAttunementStats).map(key => {
      const statKey = key as keyof AttunementStats
      const value =
        typeof parsed.output[key] === "number" && Number.isFinite(parsed.output[key]) ? parsed.output[key] : 0
      return [key, isLegacy && percentageAttunementKeys.has(statKey) ? value / 100 : value]
    }),
  ) as typeof defaultAttunementStats
}

export function loadAttunementOverrides(): AttunementOverrides {
  const currentSaved = getPersistentItem(attunementOverrideStorageKey)
  if (currentSaved !== null) {
    const values = parseJson(attunementMapSchema, currentSaved)
    if (!values.success) return {}
    return Object.fromEntries(
      Object.keys(defaultAttunementStats).flatMap(key => {
        const value = values.output[key]
        return typeof value === "number" && Number.isFinite(value) ? [[key, value]] : []
      }),
    ) as AttunementOverrides
  }
  return Object.fromEntries(
    Object.entries(loadAttunementStats()).filter(([, value]) => value !== 0),
  ) as AttunementOverrides
}
