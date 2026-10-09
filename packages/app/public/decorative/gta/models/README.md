# GTA V model provenance

These model files contain Rockstar Games assets converted by third parties.
The requesting user reports Rockstar permission for this project. That
permission and its precise redistribution scope have not been independently
verified. Public download availability is not a license grant. These files
are not relicensed under the source code's license.

Retrieved October 6, 2026. The public
[GTADevs database](https://gtadevs.com/) describes its previews as real GTA
models extracted from game files. Original GLB URLs:

| Local file           | Original model                                                  |
| -------------------- | --------------------------------------------------------------- |
| `adder.glb`          | https://models.gtadevs.com/vehicles/adder.glb                   |
| `buffalo.glb`        | https://models.gtadevs.com/vehicles/buffalo.glb                 |
| `blista.glb`         | https://models.gtadevs.com/vehicles/blista.glb                  |
| `taxi.glb`           | https://models.gtadevs.com/vehicles/taxi.glb                    |
| `police.glb`         | https://models.gtadevs.com/vehicles/police.glb                  |
| `michael.glb`        | https://models.gtadevs.com/peds/player-zero.glb                 |
| `bin.glb`            | https://models.gtadevs.com/objects/prop-bin-01a.glb             |
| `bench.glb`          | https://models.gtadevs.com/objects/prop-bench-01a.glb           |
| `asea.glb`           | https://models.gtadevs.com/vehicles/asea.glb                    |
| `stanier.glb`        | https://models.gtadevs.com/vehicles/stanier.glb                 |
| `dilettante.glb`     | https://models.gtadevs.com/vehicles/dilettante.glb              |
| `raiden.glb`         | https://models.gtadevs.com/vehicles/raiden.glb                  |
| `baller.glb`         | https://models.gtadevs.com/vehicles/baller.glb                  |
| `speedo.glb`         | https://models.gtadevs.com/vehicles/speedo.glb                  |
| `washington.glb`     | https://models.gtadevs.com/vehicles/washington.glb              |
| `bus.glb`            | https://models.gtadevs.com/vehicles/bus.glb                     |
| `ped-business-m.glb` | https://models.gtadevs.com/peds/a-m-y-business-01.glb           |
| `ped-business-f.glb` | https://models.gtadevs.com/peds/a-f-y-business-01.glb           |
| `ped-tourist-m.glb`  | https://models.gtadevs.com/peds/a-m-m-tourist-01.glb            |
| `ped-tourist-f.glb`  | https://models.gtadevs.com/peds/a-f-y-tourist-01.glb            |
| `ped-downtown.glb`   | https://models.gtadevs.com/peds/a-m-y-downtown-01.glb           |
| `ped-genhot.glb`     | https://models.gtadevs.com/peds/a-f-y-genhot-01.glb             |
| `ped-stbla.glb`      | https://models.gtadevs.com/peds/a-m-y-stbla-01.glb              |
| `ped-hipster.glb`    | https://models.gtadevs.com/peds/a-m-y-hipster-01.glb            |
| `tree-cypress.glb`   | https://models.gtadevs.com/objects/prop-tree-cypress-01.glb     |
| `lamp-b.glb`         | https://models.gtadevs.com/objects/prop-streetlight-03.glb      |
| `signal-b.glb`       | https://models.gtadevs.com/objects/prop-traffic-03a.glb         |
| `hydrant-b.glb`      | https://models.gtadevs.com/objects/prop-fire-hydrant-2.glb      |
| `meter.glb`          | https://models.gtadevs.com/objects/prop-parknmeter-01.glb       |
| `newsbox.glb`        | https://models.gtadevs.com/objects/prop-news-disp-02a.glb       |
| `busstop.glb`        | https://models.gtadevs.com/objects/prop-busstop-02.glb          |
| `los-santos.glb`     | https://gtatoday.com/uploads/maps3d/gta5/model.glb?v=1788761600 |

The additional `frogger.glb` helicopter model is from
https://models.gtadevs.com/vehicles/frogger.glb and loads only in flight mode.

The map is sourced from [GTA Today's 3D map](https://gtatoday.com/maps/gta-5/3d),
which attributes the model to Rockstar Games. Its viewer code is not included
or reused. Its GLB is retained unchanged; the renderer corrects its orientation
and hides the large base box. It is low-detail terrain/city scenery, not the
complete full-resolution game world.

Files ending in `-lod.glb` are simplified copies of the matching vehicle used for
distant traffic and parked cars (gltfpack `-si 0.1`). The vehicles, pedestrians
and street props added for San Fierro were textures-resized and then compressed
with gltfpack (`-cc -kn -km`, meshopt). The renderer registers the meshopt
decoder from three.js.

For the other GLBs, embedded images are resized within 512 × 512 without
upscaling and re-encoded as PNG. Buffer-view offsets are rebuilt on four-byte
boundaries; geometry and UV coordinates are unchanged. `manifest.json` records
SHA-256 hashes of the shipped files and their downloaded originals.

Streetlight/traffic-signal fragments are reattached with custom transforms
because the exported meshes omit the attachment transforms.
Some preview exports lack GTA V's shared textures. Runtime material colors
fill those gaps. Vehicle paint and lighting are custom. The character exports
do not include locomotion animation; the walk/run/idle cycle is procedural. The San Fierro buildings, roads,
crosswalks, landmarks, trees, signs, lighting, mission markers and game logic are original
procedural work generated from open map data (see `../sf/README.md`); they must not be represented as original GTA V assets.

No GTA V music, dialogue, executable code, scripts or campaign data is included.
