import { useEffect, useMemo, useState } from "react"

import { buildMeasurement, type MeasurementContext } from "@/calculations/rotationCalculationBundle"
import type { RotationRecord } from "@/calculations/rotationTimeline"
import type { ThroughputReading } from "@/calculations/rotationWorkerTransport"
import type { BuildEntry, GearItem } from "@/gear"
import { useDpsStore } from "@/stores/dpsStore"

/**
 * A build's throughput, measured when it is looked at rather than when it is activated.
 *
 * Two builds are measured at a time at most: the one on screen, and the active one it is
 * weighed against. The active one's reading is nearly free, because its baseline is already
 * calculated for the rotation editor and the bundle here produces the same key, so the worker
 * holding that baseline answers without running the rotation again.
 *
 * A reading is only shown while it still describes the build and rotation currently on screen.
 * The key it was measured under is compared during render rather than cleared in an effect, so
 * changing selection shows nothing for one render instead of arranging a second render to
 * remove what is there.
 */
export function useBuildThroughput(input: {
  build: BuildEntry | undefined
  gearItems: GearItem[]
  context: MeasurementContext
  rotation: RotationRecord | undefined
}): ThroughputReading | undefined {
  const { build, gearItems, context, rotation } = input
  const [resolved, setResolved] = useState<{ cacheKey: string; reading: ThroughputReading }>()

  const measured = useMemo(
    () => (build && rotation ? buildMeasurement({ build, gearItems, context, rotation }) : undefined),
    [build, gearItems, context, rotation],
  )

  useEffect(() => {
    if (!measured) return
    const store = useDpsStore.getState()
    // A reading already held costs nothing to ask for, and is the common case on a revisit.
    if (store.peek("throughput", measured.cacheKey)) return
    let current = true
    void store
      .ensure({ kind: "throughput", cacheKey: measured.cacheKey, build: () => measured.bundle, priority: 120 })
      .then(reading => {
        if (current) setResolved({ cacheKey: measured.cacheKey, reading })
      })
      .catch(() => {
        // A superseded or torn-down worker rejects. The reading is then simply absent until
        // something asks again, which is the same as never having measured it.
      })
    return () => {
      current = false
    }
  }, [measured])

  if (!measured) return undefined
  if (resolved?.cacheKey === measured.cacheKey) return resolved.reading
  return useDpsStore.getState().peek("throughput", measured.cacheKey)
}
