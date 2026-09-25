import { resolvePing } from "../calculations/combatDefaults"
import { calculationFingerprint } from "../calculations/rotationCalculationCache"
import type { RotationSimulationBundle } from "../calculations/rotationCalculator"
import type { RotationRecord } from "../calculations/rotationTimeline"
import {
  calculateStatsWithOverrides,
  requirementIsUnconditional,
  type StatEffectContainer,
} from "../calculations/statEffects"
import { emptyStats } from "../data/statDefinitions"
import { buildPresetInventory, calculateEquippedGearEffects, defaultBuildPresets, normalizeBuildSetup } from "../gear"
import { globalBuffTimelineEffects, globalDebuffTimelineEffects, type GlobalDebuffState } from "../globalDebuffs"
import { resolveSkillCalculationDefinitions, type SkillOverrides } from "../skillOverrides"
import type { WeaponId } from "../types"
import {
  innerWayConditionsFor,
  innerWayEffectRulesFor,
  selectedSetupEffects,
  setupConditionsFor,
} from "./characterComposition"
import type { CalculatorSettings, PathId } from "./contracts"
import { martialArtDefinitions } from "./gameData/martialArts"
import { typedPathDefinitions } from "./gameData/paths"
import { rotationEventDefinitions } from "./gameData/rotationEffects"
import { typedSystemStats, breakthroughProfile } from "./gameData/setup"
import { defaultSkillMaps, dotDefinitions, effectDefinitions } from "./gameData/skills"
import { defaultAttunementStats } from "./persistence/attunements"

export type GraduationEnvironment = {
  pathId: PathId
  martialArts: [WeaponId, WeaponId]
  rotation: RotationRecord
  breakthrough: string
  globalDebuffs: GlobalDebuffState
  food: string
  script: string
  divinecraft: string
  skillOverrides: SkillOverrides
}

export type GraduationPresetEnvironment = GraduationEnvironment & { graduatedBuildIds: string[] }

export function graduationEnvironmentFingerprint(
  environment: GraduationEnvironment,
  graduatedBuildIds: readonly string[] = [],
) {
  const { name: _displayName, ...rotation } = environment.rotation
  return calculationFingerprint({
    pathId: environment.pathId,
    martialArts: environment.martialArts,
    rotation,
    breakthrough: environment.breakthrough,
    globalDebuffs: environment.globalDebuffs,
    food: environment.food,
    script: environment.script,
    divinecraft: environment.divinecraft,
    graduatedBuildIds,
    skillOverrides: environment.skillOverrides,
  })
}

export function selectHighestGraduationResult<T extends { metrics: { dps: number } }>(results: readonly T[]) {
  let highest: T | undefined
  for (const result of results) {
    if (!highest || result.metrics.dps > highest.metrics.dps) highest = result
  }
  return highest
}

export function buildPresetRotationBundle(
  environment: GraduationEnvironment,
  buildId: string,
): RotationSimulationBundle | undefined {
  const { pathId } = environment
  const path = typedPathDefinitions[pathId]
  if (!path || buildId === "empty") return undefined
  const build = defaultBuildPresets.find(candidate => candidate.id === buildId)
  const configuredWeapons = path.lockedWeapons ?? build?.martialArts
  if (!build || configuredWeapons?.length !== 2) return undefined

  const weapons = [...configuredWeapons] as [WeaponId, WeaponId]
  const settings: CalculatorSettings = {
    weapons,
    breakthrough: environment.breakthrough,
    ping: resolvePing(environment.rotation.ping),
  }
  const buildSetup = normalizeBuildSetup(build.setup)
  const equippedGear = calculateEquippedGearEffects(buildPresetInventory(build), weapons, false)
  const gearStatEffect: StatEffectContainer = { rawStat: equippedGear.stats }
  const setupEffects = selectedSetupEffects(
    settings,
    gearStatEffect,
    buildSetup,
    { food: environment.food, divinecraft: environment.divinecraft, script: environment.script },
    pathId,
  )
  const innerWayRules = innerWayEffectRulesFor(buildSetup.innerWays, breakthroughProfile(settings).soloLevel, pathId)
  const innerWayConditions = innerWayConditionsFor(buildSetup.innerWays, undefined, pathId)
  const innerWayStatEffects = innerWayRules
    .filter(
      rule =>
        requirementIsUnconditional(rule.requirement) &&
        (rule.effect.rawStat || rule.effect.stat || rule.effect.effectiveStat),
    )
    .map(rule => rule.effect as StatEffectContainer)
  const unconditionalSetupEffects = setupEffects.filter(
    effect => !("requirement" in effect) || requirementIsUnconditional(effect.requirement),
  )
  const enemy = breakthroughProfile(settings)
  const statState = calculateStatsWithOverrides(
    emptyStats,
    [...unconditionalSetupEffects, ...innerWayStatEffects],
    enemy.judgementResistance,
    {},
    weapons,
  )
  const definitions = resolveSkillCalculationDefinitions(
    defaultSkillMaps,
    effectDefinitions,
    dotDefinitions,
    environment.skillOverrides,
  )
  const rotation = { ...environment.rotation, ping: resolvePing(environment.rotation.ping) }
  const rotationAnchor = rotation.start
    ? { rowId: `rotation-${rotation.start.step}`, actionIndex: rotation.start.action }
    : { rowId: "rotation-0" }

  return {
    timeline: {
      rotation,
      skills: definitions.skills,
      eventDefinitions: rotationEventDefinitions,
      dots: definitions.dots,
      effectDefinitions: definitions.effectDefinitions,
      innerWayConditions: [...innerWayConditions, ...setupConditionsFor(setupEffects)],
      innerWayRules,
      setupEffects,
      weapons,
      martialArtState: Object.fromEntries(
        weapons.map(martialArt => [martialArt, { weapon: martialArtDefinitions[martialArt].weapon }]),
      ),
      initialBuffs: globalBuffTimelineEffects(environment.globalDebuffs),
      initialDebuffs: globalDebuffTimelineEffects(environment.globalDebuffs),
      initialResources: { ...typedSystemStats.initialResources, Vitality: statState.stats.maxVitality },
      resourceRegeneration: { HeavensWill: statState.stats.heavensWillRegen },
      resourceMaximums: { ...typedSystemStats.resourceMaximums, Vitality: statState.stats.maxVitality },
      resourceEvents: typedSystemStats.resourceEvents,
      maxHP: statState.stats.maxHp,
    },
    startAnchor: rotationAnchor,
    stats: statState.stats,
    rawStats: statState.rawStats,
    baseStats: statState.baseStats,
    attunement: { ...defaultAttunementStats, ...equippedGear.attunement },
    enemy,
    weapons,
    statPriority: [],
    attunementPriority: [],
    innerWayPriority: [],
    setupComparisons: {},
  }
}

export function buildGraduationBundleSet(environment: GraduationPresetEnvironment) {
  const fingerprint = `graduation:${graduationEnvironmentFingerprint(environment, environment.graduatedBuildIds)}`
  const candidates: Array<{ buildId: string; bundle: RotationSimulationBundle; fingerprint: string }> = []
  for (const buildId of environment.graduatedBuildIds) {
    const bundle = buildPresetRotationBundle(environment, buildId)
    if (!bundle) return undefined
    candidates.push({ buildId, bundle, fingerprint: `${fingerprint}:${buildId}` })
  }
  return candidates.length > 0 ? { fingerprint, candidates } : undefined
}
