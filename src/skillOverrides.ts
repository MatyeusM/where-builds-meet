import type { EffectDefinition, SkillRecord } from "./calculations/rotationTimeline";

export type SkillMap = Record<string, SkillRecord>;
export type SkillCategory =
  | "Snowparting"
  | "Phalanxbane"
  | "Thundercry"
  | "Stormbreaker"
  | "Heavenwill"
  | "Skygrasp"
  | "Panacea"
  | "Soulshade"
  | "Mystic"
  | "General";
export type EditorCategory = SkillCategory | "Buff" | "Debuff" | "DOT";
export type SkillOverrides = Partial<Record<EditorCategory, SkillMap>>;

export function deserializeSkillOverrides(value: unknown): SkillOverrides {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const stored = value as Record<string, unknown>;
  const currentCoefficients = stored.version === 2;
  const migrate = (entry: unknown): unknown => {
    if (Array.isArray(entry)) return entry.map(migrate);
    if (!entry || typeof entry !== "object") return entry;
    const record = Object.fromEntries(Object.entries(entry).map(([key, child]) => [key, migrate(child)]));
    if (record.stackDamage !== undefined) {
      if (record.stackDamage === true && record.tickOnExpire === undefined) record.tickOnExpire = false;
      delete record.stackDamage;
    }
    switch (record.type) {
      case "damage":
        if (!currentCoefficients && record.attrCoef === undefined) record.attrCoef = record.phyCoef ?? 0;
        break;
      case "heal":
        if (!currentCoefficients && record.silkbindCoef === undefined) record.silkbindCoef = record.phyCoef ?? 0;
        break;
    }
    return record;
  };
  return migrate(currentCoefficients ? (stored.overrides ?? {}) : value) as SkillOverrides;
}

export function serializeSkillOverrides(overrides: SkillOverrides) {
  return JSON.stringify({ version: 2, overrides });
}

export function resolveSkillCalculationDefinitions(
  defaultSkillMaps: Record<SkillCategory, SkillMap>,
  defaultEffectDefinitions: Record<string, EffectDefinition>,
  defaultDotDefinitions: SkillMap,
  overrides: SkillOverrides,
) {
  const skills = Object.assign(
    {},
    ...(Object.entries(defaultSkillMaps) as Array<[SkillCategory, SkillMap]>).map(([category, definitions]) => ({
      ...definitions,
      ...(overrides[category] ?? {}),
    })),
  ) as SkillMap;
  const dots = { ...defaultDotDefinitions, ...(overrides.DOT ?? {}) };
  const effectDefinitions = {
    ...defaultEffectDefinitions,
    ...(overrides.Buff ?? {}),
    ...(overrides.Debuff ?? {}),
    ...(overrides.DOT ?? {}),
  } as Record<string, EffectDefinition>;
  return { skills, dots, effectDefinitions };
}
