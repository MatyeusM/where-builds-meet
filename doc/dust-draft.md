# Dust implementation gaps

The importable rotation is [dust-1-min.json](drafts/dust-1-min.json).
It is a draft, not a bundled preset or accepted DPS baseline.

## Still missing

- **Piercing Dart damage:** map source records 20702102/20702103/20702104 to
  seven sweeps, add their damage actions and individual `PiercingDartSweepN`
  tags, and determine cast duration. Its four-hit and seven-hit Soul Loss applications are
  implemented independently of the unresolved damage mapping.
- **Scarlet Spin:** choose the correct animation routes and resolve projectile
  flight. Explicit perfect-catch and ending variants currently encode the
  authored sequence.
- **Dreamwrought Bubbles:** charge/cast duration and projectile timing.
- **Phantom Rally:** summons, umbrella counts/lifetimes, and resonance scheduling.
- **Charged Combo Enhancement:** the 0.5-second cooldown reduction with a 0.5-second trigger cooldown is implemented; activation awaits Piercing Dart damage events. Simultaneous zero-time hits allow only one reduction.
- **Other effects:** Tenacity damage.
- **Draft interpretation:** the middle “break” remains an annotation, not a Qi
  event; the six subsequent throws are currently authored as perfect catches.

Fading Crimson and Tokens of Gratitude are **intentionally ignored** by user
instruction. Do not add resource requirements, costs, refunds, or regeneration.
They are not blockers for this draft. Song of Tang HP drain is also intentionally
ignored.

Fragrant Song's 30% faster flight and accelerated-flight guaranteed-catch
behavior are also intentionally ignored by user instruction. Its guaranteed
critical hit, 20% PvE HP-damage bonus, and one-use consumption remain implemented.

## Enemy count

The Rotation Editor exposes Enemy Count before Ping, defaulting to 1. Light
Anew applies Candlelight at 3+ enemies (2+ at T4). Song of Tang T4 grants its
extra stack at 2+ enemies. The count is persisted and affects these conditions,
not the total damage multiplier or healing party size.

## Timing values to replace later

All unmeasured damage hits use **0 seconds**, as requested. Unmeasured buff
applications use **cast end**, except user-confirmed applications at 0 and
Soul Loss, which is applied immediately after its corresponding hit.

| Skill                 | Temporary values                                               | Existing cast duration                                                  |
| --------------------- | -------------------------------------------------------------- | ----------------------------------------------------------------------- |
| Soul Sweep            | Three damage timestamps at 0                                   | 1.75 s, source interrupt                                                |
| Piercing Dart         | Seven sweep/application timestamps at 0; damage mapping absent | 0, unresolved                                                           |
| Burn and Bury         | Finger snap at 0                                               | 0.65 s, source interrupt                                                |
| Scarlet Spin variants | Outbound/return hits at 0; catch event at cast end             | 1.48 s, source 20603202 interrupt; alternate route selection unresolved |
| Dreamwrought Bubbles  | Both hits, cast/charge, and phantom application at 0           | 0, unresolved                                                           |

Soul Sweep Cancel at 0 and Piercing Dart Charge at 1.5 s are user-confirmed,
not timing gaps. Both Soul Sweep variants apply Soulbound at 0 before damage
and share a 10-second cooldown.

## Implemented Soul-state rules

- Soulbound has no expiry. Charging preserves it; casting Piercing Dart consumes
  it at 0. Every sweep's Soulbound condition snapshots before consumption.
- Each Soul Sweep hit applies one Soul Loss; cancel applies none.
- The opening Piercing Dart uses four hits; the final release retains seven.
  With Towline Sweep, each hit applies one Soul Loss, or two if Soulbound was
  present at cast start. Each hit adds its stacks atomically. Without Towline,
  Soulbound grants one stack per hit. Towline T0’s token grant is ignored.
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

## Confirmed scope

Burn and Bury includes a 30% general damage bonus, additive with the vs Boss affix.
Light Anew T3 immobilization and lockouts, Candlelight slow, Phantom Rally pull,
and Burn and Bury slow/Breath-hold are intentionally ignored.

Towline T6 refreshes/settles target Soulbreak only at distance <= 15m.
Its self Soul Return refresh and Burn and Bury damage bonus are not range-gated.

Mode-specific exclusions from Soulbreak recorded damage are intentionally ignored.
