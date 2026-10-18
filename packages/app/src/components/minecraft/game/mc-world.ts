// oxlint-disable-next-line max-classes-per-file -- Terrain and World share private generation constants.
import { B, BLOCKS, emission, isLiquid } from './mc-blocks';
import { hash3, rng, Simplex } from './mc-noise';
import { dimensionBlocks, type Dimension } from './mc-dimensions';

export const CHUNK = 16;
export const HEIGHT = 128;
export const SEA = 63;
export const DEEPSLATE = 16;
const AREA = CHUNK * CHUNK;
const VOLUME = AREA * HEIGHT;

export type Biome =
  | 'ocean'
  | 'frozen_ocean'
  | 'river'
  | 'beach'
  | 'snowy_beach'
  | 'desert'
  | 'plains'
  | 'forest'
  | 'birch_forest'
  | 'taiga'
  | 'mountains';

export const BIOME_NAMES: Record<Biome, { en: string; zh: string }> = {
  ocean: { en: 'Ocean', zh: '海洋' },
  frozen_ocean: { en: 'Frozen Ocean', zh: '冻洋' },
  river: { en: 'River', zh: '河流' },
  beach: { en: 'Beach', zh: '沙滩' },
  snowy_beach: { en: 'Snowy Beach', zh: '积雪沙滩' },
  desert: { en: 'Desert', zh: '沙漠' },
  plains: { en: 'Plains', zh: '平原' },
  forest: { en: 'Forest', zh: '森林' },
  birch_forest: { en: 'Birch Forest', zh: '桦木森林' },
  taiga: { en: 'Snowy Taiga', zh: '积雪的针叶林' },
  mountains: { en: 'Windswept Hills', zh: '风袭丘陵' },
};

export interface Chunk {
  cx: number;
  cz: number;
  blocks: Uint8Array;
  meta: Uint8Array;
  /** High nibble sky light, low nibble block light. */
  light: Uint8Array;
  lit: boolean;
  /** Geometry needs rebuilding. */
  dirty: boolean;
  /** Block edits relative to generation, keyed by index: id | meta << 8. */
  edits: Map<number, number>;
}

export const chunkKey = (cx: number, cz: number) => (cx + 32768) * 65536 + (cz + 32768);
export const blockIndex = (x: number, y: number, z: number) => x + z * CHUNK + y * AREA;

const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

interface Column {
  height: number;
  biome: Biome;
  temperature: number;
  steep: boolean;
}

/** Deterministic terrain shaping shared by generation, spawning and tests. */
export class Terrain {
  readonly seed: number;
  private n: Simplex[];
  constructor(seed: number) {
    this.seed = seed >>> 0;
    this.n = Array.from({ length: 10 }, (_, i) => new Simplex(this.seed + i * 7919));
  }

  rawHeight(x: number, z: number) {
    const [cont, hills, detail, peaks, mask, river] = this.n;
    const c = cont.fbm2(x / 820, z / 820, 4);
    const h1 = hills.fbm2(x / 210, z / 210, 4);
    const d = detail.fbm2(x / 38, z / 38, 3);
    const ridge = 1 - Math.abs(peaks.fbm2(x / 330 + 31, z / 330 - 17, 4));
    const m = smoothstep(0.08, 0.42, mask.fbm2(x / 900 + 7, z / 900 + 3, 3));
    let h: number;
    if (c < -0.18) {
      h = SEA - 5 - (-0.18 - c) * 70 + d * 2;
      h = Math.max(h, 34);
    } else {
      h = SEA + 1 + (c + 0.18) * 24 + h1 * 9 * (0.6 + m) + d * 2.2 + m * ridge * ridge * 56;
    }
    // Rivers cut through lowland, not mountain ranges.
    const r = Math.abs(river.fbm2(x / 360 + 200, z / 360 + 200, 3));
    const isRiver = c >= -0.18 && r < 0.04 && m < 0.6;
    if (isRiver) {
      const t = smoothstep(0, 0.04, r);
      h = SEA - 4 + (h - (SEA - 4)) * t * t;
    }
    return { h: Math.max(4, Math.min(HEIGHT - 6, Math.round(h))), c, m, isRiver };
  }

  column(x: number, z: number): Column {
    const { h, c, m, isRiver } = this.rawHeight(x, z);
    const temperature =
      this.n[6].fbm2(x / 640 + 1000, z / 640, 2) - Math.max(0, h - 92) / 45 + 0.05;
    const humidity = this.n[7].fbm2(x / 520 - 1000, z / 520, 2);
    const hx = this.rawHeight(x + 1, z).h;
    const hz = this.rawHeight(x, z + 1).h;
    const steep = Math.abs(hx - h) > 2 || Math.abs(hz - h) > 2;
    let biome: Biome;
    if (h < SEA) biome = isRiver ? 'river' : temperature < -0.42 ? 'frozen_ocean' : 'ocean';
    else if (h <= SEA + 2 && c < -0.06 && m < 0.3)
      biome = temperature < -0.35 ? 'snowy_beach' : 'beach';
    else if (m > 0.35 && h > 84) biome = 'mountains';
    else if (temperature > 0.28 && humidity < 0.08) biome = 'desert';
    else if (temperature < -0.28) biome = 'taiga';
    else if (humidity > 0.22) biome = temperature > 0.12 ? 'birch_forest' : 'forest';
    else biome = 'plains';
    return { height: h, biome, temperature, steep };
  }

  isCave(x: number, y: number, z: number, surface: number, biome: Biome) {
    if (y < 4 || y > surface) return false;
    // Keep the floors of oceans and rivers sealed.
    if (surface < SEA + 1 && y > surface - 7) return false;
    if ((biome === 'beach' || biome === 'snowy_beach') && y > surface - 4) return false;
    const a = this.n[3].noise3(x / 34, y / 22, z / 34);
    const b = this.n[4].noise3(x / 34 + 50, y / 22, z / 34 + 50);
    if (a * a + b * b < 0.011) return true;
    if (y < 52 && this.n[5].noise3(x / 72, y / 34, z / 72) > 0.56 - (52 - y) / 400) return true;
    return false;
  }

  /** Surface height for spawning: highest solid block + 1. */
  spawnHeight(x: number, z: number) {
    return this.column(x, z).height + 1;
  }
}

/** Ore vein table: block, deepslate variant, veins per chunk, size, max y. */
const ORES: [number, number, number, number, number][] = [
  [B.coalOre, B.deepslateCoal, 18, 12, 120],
  [B.ironOre, B.deepslateIron, 16, 8, 72],
  [B.goldOre, B.deepslateGold, 4, 8, 34],
  [B.redstoneOre, B.deepslateRedstone, 7, 7, 18],
  [B.lapisOre, B.deepslateLapis, 2, 6, 32],
  [B.diamondOre, B.deepslateDiamond, 2, 6, 16],
];
const BLOBS: [number, number, number, number][] = [
  [B.granite, 3, 28, 90],
  [B.diorite, 3, 28, 90],
  [B.andesite, 3, 28, 90],
  [B.gravel, 3, 24, 90],
  [B.dirt, 3, 24, 90],
];

const TREE_GRID: Partial<Record<Biome, [number, number]>> = {
  plains: [11, 0.22],
  forest: [4, 0.82],
  birch_forest: [4, 0.8],
  taiga: [5, 0.7],
  mountains: [9, 0.25],
};

export interface FluidUpdate {
  x: number;
  y: number;
  z: number;
  at: number;
}

export class World {
  readonly dimension: Dimension;
  readonly seed: number;
  readonly terrain: Terrain;
  readonly chunks = new Map<number, Chunk>();
  /** Saved edits for chunks not generated yet, keyed by chunk. */
  private pendingEdits = new Map<number, Map<number, number>>();
  private fluidQueue = new Map<string, FluidUpdate>();
  tick = 0;
  /** Positions of blocks that changed this tick (for physics of falling blocks etc). */
  readonly changed: { x: number; y: number; z: number; old: number; id: number }[] = [];
  /** Hook for game-level reactions to neighbour changes (falling sand, plant support). */
  onNeighborChange?: (x: number, y: number, z: number) => void;

  constructor(seed: number, dimension: Dimension = 'overworld') {
    this.dimension = dimension;
    this.seed = seed >>> 0;
    this.terrain = new Terrain(this.seed);
  }

  // -------------------------------------------------------------------------
  // Access
  // -------------------------------------------------------------------------
  chunkAt(x: number, z: number) {
    return this.chunks.get(chunkKey(x >> 4, z >> 4));
  }

  getBlock(x: number, y: number, z: number): number {
    if (y < 0) return this.dimension === 'end' ? B.air : B.bedrock;
    if (y >= HEIGHT) return B.air;
    const c = this.chunkAt(x, z);
    return c ? c.blocks[blockIndex(x & 15, y, z & 15)] : B.air;
  }

  getMeta(x: number, y: number, z: number): number {
    if (y < 0 || y >= HEIGHT) return 0;
    const c = this.chunkAt(x, z);
    return c ? c.meta[blockIndex(x & 15, y, z & 15)] : 0;
  }

  /** Raw light byte (sky << 4 | block); sky above the world, dark below. */
  getLight(x: number, y: number, z: number): number {
    if (y >= HEIGHT) return 240;
    if (y < 0) return 0;
    const c = this.chunkAt(x, z);
    return c ? c.light[blockIndex(x & 15, y, z & 15)] : 240;
  }

  isLoaded(x: number, z: number) {
    return Boolean(this.chunkAt(x, z));
  }

  // -------------------------------------------------------------------------
  // Generation
  // -------------------------------------------------------------------------
  loadEdits(edits: Map<number, Map<number, number>>) {
    for (const [key, map] of edits) this.pendingEdits.set(key, map);
  }

  ensureChunk(cx: number, cz: number): Chunk {
    const key = chunkKey(cx, cz);
    let chunk = this.chunks.get(key);
    if (chunk) return chunk;
    chunk = this.generate(cx, cz);
    const edits = this.pendingEdits.get(key);
    if (edits) {
      for (const [i, v] of edits) {
        chunk.blocks[i] = v & 255;
        chunk.meta[i] = v >> 8;
      }
      chunk.edits = edits;
      this.pendingEdits.delete(key);
    }
    this.chunks.set(key, chunk);
    return chunk;
  }

  /** Remove a far chunk from memory, keeping its edits for later. */
  unloadChunk(cx: number, cz: number) {
    const key = chunkKey(cx, cz);
    const c = this.chunks.get(key);
    if (!c) return;
    if (c.edits.size > 0) this.pendingEdits.set(key, c.edits);
    this.chunks.delete(key);
  }

  /** All edits, including unloaded chunks, for saving. */
  allEdits(): Map<number, Map<number, number>> {
    const out = new Map(this.pendingEdits);
    for (const [key, c] of this.chunks) if (c.edits.size > 0) out.set(key, c.edits);
    return out;
  }

  generate(cx: number, cz: number): Chunk {
    const blocks = new Uint8Array(VOLUME);
    const meta = new Uint8Array(VOLUME);
    if (this.dimension !== 'overworld') {
      dimensionBlocks(this.dimension, this.seed, cx, cz, blocks);
      return {
        cx,
        cz,
        blocks,
        meta,
        light: new Uint8Array(VOLUME),
        lit: false,
        dirty: true,
        edits: new Map(),
      };
    }
    const t = this.terrain;
    const x0 = cx * CHUNK;
    const z0 = cz * CHUNK;
    const PAD = 3;
    const W = CHUNK + PAD * 2;
    const cols: Column[] = Array.from({ length: W * W });
    for (let dz = 0; dz < W; dz++)
      for (let dx = 0; dx < W; dx++) cols[dz * W + dx] = t.column(x0 + dx - PAD, z0 + dz - PAD);
    const col = (lx: number, lz: number) => cols[(lz + PAD) * W + lx + PAD];

    for (let lz = 0; lz < CHUNK; lz++) {
      for (let lx = 0; lx < CHUNK; lx++) {
        const x = x0 + lx;
        const z = z0 + lz;
        const { height: h, biome, steep } = col(lx, lz);
        const r = hash3(this.seed, x, 0, z);
        const dirtDepth = 3 + Math.floor(r * 2);
        for (let y = 0; y <= Math.max(h, SEA); y++) {
          const i = blockIndex(lx, y, lz);
          let id: number = B.air;
          if (y === 0 || (y < 4 && hash3(this.seed, x, y, z) < 0.75 - y * 0.22)) id = B.bedrock;
          else if (y <= h) {
            const depth = h - y;
            id =
              y < DEEPSLATE + Math.floor(hash3(this.seed, x, y + 1, z) * 4) ? B.deepslate : B.stone;
            if (h < SEA) {
              // Sea and river beds.
              if (depth < 3) id = h < SEA - 12 ? B.gravel : B.sand;
              if (depth < 2 && hash3(this.seed, x >> 2, 3, z >> 2) < 0.08) id = B.clay;
            } else if (biome === 'desert') {
              if (depth < 4) id = B.sand;
              else if (depth < 7) id = B.sandstone;
            } else if (biome === 'beach' || biome === 'snowy_beach') {
              if (depth < 3) id = B.sand;
              else if (depth < 4) id = B.sandstone;
            } else if (biome === 'mountains') {
              const rocky = steep || h > 96;
              if (depth === 0) id = h > 104 ? B.snow : rocky ? B.stone : B.grass;
              else if (depth < dirtDepth && !rocky) id = B.dirt;
            } else if (depth === 0) id = biome === 'taiga' ? B.snowyGrass : B.grass;
            else if (depth < dirtDepth) id = B.dirt;
            if (y > 0 && id !== B.bedrock && t.isCave(x, y, z, h, biome))
              id = y <= 10 ? B.lava : B.air;
          } else if (y <= SEA) {
            id =
              y === SEA &&
              (biome === 'frozen_ocean' || (biome === 'river' && col(lx, lz).temperature < -0.35))
                ? B.ice
                : B.water;
          }
          blocks[i] = id;
        }
      }
    }

    // Ores and stone variants.
    const random = rng(hash3(this.seed, cx, 99, cz) * 4294967296);
    const vein = (ore: number, deep: number, size: number, maxY: number, replaceDeep = true) => {
      let x = Math.floor(random() * 16);
      let z = Math.floor(random() * 16);
      let y = 5 + Math.floor(random() * (maxY - 5));
      for (let s = 0; s < size; s++) {
        if (x >= 0 && x < 16 && z >= 0 && z < 16 && y > 0 && y < HEIGHT) {
          const i = blockIndex(x, y, z);
          if (blocks[i] === B.stone) blocks[i] = ore;
          else if (blocks[i] === B.deepslate && replaceDeep) blocks[i] = deep;
        }
        const d = Math.floor(random() * 6);
        if (d === 0) x++;
        else if (d === 1) x--;
        else if (d === 2) z++;
        else if (d === 3) z--;
        else if (d === 4) y++;
        else y--;
      }
    };
    for (const [ore, count, size, maxY] of BLOBS)
      for (let n = 0; n < count; n++) vein(ore, ore, size, maxY, false);
    for (const [ore, deep, count, size, maxY] of ORES)
      for (let n = 0; n < count; n++) vein(ore, deep, size, maxY);
    if (col(8, 8).biome === 'mountains') {
      for (let n = 0; n < 4; n++) {
        const i = blockIndex(
          Math.floor(random() * 16),
          5 + Math.floor(random() * 60),
          Math.floor(random() * 16),
        );
        if (blocks[i] === B.stone) blocks[i] = B.emeraldOre;
      }
    }

    // Trees from a jittered grid so they can straddle chunk borders.
    const place = (x: number, y: number, z: number, id: number, onlyAir: boolean) => {
      const lx = x - x0;
      const lz = z - z0;
      if (lx < 0 || lx >= 16 || lz < 0 || lz >= 16 || y <= 0 || y >= HEIGHT) return;
      const i = blockIndex(lx, y, lz);
      if (onlyAir && blocks[i] !== B.air && blocks[i] !== B.shortGrass && blocks[i] !== B.fern)
        return;
      blocks[i] = id;
    };
    for (let dz = -PAD; dz < CHUNK + PAD; dz++) {
      for (let dx = -PAD; dx < CHUNK + PAD; dx++) {
        const x = x0 + dx;
        const z = z0 + dz;
        const c = cols[(dz + PAD) * W + dx + PAD];
        const grid = TREE_GRID[c.biome];
        if (!grid || c.height < SEA || c.steep) continue;
        const [g, density] = grid;
        const gx = Math.floor(x / g);
        const gz = Math.floor(z / g);
        const px = gx * g + Math.floor(hash3(this.seed, gx, 11, gz) * g);
        const pz = gz * g + Math.floor(hash3(this.seed, gx, 13, gz) * g);
        if (px !== x || pz !== z || hash3(this.seed, gx, 17, gz) > density) continue;
        if (c.biome === 'mountains' && c.height > 96) continue;
        if (t.isCave(x, c.height, z, c.height, c.biome)) continue;
        const pick = hash3(this.seed, x, 19, z);
        const top = c.height;
        if (c.biome === 'taiga' || (c.biome === 'mountains' && pick < 0.6)) {
          spruce(place, x, top, z, pick);
        } else if (c.biome === 'birch_forest' || (c.biome === 'forest' && pick < 0.25)) {
          oak(place, x, top, z, pick, B.birchLog, B.birchLeaves, 5);
        } else oak(place, x, top, z, pick, B.oakLog, B.oakLeaves, 4);
        place(x, top, z, B.dirt, false);
      }
    }

    // Ground cover inside this chunk.
    for (let lz = 0; lz < CHUNK; lz++) {
      for (let lx = 0; lx < CHUNK; lx++) {
        const x = x0 + lx;
        const z = z0 + lz;
        const c = col(lx, lz);
        const y = c.height + 1;
        if (y >= HEIGHT) continue;
        const below = blocks[blockIndex(lx, y - 1, lz)];
        const here = blocks[blockIndex(lx, y, lz)];
        if (here !== B.air) continue;
        const r = hash3(this.seed, x, 23, z);
        const i = blockIndex(lx, y, lz);
        if (below === B.grass) {
          const grassChance = c.biome === 'plains' ? 0.28 : c.biome === 'mountains' ? 0.06 : 0.14;
          if (r < 0.012)
            blocks[i] = hash3(this.seed, x >> 3, 29, z >> 3) < 0.5 ? B.dandelion : B.poppy;
          else if (r < 0.012 + grassChance)
            blocks[i] = c.biome === 'forest' && r < 0.04 ? B.fern : B.shortGrass;
          else if (c.biome === 'plains' && r > 0.9993) blocks[i] = B.pumpkin;
        } else if (below === B.snowyGrass && r < 0.06) blocks[i] = B.fern;
        else if (below === B.sand && c.biome === 'desert') {
          if (r < 0.006 && lx > 0 && lx < 15 && lz > 0 && lz < 15) {
            const tall = 1 + Math.floor(hash3(this.seed, x, 31, z) * 3);
            for (let k = 0; k < tall && y + k < HEIGHT; k++)
              blocks[blockIndex(lx, y + k, lz)] = B.cactus;
          } else if (r < 0.014) blocks[i] = B.deadBush;
        }
        // Sugar cane on shores next to water.
        if (
          (below === B.sand || below === B.grass || below === B.dirt) &&
          y - 1 === SEA &&
          r > 0.82 &&
          blocks[i] === B.air
        ) {
          const near = [col(lx + 1, lz), col(lx - 1, lz), col(lx, lz + 1), col(lx, lz - 1)];
          if (near.some((n) => n.height < SEA)) {
            const tall = 1 + Math.floor(hash3(this.seed, x, 37, z) * 3);
            for (let k = 0; k < tall; k++) blocks[blockIndex(lx, y + k, lz)] = B.sugarCane;
          }
        }
      }
    }

    dimensionBlocks('overworld', this.seed, cx, cz, blocks);
    return {
      cx,
      cz,
      blocks,
      meta,
      light: new Uint8Array(VOLUME),
      lit: false,
      dirty: true,
      edits: new Map(),
    };
  }

  // -------------------------------------------------------------------------
  // Lighting
  // -------------------------------------------------------------------------
  private static readonly PAD = 15;
  private static readonly RW = CHUNK + World.PAD * 2;
  private static attn = new Uint8Array(World.RW * World.RW * HEIGHT);
  private static sky = new Uint8Array(World.RW * World.RW * HEIGHT);
  private static blk = new Uint8Array(World.RW * World.RW * HEIGHT);
  private static queue = new Int32Array(World.RW * World.RW * HEIGHT);

  /** Whether all eight neighbours have block data, so light and geometry are exact. */
  neighborsReady(cx: number, cz: number) {
    for (let dz = -1; dz <= 1; dz++)
      for (let dx = -1; dx <= 1; dx++)
        if (!this.chunks.has(chunkKey(cx + dx, cz + dz))) return false;
    return true;
  }

  /** Full light for one chunk from a padded neighbourhood (requires neighbours). */
  lightChunk(chunk: Chunk) {
    const PAD = World.PAD;
    const RW = World.RW;
    const { attn, sky, blk, queue } = World;
    const SLICE = RW * RW;
    blk.fill(0);
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        const c = this.chunks.get(chunkKey(chunk.cx + dx, chunk.cz + dz));
        for (let lz = 0; lz < 16; lz++) {
          const rz = (dz + 1) * 16 + lz - (16 - PAD);
          if (rz < 0 || rz >= RW) continue;
          for (let lx = 0; lx < 16; lx++) {
            const rx = (dx + 1) * 16 + lx - (16 - PAD);
            if (rx < 0 || rx >= RW) continue;
            for (let y = 0; y < HEIGHT; y++) {
              const ri = y * SLICE + rz * RW + rx;
              if (!c) {
                attn[ri] = 15;
                continue;
              }
              const bi = blockIndex(lx, y, lz);
              const id = c.blocks[bi];
              const def = BLOCKS[id];
              attn[ri] = def.opaque ? 15 : (def.filter ?? 0);
              const e = emission(id, c.meta[bi]);
              blk[ri] = e;
            }
          }
        }
      }
    }
    // Sky columns.
    for (let rz = 0; rz < RW; rz++) {
      for (let rx = 0; rx < RW; rx++) {
        let level = 15;
        for (let y = HEIGHT - 1; y >= 0; y--) {
          const ri = y * SLICE + rz * RW + rx;
          const a = attn[ri];
          if (a === 15) level = 0;
          else if (a) level = Math.max(0, level - a);
          sky[ri] = level;
        }
      }
    }
    const spread = (light: Uint8Array, isSky: boolean) => {
      let head = 0;
      let tail = 0;
      for (let y = 0; y < HEIGHT; y++) {
        for (let rz = 0; rz < RW; rz++) {
          for (let rx = 0; rx < RW; rx++) {
            const ri = y * SLICE + rz * RW + rx;
            const l = light[ri];
            if (l < 2) continue;
            if (!isSky) {
              queue[tail++] = ri;
              continue;
            }
            // Seed only cells next to a darker transparent neighbour.
            if (
              (rx > 0 && light[ri - 1] < l - 1 && attn[ri - 1] < 15) ||
              (rx < RW - 1 && light[ri + 1] < l - 1 && attn[ri + 1] < 15) ||
              (rz > 0 && light[ri - RW] < l - 1 && attn[ri - RW] < 15) ||
              (rz < RW - 1 && light[ri + RW] < l - 1 && attn[ri + RW] < 15) ||
              (y > 0 && light[ri - SLICE] < l - 1 && attn[ri - SLICE] < 15)
            )
              queue[tail++] = ri;
          }
        }
      }
      while (head < tail) {
        const ri = queue[head++];
        const l = light[ri];
        const y = Math.floor(ri / SLICE);
        const rem = ri - y * SLICE;
        const rz = Math.floor(rem / RW);
        const rx = rem - rz * RW;
        for (let n = 0; n < 6; n++) {
          let ni: number;
          if (n === 0) ni = rx > 0 ? ri - 1 : -1;
          else if (n === 1) ni = rx < RW - 1 ? ri + 1 : -1;
          else if (n === 2) ni = rz > 0 ? ri - RW : -1;
          else if (n === 3) ni = rz < RW - 1 ? ri + RW : -1;
          else if (n === 4) ni = y > 0 ? ri - SLICE : -1;
          else ni = y < HEIGHT - 1 ? ri + SLICE : -1;
          if (ni < 0) continue;
          const a = attn[ni];
          if (a === 15) continue;
          const nl = l - 1 - a;
          if (nl > light[ni]) {
            light[ni] = nl;
            if (nl > 1) queue[tail++] = ni;
          }
        }
      }
    };
    spread(sky, true);
    spread(blk, false);
    for (let y = 0; y < HEIGHT; y++)
      for (let lz = 0; lz < 16; lz++)
        for (let lx = 0; lx < 16; lx++) {
          const ri = y * SLICE + (lz + PAD) * RW + lx + PAD;
          chunk.light[blockIndex(lx, y, lz)] =
            (Math.max(sky[ri], this.dimension === 'nether' ? 11 : 0) << 4) | blk[ri];
        }
    chunk.lit = true;
    chunk.dirty = true;
  }

  private setLightChannel(x: number, y: number, z: number, isSky: boolean, v: number) {
    const c = this.chunkAt(x, z);
    if (!c || y < 0 || y >= HEIGHT) return;
    const i = blockIndex(x & 15, y, z & 15);
    const old = c.light[i];
    const next = isSky ? (old & 15) | (v << 4) : (old & 240) | v;
    if (next === old) return;
    c.light[i] = next;
    this.markDirty(x, z);
  }

  private channel(x: number, y: number, z: number, isSky: boolean) {
    const l = this.getLight(x, y, z);
    return isSky ? l >> 4 : l & 15;
  }

  private attnAt(x: number, y: number, z: number) {
    if (y < 0) return 15;
    if (y >= HEIGHT) return 0;
    if (!this.isLoaded(x, z)) return 15;
    const def = BLOCKS[this.getBlock(x, y, z)];
    return def.opaque ? 15 : (def.filter ?? 0);
  }

  /** Incremental relight around one changed cell (both channels). */
  relight(x: number, y: number, z: number) {
    for (const isSky of [true, false]) {
      const remove: [number, number, number, number][] = [];
      const add: [number, number, number][] = [];
      const old = this.channel(x, y, z, isSky);
      if (old > 0) {
        this.setLightChannel(x, y, z, isSky, 0);
        remove.push([x, y, z, old]);
      }
      while (remove.length > 0) {
        const [rx, ry, rz, level] = remove.pop()!;
        for (const [dx, dy, dz] of DIRS) {
          const nx = rx + dx;
          const ny = ry + dy;
          const nz = rz + dz;
          if (ny < 0 || ny >= HEIGHT || !this.isLoaded(nx, nz)) continue;
          const nl = this.channel(nx, ny, nz, isSky);
          if (nl === 0) continue;
          const straightSky = isSky && dy === -1 && level === 15 && nl === 15;
          if (nl < level || straightSky) {
            this.setLightChannel(nx, ny, nz, isSky, 0);
            remove.push([nx, ny, nz, nl]);
          } else add.push([nx, ny, nz]);
        }
      }
      // Seed the changed cell itself.
      const a = this.attnAt(x, y, z);
      if (isSky) {
        if (a < 15) {
          let best = 0;
          const above = y + 1 >= HEIGHT ? 15 : this.channel(x, y + 1, z, true);
          if (above === 15 && a === 0) best = 15;
          for (const [dx, dy, dz] of DIRS) {
            const nl = this.channel(x + dx, y + dy, z + dz, true) - 1 - a;
            if (nl > best) best = nl;
          }
          if (best > 0) {
            this.setLightChannel(x, y, z, true, best);
            add.push([x, y, z]);
          }
        }
      } else {
        const e = emission(this.getBlock(x, y, z), this.getMeta(x, y, z));
        let best = e;
        if (a < 15)
          for (const [dx, dy, dz] of DIRS) {
            const nl = this.channel(x + dx, y + dy, z + dz, false) - 1 - a;
            if (nl > best) best = nl;
          }
        if (best > 0) {
          this.setLightChannel(x, y, z, false, best);
          add.push([x, y, z]);
        }
      }
      // Propagate.
      let guard = 0;
      while (add.length > 0 && guard++ < 200000) {
        const [ax, ay, az] = add.pop()!;
        const level = this.channel(ax, ay, az, isSky);
        if (level <= 1) continue;
        for (const [dx, dy, dz] of DIRS) {
          const nx = ax + dx;
          const ny = ay + dy;
          const nz = az + dz;
          if (ny < 0 || ny >= HEIGHT || !this.isLoaded(nx, nz)) continue;
          const na = this.attnAt(nx, ny, nz);
          if (na === 15) continue;
          const nl = isSky && dy === -1 && level === 15 && na === 0 ? 15 : level - 1 - na;
          if (nl > this.channel(nx, ny, nz, isSky)) {
            this.setLightChannel(nx, ny, nz, isSky, nl);
            add.push([nx, ny, nz]);
          }
        }
      }
    }
  }

  markDirty(x: number, z: number) {
    const c = this.chunkAt(x, z);
    if (c) c.dirty = true;
    const lx = x & 15;
    const lz = z & 15;
    if (lx === 0) this.markChunk((x >> 4) - 1, z >> 4);
    if (lx === 15) this.markChunk((x >> 4) + 1, z >> 4);
    if (lz === 0) this.markChunk(x >> 4, (z >> 4) - 1);
    if (lz === 15) this.markChunk(x >> 4, (z >> 4) + 1);
    if (lx === 0 && lz === 0) this.markChunk((x >> 4) - 1, (z >> 4) - 1);
    if (lx === 15 && lz === 15) this.markChunk((x >> 4) + 1, (z >> 4) + 1);
    if (lx === 0 && lz === 15) this.markChunk((x >> 4) - 1, (z >> 4) + 1);
    if (lx === 15 && lz === 0) this.markChunk((x >> 4) + 1, (z >> 4) - 1);
  }

  private markChunk(cx: number, cz: number) {
    const c = this.chunks.get(chunkKey(cx, cz));
    if (c) c.dirty = true;
  }

  // -------------------------------------------------------------------------
  // Edits
  // -------------------------------------------------------------------------
  /** Set a block, updating light, geometry, edit history and neighbour reactions. */
  setBlock(x: number, y: number, z: number, id: number, meta = 0, notify = true) {
    if (y < 0 || y >= HEIGHT) return false;
    const c = this.chunkAt(x, z);
    if (!c) return false;
    const i = blockIndex(x & 15, y, z & 15);
    const old = c.blocks[i];
    const oldMeta = c.meta[i];
    if (old === id && oldMeta === meta) return false;
    c.blocks[i] = id;
    c.meta[i] = meta;
    c.edits.set(i, id | (meta << 8));
    this.markDirty(x, z);
    const lightChanged =
      BLOCKS[old].opaque !== BLOCKS[id].opaque ||
      (BLOCKS[old].filter ?? 0) !== (BLOCKS[id].filter ?? 0) ||
      emission(old, oldMeta) !== emission(id, meta);
    if (c.lit && lightChanged) this.relight(x, y, z);
    this.changed.push({ x, y, z, old, id });
    if (notify) {
      this.scheduleFluids(x, y, z);
      if (this.onNeighborChange)
        for (const [dx, dy, dz] of DIRS) this.onNeighborChange(x + dx, y + dy, z + dz);
    }
    return true;
  }

  // -------------------------------------------------------------------------
  // Fluids
  // -------------------------------------------------------------------------
  scheduleFluids(x: number, y: number, z: number) {
    this.scheduleFluid(x, y, z);
    for (const [dx, dy, dz] of DIRS) this.scheduleFluid(x + dx, y + dy, z + dz);
  }

  private scheduleFluid(x: number, y: number, z: number) {
    const id = this.getBlock(x, y, z);
    if (!isLiquid(id)) return;
    const key = `${x},${y},${z}`;
    if (this.fluidQueue.has(key)) return;
    const delay = id === B.water ? 5 : 30;
    this.fluidQueue.set(key, { x, y, z, at: this.tick + delay });
  }

  /** Liquid level 0 (source) .. 7, or 8 when falling; -1 when not this fluid. */
  private level(x: number, y: number, z: number, fluid: number) {
    if (this.getBlock(x, y, z) !== fluid) return -1;
    return this.getMeta(x, y, z);
  }

  private replaceable(x: number, y: number, z: number) {
    const id = this.getBlock(x, y, z);
    return !BLOCKS[id].solid && !isLiquid(id) && id !== B.ladder && id !== B.door;
  }

  /** Advance scheduled fluid updates; returns the number processed. */
  stepFluids(budget = 400) {
    this.tick++;
    let n = 0;
    const due: FluidUpdate[] = [];
    for (const [key, u] of this.fluidQueue) {
      if (u.at > this.tick) continue;
      this.fluidQueue.delete(key);
      due.push(u);
      if (due.length >= budget) break;
    }
    for (const u of due) {
      n++;
      this.updateFluid(u.x, u.y, u.z);
    }
    return n;
  }

  private updateFluid(x: number, y: number, z: number) {
    const fluid = this.getBlock(x, y, z);
    if (!isLiquid(fluid)) return;
    if (!this.isLoaded(x, z)) return;
    const water = fluid === B.water;
    const step = water ? 1 : 2;
    const max = 7;
    const other = water ? B.lava : B.water;
    const meta = this.getMeta(x, y, z);
    // Lava meeting water hardens.
    if (!water) {
      for (const [dx, dy, dz] of DIRS) {
        if (dy === -1) continue;
        if (this.getBlock(x + dx, y + dy, z + dz) === other) {
          this.setBlock(x, y, z, meta === 0 ? B.obsidian : B.cobblestone);
          return;
        }
      }
    }
    let level = meta;
    if (meta !== 0) {
      // Recompute from feeders.
      const above = this.level(x, y + 1, z, fluid);
      let best = 99;
      let sources = 0;
      for (const [dx, , dz] of HDIRS) {
        const l = this.level(x + dx, y, z + dz, fluid);
        if (l < 0) continue;
        if (l === 0) sources++;
        const eff = l === 8 ? 0 : l;
        best = Math.min(best, eff + step);
      }
      if (above >= 0) level = 8;
      else if (water && sources >= 2 && this.supportsSource(x, y - 1, z)) level = 0;
      else level = best;
      if (level !== 8 && level > max) {
        this.setBlock(x, y, z, B.air);
        return;
      }
      if (level !== meta) {
        this.setBlock(x, y, z, fluid, level);
        return;
      }
    }
    // Spread.
    const belowId = this.getBlock(x, y - 1, z);
    if (belowId === other && !water) {
      this.setBlock(x, y - 1, z, B.stone);
      return;
    }
    if (
      y > 0 &&
      (this.replaceable(x, y - 1, z) ||
        (belowId === fluid && this.getMeta(x, y - 1, z) !== 0 && this.getMeta(x, y - 1, z) !== 8))
    ) {
      if (belowId !== fluid) this.dropPlant(x, y - 1, z);
      this.setBlock(x, y - 1, z, fluid, 8);
      return;
    }
    const eff = level === 8 ? 0 : level;
    if (eff + step > max) return;
    const belowSolid =
      BLOCKS[belowId].solid || (belowId === fluid && this.getMeta(x, y - 1, z) === 0);
    if (!belowSolid && level !== 0 && level !== 8) return;
    for (const [dx, , dz] of HDIRS) {
      const nx = x + dx;
      const nz = z + dz;
      const nId = this.getBlock(nx, y, nz);
      if (nId === other) {
        if (water) {
          const lavaMeta = this.getMeta(nx, y, nz);
          this.setBlock(nx, y, nz, lavaMeta === 0 ? B.obsidian : B.cobblestone);
        }
        continue;
      }
      if (nId === fluid) {
        const nl = this.getMeta(nx, y, nz);
        if (nl !== 0 && nl !== 8 && nl > eff + step) this.setBlock(nx, y, nz, fluid, eff + step);
        continue;
      }
      if (this.replaceable(nx, y, nz)) {
        this.dropPlant(nx, y, nz);
        this.setBlock(nx, y, nz, fluid, eff + step);
      }
    }
  }

  private supportsSource(x: number, y: number, z: number) {
    const id = this.getBlock(x, y, z);
    return BLOCKS[id].solid || (id === B.water && this.getMeta(x, y, z) === 0);
  }

  /** Plants washed away by fluids; the game turns these into drops. */
  readonly washed: { x: number; y: number; z: number; id: number }[] = [];
  private dropPlant(x: number, y: number, z: number) {
    const id = this.getBlock(x, y, z);
    if (id !== B.air && !isLiquid(id)) this.washed.push({ x, y, z, id });
  }

  pendingFluids() {
    return this.fluidQueue.size;
  }

  /** Highest non-air block at a column (for spawn and rain). */
  topSolid(x: number, z: number) {
    for (let y = HEIGHT - 1; y > 0; y--) {
      const id = this.getBlock(x, y, z);
      if (id !== B.air && BLOCKS[id].solid) return y;
    }
    return 0;
  }
}

export const DIRS: readonly [number, number, number][] = [
  [1, 0, 0],
  [-1, 0, 0],
  [0, 1, 0],
  [0, -1, 0],
  [0, 0, 1],
  [0, 0, -1],
];
const HDIRS: readonly [number, number, number][] = [
  [1, 0, 0],
  [-1, 0, 0],
  [0, 0, 1],
  [0, 0, -1],
];

type Place = (x: number, y: number, z: number, id: number, onlyAir: boolean) => void;

function oak(
  place: Place,
  x: number,
  top: number,
  z: number,
  r: number,
  log: number,
  leaves: number,
  base: number,
) {
  const height = base + Math.floor(r * 3);
  const crown = top + height;
  for (let dy = -3; dy <= 0; dy++) {
    const radius = dy >= -1 ? 1 : 2;
    for (let dx = -radius; dx <= radius; dx++) {
      for (let dz = -radius; dz <= radius; dz++) {
        const corner = Math.abs(dx) === radius && Math.abs(dz) === radius;
        if (corner && (dy === 0 || hash3(r * 1e6, x + dx, crown + dy, z + dz) < 0.5)) continue;
        place(x + dx, crown + dy, z + dz, leaves, true);
      }
    }
  }
  for (let k = 1; k <= height; k++) place(x, top + k, z, log, false);
}

function spruce(place: Place, x: number, top: number, z: number, r: number) {
  const height = 6 + Math.floor(r * 4);
  const crown = top + height;
  place(x, crown + 1, z, B.spruceLeaves, true);
  for (let y = crown; y > top + 2; y--) {
    const k = crown - y;
    const radius = k < 2 ? k % 2 : k % 2 === 0 ? 1 : 2;
    for (let dx = -radius; dx <= radius; dx++)
      for (let dz = -radius; dz <= radius; dz++) {
        if (radius > 1 && Math.abs(dx) === radius && Math.abs(dz) === radius) continue;
        place(x + dx, y, z + dz, B.spruceLeaves, true);
      }
  }
  for (let k = 1; k <= height; k++) place(x, top + k, z, B.spruceLog, false);
}
