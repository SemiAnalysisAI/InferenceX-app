# GTA V model provenance

These model files contain Rockstar Games assets converted by third parties.
The requesting user reports Rockstar permission for this project. That
permission and its precise redistribution scope have not been independently
verified. Public download availability is not a license grant. These files
are not relicensed under the source code's license.

Retrieved October 6, 2026. The public
[GTADevs database](https://gtadevs.com/) describes its previews as real GTA
models extracted from game files. Original GLB URLs:

| Local file       | Original model                                                  |
| ---------------- | --------------------------------------------------------------- |
| `adder.glb`      | https://models.gtadevs.com/vehicles/adder.glb                   |
| `buffalo.glb`    | https://models.gtadevs.com/vehicles/buffalo.glb                 |
| `blista.glb`     | https://models.gtadevs.com/vehicles/blista.glb                  |
| `taxi.glb`       | https://models.gtadevs.com/vehicles/taxi.glb                    |
| `police.glb`     | https://models.gtadevs.com/vehicles/police.glb                  |
| `michael.glb`    | https://models.gtadevs.com/peds/player-zero.glb                 |
| `palm.glb`       | https://models.gtadevs.com/objects/prop-palm-fan-04-a.glb       |
| `lamp.glb`       | https://models.gtadevs.com/objects/prop-streetlight-01.glb      |
| `signal.glb`     | https://models.gtadevs.com/objects/prop-traffic-01a.glb         |
| `bin.glb`        | https://models.gtadevs.com/objects/prop-bin-01a.glb             |
| `bench.glb`      | https://models.gtadevs.com/objects/prop-bench-01a.glb           |
| `hydrant.glb`    | https://models.gtadevs.com/objects/prop-fire-hydrant-1.glb      |
| `cone.glb`       | https://models.gtadevs.com/objects/prop-roadcone02a.glb         |
| `dumpster.glb`   | https://models.gtadevs.com/objects/prop-dumpster-01a.glb        |
| `los-santos.glb` | https://gtatoday.com/uploads/maps3d/gta5/model.glb?v=1788761600 |

The additional `frogger.glb` helicopter model is from
https://models.gtadevs.com/vehicles/frogger.glb and loads only in flight mode.

The map is sourced from [GTA Today's 3D map](https://gtatoday.com/maps/gta-5/3d),
which attributes the model to Rockstar Games. Its viewer code is not included
or reused. Its GLB is retained unchanged; the renderer corrects its orientation
and hides the large base box. It is low-detail terrain/city scenery, not the
complete full-resolution game world.

For the other GLBs, embedded images are resized within 512 × 512 without
upscaling and re-encoded as PNG. Buffer-view offsets are rebuilt on four-byte
boundaries; geometry and UV coordinates are unchanged. `manifest.json` records
SHA-256 hashes of the shipped files and their downloaded originals.

Streetlight/traffic-signal fragments are reattached with custom transforms
because the exported meshes omit the attachment transforms.
Some preview exports lack GTA V's shared textures. Runtime material colors
fill those gaps. Vehicle paint and lighting are custom. The character export
does not include locomotion animation. The district buildings, roads,
crosswalks, signs, pier, lighting, mission markers and game logic are original
procedural work; they must not be represented as original GTA V assets.

No GTA V music, dialogue, executable code, scripts or campaign data is included.
