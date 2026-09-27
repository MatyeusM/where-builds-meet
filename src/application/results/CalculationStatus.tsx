import { useSyncExternalStore } from "react"

import {
  getRotationCalculationStatus,
  subscribeToRotationCalculationStatus,
  type RotationCalculationCategory,
} from "../../calculations/rotationMetrics"
import { CalculationStatus as CalculationStatusView } from "../../ui/CalculationStatus"
import { calculationStatusLabel } from "./calculationStatusLabel"

/**
 * Binds one category of the rotation calculation to the shared status primitive. A category
 * the calculation reports no progress for is described without a percentage.
 */
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
  return (
    <CalculationStatusView
      busy={recalculating}
      progress={progress}
      label={calculationStatusLabel(recalculating, progress)}
      className={className}
    />
  )
}
