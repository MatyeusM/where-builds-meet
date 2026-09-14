# DPS regression snapshots

`npm run test:dps` compares every non-empty preset rotation for available paths
against `tests/snapshots/rotation-dps.json`. The release deployment workflow
runs this guard before publishing, including manual deployments. Ordinary build,
tests, watch mode, and PR/main CI exclude the accepted-DPS comparison while
retaining its coverage, selector, and comparison-algorithm tests.

## Fixture selection

`tests/helpers/dps-snapshot-fixtures.ts` discovers rotation JSON files from each
available path's build group. Cases use stable `<pathId>/<rotationId>` keys.
Empty planner rotations are excluded. A durable coverage test checks all
non-empty rotation files against this catalog. The release guard compares the
catalog with accepted baseline keys, so new or removed presets cannot silently
escape review. A missing accepted baseline does not block ordinary builds.

Each rotation uses its path's default build unless an explicit build override
selects its corresponding variant: regular Kite uses the non-BP build, pure
Strength uses the pure build, and Double Stab uses the double-min build. The
remaining variants retain the path default. This covers all 13 current rotations,
not every build/rotation combination.

Current calculations use breakthrough 17, 40 ms ping, Simmering Fish Slices,
Fire Divinecraft, no Script, and no global or skill overrides. The rotation
supplies its martial arts and encounter flags; the build supplies its gear,
Inner Ways, and sets. Fixtures are passed to `buildPresetRotationBundle` and
`calculateRotationBaseline`, the production calculation pipeline. No browser
preferences or duplicate damage formulas enter the check.

## Accepted values and review gate

Schema version 2 replaces the old one-case-per-path file. Each case records its
fixture, DPS, total damage, and duration. The gate fails on:

- A DPS increase or decrease of 1% or more, independently for each rotation.
- Missing or removed rotation coverage.
- A changed build, rotation, martial-art pair, or fixed environment.
- Non-finite, zero, or negative DPS, damage, or duration.

Total damage and duration provide context; DPS is the thresholded metric.
Changes accumulate against the last accepted value, not the previous test run.

At the user's request, expanded non-Deluge baselines preserve the values from
before this session's ping, timing, and preset changes. They were reconstructed
using rotation and skill data from revision
`f13eee3e2c6bc5b1a547a54bff7679110418fdf9` with zero ping. The production
calculator reproduced the existing Kite, Might, and Strength accepted baselines
exactly before seeding their additional rotations. Their fixture ping is
explicitly 0; comparison with the current 40 ms environment intentionally flags
an environment change until each new result is reviewed.

All four Deluge rotations instead use the user-approved current data and 40 ms
ping. WTS Team's prior accepted value was reproduced exactly. These values cover
the Poet timing changes, aligned Deflects, revised Mystic timing, and opening WTS
delays where present. The existing Deluge acceptance is preserved.

Both Kite presets now use the user-approved current data and 40 ms ping:
regular Kite is 54,487.60 DPS and Kite BP is 60,168.91 DPS. These supersede
their pre-ping baselines and include the revised skill timings and damage,
VC readiness, defensive attack alignment, BP Qi-break anchor, and the updated
Light Attack Falcon coefficients. Might and
Strength retain their pre-ping baselines pending review.

## Updating reviewed rotations

Run `npm run test:dps`, explain each affected rotation's old/new result and cause,
and obtain acceptance before updating it. `DPS_UPDATE_IDS` accepts an exact case
ID, a path ID to select all its rotations, or `all`. Unselected baselines remain
unchanged; unknown or overlapping selectors fail.

In PowerShell:

```powershell
$env:DPS_UPDATE_IDS = "bamboocutKite/dummy-1-min-iv-bp"
try {
  npm run snapshots:dps:update
} finally {
  Remove-Item Env:DPS_UPDATE_IDS
}
```

In a POSIX shell:

```sh
DPS_UPDATE_IDS="silkbindDeluge" npm run snapshots:dps:update
DPS_UPDATE_IDS="stonesplitStrength/pure-dummy-1-min stonesplitMight/dummy-1-min" npm run snapshots:dps:update
```

Use `all` only after every current rotation has been accepted; it also removes
obsolete baseline keys. Leave the variable unset during release checks. Inspect
the resulting diff and run formatting, build, and release snapshot checks before
publishing. Focused mechanic tests remain necessary when timing or buff changes
can offset each other in total DPS.
