import { useSyncExternalStore } from "react"

import {
  getRotationCalculationStatus,
  subscribeToRotationCalculationStatus,
  type RotationCalculationCategory,
} from "../../calculations/rotationMetrics"
import { CalculationStatus as CalculationStatusView } from "../../ui/CalculationStatus"

/**
 * Binds one category of the rotation calculation to the shared status view. A category the
 * calculation reports no progress for renders indeterminate.
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
  return <CalculationStatusView recalculating={recalculating} progress={progress} className={className} />
}
