# Incremental rotation event loop

The rotation is authored input, not a generated timeline. It stores ordered
skills, explicit delays and attachments, plus encounter events with timestamps.
Generated cooldown waits are output only; legacy automatic waits are removed at
the load/import boundary with fight-start indexes remapped.

## Four collections

1. Ordered input: skills and explicit delays, traversed with a cursor. Attachments
   belong to the following eligible anchor and expand with it.
2. Timed input: encounter events sorted once by timestamp and input order.
3. Expanded events: a stable priority queue of currently expanded actions, triggers,
   periodic ticks, expirations and next-ordered-item wakeups.
4. Final timeline: resolved rows/actions and the snapshots needed for calculation.

Compare the heads of timed input and expanded events. Resolve the earliest event;
causal ordering breaks equal-time ties, with Battle End preceding damage. Starting
an ordered item expands only that item and schedules its successor marker at its
resolved cast end. Subaction timing can adjust that marker, not future casts.
Cooldown availability is checked against live state. A cooldown reset wakes a
waiting ordered skill immediately; obsolete retry events must not start it twice.
The readiness check precedes attachment expansion so before-start effects do not
run during a cooldown wait. Once accepted, cast-start modifiers determine the
new cooldown window and cast duration.

## Combat cutoff

With Battle End, exhausted ordered input does not end combat: process remaining
events until Battle End, excluding damage at that timestamp. Without Battle End,
the final ordered item's completion ends combat. Actions and their causal
follow-ups at its cast-end timestamp resolve before the completion marker. A
trailing explicit Delay extends this endpoint. Damage after it is discarded,
including DOTs and feedback loops. No last-damage discovery pass is needed.

## Damage and reuse

The event loop and damage formulas remain separate responsibilities. A resolved
timeline can feed the existing centralized damage/heal pass and be reused only
for variants that cannot change events. Damage/healing feedback must still resolve
before publishing a final baseline; integrating those formulas into event
resolution is an alternative to feedback reconstruction, not permission to ignore
the feedback. Probability trackers remain effect-local, with isolated conditional
branches and the shared expected DOT clock.

Fight-relative anchors affected by prepull timing can require convergence. Auto HP
without a fixed Battle End can require duration discovery. These are explicit
dependencies, not a general preliminary probability pass for every rotation.

## Verification

### Stack-indexed periodic probability storage

Each temporary causal partition has an inactive-probability scalar and, per damage
owner, a stack-indexed collection of sorted `(expiration, probability)` lists.
For a hit, visit stack counts downward. Scale each entry's failure mass in place,
sum its success mass, then insert one destination entry at the refreshed expiration.
Equal expirations merge. Threshold-burst mass is published only after processing
the original application, so it cannot receive that same application again.
Conditional follow-ups transform only their partition; release merges it back.
Exact cadence weights and shared-grid pending-tick weights travel with the mass.

The default storage is an indexed linked list backed by parallel JavaScript numeric
arrays and a recycled-slot free list. Head removal, tail append and equal-tail
merging are O(1); finding an arbitrary insertion/merge position is still O(n).
Tiny-state merging does not use arbitrary insertion: each expiration bucket is
visited twice, once to compute its aggregate and once to retain a survivor and
unlink the other eligible nodes in O(1) each. If significant states lie between
tiny states, move their payloads through the survivor slot during that traversal
to preserve sorted order without reinsertion. Equal mean/significant expirations
combine exactly as before. No temporary grouping maps or node-index sets are built.
Branch release uses a forward-only sorted merge, O(n + m), with O(1) work per
visited node rather than O(n) insertion searches per source entry. Current-expiry
follow-ups use the tail directly. Fixed-duration chronological applications also
append or merge at the tail; the generic variable-duration application path retains
one ordered traversal when its new expiration precedes the tail.
These complexity guarantees apply to the default indexed backend; diagnostic packed
arrays still shift elements for middle edits. Exact-cadence payload maps additionally
require traversal of their cadence entries; shared-grid states have scalar payloads.
Each effect retains one pending expiry wakeup selected from its list heads, not
one wakeup for every future expiration. Due owners use the normal effect-action
executor. A dispatched-time cursor prevents duplicate wakeups while those actions
resolve. Tiny-state merging remains the only additional expiration approximation.

`TimelineBuildInput.expectedPeriodicStorage` accepts `"indexed"` (default) or
`"packed"` for diagnostics. Packed arrays use a head cursor and linear compaction,
with contiguous traversal but potentially shifting middle insertions.
`node script/probe/benchmark-periodic-state-storage.mjs 400` compares both against
committed reference `78537e2` using the same fixture, rotating run order, discarding
six warm-up rounds and reporting medians from six measured rounds. A local run:

| Storage              | Timeline | Total baseline |
| -------------------- | -------: | -------------: |
| Previous state maps  |   135 ms |         151 ms |
| Packed arrays        |    64 ms |          79 ms |
| Indexed linked lists |    63 ms |          80 ms |

All produced 1,342 timeline rows, 1,739 damage entries and 1,280 Piercing entries;
total damage was 56,551.976896 with relative differences below `3e-15` for both
total and Inner Way damage. These are machine-local timings, not latency guarantees.
An earlier paired run measured 164 / 104 / 92 ms total respectively. Both new
backends materially improve on the reference; their relative advantage varies
between runs. Indexed lists remain the default with constant-time unlinking and
slot reuse, while packed arrays remain available for comparison.
`tests/periodic-state-storage.test.ts` compares both backends to the committed tracker
across randomized owners, gains, refreshes, expirations, conditional follow-ups and
exact/shared cadences, and verifies sorted insertion and recycled-slot isolation.

### Tiny expected-state merging

Expected shared-clock DOT trackers merge released states with individual absolute
probability below `1e-5`, equal stack count and damage owner, and expiration times
in the same absolute 0.1-second bucket. A group retains its summed probability,
summed pending-tick probability, and probability-weighted mean expiration rounded
to the existing 0.0001-second clock. A singleton keeps its exact timestamp.
States still in a temporary causal branch, already expired states, significant
states and exact-cadence trackers are not approximated. Simulation is unchanged.

Merging runs after ordinary applications or after conditional burst follow-ups
release their branch. The scheduler updates the effect's earliest-expiration
wakeup to reflect the merged lists. Probability is not
discarded; expiration timing and its interaction with later hits are approximated.
`TimelineBuildInput.expectedPeriodicStateMerging: false` disables this new
approximation for comparisons, without disabling the existing shared DOT grid.

`node script/probe/benchmark-fivefold-state-merging.mjs 400` alternates exact and
merged runs, discards four warm-up pairs, and reports medians of six measured
pairs. Initial results at the former `1e-6` threshold: timeline 255 → 158 ms; total baseline 299 → 181 ms;
rows 2,847 → 1,356; damage entries 3,244 → 1,753; Piercing Damage entries
2,785 → 1,294. Five-stack bursts remain 396 and shared DOT rows remain 59.
Total damage differs by about `1.8e-14` relative and Inner Way damage by
`1.3e-13` relative on this fixture, not a universal error bound.

Raising the threshold to `1e-5` reduces rows to 1,342, damage entries to 1,739,
and Piercing Damage entries to 1,280 (14 fewer than `1e-6`). Five-stack bursts
and DOT rows remain unchanged. Total/Inner Way relative damage differences remain
about `1.8e-14` / `1.3e-13`. One warmed run measured 167 ms timeline and 195 ms
total, versus 306 / 363 ms with merging disabled in that run. Between-run timing
variation does not establish an additional speedup over the former threshold.

### Incremental scheduling

`tests/incremental-timeline.test.ts` checks live cooldown-reset wakeups,
attachment timing, cast/Delay/Battle End cutoffs, lazy expansion, editable
unreached steps, timed-only encounters, and legacy wait migration.
The replay and healing probes give delayed follow-ups an explicit combat window.
Fivefold Bleed's grid and exhaustive branch-history probes continue to verify
probability behavior independently of the event-loop structure.

On the 400-hit Fivefold stress fixture, the warmed timeline-only median over the
last four of six runs changed from about 361 ms to 306 ms on the same machine.
Output remained 2,847 rows, including 59 DOT rows; tick checks fell from 118 to 59.
This is a construction improvement, not a claim that probability processing is
now cheap or that total calculation/UI latency equals timeline runtime.
