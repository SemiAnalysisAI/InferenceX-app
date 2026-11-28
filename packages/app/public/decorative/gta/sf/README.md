# San Fierro city data

San Fierro is a fictional spin-off of San Francisco (the way Los Santos is a
spin-off of Los Angeles). The streets, building footprints, building heights,
street trees, parks, shoreline and rail lines are generated from real map data.
San Jovano is a shrunken South Bay (San Jose and Santa Clara) joined to the city
by US-101.

| File               | Contents                                                                              | Source and license                                                                                                                                                                                |
| ------------------ | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `city.json`        | Roads, buildings, trees, props, parked cars, rails and landmark coordinates in metres | © [OpenStreetMap contributors](https://www.openstreetmap.org/copyright), [ODbL 1.0](https://opendatacommons.org/licenses/odbl/)                                                                   |
| `terrain.png`      | Elevation, Terrarium encoding                                                         | [Mapzen/AWS Terrain Tiles](https://registry.opendata.aws/terrain-tiles/) (USGS 3DEP/NED and others; see the [attribution list](https://github.com/tilezen/joerd/blob/master/docs/attribution.md)) |
| `ground.png`       | Surface class raster (water, park, sand, plaza and so on)                             | Derived from OpenStreetMap, ODbL 1.0                                                                                                                                                              |
| `tex/*.jpg`        | Asphalt, pavement, grass, sand, stucco, brick, siding and concrete PBR maps           | [Poly Haven](https://polyhaven.com/), CC0                                                                                                                                                         |
| `tex/water_n.jpg`  | Water normal map                                                                      | [three.js examples](https://github.com/mrdoob/three.js/tree/dev/examples/textures), MIT                                                                                                           |
| `tex/leaf.png`     | Leaf spray texture                                                                    | Extracted from the GTA V `prop_tree_lficus_02` model (see `../models/README.md`)                                                                                                                  |
| `logos/nvidia.png` | NVIDIA wordmark                                                                       | [Wikimedia Commons: NVIDIA logo](https://commons.wikimedia.org/wiki/File:NVIDIA_logo.svg), trademark of NVIDIA Corporation                                                                        |
| `logos/amd.png`    | AMD wordmark                                                                          | [Wikimedia Commons: AMD logo](https://commons.wikimedia.org/wiki/File:AMD_Logo.svg), trademark of Advanced Micro Devices, Inc.                                                                    |

Real places at their real coordinates include Oren's Hummus (71 3rd St), the
Transamerica Pyramid, Coit Tower, the Ferry Building, City Hall, the Painted
Ladies, Lombard Street, Oracle Park, the Palace of Fine Arts, Sutro Tower,
Alcatraz, the Golden Gate and Bay bridges, Salesforce Tower, the Chinatown
Dragon Gate, Fisherman's Wharf, Pier 39, Ghirardelli Square, NVIDIA Endeavor
and Voyager (Santa Clara), AMD headquarters (Santa Clara) and SAP Center.
Landmark geometry is hand-modelled from published dimensions, not scanned.
Logos are shown only as signage on the companies' own buildings.

## File inventory

Every file in this folder as shipped. The date is the day the file was first committed to this repository (from git); the hash is of the shipped file.

| File                 | Bytes   | Added to repository | SHA-256                                                            |
| -------------------- | ------- | ------------------- | ------------------------------------------------------------------ |
| `city.json`          | 7369588 | 2026-10-09          | `b0cfbcad19484f01526411810d9c4380018a35f9be12b4964cd861be562c755c` |
| `ground.png`         | 190274  | 2026-10-09          | `6b93798e1467ea5960c14e12d189f3dd333585286cda2d8171a95e61001a1c7b` |
| `logos/amd.png`      | 39637   | 2026-10-09          | `7a7189fa44e704cab90131e8e2f0b0f37502e4c42fb38245802504e9ef457459` |
| `logos/nvidia.png`   | 66841   | 2026-10-09          | `6f69da9f1eb88f5a85493d952b5530a4b535a01df0fc04df93953813e7fe7256` |
| `terrain.png`        | 1689338 | 2026-10-09          | `5685ca4a1e2dba8e6b92e6b4259a814bcb248f37f636a8d6919fc1c0e3980db7` |
| `tex/asphalt.jpg`    | 392439  | 2026-10-09          | `28ccf0254044f83e096db02989d3fb3e2f3c2302024ee973bb23a30d07103d28` |
| `tex/asphalt_n.jpg`  | 57916   | 2026-10-09          | `046e52f96d8ec5c603ef5392d3b3e9e0fb01a46bdf06bf2cb060026e7fb4ff9d` |
| `tex/brick.jpg`      | 79602   | 2026-10-09          | `499f3f043719b3ee2969a4f46a0d0d6d0d155d9f08338297ec96b5f272a616e3` |
| `tex/brick_n.jpg`    | 68089   | 2026-10-09          | `da71fe276ce25086eff8845185b7ee4fcd3b012b1a28701933fc2750fa0a3a57` |
| `tex/concrete.jpg`   | 25626   | 2026-10-09          | `e4cab7a10a30927a9697a74df7baebf8ed2b3d0ab897207254c937e85f287803` |
| `tex/concrete_n.jpg` | 7009    | 2026-10-09          | `1a62e8262f3e0c7b4d5b6e6f447fcd6d35d7f1743c10ed2690c0e01657406d5a` |
| `tex/grass.jpg`      | 204808  | 2026-10-09          | `007b64664e874879f5f49acd30c466836f7319bed52787f52fa0c3f34458dfbe` |
| `tex/hills.jpg`      | 232727  | 2026-10-09          | `5778ca7042842095249db7f6255020233f0b55eb6528b9cf29a7518bc7a546b1` |
| `tex/leaf.png`       | 305966  | 2026-10-09          | `35944535fa8e9b0930954226cf8dc6ea3ae75de315005dfaacc7a17c3d98739c` |
| `tex/pavement.jpg`   | 235271  | 2026-10-09          | `76a6d7c910e4e97c5e9eed48e5b07127d2664b32481918fe707306897560fd76` |
| `tex/pavement_n.jpg` | 49098   | 2026-10-09          | `4929694a0dc0909f9a4dbc7280a6be466e1b0087e5cdc1c91d8c69f0b71d9172` |
| `tex/sand.jpg`       | 61210   | 2026-10-09          | `3f448289babbe6c2c1f4bd5a217ac5fdf4c45f6634410786a2561abefb5dc847` |
| `tex/siding.jpg`     | 25126   | 2026-10-09          | `97cab57b29f14e71c476b286e590646383450ed636f922df1a36af51cd77ee4d` |
| `tex/siding_n.jpg`   | 72473   | 2026-10-09          | `e6c738eb2b0f0d4d95bdb2a7b36e47535470c7dab47b88e80128987f61c19e29` |
| `tex/stucco.jpg`     | 2524    | 2026-10-09          | `a5e41f7c65709101d7f3007f42f78abd9bd2b2a2c7f12bd0022dcb6c031752d7` |
| `tex/water_n.jpg`    | 57185   | 2026-10-09          | `dd6a8f1f6907fad74ed08806a952b165b1c693d6348ec3b27c6e9c69ba24e99f` |
| `tex/yard.jpg`       | 79741   | 2026-10-09          | `b42d131fb97b676ad3f0dc0af29f80a2afcd55fdd9048940342582244c89ea44` |
