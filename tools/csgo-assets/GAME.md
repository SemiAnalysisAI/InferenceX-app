# Dust II offline development build

The requested mode is one human plus nine bots, split into 5v5 teams. Ten-human networking is outside this iteration's scope.

This is a development tool, not a production theme integration or a claim of 95% CS:GO parity. Open `game.html` through a local HTTP server after restoring assets. The normal dashboard, light/dark themes and embeds do not import this tool.

## Implemented systems

- Imported Dust II geometry, textures and static props from the [de_dust2new Workshop port](https://steamcommunity.com/sharedfiles/filedetails/?id=3068466810). Its author explicitly reports visual downgrades. This is not a verified byte-for-byte original map.
- One human and nine bots, side selection, round freezing, buy time, round clock, elimination and bomb win conditions, halftime, match end and restart.
- A roster of 34 firearms plus a prototype knife, team restrictions, inventory slots, magazines, reserve ammunition, reloading, fire-rate limits, scoped aiming, health and armor.
- Buying, capped money, win/loss income, dropped weapon rendering, ammunition-preserving weapon pickup and bomb pickup. The economy uses prototype values. Switching weapons cancels reloading.
- Bomb carrying, dropping, planting, cancellation, defusing with and without a kit, and detonation.
- Layered navigation baked from map geometry, A* route finding, line-of-sight shooting, reaction delays, reloading, site attacks, planting, defensive positions and retakes. Bots share recent observed contacts. Bot intelligence and reliability are not yet acceptance-tested.
- Prototype grenade throwing, bouncing, HE damage, flash blindness, smoke occlusion, fire areas and decoys. These effects are approximations, not Source-engine simulations.
- HUD, team radar, kill feed, scoreboard and teammate observation after death.
- Original audio restored by the existing importer, with distance attenuation, stereo placement and a simple wall-occlusion gain reduction. Every firearm has an exact firing-audio mapping; complete event timing, surface footsteps and radio coverage remain incomplete.
- Textured CT/T character ports with retargeted idle, run and crouch motion. Original world-weapon models attach to the character's hand. These locomotion clips are not original CS:GO animation clips.

## Asset provenance

Map: [Workshop 3068466810](https://steamcommunity.com/sharedfiles/filedetails/?id=3068466810), a community CS:GO map port. The original CS:GO BSP from [Workshop 2838933373](https://steamcommunity.com/sharedfiles/filedetails/?id=2838933373) was also inspected, but depends on external game resources.

Animated weapon models, hands and materials are converted from the following community ports, whose authors attribute the assets to Valve and Hidden Path Entertainment:

- [Assault rifles](https://steamcommunity.com/sharedfiles/filedetails/?id=1239501421)
- [Pistols](https://steamcommunity.com/sharedfiles/filedetails/?id=1236324520)
- [Machine guns](https://steamcommunity.com/sharedfiles/filedetails/?id=1233135884)
- [Shotguns](https://steamcommunity.com/sharedfiles/filedetails/?id=1241988706)
- [SMGs](https://steamcommunity.com/sharedfiles/filedetails/?id=1212279803)
- [Sniper rifles](https://steamcommunity.com/sharedfiles/filedetails/?id=1244760503)

Character meshes and materials: [CT port](https://steamcommunity.com/sharedfiles/filedetails/?id=481358078) and [T port](https://steamcommunity.com/sharedfiles/filedetails/?id=481607813), attributed by their uploader to Valve and ported by Vad36.

Interim character locomotion: [GMod animation sources](https://github.com/robotboy655/gmod-animations/tree/9a588af0cb1a2d53de35496ba1737305a877e50c), attributed to **Maxime Lebled, Facepunch Studios LTD / Valve Software**. The converter retargets `combine_soldier_xsi/hold_smg1.smd`, `base_m/runN.smd` and `base_m/crouch_idle.smd`. This is a documented fidelity substitution, not a claim that these are CS:GO's original movement animations.

The user states they have Steam/Valve permission. That statement does not independently establish permission for every community modification. Asset provenance, port alterations and distribution terms still need review before production distribution. No community Lua gameplay code is included.

## Conversion

Use Blender 5.0.1 and [SourceIO](https://github.com/REDxEYE/SourceIO) at commit `472e81542a6750cf3c282daac41af96a2f5d4fd3`. SourceIO is an external conversion dependency and is not vendored.

1. Download Workshop items using SteamCMD: `steamcmd +login anonymous +workshop_download_item 4000 ITEM_ID +quit`.
2. Inspect and extract the `.gma` using `conversion/unpack-gma.mjs`. Pass `--all` for weapon materials/models. It checks file boundaries, CRC32 and extraction paths.
3. Older Workshop downloads have an LZMA wrapper. Expand that wrapper before GMA extraction; validate all GMA member CRCs rather than ignoring decompression failures.
4. Set `SOURCEIO_PARENT` to the directory containing the `SourceIO` checkout. Run Blender with `conversion/convert-map.py -- INPUT_BSP OUTPUT_DIRECTORY`.
5. The converter must export only visible objects. Exporting SourceIO's hidden master-instance collection duplicates unplaced, unscaled prop meshes and breaks collision.
6. Run `npm install` inside this tool, then `node conversion/bake-navigation.mjs OUTPUT_DIRECTORY/dust2.glb OUTPUT_DIRECTORY/navigation.json`. Keep the largest connected walkable component; decorative surfaces and crate tops are not valid bot destinations.
7. Copy `dust2.glb`, `entities.json` and `navigation.json` into `assets/map/`. Run `conversion/convert-model.py` for each weapon MDL; put the resulting GLBs into `assets/viewmodels/`.
8. Check the GLBs for `missing_` images. This SourceIO revision can fail the first texture lookup. Set `CSGO_BUILD_ROOT` to a build directory containing `rifles/materials`, `weapons/materials` and `models`. Run Blender with `conversion/repair-textures.py`, then `node conversion/patch-glb-textures.mjs "$CSGO_BUILD_ROOT"` to replace missing images from their original VTF files. Copy the repaired GLBs to `assets/viewmodels/`.
9. Verify converted assets against `game-assets-lock.json`. That lock records this build's outputs; a future Blender/SourceIO change requires an intentional lock update and visual review.

Additional conversion steps:

- Run `conversion/convert-weapons.py --world` to convert third-person weapon models. `--resume` skips existing outputs.
- `repair-materials.py` repairs materials that have no base-color texture at all, a different failure from `missing_` images. Set `CSGO_BUILD_ROOT` and `CSGO_MODELS` to the source root and output GLB directory. Apply it to viewmodels and worldmodels.
- For character conversion, pass the pinned `gmod-animations` checkout as the third argument to `convert-model.py`. Use `csgost61pm.mdl` for CT and `csgopheonix1pm.mdl` for T. Restore missing textures with `CSGO_MODELS` pointing at the converted character directory.
- `repair-map-alpha.py -- MAP_GLB PAKFILE_ZIP PNG_OUTPUT_DIRECTORY` restores 20 alpha-tested/translucent VMT materials from the original VTF data. It does not restore baked lighting.

Generated map, audio, OBJ and GLB files stay outside Git. Their hashes and conversion code are committed.

The converted assets have structural tests for all 34 viewmodels, including animation clips and absence of missing-texture placeholders. These tests do not certify correct animation timing, materials or pose for every weapon.

## Controls

WASD moves; mouse aims; left click fires; right click scopes supported weapons; Shift walks; Ctrl/C crouches; Space jumps; R reloads; B opens buying; E picks up nearby weapons or holds to plant/defuse; 1/2/3 select primary/secondary/knife; 4 throws the first carried grenade; G drops the bomb or current weapon; F inspects the held weapon; Tab shows the scoreboard; Escape pauses. Mouse capture requires a browser user gesture. Desktop keyboard and mouse are required; the narrow-screen UI is not a touch-control implementation.

`?quality=low` reduces render resolution for software-rendered testing. It does not change gameplay. `render_game_to_text()`, `advanceTime(ms)` and `__test` are development-only QA hooks.

## Still blocking completion

- Reference build, exact weapon/economy values, movement, penetration, recoil and grenade physics are not validated against CS:GO.
- The map port, simplified lighting/material conversion and sky are not visually equivalent to the original renderer. Restored alpha materials still need reference-camera comparison.
- Character locomotion is retargeted GMod motion. Per-weapon character poses, world-weapon attachment alignment and first-person animation timing need reference review.
- Bot tactics, grenade use, retakes, obstacle recovery and an entire match need repeatable browser/soak tests. A connected graph alone does not prove successful physical navigation.
- Audio lacks a complete verified event map, occlusion and radio/announcer coverage.
- Production loading, disposal, full localization and theme integration remain open. Presentation-hardware performance has not been measured.
- An independent Chinese-copy review and maintainer review are pending.

`node parity-gate.mjs` must continue to fail until these requirements have actual acceptance evidence. Passing unit tests is not evidence of 95% gameplay parity.
