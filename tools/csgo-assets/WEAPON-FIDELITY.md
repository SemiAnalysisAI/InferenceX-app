# Weapon fidelity iteration

## Reference data

The 34 firearm definitions now read numeric attributes from Valve's item schema
as mirrored by [SteamDatabase, commit 108f1682bf7eeb1420caaf2357da88b614a7e1b0,
February 16, 2023](https://github.com/SteamDatabase/GameTracking-CSGO/blob/108f1682bf7eeb1420caaf2357da88b614a7e1b0/csgo/scripts/items/items_game.txt).
This is a pinned development reference, not a maintainer-approved presentation
build or a claim to use the final CS:GO release.

The original file's SHA-256 is
`468aebd88245282936ad83716c946710ae9cd78b328077f67c087cc8e2cd4db7`.
`import-weapon-reference.mjs` rejects other bytes, merges repeated KeyValues
sections, resolves prefab inheritance, and exports numeric attributes to
`weapon-reference.mjs`. Only data is imported; no community or leaked game
implementation is used.

To reproduce, download that commit's `csgo/scripts/items/items_game.txt`, then:

```sh
node tools/csgo-assets/import-weapon-reference.mjs /path/to/items_game.txt
```

The exact imported fields used in gameplay include prices, magazine/reserve
counts, damage, head multipliers, armor ratios, cyclic rates, automatic flags,
pellet counts, range/falloff, kill rewards, movement limits, scope levels/FOV,
and stand/crouch/move/jump/fire accuracy and recovery parameters.

## Behavior changes

- Armor damage uses each firearm's ratio, rather than a universal 45% reduction.
  Head protection requires a helmet; legs bypass armor; armor depletion limits
  the absorbed damage. Range falloff converts meters back to Source units.
  Chest, stomach, leg and head proxy volumes have separate multipliers.
- The damage model follows the publicly explained range and armor relationships
  in [3kliksphilip's CS:GO armor analysis](https://www.youtube.com/watch?v=xbNwv3fkcgs).
  Floating-point damage is retained internally; exact engine rounding and
  hitbox equivalence still require reference validation.
- Shotguns trace individual pellets: Nova 9, XM1014 6, MAG-7 8 and Sawed-Off 8.
  Each pellet can miss, hit map geometry, or hit a different actor. The previous
  four-times-damage single-ray shortcut is removed.
- Pump shotguns no longer auto-fire while the mouse is held; XM1014 retains
  automatic fire. Weapon-specific kill rewards are applied to firearm kills.
- Accuracy responds to measured movement, crouching, jumping and sustained fire.
  Fire penalties and recoil history recover over time. The crosshair expands
  with inaccuracy and contracts after recovery.
- View recoil rises and recovers without permanently modifying mouse aim.
  The per-weapon pattern is deterministic, but its generator and scale are
  authored approximations, not Valve's RNG or an extracted original spray table.
- Movement caps depend on the held weapon and scope state. Walk/crouch factors
  are still authored tuning; acceleration, braking and air physics are unchanged.
- Scopes cycle through the imported zoom levels; switching weapons clears the
  old scope. The 4:3 reference horizontal FOV converts to the camera's vertical FOV.
- The scope mask stays below the match HUD. Reloading and death clear zoom.
- Replacing viewmodels releases cloned materials and skeleton textures without
  disposing cached source geometry or textures. The browser regression repeats
  knife/AWP switching and checks renderer resource counts.
- Bots use the same weapon accuracy calculation and introduce recovery pauses
  between short long-range bursts. This is a behavior change, not an independent
  high-skill qualification.

## Remaining limits

Wall/body penetration, original hitboxes, exact spray/RNG behavior and fixed
shotgun spread patterns, special
weapon fire modes, revolver hammer timing, silencer toggling, per-shell reloads,
exact reload timing, auto-rescoping and recoil-viewmodel timing remain open.
Full movement and grenade physics are still approximations.

The earlier map, lighting, character-animation and presentation-hardware gaps
remain. No acceptance item is promoted to an approved reference result by
passing these implementation tests; the 95% merge gate remains closed.
