# Skill and combat-effect data

This document keeps authoring constraints, source exceptions, and unresolved
mechanics. The JSON is authoritative for implemented skill values, timing,
tier effects, and preset sequences. Do not repeat those records here or append
completed implementation history. Remove WIP notes when resolved; retain a
short explanation only when it prevents a likely misinterpretation.

## Source of truth

| Information                                           | Location                         |
| ----------------------------------------------------- | -------------------------------- |
| Castable, component, and triggered skills             | `data/skill/`                    |
| Periodic damage definitions                           | `data/dot/`                      |
| Player effects and target states                      | `data/buff/`, `data/debuff/`     |
| Cumulative Inner Way tiers                            | `data/innerway/`                 |
| Complete talent selection at each rank                | `data/martial-art/`              |
| Resource defaults, caps, and universal event gains    | `data/system.json`               |
| Preset sequences, attachments, and encounter settings | `data/rotation/`                 |
| Martial-art numeric IDs and persisted weapon IDs      | `data/official/profile-map.json` |
| Solo Level and talent rank selection                  | `data/breakthrough.json`         |

For formulas and runtime implementation, use the existing references:

- [Damage and healing formulas](damage-formula.md).
- [Stat stages and snapshots](stat-pipeline.md).
- [Event ordering, readiness, cutoff, and expected-state scheduling](rotation-event-loop.md).
- [Data registration and worker integration](system-architecture.md#adding-data).
- [Talent exceptions and deferred mechanics](martial-art-talent-audit.md).
- [Attunement scope](attunement-audit.md) and [weapon-set coverage](weapon-set-four-piece.md).
- [Preset DPS review gate](dps-snapshots.md) and [localization](localization.md).

The live `SkillRecord`, `EffectDefinition`, `RotationRecord`, and `RotationStep`
contracts are in [rotationTimeline.ts](../src/calculations/rotationTimeline.ts).
Use them instead of maintaining a second TypeScript schema in this document.

## Datamine interpretation

Local references are under `local/datamine/`: `wwm-skills-normal-all.json`,
`wwm-skills-mystic-skills-offensive.json`, `wwm-inner-way-normal.json`, and
`wwm-martial-arts-normal.json`. Prefer interpreted normal-variant fields;
ignore `versions` subtrees. Do not infer missing timing, route selection,
resource units, or mode-specific behavior from a damage baseline alone.

- Skill `byLevel` arrays use **level minus one**, including leading nulls.
  `aggregated` contains level-independent values. Implemented offensive
  Mystics use level 71; Smolder, Dragon Head - Tide, and Ghostly Step - Umbra
  use `enlightenmentCurves`. Derive physical coefficient, attribute coefficient,
  and flat physical bonus independently. Preserve source precision, retaining
  derived values to 12 decimal places rather than tooltip rounding.
- Runtime Inner Way `bySoloLevel` arrays use **the actual Solo Level**; slot 0
  is unused. Prepend that slot when importing source arrays. Null means no
  bonus, with no interpolation or talent-rank fallback. Resolve through
  `innerWayDefinitionForSoloLevel` without mutating the catalog.
- Find a martial-art source rank by `talents.ranks[].unlockLevel`, not array
  position or world level. Its `talentIds` are a complete selection, not
  additions to prior ranks. Resolve them against `talents.definitions`.
  Runtime `talent[rank]` is likewise a complete independent array; missing or
  empty ranks contribute nothing. Solo Level and talent rank are separate.
- Preserve internal IDs used by saved data. Display names and translations do
  not change identifiers. Renaming persisted fields requires migration.

### Deliberate source exceptions

These are reasons to preserve existing data when refreshing from the datamine,
not a second catalog of current values:

- Smolder's tick factor remains **0.0532**, confirmed by observed damage;
  the exported **0.045** conflicts with that evidence. DOT flat bonuses remain
  inactive under the current damage formula.
- Dragon Head - Tide uses the confirmed pre-multiplier physical/attribute
  coefficient **16.3591422641509** and physical bonus **2483.50943396226**,
  followed by its upgrade/enlightenment factors. Do not replace that baseline
  with a conflicting export without new evidence.
- Panacea's extra **Mystic Precision Enhancement** talent is intentional despite
  its absence from the rank-13 source list; see the talent audit.
- Echoes of Oblivion's Karma reduction is **10 flat Bamboocut Resistance** at
  every tier. The conflicting T6 wording does not turn it into a percentage
  or add a second reduction.
- Vendetta's stated duration increases mean **total durations**, not seconds
  added to the base. Rodent Hunt uses the confirmed **20-second** window despite
  text mentioning 15 seconds. Vendetta Mark means the same caster-specific Vendetta Token
  target debuff, not an additional status. Saved manual Buff events migrate to
  Debuff events, and saved Token overrides retain their values in the Debuff
  category with self-targeted Token actions and conditions retargeted.
- Mortal Rope Dart Tokens of Gratitude are intentionally ignored at the user's
  request. Rodent's Resilience uses the requested **1.5-second hold**, not the
  export's animation interrupt. Do not silently introduce token costs.
- Rodent uses the confirmed **nonmatching PvE route**; matching routes are PvP.
  The raw export-distance to editor-meter mapping is still unverified.
- Attr. Attack DMG Up is already represented by attribute channels and the
  primary-path multiplier. Its empty talent effect must not add that bonus again.

## Authoring rules

Use existing data mechanisms before extending the engine. Prefer explicit tags,
requirements, actions, and definition modifiers over skill-ID conditionals.
Percentages are decimal ratios unless a runtime parameter explicitly uses
percentage points. Keep IDs stable and references resolvable.

### Timing and state

1. Modifiers snapshot when the owning skill/component starts. Use them for
   timing and cast-wide state, not bonuses that must inspect each hit.
2. Actions resolve chronologically. An action snapshots state before its own
   changes, so on-hit applications affect later hits, not the triggering hit.
3. Buff/debuff effects and ordinary requirements inspect action-time state.
   A requirement `{ "resolveAt": "skillStart", "operand": [...] }` instead
   freezes its result at the owning component's start.

Normal action `time` is seconds from cast start. Keep action arrays in
nondecreasing time order; array order resolves ties. Actions may occur after
cast completion. Effect actions may use `time: "expire"`; refresh invalidates
old expiry actions, and consumption does not count as natural expiration.

Cast time excludes ping. `ignorePing: true` suppresses latency for that skill.
Composite parents and components must declare exemptions deliberately to avoid
charging latency twice. Component selection happens before its ping gap;
modifiers and start-bound requirements resolve at the actual delayed start.

### Tags and martial-art context

- `DirectDamage` and `DOT` distinguish direct hits from periodic damage.
- `Triggered` and `SubAction` hide internal skills from the castable selector.
- `MartialArts` is the broad All Martial Arts scope. Singular `MartialArt` is
  a narrower attunement tag; they are not interchangeable.
- `MartialArtEffect` identifies secondary martial-art effects. Such effects can
  also carry `MartialArts`; use the actual intended bonus scopes.
- Use `VariedCombo` consistently. Tags are exact and case-sensitive.
- Every castable `MartialArts` skill declares canonical `martialArt` and physical
  `weapon`. Triggered components omit them to inherit context without switching
  the active weapon. General and Mystic skills do not switch martial arts.

`martialArt` requirements match the canonical martial-art tag on the action.
`equippedMartialArt` checks an ID in either equipped slot. `currentMartialArt`
and `currentWeapon` inspect active timeline state; these are distinct questions.

Attunement `tags` are ANDed; a nested array is an OR group. `excludeTags` rejects
matching actions. Use the shared matcher for damage and healing.

### Requirements and dynamic values

Requirement arrays are AND groups. `operator: "or"` supplies alternatives,
including nested AND arrays. `operator: "not"` takes exactly one operand.
`self` checks buffs or active tier/setup conditions; `target` checks debuffs.
`skillTag` checks the action's tags. Tracked-effect `stack` means at least that
many stacks; `"max"` means its resolved maximum.

Numeric targets include `resource`, `distance`, `enemyCount`, `selfHPPercentage`,
`targetHPPercentage`, and `targetQiPercentage`. Comparisons support `>=`, `>`,
`<=`, `<`, `==`, and `!=`. Use `amount` for a constant or `compareTo` for another
numeric runtime state. HP/Qi percentage parameters use percentage points,
whereas stored HP/Qi ratios use 0–1.

Supported dynamic-value contracts include:

| Function   | Contract                                                                                                                                               |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `segment`  | `param1` is the input, `param2` the ordered thresholds, `param3` the results; results have one more entry than thresholds.                             |
| `switch`   | `param1` selects a key in `param2`; `fallback` covers initial expansion or an unmatched key. Tier/setup conditions can supply boolean keys.            |
| `multiply` | Multiply parameter `param1` by scalar `param2`; numeric strings are accepted.                                                                          |
| `byStack`  | `param1` names the tracked effect, `param2` is the per-stack amount, and `target` defaults to `self`. In a modifier, the value is frozen for the cast. |

`segment.mode` is `LowerBoundInclusive` by default: equality enters the next
interval (`[lower, upper)`). `UpperBoundInclusive` keeps equality in the preceding
interval (`(lower, upper]`). Unknown modes do not resolve. Omitting the mode
preserves version-3 overrides and existing migration behavior. For example:

```json
{ "function": "segment", "param1": "distance", "param2": [2, 3], "param3": [0.02, 0.03, 0.04] }
```

The default selects 0.03 at exactly 2 and 0.04 at exactly 3. Do not change
boundary semantics while simplifying a definition. `actionTime` refers to the
original cast/action time, allowing a segmented modifier to move different hits
by different offsets. Timing resolves as
`max(0, originalTime + sum(castTimeModifier)) × product(castTimeMultiplier)`.
A switched cast time is locked at cast start. Switched action values can also
use `resolveAt: "skillStart"`.

### Actions

| Type                                            | Important semantics                                                                                                                                                                                                                                                     |
| ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `damage`                                        | Independent `phyCoef` and `attrCoef`; omitted coefficients are zero. `attrBonus` applies only to the primary attribute.                                                                                                                                                 |
| `heal`                                          | Uses `phyCoef` and `silkbindCoef`; restores Self HP and reports excess as overhealing. `HOT` identifies healing over time.                                                                                                                                              |
| `apply`                                         | `value` is an effect ID; `target` is `self`, `target`, or `player`. Default stack is one, capped by the definition. Action duration overrides definition duration.                                                                                                      |
| `consume`                                       | Removes one stack by default, or all with `stack: "all"`. `value: { operator: "first", operand: [...] }` selects the first available effect.                                                                                                                            |
| `extend`                                        | Adds `duration` to an existing expiry; missing, expired, or permanent states are unchanged. Use `duration`, not `extension`.                                                                                                                                            |
| `trigger`                                       | Starts another skill at the event time without spending sequential cast time. The triggered skill's cooldown still applies.                                                                                                                                             |
| `clearCD`                                       | Resets the named skill/application cooldown. Optional positive integer `charges` restores only that many spent skill uses; `seconds` instead reduces pending recovery timestamps by that duration, clamped to the current time. Do not combine `seconds` and `charges`. |
| `setResource`, `addResource`, `consumeResource` | Replace, add, or subtract numeric resource `amount`; consumption accepts `"all"`.                                                                                                                                                                                       |
| `setHP`, `takeDamage`                           | Set absolute Self HP or subtract absolute incoming damage.                                                                                                                                                                                                              |
| `setTargetHP`, `setQi`                          | Set target ratios. Qi reaching zero applies Exhausted; its expiry restores Qi through data.                                                                                                                                                                             |
| `emitEvent`                                     | Dispatches a named targeted accumulator check, not a general combat-event broadcast.                                                                                                                                                                                    |
| `replay`                                        | Multiplies recorded final damage by `coef`, bypassing the formula and damage events. Requires a `Replayed` skill.                                                                                                                                                       |
| `resolveRecording`                              | Effect expiry action that settles the matching recording activation.                                                                                                                                                                                                    |

`reapply: false` leaves an active effect untouched. Otherwise applications add
stacks; definition `refresh` decides whether expiry resets. An application
cooldown can reject the attempt. Trigger applications may add conditional
`additionalStack`. `player` applications fill self then teammates up to
`groupSize`, then replace the earliest-expiring recipient copy.

For `consume` with `first`, `resolveAt: "skillStart"` remembers the selected
effect. If it expires before consumption, do not fall through to another one.

### Cooldowns, components, and attack responses

`cooldownGroup` shares readiness across skill definitions; otherwise the skill ID
is the key. `cooldownUses` with default `cooldownRecovery: "window"` grants uses
within one window. `"independent"` gives each spent charge its own recovery.
Shared definitions must agree on capacity and recovery mode. Modifier changes
do not move already-pending recoveries. Explicit casts wait; unavailable triggers
are rejected. Generated waits are output only, not saved rotation steps.

`subAction` is an ordered list of `{ value, requirement?, fallback? }` references.
The parent runs first. Each component spends cast time but retains parent
attribution. Select primary/fallback at dispatch and lock that selection.
Equal-length value/fallback arrays lock the whole sequence from one check.
Conditional candidates must be leaf components; unconditional nesting is allowed.
Reserved action slots keep attachments stable when alternatives differ, and
attachments to unselected actions are skipped.

`silent: true` components have no actions, cooldowns, attack responses, or
skill-start notifications. `waitForRequirement: true` requires a silent,
unconditional prefix; see [readiness after charging](rotation-event-loop.md#readiness-after-charging).

`attackResponse` declares `onSuccess`, optional `endMargin`, `durationFrom`, and
`perAttack`. An incoming hit within the window is avoided and triggers success
at impact, preserving the defensive cast's attribution/context. Default success
is once per cast; `perAttack` permits every positive incoming hit. No incoming
attack means no success reward. `durationFrom` shares a response window without
forcing the same blocking cast duration. Full alignment rules are in the
[event-loop reference](rotation-event-loop.md#incoming-attack-readiness-and-success).

## Effects and Inner Ways

`badgeColor: "red"` selects the red timeline effect badge independently of the
definition's source file. Omit it for the default badge; DOT styling takes precedence.

`duration`, `maxStack`, `cooldown`, and `refresh` control tracked-effect lifetime
and application. `effect` supplies action-time rules. `stackEffects[n - 1]`
replaces `effect` at stack n and must contain the **complete cumulative value**,
not an increment. Provide entries for every reachable stack count.

`global: true` contributes always-active setup rules without a tracked buff.
`shared` identifies party-shared debuffs; `showCoverage` requests coverage output.
Permanent seeded effects are not consumed and merge with later applications.
Canonical conditional rules use `{ requirement: [...], effect: {...} }`.

`{ target: "EffectId", modify: {...} }` modifies a definition. Scalar fields
override; `modify.effect` appends to the existing effect array. Requirements gate
the modification. Setup `buffDurationBonus` scales resolved self/player buff
duration and uses the applying skill's context, including indirect applications.

Inner Way tier selection is cumulative from T0 through the selected tier.
Entries contain `effect`, reactive `trigger`, or final-damage `listen` rules.
Damage triggers run in tier order, so a later rule may observe a stack applied
by an earlier rule on the same hit. `tags` control path eligibility; unassigned
Inner Ways remain usable in Mixed.

Every Inner Way and set declares `altersTimeline`. Keep it true whenever timing,
triggers, resources, stacks, effects, healing, cooldowns, or DOTs can change.
Only event-invariant damage/stat changes may reuse a baseline timeline. Script
and other setup comparisons must follow the same rule.

### Stat effects

Use `rawStat` for permanent progression/gear/Inner Way bonuses and flat talent
attribute attack, before talent scaling. Temporary conditional buffs stay in
their ordinary stat stage. `stat` changes ordinary stats; `effectiveStat` changes
derived contributions. Do not duplicate calculations in UI components.

Talent formulas read immutable raw stats, including flat attribute talents but
excluding later talent/food bonuses. Use raw source names for these conversions.
A formula source may be a stat name or `{ "max": ["body", "power"] }` to select the higher source value from the same stat snapshot. All named sources must be finite numbers. Formula values compute `source × multiplier + offset`, with optional `min`,
`max`, and explicitly justified `round`. See the [stat pipeline](stat-pipeline.md)
for effective-source resolution and final-value overrides.

Damage categories such as `dmgBonus`, `baseDMGBonus`, `globalDmgBonus`,
`dotDamage`, and per-channel bonuses are not interchangeable; use
[damage-formula.md](damage-formula.md) for their order and scope.

### Triggers, accumulators, and recording

Ordinary Inner Way triggers default to `damage`; supported event-specific setup
rules include `heal`, `takeDamage`, `skillStart`, and `attackResponse`.
Skill-start triggers run after cast acceptance but before timed actions, including
empty and triggered skills, excluding silent components and periodic rows.
Use `attackResponse` for successful defense rewards, not attempted cast start.

A trigger's `cooldown` is independent of the cooldown of its actions.
`hitWindow: { count, seconds }` counts eligible damage timestamps, includes the
lower time boundary, and keeps receiving hits during cooldown. Expected rows
carrying `hitProbability` do not count, even at probability one; sampled actual
hits do. Heal and non-damage actions never count.

`damageOutcome` rules run after the resolved outcome and affect later hits.
They can use a decaying outcome resource with `gain`, `decayRate`, `threshold`,
and required `resetTo: 0`. Expected and sampled tracking are separate; do not
replace correlated states with average stacks. Specialized random-outcome and
accumulator contracts are documented in [system architecture](system-architecture.md).

Buff accumulators can listen for damage or overheal, perform named checks,
limit successful triggers, and snapshot attack-based thresholds on application.
Each recipient's overhealing contributes separately. A finite listener budget
stops new triggers without ending the buff; refresh/reset semantics belong in
the definition. `group: true` heals use party recipients, not enemy count.

A final-damage listener supplies `parameter: { damage: "event.damage" }` to a
`Replayed` skill. Requirements use that hit's tags/state; the listener cooldown
starts only after it successfully spawns the skill.

A timed effect can instead declare `recording: { event: "damage", requirement?,
action: { type: "trigger", value: "ReplaySkillId" } }` and an expiry
`resolveRecording` action. Expiry or reapplication closes the old window before
spawning its replay. Hits exactly at expiry are excluded; empty windows produce
nothing. Replay coefficients apply to final source damage and cannot recurse.
Recording windows are not extended with ordinary `extend` actions.

`damageGroup: { id, name }` assigns Inner Way damage to a runtime breakdown
owner instead of an explicit cast. `collectBoostDamage` names the enabling
buff for counterfactual attribution; delayed applications use
`boostDamageSource` to retain that cast's ownership. Neither changes persisted
rotation steps or the damage formula.

### Periodic and chance-applied effects

`periodic` separates cadence from lifetime. `interval` must be positive;
`firstTick` defaults to it and may be zero. `resetOnRefresh: false` preserves
cadence; true restarts it. `tickOnExpire: false` excludes the exact expiry tick;
the default endpoint is inclusive. No duration means ticking until removal or
combat cutoff. Resource `amountPerTick` adds to `amount` by zero-based tick index.

Consuming/removing the last stack cancels future periodic actions. A DOT deals
one copy per active tick, independent of stack count, and ignores flat bonuses.
Use ordinary expiry actions for delayed non-DOT attacks. Future ticks inherit
the cast that refreshes or extends the effect.

`onMaxStack: { consume: "all", trigger: "SkillId", triggerTags?: [...] }`
consumes the effect and cancels pending ticks before spawning the threshold
skill. Overflow produces one burst; later actions cannot see the threshold
stack. `triggerTags` affect only that spawned instance.

Action `chance` accepts a number or supported dynamic value; finite results are
clamped to 0–1, invalid results rejected. The supported expected periodic case
is a refreshing target DOT applied by non-DOT damage with preserved cadence;
expected threshold payloads are damage-only triggered skills without cooldowns.
Keep this support boundary when extending data.

`expectedTickAlignment: "battle"` deliberately approximates expected DOT timing
on shared battle-clock boundaries, with no partial ticks; an application waits
for the next strictly later boundary. Simulation retains concrete cadence and
ignores expected-state merging. Runtime `damageScale` and `hitProbability` are
not authored fields. See the [event-loop reference](rotation-event-loop.md)
for probability storage, correlation, and cutoff behavior.

## Resources and rotation records

Resources default to zero unless initialized. Actions clamp to the named maximum
when supplied; Vitality may go negative to expose deficits. Regeneration starts
at battle start, not prepull. `infiniteResources` skips gains, costs, and regen
for those resources. Universal gains belong in `system.json.resourceEvents`.
Apply direct Mystic costs once; triggered follow-ups must not pay them again.

Skill steps and explicit Delays are sequential. Attached events are stored
immediately before their anchor and reference zero-based action indexes or
`"start"`; optional `trigger` selects the declared trigger-action ordinal.
A Martial Art event is start-only. Timed encounter events consume no cast time;
`eventTimeReference: "battleStart"` makes their times fight-relative.
`editableCastTime` permits a step duration override before timing modifiers.

`start: { step, action? }` chooses battle start; omitted action means cast start.
Preserve attachment indexes and fight-start anchors when editing/migrating data.
Generated waits and periodic rows are never authored rotation steps.

Without Battle End, the final ordered item determines cutoff, including its
same-time causal follow-ups. A trailing explicit Delay extends combat. With
Battle End, damage at its timestamp is excluded. Generated effects never extend
combat on their own; see [combat cutoff](rotation-event-loop.md#combat-cutoff).

Self HP events store absolute HP; the UI percentage is only an input boundary.
Take Damage is an independent timed event. Target HP is depleted only when the
rotation supplies maximum `targetHP`; otherwise it stays at the implicit state
unless explicitly set. Qi depletion is authored rather than calculated.
Move events use nonnegative whole-meter distances, including zero meters. Initial distance is one meter.

Preset `martialArts` controls eligibility. Presets remain immutable; editor
changes and imports produce custom records. Skill overrides replace records in
the worker's resolved maps and must participate in calculation fingerprints.
Use existing import/migration code rather than restating export schemas here.

## WIP and evidence gaps

An empty record is preferable to invented mechanics. Treat tests using synthetic
hits as verification of rules, not evidence that a real skill's timing is known.
The talent and weapon-set audits hold their detailed deferred cases; the list
below keeps cross-cutting blockers and outstanding skill evidence.

### Model limitations

- Qi damage bonuses are data-only. Endurance percentage/loss is not simulated,
  leaving dependent talent conditions and Battle Anthem T6 inactive.
- Damage-based HP drain/leech remains unmodeled, including Insightful Strike
  and Wind attacks. Song of Tang HP drain is intentionally ignored by user instruction.
- Blade Momentum and Battle Will retain confirmed starting values but no
  generation, spending, or caps. Do not treat their current fixed state as a
  completed resource model.
- Enemy-healing reduction, movement slow, control immunity,
  breath-hold, and some talent-specific dodge-window changes remain unsupported.
  Existing incoming-attack response windows do not resolve all those mechanics.
- Draught Inner Ways currently provide stat tiers only; other mechanics await
  combat-skill and state wiring. See their JSON and the talent audit.

### Timing and source validation

- Non-Gauntlet General Deflect timings retain the shared placeholder until
  weapon-specific measurements are available.
- Might still has provisional cast-end multi-hit timings outside its measured
  routes. Its available path status is not proof that every timing is verified.
- Addled Mind's supplied outside-PvP Level 100 timing is unverified in play.
  Its uniform Flamelash shift places the third hit at 0.328 seconds versus
  0.329 in the supplied active table; do not silently mix timing models.
- Bursting Nine's Single-Target versus Area classification remains unconfirmed.
- Coiled Dragon still needs skill/application wiring; existing Bone Corrosion
  Qi bonuses do not affect calculated HP damage.
- Rodent's raw-distance unit mapping needs verification. Preserve the confirmed
  PvE route while investigating it.

### Wind dummy rotation behavior

Blade of Heaven's Wrath must start while Flamelash is active. The user confirmed
that Flamelash may expire during an already-started cast; its remaining hits
continue with the actual buff state. Do not restore Flamelash or extend its
duration to cover those hits. A new Blade of Heaven's Wrath cast starting
without Flamelash remains an invalid state to investigate.

### Bamboocut Dust WIP definitions

Dust implements only the skills required by its authored draft rotation.
See [Dust draft and timing refill register](dust-draft.md) for source IDs,
per-skill timing fallbacks, rotation interpretation, and remaining mechanics.
The user explicitly authorized unresolved hit timestamps at zero and unresolved
buff application timestamps at cast end; these are not measured hit schedules.

Phantom Rally summons/resonance and Piercing Dart damage mapping remain unresolved.
Charged Combo reduces Soul Sweep remaining cooldown by 0.5 seconds per Piercing Dart damage hit,
with a shared 0.5-second trigger cooldown. It awaits the missing damage events;
simultaneous placeholder hits can trigger only once. Soul-state stacking, conversion, lifetimes,
and cast-start consumption are implemented. Fading Crimson and Tokens of
Gratitude are intentionally ignored by user instruction. Individual
Piercing Dart sweeps must carry only their corresponding `PiercingDartSweepN`
tag. Mode-specific exclusions from Soulbreak recorded damage are intentionally ignored by user instruction. Fragrant Song's 30% faster flight and accelerated-flight
guaranteed-catch behavior are intentionally ignored by user instruction;
its damage bonus, guaranteed crit, and one-use consumption remain implemented.

Rotation `enemyCount` is a positive whole number, defaulting to one. It models
the number of enemies hit for Light Anew and Song of Tang; it does not multiply
damage or replace healing-recipient `groupSize`. Light Anew applies Candlelight
on damage at three or more enemies, reduced to two at T4. Song of Tang T4
grants one extra Tang Melody stack per eligible Martial Arts hit at two or
more enemies, through the existing half-second application cooldown. Song of
Tang HP drain is intentionally ignored.
The draft has no accepted DPS snapshot and must not be treated as a validated
build or rotation recommendation.

Burn and Bury includes `dmgBonus: 0.3`, additive in the same category as vs Boss.
Light Anew T3 immobilization/lockouts, Candlelight slow, Phantom Rally pull,
and Burn and Bury slow/Breath-hold are intentionally ignored by user instruction.

Towline T6 refreshes/settles target Soulbreak only at distance <= 15m.
Its self Soul Return refresh and Burn and Bury damage bonus are not range-gated.
