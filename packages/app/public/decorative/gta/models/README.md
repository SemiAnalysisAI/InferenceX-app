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

## File inventory

Every file in this folder as shipped. The date is the day the file was first committed to this repository (from git), which is the closest record there is of when it was fetched; the hash is of the shipped file.

| File                 | Bytes   | Added to repository | SHA-256                                                            |
| -------------------- | ------- | ------------------- | ------------------------------------------------------------------ |
| `adder.glb`          | 1826120 | 2026-10-08          | `8ff3832227e86447c2093eef58bb53179d41cd04cba1716c300536762d7cd964` |
| `asea-lod.glb`       | 213712  | 2026-10-09          | `057ef894aecc8d730e0720105e7208f55de5a71ca16efa4609f6bb144d4bb397` |
| `asea.glb`           | 314628  | 2026-10-09          | `09d580723227a271ede99fde340e08970af08683f51c3872f5492d543731575b` |
| `baller-lod.glb`     | 117076  | 2026-10-09          | `c71bab15c2f789bb99789853f5868965b1b7e43e181fac92371dbb12cd4d62fd` |
| `baller.glb`         | 220852  | 2026-10-09          | `b2071874fffb62adab9e9a9bd4280d4a3e28a02200c49ca39c2819f9e2c8d055` |
| `bench.glb`          | 139200  | 2026-10-08          | `1d3c0aeff22f33527504f23b9d7c4e7f315bf94c5181d81f282fd9c2dcdedbf5` |
| `bin.glb`            | 108716  | 2026-10-08          | `d6ee79b87884d1ef37c76aa6b0107c7553acb751f5475f791ec79ce6ac08802b` |
| `blista-lod.glb`     | 136528  | 2026-10-09          | `5dee84b1e0fd48df03e02b6c9bee5aef4a6729f1002ff2aeb0c11e77ba3bf9b1` |
| `blista.glb`         | 1953236 | 2026-10-08          | `83d21e14b6ca9149a0ba4a5262e86326356163f16bf3eb86e64666b6047e770d` |
| `buffalo.glb`        | 2043924 | 2026-10-08          | `247c7a0e4a9ce7fadbd05ff31ca659cb50ed78c3ebc09cf993333ec4796fbf16` |
| `bus-lod.glb`        | 168772  | 2026-10-09          | `108ac37dc7005d0e1f26d5c8e9a43c61ced944ea356298973a5a93a659332c88` |
| `bus.glb`            | 343056  | 2026-10-09          | `a83e030e0fc41af2cd20883e6c71bdbe5d99cff40f8a8c5187f3ab6e331d0ae2` |
| `busstop.glb`        | 76112   | 2026-10-09          | `4022bb6b2975c81f3fae27f67ca3571d15cb3d541819fe649506136306dd8b66` |
| `dilettante-lod.glb` | 134652  | 2026-10-09          | `7bb7c233cb7bdc2130bee61dc060900bfc01df4f60559affa8db35bc588017d7` |
| `dilettante.glb`     | 229680  | 2026-10-09          | `bde04eb2d8b811a9254349a22b6294ddb644b758f81c26a25671da1d11b8e666` |
| `frogger.glb`        | 1112888 | 2026-10-08          | `588521420b0136b859bed980e9bf5dfac97ef0c970258171c8c39f755b53724b` |
| `hydrant-b.glb`      | 54080   | 2026-10-09          | `17a876690c1aeab2490da9f268289ee048d57bcec923c92a765b999714148ead` |
| `lamp-b.glb`         | 84172   | 2026-10-09          | `c887dd0b1f29e3c9df56148a19af0e15d02de9abcd85d1e2e240633bfac2e11e` |
| `los-santos.glb`     | 8875728 | 2026-10-08          | `8c5fa66b2fae00a3ae59799249e79f38c0f43ccef590a021f8f5760bd1a7e367` |
| `manifest.json`      | 12886   | 2026-10-08          | `a43db906b004c72ac9938c83f05109f8d8907fa44073f5deb808e79a9eb286ad` |
| `meter.glb`          | 3968    | 2026-10-09          | `ec9840f44d2d0c67f1a70f01a046e4c79c935d2d40ac28b980d622fad9a7ffaf` |
| `michael.glb`        | 3001752 | 2026-10-08          | `bf17b639e82bc5890f2c431eea99309526adde99911a7002a16c8cb8f3488e6e` |
| `newsbox.glb`        | 212848  | 2026-10-09          | `a4cc89431a8d5cdfcc54b281d8431f86e4c40e3aefd751d29e443a48188306d8` |
| `ped-business-f.glb` | 356488  | 2026-10-09          | `1d34d067cf05bee7e7bc9a046151f51e30fb592b0708a71c1e05e84c7f44f226` |
| `ped-business-m.glb` | 163244  | 2026-10-09          | `cdf29c1d2d3bf3acc44ce7b778a0a284b0f6e392128ecfd99641ac1565404a4a` |
| `ped-downtown.glb`   | 214348  | 2026-10-09          | `6ac68b4635246d57d848694ccc6ede0d9a7cc43df4768ccf94b11bb5de36527a` |
| `ped-genhot.glb`     | 651724  | 2026-10-09          | `88566c0d858d6d6a31c3416fd69d8c4da1dc00285d725dbdebb1197270c2112b` |
| `ped-hipster.glb`    | 317424  | 2026-10-09          | `2d65d6a5bf6205f6bb16e9887f19d989e79d113bd95052b6a4ba24fffcb241e4` |
| `ped-stbla.glb`      | 318476  | 2026-10-09          | `541b1b79340b116be8c797f819abb1c4e510f995b1e2c09bd129a4ba24fea84b` |
| `ped-tourist-f.glb`  | 314072  | 2026-10-09          | `5e3403233c2a3ece55864f83037ca001fe06d354af4aebf721693c158ccaaf2f` |
| `ped-tourist-m.glb`  | 354984  | 2026-10-09          | `b84e290ecf68d5868ebe39a4be6f5769497eaa6444d969981d3555c5f0385736` |
| `police-lod.glb`     | 242904  | 2026-10-09          | `328411be19f0535959e1b2a32f6c7e1648b23877f853021f5fe195d2ff09d0af` |
| `police.glb`         | 2316024 | 2026-10-08          | `bba72bec2aade85e8a79c8813c411ff211ef9d4ee30a5f9b6ec9818b0ab0244a` |
| `raiden-lod.glb`     | 149324  | 2026-10-09          | `89b58326092e2163eeb2ed63e4416a32e13dcbebed08017df6c515f0ac4726d8` |
| `raiden.glb`         | 285320  | 2026-10-09          | `130127992405f143b29f74c2267aeeed6205513946487c0e20cdefd865ba1172` |
| `signal-b.glb`       | 10088   | 2026-10-09          | `22d2a59b3b564e69c2a559c9b83e9ac640c01824124e63db573dbb82e84a0389` |
| `speedo-lod.glb`     | 177456  | 2026-10-09          | `07623ba61e0a51012678ded76a62344ab839f8240605ee4a2cc4d3dd47f9b542` |
| `speedo.glb`         | 273320  | 2026-10-09          | `226431b46c99f4ba9821aea4140da428114dff7a06f03cc2bdf72b1040a6f4fe` |
| `stanier-lod.glb`    | 128692  | 2026-10-09          | `6413f8579a9d8ee50e225150a8617b9b169777819a0b8b2eaf1eff878182b220` |
| `stanier.glb`        | 211400  | 2026-10-09          | `9fad249ef016348e07c5589e0902f6a969b968f5f3085f71fe6edf9fddb61429` |
| `taxi-lod.glb`       | 336332  | 2026-10-09          | `577c8ba61eb959d0cd04ca0b7666a8b29bd89f65ddca4b0cf012df7c44355b0a` |
| `taxi.glb`           | 2256788 | 2026-10-08          | `6854f1163190eb5534c6c42a22435074f0840048979c31289dc75f990b361df1` |
| `tree-cypress.glb`   | 218476  | 2026-10-09          | `a5d74fd75b5980710555190c952f97104833f803d2f00c7e6a5ed757df0b0d8c` |
| `washington-lod.glb` | 204184  | 2026-10-09          | `d76a117da49a59f795f3f57dca2f76cdb847e1ae17b90662fe33c26185a3aa29` |
| `washington.glb`     | 309996  | 2026-10-09          | `68257567b7f0b0a5998d73fd914e564c632d03777cd076c24e9d22dde4c9ce6f` |
