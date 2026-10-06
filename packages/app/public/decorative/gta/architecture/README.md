# San Paloma architecture assets

These assets load only after opening the optional GTA game. They do not load on ordinary light/dark pages, embeds, or merely because the GTA theme is selected.

## Downloaded models and textures

| Asset                                           | Author          | Original asset and license                                    |
| ----------------------------------------------- | --------------- | ------------------------------------------------------------- |
| Modular urban apartment façades                 | James Ray Cock  | https://polyhaven.com/a/modular_urban_apartments_facade (CC0) |
| Modular factory façades                         | James Ray Cock  | https://polyhaven.com/a/modular_factory_facade (CC0)          |
| Modular fire escape                             | Juniix          | https://polyhaven.com/a/modular_fire_escape (CC0)             |
| Asphalt 02 diffuse, OpenGL normal and roughness | Rob Tuytel      | https://polyhaven.com/a/asphalt_02 (CC0)                      |
| Urban Street 04 HDR illumination                | Andreas Mischok | https://polyhaven.com/a/urban_street_04 (CC0)                 |

Poly Haven's asset license is documented at https://polyhaven.com/license. The HDR is used for illumination and reflections, not presented as a photograph of San Francisco.

The models are the 1K glTF exports, repacked into self-contained GLBs. Unused modules were removed, textures recompressed, and geometry simplified with meshoptimizer (target ratio 0.18, error 0.002). The wall/window/door/cornice modules and fire escape components are preserved. `manifest.json` records the shipped byte sizes and SHA-256 hashes.

## Geographic data

The optional game's `san-paloma.json` contains a cropped and simplified derivative of these City and County of San Francisco datasets:

- Building footprints: https://data.sfgov.org/Geographic-Locations-and-Boundaries/Building-Footprints/ynuv-fyni
- Street centerlines: https://data.sfgov.org/Geographic-Locations-and-Boundaries/Streets-Active-and-Retired/3psu-pn9h
- Dataset license metadata: https://data.sfgov.org/api/views/ynuv-fyni.json and https://data.sfgov.org/api/views/3psu-pn9h.json, both identifying PDDL.
- DataSF terms: https://data.sfgov.org/terms-of-use

Downloaded October 6, 2026. Bounding box: north 37.799, west -122.410, south 37.785, east -122.389. The footprint dataset derives from a 2010 building model refined in subsequent processing; it is not a current photogrammetric scan. Building heights use `hgt_median_m`, with a 4-metre floor and 260-metre ceiling for the game. Sub-metre vertices and footprints below 24 square metres are omitted. Only active street centerlines are used. Widths are game approximations by street class, not measured carriageway widths.

The local projection origin is longitude -122.4, latitude 37.792. X points east and Z south, in approximate metres. The game uses polygon collision and a connected street graph; overlapping or obstructed survey passages are excluded from vehicle routes.

## Original modeling and scope

San Paloma is a fictional SF-inspired city. The repeated architectural façades are Poly Haven modules, not scans of the corresponding SF buildings. The Ferry Building and Transamerica Pyramid are simplified original interpretations. Their reference sites are https://www.ferrybuildingmarketplace.com/ and https://www.transamericapyramid.com/.

The Oren's Hummus stop refers to the restaurant at 71 3rd Street, listed at https://orenshummus.com/locations/. Its shopfront is an interpretation, not a licensed restaurant interior.

The compressed southern corridor, Santa Clara campuses and San Jose blocks are original game geometry. NVIDIA and AMD are placed in Santa Clara, consistent with their headquarters listings at https://www.nvidia.com/en-us/contact/ and https://www.amd.com/en/corporate/locations.html. They are not measured campus replicas. The South Bay connection is deliberately much shorter than the real journey.

This is a browser sandbox, not the full GTA V game or GTA V-quality photogrammetry. Existing Rockstar-derived character/vehicle assets and their separately reported permission are documented in `../models/README.md`; those permissions do not establish rights to unrelated third-party assets.
