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
