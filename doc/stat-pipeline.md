# Stat snapshot pipeline

This is the authoritative stat-stage specification. Timeline scheduling follows
[rotation-event-loop.md](rotation-event-loop.md); damage and healing formulas
follow [damage-formula.md](damage-formula.md).

```text
base inputs / solved override offsets
  -> rawStats
  -> stats
  -> buffedStats
  -> skillStats
  -> actionStats
  -> damage / healing
```

## Stage ownership

1. `rawStats` adds permanent character progression, gear, set stats, arsenal,
   bow/ring, Inner Ways, martial-art flat min/max attribute bonuses, and
   five-attribute conversions through explicit `rawStat` effects. It contains ordinary
   stats, without effective ranges or final outcome rates.
2. `stats` adds the remaining martial-art `stat`/`effectiveStat` bonuses and food.
   This is the second martial-art pass: every talent formula reads the
   same immutable `rawStats`, including talent amounts behind skill or combat
   conditions. Thus all raw flat attribute bonuses are present before scaling,
   but physical-attack talent results and food do not feed other talents.
   Talent and food order cannot change those amounts. Effective
   attack ranges and final rates are fields on this complete object, not a
   separate runtime stat map. This is the character-sheet and worker snapshot.
3. `buffedStats` copies `stats` and adds fixed unconditional contributions from
   the selected global buffs/debuffs. It is the baseline for skill calculations.
   Conditional global rules still require action context and are resolved there.
4. `skillStats` adds stat effects whose conditions depend only on effective
   action tags or equipped martial arts. Cache one immutable snapshot per tag
   signature. Multi-action components can have different signatures.
5. `actionStats` copies the skill baseline and adds the current combat-effect
   contribution. It recalculates effective fields and final rates, then damage
   and healing consume this snapshot through a shared resolution boundary.

The `derivedStats` property retained by compatibility callers aliases the same
complete object as `stats`. It must not become a separately maintained map.
Food's `effectiveStat` contribution is incorporated into the complete snapshot,
so a later skill or temporary-buff pass cannot discard it.

`rawStat` is an unconditional character contribution, not a temporary combat
effect. Inner Way T2/T5 bonuses, arsenal, two-piece weapon/armor sets, bow/ring
sets, progression, gear inputs, and attribute conversions use it. Inner Way
modifiers of temporary buffs (for example Concentration's Direct Affinity)
remain ordinary `stat` effects on those buffs, not permanent raw contributions.
Each effect may contain both `rawStat` and `stat`; each field is applied only in
its own stage. Source selection is explicit: `minBamboocut` includes all raw
bonuses but not Formless Attack, which is folded into effective attack later.

## Combat contributions and expiration

The existing tracked-effect aggregate also carries finite numeric `stat` and
`effectiveStat` contributions, flattened as `stat.<field>`. Update these amounts
when effects are applied, change stacks, are consumed, or expire. Damage and
healing do not re-evaluate each unconditional rule on every action. Conditional,
formula-valued, or content-modified rules retain contextual evaluation.

Global stat contributions already in `buffedStats` are subtracted from the
action aggregate before applying the remainder, preventing double application.
Global damage multipliers retain their normal damage-effect handling.

When a buff expires, its contribution is absent from the next aggregate. Never
subtract a buff from the previous action's capped result: copy `skillStats`, add
the currently active contributions, and derive the result. Equal consecutive
contribution signatures reuse the last resolved snapshot for that baseline.
The cache is bounded to one signature per live baseline using weak keys.

Direct Critical Rate shares an ordinary and final field name. Complete snapshots
therefore retain `uncappedDirectCrit` for subsequent contribution changes, while
the visible/calculated `directCrit` remains capped at 20%. Other effective rates
have separate field names and retain their ordinary inputs naturally.

## Comparison variants and overrides

Comparison variants copy the resolved `stats`, apply the changed contribution
delta, and recompute effective fields and final rates. They do not rerun the
baseline unconditional stat pass. For changes to source attributes or setup
effects, compute old/new raw and talent contribution differences before applying
the delta. Each variant then gets its own global and skill baselines.

Timeline reuse is independent of stat copying: reuse only when timing, triggers,
effects, stacks, cooldowns, and DOTs cannot change. Otherwise rebuild events.

Persisted Main-tab overrides remain final-value overrides. The shared override
solver determines input offsets before producing the sheet. Worker inputs carry
the complete sheet plus raw stats and these base offsets for variant deltas.
Legacy raw-input diagnostic bundles are normalized once at the worker boundary.

## Implementation and verification

- `statEffects.ts`: raw/sheet stages, talent formula binding, derived fields,
  contribution application, and override solving.
- `rotationCalculator.ts`: variant deltas, global baseline, and skill cache.
- `unconditionalDamageEffects.ts`: shared lifecycle contribution aggregate.
- `actionStats.ts`: shared damage/healing action snapshot and cache.
- `script/probe/check-stat-stages.mjs`: observable stage boundaries, food
  retention, raw talent sources, global application, buff expiration, comparisons,
  healing, and uncapped-input preservation.
