import { getPersistentItem, setPersistentItem } from "../../persistentStorage"
import { parseJson } from "../../schemas/json"
import { pathSelectionSchema } from "../../schemas/storage"
import type { PathId } from "../contracts"
import { typedPathDefinitions } from "../gameData/paths"

export type PathSelectionIds = Partial<Record<PathId, string>>

export function loadPathSelectionIds(storageKey: string, legacyStorageKey: string, currentPathId: PathId) {
  const parsed = parseJson(pathSelectionSchema, getPersistentItem(storageKey) ?? "null")
  let selections: PathSelectionIds = parsed.success
    ? (Object.fromEntries(
        Object.entries(parsed.output).filter(
          ([path, id]) => path in typedPathDefinitions && typeof id === "string" && id.length > 0,
        ),
      ) as PathSelectionIds)
    : {}
  if (!selections[currentPathId]) {
    const legacyId = getPersistentItem(legacyStorageKey)
    if (legacyId) {
      selections = { ...selections, [currentPathId]: legacyId }
      setPersistentItem(storageKey, JSON.stringify(selections))
    }
  }
  return selections
}

export function withPathSelection(selections: PathSelectionIds, pathId: PathId, id: string) {
  return selections[pathId] === id ? selections : { ...selections, [pathId]: id }
}
