# Local development test evidence

Captured on 2026-10-06 US Eastern / 2026-10-07 UTC. These are implementation tests, not approved CS:GO reference comparisons.

The later weapon-data and handling iteration has separate results in
[weapon-fidelity.md](./weapon-fidelity.md). The runs below preserve the earlier
gameplay and landing-integration evidence rather than replacing it.

## Earlier browser run

`browser-smoke.json` records the Playwright run against the converted, textured build in software-rendered low-resolution mode.

- All 60 physical spawn-to-bombsite traversals completed, including collision and jumping where the controller required it.
- Buying an AK-47, moving, firing and reloading passed. Audio counters recorded 17 decoded and 17 played sounds at the sample point.
- The match simulation completed 21 rounds and reached the match-end state at a 16–5 score. The human slot changed from CT to T at halftime; 122 kills were recorded.
- The human slot remained inactive during the full-match portion. `advanceTime()` advanced simulation time; this was not 36 minutes of wall-clock play or a human skill test.
- No uncaught page errors were recorded. The narrow-screen menu and Chinese intro were checked, not a complete Chinese localization or mobile control scheme.

The match simulation used the native-input development bundle. The hosted bundle uses the same match, physics, map and bot code with a separate drag-to-aim input adapter because its iframe cannot capture the cursor.

The standard browser-game action client was then run against the hosted adapter. It exercised CT-side strafing and firing, left the game live with 11 rounds in the USP-S, and recorded no console/page errors after the final fixes. `hosted-state.json` and `hosted-ct.png` preserve that run. The CT screenshot confirms that the corrected team filter keeps CT hands visible.

All 136 expected idle, firing, reload and inspection clip bindings resolve across the 34 viewmodels. This is a binding check, not an animation-timing comparison.

## Images

`gameplay.png` is the actual buying/firing/reloading test capture. `character-render.png` is a staged close-range character/material/weapon-attachment check, not a combat result. `mobile-menu.png` records the narrow-screen menu.

The displayed software-renderer frame rates are not presentation-machine measurements. Earlier screenshots could show animation-callback FPS while paused; the current overlay instead marks paused frames explicitly.

## What these results do not prove

No reference build or original map digest has been approved. These tests do not establish exact layout, materials, lighting, movement, hitboxes, recoil, penetration, grenade physics, economy, animation timing or high-skill bot tactics. One simulated match is not a repeated-seed stability qualification.

The 28 local Node tests pass. Four asset-dependent tests skip in CI when the ignored generated assets are absent. The parity report remains ineligible, intentionally.
