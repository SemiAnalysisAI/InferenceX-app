# Pointing Muse mascot

`pointing-muse.webp` is an AI-generated, transparent illustration commissioned
for this unofficial-result watermark on October 18, 2026. It is not official
Meta or Muse artwork, and does not imply endorsement of the displayed results.
The unofficial-result warning remains visible over it.

## Generation

- Model: GPT Image 2.5 Flare (`gpt_image_2_5_flare`).
- Pose reference: the user-supplied screenshot of a cream plush mascot leaning
  left, pointing left, with an open-mouth surprised expression.
- Texture/color reference: the portrait at
  https://muse.ai/images/landing/brand/hatch.jpg, also used by the existing
  `public/logos/muse-mascot.webp` icon.
- Output: square transparent PNG, resized to 768 × 768 and encoded as WebP.
  No chart, text, logo, or benchmark data is baked into the illustration.

The reference artwork belongs to its respective owner. The model-icon asset
is unchanged.

## Conversion

```sh
convert pointing-muse-mascot.png -resize 768x768 -quality 86 pointing-muse.webp
```
