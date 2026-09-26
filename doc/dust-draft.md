# Dust implementation gaps

The importable draft is [dust-1-min.json](drafts/dust-1-min.json). The same authored
sequence is bundled as the Dust path default at
[data/rotation/bamboocut-dust/dust-dummy-1-min.json](../data/rotation/bamboocut-dust/dust-dummy-1-min.json)
under the name `Dummy 1 min`. The bundled default uses ordinary `Dodge` and
has dummy attacks disabled. It is a draft, not a validated DPS baseline.

## Phantom Umbrella and Resonance

Phantom Rally is now modelled from the source tiers in the inner-way datamine.

`PhantomUmbrella` is a five-second world object that carries no stat effect, so
it is represented as a duration-only counter. The source keeps **one** phantom
per player: `PhantomUmbrellaSummon` consumes the previous phantom before applying
a new one and then triggers `Resonance`, so phantoms replace rather than
accumulate. The source's 0.01-second removal delay is not reproduced because the
phantom never stacks.

`PhantomUmbrellaThrow` is the summon cadence counter, and the cadence is anchored
per Scarlet Spin cast rather than to whether a phantom happens to be alive. Each
cast primes the counter to two, so the first returning throw reaches the cap of
three and summons, and the counter resets on each summon so the next three throws
are counted again. A 13-throw cast therefore summons on throws 1, 4, 7, 10 and 13.
T6 replaces this cadence: every returning throw summons directly, so the counter is
unused and the first throw does not gain a second summon.

`Resonance` is a **separate attack** owned by the phantom, not extra damage on
Scarlet Spin's own hit. It uses the source 1.08 coefficient scaled by the
resonance half-ratio, giving 0.54 on both the physical and attribute channels,
with a zero flat bonus because source record 20390 carries no level scaling.
Phantom Rally T4's +20% is a separate multiplier on top, so the effective
coefficient is 0.648. T3 applies `PhantomChime` to enemies damaged by Resonance,
which is the tier that was previously unreachable.

A Perfect Catch resonates the existing phantom without replacing it, so its
remaining lifetime carries over. A Perfect Catch with no phantom alive does
nothing. Because each summon lands well under the phantom's five seconds after the
previous one, the phantom stays alive and every catch in a cast resonates.

Dreamwrought Bubbles resonates on return at T6 only. The source `tiers` text
attributes the cadence to Scarlet Spin alone; the reference to Dreamwrought
Bubbles appears only in the per-rank descriptions, which are not authoritative for
tier behaviour.

The T4 pull is not modelled. It is ineffective against bosses, and both practice
dummies count as a boss, so it could never fire here; the engine also has no
pull action.

## Builds

The Dust path ships three builds in
[data/build/bamboocut-dust](../data/build/bamboocut-dust), modelled on the Pure
Stonesplit Strength presets with the attribute attack and attunement swapped to
Bamboocut entries. `defaultBuild` is `dust-fully-relayed-min` and the only
graduate is the non-relayed `dust-full-min`.

- **Attribute attack** is `maxBamboocut`, not `maxStonesplit`. Dust's main
  attribute is Bamboocut, so a Stonesplit affix would contribute nothing. It is
  relay-only on weapons at level 96, so the graduate build spends its two weapon
  slots on `umbrellaDmgBoost`/`ropeDartDmgBoost` and crit/precision instead, and
  places `maxBamboocut` on disc, pendant, and armor.
- **Attunement** is `physicalPenetration` on weapons, disc, and pendant, and
  `everspringMartialBoost` on the four armor pieces. Scarlet Spin carries the
  `MartialArt` tag and supplies most of this rotation's damage, which measured
  roughly 13% ahead of the best Unfettered Rope Dart alternative.
- **Bow ring** is `Precision`. `physicalPenetration` measured about 5% ahead of
  `formlessPenetration`, even though the latter also feeds the attribute channel.

### Weapon set

All three builds use **Starweave** four pieces. It measured roughly 2% ahead of
Etherwrath across all three builds once its four-piece effect was implemented.
Etherwrath cannot reach its instant five stacks here: the rotation uses ordinary
`Dodge` with dummy attacks disabled, so `PerfectDodgeSuccess` never fires and
Etherwrath can only ramp one stack per hit. Starweave needs no attack to hold.

This choice depends on the target-role policy described in
[weapon-set-four-piece.md](weapon-set-four-piece.md). Starweave's gain condition
is `enemyCount >= 2` **or** a boss-or-player target. Because both dummies count as
a boss, that second branch is implicit and the trigger is written
unconditionally, just as `vsBossDmg` is applied without a target check.

### Inner ways, and why the answer is not uniform

Phantom Rally, Towline Sweep, and Morale Chant are fixed across all three builds.
The fourth slot depends on the build, because Starweave's per-stack Martial Art
bonus and Envigorated Warrior's flat damage bonus both resolve through the same
`dmgBonus` term and therefore overlap:

| Build               | Song of Tang | Envigorated Warrior | Winner              |
| ------------------- | ------------ | ------------------- | ------------------- |
| Fully Relayed Min   | 39023.50     | 38877.06 (-0.38%)   | Song of Tang        |
| Fully Relayed Max   | 38390.79     | 37811.96 (-1.51%)   | Song of Tang        |
| Full Min (graduate) | 39758.19     | 40077.55 (+0.80%)   | Envigorated Warrior |

Envigorated Warrior is only worth taking in the non-relayed graduate, so the two
relayed builds keep Song of Tang and `dust-full-min` uses Envigorated Warrior.
Song of Tang's flat contribution is small because its T6 tier is empty and its
Tang Melody effects are crit-based rather than direct multipliers.

## Implemented in the draft

- **Duration-controlled Scarlet Spin:** `ScarletSpin` is a castable parent
  backed by `FlowerBurial`. The step duration controls the ordered hold's
  initial duration and the cap on the internal catch state. The parent triggers
  the four source stages, `20603202`–`20603205`, in the cycle
  `1 → 2 → 3 → 4 → 2 → 3 → 4 → …` until that state expires. The entry and
  catch triggers carry `sourceEffect: "FlowerBurial"` so a delayed catch cannot
  attach to a later Scarlet Spin application.
- **Queued throws:** each stage declares the source Perfect Catch queue-open
  marker separately from its next-start marker. The queue reservation is
  checked while `FlowerBurial` is active, then the throw can execute after the
  previous throw's recovery. Both outgoing and returning damage actions are
  retained. If the final reservation is accepted, the parent's effective cast
  extends beyond the Flower Burial lifetime until that queued throw returns.
- **Source cadence:** with the rank-13 Perfect Catch Enhancement, three
  Perfect Catch events grant Fragrant Song for the next throw. The source
  cadence therefore accelerates Stage 4, not Stage 3. The implementation uses
  the source `1 / 1.3` timing ratio and produces 14 stage starts at zero ping;
  the 14th starts at approximately 12.351 seconds. Positive ping is paid by
  each throw, so the final queue reservation can fall outside the 12-second
  state at higher ping. The parent clears accumulated catch stacks at each
  segment start, so the three Scarlet Spin segments use the same route.
- **Segment boundary:** the final valid Stage 4 starts at approximately 11.582
  seconds at zero ping. Its local hit markers and a queued Stage 2 can resolve
  after the 12-second state expiry; the duration cap governs new queue
  reservations and `FlowerBurial` lifetime, not a hard damage cutoff for an
  already-queued throw. A catch marker after expiry is not allowed to seed the
  next segment.
- **Piercing Dart damage:** source records `20702102`/`20702103`/`20702104`
  are cumulative prefixes of one seven-hit marker series measured from the
  side-button press, and are represented by seven `PiercingDartSweepN` triggered
  damage skills. The rotation's opener uses the first four sweeps; the seven-hit
  release is modelled but no longer cast. Soul Loss is applied on the same marker
  as its hit.
- **Movement and cutoff:** the two 0.3-second delays, 9m movement anchors,
  Soaring Spin 1m anchors, Flute Full's 9m final-hit anchor, the second
  Scarlet Spin's break annotation, and the battle-relative 60-second Battle
  End are authored in the importable draft. The supplied sequence is kept as
  written; if corrected Scarlet Spin timing pushes a later row past Battle End,
  the timing/mechanics are updated later rather than removing or reordering the
  authored step.

## Still missing

- **Dreamwrought Bubbles evidence:** the charge and release split is implemented,
  but the 0.743 s charge is a user-supplied value. The datamine explicitly
  excludes charge timing, so it is an assumption rather than a measurement.
- **Scarlet Spin flight detail:** the source stage hit and next-start markers
  are recorded, but exact projectile flight and alternate animation routing
  are not independently measured. The implementation uses the source
  `1 / 1.3` accelerated-flight ratio and its Stage 4 placement.
- **Draft interpretation:** the middle “break” is now a real Qi event rather than
  a readable-rotation annotation. It anchors to the intended sixth throw of the
  second Scarlet Spin, which is where the target exhausts. The duration-controlled
  Scarlet Spin chain continues after it; it does not switch to a separate authored
  sequence of explicit throws. See [Qi and exhaustion](#qi-and-exhaustion).

Fading Crimson and Tokens of Gratitude are **intentionally ignored** by user
instruction. Do not add resource requirements, costs, refunds, or regeneration.
They are not blockers for this draft. Song of Tang HP drain and Tenacity damage
are also intentionally ignored; Tenacity is an out-of-scope effect rather than a
gap, so it is not tracked as missing work.

Fragrant Song's source text says the next accelerated flight is 30% faster and
that pressing the skill during that flight guarantees a Perfect Catch. The
implementation applies the source `1 / 1.3` timing ratio to that next throw,
keeps the guaranteed-critical, HP-damage, and one-use state rules, and binds
the catch to the originating Flower Burial application.

## Enemy count

The Rotation Editor exposes Enemy Count before Ping, defaulting to 1. Light
Anew applies Candlelight at 3+ enemies (2+ at T4). Song of Tang T4 grants its
extra stack at 2+ enemies. The count is persisted and affects these conditions,
not the total damage multiplier or healing party size.

## Timing values to replace later

Unmeasured damage hits use **0 seconds**, as requested. Unmeasured buff
applications use **cast end**, except user-confirmed applications at 0 and
Soul Loss, which is applied immediately after its corresponding hit.

| Skill                | Temporary values                                                | Existing cast duration                                      |
| -------------------- | --------------------------------------------------------------- | ----------------------------------------------------------- |
| Soul Sweep           | Three damage timestamps at 0                                    | 1.75 s, source interrupt                                    |
| Piercing Dart        | Measured seven-hit marker series; four-hit release truncates it | 1.967 s full, 1.017 s interrupted release                   |
| Burn and Bury        | Finger snap at 0.53 s, inside the 0.65 s cast                   | 0.65 s, source interrupt                                    |
| Scarlet Spin         | Four source stage markers; duration input controls the chain    | User-entered, capped at 12 s                                |
| Dreamwrought Bubbles | Charge and release split into sub-actions                       | 0.743 s charge + 1.2 s release; Delicate removes the charge |

Soul Sweep Cancel at 0 and Piercing Dart Charge at 1.5 s are user-confirmed,
not timing gaps. Both Soul Sweep variants apply Soulbound at 0 before damage
and share a 10-second cooldown.

## Implemented Soul-state rules

- Soulbound has no expiry. Charging preserves it; casting Piercing Dart consumes
  it at 0. Every sweep's Soulbound condition snapshots before consumption.
- Each Soul Sweep hit applies one Soul Loss; cancel applies none.
- The rotation's only Piercing Dart is the four-hit opener, so the seven-hit
  release is modelled but unused here. With Towline Sweep, each hit applies one
  Soul Loss, or two if Soulbound was present at cast start. Each hit adds its
  stacks atomically. Without Towline, Soulbound grants one stack per hit. Towline
  T0’s token grant is ignored.
- Soul Loss lasts 5 s, caps at seven, then is consumed to apply Soulbreak and
  Soul Return. Soulbreak's base duration is 12 s; Towline T1 raises it to 21 s.
- Soulbreak adds 5% damage taken from the applier. Its 5% Qi bonus is not
  simulated because Qi damage is not calculated.
- Soul Return uses the 12-second state; Towline T1 raises it to 21 s. Resource
  effects are omitted under the user's resource instruction.

Evidence: user confirmations plus `local/datamine/buff.json` records 431203
(Soul Loss: 5 s, seven-stack transition), 431204 (Soulbreak: 12 s and 5% damage),
431205 (Soulbound: no expiry), and 431210 (Soul Return: 12 s). Record 431206 is
an 11-second resource-regeneration effect also named Soul Return; it is not
merged into the tracked 12-second state.

## Qi and exhaustion

Qi is authored as absolute-time `Qi` steps on the rotation, not as a property of
the target. Each step sets the ratio and, when it reaches zero, the step also
applies Exhausted. A rotation cannot attach a `Qi` step to a Scarlet Spin throw
beyond the first: an attachment's `trigger` ordinal indexes the anchoring
rotation step's own trigger actions, and throws two onward are raised by the
stage rows. Absolute `startTime` is therefore the only way to reach the sixth
throw, at the cost of silently desyncing if any earlier timing shifts.

The authored ladder is two runs of 59.99% then 39.99%, with the first run ending
in an exhaust. The second run starts where the Exhausted window closes, spaced by
the same offsets as the first, and deliberately stops short of a second exhaust:
mirroring the first run's full span would place that exhaust past `BattleEnd`,
where it could never fire.

Nothing on the Dust path reads `targetQiPercentage`, so the 59.99% and 39.99%
rungs change no Dust damage. The exhaust does: `data/buff/mystic.json` gates
roughly forty-eight effects on Exhausted, and the rotation casts Flute of the
Tides, so the exhaust point moves Mystic damage through the +10% Exhausted debuff.

## Confirmed scope

Burn and Bury includes a 30% general damage bonus, additive with the vs Boss
affix. Light Anew T3 immobilization and lockouts, Candlelight slow, Phantom Rally
pull, and Burn and Bury slow/Breath-hold are intentionally ignored.

Towline T6 refreshes/settles target Soulbreak only at distance <= 15m.
Its self Soul Return refresh and Burn and Bury damage bonus are not range-gated.

Mode-specific exclusions from Soulbreak recorded damage are intentionally ignored.
