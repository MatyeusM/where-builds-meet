# Skill and combat-effect data

Combat data is split by responsibility:

- `data/skill/`: castable and triggered skills
- `data/dot/`: damage-over-time definitions; Inner Way DOTs such as Weeping Blood belong in `data/dot/innerway.json`.
- `data/buff/`: player effects
- `data/debuff/`: target effects and manual encounter states
- `data/innerway/`: cumulative tier effects, triggers, and modifications
- `data/martial-art/`: weapon talent arrays indexed by talent rank
- `data/rotation/`: default rotation records
- `data/divinecraft.json`: selectable Divinecraft setup effects and availability
- `data/script.json`: selectable Script effects, threshold requirements, and timeline triggers

Maps use stable internal IDs as keys. References such as `trigger.value`,
`apply.value`, and `modify.target` must use those IDs. User-facing text belongs
in `name` and `description`.

## Mystic attack coefficients at level 71

Implemented Mystic attacks use level 71 from
`local/datamine/wwm-skills-mystic-skills-offensive.json`. Read the normal,
layer-zero `curves` entry, or `enlightenmentCurves` for Smolder, Dragon Head -
Tide, and Ghostly Step - Umbra. `byLevel` arrays are indexed by level minus one,
including enlightenment arrays with null entries before level 51; `aggregated`
contains level-independent values. Normal and grey curves agree for these attacks.

Multiply `SKILL_POWER_W_ATK`, `SKILL_POWER_PRO_ATK`, and `SKILL_ADD_W_ATK`
independently to obtain `phyCoef`, `attrCoef`, and `phyBonus`. Keep derived
values to 12 decimal places; do not round them to tooltip precision. Attribute
flat bonuses remain zero. Level-51 damage increases are already in the curves.

| Mystic / source skill ID       | Per-action baseline multipliers                                                                 |
| ------------------------------ | ----------------------------------------------------------------------------------------------- |
| Soaring Spin / 2300058         | 0.45, 0.55                                                                                      |
| Leaping Toad / 2300053         | Flip 0.04; lunge 0.24; both venom explosions 0.12                                               |
| Drunken Poet / 2300045         | First four strikes 0.105 each; fifth 0.175; Combustion explosion 0.072; Smolder explosion 0.165 |
| Dragon's Breath / 2300032      | Each breath 0.245; additional second-hit damage 0.27; each burn tick 0.0532                     |
| Flute of the Tides / 2300075   | Existing early hit and following ripples 0.1125 × 2; main impact 0.3 × 2                        |
| Dragon Head - Tide / 2300064   | Enlightenment baseline × 1.1 × 0.7                                                              |
| Ghostly Step - Umbra / 2300065 | 1, for every implemented weapon's afterimage                                                    |
| Bursting Nine / 2300081        | First volley 1, 0.3, then seven × 0.1; second volley halves each corresponding value            |
| World to Sword / 2300082       | Qi Blade 1 × 2                                                                                  |
| Serene Breeze / 20000104       | 1                                                                                               |

Flute and Qi Blade include their non-player-target doubling. Flute's existing
early hit is retained; the coefficient update does not establish its timing or
add attacks. Smolder uses the enlightenment baseline for both direct hits and
ticks. Its tick multiplier deliberately remains 0.0532: the user observed
27.87% + 42 per tick, matching the derived 0.278739392453 + 42.497766037723.
The datamine behavior's 0.045 multiplier conflicts with this observation and
must not replace the confirmed value without new evidence. The existing DOT
damage formula ignores authored flat bonuses, so updating the burn bonus data
does not make it contribute to simulated ticks.

Tide's user-confirmed pre-multiplier baseline is 16.3591422641509 physical and
attribute coefficient plus 2483.50943396226 flat physical bonus. Its 1.1 upgrade
and 0.7 enlightenment reduction yield 12.596539543396 and 1912.30226415094.
Surging Waves, missing-HP bonuses, and Exhausted-target doubling remain separate
effects. The level-71 coefficient update preserves all existing cast, hit,
cancel, trigger, and periodic timings.

Ghostly Step - Umbra includes a Dual Blades afterimage
(`GhostlyStepsUmbraDodgeDualBlades`). The shared `2300065` enlightenment
specifies an explosion 0.8 seconds after a successful dodge, with the same
level-71 baseline as the other weapon entries: physical and attribute coefficient
2.041567357513, physical bonus 312, and no attribute bonus. The existing
weapon dispatch selects `DualBlades`; the proc retains the dodge's weapon and
row attribution when another cast switches weapons before the incoming attack.

### Mystic cast timing with separate ping

Cast duration excludes input latency. Dragon Head - Tide uses its 5.8-second
interrupt, single-volley Bursting Nine uses 1.4 seconds, and full Flute of the
Tides uses 3.3 seconds. Their existing hit times remain independent; Turnaround
is applied at the revised cast completion.

Soaring Spin uses the datamined hit times 0.7946970054545454 and 2.02492899
seconds, replacing the older observed 1.26 / 2.05 timings. The one-hit variant
ends at its 1.1818181818181817-second interrupt. The two-hit variant ends when
its second hit lands at 2.02492899 seconds, after that interrupt.

Dragon's Breath and Smolder cancel variants finish at their selected hit.
The normal and Intoxicated routes use these times from
`local/datamine/wwm-skills-mystic-skills-offensive.json`:

| Route       | First hit / one-hit cast | Second hit / two-hit cast |
| ----------- | -----------------------: | ------------------------: |
| Normal      |               1.27292535 |                2.72768958 |
| Intoxicated |       0.6064791536363635 |        1.6975969436363636 |

The data preserves full source precision. Damage, burn application/extension,
and cast-end Turnaround move together. The existing segmented timing modifier
maps each normal hit to its Intoxicated counterpart; ping is added separately
once per cast. A cast that begins sober does not speed itself up when its
start action applies Intoxicated.

## Datamined martial-art identity and progression

`local/datamine/wwm-martial-arts-normal.json` is the processed local reference.
Use `martialArts[].id` and `name` for identity. The complete numeric-ID to name
and internal `WeaponId` mapping for its 20 martial arts lives in
`data/official/profile-map.json` under `martialArts`. This includes Riven
Twinblades (`20503`) and Skystrike Gauntlets (`20902`).
The existing internal IDs remain authoritative for saved builds and rotations.

Breakthroughs 16 and 17 declare `martialArtTalentRank: 13` in
`data/breakthrough.json`. Find a source rank by its `talents.ranks[].unlockLevel`,
not by array position or `requiredWorldLevel`. Its ordered `talentIds` are the
complete active selection at that rank, not cumulative additions to earlier
ranks. Resolve each ID against that martial art's `talents.definitions[].id`.
Talent IDs can change between ranks, and a later rank can add talents.

Only interpreted source fields are relevant; ignore every `versions` subtree.
Runtime `talent` is a two-dimensional array: `talent[rank]` contains that rank's
complete ordered talent objects, each with `name` and its existing `effect` array.
Ranks 0 through 12 are explicit empty arrays. Rank 13 contains all five source
talents for every martial art, using interpreted conversion rates and bonuses.
Talent objects have no IDs. Empty effect arrays represent either behavior already
implemented elsewhere or deferred behavior, as distinguished in the
[rank-13 audit report](martial-art-talent-audit.md).

Panacea Fan additionally retains `Mystic Precision Enhancement` as a sixth
rank-13 entry. The user confirmed this existing game behavior despite its absence
from the datamined talent list. With Soulshade Umbrella equipped, Mystic actions
convert all Abrasion probability to Normal probability using the existing
`convert` effect. Preserve this intentional exception during future data audits.

`martialArtEffectsForRank` in `src/data/martialArtTalents.ts` selects the array
using the selected breakthrough's `martialArtTalentRank`, deduplicates equipped
martial arts, and marks the resulting effects with `statStage: "talent"` for the
shared stat and worker timeline pipelines. Each rank is independent: empty or
missing ranks contribute no effects and never fall back to another rank. To add
a future rank, populate its array slot and assign that rank to a breakthrough.
No runtime talent-ID lookup is needed. These definitions are bundled data, not
stored user data; saved build and rotation IDs remain unchanged.

## Separation of behavior

The model separates three moments:

1. A skill's `modifier` is checked when its cast starts. It can change cast and
   action timing or provide a cast-wide effect.
2. A skill's ordered `action` list creates events on the global timeline.
3. Buff, debuff, setup, and Inner Way effects are resolved from the state that
   exists when each action occurs.

On-hit bonuses belong in effect rules rather than skill modifiers. For example,
Frost-Clad Night T4 checks Inner Passion or the T6 Exhausted condition against
Snowbreak Spring's state at each damage action, not at cast start.

An action that applies or consumes an effect changes later timeline state. The
state snapshot used by that action is captured before the action is executed, so
an on-damage trigger does not retroactively affect the hit that caused it.

## Skill definition

```ts
type SkillMap = Record<string, SkillDefinition>;

type SkillDefinition = {
  name: string;
  shortName?: string;
  skillBreakdownCategory?: string;
  group?: boolean;
  castTime: number;
  cooldown?: number;
  cooldownGroup?: string;
  cooldownUses?: number;
  cooldownRecovery?: "window" | "independent";
  action: SkillAction[];
  subAction?: Array<{
    value: string | string[];
    requirement?: Requirement[];
    fallback?: string | string[];
  }>;
  modifier: SkillModifier[];
  tags: string[];
  martialArt?: WeaponId;
  weapon?: WeaponFamily;
};
```

`skillBreakdownCategory` is an optional category name for the per-skill breakdown.
Skills with the same nonblank name share a collapsed summary that expands to their
individual rows. Uncategorized skills remain standalone. The worker sums damage,
healing, casts, triggers, and hits/heals; outcome rates are weighted by hits/heals.
Shares retain the whole-rotation denominator. Flat skill metrics remain available
for numerical audits, while grouped metrics drive the UI. Categories are localized
at the presentation boundary and do not change combat events or damage attribution.
Wind FA1–5 use `Blade of Heaven's Wrath` and A1–4 use `Light Attack`. Both
categories include their cancel and Rodent-only variants; separately
triggered Rodent damage retains its own skill attribution.

`shortName` is optional presentation metadata. Skill lists, selectors, timeline
rows, and breakdowns display it as `Long Name (Short Name)` without changing the
stable skill ID used by rotations and trigger actions.

`group: true` marks healing actions that affect every member represented by the
rotation's `groupSize`. Reported healing is multiplied by that recipient count,
and the healing breakdown counts one heal per recipient, while Self HP receives
only one copy. Its teammate copies contribute one-fifth of their healing to
World to Sword. A single-target heal assigned through a `player` effect
contributes its full healing instead.

Actions must be listed in nondecreasing `time` order. Equal times are valid and
array order breaks ties. Triggered events inherit a causal ordering so their
zero-time actions run before the next unrelated cast at the same timestamp.

Current tag conventions include:

- `DirectDamage` for direct-damage skills
- `DOT` for DOT definitions
- `Triggered` for skills that can only be inserted by a `trigger` action; these
  skills are excluded from the Rotation Editor's castable skill dropdown
- `SubAction` for component skills referenced by another skill's `subAction`
  list; these are also excluded from the Rotation Editor dropdown
- `MartialArts` for the All Martial Arts bonus
- `Mystic` for breakdown grouping
- weapon, move, and behavior tags such as `SnowpartingBlade`, `MoBlade`,
  `VariedCombo`, `BurningHeart`, `AnxiSoldier`, and `TriggerAnxiSolder`
- `MartialArtEffect` for secondary martial-art effects such as Falcon, Vile
  Condemned, and Anxi Soldier damage

Tags are exact, case-sensitive strings. `MartialArts` is intentionally distinct
from the older `MartialArt` tag used by some attunement matching.
Use `VariedCombo` for every varied-combo skill tag and requirement.
Every `Falcon` skill also carries `MartialArts`, including triggered Falcon
attacks, so All Martial Arts bonuses apply consistently.

Requirement conditions with `"target": "martialArt"` use the same canonical
martial-art tag stored in `data/martial-art/*.json` and on that art's skills—for
example, `SnowpartingBlade` or `PhalanxbaneBlade`. They match the action's skill
tags, not the IDs of the currently equipped weapons. This prevents a
martial-art-specific effect from applying to Mystic or another equipped art.

Use `"target": "equippedMartialArt"` with a martial-art ID such as
`heavenwill` when a mechanic depends on the player's equipped pair rather than
the skill currently executing. This requirement checks either equipped slot and
does not depend on their order.

Every castable skill tagged `MartialArts` declares its canonical `martialArt`
ID and physical `weapon` family. At cast start, these fields replace the
timeline's current martial art and weapon. Triggered martial-art component
skills omit both fields so they inherit state instead of switching it. General
and Mystic casts leave both values unchanged. Requirements can inspect the
state with `currentMartialArt` or `currentWeapon`.

### Ping exemptions

Skills may set ignorePing to true to start without the configured input latency.
The default is false. Composite skills with subAction use ignorePing on the
parent and pay latency independently for each selected component, rather than
for each damage action inside that component. Component selection occurs at
dispatch before its latency gap; the choice stays locked until cast completion.
Action requirements bound to skill start and cast-time modifiers still resolve
at the component's actual delayed start.

Both Deflect and Deflect (Successful) ignore ping. Infernal Twinblades A1–A4
and FA1–FA5 also ignore ping. Vile Condemned's
VileCondemnedHit and VileCondemnedEndHit releases ignore ping; Vile Condemned's
charge retains ordinary latency. All Burning Heart stages (1, 2, and 3) pay ping
only on PhalanxbaneHeavyPreCharge. Their normal and fast charge and slam
components ignore ping, as do the composite parents. Stage 1 goes directly from
PreCharge to its selected slam without a separate charge component. Drunken Poet
composites pay once per selected Drink/Poet component, with no additional parent latency.

Rotation records may contain ping, a non-negative finite millisecond override.
An absent value inherits the user's Settings ping (40 ms by default); zero
disables ping for that rotation.

## Actions

All normal skill actions have a numeric `time` measured from cast start and may
have a `requirement` array. Inner Way trigger actions execute at the triggering
damage event and may omit `time`. An action stored on a buff or debuff
definition may instead use `"time": "expire"`; it runs only when that exact
application expires. Refreshing the effect invalidates the previously scheduled
expiry action and schedules it for the refreshed expiration time.

### Damage

```json
{
  "type": "damage",
  "phyCoef": 1.2338,
  "attrCoef": 1.2338,
  "phyBonus": 342,
  "attrBonus": 186,
  "time": 0.7
}
```

`phyCoef` drives physical damage; independent `attrCoef` drives all four attribute paths. Missing coefficients mean zero. `attrBonus` is used only
by the equipped weapons' primary attribute. See `damage-formula.md`.

### Heal data

A healing action uses `phyCoef` for Physical and `silkbindCoef` for Silkbind, with the same timing as a damage action,
but declares `"type": "heal"`. It resolves Physical and Silkbind healing at
the action time and contributes to total healing and HPS without contributing
to damage or DPS. See `damage-formula.md` for the formula and outcome rules.

Healing-over-time skills carry the `HOT` tag. Their later heal actions may
resolve after the skill's cast time so the next sequential cast can begin while
the stored healing sequence continues.

Healing restores missing Self HP at its action time. The amount beyond Max HP
is overhealing and can feed a targeted buff accumulator. World to Sword uses
this mechanism: its buff listens only for the `overheal` event and its Qi Blade
emits `QiBladeCheck` 0.3 seconds after launch so stored overhealing can launch
the next blade as soon as the cooldown is ready. `emitEvent` is an internal
skill action and does not create a general combat-event broadcast.

Each recipient's healing number enters the accumulator separately. Expected
calculations use expected recipient healing, while simulations independently
roll every recipient's healing outcome and uniform `0.92`-to-`1.08` final-healing
fluctuation. Both modes reset accumulated overhealing to zero after
each launch and continue accepting healing during the 0.3-second launch
cooldown. The accumulator's `threshold: { physical: 12, silkbind: 18 }` supplies
coefficients for the fully buffed attack snapshot taken at the WTS application
(timestamp zero in its cast). The shared resolver includes food, effective ranges,
Void-to-Silkbind conversion, and active attack multipliers. It uses WTS's own
requirements and buffs, never the context of a nearby heal or damage action.
The resulting threshold remains fixed until the next application.
Healing and attack snapshots resolve synchronously inside the chronological
combat traversal, so earlier Qi Blades can affect later casts and healing through
Hawkwing/Etherwrath. Generated periodic-row IDs are not used to join healing
between different timeline passes. Expected Hawkwing stacks remain an approximation;
simulations retain the sampled stacks from the same run.
Both modes enforce the
buff's 12-second lifetime and 20-blade limit. Finite accumulator listeners expose
their remaining successful-trigger budget on the tracked buff for timeline UI;
reaching zero prevents further triggers but does not end the buff early.

Ivorybloom is a Silkbind Deluge weapon set. Its two-piece effect adds 9%
Critical Rate. Its four-piece effect retains that bonus and, while Self HP is
full, adds 5% Effective Critical Bonus plus 15% Critical Healing Bonus and 15%
Critical DMG Bonus. The conditional critical bonus bypasses Judgement Resistance
through `effectiveStat.effectiveCritBonus`, while the unconditional 9% does not.
Flamelash uses the same field for its 10% critical bonus while active, including
Rodent and Blade of Heaven's Wrath hits. Both bonuses share the 80% Effective
Critical cap and the ordinary final outcome calculation.
The set is timeline-affecting because its healing changes
can alter World to Sword's Qi Blade schedule.

Soulshade Umbrella's Buff Enhancement appends an Exhausted-target-only 5% damage
bonus to both `FloatingGrace` and `FloatingGraceDeluge` using their existing effect
modifiers. It does not apply a separate buff or start a separate timer. The extra
bonus is active only while the parent Floating Grace buff and target Exhausted
state overlap, and ends immediately when either ends. It also works with a
permanent Floating Grace supplied through the global controls while the Soulshade
talent is equipped.

Panacea Fan's Fourfold Inquiry light-attack chain is stored as four independently
castable stages. Each stage carries the shared `FourfoldInquiry` and `Light`
tags plus its own timing and damage values.
Panacea Fan's Jump Heavy carries the `Heavy` tag, lands at `0.975` seconds, and
retains its full `1.3125`-second cast time.

Intoxicated lasts 30 seconds. Drunken Poet and Dragon's Breath applications use
`reapply: false`, so casts made while the buff is active do not refresh that
expiry; a cast after expiry can apply a new 30-second instance. Drunken Poet is
selected through one- to five-hit composite skills. Each composite conditionally
casts Drunken Poet Drink first when Intoxicated is absent, then checks
Intoxicated again at the start of every requested hit and stops the remaining
components if it expires. The five underlying hit definitions are `SubAction`
components and use their always-Intoxicated timings directly; they have no
runtime cast-time modifier and are hidden from the castable skill list.

Drink and Poet attacks 1–4 use the measured interrupt / next-cast candidates as
their cast durations. Attack 5 is canceled when its hit lands, so its cast time
matches its hit time. Full animation end times are not used:

| Component | Hit time (seconds) | Cast time (seconds) |
| --------- | -----------------: | ------------------: |
| Drink     |                  — |               0.626 |
| Attack 1  |             0.4439 |               0.580 |
| Attack 2  |             0.2795 |               0.436 |
| Attack 3  |             0.3783 |               0.550 |
| Attack 4  |            0.44709 |               0.600 |
| Attack 5  |             0.5382 |              0.5382 |

Hit-triggered enhancement and explosion actions share their component's hit
timestamp. Turnaround applications remain at the cast-completion boundary, while
resource spending and fifth-hit enhancement consumption remain at component
start. Ping adds its separate latency before each selected component. Drink
plus five attacks therefore occupies 3.3302 seconds at zero ping and 3.5702
seconds at 40 ms ping. The separately defined instant Drink cancel is unchanged.

The four bundled one-minute Deluge rotations anchor their 59.99%, 39.99%,
and zero-Qi events to resolved skill starts or actions near 20, 30, and 50
seconds after battle start. These anchors are calibrated with the path's default
build, breakthrough 17, Simmering Fish Slices, Fire Divinecraft, no Script or
global-effect overrides, and 40 ms ping. Changing ping or build timing can move
them because they remain attached to combat actions rather than fixed timestamps.

```json
{
  "type": "heal",
  "phyCoef": 4.912,
  "silkbindCoef": 4.912,
  "phyBonus": 1363,
  "attrBonus": 743,
  "time": 0.975
}
```

An internal targeted event action names only the listeners interested in that
event:

```json
{ "type": "emitEvent", "value": "QiBladeCheck", "time": 0.3 }
```

### Replay

Only a skill tagged `Replayed` may be spawned by a damage-event listener. Its
actions use a fixed coefficient instead of ordinary damage fields:

```json
{
  "type": "replay",
  "coef": 0.13333333333333333,
  "time": 1
}
```

The triggering listener passes `event.damage`; each replay action deals exactly
that final damage multiplied by `coef`. Replay actions bypass the damage formula
and do not emit damage events, preventing recursive replay chains.

### Apply

```json
{
  "type": "apply",
  "target": "self",
  "value": "InnerPassion",
  "stack": 3,
  "duration": 10,
  "reapply": true,
  "time": 2.083
}
```

- `target: "self"` creates or updates a buff.
- `target: "target"` creates or updates a debuff and starts its periodic actions when defined.
- `target: "player"` creates an independently timed buff copy for one player.
  Applications fill self and then teammate recipients up to the rotation's
  `groupSize`; once full, the copy with the earliest expiration is replaced.
- `stack` defaults to one and is capped by the resolved definition's `maxStack`.
- `duration` overrides the definition duration. No duration means the state does
  not expire.
- `reapply: false` leaves an already-active tracked effect unchanged.
- Reapplying a tracked effect adds stacks up to its maximum. Its definition's
  `refresh` field decides whether that application also resets the expiration.
- Effect-definition cooldowns can reject an application until the cooldown ends.

An Inner Way trigger can grant conditional extra stacks:

```json
{
  "type": "apply",
  "target": "self",
  "value": "YiRiver",
  "stack": 1,
  "additionalStack": {
    "requirement": [
      { "target": "target", "value": "Controlled" },
      { "target": "self", "value": "MoraleChantT3" }
    ],
    "stack": 1
  },
  "reapply": true
}
```

### Consume

```json
{
  "type": "consume",
  "target": "self",
  "value": "Forgetfulness",
  "stack": 1,
  "time": 0
}
```

Consumption occurs at the declared action time. The default amount is one;
`"stack": "all"` removes every current stack. A
`first` operator consumes the first available name from a left-to-right list:

```json
{
  "type": "consume",
  "target": "self",
  "value": {
    "operator": "first",
    "operand": ["InnerPassion", "ChargeEnhancement"]
  },
  "time": 0.4
}
```

Inner-way and setup trigger actions also support direct `consume` actions, so a
damage trigger can remove a status without spawning a helper skill.

By default, `first` is resolved when the consume action executes. Add
`"resolveAt": "skillStart"` to remember the first available operand when the
skill starts and consume only that remembered effect later. If the remembered
effect expires before the consume action, nothing is consumed; the action does
not fall through to another operand. For a multi-action skill, `skillStart`
means the start of the component definition that owns the consume action. This
also lets the following component snapshot its modifiers before a consume
scheduled just after the preceding component's cast time.

### Trigger

```json
{
  "type": "trigger",
  "requirement": [{ "target": "self", "value": "IronGuard" }],
  "value": "AnxiSoldierSnowbreakSpring",
  "time": 0.867
}
```

The referenced skill is inserted at the action timestamp. Triggered skills do
not consume rotation cast time. A skill-level `cooldown` prevents both casts and
triggers while active. An unavailable explicit cast waits until its cooldown is
ready; triggered skills remain rejected while unavailable. Cooldowns are keyed
by `cooldownGroup` when declared and otherwise by skill ID. Separate definitions
with the same group therefore read, consume, and clear one shared window.
`cooldownUses` permits that many casts in the window, which starts with the first
cast. This is the default `cooldownRecovery: "window"` behavior. With
`cooldownRecovery: "independent"`, `cooldownUses` is instead the charge capacity.
The skill starts with all charges available, and each accepted cast or trigger
spends one charge with its own recovery timestamp. For a 15-second cooldown,
casts at 0, 2, and 4 seconds recover at 15, 17, and 19 seconds. With no charges,
explicit casts wait for the earliest recovery; triggers are rejected. Shared
groups use the same charge pool and must declare consistent capacity and recovery
mode. A matching skill modifier may override a cast's `cooldown`; already pending
recoveries retain their original timestamps.

The timeline exposes each elapsed cooldown wait as a protected Delay row with
`automatic: "cooldown"`, its start time, and its actual duration. A cooldown reset
shortens the row, and Battle End clips an unfinished wait. These generated rows
cannot be edited, moved, or removed directly; they do not enter saved rotation
steps or add time to the simulation.

The solo and team Dummy 1 Min WTS presets use Endless Cloud [Cancel]. This
variant retains its healing and Morning Drizzle applications but omits the
Echoes of a Thousand Plants trigger. Full Endless Cloud triggers Echoes at
its 0.9375-second cast end and starts the shared Umbrella Special cooldown.

Timeline rows record whether a trigger came from a skill, setup effect, or Inner
Way. Per-cast breakdowns attribute normal triggered-skill and DOT damage to the
owning explicit cast unless the skill or DOT declares
`damageGroup: { "id": "FivefoldBleed", "name": "Fivefold Bleed" }` (or the
corresponding Morale Chant group). When that Inner Way is selected, these actions
belong to one synthetic `damageGroup` row, not a cast attack. Fivefold Bleed collects
both Weeping Blood ticks and all Piercing Damage; Morale Chant collects its hits.
These read-only headers appear at the top even when no proc occurs. Expanding one
lists its actions chronologically beneath it, with their actual combat timestamps.
The headers are runtime-only, cannot anchor fight start or attached events, and
consume no cast time. They do not change persisted rotation steps.
Repeated casts group by skill, sum damage, and average
their individual damage-per-effective-cast-time DPS values. A Deflect immediately
following an explicit skill contributes its effective cast time to that skill's
sample. Skills with no attributed damage, including Deflect itself, are omitted.

Boost-damage attribution is declared on the enabling skill with
`collectBoostDamage`. Its value is the buff ID whose counterfactual damage
should be credited to that cast. The field and source cast are passed into buffs
applied by the skill. If the named buff is applied later, its applying action
sets `boostDamageSource` to the enabling self-buff ID. A direct map lookup
inherits that buff's source cast when its `collectBoostDamage` matches the
applied effect. No other active buff is searched. Flute names its directly applied `Flute`
buff. Ghostly Step names `MysteryDMGBoost`, so `Mystery` or `MysteryUmbra`
carries the source until Perfect Dodge applies the damage buff. Perfect Dodge
has a conditional application for each enabling buff, each naming its source.
Ghostly Step and Umbra consume the opposite enabling buff before applying their
own, so the two cannot coexist through these casts. An existing damage boost
retains its original credit until a later application replaces it. Both then use
the same per-hit calculation with and without the named buff.

### Multi-action skills

`silent: true` marks an inert skill/component. It cannot contain actions,
cooldowns, or attack responses and does not emit a skill-start notification.
Its weapon declaration still switches weapon at the earliest possible start.
Vile Condemned's parent and charge are silent; its damage-bearing release is not.
`waitForRequirement` requires a silent, unconditional prefix. The live scheduler
holds release until ready and backdates only the displayed charging interval;
explicit start attachments stay at the earliest start. See
[Readiness after charging](rotation-event-loop.md#readiness-after-charging).

A castable skill can declare an ordered `subAction` list of objects. `value`
names the primary component. Its optional `requirement` is evaluated when that
component dispatches, after earlier components finish and before its ping gap. A passing requirement uses
the primary component; a failing requirement uses `fallback` when provided or
skips the component otherwise. The selection remains locked for that component
cast.

`value` and `fallback` may instead be equal-length arrays. The requirement is
evaluated once when the first component in the group dispatches, and the entire
primary or fallback sequence is locked from that result. Later components do
not re-evaluate the requirement after earlier components change resources,
effects, or cooldowns. Each paired position reserves enough action slots for
either candidate, using the same stable attachment behavior as a scalar
fallback.

The parent skill's own cast and actions execute first, followed by each selected
component in array order. Unlike a `trigger`, every selected component consumes
its effective cast time. Component actions retain the selected component's tags
and resolved modifiers for requirements and damage calculation. Their damage,
triggered actions, cast time, timeline display, and per-cast breakdown ownership
remain assigned to the parent skill.

Both primary and fallback action capacities are allocated during expansion.
Unused action slots are inert, allowing the candidates to have different action
counts while preserving stable indexes for stored action attachments. An
attachment targeting an unselected action is skipped. Component definitions use
the `SubAction` tag and cannot be selected directly in the Rotation Editor.

Legacy string entries from stored skill overrides are interpreted as objects
with only `value`; bundled data uses the object form. Nested lists are expanded
in order, and a cyclic reference is ignored at the repeated edge. Conditional
primary and fallback definitions are currently required to be leaf components;
unconditional component references may still contain nested subactions.
Conditional sequences provide grouping without adding nested conditional
definitions.

Burning Heart uses a conditional sequence immediately after its 0.4-second
PreCharge. Inner Passion or Charge Enhancement selects and locks the Fast
Charge/Fast Slam sequence; otherwise the Slow Charge/Slow Slam fallback is
locked. Fast Charge takes exactly two-thirds of the corresponding Slow Charge
time, with its internal action times scaled by the same ratio. Slam timing and
damage timing are unchanged. Only the Fast Slam can receive Steadfast Devotion
T4's `0.32` Base DMG Bonus, and it checks only that Inner Way condition because
the acceleration state was already captured by the sequence selection.

### Extend

```json
{
  "type": "extend",
  "target": "target",
  "value": "Dread",
  "duration": 2,
  "time": 1.883
}
```

`duration` is the amount added to the existing expiration time. Missing,
permanent, or already-expired states are not extended.

### Clear cooldown

```json
{
  "type": "clearCD",
  "target": "self",
  "value": "Forgetfulness",
  "time": 0.867
}
```

This clears the named effect/application cooldown at that timestamp.
It also clears a skill cooldown with the same identifier. Inner-way and setup
trigger actions support `clearCD`, so an on-damage rule can reset a skill or
effect cooldown without a triggered helper skill.

An optional positive integer `charges` limits a skill reset to that many spent
uses. For independent recovery it cancels the earliest pending recovery timers,
after excluding charges that have already recovered naturally; other timers are
unchanged. Restoring at full capacity does not bank additional charges. Omitting
`charges` retains the existing full reset. The same action works directly and
inside setup or Inner Way triggers, and wakes a waiting cast when a charge becomes
available. Infernal Twinblades uses
`{ "type": "clearCD", "value": "AddledMind", "charges": 1 }`.

Inner Way damage triggers may declare `hitWindow: { "count": 6, "seconds": 2 }`
and a separate `cooldown`. Each trigger owns a bounded list of its most recent
qualifying hit timestamps and its next available time inside the timeline build.
The window includes its lower boundary using the normal timeline time comparison.
Multiple damage actions at one timestamp count separately. Hits continue to enter
the window during cooldown; a ready trigger checks the window on the next
qualifying damage event, without scheduling a timer or clearing its hit history.
A proc starts its cooldown even when the affected skill is already fully charged.

Expected hit windows count only definite damage actions. Any action carrying
`hitProbability` is excluded, even when that value is one, so changes in expected
proc probabilities cannot move cooldown-reset timing. Ordinary damage scaling
without hit-probability metadata does not change the count. This does not remove
probabilistic damage from DPS or change other triggers. Sampled simulation counts
actual successful proc hits; failed procs emit no hits. Healing and non-damage
actions never enter a hit window. The current timeline represents one target,
so the counter is local to that target without adding target identifiers.

Setup triggers also accept `event: "skillStart"`. They run once after an accepted
cast starts and its cooldown and cast-start state resolve, before its timed
actions. This includes triggered skills and skills without actions, but excludes
periodic effect rows and rotation events. The trigger's ordinary `requirement`
matches the starting skill's own tags. Its `cooldown` is shared across all skills
matching that setup trigger, independently of the cooldown it clears.

### Set self HP and take damage

The timeline initializes self HP from the calculated Max HP stat. The attached
Self HP event emits a `setHP` action and stores an absolute value:

```json
{
  "type": "setHP",
  "currentHP": 100000,
  "time": 0
}
```

The Take Damage event subtracts a nonnegative absolute amount:

```json
{ "type": "takeDamage", "damage": 70000, "time": 0 }
```

Unlike Self HP, Take Damage is a fight-relative timed event. Its `startTime`
is editable independently of skills and resolves before skill actions at an
equal timestamp. This lets incoming encounter damage and damage-triggered setup
effects remain fixed even when rotation cast timing changes.

Every action snapshots both current self HP and its ratio to Max HP. Percentage
requirements therefore read the state after preceding actions at the same
timestamp. Rotation import retains `currentHPRatio` only as a legacy boundary
adapter and converts it against the current Max HP when building the timeline.
The Rotation Editor displays this state as a percentage. Its Self HP event input
also accepts a percentage and converts it to absolute `currentHP` at the UI
boundary. Take Damage accepts only an absolute damage amount in the Self HP
column; its row does not display a derived self-HP result.

### Set target HP and Qi

An optional positive `targetHP` on the rotation enables target-health tracking.
The target starts at 100%, each damage action subtracts its calculated damage
from the remaining target HP, and later actions snapshot the resulting ratio.
Without `targetHP`, damage does not reduce the displayed target percentage.
An attached target HP event can set the percentage explicitly:

```json
{
  "type": "setTargetHP",
  "targetHPRatio": 0.5,
  "time": 0
}
```

The former `autoHP` option is no longer supported. Saved and imported rotations
drop that flag without removing authored HP events or shifting the fight-start
anchor. HP changes must come from explicit events or damage against configured
target maximum HP; no duration-dependent HP events are generated.

A rotation with `"dummyAttack": true` derives two hidden Take Damage events at
5.5 seconds after fight start and every six seconds thereafter. Both events at
each timestamp deal 200 damage and use the same `takeDamage` action and trigger
ordering as manually entered damage. Generation stops before Battle End, or
before the resolved final timeline time when Battle End is absent. Generated
events are not written into the editable `steps` array.

Qi also starts at 100%. A Qi event emits `setQi`; setting Qi to zero immediately
applies Exhausted. Exhausted declares a generic expiry action which restores Qi
to 100% when its data-defined duration ends:

```json
{
  "type": "setQi",
  "targetQiRatio": 1,
  "time": "expire"
}
```

Rotation loaders migrate legacy Exhausted events to Qi-at-zero events and
legacy `HP` events containing `currentHPRatio` to explicit Self HP events.

Preset rotations approximate linear target-Qi loss within each depletion
segment. They attach 59% and 40% Qi events to the nearest damage actions at,
respectively, 41% and 60% of the interval from the previous Exhausted expiration
(or fight start for the first segment) to the next 0% Qi event. The
`tests/rotation-qi-ramps.test.ts` verifies one of each marker per depletion.

### Numeric resources

The timeline also tracks named numeric resources. Resources start at zero
unless supplied through `TimelineBuildInput.initialResources`. Skill and effect
actions can update them:

```json
{ "type": "setResource", "value": "HeavensWill", "amount": 1, "time": 0 }
{ "type": "addResource", "value": "HeavensWill", "amount": 1, "time": 1 }
{ "type": "consumeResource", "value": "HeavensWill", "amount": 1, "time": 2 }
```

`system.json.initialResources` starts Blade Momentum (`BladeMomentum`) and
Battle Will (`BattleWill`) at the user-confirmed value of `4`. Both stay fixed
and hidden in the UI while their generation, spending, and caps remain
unimplemented. This activates Snowparting Blade's rank-13 Critical DMG Up
condition (`BladeMomentum > 1`) through the existing resource requirement.

`setResource` replaces the value, `addResource` increases it, and
`consumeResource` decreases it. A `consumeResource` action may use `"all"` as
its amount to set the resource to zero. Results are normally clamped to zero
and to an optional named maximum supplied by
`TimelineBuildInput.resourceMaximums`. Vitality is the exception: consumption
may take it below zero so a rotation can expose its resource deficit. Every
action snapshots the resources before that action resolves, so a resource
change affects later actions at the same timestamp but not earlier actions.

Timeline construction also keeps a resource ledger containing the initial,
accepted consumed, accepted regenerated, and final value of every resource.
Regeneration records the amount actually received after applying the resource
cap; wasted gains at the cap do not count. The final Vitality ledger drives the
aggregate Mystic damage correction described in `damage-formula.md` without
changing the resource values displayed on individual timeline rows.

An action can lock its requirement result when its owning skill or sub-action
component begins:

```json
{
  "requirement": {
    "resolveAt": "skillStart",
    "operand": [
      { "target": "self", "value": "SoaringHighT6" },
      { "target": "resource", "value": "HeavensWill", "comparison": "==", "amount": 4 }
    ]
  }
}
```

The complete operand uses the normal implicit-AND requirement semantics. Its
boolean result is remembered for that action and does not change when effects
or resources change before the action executes. In a multi-action skill,
`skillStart` means the start of the selected component that owns the action.

`TimelineBuildInput.resourceRegeneration` maps resource IDs to the amount
generated per second. Regeneration accrues continuously between ordered
timeline events before the next event snapshots its state, beginning at the
resolved fight-start anchor rather than the earliest prepull action. Heaven's
Will starts at the system-defined value of `2` and uses the character's hidden
`heavensWillRegen` stat; its innate value of `0.1` therefore generates one
Heaven's Will every 10 seconds after the fight starts. Explicit resource actions
operate on the regenerated value, and equal-time actions retain their declared
causal order.

`system.json.resourceEvents` defines universal gains caused by timeline
events. A damage rule may declare a cooldown; a take-damage rule may declare
`perMaxHPRatio`, in which case Max HP actually lost grants `amount`
proportionally to that ratio. Vitality starts at and is capped by the character's
`maxVitality`. Direct Mystic definitions consume Vitality with an explicit
time-zero `consumeResource` action. Triggered Mystic definitions omit that
action, so follow-up damage does not pay the parent cast's cost again. A
rotation with `"infiniteVitality": true` marks Vitality through the generic
`TimelineBuildInput.infiniteResources` handling; its value remains at the
resource maximum while resource gains, regeneration, and consumption are
ignored.

Inner Way triggers may react to either `damage` or `takeDamage` and execute the
same numeric resource actions used by skills. A missing trigger event continues
to mean `damage` for existing Inner Ways. Fury Harvest T3 instead changes the base
damage-driven Vitality recovery from `2` to `2.1`, sharing that recovery's existing
two-second cooldown. It grants nothing on intervening hits and does not add a
separate Take Damage bonus. The system resource-event `amount` supports the existing
`switch` format, resolved against active tier/setup conditions at timeline creation.
Incoming damage retains its ordinary HP-loss-based recovery.
Fury Harvest T1 adds one conditional Vitality action to Perfect Dodge,
and T4 adds one to a successful Deflect. T2 grants `35` Physical Defense. T5
grants `5.1` defensive Physical Resistance; this internal stat also accepts the
Physical Resistance attunement but is intentionally omitted from the character
stat display.

Fury Harvest T6 uses explicit actions on directly cast Mystic skills. At cast
end, the skill applies or refreshes one stack of the general Turnaround buff for five seconds.
If Turnaround was already active when a later Mystic consumed Vitality at cast
start, an immediately following action refunds 30% of that skill's declared
cost, capped at 10 Vitality. Turnaround is not consumed by the refund. Triggered
Mystic follow-ups neither spend Vitality nor apply Turnaround.

Seasonal Edge T0 uses a `skillEndRandomBuff` trigger on skills tagged
`Conversion`. Finishing an eligible skill outside the 30-second cooldown opens
one eight-second window whose `outcome` entries select Bloom, Flare, Yield, or
Frost with equal weight. T1 extends the shared duration to 12 seconds. T2 adds
24.8 Min Physical Attack and 49.6 Max Physical Attack. T3 changes the result
count to 70% one buff and 30% two distinct buffs; later selections use the
remaining weighted pool rather than allowing a duplicate.

T4 changes the outcome weights to 10/40/40/10 for Bloom, Flare, Yield, and
Frost, and permits Serene Breeze to trigger the same proc. T5 adds 2.8%
Physical DMG Bonus. T6 removes Frost, uses 10/40/40 weights for the remaining
pool, and changes result counts to 50% one buff, 30% two distinct buffs, and
20% all three buffs. Deterministic damage calculations enumerate and merge the
weighted buff combinations; simulations roll one concrete combination and
retain it for the whole window. Bloom and Frost currently have no numerical
effect. Flare adds 10% All Martial Arts and another 10% while self HP is above
75%. Yield adds 10% Mystic Skill Damage and may restore two Vitality per second.
The Seasonal Edge Cooldown itself is deterministic: every accepted trigger
adds a normal one-stack, 30-second timeline buff with an ordinary expiration
time. It is not included in the probability-weighted outcome plates.

Because any multi-buff result may include Yield, the timeline displays Vitality
as a lower and upper bound. The lower bound follows the ordinary resource
timeline for outcomes without Yield. The upper bound applies Yield during every
possible Seasonal Edge window while respecting Max Vitality. These bounds are
display state; damage calculations and simulations continue to use exact
seasonal combinations.

## Requirements

A requirement array is an implicit AND group:

```json
"requirement": [
  { "target": "self", "value": "FrostCladNightT6" },
  { "target": "target", "value": "Exhausted" }
]
```

Supported targets are:

- `self`: an active player buff or selected Inner Way tier condition
- `target`: an active target debuff
- `skillTag`: a tag on the skill being evaluated
- `martialArt`: the canonical martial-art tag on the skill being evaluated,
  such as `SnowpartingBlade` or `PhalanxbaneBlade`
- `equippedMartialArt`: a canonical martial-art ID present in either equipped slot
- `currentMartialArt`: the canonical martial-art ID active at this timeline event
- `currentWeapon`: the active physical weapon family, such as `HengBlade` or `MoBlade`
- `resource`: a named numeric timeline resource compared with `amount` using
  `comparison`; supported comparisons are `>=`, `>`, `<=`, `<`, `==`, and `!=`
- `distance`: current target distance, compared with `amount` using the same operators;
  used to reject Rodent triggers at distance 12 or above
- `selfHPPercentage`, `targetHPPercentage`, and `targetQiPercentage`: the
  corresponding action-time percentage compared with `amount` using the same
  operators

For example, Heaven's Will requires at least one resource point:

```json
{ "target": "resource", "value": "HeavensWill", "comparison": ">=", "amount": 1 }
```

For tracked effects, optional `stack` means at least that many stacks. The value
`"max"` means the tracked stack count must have reached its resolved maximum.

OR uses an explicit operator. An array nested inside `operand` remains an AND
group:

```json
{
  "operator": "or",
  "operand": [
    [
      { "target": "skillTag", "value": "Light" },
      { "target": "skillTag", "value": "VariedCombo" }
    ],
    { "target": "skillTag", "value": "AnxiSoldier" }
  ]
}
```

This means `(Light AND VariedCombo) OR AnxiSoldier`.

## Modifiers

Modifiers are selected from the state at cast start:

```json
"modifier": [
  {
    "requirement": [
      { "target": "self", "value": "Forgetfulness" }
    ],
    "effect": {
      "castTimeModifier": -0.667,
      "castTimeMultiplier": 0.8
    }
  }
]
```

Cast time and every numeric action time are transformed with:

```text
adjusted time = max(0, original time + sum(castTimeModifier))
              × product(castTimeMultiplier)
```

A modifier `duration` can override the duration of effects applied by that cast.
Modifiers do not consume states; use a timed `consume` action for consumption.

Setup effects may declare `buffDurationBonus`, an additive decimal ratio, with
ordinary `requirement` rules. For self/player buff applications, the timeline
resolves the duration from the action override, cast modifier, or modified buff
definition, then multiplies it by `max(0, 1 + sum(matching buffDurationBonus))`.
The requirement's skill tags come from the originating cast, including through
nested triggered skills and their setup/Inner Way applications. This buff-source
context is separate from damage attribution and does not add tags to triggered
damage. Other requirement state is evaluated at application time.
Reapplications retain the buff's normal refresh behavior. Permanent effects,
target debuffs, unrelated active buffs, and explicit `extend` amounts are unchanged.
An ordinary later refresh resolves its own source and duration afresh.

Infernal Twinblades' Perfect Dodge Enhancement uses `buffDurationBonus: 0.4`
for the `PerfectDodge` source tag. Both dodge variants share one `attackResponse`
trigger that restores one `AddledMind` charge, with a separate 30-second trigger cooldown.
The duration bonus is independent of that cooldown and includes indirect dodge
buffs such as Disintegration. Addled Mind uses a 15-second cooldown, three uses,
and independent recovery. Its definition in `data/skill/infernal-twinblades.json`
uses the supplied outside-PvP Level 100 file data, unverified in play. Interrupt
time is cast time: 0.744 seconds, with six hits at 0.344, 0.408, 0.472, 0.545,
0.609, and 0.673 seconds. The first five hits each use physical and attribute
coefficients of 0.216768, physical bonus 60.16, and attribute bonus 32.8; the
last uses 0.27096, 75.2, and 41 respectively. A cast-start Flamelash modifier
subtracts 0.144 seconds from both cast and hit times, giving a 0.6-second cast.
This explicit uniform shift places the third hit at 0.328 seconds, rather than
the supplied active table's 0.329 seconds. End animation times are unused.
Addled Mind does not change the Flamelash state.
Its `MartialArt` tag enables the Infernal Twinblades Martial Art Skill DMG
Boost attunement through the shared tag matcher.

Infernal Twinblades rank 13 contains all five talents in source order, using
the rank array directly without talent IDs. The implemented effects are:

- Physical Attack Up: `0.264 × Agility`, capped at `73.92` at 280 Agility.
- Flamelash Damage Enhancement: while the self buff `Flamelash` is active,
  add a fixed 5% Critical DMG Bonus and a separate
  `min(0.25, raw Min Physical Attack × 0.25 / 750)` scaling effect, for a total
  talent bonus of 30% at 750 Min Physical Attack. Both effects require Flamelash.
- Bamboocut Attribute Up: add 98 Min and 196 Max Bamboocut Attack as `rawStat`,
  then add `0.0672 × raw Min Bamboocut Attack` penetration, capped at 22.
- Attr. Attack DMG UP: already supplied by the shared attribute damage channels
  and primary-path 1.5 Bamboocut multiplier. Its `effect` array is deliberately
  empty to avoid applying a second multiplier or additive damage bonus.

These conversions use the interpreted source rates without rounding them to
match older talents' hand-entered caps. Formula inputs use the existing immutable
raw-stat stage, including flat attribute talents but excluding later talent and
food bonuses. Flamelash is usable through its activation skill or the existing
manual Buff event. Its lifetime follows the Hellfire resource described below. Perfect Dodge's wider success window and longer
breath-hold remain unimplemented: the simulator does not currently resolve dodge
input windows or track breath-hold duration.

Mortal Rope Dart rank 13 likewise contains five talents in source order without
talent IDs. Critical Rate Up grants `0.000304 × Agility`, capped at `0.08512`
(8.512%) at 280 Agility. Bamboocut Attribute Up adds 98 Min and 196 Max
Bamboocut Attack as `rawStat`, then grants `0.000336 × raw Min Bamboocut Attack`
Bamboocut DMG Bonus, capped at 11%. These are the interpreted datamine rates.

Rodent Damage Enhancement uses the existing `skillTag: Rodent` requirement.
It adds separate fixed 9% and scaling `min(0.12, raw Min Physical Attack × 0.00016)`
Physical and Bamboocut DMG Bonus effects. At 750 raw Min Physical Attack the
total Rodent bonus is 21% in each of those channels; other attribute channels
and attacks without the tag receive no Rodent bonus. The formulas use the
shared raw-stat stage. The Rodent attack in `data/skill/mortal-rope-dart.json`
carries `Rodent` and `MortalRopeDart`, activating its talent and attunement bonuses.

Flamelash (`Flamelash`, source `20502003` in
`local/datamine/wwm-skills-normal-all.json`) uses the exported 0.85-second
interrupt as its cast time and applies the Flamelash status at cast start (time zero). Its
base bonuses are 0.1 Critical Rate through the shared stat pipeline and 0.2
Critical DMG Bonus, in addition to the existing rank-13 talent bonuses.
Hellfire (the export calls it Karma Flame) starts at zero and caps at 80 through
`system.json`. The rotation editor shows its shared resource snapshots whenever
Infernal Twinblades is equipped. User-confirmed per-hit gains are:

| Attack      | Hellfire per hit | Current total when all hits land |
| ----------- | ---------------- | -------------------------------- |
| A1          | 10               | 10                               |
| A2, A3, A4  | 5                | 10 each                          |
| FA1         | 5                | 10                               |
| FA2         | 5                | 5                                |
| FA3         | 1.25             | 10                               |
| FA4         | 1.25             | 6.25                             |
| FA5         | 2                | 10                               |
| Addled Mind | 2                | 12                               |

Each gain is an explicit `addResource` action at its hit timestamp. Resource
entries follow the existing action list to preserve damage/attachment indexes;
chronological execution still grants them at the hit. A4/FA5 cancel retain all
landed-hit gains. A1/A3/A4/FA4 Rodent-only cancels have no blade hit and grant no base
Hellfire; a triggered Rodent can still qualify for Echoes T3.

The zero-time FA2 [Rodent] variant also launches one Rodent without a blade hit
or base Hellfire gain. Like the other Rodent-only variants, it requires RR or ERR
and distance below 12; its Rodent lands 0.5 seconds later.

The editor's Modify Hellfire event stores a fight-relative `startTime` and signed
`amount`: positive adds and negative consumes, clamped to the resource's 0-80 bounds.
It uses the actions in `data/event.json`, ends Flamelash immediately if the result
is zero, and neither activates Flamelash nor resets its drain ramp when adding.
It consumes no cast time and survives rotation save, export, and import.

Flamelash's indefinite periodic effect consumes Hellfire every 0.13 seconds,
starting 0.13 seconds after activation. Tick n (starting at one) consumes
`1 + 0.05 * (n - 1)`. A conditional consume action removes Flamelash on the
same tick that Hellfire reaches zero and cancels future ticks. Activation at
zero ends immediately. Gains replenish the resource without resetting the ramp;
another activation resets it. At 80 with no gains, 40 ticks consume 79 and tick
41 empties the remaining point, ending Flamelash at 5.33 seconds.

The editor intentionally permits activation below 80 and FA casts outside
Flamelash. Such FA casts retain their authored attacks and gains but do not
implicitly activate Flamelash or receive its state-dependent effects. Presets
should activate at 80 and cast FA stages only while active, subject to the
current user-approved Wind sequence exception below. Attack HP drain remains
unmodeled.

Infernal Twinblades exposes A1–A4 (Dual Blade - Light Attack / 雙刀・輕擊)
and FA1–FA5 (Blade of Heaven's Wrath / 天怒刀法) as independent castable stages.
Each stage uses the supplied interrupt time as its cast time and retains every
local hit's Level 100 physical/attribute coefficients and flat bonuses. End
animation times are unused. FA stages also carry `Empowered` for their light
attack attunement. Activate Flamelash for its dependent bonuses and marks;
these attack stages do not change its state automatically.

Infernal A4 Cancel (`InfernalLight4Cancel`) ends at its simultaneous hits at
0.167 seconds. Normal A4 retains its 0.529-second cast. FA5 Cancel
(`InfernalFlamelashLight5Cancel`) ends at its final hit at 1.023 seconds,
retaining all five blade hits and the conditional Echoes T6 Rodent triggers at
its first hit. Normal FA5 retains its 1.401-second cast. The variants
`InfernalLight1Rodent`, `InfernalLight3Rodent`, `InfernalLight4Rodent`, and `InfernalFlamelashLight4Rodent`,
displayed as A1 [Rodent], A3 [Rodent], A4 [Rodent], and FA4 [Rodent], represent immediate
cancellation after requesting the Rodent
attack. They ignore ping, consume no cast time, and deal no Twinblades damage.
Each uses the existing conditional trigger action to launch one Rodent at time
zero while Rodent Rampage is active, retaining the Twinblades weapon context.
They emit no Light Attack damage event, so the canceled blade cannot apply
Sin/Karma or contribute a phantom hit to damage listeners; the actual Rodent
attack still follows its ordinary damage and listener pipeline.

Rodent Rampage (鼠鼠生威), Mortal Rope Dart Special, casts in 0.541 seconds,
applies its self buff at 0.541 seconds, and has no cooldown. The buff lasts ten
seconds, caps at one stack, and refreshes its expiration. Its existing accumulator
uses numeric `threshold: 2`, a `damage` event requirement for Martial Arts Light
attacks, and `oncePerSkill: true`. Only the first damage action of each stage
counts, including separate stages inside a multi-action skill. Infernal Twinblades
and Mortal Rope Dart contribute two counter units per stage; other martial arts
contribute one through a `switch` amount on `currentMartialArt`. The listener
launches one Rodent at threshold and resets progress. A refresh preserves progress
through `resetOnRefresh: false`; expiration or removal clears it. Probability-weighted
expected proc rows do not advance this counter; actual sampled hits may do so.

Rodent has zero cast time and lands its damage 0.5 seconds after triggering.
Damage, hit-time buffs, recording, and Samsara gains resolve at landing; an
already launched attack can land after its RR/ERR source expires or is replaced,
subject to Battle End. It inherits the current martial art without switching
weapons. Its independent physical and attribute coefficients both use distance
segments `[12]` with results `[0.348974526316, 0]`. The user confirmed that the
nonmatching route applies to PvE and the matching route is for PvP. Both
coordinated and automatic attacks use skill 20391's base coefficient
0.581624210526316 multiplied by 0.6, with zero flat bonuses. All ordinary Rodent
triggers require `distance < 12`, preventing out-of-range damage, proc counts,
and Samsara gains. Matching PvP routes (0.366423252632 below 5 and 0.3315258
below 12) are not selected. Export distances use raw game units; their mapping
to the editor's metres remains unverified. It carries neither `Light`
nor `Empowered`, so it cannot recursively trigger itself or apply Sin/Karma.
Echoes T6 adds two ordinary conditional Rodent trigger actions at FA5's first hit
(0.342 seconds). They require Rodent Rampage, Flamelash, and T6. Together with the
buff's normal trigger this produces three Rodent attacks for FA5, not three per
damage hit. These definite hits may contribute to Echoes T4.

Attr. Attack DMG UP is already covered by the shared primary-path multiplier
and therefore has an empty effect array. Bone Corrosion Enhancement uses a
rank-13 damage trigger on `BladeboundThread` to apply Bone Corrosion after the
hit. Coiled Dragon application still awaits its skill data.
The `BoneCorrosion` debuff in `data/debuff/bamboocut-wind.json` is available in
the Skill Editor and manual Debuff events. It lasts five seconds, caps at one
stack, refreshes on reapplication, and is not party-shared. Its existing
`qiDMGBonus` field stores 5% for the applier plus another 35% for actions tagged
`Light`, totaling 40%. This follows the same field used by Qi Imbalance and
Vulnerable. Qi damage is not calculated yet, so these stored bonuses do not
alter damage output. The talent uses the existing target application action.

Modifier values may use `byStack` to capture a buff or debuff's stack count at
cast start:

```json
"dmgBonus": {
  "function": "byStack",
  "param1": "EnhanceDrunkenPoet",
  "param2": 0.2,
  "target": "self"
}
```

`param1` is the tracked effect ID, `param2` is the value per stack, and `target`
defaults to `self`. The resolved number is frozen for the cast, so a later
`consume` action does not remove the cast's bonus. Drunken Poet 5 uses this to
gain 20% direct damage per Enhanced Drunken Poet stack before consuming all of
those stacks. Its separately triggered explosions do not inherit the modifier.
Enhanced Drunken Poet is a Mystic buff displayed as `EDP`; its existing
internal ID remains `EnhanceDrunkenPoet` for stored-data compatibility.

## Buff and debuff definitions

```json
{
  "MountainSplitter": {
    "name": "Mountain Splitter",
    "description": "Increases Critical DMG for matching skills and applies the guaranteed-critical rule.",
    "duration": 10,
    "cooldown": 15,
    "maxStack": 1,
    "refresh": true,
    "effect": [
      {
        "requirement": [
          {
            "operator": "or",
            "operand": [
              { "target": "skillTag", "value": "BurningHeart" },
              { "target": "skillTag", "value": "AnxiSoldier" }
            ]
          }
        ],
        "effect": {
          "SteadfastGuaranteedCrit": true,
          "critDmgBonus": 0.1
        }
      }
    ]
  }
}
```

Definition fields:

- `name` and `description`: rotation display and hover text
- `duration`: default lifetime; omission means permanent
- `cooldown`: minimum time between accepted applications
- `maxStack`: stack cap
- `refresh`: whether a successful reapplication resets the duration
- `action`: actions scheduled relative to each accepted application or
  reapplication; a rejected application does not schedule them
- `effect`: action-time effect rules
- `stackEffects`: cumulative effect rules indexed by current stack count
- `shared`: marks a debuff as shared with the party; a displayed shared debuff
  includes elapsed-time coverage in the DPS breakdown
- `showCoverage`: includes the effect in Buff Coverage or Debuff Coverage when
  it has a non-zero output-action average stack count or shared time coverage
- `global`: when `true`, contributes always-active setup rules and stays hidden
  from manual Buff choices

Effect definitions marked `global: true` are flattened into the always-active
setup effects. They are checked for every damage action like Inner Way rules,
but are not tracked buffs and do not appear in buff plates or the manual Buff
selector.

`TimelineBuildInput.initialBuffs` and `initialDebuffs` may seed permanent
tracked effects. Seeded effects have no expiration, are not consumed, and merge
by definition ID with later applications. This is used by the Main-tab global
effect controls rather than copying their damage fields into every action.

When `stackEffects` exists, index `stack - 1` is selected instead of `effect`.
Each index must contain the complete cumulative value for that stack; entries are
not added together. If another feature raises `maxStack`, enough `stackEffects`
entries must already exist for the larger cap.

An effect entry should canonically use `{ "requirement": [...], "effect": {...} }`.
Unwrapped effect objects are also accepted by the current evaluator.

A canonical wrapper containing only recognized, finite numeric damage fields is
eligible for lifecycle aggregation. The timeline updates that aggregate on
application, stack change, consumption, and expiration, and omits the extracted
wrapper from per-hit effect evaluation. Any requirement, dynamic value,
additional wrapper metadata, unsupported effect field, or modifier of the
definition's `effect`/`stackEffects` content keeps the complete rule on the
per-hit path. Authors should continue describing the mechanic normally in JSON;
the optimization does not require a data flag.

Damage effect fields `globalDmgBonus` and `globalHPDMGBonus` contribute to the
same additive global multiplier for every HP-damage component.
`globalBellstrikeDMGBonus` contributes to that global category only for the
Bellstrike component. These remain distinct from character attribute damage
bonuses such as `bellstrikeDmgBonus`; see `damage-formula.md` for the multiplier
order.

`dotDamage` is an additive DOT-only category. Active values are summed and
applied as a standalone multiplier to rows generated by a DOT definition; the
casting skill's direct damage is unaffected. Requirements on each effect entry
can further restrict the source by its martial-art or skill tags.

`defenseBonus` is a signed percentage adjustment to enemy defense, while
`physicalResistance` is a signed flat adjustment to enemy Physical Resistance.
Negative values reduce the corresponding enemy property. Cumulative
`stackEffects` must store the full adjustment at each stack index.

## Modifying an effect definition

Inner Ways and setup data can modify a named buff or debuff:

```json
{
  "target": "ThroatPierced",
  "modify": {
    "duration": 15,
    "maxStack": 5
  }
}
```

Scalar definition fields override the base definition. A `modify.effect` array
is appended to the base `effect` array rather than replacing it. Requirements on
the modification are checked before it is applied.

## Inner Ways

Inner Way files contain a display `name`, path eligibility `tags`, and an
`effect` map keyed by tier ID. They also require `altersTimeline`; true conservatively rebuilds the timeline,
while false allows priority removal to reuse baseline event state only when
combat events cannot change:

```json
{
  "name": "Morale Chant",
  "altersTimeline": true,
  "tags": ["StonesplitStrength"],
  "effect": {
    "MoraleChantT0": {},
    "MoraleChantT1": {},
    "MoraleChantT2": {
      "effect": [{ "rawStat": { "minPhys": 24.8, "maxPhys": 49.6 } }]
    }
  }
}
```

When a selected path declares `tag`, the Inner Way selector and
calculation pipeline include only definitions whose `tags` contain that value.
Mixed has no required tag and therefore exposes every imported Inner Way.

Weapon sets in `data/gear-set.json` and armor sets in `data/armor-set.json` use
the same path-tag convention. Only
matching definitions are displayed and applied outside Mixed; stored tiers for
hidden definitions are preserved. Every set declares `altersTimeline`. A true
value conservatively rebuilds comparison timelines for that set; a false value
reuses the baseline timeline and is valid only when every option changes
damage/stat evaluation without changing combat events or tracked state.
One set option may provide either one setup-effect object or an array of setup
effects. Arrays allow unconditional stats and action-time rules to coexist in
the same tier. An explicit empty `requirement` array is unconditional: its stat
fields belong to the character sheet, while damage fields remain action effects.
Rain Whisper four-piece uses one for its unconditional Critical DMG and Critical
Healing bonuses and a Shield requirement for the additional bonuses. Its
`altersTimeline` flag is true because healing can change overhealing and triggered events.

The set catalog includes all 12 weapon sets, 12 armor sets, and three bow/ring
sets from `local/datamine/wwm-item-sets-{weapon,armor,bow-ring}.json`. Two-piece
bonuses use the fixed level-96 tier, independently of equipped gear level.
Physical attack bonuses retain the exact datamined `77.8`, replacing the former
rounded `78` for Cleftpeak and Etherwrath; percentage bonuses retain the source ratios.
Armor bonuses add `39` Physical Defense (`physicalDefense`, not the Defense
attribute) or `2960` Max HP through `rawStat`. Max-HP sets rebuild comparison
timelines because HP can affect healing, overhealing, and triggered events.
Four-piece options include their two-piece stats exactly once. Implemented
four-piece effects and unresolved cases are listed in the
[weapon-set four-piece audit](weapon-set-four-piece.md). Deferred options
continue to provide only their two-piece stats.

Swallowcall is eligible for Bamboocut Wind, Infernal Twinblades, and Mortal Rope
Dart. Other existing eligibility tags are preserved; newly registered sets
without an assigned path retain empty tags. Bow/ring sets retain the functional names and persisted IDs `Precision`,
`Critical`, and `Affinity`, corresponding to Fletchlodge, Stringshock, and
Shadowchase, so existing builds and overrides retain their choices.

Selecting tier `Tn` activates every tier condition and rule from T0 through Tn.
Tier entries may contain:

- `effect`: passive stats, conditional action effects, or `target`/`modify`
- `trigger`: reactive actions evaluated on each damage action
- `listen`: post-formula damage listeners that can spawn parameterized
  `Replayed` skills

Reactive trigger example:

```json
{
  "target": "self",
  "requirement": [
    { "target": "skillTag", "value": "DirectDamage" },
    { "target": "self", "value": "YiRiver", "stack": 5 }
  ],
  "action": [{ "type": "trigger", "value": "MoraleChant" }]
}
```

Rules are processed in tier order on a damage event. Therefore an earlier-tier
trigger can apply a stack before a later-tier trigger checks the stack count on
the same event.

### Inner Way catalog coverage and Echoes of Oblivion

The catalog import uses `local/datamine/wwm-inner-way-normal.json`: all 56 named
records are registered, excluding unnamed ID 651. Existing IDs and combat
mechanics are retained. All T2 bonuses use the datamined Solo Level table; T5
bonuses remain fixed because the source supplies no level tables for them.
Battle Anthem uses the datamined 4% Affinity Rate at Solo Level 17, replacing
the previous fixed 4.1%.
Other tiers of newly imported records remain empty unless documented below.

The six requested path allowlists are stored in the existing `tags` arrays.
Memberships for Might, Strength, Deluge, and Kite are preserved. Definitions
without a path assignment remain accessible in Mixed. The four Draught records
now implement their datamined T2/T5 bonuses as described below.

Echoes of Oblivion (451) currently implements these confirmed effects using
existing conditional effects, tracked buffs, definition modifications, and
skill application actions:

- T0: normal Infernal Twinblades Light Attacks apply Sin after damage;
  Flamelash Light Attacks apply Karma instead. Each mark lasts three seconds,
  has one maximum stack, and refreshes on reapplication.
  Infernal Twinblades Light Attacks ignore 10% of Physical Defense while
  the target has Sin. The rule uses `martialArt: InfernalTwinblades`,
  `skillTag: Light`, and `defenseBonus: -0.1`.
  Against Karma, the same Light Attacks ignore 10 flat Bamboocut Resistance
  through conditional `bamboocutResistance: -10`. This affects only those
  attacks' Bamboocut damage, not other attacks or Judgment Resistance. The
  user confirmed this flat value at all tiers, including T6: T0/T1/T3/T4 text
  says 10, while the conflicting T6 main description says 10%. T6 inherits
  the existing T0 rule without adding a second reduction.
- T1: damage against a target with both Sin and Karma applies or refreshes
  Samsara after the hit. Samsara lasts 15 seconds and adds 5% HP damage.
  The duration comes from the catalog's English rank description.
- T2: Solo Level-based Critical Rate (9% at Solo Level 17); T5: fixed 4.4% Critical DMG Bonus, both `rawStat`.
- T3: both Perfect Dodge variants apply Samsara on the successful incoming attack when
  `EchoesOfOblivionT3` is selected. This uses the same conditional skill-action
  mechanism as their other Inner Way bonuses; the existing Infernal dodge
  duration talent extends this application to 21 seconds. While Samsara is active,
  T3 adds one Hellfire for each outgoing damage hit, including triggered attacks
  and DOTs. Expected probabilistic hits use the shared weighted resource-trigger
  behavior; sampled timelines grant it for actual emitted hits.
- T4: six definite damage hits within two seconds restore one Addled Mind
  charge, with a ten-second trigger cooldown. Addled Mind recovers each of its
  three charges independently after 15 seconds. This trigger reuses `clearCD`
  with `charges: 1` and can wake an explicit cast waiting for a charge. The
  dodge talent has its own separate 30-second cooldown.
- T6: Flamelash Light Attacks apply both Sin and Karma. This upgrades the
  existing T0 Sin trigger through a tier requirement without applying it twice.
  T6 also appends another 5% HP damage to Samsara, for 10% total, and triggers
  two extra Rodent attacks at FA5's first hit while Rodent Rampage is active.

Sin and Karma use the user-confirmed three-second duration and one-stack cap.
Their application rules require both the Infernal Twinblades martial-art tag
and the Light Attack tag; Heavy Attacks and other martial arts cannot apply
either mark. Flamelash can be applied by its activation skill or a manual Buff event;
Hellfire depletion ends the state. Manual Sin/Karma applications
also use the three-second expiration. Marks apply after damage; the later T1
trigger can observe marks applied by T0 on the same hit and grant Samsara,
which affects subsequent hits.

Bladebound Thread [Cancel] (牽繩引刃, RD Q) is Mortal Rope Dart's martial-art
skill. It casts in 0.385 seconds with an eight-second cooldown shared under
`BladeboundThread`. At 0.385 seconds it deals one hit with physical and attribute
coefficients 0.0621375, physical bonus 17.5, and attribute bonus 9.5, then applies
Vendetta Token to self. It carries `MartialArt` for the matching attunement.

Vendetta Token (仇殺令) is a ten-second, one-stack refreshing self buff. Its
Rodent-only `dmgBonus: 0.5` adds 50% general damage. The datamine's “Vendetta
Mark” means this same buff; there is no separate target mark or second status.

Vendetta (452) implements the following supported effects:

- T0: Rodent Rampage and Vendetta Token become 15 seconds total. The confirmed
  durations replace the misleading exported wording "15 seconds longer"; they
  do not add 15 to the base 10 seconds.
- T1: Vendetta Token becomes 20 seconds total, retained at higher tiers.
- T4: Rodent Rampage becomes 20 seconds total, retained at higher tiers.
  The user-confirmed duration applies without simulating Tokens of Gratitude.
- T2: Solo Level-based Min Physical Attack; T5: 5.1 Physical Penetration,
  both using existing raw-stat effects.
- T6: while Vendetta Token is active, Rodent attacks gain another 30% damage
  through `dmgBonus`. This adds to Token's 50% for an 80% general damage bonus.

All Tokens of Gratitude recovery, restoration, consumption, and T4 resource
calculations are intentionally ignored at the user's request. Rodent's Resilience
has the fixed 1.5-second charge described below. T6's enemy-healing reduction is outside the current
combat model.

Rodent's Resilience (`RodentsResilienceCharge`, source skill `20700101` in
`local/datamine/wwm-skills-normal-all.json`) represents the requested 1.5-second
hold, rather than the export's animation interrupt. It applies two stacks of
`RodentRampageEnhancement` at 1.5 seconds, using ordinary skill ping once before
the charge. The status is capped at two stacks, survives weapon changes, and
has no modeled expiration because the description supplies none. Rodent Rampage
consumes one stack when its summon applies at 0.541 seconds to apply the separate
Enhanced Rodent Rampage (ERR) buff instead of Rodent Rampage (RR). Without a
charge it applies RR. Recharging replenishes the status to two stacks.

ERR retains RR's coordinated light-attack accumulator and adds automatic Rodent
launches at +0.5, +1.5, ... seconds after application. Each Rodent lands 0.5
seconds later, at +1, +2, ... including the final hit at buff expiry.
Both buffs last 10 seconds without Vendetta, 15 at T0–T3, or 20 at T4–T6;
ERR therefore supplies 10, 15, or 20 automatic attacks over its full lifetime.
Its data-defined periodic actions trigger the existing Rodent skill, preserving
damage modifiers, Rodent Hunt recording, and Samsara's +1 Hellfire per hit.
Reapplying active ERR refreshes its full duration while preserving the original
automatic launch cadence; already launched Rodents retain their pending hits.
The extended window can include an additional launch depending on refresh timing.
Applying either RR or ERR consumes
the other buff, canceling its pending periodic actions. Light-attack triggers,
Rodent-only cancels, and FA5's T6 extras accept either buff. Automatic hits do not
advance the light-attack accumulator. Battle End still cuts off pending hits.
The three-second HP recovery and 4.5-second Qi recovery holds are outside this
fixed-duration skill.

T3 applies Rodent Hunt at Bladebound Thread's hit. This target effect records
Rodent damage for 20 seconds by default and pays out 30% on expiry. This user-confirmed duration overrides the Inner Way description mentioning 15 seconds; it does not require a duration extension. Reapplication settles
the previous window immediately, then starts a fresh window. Token refresh and
extension actions cannot delay its settlement. FA5's extra Rodent attacks count;
unrelated damage and settlement damage do not.

A timed effect's `recording` declares `event: "damage"`, a normal `requirement`
filter, and `action: { "type": "trigger", "value": "RodentHuntDamage" }`.
Its expiry action is `{ "type": "resolveRecording", "target": "target",
"value": "RodentHunt", "time": "expire" }`. Both expiry and reapplication call
the same resolver, which closes the activation before enqueueing its replay.
Each activation retains matching damage-entry IDs; the triggered `Replayed`
skill receives those references, and its `replay.coef` multiplies their resolved
sum. Empty windows produce no damage. Activation IDs prevent stale expiry
events from settling a replacement window. The window excludes hits at its
expiry timestamp; generated settlement damage obeys the normal combat cutoff.
Sky Gripped still records only its first eligible hit, using the same replay
calculation with a single source reference.

Run `npm run test:innerways` for registration/filtering, raw-stat channels,
attunement override separation, and the supported Echoes lifecycle checks.

### Solo Level stat tables

Inner Way raw-stat values may be a fixed number or an object containing
`bySoloLevel`, an array indexed by the actual Solo Level. Index 0 is unused;
`null` entries mean no bonus at that level. The source catalog arrays are
one-based in meaning: source index 15 is Solo Level 16 and source index 16 is
Solo Level 17. Runtime arrays prepend a null slot so selection uses
`bySoloLevel[soloLevel]` directly. Percentages remain decimal ratios.

Each breakthrough profile declares `soloLevel` separately from
`martialArtTalentRank`. Current breakthroughs 16 and 17 select Solo Levels 16
and 17 while both retain martial-art talent rank 13. There is no rank-based
fallback or interpolation for Inner Way bonuses.

`innerWayDefinitionForSoloLevel` resolves the tables without modifying the
imported definitions. Character stats, live rotations, preset comparisons,
and worker bundles all consume these resolved numeric `rawStat` effects.
Only one level's value contributes; cumulative Inner Way tiers still apply.
Null entries contribute zero, and missing or invalid levels are rejected.
Changing Solo Level refreshes the memoized rules and calculation inputs;
final-stat overrides remain exact through the existing override solver.

### Draught Inner Ways

The updated `local/datamine/wwm-inner-way-normal.json` supplies Eonpour (701),
Skyspeak (702), Mistwing (703), and Volutefit (704). Unnamed ID 651 remains
excluded. Each definition is eligible for `BamboocutDraught` and Mixed and
implements only T2 and T5 through the shared `rawStat` pipeline. T2 follows
the selected breakthrough's Solo Level. The following T2 examples are for
Solo Level 17; Eonpour instead grants 74.4 Min Physical Attack at Solo Level 16.

| Inner Way | T2                                    | T5                          |
| --------- | ------------------------------------- | --------------------------- |
| Eonpour   | +77.9 Min Physical Attack             | +4.6% Direct Critical Rate  |
| Skyspeak  | +8.1% Critical Rate                   | +4% Critical DMG Bonus      |
| Mistwing  | +23.3 Min / +46.7 Max Physical Attack | +2.5% Physical Damage Bonus |
| Volutefit | +14.7 Min / +29.5 Max Formless Attack | +6 Formless Penetration     |

Formless Attack uses the existing `minVoidAttack`/`maxVoidAttack` fields.
Raw Formless Penetration adds to the equipped path's primary attribute for
damage and, on Silkbind paths, healing. The displayed attunement total includes
this raw contribution; its calculation input excludes it to avoid double counting.
Tiers are cumulative, so T5 and T6 retain T2. T0, T1, T3, T4, and T6 contain no
additional mechanics.

## Raw-stat, stat, and effective-stat effects

`rawStat` contributes during `rawStats`, before martial-art scaling formulas.
Use it for permanent progression, gear, Inner Way character bonuses, arsenal,
two-piece sets, bow/ring sets, and martial-art flat min/max attribute attack.
Other martial-art bonuses remain `stat` or `effectiveStat` in the second pass.
An effect can contain both early and later fields; each is applied exactly once.
Conditional effects on temporary buffs remain `stat`, even when an Inner Way
modifies their definitions. `rawStat` does not make a temporary buff permanent.

`stat` and `effectiveStat` supply contributions to the owning stage of the
[stat snapshot pipeline](stat-pipeline.md). `stat` changes ordinary fields;
`effectiveStat` changes only their derived counterparts. Effective entries resolve
against the same ordinary snapshot, then their summed bonuses are applied before
range normalization and rate calculations. The complete snapshot retains these
additive inputs as `effectiveStatBonuses` so later stages can rederive fields
without losing them or adding them to ordinary stats. Food uses `effectiveStat`.
Martial-art talent
formulas read immutable `rawStats`, after flat attribute talents but before
later talent bonuses and food, including amounts
behind skill or combat conditions. Use ordinary raw source names such as
`minStonesplit`, not `effectiveMinStonesplit`, for those talents.

```json
{
  "stat": {
    "minPhys": {
      "formula": {
        "source": "agility",
        "multiplier": 0.264,
        "offset": 0,
        "max": 73.9
      }
    }
  }
}
```

Formula result:

```text
source × multiplier + offset
```

Optional `min` and `max` clamp the result. Optional `round` specifies decimal
places only when game data explicitly requires rounding. Formulas sourced from
base stats run after fixed base-stat effects. A source such as
`effectiveMinStonesplit` runs in a second pass after initial derived stats exist.

Formula-valued action effects, such as talent-added penetration on Iron Guard,
are resolved from the action's current base and derived character state.

## Periodic effects and DOT definitions

Any tracked buff, debuff, or DOT can declare periodic actions. The `periodic`
object keeps cadence separate from lifetime and stack behavior:

```json
{
  "Smolder": {
    "name": "Smolder",
    "maxStack": 1,
    "periodic": {
      "interval": 0.5,
      "firstTick": 0.5,
      "resetOnRefresh": false,
      "action": [{ "type": "damage", "phyCoef": 0.2787, "attrCoef": 0.2787, "phyBonus": 40, "attrBonus": 0, "time": 0 }]
    },
    "modifier": [],
    "tags": ["DOT", "Mystic"]
  }
}
```

`interval` must be positive. `firstTick` is the offset from initial application;
it defaults to `interval` and may be zero for an immediate trigger. Periodic
actions continue at `interval` steps through the resolved effect duration. An
effect without a duration schedules one upcoming tick at a time until removal
or combat end. A numeric resource action can declare `amountPerTick`; its
resolved amount is `amount + amountPerTick * zeroBasedTickIndex`. The index
follows the original cadence, resetting only when `resetOnRefresh` is true.
`resetOnRefresh: false` preserves the original cadence when a refresh extends
the effect; `true` starts a new cadence from the refresh timestamp. Consuming
the final stack or removing the effect cancels its remaining periodic rows.
Periodic rows from `player` effects retain their recipient: recipient zero heals
self, while every other copy heals one always-full teammate.

DOT definitions are periodic target debuffs tagged `DOT`. Their generated rows
remain DOT rows for damage rules and source-cast attribution. `apply.duration`
takes precedence over the DOT definition and effect definition. DOT rows are
interleaved globally with casts and triggered skills, and DOT damage ignores
flat physical and attribute bonuses.

DOT definitions currently use `refresh: false`, so a successful reapplication
does not reset their expiration or tick cadence. `extend` explicitly adds to the
current expiration and transfers future ticks to the extending cast. Ordinary
buff and debuff definitions use `refresh: true`. Surging Waves is the exception:
later stacks increase its stack count but all expire on the first stack's timer.

Delayed one-shot attacks use ordinary effect actions rather than `periodic`.
`"time": "expire"` resolves to the active effect's expiration and is exposed to
damage calculation as a numeric offset from the effect row. Toad Venom and
Lesser Toad Venom use this mechanism as five-second target debuffs without the
`DOT` tag. Toad Venom attacks at expiration and applies Lesser Toad Venom, which
attacks five seconds later. Reapplication before expiration is ignored, so it
neither refreshes the timer nor schedules another attack.

## Rotation records and events

```ts
type RotationRecord = {
  name: string;
  eventTimeReference?: "battleStart";
  steps: Array<
    | { type: "skill"; skill: string; duration?: number }
    | { type: "event"; event: "Delay"; duration: number }
    | { type: "event"; event: "Exhausted"; after: AttachedEventTarget; duration?: number }
    | { type: "event"; event: "Move"; before: AttachedEventTarget; distance: number }
    | { type: "event"; event: "SelfHP"; before: AttachedEventTarget; currentHP: number }
    | { type: "event"; event: "TakeDamage"; startTime: number; damage: number }
    | { type: "event"; event: "HP"; before: AttachedEventTarget; targetHPRatio: number }
    | { type: "event"; event: "Qi"; before: AttachedEventTarget; targetQiRatio: number }
    | { type: "event"; event: "Buff"; before: AttachedEventTarget; buff: string; stack?: number }
    | { type: "event"; event: "Debuff"; before: AttachedEventTarget; debuff: string; stack?: number }
    | { type: "event"; event: "MartialArt"; before: { action: "start" }; martialArt: WeaponId }
    | { type: "event"; event: "Controlled" | "ShieldBroken" | "BattleEnd"; startTime: number; duration?: number }
  >;
  start?: { step: number; action?: number };
};

type RotationPreset = RotationRecord & {
  martialArts: WeaponId[];
  test?: boolean;
};

type AttachedEventTarget = {
  action: number | "start";
  trigger?: number;
};
```

Skills with `editableCastTime: true` expose a duration input in the rotation
editor. The skill step's optional finite, nonnegative `duration` replaces base
cast time before timing modifiers; omission uses the skill's ordinary cast time.
The field survives save, duplication, export, and import.

Skill steps and `Delay` events are placed sequentially. A Delay starts when the
preceding cast ends, advances every later sequential step by its nonnegative
`duration`, and applies no action or effect. A trailing Delay still extends the
rotation duration. `Move`, `SelfHP`, `HP`, `Qi`, `Buff`, `Debuff`, `MartialArt`,
and `Exhausted` are action-attached events and must be stored immediately before
their target skill. The first seven use `before`; Exhausted
uses `after`. The attachment's
`action` is a zero-based action index in that skill; `"start"` is valid for
before-attached events and targets cast start. When `trigger` is present, it is the
zero-based ordinal of a `trigger` action declared by the target skill, and
`action` selects an action inside that triggered skill. Move resolves before its
target; Exhausted resolves after its target, so the breaking hit does not receive
Exhausted bonuses while subsequent hits do. The editor displays these zero-based values as one-based action and
trigger numbers internally, but attached-event rows do not expose those indices
as editable text. Their up/down controls move the attachment through skill
starts (for before-attached events), direct damage actions, and declared triggered-skill damage
actions in effective timeline order. Exhausted skips skill-start targets. Moving to an action expands its owning skill so the
attachment and target remain visible together; leaving that skill collapses the
auto-expanded action list. When multiple events share the same skill, action,
trigger, and before/after phase, the controls first reorder those events before
moving beyond that attachment target. Their stored array order is their execution
order at the shared timestamp. The editor preserves the attached-event row's visual
scroll position while moving it. A newly inserted skill receives focus, and
converting it to an attached event targets the following skill.

The Martial Art event is restricted to `{ "action": "start" }`; it cannot
target a skill action or a triggered action. Its editor control appears in the
Damage column and can select either equipped martial art. It switches the
current martial art and derives the current physical weapon immediately before
the target cast without consuming time. The initial state uses the left martial
art. A later castable `MartialArts` skill may switch it again automatically.

Perfect Dodge uses `currentWeapon` requirements to trigger one of the six
weapon-tagged Ghostly Step - Umbra Dodge definitions. This lets its Mystic
damage inherit the physical weapon used before the dodge without turning the
dodge itself into a martial-art skill.

Bundled rotation JSON records declare the martial-art IDs they use in
`martialArts`. The Rotation Editor shows a preset only when those tags match the
current weapon selection. The all-tagged empty rotation uses `test: true`, so it
is bundled but hidden until the header-level Dev toggle is enabled.

With `eventTimeReference: "battleStart"`, timed encounter events, including
Take Damage, use a `startTime` relative to the selected fight start and consume
no cast time.
`Exhausted` and `Controlled` take their default durations from their debuff
definitions. Each event's editable `duration` overrides that default.
`ShieldBroken` consumes the general player `Shield`. When Art of Resistance T6
is selected, its following action applies the 12-second Hardened Foe buff.
`BattleEnd` has no action and excludes damage ordered after it; it also fixes
the rotation duration at that timestamp.
The Rotation Editor skill selector offers skills from the currently selected
weapon categories plus Mystic and General. Triggered skills remain excluded.
An existing step from another martial art is preserved and marked unavailable
until the user replaces it or restores a compatible weapon selection.
Distance starts at 1m. An attached `Move` event changes it to its integer
`distance` immediately before the selected action. An attached Exhausted event
applies at the same timestamp immediately after the selected action. Timeline rows store
cast-start distance, while every action stores its own distance snapshot.
An attached Self HP event sets absolute `currentHP` immediately before its
target. A timed Take Damage event subtracts from the current value and can fire
setup triggers such as Revelry Script. Buff and Debuff events select a definition from their respective data
directories and apply it before the target using that definition's duration.
Buff and Debuff events may specify a positive integer `stack`; omitted values
apply one stack, and tracked-effect resolution caps the result at the selected
effect's resolved `maxStack`. The editor applies unconditional Inner Way
definition modifiers for the active build when choosing and validating this
stack count, matching the cap used by timeline calculation.
Distance and HP columns are hidden unless the rotation contains their event or
a skill tagged `Distance`/`HP` respectively.

Bundled mixed-dummy rotations include fight-relative movement events for Flute
distance modeling. They open at 19m, enter the first Fleeting Trace at 3m, then
return to 1m. Every Burning Heart cast moves to 6m for its first Anxi Soldier,
4m for its second Anxi Soldier, and 2m for its first damage action; consecutive
Burning Heart sections reset to 1m after their final cast.

### Dynamic effect values

`segment` maps a numeric parameter through ordered exclusive upper bounds:

```json
{
  "function": "segment",
  "param1": "distance",
  "param2": [2, 3],
  "param3": [0.02, 0.03, 0.04]
}
```

For each threshold `param2[n]`, a parameter strictly less than that threshold
uses `param3[n]`. A parameter equal to or greater than the last threshold uses the final
`param3` entry, so `param3` must contain one more value than `param2`. Flute
uses `[2, 3, 4, 5, 6, 7, 8, 9]` for its distance-based `dmgBonus`: 2% below 2m, 3% from 2m to below 3m, and so on.

Stat and effective-stat effects use the same function with character-stat
parameters and explicit thresholds:

```json
{
  "function": "segment",
  "param1": "maxHp",
  "param2": [5000, 10000, 15000],
  "param3": [0, 4, 8, 12]
}
```

This example returns 0 below 5,000 Max HP, 4 from 5,000 to below 10,000, 8 from
10,000 to below 15,000, and the final value from 15,000 onward. Setup effects
with a `requirement` remain per-action rules: the worker resolves them against
the damage action's tags and state, and they are excluded from the global
character-stat display. Timing values can likewise use action-time thresholds:

```json
{
  "function": "segment",
  "param1": "actionTime",
  "param2": [1.5, 2.5],
  "param3": [-0.7, -1, -1.2]
}
```

`actionTime` resolves independently for the skill's original cast time and each
original action time before timing modifiers are applied. Thus a segmented
`castTimeModifier` may adjust early and late actions by different amounts.
Damage effects and damage-action `phyCoef`/`attrCoef` may similarly segment the current `distance` parameter in both expected and sampled calculations. Rodent coefficients use `[12]` with `[0.348974526316, 0]` for the nonmatching PvE route. Dragon's Breath retains its inclusive first-hit timing through the equivalent exclusive bound `1.2729253500000002` (the next representable number after `1.27292535`). Its Intoxicated modifier subtracts the difference between each route's corresponding hit times rather than a rounded shared latency allowance.

`switch` selects a value from an explicit keyed table. `param1` names the
timeline-state value to inspect, `param2` maps possible values to results, and
the optional `fallback` is used during initial row expansion or when
no case matches:

```json
{
  "function": "switch",
  "param1": "currentWeapon",
  "param2": {
    "HengBlade": 0.5,
    "Gauntlet": 0.5
  },
  "fallback": 0.5
}
```

A switched `castTime` is resolved from `currentWeapon` when the cast starts and
is then locked for that cast. The fallback supplies the initial row
estimate before timeline events have established the weapon state. Actions may
also use a switched `value` with `"resolveAt": "skillStart"`; Perfect Dodge
uses this to select one weapon-tagged Ghostly Step - Umbra Dodge definition
without repeating one trigger action per weapon.

General Deflect uses this weapon-time switch. Gauntlet Deflect is measured at
`0.3` seconds; the other weapon cases retain the shared `0.338`-second
placeholder until their individual timings are measured.

Successful Deflect and both Perfect Dodge variants declare an `attackResponse`
window (see Incoming-attack response windows below). Incoming damage inside an
active window resolves to zero without take-damage triggers. Perfect Dodge
Cancel keeps the normal dodge window while allowing the next cast to begin.
Ordinary Deflect remains an animation cancel without protection.

`multiply` multiplies a dynamic parameter by a scalar:

```json
{
  "function": "multiply",
  "param1": "missingHPPercentage",
  "param2": "0.0045"
}
```

Numeric strings are accepted for the scalar. `missingHPPercentage` converts the
hit-time HP ratio to percentage points, so 20% missing HP resolves this example
to `20 × 0.0045 = 0.09`. Dragon Head - Tide receives this always-active rule
from its `global: true` definition in `data/buff/mystic.json`.

The optional start record identifies the default rotation step and action used
as time zero. In memory, the UI converts this to a timeline row ID and optional
action index. Omitting `action` means the skill's cast start; providing it means
that exact zero-based action index. Base-skill damage actions are collapsed in the Rotation Editor by
default and can be revealed per skill. A triggered skill does not receive its
own row; its damage actions are associated with the base skill that caused the
trigger and follow that base skill's expand/collapse state. DOT damage is
associated with the cast that applied it; future ticks transfer to a cast that
refreshes or extends it. DOT ticks follow that owning base skill's expansion
state, including nested DOT applications such as Lesser Toad Venom. The base
skill containing the starting action opens initially, and that action remains
visible if the skill is collapsed. Preset rotations render skill names and event times as plain
labels; custom rotations render editable selectors and inputs. Pre-start
actions remain visible when their row is expanded,
but their damage cell is empty.

### Readable rotation format

The Rotation Editor's Readable Format dialog renders the effective base-skill
sequence as `Short Name > Short Name > ...`; a skill without `shortName` falls
back to its long name. The native modal dialog makes the editor inert until the
dialog is closed and provides both selectable text and a Copy button.

- The starting skill uses `(start)`, or `(start at hit N)` when the anchor is a
  damage action. Hit numbers are one-based and count damage actions only.
- A skill containing an `Exhausted` event, or carrying `causesBreak`, uses
  `(break)`.
- Skills before the fight anchor use `at N`, where `N` is seconds before start
  rounded to the nearest 0.5 seconds.
- Starting status takes precedence over break status, which takes precedence
  over the pre-fight countdown.

### Rotation export and import

The Rotation Editor sidebar exports all custom rotation records as a formatted
JSON file with the `where-builds-meet-rotations` format identifier and schema
version 8. Versions 1 through 7 remain importable; legacy attached Take Damage
events migrate to fight-relative timestamps, and legacy Exhausted `before`
attachments migrate to `after`. The snapshot includes each custom rotation's `martialArts`
eligibility and the current in-memory editor value, even before the Save button
is pressed. Bundled default rotations are discovered from
`data/rotation/**/*.json` and reconstructed from their JSON sources rather than
saved in browser storage or exports. They are read-only in the editor; Duplicate
creates an editable custom copy.

Import validates every step and appends custom rotations to the saved rotation list
without replacing existing rotations or changing the active rotation. ID
collisions are remapped, and bundled default rotations are skipped to prevent
duplication. The first imported rotation is opened for review but is not made
active automatically. Importing the same file again creates another independent
copy of its custom rotations.

## Data conventions

Weapon-set effects may listen to a resolved damage outcome without applying an
ordinary timeline buff:

```json
{
  "trigger": {
    "event": "damageOutcome",
    "outcome": "affinity",
    "action": {
      "type": "apply",
      "target": "self",
      "value": "Hawkwing",
      "stack": 1,
      "reapply": true
    }
  }
}
```

The referenced buff definition supplies its duration, maximum stack, and per-stack
effect. This trigger is resolved by the damage-sequence outcome tracker rather than
the ordinary action-time `damage` trigger pipeline.

An outcome-triggered Inner Way may accumulate a decaying resource before
applying a regular buff:

```json
{
  "event": "damageOutcome",
  "outcome": "affinity",
  "target": "self",
  "resource": {
    "name": "Focus",
    "gain": 1,
    "decayRate": -0.25,
    "threshold": 4,
    "resetTo": 0
  },
  "action": [
    {
      "type": "apply",
      "target": "self",
      "value": "Concentration",
      "stack": 1,
      "reapply": true
    }
  ]
}
```

Focus decay begins from the previous damage timestamp. The Affinity outcome is
resolved after the current hit; reaching the threshold therefore affects only
subsequent hits. `resetTo: 0` is required and makes conversion consume all
Focus. The referenced buff supplies the duration and Affinity DMG Bonus.
Concentration is defined in `data/buff/bellstrike-umbra.json`; its expected
pre-hit activation probability is exposed as a fractional average stack and
rendered through the same synthetic buff-plate path as Hawkwing.

Insightful Strike T1 grants `0.015` Damage Bonus while self HP is above 75%.
At or below 75%, it instead exposes `leech: 0.015`, meaning intended recovery
equal to 1.5% of damage dealt. `leech` is currently retained as data only and
does not recover HP until damage-based healing is implemented.
Insightful Strike T2 adds 22.3 Min Physical Attack and 44.7 Max Physical
Attack through the shared stat-effect pipeline.
Insightful Strike T3 modifies Concentration to add `0.015` Direct Affinity and
another `0.015` while self HP percentage is strictly greater than target HP
percentage. The second rule uses the generic `compareTo` requirement operand,
so both percentages are read at the current hit. A rotation without preset
target maximum HP supplies the stable implicit target state of 99%.
Insightful Strike T4 modifies the Focus outcome resource's gain from `1` to
`1.5` per Affinity outcome. The modifier is resolved before both deterministic
probability tracking and concrete simulation tracking.
Insightful Strike T5 adds 5.1 Physical Penetration through the ordinary
calculation-time penetration effect.
Insightful Strike T6 grants 10% Damage Bonus to skills tagged `DOT` or
`DOTEmpowered` through an explicit OR tag requirement.

A numeric requirement normally compares its resolved target with `amount`. It
may instead use `compareTo` with another numeric runtime state such as
`targetHPPercentage`; both operands are resolved at the requirement timestamp.

- Use decimal ratios for percentages.
- Keep IDs stable and put display text in `name`/`description`.
- Use `action` for timeline changes and `modifier` only for cast-start changes.
- Keep action times ordered and represent repeated casts as repeated rotation
  steps.
- Use `duration` for lifetimes and extension amounts; do not use `extension`.
- Prefer explicit requirements over hard-coded skill-ID checks.
- Give every direct skill `DirectDamage` and every DOT definition `DOT`.

### Bellstrike Splendor definition status

Nameless Sword's Qi Struggle Enhancement records `0.1` Qi DMG Bonus, which remains
inactive until Qi damage is simulated. Sword Energy attacks gain `0.02` HP damage
per 100 Max Physical Attack, capped at `0.2`. Physical Attack Up converts Momentum
to Max Physical Attack at `0.264` per point, capped at `73.92`.

Sword Qi Affinity Enhancement applies only to `SwordEnergy` attacks when target Qi
is below 40% or Qi Imbalance is active. It grants `0.00012` Affinity DMG Bonus per
Max Physical Attack, capped at `0.18` at 1500. Bellstrike Attribute Up grants 98
Min and 196 Max Bellstrike Attack, then grants Bellstrike Penetration from resolved
raw Max Bellstrike Attack at `0.0336` per point, capped at 22.

Nameless Spear's Affinity Rate Up converts Momentum to Affinity at
`0.000152` per point, capped at `0.04256`. Max Endurance Up grants 10 Endurance,
then one more for every complete two percentage points of Affinity above 10%, up
to another 10 at 30%. The Endurance segment reads raw Affinity, excluding the
separate talent's Affinity bonus, under the shared talent-stage contract.

Affinity DMG Up grants `0.6` Affinity DMG Bonus per point of Affinity, capped at
`0.18` at 30%, while Endless Gale is active or Endurance is below 60%. The
`endurancePercentage` requirement is stored for the latter condition but remains
inert until Endurance state is simulated. Bellstrike Attribute Up grants 98 Min
and 196 Max Bellstrike Attack, then grants Bellstrike DMG Bonus from resolved Max
Bellstrike Attack at `0.000168` per point, capped at `0.11`.

### Stonesplit Might definition status

The WIP Stonesplit Might data declares Thundercry Blade and Stormbreaker Spear
skills, buffs, Vulnerable, weapon talents, Exquisite Scenery, Art of Resistance,
and Formbend. Avalanche uses the datamined charge-relative timings described
below. Other reference cast durations are 1s for Stonebreaker Cleave, 1.6s for Thunder Shock, 1s for Storm
Roar, and 1s for Predator's Shield. Thunder Shock hits at 0.4s and 1.2s; its
cancel variant ends after the first hit at 0.4s. Until other per-hit timing is
available, every remaining multi-hit Might skill places its hits at cast end.
At each Thunder Shock timestamp, damage resolves before its following
Vulnerable application: hit one cannot benefit from its own application, while
hit two sees the debuff from hit one and then refreshes it.

Avalanche has a 1.85-second charge followed by a 1.545-second release animation,
for a full cast of 3.395 seconds. Its datamined hit offsets are measured from
charge completion: 0.318 and 1.000 seconds, stored as 2.168 and 2.850 seconds
from cast start. Riposte removes the 1.85-second charge, preserving the
1.545-second release and the 0.318/1.000-second hits. The one-hit cancel variant
retains its separately authored 2-second charge: it ends at 2.318 seconds
normally or 0.318 seconds with Riposte.

| Hit | Physical coefficient | Physical bonus | Attribute coefficient | Attribute bonus |
| --- | -------------------: | -------------: | --------------------: | --------------: |
| 1   |              1.94838 |            539 |               1.94838 |          293.65 |
| 2   |           2.87636556 |        795.718 |            2.87636556 |        433.5113 |

Defense holds for its rotation step's entered duration (default 0.3 seconds).
It grants no effects at cast start. Every positive incoming attack during the
hold is blocked and triggers Defense (Successful), which first attempts Riposte
and then grants one Cadence stack when Exquisite Scenery T0 is selected. A paired
dummy attack therefore grants Riposte plus two Cadence stacks when ready.
Cadence lasts 20 seconds and stacks twice; applying Cadence alone does not trigger
Riposte. Riposte lasts five seconds and has a 10-second cooldown. An accepted
Riposte application consumes one existing Cadence stack, if any, and starts the
hidden Riposte Trigger wait. At the end of that wait, remaining Cadence can grant
Riposte again. A failed attempt ends the chain; a later successful defense can
restart it. Exquisite Scenery T4 reduces both the cooldown and wait to five seconds.
Cadence expires before conversion at its exact expiration timestamp. Riposte
removes Avalanche's authored charge time and is consumed when
Avalanche starts. Might's dummy preset uses paired incoming attacks and authored
Defense durations ending 0.1 seconds after impact, without manual Cadence or Delay
events. Its intended defended pairs are at 5.5, 17.5, 23.5, 29.5, 41.5, and
53.5 seconds. The opening Stonebreaker Cleave uses its one-hit cancel variant.
Battle Start is anchored to the opening Avalanche's first damage hit, at 2.168
seconds into the cast. At the preset's 30 ms ping, the first Defense begins at
5.476 seconds and holds for 0.124075 seconds, ending at 5.600 seconds. All six
holds are authored against this first-hit battle clock.

Battle Anthem and Adaptive Steel are alternative Stonesplit Might Inner Ways.
Breaking Point is also available to both Stonesplit Strength and Stonesplit
Might through its path tags.
At T6, both Perfect Dodge variants trigger `BreakingPointT6Dodge`, which applies
five Disintegration stacks and has a 15-second skill cooldown. Only this proc
shares the cooldown across dodge variants; dodge timing and other dodge effects
remain independent. Disintegration itself has no application cooldown, so normal
Breaking Point stack generation remains available throughout the proc cooldown.
Battle Anthem adds 10% Charged Skill damage at T0, 3.9% Affinity at T2, and a
further 5% Charged Skill damage at T4. Its T6 damage scaling is stored as a
segment over `enduranceLost`, from 0% below 10 lost Endurance through 10% at 50
or more; `enduranceLost` is not yet supplied by the calculator, so this tier is
currently inert. Adaptive Steel adds 20% Charged Skill Critical DMG at T0, 38
Max Bellstrike Attack at T2, and 3% Bellstrike DMG Bonus at T4.
Exquisite Scenery T6 adds 50% Base DMG Bonus to attacks carrying either Light
or Heavy together with either Charged or Varied Combo. The four explicit tag
combinations keep the rule from affecting an attack tagged with only one half
of a category. Its `baseDMGBonus` is a separate multiplier from ordinary
`dmgBonus` effects.

Attunement effects match every entry in `effect.tags`. A string requires that
tag; a nested array requires at least one tag from that array. For example,
`["InkwellFan", ["Special", "Pursuit"]]` matches Inkwell Special or Pursuit,
while `["HeavenwillGauntlets", "VariedCombo", ["Light", "Heavy"]]` requires a
Light or Heavy Varied Combo. Matching both alternatives applies the bonus once.
Both damage and healing use the shared `attunementMatchesSkill` matcher.
An action is rejected when any entry in `effect.excludeTags` appears. This
keeps general combat tags intact when an individual attunement has a narrower
scope. Stonebreaker Quake remains tagged `Charged` for other mechanics but is
excluded from Thundercry Blade's Charged Skill DMG Boost.

Panacea and Soulshade Martial Art healing attunements require singular
`MartialArt`. Cloudburst Healing (Fan Q), Endless Cloud (Fan QQ), their cancel
variants, and Floating Grace (Umbrella Q) carry that tag. Special and Heavy
healing retain broad `MartialArts` but do not receive these attunements.

Might actions explicitly use equal `phyCoef` and `attrCoef` for physical and attribute damage.
Thundercry Blade's Max-HP talents use segmented stat/effective-stat values and
per-action tag requirements. Its Critical talent contributes to Effective
Critical after Judgement Resistance and before the 80% Effective Critical cap;
it does not use the separate Direct Critical channel. Predator's
Shield uses the shared definition in `data/buff/general.json`; applying it
refreshes its base lifetime before its tier-based extensions are applied.
The General skill AoR T4 Shield has a three-second cast, applies that shared
Shield at cast start with a 14-second duration, and extends it to 16 seconds
when Formbend four-piece is selected.
Drumbeat independently grants 15% Charged Skill damage for six seconds and is
converted into the separate 42% Charged Skill damage buff Breakthrough by
Predator's Shield. Breakthrough uses its own 12-second base duration. Art of
Resistance T0 extends both Shield and Breakthrough by four seconds, T4 extends
both by another two seconds, and Formbend four-piece extends both by another
two seconds. Art of Resistance is an Inner Way rule requiring that
Shield: T3 adds 5% general
damage and cumulative T6 adds another 5%. The Shield Broken event consumes the
Shield and, at T6, applies the 12-second, 10% Hardened Foe buff. Predator's
Shield consumes Hardened Foe before applying a fresh Shield. Formbend is an
armor set available to Stonesplit Strength and Might. Its four-piece option
adds the `FormBend4` setup condition; Predator's Shield checks that condition
and extends the refreshed Shield and Breakthrough by two seconds.

Divinecraft definitions use the same direct setup-effect shape as food and set
effects. Percentage values remain decimal ratios. `hpDMGBonus` is active, while
`qiDMGBonus` remains stored for future implementation. A setup trigger with
`event: "heal"` runs its resource action after a healing action resolves and may
declare its own cooldown. Fire-Water and Poison-Water restore `0.8` Vitality;
Water-Fire and Water-Poison restore `1`, each at most once every three seconds.
These four choices alter resource state, so comparisons rebuild the timeline
when either the baseline or candidate uses one.

Script definitions also use direct setup effects. Wraithstrike, Voidrot,
Convergence, Opportunity, Detachment, and Insight use action-time HP/Qi or skill
tag requirements. Revelry declares an `event: "takeDamage"` trigger. After the
event subtracts damage, the trigger checks `selfHPPercentage <= 30` and applies
the 20-second Revelry buff. Its data-defined 60-second cooldown prevents another
application until the cooldown expires. Revelry is marked `altersTimeline`;
Script comparisons rebuild when either the selected baseline Script or the
candidate Script has that flag. Damage-only Script comparisons reuse the
baseline timeline.

Envigorated Warrior's `healingBonus` increases the final combined healing of
matching actions alongside its separate active `dmgBonus` effect.

Royal Remedy T0 grants Cloudburst Healing, including its cancel variant, `0.1`
general Healing Bonus. T1 reacts to every `heal` action from a skill tagged
`CloudburstHealing` and restores `2` Vitality, so all seven Fan Q heal ticks
grant the resource independently. T2 adds Solo Level-based Critical Rate (9% at Solo Level 17) and
T5 adds `0.046` Direct Critical Rate. Seasonal Edge T2 adds Solo Level-based
Physical Attack (25.9 Min and 51.9 Max at Solo Level 17), while T5 adds `0.028` Physical DMG Bonus.
The T2 and T5 bonuses are unconditional stat effects resolved by the shared
character-stat pipeline. Every Inner Way T2 and T5 stat bonus uses this form
and appears in the appropriate Stats-page total. Physical Penetration is
included in Attunement Stats, while Physical Resistance remains
calculation-only and is intentionally omitted from the page.

Panacea Fan converts Agility to Critical Rate at `0.000304`, capped at
`0.08512`. Heavy-tagged healing stores a separate `0.05` base Healing Bonus plus up to
`0.25` from Min Physical Attack at `750`. Its Silkbind Attribute talent adds
`98` Min and `196` Max Silkbind Attack, then derives both Silkbind DMG Bonus and
the recorded `silkbindHealingBonus` stat at `0.000336`, capped at `0.11`.

Soulshade Umbrella grants Mystic-tagged actions `0.2` DMG Bonus while Panacea
Fan is equipped. It converts Agility to Min Physical Attack at `0.264`,
capped at `73.92`. Special-tagged healing stores a separate `0.05` Critical Healing Bonus
plus up to `0.25` from Min Physical Attack at `750`. Its Silkbind Attribute
talent adds `98` Min and `196` Max Silkbind Attack and derives Silkbind
Penetration at `0.0672`, capped at `22`. Healing and Critical Healing effects
are resolved at each heal action's timestamp.

## Fivefold Bleed and chance-applied DOTs

Fivefold Bleed (極樂泣血) is available to Silkbind Deluge. T0 listens to damage
tagged `DirectDamage` and applies Weeping Blood (泣血) to the target with
an action-time switched `chance`: 10% at T0–T3 and 15% at T4–T6. DOT ticks are not tagged
`DirectDamage` and cannot proc it.

The existing `switch` value format is supported for action `chance`:
`{ "function": "switch", "param1": "FivefoldBleedT4", "param2": { "true": 0.15 }, "fallback": 0.1 }`.
Chance evaluation exposes active tier/setup conditions as boolean parameters
alongside the current requirement-state values. Since tiers activate cumulatively,
T5 and T6 also select the T4 case. The selected finite numeric chance is clamped
to 0–1 and used by both the expected tracker and simulation rolls. Invalid values
are rejected rather than silently treated as guaranteed procs. T4 needs no second
trigger or trigger-ID modifier. Numeric chances, including T3's 20%, are unchanged.

T1 adds `baseDMGBonus: 1` to the `PiercingDamage` skill tag, doubling its base
damage without changing its coefficient. This affects both threshold and
expiration bursts. T2 adds `rawStat.maxPhys: 62.3` through the shared stat pipeline.
T5 adds `rawStat.critDmgBonus: 0.035` (3.5 percentage points of Critical DMG Bonus)
through that same pipeline, applying to all damage rather than only Piercing
Damage. It does not increase Critical Rate or Critical Healing Bonus.
T3 modifies Weeping Blood's actions to add
`{ "type": "trigger", "value": "PiercingDamage", "chance": 0.2, "time": "expire" }`.
This rolls once per naturally expiring DOT, not per stack. Refreshes invalidate
the previous expiration schedule, including repeated same-timestamp refreshes;
removal and five-stack consumption do not fire the expiration action. Natural
expiration is recognized before pruning at its clock boundary, so unrelated
same-timestamp actions cannot erase it.

The expected tracker groups active branches by expiration time and damage owner.
For Fivefold Bleed that owner is always its Inner Way group, not the applying cast.
One internal wakeup per effect tracks the earliest live list-head expiry. When it fires,
the current probability weights the normal effect-action executor, whose trigger
action applies the 20% chance. Matching owners are resolved together, then the next
expiration is scheduled. Applications update the pending wakeup without rebuilding
all future expiry schedules.
Expiration checks themselves produce no timeline rows. Threshold-consumed branches contribute no
expiration probability. Simulation rolls the expiration trigger using the same
per-run memoized random source as chance applications.

Weeping Blood lasts five seconds and refreshes the shared duration while
building stacks. Reaching five consumes every stack and triggers Piercing Damage.
In simulation, `periodic.resetOnRefresh: false` preserves the original tick cadence. Its first
tick is at 1.01 seconds and subsequent ticks are one second apart: an isolated
application ticks at 1.01, 2.01, 3.01, and 4.01. Reapplication at 1.51 seconds
expires at 6.51, with its next tick still at 2.01. After expiration, a new
application starts a new cadence. Weeping Blood's `periodic.tickOnExpire: false`
excludes a tick at its exact expiration timestamp. Other periodic definitions
retain their existing inclusive endpoint unless this field is explicitly false.

Weeping Blood also declares `periodic.expectedTickAlignment: "battle"`. In expected
calculations only, all branches share tick boundaries at battle seconds 1, 2,
and so on (the configured interval). A new application waits for the next strictly
later boundary, including an application exactly on a boundary. Refreshes preserve
the next tick. Each boundary emits one row weighted by the probability of eligible
active branches, not their stack counts. Natural expiration contributes no tick
at its timestamp. The shared tick grid itself does not round expiration times.
Expected shared-clock states below `1e-5` probability can separately merge with
same-stack, same-owner states in the same 0.1-second expiration bucket, using
their weighted mean expiration. This runtime approximation preserves probability
mass but may change later refresh/trigger timing; it does not apply to simulation
or exact-cadence DOTs. See [the merging design](rotation-event-loop.md#tiny-expected-state-merging).
There are no partial ticks.
This intentionally approximates DoT damage timing and downstream DoT-sensitive
effects. Other DOTs keep their existing cadence unless explicitly opted in.
Simulation ignores the alignment option and tiny-state merging. Combat cutoff
comes from Battle End or completion of the last ordered item.

All DOTs deal one copy of their authored damage per active tick, independent of
stack count. Weeping Blood's tick has only `phyCoef: 0.02`; absent `attrCoef`,
`phyBonus`, and `attrBonus` contribute zero. The former `periodic.stackDamage`
field is removed. Saved overrides drop it while preserving its former exclusive
expiration endpoint via `tickOnExpire: false` when needed.

Its data-defined `onMaxStack: { "consume": "all", "trigger": "PiercingDamage", "triggerTags": ["WeepingBloodMaxStack"] }`
is handled within the shared application handler, before storing a capped effect.
The handler removes the effect and its pending periodic events, then queues the
triggered skill at the application timestamp. Subsequent events cannot observe
five stacks. Already resolved ticks are not undone; pending ticks at the same
timestamp are cancelled. The next application starts at one stack with a fresh
1.01-second first-tick delay in simulation, or the next shared boundary in expected
calculations. Overflow produces one burst and consumes all stacks.
Effects without `onMaxStack` retain their existing cap/refresh behavior.
Optional `onMaxStack.triggerTags` adds tags only to the spawned skill instance,
so ordinary skill-tag requirements can distinguish threshold bursts from other
uses of the same skill. The shared skill definition is not modified.

Piercing Damage (刺傷) is a zero-cast-time triggered skill with `phyCoef: 1` and
no attribute coefficient or flat bonuses. It is tagged `DirectDamage`, not DOT,
so every burst rolls the ordinary Weeping Blood application chance. T6 adds an
ordinary damage trigger matching `WeepingBloodMaxStack` that guarantees one stack
after a five-stack consumption burst only. That burst has the guaranteed stack
plus the independent 15% Direct Damage chance at T6. A T3 expiration burst has
only the Direct Damage chance, with no guaranteed T6 stack. New applications
after consumption or expiration start a fresh simulation cadence, or join the
next expected grid boundary.
Expected threshold branches reset to zero and queue the same
skill with their summed probability as both damage and hit weight; branches not
reaching the threshold retain their normal expiry and cadence. The supported
expected threshold payload is a damage-only triggered skill without a cooldown.

The tracker temporarily identifies the branches that produced each burst. Its
post-hit applications affect only those branches, using conditional chances
rather than multiplying the burst probability a second time. This preserves
the correlation between consuming or expiring a DOT and reapplying it. T3 can
repeat after the renewed DOT expires, but rolls its 20% chance each time.

Feedback is bounded by Battle End when present. Otherwise combat ends when the
last ordered skill finishes casting, or the final explicit Delay completes.
Same-time final damage and its causal follow-ups are included; later DOT ticks,
expiration bursts and other feedback are dropped. These generated events never
extend the window. Battle End excludes damage at its timestamp. The
[incremental event loop](rotation-event-loop.md) needs no feedback-suppressed
preliminary timeline to discover this endpoint.

Chance applications extend the existing trigger and periodic scheduler rather
than creating an Inner-Way-specific event pipeline. The supported expected-state
case is a refreshing target DOT applied by non-DOT damage with a preserved
cadence. Its tracker merges states with equal stack count, expiry, damage owner,
and temporary branch identity. Each merged state retains absolute probability
weights for its different next-tick timestamps. Application and threshold
transitions operate on the shared state, scaling every cadence weight by the
same chance; tick damage still sums the individual weighted schedules. The
battle-aligned option collapses these cadence maps to a shared next-tick time;
the independent stack/expiry distribution must not be replaced by an average stack count.
The battle-aligned implementation stores its next boundary once per tracker, with
no per-state cadence maps. Only new probability mass applied exactly at the pending
boundary is temporarily excluded from that tick; existing active mass keeps its
eligibility. Advancing the shared clock clears that exclusion. Exact-cadence
expected DOTs and sampled timelines retain their existing timing representation.
The scheduler keeps only the next pending tick and computes its probability when
it fires. Refreshes update the pending check rather than recreating every future
tick; only actual damage ticks become timeline rows. This scheduling change applies
to expected exact-cadence DOTs as well as battle-aligned ones, without changing their
authored timing. Sampled timelines retain the concrete periodic scheduler.
The tracker emits probability-weighted periodic actions. `damageScale` carries expected
tick damage probability; `hitProbability` separately carries expected hit count. Neither
runtime field belongs in authored skill actions. Expected hit counts may be
fractional. Fivefold Bleed's shared owner allows otherwise equivalent histories
from different attacks to merge; failed refreshes still retain their own timing
and probability. Other DOTs keep their existing cast attribution.
Additive on-hit resource gains use hit probability, not stack count.
Simulation rebuilds the timeline and rolls applications, using ordinary tracked
effects and periodic scheduling for each successful proc.

## Skill Editor categories

The Skill Editor exposes one martial-art category for each unique currently
selected weapon, followed by the always-visible Mystic, General, Buff, Debuff,
and DOT categories. Skill records use the structured action editor. DOT records
edit the actions nested in `periodic` plus interval, first-tick, cadence-refresh,
duration, and stack fields. Skill and DOT records use the structured modifier
editor. Buff and debuff records expose their descriptive and
timing fields plus structured effect-rule editors. Each effect rule supports
requirements, direct or wrapped effect fields, numeric and boolean values, and
parameter-based object values such as Flute distance scaling. Cumulative
`stackEffects` remain grouped by stack tier and each tier contains the same
structured effect-rule editor. Editor overrides persist in browser storage
and replace their matching records in the skill, buff, debuff, and DOT maps
used by rotation calculations and simulations. The resolved maps are part of
the calculation fingerprint, so saving or resetting an override schedules a
fresh result rather than restoring an incompatible cache entry.

### Bamboocut Kite definition status

Heavenwill Declared (Gauntlet Q1) uses the supplied Level 100 alternate-animation
data directly, without distance selection: a 0.625-second cast with hits at
0.403 and 0.471 seconds. Physical and attribute coefficients are
0.330138 / 0.770322, physical bonuses are 91.5 / 213.5, and attribute bonuses
are 49.8 / 116.2. This is a 30%/70% split across two independently resolved hits.

Celestial Mandate is a 1.4-second Falcon skill with five direct hits at
0.45, 0.6, 0.683, 0.833, and 1.2 seconds. The first four hits each use physical
and attribute coefficients of 0.229311, physical bonus 63.6, and attribute
bonus 34.65. The final hit uses coefficients of 0.611496, physical bonus 169.6,
and attribute bonus 92.4. Immediately after that final hit, it adds `0.1`
to the numeric `HeavensWill` resource. Heaven's Unity is a regular self buff;
while it is active, a second `addResource` action with the standard action
`requirement` adds another `0.2`, for `0.3` total generation.
Heaven's Unity lasts 24 seconds, has one maximum stack, and refreshes its
duration when reapplied.
Explicit resource changes and passive resource regeneration are normalized to
nine decimal places so fractional additions remain stable at requirement and
display boundaries.

Sky Grasped (RD Special) has a 0.95-second cast and hits at 0.666 seconds.
Its physical and attribute coefficients are `1.25033`, with `347` flat physical
bonus and `189` flat attribute bonus. Immediately after that hit at the same
timestamp, it applies or refreshes Heaven's Unity on self. The conditional
follow-up damage and 0.25 Heaven's Will gain remain at 1.1 seconds, after the
cast ends, with their existing requirements and damage values.

Snaring Lash [Cancel] (RD Q [Cancel]) uses the supplied Level 100 hit at 0.365
seconds as its cancel cast duration. Physical and attribute coefficients are
0.49752, with physical bonus 137.7 and attribute bonus 75. Its Falcon trigger
and conditional Heaven's Might application remain at that hit timestamp.

Full Snaring Lash (RD Q) shares the cancel version's opening hit and effects at
0.365 seconds. Its follow-up offsets of 0.866 and 0.883 seconds produce hits at
1.231 and 1.248 seconds; the 0.95-second follow-up duration ends the cast at
1.315 seconds. The later hits use physical and attribute coefficients of
0.49752 and 0.66336, physical bonuses of 137.7 and 183.6, and attribute bonuses
of 75 and 100 respectively.

A requirement with `operator: "not"` and exactly one operand negates that
operand. This allows data-defined component selection to require that a buff or
debuff is absent without adding mechanic-specific calculator branches.

Virtuous Enthroned's three Heavy Attack stages use cast times of `0.4125`,
`0.4375`, and `0.9625` seconds. The first two stages each deal one hit at cast
end. Stage three divides its total `0.6363` Physical coefficient, `177` Physical
bonus, and `96` attribute bonus by 30%, 30%, and 40% across hits at `0.275`,
`0.55`, and `0.7375` seconds.

Wicked Defiance (Gauntlet VC) uses the supplied Level 100 direct starting route:
a 0.9-second cast with hits at 0.216 and 0.66 seconds. Physical and attribute
coefficients are 0.4836 / 0.7254, physical bonuses are 134 / 201, and attribute
bonuses are 73.2 / 109.8. The two hits independently resolve combat effects.
Its 0.1 Heaven's Will gain resolves immediately after the final hit at 0.66
seconds, before the next cast can start.

Righteous Reign A1–A6 timings, coefficients, and the A4 continuation marker are
specified in [Heavenwill Gauntlets A1–A6 timing and A4 continuation](#heavenwill-gauntlets-a1a6-timing-and-a4-continuation).
A6 triggers Light Attack Falcon at its 0.256-second hit. Light Attack Falcon is
a zero-cast-time `Triggered` skill tagged `Falcon`; its three
`0.748` Physical-coefficient hits land at `0.3`, `0.45`, and
`0.5875` seconds without extending the rotation's sequential cast time.

All Under Justice (Gauntlet Special) uses the supplied Level 100 source-layer-0
timing candidate: a 1.018-second cast with four hits at 0.3, 0.435, 0.602,
and 0.935 seconds. The first three each use physical and attribute coefficients
of 0.40704, physical bonus 112.8, and attribute bonus 61.4. The final hit uses
coefficients of 0.81408, physical bonus 225.6, and attribute bonus 122.8.

Vile Condemned (Gauntlet Charged) contains a 0.775-second
`VileCondemnedCharge` component followed by a conditional release component.
At release start, Soaring High T0, three or more Heaven's Will, and the absence
of the self status `VileCondemnedEndCooldown` select `VileCondemnedEndHit`;
otherwise the component falls back to `VileCondemnedHit`. End Hit applies that
status `0.7375` seconds into its release; the status has no stat effect and
expires after 18 seconds. The weaker hit uses physical
coefficient `7.2178`, `1997` flat physical bonus, and `1088` flat attribute
bonus. End Hit uses physical coefficient
`11.7527`, `3250` flat physical bonus, and `1771` flat attribute bonus. With
Soaring High T6, exactly four Heaven's Will at release start locks a `0.3`
base-damage bonus and `0.1` Critical Damage bonus for End Hit. The normal hit
consumes exactly two Heaven's Will. End Hit consumes three, leaving any
fractional amount above three intact, and consumes one additional point when a
start-bound requirement found Soaring High T6 and exactly four Heaven's Will at
release start. Heaven's Will is capped at four.

The selectable variants `VileCondemnedEnd` and `VileCondemnedEnd4` keep the
same charge and release components. They require at least three and four Heaven's
Will respectively at release start, plus Soaring High T0 and an expired or reset
End Hit cooldown. Their release reference has `waitForRequirement: true` and no
weak-hit fallback. The scheduler inserts the wait before the charge, crediting
regeneration and already queued gains/resets during the charge. The charge pays
ping once; the composite root and End Hit still ignore ping. The four-HW variant
uses the existing T6 damage bonus and consumption rules.

Both bundled Kite presets use the four-HW variant for their first three casts
and the three-HW variant for their last. Their old manual delay padding is
removed. The regular preset omits its final Snaring Lash [Cancel] and Sky Grasped
to land the last End Hit before 60 seconds. It retains Deflect immediately after
Righteous Reign 6th Hit [Cancel], because A6 requires that cancel. Battle End still
cuts off late hits even when the release was ready.

When End Hit deals damage, Soaring High T6 triggers a one-point Heaven's Will
refund. The refund uses its own 18-second cooldown, independent of End Hit's
skill cooldown, so resetting End Hit does not also reset the refund. The
triggered refund resolves immediately after the End Hit actions and remains
subject to the four-point Heaven's Will cap.

Bursting Nine's nine projectiles use the level-71 baseline and repeated-hit
factors documented above. Bursting Nine 2 Shots adds a second volley at half
the corresponding first-volley damage. Cast and hit times remain defined in
`data/skill/mystic.json`. Its Single-Target or Area classification remains
unset until that mechanic is confirmed.

Etherwrath is available to Bamboocut Kite and Stonesplit Strength. Two pieces
add `77.8` minimum physical attack. With four pieces, every `DirectDamage` action adds or
refreshes one stack of the eight-second Etherwrath buff, up to five stacks.
DOT ticks and other damage without `DirectDamage` neither add nor refresh stacks,
while Perfect Dodge applies five stacks directly. Each stack adds `0.012` to
the calculation-time attack value multiplier for Physical, Bellstrike,
Stonesplit, Silkbind, and Bamboocut. At five stacks, actions tagged
`MartialArtEffect` also gain `6` Physical, Bellstrike, Stonesplit, Silkbind, and
Bamboocut penetration. Each attack and penetration channel remains a separate
effect entry in the buff definition.

Soaring High T0 enables the Vile Condemned End Hit branch. Without the
`SoaringHighT0` condition, Vile Condemned uses its normal release even when the
resource and cooldown conditions for End Hit otherwise pass. T0 also grants
`0.2` HP damage bonus to actions tagged `Falcon` or `VileCondemned`. Both the
normal and End Hit release components carry the `VileCondemned` tag.
Soaring High T2 adds `74.4` minimum physical attack through the shared stat
effect pipeline.
Soaring High T3 consumes `VileCondemnedEndCooldown` when a damaging action
tagged `Falcon` hits an exhausted target. The reset occurs after the qualifying
damage action resolves and affects subsequent Vile Condemned releases.
Soaring High T4 uses the generic `convert` effect for actions tagged
`VileCondemned`. It converts Final Affinity to Direct Critical at a 1:1 ratio,
up to `0.12` per action, before the ordinary outcome rates are calculated. The
global `0.2` Direct Critical cap limits the amount actually converted; Final
Affinity that cannot fit below that cap remains Final Affinity.
Empirical Edge T0 listens to damage tagged `MartialArtEffect` and applies one
stack of Cognition after the hit. Cognition lasts five seconds, refreshes on an
accepted application, stacks three times, and has a one-second application
cooldown. Each stack grants Martial Art Effects `2` Bellstrike, Stonesplit,
Silkbind, and Bamboocut penetration. Effects carrying both `HeavenwillGauntlets`
and `Falcon`, or carrying `VileCondemned`, gain another `2` of each attribute
penetration per stack. T1 extends Cognition to eight seconds, T2 grants `22.3`
Min Physical Attack and `44.7` Max Physical Attack, T3 raises the stack cap to
five, T4 removes the application cooldown, and T5 grants `0.025` Physical DMG
Bonus. T6 grants Physical Penetration equal to Cognition's total attribute
penetration for that action. Every penetration channel remains a separate
effect entry; T0 does not grant Physical Penetration.
Soaring High T6 grants Vile Condemned End Hit `0.3` base-damage bonus and `0.1`
Critical Damage bonus when the release begins at exactly four Heaven's Will.
An Inner Way tier may listen to final damage events:

```json
{
  "listen": [
    {
      "event": "damage",
      "cooldown": 18,
      "requirement": [
        { "target": "skillTag", "value": "Charged" },
        { "target": "target", "value": "HeavensMight" }
      ],
      "action": {
        "type": "trigger",
        "value": "SkyGrippedReplay",
        "parameter": { "damage": "event.damage" }
      }
    }
  ]
}
```

The event snapshot contains the source action's final damage, action-specific
tags, buffs, debuffs, resources, and target state at hit time. Requirements use
the existing targets against that snapshot. A listener cooldown is local to
that listener and begins only when it successfully spawns its skill. For a
multi-hit skill, the first eligible event starts the cooldown, so later hits in
that window do not replay.

### Incoming-attack response windows

Skills declare `attackResponse: { onSuccess: "SkillId", endMargin?: number, perAttack?: boolean }`.
`endMargin` enables automatic alignment to the next incoming attack. Defense
omits it and uses its entered cast duration without an automatic attack wait.
The window normally uses the skill's resolved weapon-dependent cast duration,
including timing modifiers. `durationFrom: "PerfectDodge"` gives Perfect Dodge
Cancel the normal dodge's modified window while its blocking cast duration stays
zero. The window persists while subsequent skills cast. Dual Blades uses the
user-confirmed 0.125-second normal Perfect Dodge duration; its canceled variant
inherits that response window while retaining a zero-second cast.

After cooldown readiness, the scheduler finds the next manual Take Damage event
or dummy attack before Battle End that is not already reserved by another response.
It inserts an automatic attack wait so the window ends 0.1 seconds after that
attack, or later if the preceding cast prevents the ideal start. The earliest
start includes ping; attacks before that time cannot be selected. Reservations
group simultaneous attacks so consecutive canceled dodges choose distinct attacks.
Both Deflect variants ignore ping; dodges retain normal ping.

At a positive incoming hit within an active window, damage becomes zero and an
internal `attackResponse` event runs setup talent hooks and triggers the data's
`onSuccess` skill at the attack timestamp. By default each defensive cast succeeds
once; additional hits within its window are still avoided. `perAttack: true`
repeats success for every positive incoming hit, including simultaneous dummy
attacks. Defense uses this mode to award one Cadence stack per blocked hit. Success effects therefore
precede later outgoing actions at the same timestamp without changing earlier
snapshots. No upcoming attack means an ordinary cast and no success rewards.

`PerfectDodgeSuccess` owns Vitality, Etherwrath, Breaking Point, Mystery,
Mystery Umbra follow-ups, and Samsara. `DeflectSuccess` owns Vitality and
Cleftpeak. Dodge talent charge resets and Carouse Binge gains listen to
`attackResponse` instead of `skillStart`. Success rows and their triggered
children retain the defensive row's attribution and weapon context even if a
subsequent cast switches weapons; the active weapon is not switched back.

Generated waits retain `automatic: "attack"` and the output-only editing rules
shared with cooldown waits. Loading/importing old rotations changes direct
anchors on the removed time-zero defensive actions to cast-start anchors.

Kite BP enables paired dummy attacks. The second A6 in its opener uses A6 Cancel,
followed directly by Perfect Dodge, which cancels A6's remaining animation.
At 40ms ping, a 0.0585-second automatic wait puts the first dodge window at
5.100–5.600 seconds, covering the first paired attack at 5.500 seconds.
The final Qi break attaches to the first damage action of Soaring Spin before
the third four-HW VC. This keeps the following Celestial Mandate inside
Exhausted, allowing its Falcon hit to reset VC's cooldown. Three four-HW releases
and the final three-HW End Hit now land before the 60-second cutoff. DPS
baselines remain review-gated separately from builds.

Strength's Mixed Dummy Infinite Vitality preset enables paired dummy attacks and
anchors combat start to the final hit of its first Fleeting Trace. At 40 ms ping,
its canceled dodge catches the second pair at 11.5 seconds, activating Ghostly
Steps' Mystery DMG Boost before both Soaring Spin hits. Battle End remains
60 seconds after the selected starting hit.
A 0.227-second manual delay before the later Legion Summon preserves Iron Guard
coverage on the final Anxi Soldier and Flute Ripple hits after Grave Frost's
cast duration was shortened to 1.605 seconds.

### Heavenwill Gauntlets A1–A6 timing and A4 continuation

Righteous Reign uses the supplied Level 100 grounded A1 and non-PvP A6 data.
Normal cast durations use interrupt timing; full animation end timings do not
block the rotation. A6 Cancel ends at its hit, retaining the separate follow-up
cancel skill. A6's Falcon trigger remains synchronized with that hit.

| Attack             | Cast duration | Hit times     | Physical/attribute coefficients | Physical bonuses | Attribute bonuses |
| ------------------ | ------------- | ------------- | ------------------------------- | ---------------- | ----------------- |
| A1 grounded        | 0.466         | 0.21          | 0.35636                         | 100              | 54                |
| A2                 | 0.462         | 0.148 / 0.32  | 0.156852 / 0.235278             | 44 / 66          | 23.6 / 35.4       |
| A3                 | 0.333         | 0.25          | 0.25294                         | 71               | 39                |
| A4                 | 0.417         | 0.194         | 0.31826                         | 89               | 48                |
| A5 alternate entry | 0.512         | 0.205 / 0.423 | 0.186944 / 0.280416             | 52 / 78          | 28.4 / 42.6       |
| A5 continuation    | 0.410         | 0.115 / 0.320 | same as alternate entry         | same             | same              |
| A6 non-PvP         | 0.923         | 0.256         | 0.8202                          | 228              | 124               |
| A6 Cancel          | 0.256         | 0.256         | same as A6                      | same             | same              |

A4 applies the self buff `HeavenwillGauntletsA4` (displayed as Heavenwill Gauntlets A4) at its cast end (0.417 seconds), with one-second
duration and one maximum stack. A5 snapshots a modifier requiring this buff and
consumes it at time zero. Other attacks neither consume it nor receive its speedup.
Ping and intervening delays count against its lifetime.

The A5 modifier uses the existing segmented `castTimeModifier` on original
`actionTime`: boundaries 0.205, 0.423, and 0.512 select offsets 0, -0.09,
-0.103, and -0.102 seconds. This preserves the time-zero consumption while
matching both faster hits and the faster interrupt independently. Consumption
does not undo the modifier snapshot for the remainder of that A5 cast.

### Total Annihilation timing and damage

Total Annihilation (`PhalanxbaneQ`) uses a 0.7-second cast and a direct hit at
0.311 seconds. Physical and attribute coefficients are both 1.8948, with
physical bonus 525 and attribute bonus 286. Its 15-second cooldown and
conditional Anxi Soldier follow-up at 0.913 seconds remain unchanged. The
follow-up can resolve after the next skill has started.

### General's Bane: Stab timing and damage

General's Bane: Stab (`SnowpartingQStab`) casts for 1.15 seconds and hits at
0.228 and 0.799 seconds. Physical and attribute coefficients are 0.85296 and
1.27944, with physical bonuses 236 and 354 and attribute bonuses 128.8 and
193.2. Fearful Blade application and Dread extension follow the second hit at
0.799 seconds, followed by the conditional Anxi Soldier trigger at the same
final-hit timestamp. Its 12-second, two-use cooldown is unchanged.

### Fleeting Trace timing and damage

Fleeting Trace (`SnowpartingSpecial`) casts for 2.066 seconds. Its nine hits
land at 0.633, 1, 1.1, 1.2, 1.3, 1.6, 1.666, 1.733, and 1.8 seconds.
The first eight hits each use physical and attribute coefficients of 0.377968,
physical bonus 104.6, and attribute bonus 57. The final hit doubles those values
to 0.755936, 209.2, and 114 respectively. Inner Passion and Dread applications
remain at cast end, now 2.066 seconds. Its 20-second cooldown is unchanged.

### Snowbreak Spring timing

Snowbreak Spring (`SnowpartingHeavyVC`) casts for 0.857 seconds and hits at
0.565 seconds. Its existing damage coefficients and bonuses are retained.
Inner Passion consumption, Dread extension, and Forgetfulness cooldown/reset
actions and the Anxi Soldier trigger remain synchronized with the direct hit
at 0.565 seconds.

### Heng Blade Anxi Soldier assist timing

`AnxiSoldierSnowbreakSpring` and `AnxiSoldierGeneralsBaneStab` each resolve
four attacks at 0.16, 0.40, 0.46, and 0.70 seconds relative to their trigger.
Their damage coefficients and bonuses are unchanged. Snowbreak Spring triggers
its assist at the 0.565-second direct hit; Stab triggers its assist at the
0.799-second final hit. The delayed soldier attacks snapshot combat state at
their individual hit times, and Qi events attached to a soldier action follow
that action's offset.

### Grave Frost charge and attack timing

Grave Frost (`SnowpartingLightCharged`, Heng LC) has a 0.65-second charge
followed by attacks at 0.183, 0.400, 0.521, and 0.946 seconds into the attack
animation. Its interrupt is 1.182 seconds after charging, so the complete
cast lasts 1.832 seconds and hits at 0.833, 1.050, 1.171, and 1.596 seconds.
The existing Forgetfulness modifier subtracts 0.65 seconds from the cast and
hit times, skipping only the charge. Its time-zero consumption stays at zero,
and the timing modifier remains snapshotted after consumption. Damage values
are unchanged; ping applies once per cast.

### Legion Summon timing

Legion Summon (`PhalanxbaneSpecial`) applies Iron Guard 1 second after cast
start and finishes casting at 1.167 seconds. Iron Guard duration starts at its
application timestamp. The existing cooldown and Steadfast Devotion T1
cooldown/duration modifier are unchanged.

### General's Bane variants and Slash

General's Bane (`SnowpartingQ`) casts for 0.692 seconds and hits at 0.526
seconds. General's Bane 2 (`SnowpartingQ2`) casts for 0.708 seconds and hits
at 0.611 seconds. Both use physical and attribute coefficients of 1.2338,
physical bonus 342, and attribute bonus 186. Bane 2 shares the existing
`SnowpartingQ` 12-second, two-use cooldown window through `cooldownGroup`.

General's Bane: Slash (`SnowpartingQSlash`) casts for 0.654 seconds. Its hits
at 0.234 and 0.491 seconds use physical and attribute coefficients of
0.596352 and 0.894528, physical bonuses 165.2 and 247.8, and attribute bonuses
90 and 135. Its existing cooldown behavior is unchanged.

The removed General's Bane - Slide opener is replaced by General's Bane followed
by General's Bane 2 in the bundled Mixed starters. Their shared cooldown remains
12 seconds with two uses. Saved and imported Slide steps migrate in place: the
second legacy Slide becomes General's Bane 2, and the others become General's
Bane. Step indices and attached-event anchors are preserved.

### Heng Blade conversion cooldown

Snowparting Conversion (`SnowpartingConversion`, Heng Tab) has a three-second
cooldown. It uses ordinary cooldown readiness and then pays configured ping.
Its 0.56-second cast and 0.498-second hit timing are unchanged.

### Wind dummy rotation

`data/rotation/bamboocut-wind/wind-dummy-1-min-infinite-vitality.json` is the
default Wind preset. It preserves the complete authored sequence with 40 ms ping,
dummy attacks, and infinite Vitality. Combat starts on the first RD Q Cancel hit;
Battle End stops simulation 60 seconds later without deleting the remaining steps.
The marked break sets target Qi to zero after the second hit of the specified FA1,
so that hit lands before exhaustion and the following FA2 observes the break.

Pre-pull deflects use ordinary Deflect, and both flute casts use the cancel variant. Rodent-only variants use zero cast time
and launch their Rodent without blade damage; A4/FA5 cancels retain damage
through their last hit. Perfect Dodges align to the paired dummy attacks.
The preset JSON is the source of truth for the evolving authored sequence,
including the FA2 [Rodent] after the first Flamelash's FA1.

Flamelash now uses Hellfire depletion instead of a fixed timer. The corrected
sequence runs beyond the 60-second Battle End. The original Hellfire model depleted before the observed roughly half-full bar
at the first FA4 [Rodent] / Perfect Dodge checkpoint. ERR now contributes its
automatic attacks and their Samsara gains; the full in-game comparison remains
under review. FA casts can still occur after depletion.
The user explicitly requested keeping this authored sequence unchanged for
review. It is therefore an intentional temporary exception to preset FA-state
legality; the editor and damage calculation show the actual inactive state.
Battle End still excludes actions after 60 seconds. Attack HP drain remains unmodeled.
