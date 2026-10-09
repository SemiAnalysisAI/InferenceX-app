import { ATLAS_COLUMNS, TILE } from './mc-atlas';
import { B, BLOCKS, doorBox, isLiquid, ladderBox, type BlockDef, type Box } from './mc-blocks';
import { hash3 } from './mc-noise';
import { CHUNK, chunkKey, HEIGHT, type World } from './mc-world';

/**
 * Chunk geometry. Vertex layout (all integer attributes, decoded in the shader):
 *  - position: Int16 x3 in 1/16 block units, chunk-local.
 *  - uv: Uint16 x2 in atlas pixels.
 *  - light: Uint8 x4 = sky (0-255), block (0-255), shade*AO (0-255), flags.
 * Flags: 1 animated water, 2 animated lava, 3 waving leaves, 4 waving plant top.
 */
export interface MeshData {
  position: Int16Array;
  uv: Uint16Array;
  light: Uint8Array;
  index: Uint32Array;
  vertices: number;
}

class Builder {
  pos: number[] = [];
  uv: number[] = [];
  light: number[] = [];
  index: number[] = [];
  n = 0;
  quad(p: readonly number[], t: readonly number[], l: readonly number[], flip = false) {
    for (let i = 0; i < 12; i++) this.pos.push(Math.round(p[i] * 16));
    for (let i = 0; i < 8; i++) this.uv.push(t[i]);
    for (let i = 0; i < 16; i++) this.light.push(l[i]);
    const b = this.n;
    if (flip) this.index.push(b + 1, b + 2, b + 3, b + 1, b + 3, b);
    else this.index.push(b, b + 1, b + 2, b, b + 2, b + 3);
    this.n += 4;
  }
  build(): MeshData {
    return {
      position: new Int16Array(this.pos),
      uv: new Uint16Array(this.uv),
      light: new Uint8Array(this.light),
      index: new Uint32Array(this.index),
      vertices: this.n,
    };
  }
}

// Face order: +X -X +Y -Y +Z -Z. Corners per face in 0..1 units, CCW from outside.
const FACE_CORNERS: number[][][] = [
  [
    [1, 0, 1],
    [1, 0, 0],
    [1, 1, 0],
    [1, 1, 1],
  ],
  [
    [0, 0, 0],
    [0, 0, 1],
    [0, 1, 1],
    [0, 1, 0],
  ],
  [
    [0, 1, 1],
    [1, 1, 1],
    [1, 1, 0],
    [0, 1, 0],
  ],
  [
    [0, 0, 0],
    [1, 0, 0],
    [1, 0, 1],
    [0, 0, 1],
  ],
  [
    [0, 0, 1],
    [1, 0, 1],
    [1, 1, 1],
    [0, 1, 1],
  ],
  [
    [1, 0, 0],
    [0, 0, 0],
    [0, 1, 0],
    [1, 1, 0],
  ],
];
const NORMALS = [
  [1, 0, 0],
  [-1, 0, 0],
  [0, 1, 0],
  [0, -1, 0],
  [0, 0, 1],
  [0, 0, -1],
];
const SHADE = [0.6, 0.6, 1, 0.5, 0.8, 0.8];
const AO_CURVE = [0.48, 0.66, 0.83, 1];
/** Horizontal ring used to rotate fronted blocks: +Z, -X, -Z, +X. */
const RING = [4, 1, 5, 0];
const RING_INDEX = [3, 1, -1, -1, 0, 2];

const tileOrigin = (tile: number) => [
  (tile % ATLAS_COLUMNS) * 16,
  Math.floor(tile / ATLAS_COLUMNS) * 16,
];

/** Texture pixel coordinates (u right, v down) of a point on a face, in 1/16 units. */
function faceUV(face: number, px: number, py: number, pz: number): [number, number] {
  switch (face) {
    case 0: {
      return [16 - pz, 16 - py];
    }
    case 1: {
      return [pz, 16 - py];
    }
    case 2: {
      return [px, pz];
    }
    case 3: {
      return [px, 16 - pz];
    }
    case 4: {
      return [px, 16 - py];
    }
    default: {
      return [16 - px, 16 - py];
    }
  }
}

export function tileFor(def: BlockDef, face: number, meta: number): number {
  if (def.id === B.endFrame && face === 2 && meta & 4) return TILE.item_ender_eye;
  if (def.id === B.wheat) return TILE.wheat_stage0 + Math.min(7, meta);
  if (def.id === B.door) {
    if (face === 2 || face === 3) return TILE.oak_planks;
    return meta & 8 ? TILE.oak_door_top : TILE.oak_door_bottom;
  }
  if (def.id === B.farmland && face === 2) return meta ? TILE.farmland_moist : TILE.farmland;
  if (def.facing && RING_INDEX[face] >= 0 && def.id !== B.ladder) {
    const logical = RING[(RING_INDEX[face] - (meta & 3) + 4) % 4];
    const t = def.tiles[logical];
    if (def.id === B.furnace && logical === 4 && meta & 4) return TILE.furnace_front_on;
    return t;
  }
  return def.tiles[face];
}

/** Padded copy (18 x 18 x HEIGHT) of blocks, meta and light around a chunk. */
const PW = CHUNK + 2;
const PSLICE = PW * PW;
const pBlocks = new Uint8Array(PSLICE * HEIGHT);
const pMeta = new Uint8Array(PSLICE * HEIGHT);
const pLight = new Uint8Array(PSLICE * HEIGHT);

function fillPadded(world: World, cx: number, cz: number) {
  for (let dz = -1; dz <= 1; dz++) {
    for (let dx = -1; dx <= 1; dx++) {
      const c = world.chunks.get(chunkKey(cx + dx, cz + dz));
      const lx0 = dx === -1 ? 15 : 0;
      const lx1 = dx === 1 ? 0 : 15;
      const lz0 = dz === -1 ? 15 : 0;
      const lz1 = dz === 1 ? 0 : 15;
      for (let lz = lz0; lz <= lz1; lz++) {
        const pz = (dz + 1) * 16 + lz - 15;
        for (let lx = lx0; lx <= lx1; lx++) {
          const px = (dx + 1) * 16 + lx - 15;
          for (let y = 0; y < HEIGHT; y++) {
            const pi = y * PSLICE + pz * PW + px;
            if (!c) {
              pBlocks[pi] = B.stone;
              pMeta[pi] = 0;
              pLight[pi] = 240;
              continue;
            }
            const i = lx + lz * CHUNK + y * CHUNK * CHUNK;
            pBlocks[pi] = c.blocks[i];
            pMeta[pi] = c.meta[i];
            pLight[pi] = c.light[i];
          }
        }
      }
    }
  }
}

const pIndex = (x: number, y: number, z: number) => y * PSLICE + (z + 1) * PW + x + 1;
const blockAt = (x: number, y: number, z: number) =>
  y < 0 ? B.bedrock : y >= HEIGHT ? B.air : pBlocks[pIndex(x, y, z)];
const lightAt = (x: number, y: number, z: number) =>
  y >= HEIGHT ? 240 : y < 0 ? 0 : pLight[pIndex(x, y, z)];
const opaqueAt = (x: number, y: number, z: number) => BLOCKS[blockAt(x, y, z)].opaque;

function hidden(def: BlockDef, neighbor: number) {
  const n = BLOCKS[neighbor];
  if (n.opaque) return true;
  if (neighbor === def.id && (def.id === B.glass || def.id === B.ice)) return true;
  return false;
}

/** Build opaque/cutout and translucent geometry for a chunk. */
export function meshChunk(world: World, cx: number, cz: number) {
  fillPadded(world, cx, cz);
  const solid = new Builder();
  const water = new Builder();
  const p = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
  const t = [0, 0, 0, 0, 0, 0, 0, 0];
  const l: number[] = Array.from({ length: 16 }, () => 0);
  const ao = [0, 0, 0, 0];

  for (let y = 0; y < HEIGHT; y++) {
    for (let z = 0; z < CHUNK; z++) {
      for (let x = 0; x < CHUNK; x++) {
        const id = pBlocks[pIndex(x, y, z)];
        if (id === B.air) continue;
        const def = BLOCKS[id];
        const meta = pMeta[pIndex(x, y, z)];
        switch (def.render) {
          case 'cube': {
            cube(def, meta, x, y, z);
            break;
          }
          case 'cross':
          case 'crop': {
            cross(def, meta, x, y, z);
            break;
          }
          case 'liquid': {
            liquid(def, meta, x, y, z);
            break;
          }
          case 'torch': {
            torch(def, meta, x, y, z);
            break;
          }
          case 'box': {
            if (id === B.netherPortal && meta & 1)
              box(def, meta, x, y, z, [7, 0, 0, 9, 16, 16], false);
            else for (const b of def.boxes ?? []) box(def, meta, x, y, z, b, false);
            break;
          }
          case 'door': {
            box(def, meta, x, y, z, doorBox(meta), false);
            break;
          }
          case 'ladder': {
            box(def, meta, x, y, z, ladderBox(meta), true);
            break;
          }
          default: {
            break;
          }
        }
      }
    }
  }
  return { solid: solid.build(), water: water.build() };

  function cube(def: BlockDef, meta: number, x: number, y: number, z: number) {
    const flags =
      def.id === B.oakLeaves || def.id === B.birchLeaves || def.id === B.spruceLeaves ? 3 : 0;
    for (let f = 0; f < 6; f++) {
      const [nx, ny, nz] = NORMALS[f];
      const neighbor = blockAt(x + nx, y + ny, z + nz);
      if (hidden(def, neighbor)) continue;
      const tile = tileFor(def, f, meta);
      const [u0, v0] = tileOrigin(tile);
      const corners = FACE_CORNERS[f];
      for (let k = 0; k < 4; k++) {
        const c = corners[k];
        p[k * 3] = x + c[0];
        p[k * 3 + 1] = y + c[1];
        p[k * 3 + 2] = z + c[2];
        const [fu, fv] = faceUV(f, c[0] * 16, c[1] * 16, c[2] * 16);
        t[k * 2] = u0 + fu;
        t[k * 2 + 1] = v0 + fv;
        // Smooth light and AO from the four cells in front of this corner.
        const sx = c[0] * 2 - 1;
        const sy = c[1] * 2 - 1;
        const sz = c[2] * 2 - 1;
        const fx = x + nx;
        const fy = y + ny;
        const fz = z + nz;
        let ax: [number, number, number];
        let bx: [number, number, number];
        if (nx !== 0) {
          ax = [fx, fy + sy, fz];
          bx = [fx, fy, fz + sz];
        } else if (ny === 0) {
          ax = [fx + sx, fy, fz];
          bx = [fx, fy + sy, fz];
        } else {
          ax = [fx + sx, fy, fz];
          bx = [fx, fy, fz + sz];
        }
        const cxp: [number, number, number] = [
          ax[0] + bx[0] - fx,
          ax[1] + bx[1] - fy,
          ax[2] + bx[2] - fz,
        ];
        const s1 = opaqueAt(ax[0], ax[1], ax[2]) ? 1 : 0;
        const s2 = opaqueAt(bx[0], bx[1], bx[2]) ? 1 : 0;
        const cc = opaqueAt(cxp[0], cxp[1], cxp[2]) ? 1 : 0;
        const occl = s1 && s2 ? 0 : 3 - (s1 + s2 + cc);
        ao[k] = occl;
        let sky = 0;
        let blk = 0;
        let count = 0;
        const sample = (sx2: number, sy2: number, sz2: number, ok: boolean) => {
          if (!ok) return;
          const v = lightAt(sx2, sy2, sz2);
          sky += v >> 4;
          blk += v & 15;
          count++;
        };
        sample(fx, fy, fz, true);
        sample(ax[0], ax[1], ax[2], !s1);
        sample(bx[0], bx[1], bx[2], !s2);
        sample(cxp[0], cxp[1], cxp[2], !cc && !(s1 && s2));
        l[k * 4] = Math.round((sky / count) * 17);
        l[k * 4 + 1] = Math.round((blk / count) * 17);
        l[k * 4 + 2] = Math.round(SHADE[f] * AO_CURVE[occl] * 255);
        l[k * 4 + 3] = flags;
      }
      solid.quad(p, t, l, ao[0] + ao[2] < ao[1] + ao[3]);
    }
  }

  function flatLight(x: number, y: number, z: number, shade: number, flags: number, top?: number) {
    const v = lightAt(x, y, z);
    for (let k = 0; k < 4; k++) {
      l[k * 4] = (v >> 4) * 17;
      l[k * 4 + 1] = (v & 15) * 17;
      l[k * 4 + 2] = Math.round(shade * 255);
      l[k * 4 + 3] = top === undefined ? flags : k >= 2 ? top : 0;
    }
  }

  function cross(def: BlockDef, meta: number, x: number, y: number, z: number) {
    const tile = tileFor(def, 0, meta);
    const [u0, v0] = tileOrigin(tile);
    const jitter = def.id === B.shortGrass || def.id === B.fern;
    const ox = jitter ? (hash3(7, x + cx * 16, y, z + cz * 16) - 0.5) * 0.3 : 0;
    const oz = jitter ? (hash3(9, x + cx * 16, y, z + cz * 16) - 0.5) * 0.3 : 0;
    const wave = def.id === B.sugarCane || def.id === B.wheat ? 0 : 4;
    flatLight(x, y, z, 0.9, 0, wave);
    const planes =
      def.render === 'crop'
        ? [
            [0.25, 0, 0, 0.25, 0, 1],
            [0.75, 0, 1, 0.75, 0, 0],
            [0, 0, 0.25, 1, 0, 0.25],
            [1, 0, 0.75, 0, 0, 0.75],
          ]
        : [
            [0.15, 0, 0.15, 0.85, 0, 0.85],
            [0.15, 0, 0.85, 0.85, 0, 0.15],
          ];
    for (const [ax, , az, bx, , bz] of planes) {
      const h = def.render === 'crop' ? 1 : 0.95;
      const quad = [ax, 0, az, bx, 0, bz, bx, h, bz, ax, h, az];
      for (let k = 0; k < 4; k++) {
        p[k * 3] = x + quad[k * 3] + ox;
        p[k * 3 + 1] = y + quad[k * 3 + 1];
        p[k * 3 + 2] = z + quad[k * 3 + 2] + oz;
      }
      const uvq = [0, 16, 16, 16, 16, 16 - h * 16, 0, 16 - h * 16];
      for (let k = 0; k < 8; k += 2) {
        t[k] = u0 + uvq[k];
        t[k + 1] = v0 + uvq[k + 1];
      }
      solid.quad(p, t, l);
      // Back side.
      const bp = [p[3], p[4], p[5], p[0], p[1], p[2], p[9], p[10], p[11], p[6], p[7], p[8]];
      const bt = [t[2], t[3], t[0], t[1], t[6], t[7], t[4], t[5]];
      solid.quad(bp, bt, l);
    }
  }

  function box(
    def: BlockDef,
    meta: number,
    x: number,
    y: number,
    z: number,
    b: Box,
    thinOnly: boolean,
  ) {
    const [x0, y0, z0, x1, y1, z1] = b;
    for (let f = 0; f < 6; f++) {
      const [nx, ny, nz] = NORMALS[f];
      const touches =
        (f === 0 && x1 === 16) ||
        (f === 1 && x0 === 0) ||
        (f === 2 && y1 === 16) ||
        (f === 3 && y0 === 0) ||
        (f === 4 && z1 === 16) ||
        (f === 5 && z0 === 0);
      if (touches && hidden(def, blockAt(x + nx, y + ny, z + nz))) continue;
      if (thinOnly && f !== 4 && f !== 5 && f !== 0 && f !== 1) continue;
      const tile = tileFor(def, f, meta);
      const [u0, v0] = tileOrigin(tile);
      const corners = FACE_CORNERS[f];
      for (let k = 0; k < 4; k++) {
        const c = corners[k];
        const px = c[0] ? x1 : x0;
        const py = c[1] ? y1 : y0;
        const pz = c[2] ? z1 : z0;
        p[k * 3] = x + px / 16;
        p[k * 3 + 1] = y + py / 16;
        p[k * 3 + 2] = z + pz / 16;
        const [fu, fv] = faceUV(f, px, py, pz);
        t[k * 2] = u0 + fu;
        t[k * 2 + 1] = v0 + fv;
      }
      const lx = touches ? x + nx : x;
      const ly = touches ? y + ny : y;
      const lz = touches ? z + nz : z;
      const lid = blockAt(lx, ly, lz);
      flatLight(
        BLOCKS[lid].opaque ? x : lx,
        BLOCKS[lid].opaque ? y : ly,
        BLOCKS[lid].opaque ? z : lz,
        SHADE[f],
        0,
      );
      solid.quad(p, t, l);
      if (def.render === 'ladder' || def.render === 'door') {
        // Visible from both sides.
        const bp = [p[3], p[4], p[5], p[0], p[1], p[2], p[9], p[10], p[11], p[6], p[7], p[8]];
        const bt = [t[2], t[3], t[0], t[1], t[6], t[7], t[4], t[5]];
        if (def.render === 'ladder') solid.quad(bp, bt, l);
      }
    }
  }

  function torch(def: BlockDef, meta: number, x: number, y: number, z: number) {
    const [u0, v0] = tileOrigin(def.tiles[0]);
    // Wall torches lean away from the wall they hang on.
    const wall = meta > 0 ? meta - 1 : -1;
    const dir = wall >= 0 ? NORMALS[RING[wall]] : [0, 0, 0];
    const lean = 0.42;
    const transform = (px: number, py: number, pz: number): [number, number, number] => {
      if (wall < 0) return [x + px / 16, y + py / 16, z + pz / 16];
      const h = py / 16;
      const bx = (px - 8) / 16;
      const bz = (pz - 8) / 16;
      return [
        x + 0.5 + bx + dir[0] * (0.5 - 0.0625) - dir[0] * h * lean,
        y + 0.2 + h,
        z + 0.5 + bz + dir[2] * (0.5 - 0.0625) - dir[2] * h * lean,
      ];
    };
    flatLight(x, y, z, 1, 0);
    for (let f = 0; f < 6; f++) {
      if (f === 3 && wall < 0) continue;
      const corners = FACE_CORNERS[f];
      for (let k = 0; k < 4; k++) {
        const c = corners[k];
        const px = c[0] ? 9 : 7;
        const py = c[1] ? 10 : 0;
        const pz = c[2] ? 9 : 7;
        const v = transform(px, py, pz);
        p[k * 3] = v[0];
        p[k * 3 + 1] = v[1];
        p[k * 3 + 2] = v[2];
        let fu: number;
        let fv: number;
        if (f === 2) [fu, fv] = [c[0] ? 9 : 7, c[2] ? 8 : 6];
        else if (f === 3) [fu, fv] = [c[0] ? 9 : 7, c[2] ? 16 : 14];
        else [fu, fv] = faceUV(f, px, py, pz);
        t[k * 2] = u0 + fu;
        t[k * 2 + 1] = v0 + fv;
      }
      solid.quad(p, t, l);
    }
  }

  function liquid(def: BlockDef, meta: number, x: number, y: number, z: number) {
    const id = def.id;
    const lava = id === B.lava;
    const builder = lava ? solid : water;
    const height = (bx: number, by: number, bz: number) => {
      const nid = blockAt(bx, by, bz);
      if (nid !== id) return -1;
      if (blockAt(bx, by + 1, bz) === id) return 1;
      const m = pMeta[pIndex(bx, by, bz)];
      return m === 0 || m === 8 ? 0.889 : Math.max(0.12, (8 - m) / 9);
    };
    const own = height(x, y, z);
    // Corner heights average neighbouring liquid levels, as in the original.
    const corner = (dx: number, dz: number) => {
      if (own === 1) return 1;
      let sum = 0;
      let n = 0;
      for (const [ox, oz] of [
        [0, 0],
        [dx, 0],
        [0, dz],
        [dx, dz],
      ]) {
        if (blockAt(x + ox, y + 1, z + oz) === id) return 1;
        const h = height(x + ox, y, z + oz);
        if (h >= 0) {
          sum += h;
          n++;
        }
      }
      return n ? sum / n : own;
    };
    const hNE = corner(1, -1);
    const hNW = corner(-1, -1);
    const hSE = corner(1, 1);
    const hSW = corner(-1, 1);
    const flags = lava ? 2 : 1;
    const tile = lava ? TILE.lava_frame0 : TILE.water_frame0;
    const [u0, v0] = tileOrigin(tile);
    for (let f = 0; f < 6; f++) {
      const [nx, ny, nz] = NORMALS[f];
      const n = blockAt(x + nx, y + ny, z + nz);
      if (n === id || BLOCKS[n].opaque) continue;
      if (f === 3 && n !== B.air && !BLOCKS[n].solid && !isLiquid(n)) continue;
      const corners = FACE_CORNERS[f];
      for (let k = 0; k < 4; k++) {
        const c = corners[k];
        let cy: number = c[1];
        if (c[1] === 1) {
          cy = c[0] ? (c[2] ? hSE : hNE) : c[2] ? hSW : hNW;
        }
        p[k * 3] = x + c[0];
        p[k * 3 + 1] = y + cy;
        p[k * 3 + 2] = z + c[2];
        const [fu, fv] = faceUV(f, c[0] * 16, cy * 16, c[2] * 16);
        t[k * 2] = u0 + fu;
        t[k * 2 + 1] = v0 + fv;
      }
      const lv = lightAt(x + nx, y + ny, z + nz);
      const own2 = lightAt(x, y, z);
      const sky = Math.max(lv >> 4, own2 >> 4);
      const blk = Math.max(lv & 15, own2 & 15);
      for (let k = 0; k < 4; k++) {
        l[k * 4] = sky * 17;
        l[k * 4 + 1] = (lava ? 15 : blk) * 17;
        l[k * 4 + 2] = Math.round(SHADE[f] * 255);
        l[k * 4 + 3] = flags;
      }
      builder.quad(p, t, l);
    }
  }
}
