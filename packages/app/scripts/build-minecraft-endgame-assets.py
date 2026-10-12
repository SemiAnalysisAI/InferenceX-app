"""Append endgame textures without renumbering the existing generated atlas.

Usage: python scripts/build-minecraft-endgame-assets.py <texture-directory>
Input: Java 1.20.1 textures from InventivetalentDev/minecraft-assets (1.20.1).
The directory contains the source PNGs by basename. Existing atlas entries are
replaced in place, so rerunning this script is idempotent.
"""
import re
import sys
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'public/decorative/minecraft/game'
INDEX = ROOT / 'src/components/minecraft/game/mc-atlas.ts'
SRC = Path(sys.argv[1])
text = INDEX.read_text()
blocks = ['netherrack', 'nether_bricks', 'end_stone', 'end_portal_frame_top',
          'end_portal_frame_side', 'nether_portal']
items = ['ender_pearl', 'ender_eye', 'blaze_rod', 'blaze_powder', 'bow', 'arrow']

def append_atlas(kind, filename, columns, size, entries):
    global text
    match = re.search(r'export const ' + kind + r' = \{(.*?)\} as const;', text, re.S)
    body = match[1]
    indices = {k: int(v) for k, v in re.findall(r'(\w+): (\d+)', body)}
    for key, _ in entries:
        if key not in indices:
            indices[key] = max(indices.values()) + 1
            body += f'  {key}: {indices[key]},\n'
    rows = (max(indices.values()) + columns) // columns
    old = Image.open(OUT / filename).convert('RGBA')
    atlas = Image.new('RGBA', (columns * size, rows * size))
    atlas.paste(old, (0, 0))
    for key, source in entries:
        im = Image.open(SRC / f'{source}.png').convert('RGBA')
        im = im.crop((0, 0, im.width, im.width)).resize((size, size), Image.Resampling.NEAREST)
        atlas.paste(im, ((indices[key] % columns) * size, (indices[key] // columns) * size))
    atlas.save(OUT / filename, optimize=True)
    text = text[:match.start(1)] + body + text[match.end(1):]
    row_name = 'ATLAS_ROWS' if kind == 'TILE' else 'ICON_ROWS'
    text = re.sub(rf'{row_name} = \d+', f'{row_name} = {rows}', text)

append_atlas('TILE', 'terrain.png', 32, 16,
             [(b, b) for b in blocks] + [(f'item_{i}', i) for i in items])
append_atlas('ICON', 'icons.png', 16, 32,
             [(b, b) for b in blocks] + [(i, i) for i in items])
INDEX.write_text(text)
for name in ['dragon', 'enderman', 'blaze', 'end_crystal']:
    Image.open(SRC / f'{name}.png').convert('RGBA').save(OUT / f'{name}.png', optimize=True)
