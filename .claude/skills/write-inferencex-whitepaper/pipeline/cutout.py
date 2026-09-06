"""Key a product render shot on white out to a transparent PNG.

Usage:
    python3 cutout.py <input.(png|jpg)> <output.png> [threshold=235]

Flood-fills from the image border through near-white pixels so white areas
inside the product (labels, heatsink highlights) are kept. Crops to the
content box. Prints the output size; use it for chipImageWidth/Height in the
registry. Needs Pillow, numpy, scipy. Do not use rembg here: it runs out of
memory on 2560x1440 renders in the sandbox.
"""
import sys

import numpy as np
from PIL import Image
from scipy import ndimage

src, dst = sys.argv[1], sys.argv[2]
thr = int(sys.argv[3]) if len(sys.argv) > 3 else 235
im = Image.open(src).convert("RGBA")
a = np.asarray(im).astype(np.int16)
near_white = (a[..., :3] >= thr).all(axis=-1)
labels, _ = ndimage.label(near_white)
border = np.unique(np.concatenate([labels[0], labels[-1], labels[:, 0], labels[:, -1]]))
bg = np.isin(labels, border[border != 0])
alpha = np.where(bg, 0, 255).astype(np.uint8)
# soften the edge one pixel so the drop shadow on the cover does not halo
alpha = ndimage.minimum_filter(alpha, size=2)
out = a.astype(np.uint8)
out[..., 3] = alpha
ys, xs = np.where(alpha > 0)
img = Image.fromarray(out).crop((xs.min(), ys.min(), xs.max() + 1, ys.max() + 1))
img.save(dst)
print(img.size)
