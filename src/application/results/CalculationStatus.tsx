import { useMemo, useSyncExternalStore, type CSSProperties } from "react"

import {
  getRotationCalculationStatus,
  subscribeToRotationCalculationStatus,
  type RotationCalculationCategory,
} from "../../calculations/rotationMetrics"
import { t } from "../../i18n"

export function CalculationStatus({
  category,
  className = "",
}: {
  category: RotationCalculationCategory
  className?: string
}) {
  const statuses = useSyncExternalStore(
    subscribeToRotationCalculationStatus,
    getRotationCalculationStatus,
    getRotationCalculationStatus,
  )
  const { recalculating, progress } = statuses[category]
  const percentage = Math.round(progress * 100)
  const progressStyle = useMemo(() => ({ "--calculation-progress": `${percentage}%` }) as CSSProperties, [percentage])
  return (
    <div
      className={`calculation-status ${className} ${recalculating ? "" : "idle"}`}
      style={progressStyle}
      aria-live="polite"
    >
      <progress
        className="visually-hidden"
        max={100}
        value={recalculating ? percentage : 100}
        aria-label={t("ui.app.recalculatingProgress", { percentage })}
      />
      {recalculating ? t("ui.app.recalculatingProgress", { percentage }) : t("ui.app.upToDate")}
    </div>
  )
}
