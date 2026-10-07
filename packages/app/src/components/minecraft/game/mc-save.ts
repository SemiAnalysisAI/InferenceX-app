import {
  Game as GameClass,
  type Difficulty,
  type Entity,
  type Furnace,
  type Game,
  type GameMode,
  type MobKind,
} from './mc-game';
import { ITEMS, type Stack } from './mc-items';

const LIST_KEY = 'inferencex-minecraft-worlds';
const WORLD_PREFIX = 'inferencex-minecraft-world-';
export const SAVE_VERSION = 1;

export interface WorldMeta {
  id: string;
  name: string;
  seed: string;
  mode: GameMode;
  difficulty: Difficulty;
  created: number;
  lastPlayed: number;
}

interface SavedMob {
  kind: MobKind;
  x: number;
  y: number;
  z: number;
  yaw: number;
  health: number;
  sheared?: boolean;
}

interface SavedItem {
  stack: Stack;
  x: number;
  y: number;
  z: number;
  age: number;
}

export interface SaveData {
  version: number;
  meta: WorldMeta;
  time: number;
  ticks: number;
  mode: GameMode;
  difficulty: Difficulty;
  player: Record<string, number | boolean | string>;
  inventory: (Stack | null)[];
  selected: number;
  /** Chunk key → base64 of [uint16 index, uint8 id, uint8 meta] records. */
  edits: Record<string, string>;
  furnaces: Record<string, Furnace>;
  chests: Record<string, (Stack | null)[]>;
  mobs: SavedMob[];
  items: SavedItem[];
  animalChunks: number[];
}

const PLAYER_FIELDS = [
  'x',
  'y',
  'z',
  'yaw',
  'pitch',
  'health',
  'food',
  'saturation',
  'exhaustion',
  'air',
  'xp',
  'level',
  'fire',
  'flying',
  'spawnX',
  'spawnY',
  'spawnZ',
  'dead',
  'deathMessage',
] as const;

function toBase64(bytes: Uint8Array) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000)
    s += String.fromCodePoint(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

function fromBase64(text: string) {
  const s = atob(text);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.codePointAt(i) ?? 0;
  return out;
}

export function encodeEdits(edits: Map<number, number>) {
  const bytes = new Uint8Array(edits.size * 4);
  let o = 0;
  for (const [index, v] of edits) {
    bytes[o++] = index & 255;
    bytes[o++] = index >> 8;
    bytes[o++] = v & 255;
    bytes[o++] = (v >> 8) & 255;
  }
  return toBase64(bytes);
}

export function decodeEdits(text: string) {
  const bytes = fromBase64(text);
  const map = new Map<number, number>();
  for (let o = 0; o + 3 < bytes.length; o += 4)
    map.set(bytes[o] | (bytes[o + 1] << 8), bytes[o + 2] | (bytes[o + 3] << 8));
  return map;
}

const validStack = (s: unknown): s is Stack =>
  Boolean(s) &&
  typeof s === 'object' &&
  typeof (s as Stack).id === 'string' &&
  Boolean(ITEMS[(s as Stack).id]) &&
  (s as Stack).count > 0;
const cleanStacks = (list: unknown, length: number) =>
  Array.from({ length }, (_, i) => {
    const s = Array.isArray(list) ? list[i] : null;
    return validStack(s) ? { ...s } : null;
  });

function mergeStack(inventory: (Stack | null)[], stack: Stack): number {
  let left = stack.count;
  const limit = ITEMS[stack.id]?.stack ?? 64;
  for (let i = 0; i < 36 && left; i++) {
    const s = inventory[i];
    if (s && s.id === stack.id && !s.wear && !stack.wear && s.count < limit) {
      const n = Math.min(limit - s.count, left);
      s.count += n;
      left -= n;
    }
  }
  for (let i = 0; i < 36 && left; i++) {
    if (!inventory[i]) {
      const n = Math.min(limit, left);
      inventory[i] = { id: stack.id, count: n, wear: stack.wear };
      left -= n;
    }
  }
  return left;
}

export function serialize(game: Game, meta: WorldMeta): SaveData {
  const p = game.player as unknown as Record<string, number | boolean | string>;
  const player: SaveData['player'] = {};
  for (const f of PLAYER_FIELDS) player[f] = p[f];
  const edits: Record<string, string> = {};
  for (const [key, map] of game.world.allEdits()) if (map.size > 0) edits[key] = encodeEdits(map);
  const mobs: SavedMob[] = [];
  const items: SavedItem[] = [];
  for (const e of game.entities) {
    if (e.removed || e.deathTime > 0) continue;
    if (e.kind === 'item' && e.stack)
      items.push({ stack: { ...e.stack }, x: e.x, y: e.y, z: e.z, age: e.age });
    else if (e.kind !== 'tnt' && e.kind !== 'falling' && e.kind !== 'arrow' && e.kind !== 'item')
      mobs.push({
        kind: e.kind,
        x: e.x,
        y: e.y,
        z: e.z,
        yaw: e.yaw,
        health: e.health,
        sheared: e.sheared,
      });
  }
  // Fold any open crafting grid and the cursor into the saved inventory, as closing
  // the screen would; whatever does not fit is saved as dropped items below.
  const inventory = game.inventory.map((s) => (s ? { ...s } : null));
  for (const s of [...game.craftGrid, game.cursor]) {
    if (!s) continue;
    const left = mergeStack(inventory, s);
    if (left) {
      const { x, y, z } = game.player;
      items.push({ stack: { ...s, count: left }, x, y: y + 1, z, age: 0 });
    }
  }
  return {
    version: SAVE_VERSION,
    meta: { ...meta, lastPlayed: Date.now(), mode: game.mode, difficulty: game.difficulty },
    time: game.time,
    ticks: game.ticks,
    mode: game.mode,
    difficulty: game.difficulty,
    player,
    inventory,
    selected: game.selected,
    edits,
    furnaces: Object.fromEntries(game.furnaces),
    chests: Object.fromEntries(game.chests),
    mobs,
    items,
    animalChunks: [...game.animalChunks],
  };
}

export function restore(data: SaveData): Game {
  const game = new GameClass({
    seed: data.meta.seed,
    name: data.meta.name,
    mode: data.mode,
    difficulty: data.difficulty,
  });
  game.time = Number(data.time) || 0;
  game.ticks = Number(data.ticks) || 0;
  const edits = new Map<number, Map<number, number>>();
  for (const [key, text] of Object.entries(data.edits ?? {})) {
    try {
      edits.set(Number(key), decodeEdits(text));
    } catch {
      /* skip corrupt chunk */
    }
  }
  game.world.loadEdits(edits);
  const p = game.player as unknown as Record<string, number | boolean | string>;
  for (const f of PLAYER_FIELDS) {
    const v = data.player?.[f];
    if (v !== undefined && typeof v === typeof p[f]) p[f] = v;
  }
  game.player.px = game.player.x;
  game.player.py = game.player.y;
  game.player.pz = game.player.z;
  game.inventory = cleanStacks(data.inventory, 36);
  game.selected = Math.max(0, Math.min(8, Number(data.selected) || 0));
  for (const [key, f] of Object.entries(data.furnaces ?? {}))
    game.furnaces.set(key, {
      input: validStack(f.input) ? f.input : null,
      fuel: validStack(f.fuel) ? f.fuel : null,
      output: validStack(f.output) ? f.output : null,
      burn: Number(f.burn) || 0,
      burnMax: Number(f.burnMax) || 0,
      cook: Number(f.cook) || 0,
    });
  for (const [key, c] of Object.entries(data.chests ?? {}))
    game.chests.set(key, cleanStacks(c, 27));
  for (const k of data.animalChunks ?? []) game.animalChunks.add(k);
  for (const m of data.mobs ?? []) {
    const e: Entity = game.spawnMob(m.kind, m.x, m.y, m.z);
    e.yaw = m.yaw;
    e.pyaw = m.yaw;
    e.health = Math.min(e.maxHealth, m.health);
    e.sheared = m.sheared;
  }
  for (const it of data.items ?? [])
    if (validStack(it.stack))
      game.spawnItem(it.stack, it.x, it.y + 0.125, it.z, 0, 0, 0, 0).age = it.age;
  return game;
}

export function listWorlds(): WorldMeta[] {
  try {
    const raw = localStorage.getItem(LIST_KEY);
    const list = raw ? (JSON.parse(raw) as WorldMeta[]) : [];
    return Array.isArray(list) ? list.toSorted((a, b) => b.lastPlayed - a.lastPlayed) : [];
  } catch {
    return [];
  }
}

function writeList(list: WorldMeta[]) {
  localStorage.setItem(LIST_KEY, JSON.stringify(list));
}

export function saveWorld(data: SaveData) {
  try {
    localStorage.setItem(WORLD_PREFIX + data.meta.id, JSON.stringify(data));
    const list = listWorlds().filter((w) => w.id !== data.meta.id);
    list.unshift(data.meta);
    writeList(list);
    return true;
  } catch {
    return false;
  }
}

export function loadWorld(id: string): SaveData | null {
  try {
    const raw = localStorage.getItem(WORLD_PREFIX + id);
    if (!raw) return null;
    const data = JSON.parse(raw) as SaveData;
    return data.version === SAVE_VERSION ? data : null;
  } catch {
    return null;
  }
}

export function deleteWorld(id: string) {
  try {
    localStorage.removeItem(WORLD_PREFIX + id);
    writeList(listWorlds().filter((w) => w.id !== id));
  } catch {
    /* storage unavailable */
  }
}

export function newWorldMeta(
  name: string,
  seed: string,
  mode: GameMode,
  difficulty: Difficulty,
): WorldMeta {
  const now = Date.now();
  return {
    id: `${now.toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`,
    name: name.trim() || 'New World',
    seed: seed.trim() || String(Math.floor(Math.random() * 2 ** 31)),
    mode,
    difficulty,
    created: now,
    lastPlayed: now,
  };
}
