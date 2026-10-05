# Mario Kart Wii assets

These are Nintendo game assets, not assets covered by this repository's code license.
On 2026-10-05 the requesting maintainer reported that Nintendo had granted permission
and asked that the assets be sourced directly. That is a maintainer-reported
permission, not an independently reviewed license or a claim of Nintendo endorsement.
No music, sound effects, game executable, or game code is included.

## Sources and credits

| Asset         | Archive source                                                                                                                                                         | Archive SHA-256                                                    | Submission credit |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ | ----------------- |
| Luigi Circuit | [Model page](https://models.spriters-resource.com/wii/mkwii/asset/302599/), [ZIP](https://models.spriters-resource.com/media/assets/299/302599.zip?updated=1755500894) | `8d8d0530f64467a597196d87420068c1cf5bd823b895c6a2ef0b530f6bbe6837` | Peardian          |
| Standard Kart | [Model page](https://models.spriters-resource.com/wii/mkwii/asset/310115/), [ZIP](https://models.spriters-resource.com/media/assets/307/310115.zip?updated=1755502730) | `d9770928a5db051204df7b9184bd91be93482cd15055a2673d79870216237433` | Tyler Cretal      |
| Mario         | [Model page](https://models.spriters-resource.com/wii/mkwii/asset/302593/), [ZIP](https://models.spriters-resource.com/media/assets/299/302593.zip?updated=1755500892) | `38f483fbaeeacd1be11562e755e2a63da62b531ede74b9334a30e592f219887b` | Dydy1606          |

Downloaded 2026-10-05. Original Luigi Circuit listing:
<https://www.models-resource.com/wii/mariokartwii/model/19812/>.

## Browser conversion

- `luigi-circuit.gltf`: `Luigi Circuit/course_fix.dae` and `vrcorn_fix.dae`,
  parsed with Three.js ColladaLoader, then exported with GLTFExporter.
  Embedded PNG textures and geometry buffers avoid external runtime requests.
  Static bone transforms are baked into vertex positions. Materials use unlit
  rendering for the baked game textures. Separate shadow-overlay meshes are
  omitted because their source compositing is not reproduced by the glTF material.
- `mario-kart.gltf`: `Standard Kart/Medium/menu.dae` with `body_mr.png`,
  and `Mario/model_cpu (kart).dae`, `mario_all.png`, and `mario_eye.0_fix.png`.
  The kart's source up-axis is corrected; the two assets are normalized separately,
  positioned together, and exported as static textured geometry. Mario's source
  material references are resolved explicitly to the original textures.
- `circuit.webp` and `circuit-mobile.webp`: screenshots of these converted assets
  in the game's renderer, without HUD, resized to 1600×900 and a 640×900 crop.
  They are not screenshots of Nintendo's game executable.

The track geometry and textures are sourced from the game. Assisted steering,
centerline, lap timing, opponents, boosts, collision rules, HUD, and colored racer
rings are original application code, not Nintendo's physics or game implementation.
