export const DEFAULT_TARGET_HP_RATIO = 0.99

export const DEFAULT_PING_MS = 40

export function normalizePing(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : undefined
}

export function resolvePing(override: unknown, setting: unknown = DEFAULT_PING_MS): number {
  return normalizePing(override) ?? normalizePing(setting) ?? DEFAULT_PING_MS
}

export function normalizeEnemyCount(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(1, Math.floor(value)) : 1
}
