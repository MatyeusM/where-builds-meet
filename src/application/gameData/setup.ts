import arsenalDefinitions from "../../../data/arsenal.json"
import bowRingSetDefinitions from "../../../data/bow-ring-set.json"
import breakthroughProfiles from "../../../data/breakthrough.json"
import divinecraftDefinitions from "../../../data/divinecraft.json"
import foodDefinitions from "../../../data/food.json"
import scriptDefinitions from "../../../data/script.json"
import systemStats from "../../../data/system.json"
import { DEFAULT_PING_MS } from "../../calculations/combatDefaults"
import type { EditableObject, ResourceEventRule } from "../../calculations/rotationTimeline"
import type { EffectiveStatEffectContainer, StatEffectContainer } from "../../calculations/statEffects"
import type { BaseAttributeData } from "../../data/baseAttributeEffects"
import { createBaseAttributeEffects } from "../../data/baseAttributeEffects"
import { armorSetDefinitions, weaponSetDefinitions, type SetDefinition } from "../../gear"
import type { EnemyProfile } from "../../types"
import type { CalculatorSettings } from "../contracts"

export type SetupEffect = StatEffectContainer &
  EffectiveStatEffectContainer & {
    condition?: string
    requirement?: unknown
    trigger?: EditableObject
    buffDurationBonus?: number
    target?: string
    modify?: EditableObject
  }
export type BreakthroughProfile = EnemyProfile & {
  soloLevel: number
  martialArtTalentRank: number
  levelBonusStats: SetupEffect & {
    rawStat: { precision: number; agility: number; power: number; momentum: number; body: number; defense: number }
  }
}
export const typedBreakthroughProfiles = breakthroughProfiles as Record<string, BreakthroughProfile>
export const defaultBreakthrough = "17"
export const defaultSettings: CalculatorSettings = {
  weapons: ["snowparting", "phalanxbane"],
  breakthrough: defaultBreakthrough,
  ping: DEFAULT_PING_MS,
}

export function breakthroughProfile(settings: CalculatorSettings) {
  return typedBreakthroughProfiles[settings.breakthrough] ?? typedBreakthroughProfiles[defaultSettings.breakthrough]
}

export type SystemStatsDefinition = {
  initialResources: Record<string, number>
  resourceMaximums: Record<string, number>
  resourceEvents: ResourceEventRule[]
  baseStats: SetupEffect
  enhancementStats: Array<SetupEffect & { id: string }>
  talentStats: Array<SetupEffect & { id: string }>
  qingheOddityStats: Array<SetupEffect & { id: string }>
  kaifengOddityStats: Array<SetupEffect & { id: string }>
  imperialPalaceOddityStats: Array<SetupEffect & { id: string }>
  hexiOddityStats: Array<SetupEffect & { id: string }>
  hiddenMountainOddityStats: Array<SetupEffect & { id: string }>
  baseAttributes: BaseAttributeData
}
export const typedSystemStats = systemStats as SystemStatsDefinition
export const baseAttributeEffects = createBaseAttributeEffects(typedSystemStats.baseAttributes)
export const systemStatEffects: SetupEffect[] = [
  typedSystemStats.baseStats,
  ...typedSystemStats.enhancementStats,
  ...typedSystemStats.talentStats,
  ...typedSystemStats.qingheOddityStats,
  ...typedSystemStats.kaifengOddityStats,
  ...typedSystemStats.imperialPalaceOddityStats,
  ...typedSystemStats.hexiOddityStats,
  ...typedSystemStats.hiddenMountainOddityStats,
  ...baseAttributeEffects,
]
export type ArsenalDefinition = { name: string; effect?: SetupEffect }
export const typedArsenalDefinitions = arsenalDefinitions as Record<string, ArsenalDefinition>
export const typedBowRingSetDefinitions = bowRingSetDefinitions as Record<string, ArsenalDefinition>
export type GearSetOption = { name: string; effect?: SetupEffect | SetupEffect[] }
export type GearSetDefinition = Omit<SetDefinition, "options"> & { options: Record<string, GearSetOption> }
export const typedWeaponSetDefinitions = weaponSetDefinitions as Record<string, GearSetDefinition>
export const typedArmorSetDefinitions = armorSetDefinitions as Record<string, GearSetDefinition>
export const typedFoodDefinitions = foodDefinitions as Record<string, ArsenalDefinition>
export type DivinecraftDefinition = ArsenalDefinition & {
  description: string
  image?: string
  available?: boolean
  altersTimeline?: boolean
}
export const typedDivinecraftDefinitions = divinecraftDefinitions as Record<string, DivinecraftDefinition>
export type ScriptDefinition = ArsenalDefinition & { description: string; image?: string; altersTimeline?: boolean }
export const typedScriptDefinitions = scriptDefinitions as Record<string, ScriptDefinition>
export const scriptDisplayOrder = [
  "Wraithstrike",
  "Voidrot",
  "Convergence",
  "Opportunity",
  "Detachment",
  "Insight",
  "Revelry",
  "None",
] as const
export const divinecraftDisplayOrder = [
  "Fire",
  "FireWater",
  "FirePoison",
  "None",
  "WaterFire",
  "WaterPoison",
  null,
  "PoisonFire",
  "PoisonWater",
] as const

export function arsenalEffectFor(value: string) {
  return typedArsenalDefinitions[value]?.effect ?? {}
}

export function bowRingSetEffectFor(value: string) {
  return typedBowRingSetDefinitions[value]?.effect ?? {}
}

export function divinecraftEffectFor(value: string) {
  return typedDivinecraftDefinitions[value]?.effect ?? {}
}

export function scriptEffectFor(value: string) {
  return typedScriptDefinitions[value]?.effect ?? {}
}
