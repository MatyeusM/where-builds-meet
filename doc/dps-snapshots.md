# DPS regression snapshots

`npm run test:dps` calculates every path whose `data/path.json` status is
`available` and compares it to the accepted values in
`tests/snapshots/path-dps.json`. The check runs inside `npm run build`,
on pull requests, and on pushes to `main`. A failed build also blocks the
existing release deployment workflow.

Each case uses the path's current default build and default rotation,
breakthrough 17, Simmering Fish Slices, Fire Divinecraft, no Script, no global
buff/debuff overrides, and no skill or character overrides. The preset supplies
its Inner Ways, sets, rotation flags, and gear, including relayed gear.
`buildPresetRotationBundle` is the production bundle builder also used by the
Graduation comparison; the test passes its bundle directly to the same
`calculateRotationBaseline` function used by the worker. It never duplicates
stat, rate, damage, or DPS formulas or reads a user's browser storage.

The snapshot records the fixture identifiers/settings, expected DPS, total
damage, and duration. The gate fails when:

- DPS increases or decreases by **1% or more** from the accepted snapshot.
- An implemented path is missing a baseline, or snapshot coverage disappears.
- A selected build, rotation, martial-art pair, or fixed environment changes.
- A result or baseline has non-finite, zero, or negative DPS, damage, or duration.

DPS is the thresholded metric; total damage and duration provide review context.
Comparisons always use the last accepted baseline, so multiple smaller changes
accumulate toward the same threshold. Expected calculation is deterministic;
Monte Carlo samples and browser preferences are excluded. This covers one
representative preset per implemented path, not every possible build/rotation.
Focused mechanic probes remain necessary, particularly when changes to different
skills offset each other in total DPS.

## Reviewing a failure

1. Run `npm run test:dps` and inspect the old DPS, new DPS, and percentage change.
2. Trace the calculation/data/rotation change and decide with the user whether
   the difference is correct. Fix a regression without changing its baseline.
3. Only after accepting an intentional change, update the affected path(s):

   ```sh
   npm run snapshots:dps:update -- silkbindDeluge
   npm run snapshots:dps:update -- stonesplitMight stonesplitStrength
   ```

4. Inspect the JSON diff, run `npm run format` and `npm run build`, and commit
   the reviewed snapshots together with the intentional change.

`npm run snapshots:dps:update -- --all` explicitly accepts all current paths
and removes snapshots for paths no longer implemented. Use it only when the
whole baseline set has been reviewed. Ordinary test/build commands never write
snapshots. Update commands validate calculation outputs before writing and do
not change unselected paths. Newly implemented paths require an explicit update.

The initial snapshots capture the working tree after the Deluge cancellation
and visible cooldown-delay fixes, including the current attunement changes.
