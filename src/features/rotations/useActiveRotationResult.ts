import { useEffect, useMemo, useRef } from "react"

import type { PathId } from "@/application/contracts"
import { typedPathDefinitions } from "@/application/gameData/paths"
import { buildGraduationBundleSet, selectHighestGraduationResult } from "@/application/graduation"
import { loadRotationEntries } from "@/application/persistence/rotations"
import { resolveBaseline, resolveComparisonMetrics } from "@/application/resolveRotationMetrics"
import { rotationAvailableForWeapons, rotationRecordForEntry } from "@/application/rotationCatalog"
import { calculationFingerprint, rotationBundleFingerprint } from "@/calculations/calculationFingerprint"
import { resolvePing } from "@/calculations/combatDefaults"
import type { MeasurementContext } from "@/calculations/rotationCalculationBundle"
import { buildRotationCalculationBundle, measurementSubject } from "@/calculations/rotationCalculationBundle"
import { buildRotationComparisonBundle } from "@/calculations/rotationComparisonBundle"
import type { BuildEntry, GearItem } from "@/gear"
import { gameText } from "@/i18n"
import { useDpsStore } from "@/stores/dpsStore"
import { useRotationStore, type ActiveRotationResult } from "@/stores/rotationStore"

/**
 * Resolves and publishes the rotation every other surface shows: its baseline, its graduation
 * reading, and its comparisons.
 *
 * Nothing here needs the rotation editor, which is the point. The editor used to own this because
 * it ran the comparison sweep, so the character sheet's priority panels and the breakdown could
 * only be filled once it was opened. Every part of a rotation's result is a cache entry keyed by
 * the fingerprint of the bundle it came from, so the application resolves the same entries the
 * editor does and lands on the same numbers, whether or not it is on screen.
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

/** The graduation reading already held for every candidate, or undefined while any is missing. */
function cachedGraduationDps(prepared: ReturnType<typeof buildGraduationBundleSet>) {
  if (!prepared) return undefined
  const cached = prepared.candidates.flatMap(candidate => {
    const reading = useDpsStore.getState().peek("throughput", candidate.fingerprint)
    return reading ? [reading] : []
  })
  if (cached.length !== prepared.candidates.length) return undefined
  return selectHighestGraduationResult(cached)?.dps
}

export function useActiveRotationResult(input: ActiveRotationInput) {
  const { pathId, build, gearItems, measurement, activeRotationId, defaultRotationId } = input
  const requestRef = useRef(0)
  const context = measurement
  // Fingerprinted rather than serialised, and memoised, because this is read on every render of
  // the application and the inputs it covers are only worth re-reading when they actually change.
  const contextKey = useMemo(
    () => `${pathId}:${activeRotationId}:${defaultRotationId}:${calculationFingerprint(measurement)}`,
    [pathId, activeRotationId, defaultRotationId, measurement],
  )

  useEffect(() => {
    const request = ++requestRef.current
    const current = () => requestRef.current === request
    const active = resolveActiveRotation({ ...input, weapons: input.weapons as never })
    if (!active) return
    // One subject for both bundles, so the comparisons resolve against the baseline the store
    // already holds rather than a second assembly of the same rotation.
    const subject = measurementSubject({ build, gearItems, context, rotation: active.rotation })
    const bundle = buildRotationCalculationBundle(subject)
    const cacheKey = rotationBundleFingerprint(bundle)
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
          graduation: graduation ? { fingerprint: graduation.fingerprint, dps } : undefined,
        })
    }

    void (async () => {
      const store = useRotationStore.getState()
      try {
        store.startCategory("baseline")
        const resolved = await resolveBaseline(bundle)
        if (!current()) return
        store.settleCategory("baseline")
        // The totals are published before the comparisons, so the headline lands as soon as the
        // rotation itself is measured rather than waiting for the panels around it.
        publish(resolved.baseline.metrics, cachedGraduationDps(graduation))

        const metrics = await resolveComparisonMetrics({
          bundle: buildRotationComparisonBundle(subject),
          baselineKey: cacheKey,
          baseline: () => resolved.baseline,
          onCategoryStarted: category => {
            if (current()) useRotationStore.getState().startCategory(category)
          },
          onCategoryProgress: (category, progress) => {
            if (current()) useRotationStore.getState().progressCategory(category, progress)
          },
          onCategoryResolved: (merged, category) => {
            if (!current()) return
            publish(merged, cachedGraduationDps(graduation))
            useRotationStore.getState().settleCategory(category)
          },
        })
        if (!current()) return
        publish(metrics, cachedGraduationDps(graduation))
        if (!graduation || cachedGraduationDps(graduation) !== undefined || !current()) return
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
        publish(metrics, selectHighestGraduationResult(readings)?.dps)
      } catch {
        // A superseded or cancelled resolve is an ordinary outcome of switching path or rotation,
        // and the next effect run publishes the current one. A real failure surfaces through the
        // notices the calculation path already raises.
      }
    })()
    // `contextKey` is a fingerprint of every input read above, so depending on it alone is both
    // correct and cheaper than listing them: they are read inside the effect only when it runs.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [contextKey])
}
