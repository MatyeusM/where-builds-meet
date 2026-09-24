import * as v from "valibot"

const finiteNumber = v.pipe(v.number(), v.finite())
const stringMap = v.record(v.string(), v.string())
const numberMap = v.record(v.string(), finiteNumber)

export const pathSelectionSchema = stringMap
export const settingsSchema = v.looseObject({
  weapons: v.optional(v.array(v.string())),
  ping: v.optional(finiteNumber),
  weapon: v.optional(v.string()),
})
export const statMapSchema = numberMap
export const attunementMapSchema = numberMap
export const simulationPercentilesSchema = v.array(v.pipe(finiteNumber, v.minValue(0), v.maxValue(100)))
export const globalDebuffStateSchema = v.looseObject({
  draught: v.optional(v.string()),
  phantomChime: v.optional(v.boolean()),
  qiImbalance: v.optional(v.boolean()),
  soulShaken: v.optional(v.boolean()),
  vulnerable: v.optional(v.boolean()),
  fearfulBlade: v.optional(v.boolean()),
  qingyisCharm: v.optional(v.string()),
  floatingGrace: v.optional(v.string()),
})
