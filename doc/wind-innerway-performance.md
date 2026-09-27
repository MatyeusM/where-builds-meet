# Wind Inner Way swap performance audit

Date: 2026-09-27. Calculator revision: `f0f40a7` before this audit.

The original measurements below precede the internal-buff counter change.
The implementation follow-up at the end corrects the original attribution of
the comparison rebuilds to Rodent counters alone.

## Reproduction and scope

Run `node script/probe/benchmark-wind-innerways.mjs` from the repository root.
The benchmark uses the production preset bundle factory, the Fully Relayed Min
Wind build, Dummy 1 Min Infinite Vitality rotation, breakthrough 17, 40 ms ping,
Simmering Fish Slices, Fire Divinecraft and no Script. It replaces only T6
Morale Chant with T6 Fivefold Bleed in the process-local preset object and
rebuilds the complete character sheet. Canonical JSON is unchanged.

The stat and attunement groups use the same eligibility, maximum-roll and base
stat inputs as RotationEditorTab. There are 26 stat variants and seven attunement
variants. Comparisons receive the uncompressed baseline, as on a warm worker
cache hit. Two alternating warm-up pairs are discarded before six measured
pairs; output includes individual timings, medians, row counts and DPS.

These are local Node 24.14.0/Vite SSR timings with the phase collector inactive,
not end-to-end browser latency or a production-bundle benchmark. Setup/set/Inner
Way comparisons, graduation calculations, inactive rotations, worker transport
and rendering are excluded. Therefore the measured comparison groups explain
only part of the full refresh. The user's exact saved build was not available.

## Findings

The final six-sample medians are:

| Work                     | Morale Chant | Fivefold Bleed |
| ------------------------ | -----------: | -------------: |
| Baseline                 |     62.11 ms |      235.03 ms |
| Publication compaction   |      0.69 ms |       30.06 ms |
| 26 stat comparisons      |  1,075.95 ms |    4,434.12 ms |
| 7 attunement comparisons |    289.33 ms |    1,156.55 ms |

The two comparison categories total 1.37 seconds versus 5.59 seconds, about
4.1 times as long with Fivefold, before the other categories finish.

Baseline output grows from 746 to 2,086 timeline rows. Publication compaction
costs about 30 ms for Fivefold and removes only three rows (2,083 remain), versus
less than 1 ms for Morale. Both have stable DPS across repeated runs:
67,544.2331265345 for Morale and 67,003.14845386177 for Fivefold. These are fixture
results, not advice about the user's own build.

A diagnostic run instrumenting ExpectedPeriodicTracker.apply observed a maximum
of 244 live states and 2,167 applications for Fivefold. The initial phase trace
reported 3,421 action-resolution calls and 3,480 damage-formula calls versus
1,253 and 906 with Morale. Formula calls also include attribution calculations;
these counts must not be interpreted as repeated combat traversals. A warmed
CPU sample likewise identifies damage calculation, combat traversal and generated
event handling as substantial costs. It does not establish a probability-state
explosion.

## Comparison with the design

- The battle-aligned DOT clock, indexed probability lists, tiny-state merging,
  and causal branch isolation remain enabled. No evidence of a fallback to
  individual exact tick cadences was found.
- Baselines use one live traversal. The existing single-pass, Wind and Fivefold
  tests pass (seven files, 13 cases).
- Worker baseline caching is present. Comparison requests do not resend the
  baseline when the worker already knows its cache key. Published compaction is
  separate from the full baseline retained in that cache.
- The practical mismatch is the broad statement that pure stat and attunement
  comparisons reuse a timeline. `calculateRotationComparisons` requires live
  resolution whenever the baseline contains an accumulator application, among
  other feedback conditions. Wind applies Rodent Rampage/Enhanced Rodent Rampage,
  which use accumulators, so even the seven attunement variants rebuild combat.
  Subsequent inspection also found Rodent Hunt recording/replays and World to
  Sword applications in this fixture. Each independently keeps the live guard
  active, so removing the Rodent counter blocker alone cannot enable reuse for
  the full preset. The guard has existed since September 16; this audit does not establish a new
  regression. Fivefold magnifies the cost of that existing conservative choice.
- Any supplied `setupEffects` also forces live resolution, even when the caller
  supplies no replacement timeline. The current fast-path description is thus
  more permissive than the actual implementation. The guard protects feedback
  correctness; simply deleting it is not a safe optimization.
- All comparison categories and their individual variants run sequentially.
  The baseline is published first, but the full refresh waits for much more than
  the displayed build's single DPS calculation.

## Improvements, in priority order

1. **Distinguish event-count feedback from damage-value feedback.** Audit whether
   an attunement-only variant can reuse Wind's event sequence when its accumulator
   depends on action tags/counts, not damage amount. Preserve rebuilds for damage
   recording, target HP, healing, conditional outcome/resource effects and compacted
   fallback baselines. Differential tests must compare complete live and reused
   results before relaxing the guard. This targets repeated combat work without
   changing Fivefold probability accuracy. No speedup is claimed until measured.
2. **Reduce repeated per-hit preparation.** The damage formula still iterates
   every attunement entry and checks its tags on each hit, including zero-valued
   entries. Prepare matching contributions per immutable attunement/tag context,
   and profile the remaining effect-field scan. Preserve summation order and
   invalidate on variant/overridden input changes. Validate against exact DPS
   snapshots and direct formula tests.
3. **Prioritize requested comparison panels.** The current eager sequential
   refresh is consistent with the documented UI design, but demand-driven or
   deferred categories could improve perceived responsiveness. This changes
   refresh behavior and should be an explicit product decision.
4. **Review publication compaction separately.** About 30 ms buys only three
   merged rows here because full contexts are serialized to identify duplicates.
   A cheaper eligibility/key path may help, but it is much smaller than the
   multi-second comparison cost and must preserve attribution/outcome equality.

Do not raise the probability-merging threshold, discard rare bursts or reuse
merged publication rows as combat inputs merely to improve this benchmark.
Those changes alter numerical behavior or causal semantics. No production
calculation changes or snapshot updates were made by this audit.

## Internal-buff counter implementation follow-up

Rodent Rampage and Enhanced Rodent Rampage now count coordinated attacks with
separate hidden buffs, using `onMaxStack` like Dust's summon cadence. Active
buff triggers reuse the setup-trigger action handler. The shared
`oncePerSkill` filter accepts the first damage action of each stage and rejects
probability-weighted expected rows. `additionalStack` supplies the second count
for Infernal/Mortal attacks. Each counter declares its `parentEffect` so refresh
preserves progress and updates expiry/attribution, while removal or replacement
clears the count. Other accumulator behavior and the comparison guard are
unchanged.

Differential tests use a coordinated-Rodent rotation without recording or
healing. Both Morale Chant and Fivefold Bleed variants reuse the timeline, and
all eligible attunement comparisons match forced live resolution. The full
dummy preset still takes the live path because of Rodent Hunt and World to
Sword; this change alone does not resolve its multi-second comparison cost.

A same-process before/after benchmark replaced only the Wind buff definitions
with their pre-change versions for the control cases. Each case discarded two
warm-ups and measured six samples, alternating forward/reverse order. Full-preset
medians (milliseconds) were:

| Work                     | Morale before | Morale after | Fivefold before | Fivefold after |
| ------------------------ | ------------: | -----------: | --------------: | -------------: |
| Baseline                 |        100.15 |       102.65 |          406.65 |         404.63 |
| 26 stat comparisons      |      1,818.43 |     1,930.75 |        7,341.00 |       7,523.15 |
| 7 attunement comparisons |        505.88 |       509.18 |        1,941.74 |       2,005.42 |

There is no measured full-preset speedup; combined comparison time was about
3–5% higher in this run. Baseline DPS and timeline row counts were unchanged.

An isolated rotation (Rampage, ten Infernal Light 3 casts, three-second delay,
40 ms ping) removes recording/healing casts while retaining the same build and
comparison groups. Its medians were:

| Work                     | Morale before | Morale after | Fivefold before | Fivefold after |
| ------------------------ | ------------: | -----------: | --------------: | -------------: |
| 26 stat comparisons      |         78.54 |        39.99 |          177.70 |          71.95 |
| 7 attunement comparisons |         18.06 |         7.27 |           45.69 |          16.40 |

This demonstrates the reuse benefit where Rodent was the only blocker. It does
not represent the full preset or browser latency. Differential tests additionally
cover attack, crit, and affinity stat variants; the accepted DPS snapshot guard
passes without refreshing any snapshot.
