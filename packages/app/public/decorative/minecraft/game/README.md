# Minecraft game assets

These are Mojang Studios assets, not assets covered by this repository's code
license. No Minecraft game code is included; the game is an independent
implementation. No permission from Mojang has been independently verified for
this use. Review the [Minecraft Usage Guidelines](https://www.minecraft.net/en-us/usage-guidelines)
before any public release, and remove this folder if they do not allow it.

Oren confirmed that SemiAnalysis has permission covering redistribution of
these textures and sounds in this browser game in the
[implementation thread](https://github.com/SemiAnalysisAI/InferenceX-app/pull/1287#issuecomment-6029170517).
This records the user's authorization; it is not an independent license review.

## Endgame additions

The Nether/End blocks, items and entity skins are Java 1.20.1 textures from
[the Minecraft assets mirror, commit af628ec0e7977ec2f07c917d51413b4618a8cfcc](https://github.com/InventivetalentDev/minecraft-assets/tree/af628ec0e7977ec2f07c917d51413b4618a8cfcc/assets/minecraft/textures).
`scripts/build-minecraft-endgame-assets.py` appends them to the generated atlas
without renumbering existing tiles and copies the four entity PNGs. Run it after
the base asset builder, passing a directory with the listed source PNGs by
basename. The additional renderer and models are independent code, not Mojang
game code. All of these files remain under the existing optional launch boundary.

## Sources

Extracted on 2026-10-06 by `packages/app/scripts/build-minecraft-game-assets.py`:

| Source                                   | SHA-256                                                            | Used for                                                                                     |
| ---------------------------------------- | ------------------------------------------------------------------ | -------------------------------------------------------------------------------------------- |
| Minecraft Java Edition 26.3 client jar   | `4508d006323f24fa02876310c192d739af56516eb259000ac50f0909a68c9a2d` | block and item textures (`terrain.png`, `icons.png`), GUI, HUD, logo, sky and widget sprites |
| Minecraft Java Edition 1.20.1 client jar | `56b71336d2b4fdffd197f56595b0da93e32a946f78f382a299b8f4b92758bb0f` | classic-layout entity skins (`skin-*.png`)                                                   |
| 26.3 launcher asset index                | `f226e879fbe70d3b105280b3d6d16ec1df279e7e1b426f8d9a17496640758f16` | sounds (`sounds/*.mp3`, transcoded to mono MP3) and title panorama (`panorama-*.jpg`)        |

The jars and the asset index were downloaded from Mojang's official launcher
endpoints (`piston-meta.mojang.com`, `piston-data.mojang.com`,
`resources.download.minecraft.net`). To rebuild:

```sh
cd packages/app
python3 scripts/build-minecraft-game-assets.py <26.3-extract> <1.20.1-extract> <sounds-extract> [panorama-dir]
```
