# PvE attunement catalog: deferred work

Source: the user-supplied nine-category, 45-affix PvE catalog and subsequent
matching clarifications. Official IDs map to stable keys through
`data/official/affix-map.json`. New definitions use supplied names; existing
names and older ID aliases are preserved. Source `min` and `format` are ignored.
The existing Tier 96 armor maximum of `0.06` matches every supplied `max`.

## Deferred effects and existing-definition changes

| Official ID                                   | Attunement                                                                                      | Deferred work                                                                                                                                   |
| --------------------------------------------- | ----------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| 280304, 280305                                | Vernal Umbrella - Frequent Projectile DMG Boost / Vernal Umbrella Frequent Projectile DMG Boost | Names differ only by punctuation, so their separate projectile scopes remain unclear. Keep distinct IDs and inactive definitions, as requested. |
| 280201                                        | Thundercry Blade - Shield Boost                                                                 | Remains an empty, unsupported attunement. Shield strength calculation is not implemented.                                                       |
| 280202–280205, 280401, 280402, 280404, 280405 | Existing Might and Deluge display names                                                         | Existing labels include `-` after the martial-art name; supplied labels omit it. Cosmetic renaming remains deferred.                            |

Thundercry Charged Skill DMG Boost retains its confirmed `StonebreakerQuake`
exclusion. Panacea Healing Skill Boost retains its `Heavy` classification.

Wicked Defiance (Gauntlet VC) currently has `VariedCombo` without `Light` or
`Heavy`. Its classification is pending user clarification, so `279753` does
not yet match that skill. Do not guess a tag that could also change other bonuses.

## Confirmed matching and pending skill data

Attunement damage uses the standalone multiplier. Every `effect.tags` entry
must match; nested arrays match any one of their tags. Damage and healing use
the same matcher, and multiple matching alternatives never duplicate a bonus.

The user confirmed these scopes:

- `280302`: Inkwell Fan with Special **or** Pursuit.
- `279753`: Heavenwill Gauntlets with Varied Combo and either Light or Heavy.
- `280401`: Panacea Fan Martial Art skill healing, Fan Q and QQ including cancels.
- `280404`: Soulshade Umbrella Martial Art skill healing, Umbrella Q.

The healing skills carry singular `MartialArt`, distinct from broad
`MartialArts`. Special and Heavy healing do not receive the Martial Art boosts.

The newly covered arts do not yet have castable skill data. Their attunements
are ready for matching actions but do not create rotation moves. Martial Art,
Charged, Special, and Pursuit use `MartialArt`, `Charged`, `Special`, and
`Pursuit` respectively. Infernal Empowered Light requires `Light` and
`Empowered`; it does not automatically activate Flamelash. Strategic Bleeding
requires `StrategicSword` and `Bleed`; Mortal Rodent requires `MortalRopeDart`
and `Rodent`. Bleed/High Bleed sharing must be confirmed when those definitions
are authored. Heavenquaker retains canonical `HeavenQuakerSpear` capitalization.

## Verification

`script/probe/check-attunement-import.mjs` checks all 45 official IDs through
import, saved-gear validation, equipped aggregation, roll normalization, and
calculation. It verifies alternative matching, missing-tag rejection, single
application when both alternatives match, inactive definitions, and healing
scope using actual Fan/Umbrella skill and periodic healing data.
