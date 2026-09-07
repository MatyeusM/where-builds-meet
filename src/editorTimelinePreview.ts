import type { RotationRecord, TimelineBuildInput, TimelineRow } from "./calculations/rotationTimeline";
import { isAutomaticCooldownDelay } from "./rotationEditing";

/** Reconciliation changes generated waits only; editable steps retain their ordinal identity. */
export function reconciledEditorStepIndexes(before: RotationRecord, after: RotationRecord) {
  const afterIndexes = after.steps.flatMap((step, index) => (isAutomaticCooldownDelay(step) ? [] : [index]));
  const mapping = new Map<number, number>();
  let ordinal = 0;
  before.steps.forEach((step, index) => {
    if (!isAutomaticCooldownDelay(step)) mapping.set(index, afterIndexes[ordinal++]);
  });
  return mapping;
}

export type EditorRevision = { id: string; context: string; rotation: RotationRecord };
export function sameEditorRevision(left: EditorRevision, right: EditorRevision) {
  return left.id === right.id && left.context === right.context && left.rotation === right.rotation;
}

/** Editable placeholders only: no event simulation, cooldown math, or effective-stat calculation. */
export function pendingEditorTimeline(
  input: Pick<TimelineBuildInput, "rotation" | "skills" | "eventDefinitions">,
  previous?: { rotation: RotationRecord; timeline: TimelineRow[] },
): TimelineRow[] {
  const oldByStep = new Map(
    previous?.timeline
      .filter((row) => row.kind === "rotation")
      .map((row) => [previous.rotation.steps[row.rotationIndex ?? -1], row]),
  );
  const sourceIds = new Map<string, string>();
  const rows = input.rotation.steps.map((step, index): TimelineRow => {
    const old = oldByStep.get(step);
    const id = `rotation-${index}`;
    if (old) sourceIds.set(old.id, id);
    const skill = step.type === "skill" ? input.skills[step.skill ?? ""] : input.eventDefinitions[step.event];
    return {
      id,
      kind: "rotation",
      rotationIndex: index,
      order: index * 1000,
      step,
      skill,
      startTime: old?.startTime ?? 0,
      effectiveCastTime: old?.effectiveCastTime ?? 0,
      distance: old?.distance ?? 1,
      currentHP: old?.currentHP ?? 0,
      currentHPRatio: old?.currentHPRatio ?? 1,
      targetHPRatio: old?.targetHPRatio ?? 1,
      targetQiRatio: old?.targetQiRatio ?? 1,
      resources: old?.resources ?? {},
      buffs: old?.buffs ?? [],
      debuffs: old?.debuffs ?? [],
      actions: old?.actions ?? [],
      actionStates: old?.actionStates ?? {},
      modifierEffects: old?.modifierEffects ?? [],
      sourceRowId: old?.sourceRowId,
      pendingCalculation: true,
    };
  });
  for (const row of rows) if (row.sourceRowId) row.sourceRowId = sourceIds.get(row.sourceRowId);
  for (const old of previous?.timeline ?? []) {
    if (old.kind !== "trigger" || !old.sourceRowId) continue;
    const sourceRowId = sourceIds.get(old.sourceRowId);
    if (sourceRowId) rows.push({ ...old, sourceRowId, pendingCalculation: true });
  }
  return rows;
}
