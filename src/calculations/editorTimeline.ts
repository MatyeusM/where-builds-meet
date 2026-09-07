import {
  buildRotationTimeline,
  type TimelineBuildInput,
  type TimelineRow,
  type RotationRecord,
} from "./rotationTimeline";
import { withoutAutomaticCooldownDelays, withAutomaticCooldownDelays } from "../rotationEditing";

export type EditorTimelineResult = { rotation: RotationRecord; timeline: TimelineRow[]; fingerprint: string };

/** Worker-only reconciliation; preserve the same cooldown and combat rules as baseline calculations. */
export function calculateEditorTimeline(input: TimelineBuildInput) {
  const source = withoutAutomaticCooldownDelays(input.rotation);
  const waiting = buildRotationTimeline({ ...input, rotation: source, cooldownPolicy: "wait" });
  const rotation = withAutomaticCooldownDelays(source, waiting);
  const timeline = rotation === source ? waiting : buildRotationTimeline({ ...input, rotation });
  return { rotation, timeline };
}
