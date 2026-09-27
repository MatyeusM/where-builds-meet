import type { RotationCalculationCategory } from "../../calculations/rotationMetrics"
import { useRotationStore } from "../../stores/rotationStore"
import { CalculationStatus as CalculationStatusView } from "../../ui/CalculationStatus"
import { calculationStatusLabel } from "./calculationStatusLabel"

/**
 * Binds one category of the rotation calculation to the shared status primitive. A category
 * the calculation reports no progress for is described without a percentage.
 *
 * Reading the status by way of the store rather than through a subscription of its own means
 * only this component re-renders when its category's progress moves, however many are on screen.
 */
export function CalculationStatus({
  category,
  className = "",
}: {
  category: RotationCalculationCategory
  className?: string
}) {
  const status = useRotationStore(state => state.status[category])
  const label = calculationStatusLabel(status.recalculating, status.progress)
  return (
    <CalculationStatusView busy={status.recalculating} progress={status.progress} label={label} className={className} />
  )
}
