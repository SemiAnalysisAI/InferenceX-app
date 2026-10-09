# Playable Minecraft

> **Just for fun.** Easter egg themes and games do not need stable infrastructure, may be deleted at any point, and must never have tests. Any tests referenced below are legacy and should be deleted, not fixed or extended. See [Testing](./testing.md#easter-egg-themes-and-games).

Select **Minecraft** in the theme picker, then **Play Minecraft** in the banner
under the header. The game opens in a dialog and is imported only after the
button is pressed; the dashboard, charts and data are unchanged.

## What is in the game

- Title screen with the rotating vanilla panorama, splash text, Singleplayer,
  Options and Quit. Singleplayer lists saved worlds (play, delete, create).
- Create New World: name, seed (text seeds are hashed like vanilla), Survival or
  Creative, and Peaceful/Easy/Normal/Hard difficulty.
- Infinite, seeded terrain in 16×16×128 chunks streamed around the player:
  plains, forest, birch forest, taiga, snowy, desert, mountains, ocean, beach
  and river biomes, caves, coal/iron/gold/redstone/lapis/diamond ores in
  depth bands, deepslate, bedrock, oak/birch/spruce trees, cacti, sugar cane,
  flowers, grass and lakes. The same seed always produces the same world.
- 85 blocks and 149 items with the vanilla textures, 74 crafting recipes
  (2×2 inventory grid and 3×3 crafting table, shaped and shapeless, tag
  ingredients such as any planks) and 20 furnace recipes with fuel burn times.
- Survival rules: vanilla mining times by hardness, tool kind and tier,
  harvest gating (stone needs a pickaxe, iron ore a stone pickaxe, diamond an
  iron pickaxe), tool durability, item drops and pickup, health, hunger,
  saturation and eating, fall, drowning, lava, fire, cactus and mob damage,
  death screen and respawn, and experience levels.
- Creative: instant breaking, flight (double-tap Space), the creative item
  grid with search, and middle-click pick block.
- Sky and sky-light and block-light (torches, glowstone, lava, furnaces)
  with smooth lighting and ambient occlusion, day/night cycle with sun, moon,
  stars and moving clouds, fog, flowing water and lava with source blocks,
  water + lava making obsidian/cobblestone, falling sand and gravel, crop
  growth, saplings growing into trees, TNT, doors, ladders, chests and furnaces.
- Mobs with vanilla models and skins: zombies, skeletons (arrows) and creepers
  (explosions) spawn in the dark on Easy and above; pigs, cows, sheep (shearing
  and wool) and chickens spawn with the terrain and drop food.
- HUD: hotbar, hearts, hunger, air bubbles, experience bar and level, held item
  name, chat, F3 debug screen, F1 hide HUD, F5 first-person/back/front camera
  with the player model.
- Inventory, crafting table, furnace, chest and creative screens with vanilla
  slot behavior: left/right click, shift-click transfer, drag to split evenly
  or place one each, double-click collect, number keys to swap with the hotbar,
  Q to drop, and tooltips.
- Chat commands: `/gamemode`, `/time`, `/tp`, `/give`, `/summon`, `/kill`,
  `/difficulty`, `/seed`, `/spawnpoint`, `/clear`, `/help`.
- Options: FOV, render distance, mouse sensitivity, GUI scale, brightness,
  volume, view bobbing and clouds. Settings persist in
  `localStorage` (`inferencex-minecraft-options`).
- Sounds from the vanilla asset index for digging, steps, mobs, explosions,
  doors, chests and UI clicks, gated by the theme's existing sound toggle.

## Controls

| Input                   | Action                                           |
| ----------------------- | ------------------------------------------------ |
| Click the world         | Capture the mouse                                |
| Mouse                   | Look                                             |
| W A S D                 | Move                                             |
| Space                   | Jump; swim up; double-tap to fly in Creative     |
| Shift                   | Sneak; fly down                                  |
| R, Ctrl or double-tap W | Sprint                                           |
| Left click (hold)       | Mine or attack                                   |
| Right click             | Place, use, eat, open containers                 |
| Middle click            | Pick block                                       |
| 1-9 or wheel            | Select hotbar slot                               |
| E                       | Inventory                                        |
| Q                       | Drop item (Ctrl+Q drops the stack)               |
| T or /                  | Chat and commands                                |
| F1 / F3 / F5 (or V)     | Hide HUD / debug screen / camera                 |
| Escape                  | Close a screen, pause; on the title screen, exit |

Touch devices get a movement stick (push fully forward to sprint), a look area
(drag to look, tap to place or use, hold to mine or attack), Jump and Sneak
buttons, a tappable hotbar, and on-screen menu buttons.

## Lifecycle

- `MinecraftPlayBanner` (in `minecraft-theme.tsx`) renders the launcher and
  dynamically imports `components/minecraft/game/minecraft-game-dialog.tsx`.
  The game code, CSS, textures, models and sounds are not requested until the
  button is pressed. Light, dark and the other themes request none of it.
- Worlds save to `localStorage` every 30 seconds, on pause, on Save and Quit,
  and when the dialog closes: the index is `inferencex-minecraft-worlds` and each
  world is `inferencex-minecraft-world-<id>`. Only edited blocks are stored
  (terrain regenerates from the seed), plus player state, inventory, entities,
  chests and furnaces. A full or disabled storage shows a chat warning.
- Escape is routed through the game first: it closes open screens and toggles
  the pause menu while playing, and closes the dialog only from the title
  screen. Focus returns to the launcher. Closing stops the render loop, releases
  the pointer lock, disposes WebGL resources and removes listeners.
- The world renders with three.js using a single texture atlas, per-chunk
  meshes with cutout and translucent passes, and a fixed 20 Hz simulation tick
  with render interpolation.
- Embedded views hide the launcher, as with the other theme banners.

## Source layout

`packages/app/src/components/minecraft/game/`:

| File                 | Responsibility                                                     |
| -------------------- | ------------------------------------------------------------------ |
| `mc-blocks.ts`       | Block registry: textures, hardness, tools, light, shapes, sounds   |
| `mc-items.ts`        | Items, tools, food, fuel, recipes, smelting and mining time        |
| `mc-noise.ts`        | Seed hashing, PRNG and simplex noise                               |
| `mc-world.ts`        | Terrain generation, chunks, lighting and fluids                    |
| `mc-physics.ts`      | AABB collision, movement, raycasts                                 |
| `mc-game.ts`         | Game rules, player, mobs, containers, commands, ticks              |
| `mc-mesher.ts`       | Chunk meshing with smooth light and ambient occlusion              |
| `mc-models.ts`       | Vanilla entity box models and poses                                |
| `mc-renderer.ts`     | three.js scene, sky, particles, entities, first/third person views |
| `mc-audio.ts`        | Sound playback                                                     |
| `mc-save.ts`         | World serialization and `localStorage`                             |
| `mc-ui.tsx`          | HUD, screens, item icons, buttons, sliders, panorama               |
| `minecraft-game.tsx` | Phases, menus, input, loop and overlays                            |
| `mc-atlas.ts`        | Generated atlas, icon and sound tables                             |

`packages/app/scripts/build-minecraft-game-assets.py` rebuilds the atlases, GUI
textures, panorama and sounds from a client jar, a 1.20.1 jar (classic entity
skin layouts) and the launcher asset index. See
`packages/app/public/decorative/minecraft/game/README.md` for provenance.

## Data/API coverage exclusion

This is an optional presentation feature with no new route or data view. It
changes no benchmark filters, model selection, metrics, calculations, share
parameters, or returned data. It therefore uses the presentation-only
exclusion from API and `@semianalysisai/inferencex-skills` parity.

## Verification

- `mc-game.test.ts`: deterministic generation, bedrock and ores, lighting,
  crafting (shaped, shifted, shapeless, 3×3 only), smelting, vanilla mining
  times and harvest tiers, gravity and collision, raycasts, drops and pickup,
  placement, inventory clicks and drag distribution, furnace smelting, fluids
  and obsidian/cobblestone, fall damage, death and respawn, commands, mob
  determinism and save round trips.
- `cypress/e2e/minecraft-game.cy.ts`: asset isolation on light and dark, launch
  from the theme, world creation, Escape to pause, Save and Quit, Escape closing
  the dialog with focus restored, and the Chinese mobile launcher.
- Development builds expose `render_game_to_text()` and `mc_debug()`; production
  builds do not.
