# GTA V 3D presentation game

Select the GTA theme, then **Start heist**. The previous 2D Bay Area game
has been removed. Its replacement is a browser-scale custom city sandbox,
not the complete GTA V product or campaign.

## Playable city

The fictional San Paloma district uses 1,817 historical DataSF building
footprints and 611 street centerlines, with approximate heights and polygon
collisions. A compressed original corridor connects Santa Clara campus stops
and San Jose blocks. CC0 Poly Haven façade modules, baked distant façades,
asphalt maps and HDR lighting add architectural detail. The Ferry Building,
Transamerica Pyramid, Oren's Hummus and campus buildings are simplified
interpretations, not surveyed replicas. Four selectable GTA V
cars (Adder, Buffalo, Blista, Taxi) share the roads with 18 traffic vehicles.
The Michael model represents the player on foot and background pedestrians.
The police model represents pursuers. Geometry and available textures are
reused; missing shared texture dictionaries receive explicit material tints.
The character export has no skeleton or animation clips. A custom runtime
skin rig adds distance-driven walking and sprinting, knee bends and opposing
arm swings. It settles when stopped, freezes when paused and gives background
pedestrians independent strides. These are original procedural animations,
not GTA V's animation clips.

Pick up four packages in order, then deliver at the garage. Stop within the
gold ring and press E. Pickups and vehicle collisions raise a wanted level;
stay at least 110 m from every pursuer for 15 seconds to escape. The garage
repairs a stationary vehicle. A run ends on delivery, zero health, or eight
minutes elapsed. Cash and progress are in-memory and reset on closing.

For sightseeing, choose **Explore Bay Area** or open **City map**. Select one
of nine destinations and choose **Set GPS and drive** to retain the current
position, or **Fast travel** to move explicitly to its road stop. Free roam
has no countdown, and visiting a destination does not advance heist rewards.
The minimap follows the street graph. Stops include the Ferry Building,
Transamerica Pyramid, Salesforce Tower, Coit Tower, Golden Gate viewpoint,
NVIDIA and AMD in Santa Clara, and downtown San Jose. The northern scenic
extension and South Bay distances are deliberately condensed.

- WASD/arrows: drive or walk.
- Space: brake; Shift: sprint on foot.
- F: exit a stationary car or reenter within five metres.
- E: collect/deliver; C: chase/close/scenic camera; P: pause; M: map.
- Buttons: change a stationary car, day/night, sound, restart.
- Touch: hold steering and pedals simultaneously; use the action buttons.
- Blur, hidden tab and map opening pause the simulation. Escape closes the
  dialog and restores launcher focus.

## San Andreas flight

The flight button separately loads a low-detail San Andreas model containing
the source terrain/building meshes and a Frogger helicopter model. This is an aerial explorer:
W/S moves, A/D turns, Shift climbs and Space descends. Height is clamped above
the terrain. It has no aircraft physics, on-ground missions, traffic, or
interiors. Returning restores the paused custom-city run.

The source model is not a substitute for GTA V's full streamed world.
The city sandbox's street layout, buildings, mission system and physics are
custom work and are not extracted GTA V gameplay.

## Resource and SEO boundaries

The existing optional-theme lazy boundary is retained. The dialog, Three.js,
game CSS and models are requested only after launch. Selecting GTA alone
does not download the game models. The map is another on-demand download.
Closing aborts fetches, removes input and resize handlers, disposes geometry,
materials/textures and the WebGL context, and closes synthesized engine audio.
No external requests, persistence, or telemetry of player movement is added.

No indexable page, metadata, canonical, hreflang, structured data, benchmark
filter, numerical transformation, or API is changed. This is the documented
presentation-only exclusion from API and `inferencex-skills` coverage.

## Implementation

- `gta-world.ts`: city geometry and street/traffic paths.
- `gta-geography.ts`: DataSF projection, street graph and landmark positions.
- `gta-architecture.ts`: nearby façade instances and distant texture batches.
- `gta-cityscape.ts`: roads, street furniture and original landmark geometry.
- `gta-engine.ts`: deterministic simulation, missions and state transitions.
- `gta-renderer.ts`: asset loading, instanced scenery and disposal.
- `gta-game.tsx`: bilingual controls, accessibility and lifecycle.
- `gta-engine.test.ts`: driving, collision, missions, pause, flight and reset-state tests.
- `cypress/component/gta-heist.cy.tsx`: integrated controls and Chinese UI.
- Existing optional-theme isolation and sanity specs remain the integration guards.

Asset provenance, processing and permission limitations are recorded in
`packages/app/public/decorative/gta/models/README.md` and
`packages/app/public/decorative/gta/architecture/README.md`. The game does
not reproduce GTA V's complete world, campaign or visual fidelity.
