# GTA V Bay Area heist mode

An optional arcade game inside the GTA presentation theme. Select GTA in
the theme picker, then choose **Start heist** in its banner. Escape closes
the dialog and restores focus to the launcher. Other themes and embeds do
not expose the launcher; the game bundle is dynamically imported on demand.

## Gameplay

Collect fictional compute crates from any three of seven office stops, then
deliver them to the safehouse before five minutes expire. Stop inside a
pickup ring and press E or use the Collect button. Crates raise a wanted
meter and add arcade pursuers. Collisions damage the car; reaching zero
health or time ends the run. There are no weapons or real company actions.

- WASD or arrow keys: accelerate, brake/reverse and steer.
- Space: handbrake; E: collect/deliver; P: pause; M: route map.
- Pointer controls support simultaneous steering and pedals on touch devices.
- The map pauses driving; click an office marker or its sidebar entry to
  choose a GPS destination. A purple route follows the schematic road graph.
- Pause/hidden-tab/window blur stops the simulation. New run clears all
  progress. Closing or leaving GTA removes the game and its listeners.

Progress exists only in the mounted game. There is no storage, network
request, leaderboard, analytics of routes, or connection to benchmark data.
Only opening and closing the game emit the existing UI analytics events.

## Geography and assets

The map is a deliberately compressed Bay Area layout, not a street map or
routing service. Locations are city-level references, not exact office
entrances, campus plans, or instructions for entering a real site.

- NVIDIA, Google, Apple and Meta city references use the
  [Built In Bay Area company guide](https://www.builtinsf.com/articles/silicon-valley-ai-companies).
- AMD's Santa Clara location is listed on
  [AMD's corporate locations page](https://www.amd.com/en/corporate/locations.html).
- OpenAI and Anthropic's San Francisco office clusters are described by
  [The San Francisco Standard](https://sfstandard.com/2026/04/07/i-leaderboard-san-francisco-office/).

The playable map, cars, buildings and pursuit markers are deterministic
Canvas drawings, not AI-generated background images. The existing GTA
banner, artwork, logo and locally hosted fonts retain the provenance and
reported-permission notes in the theme's asset READMEs. No GTA audio or
additional extracted game assets are added.

## Implementation and verification

- `heist-world.ts`: map geometry, water/building collision and road routing.
- `heist-engine.ts`: deterministic fixed-step vehicle and mission simulation.
- `heist-renderer.ts`: cached static map, moving cars, route and minimap.
- `heist-game.tsx`: bilingual HUD, focused keyboard input, pointer controls,
  animation lifecycle and development-only text/time test hooks.
- `gta-heist-dialog.tsx`: accessible dialog and focus restoration.

Engine tests cover movement, collection rules, mission completion, failure,
pause, damage cooldowns, water/bridge boundaries and route connectivity.
Cypress component tests cover driving/pause/reset and map selection.
The existing GTA sanity integration test covers launch/close/focus return.

This is a presentation-only game, not a new benchmark view. It changes no
model, workload, filters, calculations, share parameters or returned data.
It therefore uses the documented presentation-control exclusion from
API and `inferencex-skills` coverage.
