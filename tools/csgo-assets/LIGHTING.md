# Baked world lighting

The renderer now restores the map port's baked light samples for 2,773 world
surfaces. This is the port's lighting, not a verified original CS:GO render.
Displacement terrain, static props, brush entities and character lighting remain
outside this restoration. Dynamic shadows, tone mapping and exposure have not
been qualified against an agreed original build.

## Data and conversion

Input: `de_dust2new.bsp` from
[Workshop 3068466810](https://steamcommunity.com/sharedfiles/filedetails/?id=3068466810).
SHA-256: `0f91e0a20297ab32eb2bad31e9cd77d585de1ec82cadd6961e9373e7f16962a6`.

The extractor reads Source BSP version 20 world-model faces, texture vectors,
lightmap vectors and lighting samples. The
[Valve Developer Community BSP format documentation](https://developer.valvesoftware.com/wiki/Source_BSP_File_Format)
describes `ColorRGBExp32` as three color bytes multiplied by two to a signed
exponent, and identifies the flat lightmap used when bump mapping is disabled.
The renderer decodes that representation to linear half-float RGB, normalized
by 255, and multiplies it into the existing diffuse textures.

```sh
node tools/csgo-assets/conversion/extract-world-lighting.mjs \
  /path/to/de_dust2new.bsp tools/csgo-assets/lighting
```

`lighting/world.json` locks the geometry and atlas hashes. Geometry uses the
same Source-to-meter coordinate transform as the existing importer. The atlas
has replicated one-luxel borders to prevent neighboring faces bleeding during
bilinear filtering. The original collision mesh is unchanged.

The restored geometry replaces only matching `world_geometry` material groups.
Four world faces without baked samples retain neutral lighting rather than being
discarded with their replaced material groups.
Materials without a matching restored group retain their old rendering.
`__test.lighting` reports the loaded surface count and replaced material groups.
The raw data and extraction tests are implementation evidence, not visual
acceptance or a 95% score.
