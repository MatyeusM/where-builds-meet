import { useEffect, useRef } from "react"

import type { PathId } from "../../application/contracts"
import { typedPathDefinitions } from "../../application/gameData/paths"
import { buildGraduationBundleSet, selectHighestGraduationResult } from "../../application/graduation"
import { loadRotationEntries } from "../../application/persistence/rotations"
import { resolveBaseline } from "../../application/resolveRotationMetrics"
import { rotationAvailableForWeapons, rotationRecordForEntry } from "../../application/rotationCatalog"
import { resolvePing } from "../../calculations/combatDefaults"
import type { MeasurementContext } from "../../calculations/rotationCalculationBundle"
import { buildMeasurement } from "../../calculations/rotationCalculationBundle"
import type { BuildEntry, GearItem } from "../../gear"
import { gameText } from "../../i18n"
import { useDpsStore } from "../../stores/dpsStore"
import { useRotationStore, type ActiveRotationResult } from "../../stores/rotationStore"

/**
 * Publishes the rotation every other surface shows.
 *
 * The rotation editor used to own this because it also owned the comparison sweep, and only
 * something that ran the sweep could produce a rotation's numbers. A rotation's totals are a
 * single baseline entry in the calculation cache, so they no longer need an owner to stay alive
 * and this resolves them directly. Nothing outside the editor reads a comparison, so the sweep
 * stays with the editor and the application no longer waits for it on load.
 */

type ActiveRotationInput = {
  pathId: PathId
  build: BuildEntry | undefined
  gearItems: GearItem[]
  measurement: MeasurementContext
  activeRotationId: string
  defaultRotationId: string
  devMode: boolean
  weapons: [string, string]
}

/** The stored record for the active rotation, or undefined when none is available. */
function resolveActiveRotation(input: ActiveRotationInput) {
  const entries = loadRotationEntries().filter(
    entry => (input.devMode || !entry.test) && rotationAvailableForWeapons(entry, input.weapons as never),
  )
  const entry =
    entries.find(candidate => candidate.id === input.activeRotationId) ??
    entries.find(candidate => candidate.id === input.defaultRotationId) ??
    entries[0]
  if (!entry) return undefined
  const rotation = rotationRecordForEntry(entry)
  return { entry, rotation, name: entry.isDefault ? gameText(rotation.name) : rotation.name || "Active rotation" }
}

export function useActiveRotationResult(input: ActiveRotationInput) {
  const { pathId, build, gearItems, measurement, activeRotationId, defaultRotationId } = input
  const requestRef = useRef(0)
  const context = measurement
  const contextKey = `${pathId}:${activeRotationId}:${defaultRotationId}:${JSON.stringify(measurement)}`

  useEffect(() => {
    const request = ++requestRef.current
    const current = () => requestRef.current === request
    const active = resolveActiveRotation({ ...input, weapons: input.weapons as never })
    if (!active) return
    const { bundle, cacheKey } = buildMeasurement({ build, gearItems, context, rotation: active.rotation })
    const bundleKey = `${active.entry.id}:${cacheKey}`

    // Unsaved edits to the active rotation have always moved the headline, so the editor's
    // draft outranks the stored record while the two disagree. Once they agree the draft is the
    // stored record, and publishing here is the same value it already holds.
    const held = useRotationStore.getState().result
    if (held?.draft && held.bundleKey !== bundleKey) return

    const graduation = buildGraduationBundleSet({
      pathId,
      martialArts: [...measurement.environment.settings.weapons],
      rotation: { ...active.rotation, ping: resolvePing(active.rotation.ping, measurement.environment.settings.ping) },
      breakthrough: measurement.environment.settings.breakthrough,
      globalDebuffs: measurement.environment.globalDebuffs,
      food: measurement.environment.setupSelections.food,
      script: measurement.environment.setupSelections.script,
      divinecraft: measurement.environment.setupSelections.divinecraft,
      graduatedBuildIds: typedPathDefinitions[pathId].graduated,
      skillOverrides: measurement.environment.skillOverrides,
    })

    const publish = (metrics: ActiveRotationResult["metrics"], dps?: number) => {
      if (!current()) return
      useRotationStore
        .getState()
        .publish({
          pathId,
          rotationId: active.entry.id,
          rotationName: active.name,
          rotationIsDefault: active.entry.isDefault === true,
          rotation: active.rotation,
          bundle,
          bundleKey,
          metrics,
          draft: false,
          contextKey,
          graduation: graduation ? { fingerprint: graduation.fingerprint, dps } : undefined,
        })
    }

    void (async () => {
      try {
        const resolved = await resolveBaseline(bundle)
        if (!current()) return
        const cached = graduation
          ? selectHighestGraduationResult(
              graduation.candidates.flatMap(candidate => {
                const reading = useDpsStore.getState().peek("throughput", candidate.fingerprint)
                return reading ? [reading] : []
              }),
            )?.dps
          : undefined
        publish(resolved.baseline.metrics, cached)
        if (!graduation || cached !== undefined || !current()) return
        const readings = await Promise.all(
          graduation.candidates.map(candidate =>
            useDpsStore
              .getState()
              .ensure({
                kind: "throughput",
                cacheKey: candidate.fingerprint,
                build: () => candidate.bundle,
                priority: 390,
              }),
          ),
        )
        publish(resolved.baseline.metrics, selectHighestGraduationResult(readings)?.dps)
      } catch {
        // A superseded or cancelled resolve is an ordinary outcome of switching path or rotation,
        // and the next effect run publishes the current one. A real failure surfaces through the
        // notices the calculation path already raises.
      }
    })()
    // `contextKey` covers every input above, so it stands in for them as the trigger.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contextKey])
}
