# Weapon-fidelity iteration

Tested October 6, 2026 US Eastern. This continues the development build; it does
not approve a reference baseline or satisfy the 95% merge gate.

## Imported data

All 34 firearm records reproduce from the hash-locked
[February 16, 2023 Valve schema mirror](https://github.com/SteamDatabase/GameTracking-CSGO/blob/108f1682bf7eeb1420caaf2357da88b614a7e1b0/csgo/scripts/items/items_game.txt).
The importer rejects different bytes and resolves repeated sections and inherited
prefabs. [WEAPON-FIDELITY.md](../WEAPON-FIDELITY.md) separates imported attributes
from approximate runtime behavior.

## Local tests

The complete game-tool Node suite passed 39 tests, with no failures or skips.
This includes the locally restored binary assets; asset-dependent checks may skip
in CI when those ignored files are absent.

New tests cover schema inheritance and integrity, all 34 firearm definitions,
armor/helmet depletion, hitgroup and distance damage, weapon movement caps,
scope FOV conversion, accuracy recovery, individual pellet offsets, repeatable
approximate recoil, firearm kill rewards and cloned-model resource disposal.

Reproduce after restoring assets and installing the tool dependencies:

```sh
node --test tools/csgo-assets/*.test.mjs
node tools/csgo-assets/build-preview.mjs /absolute/preview/directory
# Serve that directory at http://127.0.0.1:8767.
node tools/csgo-assets/combat-browser-test.mjs
FULL_MATCH=1 node tools/csgo-assets/browser-smoke.mjs http://127.0.0.1:8767/game.html?quality=low
```

Set `CHROMIUM_PATH` when the installed browser is outside Playwright's default
cache. Browser tests use software rendering and controlled simulation time.

## Scope of the browser fixtures

The combat test temporarily funds the human slot, immobilizes bots and gives one
target extra health. It checks Nova pellet traces and trigger behavior, sustained
AK fire and recovery, reloading, AWP zoom and movement, repeated model switching,
death while scoped, pausing/resuming and the narrow-screen menu.

The completed combat run recorded nine separate Nova pellet traces and one shell
consumed while the trigger remained held. Automatic AK fire increased recoil
and inaccuracy, which recovered after release; reloading restored 30 rounds.
The AWP camera cycled through vertical FOVs of approximately 30.54 and 7.51
degrees before returning to the unscoped view. Ten knife/AWP switch cycles kept
the renderer at 286 geometries and 303 textures. Death cleared the scope, and
the run recorded no uncaught page errors.

The full-match regression completed all 60 physical spawn-to-bombsite routes,
buying, movement, firing and reloading. Audio counters recorded 33 decoded sounds
and 38 playback events at the sample point. The final run, after correcting
scoped firing penalties, reached its end state after
27 rounds at CT 16, T 11, with 131 kills recorded and the human slot changing sides
at halftime. No uncaught page errors were recorded.

Raw observations are in `weapon-match.json` and `combat-fidelity.json`.
`weapon-gameplay.png` captures the match control test; `weapon-scope.png` captures
the zoom test. These files are separate from the earlier gameplay evidence.

The HUD-layering retest kept the radar, score and kill feed above the scope mask.
The Chinese menu remained usable at 390 × 844 without horizontal overflow.
The standard browser-game input client also completed its strafe, fire and jump
sequence in exploration mode, leaving 19 rounds in the Glock. Its state and
capture are saved as `weapon-input-state.json` and `weapon-input.png`; no error
file was emitted. The helper required an explicit installed Chromium path and a
longer initial click timeout for the map load.

The match test exercises physical routes and an entire offline match with an
inactive human slot. Neither test qualifies competitive bot skill. Resource
counts after repeated switching are a targeted leak regression, not a full
renderer memory profile. Software-renderer FPS is not presentation-hardware
performance.

Original lighting, map equivalence, animations, exact engine weapon and movement
behavior, complete audio events, bot qualification and hardware measurements
remain open. The draft PR must not merge based on these results.
