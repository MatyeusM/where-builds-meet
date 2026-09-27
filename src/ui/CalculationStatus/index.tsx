import { useMemo, type CSSProperties } from "react"

import { t } from "../../i18n"

/**
 * How far along a calculation is. A progress of undefined means the work reports no
 * intermediate steps, which reads as indeterminate rather than as a stalled zero, because
 * a calculation that reports nothing is not a calculation stuck at the start.
 *
 * Presentation only. Whoever owns the calculation subscribes to it and passes the numbers
 * in, so this stays independent of any particular calculation's state.
 */
export function CalculationStatus({
  recalculating,
  progress,
  className = "",
}: {
  recalculating: boolean
  progress?: number
  className?: string
}) {
  const percentage = progress === undefined ? undefined : Math.round(progress * 100)
  const progressStyle = useMemo(
    () => (percentage === undefined ? undefined : ({ "--calculation-progress": `${percentage}%` } as CSSProperties)),
    [percentage],
  )
  const label = statusLabel(recalculating, percentage)
  const indeterminate = recalculating && percentage === undefined
  return (
    <div
      className={`calculation-status ${className} ${recalculating ? "" : "idle"} ${indeterminate ? "indeterminate" : ""}`}
      style={progressStyle}
      aria-live="polite"
    >
      <progress
        className="visually-hidden"
        max={100}
        {...(percentage === undefined ? {} : { value: recalculating ? percentage : 100 })}
        aria-label={label}
      />
      {label}
    </div>
  )
}

function statusLabel(recalculating: boolean, percentage: number | undefined) {
  if (!recalculating) return t("ui.app.upToDate")
  if (percentage === undefined) return t("ui.app.recalculating")
  return t("ui.app.recalculatingProgress", { percentage })
}
