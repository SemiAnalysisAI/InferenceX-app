# Mario Kart theme and 3D race

Select **Mario Kart** (the flag icon) in the theme picker, then **Race in 3D**.
The theme uses a local rendered Luigi Circuit backdrop and the existing dark
chart palettes. The game is imported only after pressing its launcher.

## Play

Pick one of eight racers (Mario, Luigi, Peach, Daisy, Yoshi, Toad, Donkey Kong,
Bowser) and an engine class (50cc, 100cc, 150cc), then race three laps of Luigi
Circuit against the other seven. Light racers accelerate and drift harder,
heavy racers have the highest top speed and win collisions.

There is no assisted steering. The kart goes where it points: holding
accelerate alone drives straight into the first wall. Collision, walls, curbs,
offroad, sand, and water come from a surface map rasterized from the course's
own collision materials, so cutting across grass is slower and falling into
the water brings out Lakitu to put you back on the road.

| Control                    | Action                                                   |
| -------------------------- | -------------------------------------------------------- |
| W / ↑                      | Accelerate                                               |
| S / ↓                      | Brake, then reverse                                      |
| A D / ← →                  | Steer                                                    |
| Space (or X)               | Hop; hold while steering to drift                        |
| Shift / E                  | Use item. Hold to drag bananas or shells behind the kart |
| S while releasing the item | Throw shells and Bob-ombs backward                       |
| C                          | Look back                                                |
| P                          | Pause                                                    |

Drifting charges blue then orange sparks; releasing gives a mini-turbo or super
mini-turbo. Pressing accelerate just after the 2 in the countdown gives a rocket
start; pressing too early burns out. Following close behind another racer
builds a slipstream.

The nine boost panels on the final banked bend give a one-second boost on
contact. Banking is drivable terrain, not a vertical barrier. Drift steering
uses speed-dependent handling so ordinary bends allow natural blue/orange
charge; a low-speed hop held through acceleration can also enter a drift.

Item boxes sit in three rows around the course. The roulette lands on an item
weighted by position, as in the original: front runners mostly see bananas and
green shells, back markers see stars, triple mushrooms, Golden Mushrooms, and
lightning. Items: Mushroom, Triple Mushroom, Golden Mushroom, Banana, Triple
Banana, Green Shell, Triple Green Shells, Red Shell (homes on the racer ahead),
Star, Bob-omb, and Lightning (shrinks every rival and takes their items).
CPU racers use the same controls and items, drift for mini-turbos, avoid
hazards, back out after hitting walls, and use mild rubber-banding.

The HUD shows position, lap, race time, the item slot and roulette, live
standings with racer icons, a course minimap with racers, boxes, and
projectiles, speed, drift spark stage, and final lap and wrong way banners.
Lakitu runs the start lights, shows the reverse sign, and waves the finish
flag. The results card lists every racer's time (projected for racers still
on course) and your lap splits.

P pauses from the driving canvas. Window blur and hidden tabs pause the
simulation. Touch controls (←, →, Drift, Item, Brake, Accelerate) support
simultaneous presses. Escape closes the dialog and returns focus to the
launcher. Sound is synthesized with WebAudio after Start; Mute toggles it.

## Assets and scope

The track, all eight racers, the Standard Kart, items, item boxes, and Lakitu
use actual Mario Kart Wii model/texture assets, converted for WebGL. See the [asset provenance and reported permission](../packages/app/public/decorative/kart/README.md).
This is an original arcade simulation using those assets, not a port of Mario
Kart Wii. There is no Nintendo game code, audio, multiplayer, or leaderboard.

Both English and Chinese UI use the same implementation. Embedded charts
suppress the theme artwork and launcher. Other themes request no kart assets.
Closing the game disposes its GPU resources and listeners, and aborts pending
asset downloads. WebGL/asset failures offer Retry; retry creates a new canvas.
Reduced-motion settings disable camera easing, shake, particles, and boost FOV changes.

## Data/API coverage exclusion

This is an optional presentation theme and game, with no new route or data
view. It changes no benchmark filters, model selection, metrics, calculations,
share parameters, or returned data. It therefore uses the presentation-only
exclusion from API and `@semianalysisai/inferencex-skills` parity. Official
and unofficial overlays retain the same dark palette and data semantics.

## Verification

- Engine tests (on the real surface map): countdown, throttle-only does not
  finish, a steering driver finishes, all CPU racers finish, steering, offroad,
  braking/reverse, drift stages and mini-turbo, rocket start and burnout, item
  boxes and roulette, mushroom, banana, green and red shells, star, lightning,
  Golden Mushroom, pause, and standings.
- Theme tests: picker registry, shared chart classification/palette, lazy
  decoration activation, cleanup, and embed suppression.
- `cypress/e2e/kart-mode.cy.ts`: actual theme selection, asset isolation,
  on-demand launch, Escape/focus restoration, persistence, and Chinese mobile UI.
- Development builds expose `render_game_to_text()`, `advanceTime(ms)`, and `kart_race()`.
  The latter switches off the wall-clock simulation to avoid double stepping.
  Production builds do not expose those hooks.
