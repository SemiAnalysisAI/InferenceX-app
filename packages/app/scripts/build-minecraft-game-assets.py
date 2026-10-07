#!/usr/bin/env python3
"""Build the Minecraft game's texture atlas, item icons, GUI art and sounds.

Usage:
  python3 scripts/build-minecraft-game-assets.py <current-jar-root> <legacy-jar-root> <sounds-root>

* <current-jar-root>: extracted Minecraft Java client jar (26.x), containing
  assets/minecraft/textures.
* <legacy-jar-root>: extracted 1.20.1 client jar. Only the classic 64x32 pig,
  cow, sheep and chicken skins are read from it, because the box-model UV
  layout of those mobs changed in 1.21.5.
* <sounds-root>: directory with minecraft/sounds/... .ogg files fetched from the
  launcher asset index (resources.download.minecraft.net).

Writes packages/app/public/decorative/minecraft/game/* and the generated tile and
icon index at src/components/minecraft/game/mc-atlas.ts. See
public/decorative/minecraft/game/README.md for provenance.
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
from pathlib import Path

from PIL import Image, ImageChops

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'public/decorative/minecraft/game'
TS_OUT = ROOT / 'src/components/minecraft/game/mc-atlas.ts'

CUR = Path(sys.argv[1]) / 'assets/minecraft/textures'
OLD = Path(sys.argv[2]) / 'assets/minecraft/textures'
SND = Path(sys.argv[3]) / 'minecraft/sounds'
# Title-screen panorama faces from the launcher asset index (the client jar ships 1x1 placeholders).
PANO = Path(sys.argv[4]) if len(sys.argv) > 4 else None

GRASS = (0x91, 0xBD, 0x59)
FOLIAGE = (0x77, 0xAB, 0x2F)
BIRCH = (0x80, 0xA7, 0x55)
SPRUCE = (0x61, 0x99, 0x61)
WATER = (0x3F, 0x76, 0xE4)


def load(path: str) -> Image.Image:
    im = Image.open(CUR / path).convert('RGBA')
    # Animated strips (water, lava, fire...) are vertical frame strips.
    if im.height > im.width:
        im = im.crop((0, 0, im.width, im.width))
    return im


def tint(im: Image.Image, rgb: tuple[int, int, int]) -> Image.Image:
    solid = Image.new('RGBA', im.size, rgb + (255,))
    out = ImageChops.multiply(im, solid)
    out.putalpha(im.getchannel('A'))
    return out


def grass_side() -> Image.Image:
    base = load('block/grass_block_side.png')
    overlay = tint(load('block/grass_block_side_overlay.png'), GRASS)
    base.alpha_composite(overlay)
    return base


def chest_faces() -> dict[str, Image.Image]:
    """Bake 16px block faces from the chest entity texture (64x64 box UVs)."""
    tex = Image.open(CUR / 'entity/chest/normal.png').convert('RGBA')
    # Box layout for a w*h*d box at (u, v): top (u+d, v, w, d), front (u+d, v+d, w, h).
    def face(u: int, v: int, w: int, h: int) -> Image.Image:
        return tex.crop((u, v, u + w, v + h))

    lid_front = face(14, 14, 14, 5)  # lid: 14x5x14 at (0, 0)
    base_front = face(14, 33, 14, 10)  # base: 14x10x14 at (0, 19)
    lid_side = face(0, 14, 14, 5)
    base_side = face(0, 33, 14, 10)
    top = face(14, 0, 14, 14)
    knob = face(1, 1, 2, 4)

    def compose(upper: Image.Image, lower: Image.Image, with_knob: bool) -> Image.Image:
        tile = Image.new('RGBA', (16, 16), (0, 0, 0, 0))
        tile.alpha_composite(upper.transpose(Image.Transpose.ROTATE_180), (1, 1))
        tile.alpha_composite(lower.transpose(Image.Transpose.ROTATE_180), (1, 6))
        if with_knob:
            tile.alpha_composite(knob, (7, 3))
        return tile

    t = Image.new('RGBA', (16, 16), (0, 0, 0, 0))
    t.alpha_composite(top.transpose(Image.Transpose.ROTATE_180), (1, 1))
    return {
        'chest_front': compose(lid_front, base_front, True),
        'chest_side': compose(lid_side, base_side, False),
        'chest_top': t,
    }


TILES: list[tuple[str, Image.Image]] = []


def tile(name: str, im: Image.Image) -> None:
    TILES.append((name, im))


simple = [
    'dirt', 'stone', 'cobblestone', 'bedrock', 'sand', 'gravel',
    'oak_log', 'oak_log_top', 'oak_planks', 'birch_log', 'birch_log_top', 'birch_planks',
    'spruce_log', 'spruce_log_top', 'spruce_planks', 'lava_still',
    'coal_ore', 'iron_ore', 'gold_ore', 'diamond_ore', 'redstone_ore', 'lapis_ore', 'emerald_ore',
    'glass', 'crafting_table_top', 'crafting_table_side', 'crafting_table_front',
    'furnace_front', 'furnace_front_on', 'furnace_side', 'furnace_top', 'torch', 'snow',
    'grass_block_snow', 'ice', 'cactus_top', 'cactus_side', 'cactus_bottom', 'sandstone',
    'sandstone_top', 'sandstone_bottom', 'bricks', 'tnt_side', 'tnt_top', 'tnt_bottom',
    'obsidian', 'glowstone', 'dandelion', 'poppy', 'dead_bush', 'white_wool', 'iron_block',
    'gold_block', 'diamond_block', 'stone_bricks', 'bookshelf', 'clay', 'pumpkin_side',
    'pumpkin_top', 'oak_sapling', 'birch_sapling', 'spruce_sapling', 'farmland',
    'farmland_moist', 'mossy_cobblestone', 'coal_block', 'redstone_block', 'lapis_block',
    'emerald_block', 'smooth_stone', 'andesite', 'diorite', 'granite', 'deepslate',
    'deepslate_top', 'cobbled_deepslate', 'deepslate_coal_ore', 'deepslate_iron_ore',
    'deepslate_gold_ore', 'deepslate_diamond_ore', 'deepslate_redstone_ore',
    'deepslate_lapis_ore', 'melon_side', 'melon_top', 'oak_door_top', 'oak_door_bottom',
    'ladder', 'red_wool', 'blue_wool', 'black_wool', 'yellow_wool', 'lime_wool', 'terracotta',
]
tile('grass_block_top', tint(load('block/grass_block_top.png'), GRASS))
tile('grass_block_side', grass_side())
tile('oak_leaves', tint(load('block/oak_leaves.png'), FOLIAGE))
tile('birch_leaves', tint(load('block/birch_leaves.png'), BIRCH))
tile('spruce_leaves', tint(load('block/spruce_leaves.png'), SPRUCE))
tile('water_still', tint(load('block/water_still.png'), WATER))
tile('short_grass', tint(load('block/short_grass.png'), GRASS))
tile('fern', tint(load('block/fern.png'), GRASS))
tile('sugar_cane', tint(load('block/sugar_cane.png'), GRASS))
for name in simple:
    tile(name, load(f'block/{name}.png'))
for i in range(8):
    tile(f'wheat_stage{i}', load(f'block/wheat_stage{i}.png'))
for i in range(10):
    tile(f'destroy_stage_{i}', load(f'block/destroy_stage_{i}.png'))
for name, im in chest_faces().items():
    tile(name, im)
# Animated water frames for the shader (8 frames, every 4th of the 32).
water_strip = Image.open(CUR / 'block/water_still.png').convert('RGBA')
for i in range(8):
    frame = water_strip.crop((0, i * 64, 16, i * 64 + 16))
    tile(f'water_frame{i}', tint(frame, WATER))
lava_strip = Image.open(CUR / 'block/lava_still.png').convert('RGBA')
for i in range(8):
    frame = lava_strip.crop((0, (i * 2 % 20) * 16, 16, (i * 2 % 20) * 16 + 16))
    tile(f'lava_frame{i}', frame)

ITEMS = [
    'stick', 'coal', 'charcoal', 'iron_ingot', 'gold_ingot', 'diamond', 'redstone',
    'lapis_lazuli', 'emerald', 'raw_iron', 'raw_gold', 'apple', 'bread', 'wheat', 'wheat_seeds',
    'porkchop', 'cooked_porkchop', 'beef', 'cooked_beef', 'chicken', 'cooked_chicken', 'mutton',
    'cooked_mutton', 'rotten_flesh', 'gunpowder', 'feather', 'leather', 'flint',
    'flint_and_steel', 'bucket', 'water_bucket', 'lava_bucket', 'bone', 'string', 'egg',
    'golden_apple', 'melon_slice', 'shears', 'brick', 'clay_ball', 'sugar', 'paper', 'book',
    'bowl', 'mushroom_stew',
]
for tier in ['wooden', 'stone', 'iron', 'golden', 'diamond']:
    for kind in ['pickaxe', 'axe', 'shovel', 'sword', 'hoe']:
        ITEMS.append(f'{tier}_{kind}')
for name in ITEMS:
    tile(f'item_{name}', load(f'item/{name}.png'))

COLS = 32
rows = (len(TILES) + COLS - 1) // COLS
atlas = Image.new('RGBA', (COLS * 16, max(rows, 1) * 16), (0, 0, 0, 0))
index: dict[str, int] = {}
for i, (name, im) in enumerate(TILES):
    atlas.alpha_composite(im, ((i % COLS) * 16, (i // COLS) * 16))
    index[name] = i
OUT.mkdir(parents=True, exist_ok=True)
atlas.save(OUT / 'terrain.png', optimize=True)


# ---------------------------------------------------------------------------
# Inventory icons: isometric renders for cubes, flat sprites for the rest.
# ---------------------------------------------------------------------------
def shade(im: Image.Image, f: float) -> Image.Image:
    r, g, b, a = im.split()
    r, g, b = (ch.point(lambda v: int(v * f)) for ch in (r, g, b))
    return Image.merge('RGBA', (r, g, b, a))


def iso(top: str, left: str, right: str) -> Image.Image:
    size = 32
    out = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    T = atlas_tile(top).resize((64, 64), Image.Resampling.NEAREST)
    L = shade(atlas_tile(left), 0.78).resize((64, 64), Image.Resampling.NEAREST)
    R = shade(atlas_tile(right), 0.6).resize((64, 64), Image.Resampling.NEAREST)
    # Affine maps from destination (x, y) to source (u, v) in 64-px space.
    cx, h = 16.0, 8.0
    # top rhombus: (16,0) (31,8) (16,16) (1,8) -> source square
    top_img = T.transform(
        (size, size), Image.Transform.AFFINE,
        _inv([[15 / 64, -15 / 64, cx], [8 / 64, 8 / 64, 0]]), Image.Resampling.NEAREST)
    left_img = L.transform(
        (size, size), Image.Transform.AFFINE,
        _inv([[15 / 64, 0, 1], [8 / 64, 16 / 64, h]]), Image.Resampling.NEAREST)
    right_img = R.transform(
        (size, size), Image.Transform.AFFINE,
        _inv([[15 / 64, 0, cx], [-8 / 64, 16 / 64, 2 * h]]), Image.Resampling.NEAREST)
    out.alpha_composite(left_img)
    out.alpha_composite(right_img)
    out.alpha_composite(top_img)
    return out


def _inv(m: list[list[float]]) -> tuple[float, ...]:
    a, b, c = m[0]
    d, e, f = m[1]
    det = a * e - b * d
    ia, ib = e / det, -b / det
    id_, ie = -d / det, a / det
    ic = -(ia * c + ib * f)
    if_ = -(id_ * c + ie * f)
    return (ia, ib, ic, id_, ie, if_)


def atlas_tile(name: str) -> Image.Image:
    i = index[name]
    return atlas.crop(((i % COLS) * 16, (i // COLS) * 16, (i % COLS) * 16 + 16, (i // COLS) * 16 + 16))


def flat(name: str) -> Image.Image:
    return atlas_tile(name).resize((32, 32), Image.Resampling.NEAREST)


CUBE_ICONS = {
    'grass_block': ('grass_block_top', 'grass_block_side', 'grass_block_side'),
    'snowy_grass': ('snow', 'grass_block_snow', 'grass_block_snow'),
    'oak_log': ('oak_log_top', 'oak_log', 'oak_log'),
    'birch_log': ('birch_log_top', 'birch_log', 'birch_log'),
    'spruce_log': ('spruce_log_top', 'spruce_log', 'spruce_log'),
    'crafting_table': ('crafting_table_top', 'crafting_table_front', 'crafting_table_side'),
    'furnace': ('furnace_top', 'furnace_front', 'furnace_side'),
    'cactus': ('cactus_top', 'cactus_side', 'cactus_side'),
    'sandstone': ('sandstone_top', 'sandstone', 'sandstone'),
    'tnt': ('tnt_top', 'tnt_side', 'tnt_side'),
    'pumpkin': ('pumpkin_top', 'pumpkin_side', 'pumpkin_side'),
    'melon': ('melon_top', 'melon_side', 'melon_side'),
    'chest': ('chest_top', 'chest_front', 'chest_side'),
    'bookshelf': ('oak_planks', 'bookshelf', 'bookshelf'),
    'deepslate': ('deepslate_top', 'deepslate', 'deepslate'),
    'water': ('water_still', 'water_still', 'water_still'),
    'lava': ('lava_still', 'lava_still', 'lava_still'),
    'farmland': ('farmland', 'dirt', 'dirt'),
}
SAME = [
    'dirt', 'stone', 'cobblestone', 'bedrock', 'sand', 'gravel', 'oak_leaves', 'oak_planks',
    'birch_leaves', 'birch_planks', 'spruce_leaves', 'spruce_planks', 'coal_ore', 'iron_ore',
    'gold_ore', 'diamond_ore', 'redstone_ore', 'lapis_ore', 'emerald_ore', 'glass', 'snow', 'ice',
    'bricks', 'obsidian', 'glowstone', 'white_wool', 'iron_block', 'gold_block', 'diamond_block',
    'stone_bricks', 'clay', 'mossy_cobblestone', 'coal_block', 'redstone_block', 'lapis_block',
    'emerald_block', 'smooth_stone', 'andesite', 'diorite', 'granite', 'cobbled_deepslate',
    'deepslate_coal_ore', 'deepslate_iron_ore', 'deepslate_gold_ore', 'deepslate_diamond_ore',
    'deepslate_redstone_ore', 'deepslate_lapis_ore', 'red_wool', 'blue_wool', 'black_wool',
    'yellow_wool', 'lime_wool', 'terracotta',
]
FLAT_ICONS = {
    'torch': 'torch', 'short_grass': 'short_grass', 'fern': 'fern', 'dandelion': 'dandelion',
    'poppy': 'poppy', 'dead_bush': 'dead_bush', 'sugar_cane': 'sugar_cane',
    'oak_sapling': 'oak_sapling', 'birch_sapling': 'birch_sapling',
    'spruce_sapling': 'spruce_sapling', 'wheat_crop': 'wheat_stage7', 'ladder': 'ladder',
    'oak_door': 'item_oak_door',
}
icon_list: list[tuple[str, Image.Image]] = []
for name, faces in CUBE_ICONS.items():
    icon_list.append((name, iso(*faces)))
for name in SAME:
    icon_list.append((name, iso(name, name, name)))
door_item = load('item/oak_door.png')
TILES.append(('item_oak_door', door_item))
index['item_oak_door'] = len(TILES) - 1
# Re-paste the door item into the atlas (it was appended after the save).
rows = (len(TILES) + COLS - 1) // COLS
grown = Image.new('RGBA', (COLS * 16, rows * 16), (0, 0, 0, 0))
grown.alpha_composite(atlas)
grown.alpha_composite(door_item, ((index['item_oak_door'] % COLS) * 16, (index['item_oak_door'] // COLS) * 16))
atlas = grown
atlas.save(OUT / 'terrain.png', optimize=True)
for name, src in FLAT_ICONS.items():
    icon_list.append((name, flat(src)))
for name in ITEMS:
    icon_list.append((name, flat(f'item_{name}')))

ICOLS = 16
irows = (len(icon_list) + ICOLS - 1) // ICOLS
icons = Image.new('RGBA', (ICOLS * 32, irows * 32), (0, 0, 0, 0))
icon_index: dict[str, int] = {}
for i, (name, im) in enumerate(icon_list):
    icons.alpha_composite(im, ((i % ICOLS) * 32, (i // ICOLS) * 32))
    icon_index[name] = i
icons.save(OUT / 'icons.png', optimize=True)

# ---------------------------------------------------------------------------
# Entities, sky, GUI.
# ---------------------------------------------------------------------------
copies = {
    'entity/zombie/zombie.png': 'zombie.png',
    'entity/creeper/creeper.png': 'creeper.png',
    'entity/skeleton/skeleton.png': 'skeleton.png',
    'entity/player/wide/steve.png': 'steve.png',
    'environment/celestial/sun.png': 'sun.png',
    'environment/celestial/moon/full_moon.png': 'moon.png',
    'environment/clouds.png': 'clouds.png',
    'gui/container/inventory.png': 'gui-inventory.png',
    'gui/container/crafting_table.png': 'gui-crafting.png',
    'gui/container/furnace.png': 'gui-furnace.png',
    'gui/sprites/hud/hotbar.png': 'hotbar.png',
    'gui/sprites/hud/hotbar_selection.png': 'hotbar-selection.png',
    'gui/sprites/hud/heart/full.png': 'heart-full.png',
    'gui/sprites/hud/heart/half.png': 'heart-half.png',
    'gui/sprites/hud/heart/container.png': 'heart-container.png',
    'gui/sprites/hud/food_full.png': 'food-full.png',
    'gui/sprites/hud/food_half.png': 'food-half.png',
    'gui/sprites/hud/food_empty.png': 'food-empty.png',
    'gui/sprites/hud/air.png': 'air.png',
    'gui/sprites/hud/crosshair.png': 'crosshair.png',
    'gui/sprites/container/furnace/lit_progress.png': 'furnace-lit.png',
    'gui/sprites/container/furnace/burn_progress.png': 'furnace-burn.png',
    'gui/sprites/hud/experience_bar_background.png': 'xp-bg.png',
    'gui/sprites/hud/experience_bar_progress.png': 'xp-fill.png',
    'gui/title/minecraft.png': 'title.png',
    'gui/sprites/widget/button.png': 'button.png',
    'gui/sprites/widget/button_highlighted.png': 'button-highlighted.png',
    'gui/sprites/widget/button_disabled.png': 'button-disabled.png',
    'gui/sprites/widget/text_field.png': 'text-field.png',
    'gui/sprites/widget/text_field_highlighted.png': 'text-field-highlighted.png',
    'gui/sprites/widget/slider.png': 'slider.png',
    'gui/sprites/widget/slider_handle.png': 'slider-handle.png',
    'gui/sprites/widget/slider_handle_highlighted.png': 'slider-handle-highlighted.png',
    'gui/sprites/container/creative_inventory/scroller.png': 'scroller.png',
    'gui/sprites/container/creative_inventory/scroller_disabled.png': 'scroller-disabled.png',
}
for src, dst in copies.items():
    p = CUR / src
    if not p.exists():
        print('missing', src)
        continue
    Image.open(p).convert('RGBA').save(OUT / dst, optimize=True)
for src, dst in {
    'entity/pig/pig.png': 'pig.png',
    'entity/cow/cow.png': 'cow.png',
    'entity/sheep/sheep.png': 'sheep.png',
    'entity/sheep/sheep_fur.png': 'sheep-fur.png',
    'entity/chicken.png': 'chicken.png',
}.items():
    Image.open(OLD / src).convert('RGBA').save(OUT / dst, optimize=True)

# Chest GUI: 3-row top of generic_54 plus its player-inventory bottom.
g54 = Image.open(CUR / 'gui/container/generic_54.png').convert('RGBA')
chest_gui = Image.new('RGBA', (176, 167), (0, 0, 0, 0))
chest_gui.alpha_composite(g54.crop((0, 0, 176, 71)), (0, 0))
chest_gui.alpha_composite(g54.crop((0, 126, 176, 222)), (0, 71))
chest_gui.save(OUT / 'gui-chest.png', optimize=True)

# Creative inventory background (search tab layout: 9x5 grid, search box, scroller).
Image.open(CUR / 'gui/container/creative_inventory/tab_item_search.png').convert('RGBA').crop((0, 0, 195, 136)).save(OUT / 'gui-creative.png', optimize=True)

# Translucent menu background, drawn over the panorama like the vanilla client.
Image.open(CUR / 'gui/menu_background.png').convert('RGBA').save(OUT / 'menu-bg.png')
if PANO:
    for i in range(6):
        face = Image.open(PANO / f'panorama_{i}.png').convert('RGB').resize((640, 640), Image.LANCZOS)
        face.save(OUT / f'panorama-{i}.jpg', quality=80, optimize=True, progressive=True)

# ---------------------------------------------------------------------------
# Sounds (transcoded to small mono MP3s so Safari can decode them).
# ---------------------------------------------------------------------------
SOUNDS = {
    'dig/grass': 4, 'dig/stone': 4, 'dig/wood': 4, 'dig/gravel': 4, 'dig/sand': 4, 'dig/cloth': 4,
    'dig/snow': 4, 'step/grass': 4, 'step/stone': 4, 'step/wood': 4, 'step/gravel': 4,
    'step/sand': 4, 'step/cloth': 4, 'step/snow': 4, 'step/ladder': 2, 'random/glass': 3,
    'damage/hit': 3, 'random/explode': 4, 'mob/zombie/say': 3, 'mob/zombie/hurt': 2,
    'mob/creeper/say': 4, 'mob/pig/say': 3, 'mob/cow/say': 4, 'mob/cow/hurt': 3,
    'mob/sheep/say': 3, 'mob/chicken/say': 3, 'mob/chicken/hurt': 2, 'random/eat': 3,
    'step/wet_grass': 2,
}
SINGLE = [
    'liquid/splash', 'random/pop', 'random/fuse', 'random/burp', 'random/orb', 'random/break', 'damage/fallsmall',
    'damage/fallbig', 'mob/zombie/death', 'mob/creeper/death', 'mob/pig/death', 'random/door_open',
    'random/door_close', 'random/click', 'random/fizz', 'fire/ignite', 'random/chestopen',
    'random/chestclosed', 'liquid/swim1', 'liquid/water', 'liquid/lava', 'random/bow',
]
snd_out = OUT / 'sounds'
snd_out.mkdir(exist_ok=True)
sound_index: dict[str, int] = {}


def transcode(src: Path, dst: Path) -> None:
    if dst.exists():
        return
    subprocess.run(
        ['ffmpeg', '-loglevel', 'error', '-y', '-i', str(src), '-ac', '1', '-b:a', '64k', str(dst)],
        check=True,
    )


for key, n in SOUNDS.items():
    found = 0
    for i in range(1, n + 1):
        src = SND / f'{key}{i}.ogg'
        if not src.exists():
            continue
        found += 1
        transcode(src, snd_out / f"{key.replace('/', '-')}{found}.mp3")
    sound_index[key] = found
for key in SINGLE:
    src = SND / f'{key}.ogg'
    if not src.exists():
        print('missing sound', key)
        continue
    transcode(src, snd_out / f"{key.replace('/', '-')}.mp3")
    sound_index[key] = 0

TS_OUT.parent.mkdir(parents=True, exist_ok=True)
with open(TS_OUT, 'w') as f:
    f.write('// Generated by scripts/build-minecraft-game-assets.py. Do not edit by hand.\n\n')
    f.write(f'export const ATLAS_COLUMNS = {COLS};\n')
    f.write(f'export const ATLAS_ROWS = {rows};\n')
    f.write('export const TILE = {\n')
    for name, i in index.items():
        f.write(f'  {name}: {i},\n')
    f.write('} as const;\n')
    f.write('export type TileName = keyof typeof TILE;\n\n')
    f.write(f'export const ICON_COLUMNS = {ICOLS};\n')
    f.write(f'export const ICON_ROWS = {irows};\n')
    f.write('export const ICON = {\n')
    for name, i in icon_index.items():
        f.write(f'  {name}: {i},\n')
    f.write('} as const;\n')
    f.write('export type IconName = keyof typeof ICON;\n\n')
    f.write('/** Variant count per sound key; 0 means a single file without a number. */\n')
    f.write('export const SOUND_VARIANTS = {\n')
    for name, n in sound_index.items():
        f.write(f"  '{name}': {n},\n")
    f.write('} as const;\n')
    f.write('export type SoundKey = keyof typeof SOUND_VARIANTS;\n')
print('tiles', len(TILES), 'icons', len(icon_list), 'sounds', len(sound_index))
