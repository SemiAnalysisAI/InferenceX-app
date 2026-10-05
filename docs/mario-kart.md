# Mario Kart theme and 3D race

Select **Mario Kart** (the flag icon) in the theme picker, then **Race in 3D**.
The theme uses a local rendered Luigi Circuit backdrop and the existing dark
chart palettes. The game is imported only after pressing its launcher.

## Play

Complete three laps of Luigi Circuit against three computer-controlled racers.
WASD or arrow keys accelerate, brake, and change lateral position. The course
uses assisted steering: the kart follows the bends while the player chooses
its lane. Driving on the outside shoulder reduces speed.

Hold Space while steering to charge a drift, then release for a short boost.
Shift spends half the boost meter; the meter replenishes during the race.
Contact with an opponent slows the kart. The result preserves finishing order,
including opponents that finish before the player.

P pauses from the driving canvas. The pause card resumes or starts a new race.
Window blur and hidden tabs pause the simulation; returning does not resume
automatically. Touch controls support simultaneous pedals and steering, and
clear released/cancelled pointers. Escape closes the dialog and returns focus
to the launcher. Progress exists only in the mounted game.

## Assets and scope

The track, Mario, and Standard Kart use actual Mario Kart Wii model/texture
assets, converted for WebGL. See the [asset provenance and reported permission](../packages/app/public/decorative/kart/README.md).
This is an original arcade simulation using those assets, not a port of Mario
Kart Wii. There is no Nintendo game code, audio, multiplayer, or leaderboard.

Both English and Chinese UI use the same implementation. Embedded charts
suppress the theme artwork and launcher. Other themes request no kart assets.
Closing the game disposes its GPU resources and listeners, and aborts pending
asset downloads. WebGL/asset failures offer Retry; retry creates a new canvas.
Reduced-motion settings disable camera easing and boost FOV changes.

## Data/API coverage exclusion

This is an optional presentation theme and game, with no new route or data
view. It changes no benchmark filters, model selection, metrics, calculations,
share parameters, or returned data. It therefore uses the presentation-only
exclusion from API and `@semianalysisai/inferencex-skills` parity. Official
and unofficial overlays retain the same dark palette and data semantics.

## Verification

- Engine tests: countdown, acceleration/braking, lane limits, drift release,
  boost budget, contacts, pause, lap wrap, finish freeze, and late finish order.
- Theme tests: picker registry, shared chart classification/palette, lazy
  decoration activation, cleanup, and embed suppression.
- `cypress/e2e/kart-mode.cy.ts`: actual theme selection, asset isolation,
  on-demand launch, Escape/focus restoration, persistence, and Chinese mobile UI.
- Development builds expose `render_game_to_text()` and `advanceTime(ms)`.
  The latter switches off the wall-clock simulation to avoid double stepping.
  Production builds do not expose those hooks.
