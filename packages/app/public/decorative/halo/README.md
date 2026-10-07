# Halo assets

These are Microsoft / Bungie / 343 Industries (Halo Studios) assets, not assets
covered by this repository's code license. On 2026-10-07 the requesting
maintainer reported permission from Bungie and Microsoft to use Halo assets,
fonts and theme music in InferenceX. That is a maintainer-reported permission,
not an independently reviewed license or a claim of endorsement by Microsoft,
Bungie or Halo Studios.

All files were downloaded on 2026-10-07. Images are official Halo Infinite
press-kit releases, fetched from Halopedia's press-kit mirror.

## Artwork

| File                                        | Source                                                                                                                  | Source SHA-256                                                     | Transformation                                                                    |
| ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ | --------------------------------------------------------------------------------- |
| `zeta-halo.webp`, `zeta-halo-mobile.webp`   | [HINF PK ZetaHalo.png](https://www.halopedia.org/File:HINF_PK_ZetaHalo.png) (1920 × 1080)                               | `e8613afe5a2ca6802924439133b575ffd4b9afda7e27f61779bf1eed335ce2ee` | Bottom 105 px (press watermarks) cropped; WebP q78; 720 × 641 centered phone crop |
| `ring-vista.webp`, `ring-vista-mobile.webp` | [Halo Infinite E319 A Ring Vista.jpg](https://www.halopedia.org/File:Halo_Infinite_E319_A_Ring_Vista.jpg) (7680 × 4320) | `61cbc5b3cc97cfa4484930c7716aba52f64f24970106ca05ad332e6df2001fc0` | Left 6% and bottom 10% (watermark) cropped; resized to 1600 / 800 px wide WebP    |
| `halo-logo.webp`                            | [Halo logo (2012-present).png](<https://www.halopedia.org/File:Halo_logo_(2012-present).png>) (3178 × 619)              | `9fa435d9f7fff3b2f0d7b702538940f04ecfd1e8284816ead0ae72d9fd2cb533` | Trimmed to its alpha bounds; resized to 720 px wide WebP with alpha               |

## Music

| File             | Source                                                                                                                                                                                   | Source SHA-256                                                     | Transformation                                                              |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ | --------------------------------------------------------------------------- |
| `halo-theme.mp3` | "Halo Original Title" from the KHInsider [Halo: Combat Evolved gamerip](https://downloads.khinsider.com/game-soundtracks/album/halo-combat-evolved-gamerip-soundtrack-xbox-gamerip-2001) | `99e0945068506013472b676e8ae2ea68c69fca816e7c0bd65d27e595597f0393` | Re-encoded with `ffmpeg` to 44.1 kHz stereo 128 kbps MP3, metadata stripped |

Composed by Martin O'Donnell and Michael Salvatori for Bungie. The track loops
while the Halo theme is selected; the header music toggle (`halo-music` in
`localStorage`) mutes it. See `components/halo/halo-music.tsx`.

Fonts are documented in `src/app/fonts/HALO-FONTS.md`.
