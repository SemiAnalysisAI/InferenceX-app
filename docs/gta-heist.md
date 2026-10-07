# GTA V 3D presentation game

Select the GTA theme, then **Start heist**. The game is a browser-scale city sandbox,
not the complete GTA V product or campaign.

## San Fierro

San Fierro is a playable spin-off of San Francisco, named the way Los Santos
stands in for Los Angeles. It is generated from OpenStreetMap data: about 26,000
building footprints with their mapped heights, every street with its lane count
and one-way flags, 39,000 street trees, parks, the shoreline, cable car lines and
US-101. Terrain comes from Mapzen/AWS elevation tiles, so the hills are real.
San Jovano is a shrunken South Bay (San Jose and Santa Clara) joined to the city
by US-101. See `packages/app/public/decorative/gta/sf/README.md` for sources.

Hand-modelled landmarks sit at their real coordinates: Oren's Hummus at 71 3rd
St, the Transamerica Pyramid, Coit Tower, the Ferry Building, City Hall, the
Painted Ladies, Lombard Street, Oracle Park, Salesforce Tower's crown, the
Palace of Fine Arts, Sutro Tower, Alcatraz, the Golden Gate and Bay bridges, the
Dragon Gate, Fisherman's Wharf, Pier 39 and Ghirardelli Square. In San Jovano,
NVIDIA Endeavor and Voyager have faceted triangle-skylight roofs on their real
footprints, AMD headquarters carries the AMD logo, and SAP Center stands
downtown. Cable cars run on the Powell and California lines.

Rendering uses physically based materials: scanned asphalt, pavement, brick,
stucco, siding and concrete textures (Poly Haven, CC0), procedural window grids
and storefronts, lane markings, crosswalks and stop lines, raised curbs, a
physical sky with image-based lighting, camera-following sun shadows, ambient
occlusion and bloom on desktop, and a fog toggle. Phones get a lighter profile
without post-processing.

GTA V vehicles (Buffalo, Adder, Blista, Taxi, Dilettante, Raiden and more) and
eight GTA V pedestrian models fill the streets. Traffic follows real lanes and
stops at junctions. The player and pedestrians use a procedural skeletal walk,
run and idle cycle, since the exported characters have no animation clips.

Five stops: pick up at Oren's Hummus, deliver to the Transamerica Pyramid, meet
a contact at Coit Tower, then drive to NVIDIA Endeavor and AMD HQ. Stop within
the gold marker and press E. Pickups and collisions raise a wanted level; stay
140 m from every pursuer for 15 seconds to escape. A run ends after the last
delivery, at zero health or when the timer expires. Progress is in memory only.

- WASD/arrows: drive or walk.
- Space: brake; Shift: sprint on foot.
- F: exit a stationary car or reenter within five metres.
- E: collect/deliver; C: camera; P: pause; M: map.
- One-tap buttons: San Fierro / San Jovano quick travel (when stopped), change
  car, day/night, fog, sound, restart.
- The radar is drawn from the same map data and rotates with the player. The
  HUD shows the current street and district.
- Touch: hold steering and pedals simultaneously; use the action buttons.
- Blur, hidden tab and map opening pause the simulation. Escape closes the
  dialog and restores launcher focus.

## San Andreas flight

The flight button separately loads a low-detail San Andreas model containing
the source terrain/building meshes and a Frogger helicopter model. This is an aerial explorer:
W/S moves, A/D turns, Shift climbs and Space descends. Height is clamped above
the terrain. It has no aircraft physics, on-ground missions, traffic, or
interiors. Returning restores the paused San Fierro run.

The source model is not a substitute for GTA V's full streamed world.
San Fierro's geometry is generated from open map data, and its mission
system and physics are custom work, not extracted GTA V gameplay.

## Resource and SEO boundaries

The existing optional-theme lazy boundary is retained. The dialog, Three.js,
game CSS and models are requested only after launch. Selecting GTA alone
does not download the game models. The San Fierro data (about 9.5 MB) loads with the game; the San Andreas
flight map is another on-demand download.
Closing aborts fetches, removes input and resize handlers, disposes geometry,
materials/textures and the WebGL context, and closes synthesized engine audio.
No external requests, persistence, or telemetry of player movement is added.

No indexable page, metadata, canonical, hreflang, structured data, benchmark
filter, numerical transformation, or API is changed. This is the documented
presentation-only exclusion from API and `inferencex-skills` coverage.

## Implementation

- `gta-world.ts`: loads `sf/city.json` and the terrain/ground rasters; spatial
  lookups for buildings, lanes, streets, districts and surface height.
- `gta-engine.ts`: deterministic simulation, lane traffic, pedestrians,
  missions, quick travel and state transitions.
- `gta-materials.ts`, `gta-city-mesh.ts`: PBR terrain, road, sidewalk,
  building and water shaders and the generated city meshes.
- `gta-landmarks.ts`: hand-modelled landmarks, logos and cable cars.
- `gta-actors.ts`, `gta-rig.ts`, `gta-trees.ts`: vehicles, skeletal walk
  cycle and procedural trees.
- `gta-renderer.ts`: asset loading, lighting, post-processing, cameras and disposal.
- `gta-minimap.ts`: the radar and overview map drawn from the city data.
- `gta-game.tsx`: bilingual controls, accessibility and lifecycle.
- `gta-engine.test.ts`: simulation tests on the real street network.
- `cypress/component/gta-heist.cy.tsx`: integrated controls, quick travel and Chinese UI.
- Existing optional-theme isolation and sanity specs remain the integration guards.

The data pipeline that produced `sf/` is not part of the app bundle; the
README in that directory records each source and license.

Asset provenance, processing and permission limitations are recorded in
`packages/app/public/decorative/gta/models/README.md` and
`packages/app/public/decorative/gta/sf/README.md`.

# Integration with PR #1285 / 与 PR #1285 集成

The San Fierro world retains the San Paloma branch's nine-stop sightseeing mode,
explicit fast travel, untimed exploration, road-following GPS, scenic camera and
gameplay-warning priority. It replaces the earlier small city geometry rather than
loading two competing world engines.

The San Jovano Connector and Santa Clara Connector are original fictional roads
across gaps introduced by compressing the South Bay. They are rendered as paved
roads, included in the navigation graph and tested for building clearance; they
are not claimed to be real surveyed streets. GPS also joins overlapping sections
of the fictional freeway where they lack shared OSM vertices.

圣菲耶罗保留 San Paloma 分支的九站观光、明确标注的快速旅行、无时间限制的探索、
沿道路显示的导航、观景镜头和游戏警告优先级。较大的新地图替换旧的小型地图，
不同时加载两套城市引擎。

San Jovano Connector 和 Santa Clara Connector 是为连接缩比例南湾区域而设计的
原创虚构道路，实际渲染为铺装道路，纳入导航图并测试建筑净空；它们不是实测街道。
虚构高速路与其他道路重叠但缺少共同 OSM 顶点的位置也纳入导航连接。
