import type { SoundKey } from './mc-atlas';
import {
  B,
  BLOCKS,
  collisionBoxes,
  emission,
  isLiquid,
  type BlockDef,
  type SoundGroup,
} from './mc-blocks';
import {
  breakTime,
  canHarvest,
  craft,
  ITEMS,
  itemName,
  maxStack,
  SMELT_TIME,
  SMELTING,
  type Stack,
} from './mc-items';
import { hash3, hashSeed, rng } from './mc-noise';
import {
  bodyBox,
  climbableAt,
  intersectsBlock,
  liquidAt,
  move,
  raycast,
  rayEntity,
  type Body,
  type RayHit,
} from './mc-physics';
import { CHUNK, chunkKey, DIRS, HEIGHT, SEA, World } from './mc-world';

export const TPS = 20;
export const DAY = 24000;
export type GameMode = 'survival' | 'creative';
export type Difficulty = 'peaceful' | 'easy' | 'normal' | 'hard';
export type MobKind = 'zombie' | 'creeper' | 'skeleton' | 'pig' | 'cow' | 'sheep' | 'chicken';
export type EntityKind = MobKind | 'item' | 'tnt' | 'falling' | 'arrow';
export const HOSTILE: ReadonlySet<EntityKind> = new Set(['zombie', 'creeper', 'skeleton']);

export interface Entity extends Body {
  id: number;
  kind: EntityKind;
  yaw: number;
  pitch: number;
  headYaw: number;
  /** Previous tick state for render interpolation. */
  px: number;
  py: number;
  pz: number;
  pyaw: number;
  health: number;
  maxHealth: number;
  hurtTime: number;
  invulnerable: number;
  deathTime: number;
  fire: number;
  fallDistance: number;
  age: number;
  inWater: boolean;
  inLava: boolean;
  limbSwing: number;
  limbAmount: number;
  removed: boolean;
  // AI
  wanderX?: number;
  wanderZ?: number;
  wanderTime?: number;
  panic?: number;
  attackCooldown?: number;
  fuse?: number;
  sheared?: boolean;
  lastSound?: number;
  // item / falling / tnt payload
  stack?: Stack;
  pickupDelay?: number;
  block?: number;
  blockMeta?: number;
  owner?: 'player' | 'mob';
}

export interface Player extends Body {
  yaw: number;
  pitch: number;
  px: number;
  py: number;
  pz: number;
  health: number;
  food: number;
  saturation: number;
  exhaustion: number;
  air: number;
  xp: number;
  level: number;
  fallDistance: number;
  invulnerable: number;
  hurtTime: number;
  fire: number;
  flying: boolean;
  sneaking: boolean;
  sprinting: boolean;
  inWater: boolean;
  inLava: boolean;
  eyesInWater: boolean;
  dead: boolean;
  deathMessage: string;
  spawnX: number;
  spawnY: number;
  spawnZ: number;
  foodTimer: number;
  swing: number;
  eating: number;
  walkDist: number;
  bob: number;
  lastStep: number;
}

export interface Input {
  forward: boolean;
  back: boolean;
  left: boolean;
  right: boolean;
  jump: boolean;
  sneak: boolean;
  sprint: boolean;
  attack: boolean;
  use: boolean;
  /** Analog movement from a touch stick, overriding the keys when non-zero. */
  moveX?: number;
  moveZ?: number;
}
export const NO_INPUT: Input = {
  forward: false,
  back: false,
  left: false,
  right: false,
  jump: false,
  sneak: false,
  sprint: false,
  attack: false,
  use: false,
};

export type GameEvent =
  | { type: 'sound'; key: SoundKey; x: number; y: number; z: number; volume: number; pitch: number }
  | { type: 'break'; x: number; y: number; z: number; id: number }
  | { type: 'explode'; x: number; y: number; z: number; power: number }
  | { type: 'hurt' }
  | { type: 'message'; text: string }
  | { type: 'open'; screen: Screen }
  | { type: 'death' };

export type Screen =
  | { kind: 'inventory' }
  | { kind: 'crafting'; x: number; y: number; z: number }
  | { kind: 'furnace'; x: number; y: number; z: number }
  | { kind: 'chest'; x: number; y: number; z: number }
  | { kind: 'creative' };

export interface Furnace {
  input: Stack | null;
  fuel: Stack | null;
  output: Stack | null;
  burn: number;
  burnMax: number;
  cook: number;
}

export type SlotRef =
  | { kind: 'inv'; index: number }
  | { kind: 'craft'; index: number }
  | { kind: 'result' }
  | { kind: 'furnace'; slot: 'input' | 'fuel' | 'output' }
  | { kind: 'chest'; index: number };

export interface GameOptions {
  seed: string;
  name: string;
  mode: GameMode;
  difficulty: Difficulty;
}

const DIG_SOUND: Record<SoundGroup, SoundKey> = {
  grass: 'dig/grass',
  stone: 'dig/stone',
  wood: 'dig/wood',
  gravel: 'dig/gravel',
  sand: 'dig/sand',
  cloth: 'dig/cloth',
  snow: 'dig/snow',
  glass: 'random/glass',
};
const STEP_SOUND: Record<SoundGroup, SoundKey> = {
  grass: 'step/grass',
  stone: 'step/stone',
  wood: 'step/wood',
  gravel: 'step/gravel',
  sand: 'step/sand',
  cloth: 'step/cloth',
  snow: 'step/snow',
  glass: 'step/stone',
};

const MOB_STATS: Record<MobKind, { w: number; h: number; health: number; speed: number }> = {
  zombie: { w: 0.6, h: 1.95, health: 20, speed: 0.23 },
  skeleton: { w: 0.6, h: 1.99, health: 20, speed: 0.25 },
  creeper: { w: 0.6, h: 1.7, health: 20, speed: 0.25 },
  pig: { w: 0.9, h: 0.9, health: 10, speed: 0.25 },
  cow: { w: 0.9, h: 1.4, health: 10, speed: 0.2 },
  sheep: { w: 0.9, h: 1.3, health: 8, speed: 0.23 },
  chicken: { w: 0.4, h: 0.7, health: 4, speed: 0.25 },
};

const SAY: Partial<Record<MobKind, SoundKey>> = {
  zombie: 'mob/zombie/say',
  pig: 'mob/pig/say',
  cow: 'mob/cow/say',
  sheep: 'mob/sheep/say',
  chicken: 'mob/chicken/say',
};
const HURT: Record<MobKind, SoundKey> = {
  zombie: 'mob/zombie/hurt',
  skeleton: 'damage/hit',
  creeper: 'mob/creeper/say',
  pig: 'mob/pig/say',
  cow: 'mob/cow/hurt',
  sheep: 'mob/sheep/say',
  chicken: 'mob/chicken/hurt',
};
const DEATH: Partial<Record<MobKind, SoundKey>> = {
  zombie: 'mob/zombie/death',
  creeper: 'mob/creeper/death',
  pig: 'mob/pig/death',
};

/** Blast resistance used by explosions (original values / 5 are folded in). */
function resistance(id: number) {
  if (id === B.bedrock) return 1e9;
  if (id === B.obsidian) return 1200;
  if (isLiquid(id)) return 100;
  const def = BLOCKS[id];
  if (
    def.key.includes('ore') ||
    def.id === B.stone ||
    def.key.includes('cobble') ||
    def.key.includes('brick') ||
    def.key.includes('deepslate')
  )
    return 6;
  if (def.key.includes('planks') || def.key.includes('log')) return 3;
  return Math.max(0, def.hardness);
}

export function xpForLevel(level: number) {
  if (level < 16) return 2 * level + 7;
  if (level < 31) return 5 * level - 38;
  return 9 * level - 158;
}

/** Day light multiplier for sky light (1 at noon, about 0.2 at midnight). */
export function daylight(time: number) {
  const sun = Math.sin(((time % DAY) / DAY) * Math.PI * 2);
  return Math.min(1, Math.max(0.2, 0.55 + sun * 1.4));
}

const DROP_SPREAD = 0.1;

export class Game {
  readonly world: World;
  readonly options: GameOptions;
  readonly seedNumber: number;
  mode: GameMode;
  difficulty: Difficulty;
  time = 1000;
  ticks = 0;
  readonly player: Player;
  /** 0-8 hotbar, 9-35 main inventory. */
  inventory: (Stack | null)[] = emptySlots(36);
  selected = 0;
  cursor: Stack | null = null;
  craftGrid: (Stack | null)[] = emptySlots(9);
  craftSize: 2 | 3 = 2;
  screen: Screen | null = null;
  readonly entities: Entity[] = [];
  readonly furnaces = new Map<string, Furnace>();
  readonly chests = new Map<string, (Stack | null)[]>();
  readonly events: GameEvent[] = [];
  readonly animalChunks = new Set<number>();
  /** Block currently targeted and its break progress (0..1). */
  target: RayHit | null = null;
  targetEntity: Entity | null = null;
  breakProgress = 0;
  private breakKey = '';
  private breakCooldown = 0;
  private useCooldown = 0;
  private nextId = 1;
  private pendingChecks = new Set<string>();
  private random: () => number;
  renderDistance = 6;
  private input: Input = NO_INPUT;
  private lastJump = false;
  private jumpTapTick = -100;
  private lastForward = false;
  private forwardTapTick = -100;
  private doubleTapSprint = false;
  private accumulator = 0;
  locale: 'en' | 'zh' = 'en';

  constructor(options: GameOptions) {
    this.options = options;
    this.mode = options.mode;
    this.difficulty = options.difficulty;
    const numeric = /^-?\d+$/.test(options.seed.trim())
      ? Number(options.seed)
      : hashSeed(options.seed);
    this.seedNumber = numeric >>> 0;
    this.world = new World(this.seedNumber);
    this.world.onNeighborChange = (x, y, z) => this.pendingChecks.add(`${x},${y},${z}`);
    this.random = rng(this.seedNumber ^ 2654435769);
    const spawn = this.findSpawn();
    this.player = {
      x: spawn.x + 0.5,
      y: spawn.y,
      z: spawn.z + 0.5,
      vx: 0,
      vy: 0,
      vz: 0,
      w: 0.6,
      h: 1.8,
      step: 0.6,
      onGround: false,
      collidedH: false,
      yaw: 0,
      pitch: 0,
      px: spawn.x + 0.5,
      py: spawn.y,
      pz: spawn.z + 0.5,
      health: 20,
      food: 20,
      saturation: 5,
      exhaustion: 0,
      air: 300,
      xp: 0,
      level: 0,
      fallDistance: 0,
      invulnerable: 0,
      hurtTime: 0,
      fire: 0,
      flying: false,
      sneaking: false,
      sprinting: false,
      inWater: false,
      inLava: false,
      eyesInWater: false,
      dead: false,
      deathMessage: '',
      spawnX: spawn.x + 0.5,
      spawnY: spawn.y,
      spawnZ: spawn.z + 0.5,
      foodTimer: 0,
      swing: 0,
      eating: 0,
      walkDist: 0,
      bob: 0,
      lastStep: 0,
    };
  }

  /** Land spawn near the origin, avoiding oceans. */
  findSpawn() {
    const t = this.world.terrain;
    for (let r = 0; r < 4000; r += 16) {
      for (let a = 0; a < 8; a++) {
        const x = Math.round(Math.cos(a * 0.785) * r);
        const z = Math.round(Math.sin(a * 0.785) * r);
        const c = t.column(x, z);
        if (
          c.height >= SEA + 1 &&
          c.biome !== 'mountains' &&
          c.biome !== 'river' &&
          !t.isCave(x, c.height, z, c.height, c.biome)
        )
          return { x, y: c.height + 1, z };
      }
    }
    return { x: 0, y: HEIGHT - 20, z: 0 };
  }

  // -------------------------------------------------------------------------
  // Chunk streaming (called every frame with a time budget)
  // -------------------------------------------------------------------------
  /** Generate and light chunks around the player; returns true when the spawn area is ready. */
  streamChunks(budgetMs: number, now: () => number = () => performance.now()) {
    const start = now();
    const pcx = Math.floor(this.player.x / CHUNK);
    const pcz = Math.floor(this.player.z / CHUNK);
    // Generate two rings beyond the render distance and light one, so meshed chunks have lit neighbours.
    const r = this.renderDistance + 2;
    const order: [number, number, number][] = [];
    for (let dz = -r; dz <= r; dz++)
      for (let dx = -r; dx <= r; dx++) order.push([dx * dx + dz * dz, pcx + dx, pcz + dz]);
    order.sort((a, b) => a[0] - b[0]);
    for (const [d2, cx, cz] of order) {
      if (d2 > r * r) continue;
      if (now() - start > budgetMs) return false;
      if (!this.world.chunks.has(chunkKey(cx, cz))) {
        this.world.ensureChunk(cx, cz);
        this.spawnAnimals(cx, cz);
      }
    }
    for (const [d2, cx, cz] of order) {
      if (d2 > (r - 1) * (r - 1)) continue;
      const c = this.world.chunks.get(chunkKey(cx, cz));
      if (!c || c.lit) continue;
      if (!this.world.neighborsReady(cx, cz)) continue;
      if (now() - start > budgetMs) return false;
      this.world.lightChunk(c);
    }
    // Unload far chunks.
    for (const c of this.world.chunks.values()) {
      const dx = c.cx - pcx;
      const dz = c.cz - pcz;
      if (dx * dx + dz * dz > (r + 3) * (r + 3)) this.world.unloadChunk(c.cx, c.cz);
    }
    return true;
  }

  spawnReady() {
    const c = this.world.chunkAt(Math.floor(this.player.x), Math.floor(this.player.z));
    return Boolean(c?.lit);
  }

  private spawnAnimals(cx: number, cz: number) {
    const key = chunkKey(cx, cz);
    if (this.animalChunks.has(key)) return;
    this.animalChunks.add(key);
    const r = hash3(this.seedNumber, cx, 77, cz);
    if (r > 0.14) return;
    const kinds: MobKind[] = ['pig', 'cow', 'sheep', 'chicken'];
    const kind = kinds[Math.floor(hash3(this.seedNumber, cx, 79, cz) * 4)];
    const count = 2 + Math.floor(hash3(this.seedNumber, cx, 81, cz) * 3);
    for (let i = 0; i < count; i++) {
      const x = cx * 16 + Math.floor(hash3(this.seedNumber, cx * 7 + i, 83, cz) * 16);
      const z = cz * 16 + Math.floor(hash3(this.seedNumber, cx, 85, cz * 7 + i) * 16);
      const y = this.world.topSolid(x, z);
      if (this.world.getBlock(x, y, z) !== B.grass) continue;
      if (
        this.world.getBlock(x, y + 1, z) !== B.air &&
        BLOCKS[this.world.getBlock(x, y + 1, z)].solid
      )
        continue;
      this.spawnMob(kind, x + 0.5, y + 1, z + 0.5);
    }
  }

  // -------------------------------------------------------------------------
  // Main loop
  // -------------------------------------------------------------------------
  /** Advance real time; runs fixed 20 Hz ticks. Returns interpolation alpha. */
  update(dt: number, input: Input) {
    this.input = input;
    this.accumulator = Math.min(this.accumulator + dt, 0.25);
    while (this.accumulator >= 1 / TPS) {
      this.accumulator -= 1 / TPS;
      this.tick();
    }
    return this.accumulator * TPS;
  }

  tick() {
    this.ticks++;
    this.time = (this.time + 1) % (DAY * 1000);
    this.world.stepFluids();
    this.world.changed.length = 0;
    for (const w of this.world.washed.splice(0))
      this.dropBlockItems(w.x, w.y, w.z, w.id, 0, undefined);
    this.processChecks();
    this.randomTicks();
    this.tickFurnaces();
    this.tickPlayer();
    this.tickEntities();
    if (this.ticks % 20 === 0) this.spawnHostiles();
  }

  get dayTime() {
    return this.time % DAY;
  }

  /** Effective sky darkening (0 at day, 11 at night) for spawning. */
  skyDarken() {
    return Math.round((1 - (daylight(this.time) - 0.2) / 0.8) * 11);
  }

  // -------------------------------------------------------------------------
  // Sounds and messages
  // -------------------------------------------------------------------------
  sound(key: SoundKey, x: number, y: number, z: number, volume = 1, pitch = 1) {
    this.events.push({ type: 'sound', key, x, y, z, volume, pitch });
  }

  message(text: string) {
    this.events.push({ type: 'message', text });
  }

  private t(en: string, zh: string) {
    return this.locale === 'zh' ? zh : en;
  }

  // -------------------------------------------------------------------------
  // Player
  // -------------------------------------------------------------------------
  get eyeHeight() {
    return this.player.sneaking && !this.player.flying ? 1.27 : 1.62;
  }

  lookVector(): [number, number, number] {
    const { yaw, pitch } = this.player;
    const cp = Math.cos(pitch);
    return [-Math.sin(yaw) * cp, Math.sin(pitch), -Math.cos(yaw) * cp];
  }

  get held(): Stack | null {
    return this.inventory[this.selected];
  }

  reach() {
    return this.mode === 'creative' ? 5 : 4.5;
  }

  /** Update the block and entity under the crosshair. */
  updateTarget() {
    const p = this.player;
    const [dx, dy, dz] = this.lookVector();
    const ex = p.x;
    const ey = p.y + this.eyeHeight;
    const ez = p.z;
    const hit = raycast(this.world, ex, ey, ez, dx, dy, dz, this.reach());
    let best: Entity | null = null;
    let bestD = Math.min(hit ? hit.distance : Infinity, this.mode === 'creative' ? 5 : 3);
    for (const e of this.entities) {
      if (
        e.removed ||
        e.kind === 'item' ||
        e.kind === 'falling' ||
        e.kind === 'arrow' ||
        e.deathTime > 0
      )
        continue;
      const d = rayEntity(ex, ey, ez, dx, dy, dz, e);
      if (d !== null && d < bestD) {
        bestD = d;
        best = e;
      }
    }
    this.targetEntity = best;
    this.target = best ? null : hit;
  }

  private tickPlayer() {
    const p = this.player;
    p.px = p.x;
    p.py = p.y;
    p.pz = p.z;
    if (p.dead) return;
    const input = this.input;
    const creative = this.mode === 'creative';
    if (!creative) p.flying = false;
    // Double-tap jump toggles flight in creative; double-tap forward sprints.
    if (input.jump && !this.lastJump) {
      if (creative && this.ticks - this.jumpTapTick < 7) {
        p.flying = !p.flying;
        p.vy = 0;
      }
      this.jumpTapTick = this.ticks;
    }
    this.lastJump = input.jump;
    if (input.forward && !this.lastForward) {
      if (this.ticks - this.forwardTapTick < 7) this.doubleTapSprint = true;
      this.forwardTapTick = this.ticks;
    }
    if (!input.forward) this.doubleTapSprint = false;
    this.lastForward = input.forward;

    p.sneaking = input.sneak && !p.flying;
    const canSprint = (p.food > 6 || creative) && !p.sneaking && !p.eating;
    if ((input.sprint || this.doubleTapSprint) && input.forward && canSprint) p.sprinting = true;
    if (!input.forward || p.collidedH || !canSprint) p.sprinting = false;

    // Movement intent in local space.
    let mx = input.moveX ?? 0;
    let mz = input.moveZ ?? 0;
    if (!mx && !mz) {
      mx = (input.right ? 1 : 0) - (input.left ? 1 : 0);
      mz = (input.forward ? 1 : 0) - (input.back ? 1 : 0);
    }
    const len = Math.hypot(mx, mz);
    if (len > 1) {
      mx /= len;
      mz /= len;
    }
    let speedScale = 0.98;
    if (p.sneaking) speedScale *= 0.3;
    if (p.eating) speedScale *= 0.2;
    const sin = Math.sin(p.yaw);
    const cos = Math.cos(p.yaw);
    const wx = (mx * cos - mz * sin) * speedScale;
    const wz = (-mx * sin - mz * cos) * speedScale;

    p.inWater =
      liquidAt(this.world, p.x, p.y + 0.4, p.z, B.water) ||
      liquidAt(this.world, p.x, p.y + 0.1, p.z, B.water);
    p.inLava =
      liquidAt(this.world, p.x, p.y + 0.4, p.z, B.lava) ||
      liquidAt(this.world, p.x, p.y + 0.1, p.z, B.lava);
    p.eyesInWater = liquidAt(this.world, p.x, p.y + this.eyeHeight, p.z, B.water);
    const climbing = climbableAt(this.world, p);
    const startY = p.y;

    if (p.flying) {
      const accel = p.sprinting ? 0.1 : 0.05;
      p.vx += wx * accel;
      p.vz += wz * accel;
      if (input.jump) p.vy += 0.15 * 0.75;
      if (input.sneak) p.vy -= 0.15 * 0.75;
      move(this.world, p, p.vx, p.vy, p.vz);
      p.vx *= 0.91;
      p.vz *= 0.91;
      p.vy *= 0.6;
      if (p.onGround && !input.jump) p.flying = false;
      p.fallDistance = 0;
    } else if (p.inWater || p.inLava) {
      const accel = 0.02;
      p.vx += wx * accel;
      p.vz += wz * accel;
      if (input.jump) p.vy += 0.04;
      move(this.world, p, p.vx, p.vy, p.vz);
      const drag = p.inLava ? 0.5 : 0.8;
      p.vx *= drag;
      p.vz *= drag;
      p.vy = p.vy * drag - 0.02;
      if (p.collidedH && input.jump) p.vy = 0.3;
      p.fallDistance = 0;
    } else {
      const below = this.world.getBlock(Math.floor(p.x), Math.floor(p.y - 0.5), Math.floor(p.z));
      const slip = p.onGround ? (below === B.ice ? 0.98 : 0.6) : 1;
      const friction = slip * 0.91;
      const accel = p.onGround ? 0.1 * (0.16277136 / (friction * friction * friction)) : 0.02;
      const sprintMul = p.sprinting ? 1.3 : 1;
      p.vx += wx * accel * sprintMul;
      p.vz += wz * accel * sprintMul;
      if (input.jump && p.onGround) {
        p.vy = 0.42;
        if (p.sprinting) {
          p.vx += -sin * 0.2;
          p.vz += -cos * 0.2;
          this.exhaust(0.2);
        } else this.exhaust(0.05);
      }
      if (climbing) {
        p.vx = Math.max(-0.15, Math.min(0.15, p.vx));
        p.vz = Math.max(-0.15, Math.min(0.15, p.vz));
        p.vy = Math.max(p.vy, p.sneaking ? 0 : -0.15);
        p.fallDistance = 0;
      }
      move(this.world, p, p.vx, p.vy, p.vz, p.sneaking);
      if (climbing && (p.collidedH || input.jump)) p.vy = 0.2;
      p.vy = (p.vy - 0.08) * 0.98;
      p.vx *= friction;
      p.vz *= friction;
    }

    // Fall damage.
    if (!p.onGround && p.y < startY) p.fallDistance += startY - p.y;
    if (p.onGround) {
      if (p.fallDistance > 3 && !creative && !p.inWater) {
        const dmg = Math.ceil(p.fallDistance - 3);
        this.hurtPlayer(dmg, this.t('fell from a high place', '从高处摔了下来'));
        this.sound(dmg > 4 ? 'damage/fallbig' : 'damage/fallsmall', p.x, p.y, p.z);
      }
      p.fallDistance = 0;
    }

    // Steps, bobbing, sprint exhaustion.
    const moved = Math.hypot(p.x - p.px, p.z - p.pz);
    if (p.onGround) {
      p.walkDist += moved;
      if (p.walkDist > 1.7 + p.lastStep) {
        p.lastStep = p.walkDist;
        const id = this.world.getBlock(Math.floor(p.x), Math.floor(p.y - 0.2), Math.floor(p.z));
        if (id !== B.air && !p.sneaking) {
          const g = BLOCKS[id].sound;
          this.sound(STEP_SOUND[g], p.x, p.y, p.z, 0.15, 1);
        }
      }
      if (p.sprinting) this.exhaust(0.1 * moved);
    }
    if (p.inWater && moved > 0.01 && this.ticks % 12 === 0)
      this.sound('liquid/swim1', p.x, p.y, p.z, 0.15);

    // Survival needs.
    if (!creative) this.tickNeeds();
    if (p.invulnerable > 0) p.invulnerable--;
    if (p.hurtTime > 0) p.hurtTime--;
    if (p.swing > 0) p.swing--;
    if (p.y < -64) this.hurtPlayer(4, this.t('fell out of the world', '掉出了这个世界'));

    this.updateTarget();
    this.tickInteraction();
  }

  private exhaust(amount: number) {
    if (this.mode === 'creative' || this.difficulty === 'peaceful') return;
    this.player.exhaustion += amount;
  }

  private tickNeeds() {
    const p = this.player;
    // Hunger.
    if (p.exhaustion >= 4) {
      p.exhaustion -= 4;
      if (p.saturation > 0) p.saturation = Math.max(0, p.saturation - 1);
      else p.food = Math.max(0, p.food - 1);
    }
    p.foodTimer++;
    if (this.difficulty === 'peaceful') {
      if (this.ticks % 20 === 0 && p.health < 20) p.health = Math.min(20, p.health + 1);
      if (this.ticks % 10 === 0 && p.food < 20) p.food++;
    } else if (p.food >= 18 && p.health < 20) {
      if (p.foodTimer >= 80) {
        p.health = Math.min(20, p.health + 1);
        p.exhaustion += 6;
        p.foodTimer = 0;
      }
    } else if (p.food <= 0) {
      if (p.foodTimer >= 80) {
        const floor = this.difficulty === 'hard' ? 0 : this.difficulty === 'normal' ? 1 : 10;
        if (p.health > floor) this.hurtPlayer(1, this.t('starved to death', '饿死了'));
        p.foodTimer = 0;
      }
    } else p.foodTimer = 0;
    // Air.
    if (p.eyesInWater) {
      p.air--;
      if (p.air <= -20) {
        p.air = 0;
        this.hurtPlayer(2, this.t('drowned', '淹死了'));
      }
    } else p.air = Math.min(300, p.air + 5);
    // Lava and fire.
    if (p.inLava) {
      p.fire = 300;
      if (this.ticks % 10 === 0)
        this.hurtPlayer(4, this.t('tried to swim in lava', '试图在熔岩里游泳'));
    }
    if (p.fire > 0) {
      if (p.inWater) p.fire = 0;
      else {
        p.fire--;
        if (p.fire % 20 === 0) this.hurtPlayer(1, this.t('burned to death', '被烧死了'));
      }
    }
    // Cactus.
    const box = bodyBox(p);
    for (let x = Math.floor(box.x0 - 0.05); x <= Math.floor(box.x1 + 0.05); x++)
      for (let z = Math.floor(box.z0 - 0.05); z <= Math.floor(box.z1 + 0.05); z++)
        for (let y = Math.floor(box.y0); y <= Math.floor(box.y1); y++)
          if (this.world.getBlock(x, y, z) === B.cactus) {
            this.hurtPlayer(1, this.t('was pricked to death', '被戳死了'));
            return;
          }
  }

  hurtPlayer(amount: number, cause: string, kx = 0, kz = 0) {
    const p = this.player;
    if (this.mode === 'creative' || p.dead) return;
    if (p.invulnerable > 0) return;
    const scale = this.difficulty === 'easy' ? 0.5 : this.difficulty === 'hard' ? 1.5 : 1;
    const dmg = cause.includes('mob') ? amount * scale : amount;
    p.health = Math.max(0, p.health - dmg);
    p.invulnerable = 10;
    p.hurtTime = 10;
    this.exhaust(0.1);
    if (kx || kz) {
      p.vx += kx * 0.4;
      p.vz += kz * 0.4;
      p.vy = Math.max(p.vy, 0.36);
    }
    this.sound('damage/hit', p.x, p.y, p.z);
    this.events.push({ type: 'hurt' });
    if (p.health <= 0) this.killPlayer(cause);
  }

  private killPlayer(cause: string) {
    const p = this.player;
    p.dead = true;
    p.deathMessage = cause.replace(' by mob', '');
    // Return the crafting grid and cursor first so they are scattered too.
    this.closeScreen();
    // Scatter the inventory like the original.
    for (let i = 0; i < this.inventory.length; i++) {
      const s = this.inventory[i];
      if (!s) continue;
      this.spawnItem(
        s,
        p.x,
        p.y + 1,
        p.z,
        (this.random() - 0.5) * 0.5,
        0.2,
        (this.random() - 0.5) * 0.5,
      );
      this.inventory[i] = null;
    }
    this.events.push({ type: 'death' });
  }

  respawn() {
    const p = this.player;
    Object.assign(p, {
      x: p.spawnX,
      y: p.spawnY,
      z: p.spawnZ,
      px: p.spawnX,
      py: p.spawnY,
      pz: p.spawnZ,
      vx: 0,
      vy: 0,
      vz: 0,
      health: 20,
      food: 20,
      saturation: 5,
      exhaustion: 0,
      air: 300,
      fire: 0,
      dead: false,
      fallDistance: 0,
      xp: 0,
      level: 0,
    });
  }

  addXp(amount: number) {
    const p = this.player;
    p.xp += amount;
    while (p.xp >= xpForLevel(p.level)) {
      p.xp -= xpForLevel(p.level);
      p.level++;
    }
    this.sound('random/orb', p.x, p.y, p.z, 0.3, 0.6 + this.random() * 0.8);
  }

  // -------------------------------------------------------------------------
  // Mining, attacking and using
  // -------------------------------------------------------------------------
  private tickInteraction() {
    const p = this.player;
    const input = this.input;
    if (this.screen) {
      this.breakProgress = 0;
      return;
    }
    if (this.breakCooldown > 0) this.breakCooldown--;
    if (this.useCooldown > 0) this.useCooldown--;

    // Eating.
    const held = this.held;
    const food = held ? ITEMS[held.id]?.food : undefined;
    const interactive = this.target !== null && INTERACTIVE.has(this.target.id) && !p.sneaking;
    if (
      input.use &&
      food &&
      !interactive &&
      (p.food < 20 || held!.id === 'golden_apple' || this.mode === 'creative')
    ) {
      p.eating++;
      if (p.eating % 4 === 0)
        this.sound('random/eat', p.x, p.y + 1.5, p.z, 0.5, 0.8 + this.random() * 0.4);
      if (p.eating >= 32) {
        p.food = Math.min(20, p.food + food.hunger);
        p.saturation = Math.min(p.food, p.saturation + food.saturation);
        if (held!.id === 'golden_apple') p.health = Math.min(20, p.health + 4);
        if (held!.id === 'mushroom_stew') this.inventory[this.selected] = { id: 'bowl', count: 1 };
        else this.consumeHeld();
        this.sound('random/burp', p.x, p.y, p.z, 0.5);
        p.eating = 0;
      }
      return;
    }
    p.eating = 0;

    if (input.attack) {
      if (this.targetEntity && this.breakCooldown === 0) {
        this.attack(this.targetEntity);
        this.breakCooldown = 10;
      } else if (this.target) this.mine(this.target);
      else if (p.swing === 0) p.swing = 6;
    } else {
      this.breakProgress = 0;
      this.breakKey = '';
    }
    if (input.use && this.useCooldown === 0) {
      this.use();
      this.useCooldown = 4;
    }
    if (!input.use) this.useCooldown = 0;
  }

  private mine(hit: RayHit) {
    const key = `${hit.x},${hit.y},${hit.z}`;
    if (key !== this.breakKey) {
      this.breakKey = key;
      this.breakProgress = 0;
    }
    if (this.breakCooldown > 0) return;
    const p = this.player;
    if (p.swing <= 2) p.swing = 6;
    if (this.mode === 'creative') {
      const held = this.held?.id;
      if (held && ITEMS[held]?.tool?.kind === 'sword') return;
      this.breakBlock(hit.x, hit.y, hit.z, false);
      this.breakCooldown = 5;
      return;
    }
    const time = breakTime(hit.id, this.held?.id, p.onGround || p.flying, p.eyesInWater);
    if (!Number.isFinite(time)) return;
    if (this.ticks % 4 === 0) {
      const g = BLOCKS[hit.id].sound;
      this.sound(STEP_SOUND[g], hit.x + 0.5, hit.y + 0.5, hit.z + 0.5, 0.25, 0.5);
    }
    this.breakProgress += time === 0 ? 1 : 1 / (time * TPS);
    if (this.breakProgress >= 1) {
      this.breakBlock(hit.x, hit.y, hit.z, true);
      this.breakProgress = 0;
      this.breakKey = '';
      this.breakCooldown = 5;
    }
  }

  /** Break a block, dropping its items in survival. */
  breakBlock(x: number, y: number, z: number, drops: boolean) {
    const w = this.world;
    const id = w.getBlock(x, y, z);
    const meta = w.getMeta(x, y, z);
    if (id === B.air || (id === B.bedrock && this.mode !== 'creative')) return;
    const def = BLOCKS[id];
    this.events.push({ type: 'break', x, y, z, id });
    this.sound(DIG_SOUND[def.sound], x + 0.5, y + 0.5, z + 0.5, 1, 0.8 + this.random() * 0.2);
    const held = this.held?.id;
    // Remove block (doors are two cells).
    if (id === B.door) {
      const other = meta & 8 ? y - 1 : y + 1;
      if (w.getBlock(x, other, z) === B.door) w.setBlock(x, other, z, B.air);
    }
    const replaced = id === B.ice && drops && w.getBlock(x, y - 1, z) !== B.air ? B.water : B.air;
    w.setBlock(x, y, z, replaced);
    if (drops) {
      this.dropBlockItems(x, y, z, id, meta, held);
      this.exhaust(0.005);
      this.wearHeld();
    }
    this.dropContainer(x, y, z);
  }

  private dropContainer(x: number, y: number, z: number) {
    const key = `${x},${y},${z}`;
    const chest = this.chests.get(key);
    if (chest) {
      for (const s of chest) if (s) this.spawnItem(s, x + 0.5, y + 0.5, z + 0.5);
      this.chests.delete(key);
    }
    const furnace = this.furnaces.get(key);
    if (furnace) {
      for (const s of [furnace.input, furnace.fuel, furnace.output])
        if (s) this.spawnItem(s, x + 0.5, y + 0.5, z + 0.5);
      this.furnaces.delete(key);
    }
  }

  dropBlockItems(
    x: number,
    y: number,
    z: number,
    id: number,
    meta: number,
    held: string | undefined,
  ) {
    if (this.mode === 'creative') return;
    const def = BLOCKS[id];
    const r = this.random;
    const out: Stack[] = [];
    const harvest = canHarvest(id, held);
    const shears = held === 'shears';
    if (!harvest) return;
    switch (id) {
      case B.oakLeaves:
      case B.birchLeaves:
      case B.spruceLeaves: {
        if (shears) out.push({ id: def.key, count: 1 });
        else {
          if (r() < 0.05)
            out.push({
              id:
                id === B.oakLeaves
                  ? 'oak_sapling'
                  : id === B.birchLeaves
                    ? 'birch_sapling'
                    : 'spruce_sapling',
              count: 1,
            });
          if (id === B.oakLeaves && r() < 0.005) out.push({ id: 'apple', count: 1 });
          if (r() < 0.02) out.push({ id: 'stick', count: 1 + Math.floor(r() * 2) });
        }
        break;
      }
      case B.shortGrass:
      case B.fern: {
        if (shears) out.push({ id: def.key, count: 1 });
        else if (r() < 0.125) out.push({ id: 'wheat_seeds', count: 1 });
        break;
      }
      case B.gravel: {
        out.push({ id: r() < 0.1 ? 'flint' : 'gravel', count: 1 });
        break;
      }
      case B.wheat: {
        if (meta >= 7) {
          out.push(
            { id: 'wheat', count: 1 },
            { id: 'wheat_seeds', count: 1 + Math.floor(r() * 3) },
          );
        } else out.push({ id: 'wheat_seeds', count: 1 });
        break;
      }
      case B.redstoneOre:
      case B.deepslateRedstone: {
        out.push({ id: 'redstone', count: 4 + Math.floor(r() * 2) });
        this.addXp(1 + Math.floor(r() * 5));
        break;
      }
      case B.lapisOre:
      case B.deepslateLapis: {
        out.push({ id: 'lapis_lazuli', count: 4 + Math.floor(r() * 5) });
        this.addXp(2 + Math.floor(r() * 4));
        break;
      }
      case B.door: {
        out.push({ id: 'oak_door', count: 1 });
        break;
      }
      case B.melon: {
        out.push({ id: 'melon_slice', count: 3 + Math.floor(r() * 5) });
        break;
      }
      case B.clay: {
        out.push({ id: 'clay_ball', count: 4 });
        break;
      }
      case 49: {
        // bookshelf
        out.push({ id: 'book', count: 3 });
        break;
      }
      default: {
        const drop = def.drop === undefined ? def.key : def.drop;
        if (!drop) break;
        out.push({ id: drop, count: 1 });
        if (id === B.coalOre || id === B.deepslateCoal) this.addXp(Math.floor(r() * 3));
        if (id === B.diamondOre || id === B.deepslateDiamond || id === B.emeraldOre)
          this.addXp(3 + Math.floor(r() * 5));
      }
    }
    for (const s of out) if (ITEMS[s.id]) this.spawnItem(s, x + 0.5, y + 0.5, z + 0.5);
  }

  private wearHeld() {
    const held = this.held;
    if (!held || this.mode === 'creative') return;
    const tool = ITEMS[held.id]?.tool;
    if (!tool) return;
    held.wear = (held.wear ?? 0) + 1;
    if (held.wear >= tool.durability) {
      this.inventory[this.selected] = null;
      this.sound('random/break', this.player.x, this.player.y, this.player.z);
    }
  }

  private consumeHeld(n = 1) {
    if (this.mode === 'creative') return;
    const held = this.held;
    if (!held) return;
    held.count -= n;
    if (held.count <= 0) this.inventory[this.selected] = null;
  }

  attack(e: Entity) {
    const p = this.player;
    p.swing = 6;
    const held = this.held?.id;
    let damage = held ? (ITEMS[held]?.damage ?? 1) : 1;
    const critical = p.vy < 0 && !p.onGround && !p.inWater;
    if (critical) damage *= 1.5;
    const [lx, , lz] = this.lookVector();
    const kb = p.sprinting ? 0.6 : 0.4;
    this.hurtEntity(e, damage, lx * kb, lz * kb, 'player');
    if (ITEMS[held ?? '']?.tool) this.wearHeld();
    this.exhaust(0.1);
    p.sprinting = false;
  }

  hurtEntity(
    e: Entity,
    amount: number,
    kx: number,
    kz: number,
    source: 'player' | 'mob' | 'explosion' | 'fire' | 'fall',
  ) {
    if (e.kind === 'item' || e.kind === 'falling' || e.kind === 'tnt' || e.kind === 'arrow') {
      if (source === 'explosion' && e.kind === 'item') e.removed = true;
      return;
    }
    if (e.invulnerable > 0 || e.deathTime > 0) return;
    e.health -= amount;
    e.hurtTime = 10;
    e.invulnerable = 10;
    e.vx += kx;
    e.vz += kz;
    if (kx || kz) e.vy = Math.max(e.vy, 0.36);
    if (!HOSTILE.has(e.kind)) e.panic = 100;
    this.sound(HURT[e.kind as MobKind], e.x, e.y + e.h / 2, e.z, 0.8, 0.9 + this.random() * 0.3);
    if (e.health <= 0) {
      e.deathTime = 1;
      const death = DEATH[e.kind as MobKind];
      if (death) this.sound(death, e.x, e.y, e.z);
      if (source === 'player') {
        this.dropLoot(e);
        this.addXp(HOSTILE.has(e.kind) ? 5 : 1 + Math.floor(this.random() * 3));
      }
    }
  }

  private dropLoot(e: Entity) {
    const r = this.random;
    const drops: Stack[] = [];
    const n = (min: number, max: number) => min + Math.floor(r() * (max - min + 1));
    const cooked = e.fire > 0;
    switch (e.kind) {
      case 'zombie': {
        drops.push({ id: 'rotten_flesh', count: n(0, 2) });
        if (r() < 0.025) drops.push({ id: 'iron_ingot', count: 1 });
        break;
      }
      case 'creeper': {
        drops.push({ id: 'gunpowder', count: n(0, 2) });
        break;
      }
      case 'skeleton': {
        drops.push({ id: 'bone', count: n(0, 2) });
        break;
      }
      case 'pig': {
        drops.push({ id: cooked ? 'cooked_porkchop' : 'porkchop', count: n(1, 3) });
        break;
      }
      case 'cow': {
        drops.push(
          { id: cooked ? 'cooked_beef' : 'beef', count: n(1, 3) },
          { id: 'leather', count: n(0, 2) },
        );
        break;
      }
      case 'sheep': {
        drops.push({ id: cooked ? 'cooked_mutton' : 'mutton', count: n(1, 2) });
        if (!e.sheared) drops.push({ id: 'white_wool', count: 1 });
        break;
      }
      case 'chicken': {
        drops.push(
          { id: cooked ? 'cooked_chicken' : 'chicken', count: 1 },
          { id: 'feather', count: n(0, 2) },
        );
        break;
      }
      default: {
        break;
      }
    }
    for (const d of drops) if (d.count > 0) this.spawnItem(d, e.x, e.y + 0.5, e.z);
  }

  private use() {
    const p = this.player;
    const w = this.world;
    const held = this.held;
    const heldId = held?.id;
    // Entities.
    const te = this.targetEntity;
    if (te) {
      if (te.kind === 'sheep' && heldId === 'shears' && !te.sheared) {
        te.sheared = true;
        const count = 1 + Math.floor(this.random() * 3);
        this.spawnItem({ id: 'white_wool', count }, te.x, te.y + 1, te.z);
        this.sound('mob/sheep/say', te.x, te.y, te.z);
        this.wearHeld();
        p.swing = 6;
      }
      return;
    }
    // Buckets work on liquids.
    if (heldId === 'bucket') {
      const [dx, dy, dz] = this.lookVector();
      const hit = raycast(w, p.x, p.y + this.eyeHeight, p.z, dx, dy, dz, this.reach(), true);
      if (hit && isLiquid(hit.id) && w.getMeta(hit.x, hit.y, hit.z) === 0) {
        w.setBlock(hit.x, hit.y, hit.z, B.air);
        const filled = hit.id === B.water ? 'water_bucket' : 'lava_bucket';
        if (this.mode !== 'creative') {
          if (held!.count === 1) this.inventory[this.selected] = { id: filled, count: 1 };
          else {
            held!.count--;
            this.giveItem({ id: filled, count: 1 });
          }
        }
        this.sound('liquid/splash', hit.x, hit.y, hit.z, 0.4);
        p.swing = 6;
      }
      return;
    }
    const hit = this.target;
    if (!hit) return;
    const id = hit.id;
    const [nx, ny, nz] = DIRS[hit.face];
    // Block interactions.
    if (!p.sneaking || !held) {
      const key = `${hit.x},${hit.y},${hit.z}`;
      if (id === B.craftingTable) {
        this.openScreen({ kind: 'crafting', x: hit.x, y: hit.y, z: hit.z });
        return;
      }
      if (id === B.furnace) {
        if (!this.furnaces.has(key)) this.furnaces.set(key, emptyFurnace());
        this.openScreen({ kind: 'furnace', x: hit.x, y: hit.y, z: hit.z });
        return;
      }
      if (id === B.chest) {
        if (!this.chests.has(key)) this.chests.set(key, emptySlots(27));
        this.sound('random/chestopen', hit.x + 0.5, hit.y + 0.5, hit.z + 0.5, 0.5);
        this.openScreen({ kind: 'chest', x: hit.x, y: hit.y, z: hit.z });
        return;
      }
      if (id === B.door) {
        const meta = w.getMeta(hit.x, hit.y, hit.z);
        const lowerY = meta & 8 ? hit.y - 1 : hit.y;
        const lower = w.getMeta(hit.x, lowerY, hit.z);
        const open = !(lower & 4);
        const next = (lower & ~4) | (open ? 4 : 0);
        w.setBlock(hit.x, lowerY, hit.z, B.door, next, false);
        w.setBlock(hit.x, lowerY + 1, hit.z, B.door, next | 8, false);
        this.sound(open ? 'random/door_open' : 'random/door_close', hit.x, hit.y, hit.z, 0.6);
        p.swing = 6;
        return;
      }
      if (id === B.tnt && heldId === 'flint_and_steel') {
        w.setBlock(hit.x, hit.y, hit.z, B.air);
        this.primeTnt(hit.x, hit.y, hit.z, 80);
        this.sound('fire/ignite', hit.x, hit.y, hit.z);
        this.wearHeld();
        p.swing = 6;
        return;
      }
    }
    if (!held) return;
    // Hoes till dirt.
    if (ITEMS[held.id]?.tool?.kind === 'hoe') {
      if (
        (id === B.grass || id === B.dirt) &&
        hit.face !== 3 &&
        w.getBlock(hit.x, hit.y + 1, hit.z) === B.air
      ) {
        w.setBlock(hit.x, hit.y, hit.z, B.farmland, 0);
        this.sound('step/gravel', hit.x, hit.y, hit.z);
        this.wearHeld();
        p.swing = 6;
      }
      return;
    }
    if (held.id === 'wheat_seeds') {
      if (id === B.farmland && hit.face === 2 && w.getBlock(hit.x, hit.y + 1, hit.z) === B.air) {
        w.setBlock(hit.x, hit.y + 1, hit.z, B.wheat, 0);
        this.consumeHeld();
        this.sound('step/grass', hit.x, hit.y, hit.z);
        p.swing = 6;
      }
      return;
    }
    // Buckets of liquid and blocks.
    let tx = hit.x + nx;
    let ty = hit.y + ny;
    let tz = hit.z + nz;
    let face = hit.face;
    if (BLOCKS[id].replaceable && !isLiquid(id)) {
      tx = hit.x;
      ty = hit.y;
      tz = hit.z;
      face = 2;
    }
    if (ty < 0 || ty >= HEIGHT) return;
    const existing = w.getBlock(tx, ty, tz);
    if (existing !== B.air && !BLOCKS[existing].replaceable) return;
    if (held.id === 'water_bucket' || held.id === 'lava_bucket') {
      w.setBlock(tx, ty, tz, held.id === 'water_bucket' ? B.water : B.lava, 0);
      if (this.mode !== 'creative') this.inventory[this.selected] = { id: 'bucket', count: 1 };
      this.sound('liquid/splash', tx, ty, tz, 0.4);
      p.swing = 6;
      return;
    }
    const blockIdToPlace = ITEMS[held.id]?.block;
    if (blockIdToPlace === undefined) return;
    if (this.place(blockIdToPlace, tx, ty, tz, face)) {
      this.consumeHeld();
      const def = BLOCKS[blockIdToPlace];
      this.sound(DIG_SOUND[def.sound], tx + 0.5, ty + 0.5, tz + 0.5, 1, 0.8);
      p.swing = 6;
    }
  }

  /** Validate and place a block from the player; returns true on success. */
  place(id: number, x: number, y: number, z: number, face: number) {
    const w = this.world;
    const def = BLOCKS[id];
    const below = w.getBlock(x, y - 1, z);
    const yawFacing = this.facingFromYaw();
    let meta = 0;
    const solidBelow = BLOCKS[below].solid && BLOCKS[below].render === 'cube';
    switch (def.key) {
      case 'torch': {
        if (face === 2 || face === 3) {
          if (!solidBelow) return false;
        } else {
          // Attached to the clicked block; facing is the wall direction (0 +Z, 1 -X, 2 -Z, 3 +X).
          const wall = face === 0 ? 1 : face === 1 ? 3 : face === 4 ? 2 : 0;
          const ring = WALL_RING[wall];
          if (!BLOCKS[w.getBlock(x + ring[0], y, z + ring[2])].opaque) return false;
          meta = wall + 1;
        }
        break;
      }
      case 'ladder': {
        if (face === 2 || face === 3) return false;
        // facing: wall the ladder is attached to (0 +Z, 1 -X, 2 -Z, 3 +X).
        meta = face === 0 ? 1 : face === 1 ? 3 : face === 4 ? 2 : 0;
        const ring = WALL_RING[meta];
        if (!BLOCKS[w.getBlock(x + ring[0], y, z + ring[2])].opaque) return false;
        break;
      }
      case 'oak_door': {
        if (!solidBelow) return false;
        const above = w.getBlock(x, y + 1, z);
        if (above !== B.air && !BLOCKS[above].replaceable) return false;
        meta = (yawFacing + 2) % 4;
        if (this.blocked(x, y, z, id, meta) || this.blocked(x, y + 1, z, id, meta)) return false;
        w.setBlock(x, y, z, id, meta);
        w.setBlock(x, y + 1, z, id, meta | 8);
        return true;
      }
      case 'cactus': {
        if (below !== B.sand && below !== B.cactus) return false;
        for (const [dx, , dz] of [
          [1, 0, 0],
          [-1, 0, 0],
          [0, 0, 1],
          [0, 0, -1],
        ])
          if (BLOCKS[w.getBlock(x + dx, y, z + dz)].solid) return false;
        break;
      }
      case 'sugar_cane': {
        if (below !== B.sugarCane) {
          if (below !== B.sand && below !== B.grass && below !== B.dirt) return false;
          const water = [
            [1, 0],
            [-1, 0],
            [0, 1],
            [0, -1],
          ].some(([dx, dz]) => w.getBlock(x + dx, y - 1, z + dz) === B.water);
          if (!water) return false;
        }
        break;
      }
      default: {
        if (
          def.render === 'cross' &&
          def.needsSupport &&
          below !== B.grass &&
          below !== B.dirt &&
          below !== B.farmland &&
          below !== B.snowyGrass
        )
          return false;
        if (def.facing) meta = yawFacing;
        if (def.key.includes('leaves')) meta = 1;
      }
    }
    if (this.blocked(x, y, z, id, meta)) return false;
    w.setBlock(x, y, z, id, meta);
    if (id === B.furnace) this.furnaces.set(`${x},${y},${z}`, emptyFurnace());
    if (id === B.chest) this.chests.set(`${x},${y},${z}`, emptySlots(27));
    if (def.gravity) this.pendingChecks.add(`${x},${y},${z}`);
    return true;
  }

  /** Facing that points the block's front toward the player. */
  private facingFromYaw() {
    const yaw = ((this.player.yaw % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
    // Looking toward -Z (yaw 0) sees the +Z face: facing 0.
    const q = Math.round(yaw / (Math.PI / 2)) % 4;
    return [0, 3, 2, 1][q];
  }

  private blocked(x: number, y: number, z: number, id: number, meta: number) {
    const boxes = collisionBoxes(id, meta);
    if (!boxes) return false;
    const bodies: { x: number; y: number; z: number; w: number; h: number }[] = [this.player];
    for (const e of this.entities)
      if (!e.removed && e.kind !== 'item' && e.kind !== 'arrow') bodies.push(e);
    return bodies.some((b) => boxes.some((box) => intersectsBlock(b, x, y, z, box)));
  }

  /** Middle click: select or (creative) create the targeted block in the hotbar. */
  pickBlock() {
    const hit = this.target;
    if (!hit) return;
    const def = BLOCKS[hit.id];
    const key =
      def.id === B.door
        ? 'oak_door'
        : def.id === B.wheat
          ? 'wheat_seeds'
          : def.id === B.snowyGrass
            ? 'grass_block'
            : def.id === B.farmland
              ? 'dirt'
              : def.key;
    if (!ITEMS[key]) return;
    const slot = this.inventory.findIndex((s, i) => i < 9 && s?.id === key);
    if (slot !== -1) {
      this.selected = slot;
      return;
    }
    if (this.mode !== 'creative') {
      const inv = this.inventory.findIndex((s) => s?.id === key);
      if (inv === -1) return;
      const tmp = this.inventory[this.selected];
      this.inventory[this.selected] = this.inventory[inv];
      this.inventory[inv] = tmp;
      return;
    }
    const empty = this.inventory.findIndex((s, i) => i < 9 && !s);
    if (empty !== -1) this.selected = empty;
    this.inventory[this.selected] = { id: key, count: 1 };
  }

  dropHeld(all: boolean) {
    const held = this.held;
    if (!held) return;
    const count = all ? held.count : 1;
    const p = this.player;
    const [dx, dy, dz] = this.lookVector();
    this.spawnItem(
      { id: held.id, count, wear: held.wear },
      p.x,
      p.y + this.eyeHeight - 0.3,
      p.z,
      dx * 0.3,
      dy * 0.3 + 0.1,
      dz * 0.3,
      40,
    );
    held.count -= count;
    if (held.count <= 0) this.inventory[this.selected] = null;
    p.swing = 6;
  }

  // -------------------------------------------------------------------------
  // Inventory
  // -------------------------------------------------------------------------
  /** Add a stack to the inventory; returns the remainder count. */
  /** Whether `giveItem(stack)` would place the whole stack. */
  canFit(stack: Stack): boolean {
    let room = 0;
    const limit = maxStack(stack.id);
    for (let i = 0; i < 36; i++) {
      const s = this.inventory[i];
      if (!s) room += limit;
      else if (s.id === stack.id && !s.wear && !stack.wear) room += Math.max(0, limit - s.count);
      if (room >= stack.count) return true;
    }
    return false;
  }

  giveItem(stack: Stack): number {
    let left = stack.count;
    const limit = maxStack(stack.id);
    const order = slotRange(0, 36);
    for (const i of order) {
      const s = this.inventory[i];
      if (s && s.id === stack.id && !s.wear && !stack.wear && s.count < limit) {
        const n = Math.min(limit - s.count, left);
        s.count += n;
        left -= n;
        if (!left) return 0;
      }
    }
    for (const i of order) {
      if (!this.inventory[i]) {
        const n = Math.min(limit, left);
        this.inventory[i] = { id: stack.id, count: n, wear: stack.wear };
        left -= n;
        if (!left) return 0;
      }
    }
    return left;
  }

  openScreen(screen: Screen) {
    this.screen = screen;
    this.craftSize = screen.kind === 'crafting' ? 3 : 2;
    this.events.push({ type: 'open', screen });
  }

  closeScreen() {
    if (!this.screen) return;
    if (this.screen.kind === 'chest') {
      const s = this.screen;
      this.sound('random/chestclosed', s.x + 0.5, s.y + 0.5, s.z + 0.5, 0.5);
    }
    // Return crafting grid and cursor contents.
    for (let i = 0; i < 9; i++) {
      const s = this.craftGrid[i];
      if (s) {
        const left = this.giveItem(s);
        if (left)
          this.spawnItem({ ...s, count: left }, this.player.x, this.player.y + 1, this.player.z);
      }
      this.craftGrid[i] = null;
    }
    if (this.cursor) {
      const left = this.giveItem(this.cursor);
      if (left)
        this.spawnItem(
          { ...this.cursor, count: left },
          this.player.x,
          this.player.y + 1,
          this.player.z,
        );
      this.cursor = null;
    }
    this.screen = null;
  }

  craftResult(): Stack | null {
    const size = this.craftSize;
    const grid =
      size === 3
        ? this.craftGrid
        : [this.craftGrid[0], this.craftGrid[1], this.craftGrid[3], this.craftGrid[4]];
    return craft(grid, size);
  }

  furnaceAt(): Furnace | null {
    const s = this.screen;
    if (!s || s.kind !== 'furnace') return null;
    return this.furnaces.get(`${s.x},${s.y},${s.z}`) ?? null;
  }

  chestAt(): (Stack | null)[] | null {
    const s = this.screen;
    if (!s || s.kind !== 'chest') return null;
    return this.chests.get(`${s.x},${s.y},${s.z}`) ?? null;
  }

  private getSlot(ref: SlotRef): Stack | null {
    switch (ref.kind) {
      case 'inv': {
        return this.inventory[ref.index];
      }
      case 'craft': {
        return this.craftGrid[ref.index];
      }
      case 'chest': {
        return this.chestAt()?.[ref.index] ?? null;
      }
      case 'furnace': {
        return this.furnaceAt()?.[ref.slot] ?? null;
      }
      default: {
        return this.craftResult();
      }
    }
  }

  private setSlot(ref: SlotRef, s: Stack | null) {
    const v = s && s.count > 0 ? s : null;
    switch (ref.kind) {
      case 'inv': {
        this.inventory[ref.index] = v;
        break;
      }
      case 'craft': {
        this.craftGrid[ref.index] = v;
        break;
      }
      case 'chest': {
        const c = this.chestAt();
        if (c) c[ref.index] = v;
        break;
      }
      case 'furnace': {
        const f = this.furnaceAt();
        if (f) f[ref.slot] = v;
        break;
      }
      default: {
        break;
      }
    }
  }

  /** Mouse click on a slot with original semantics (left, right, shift-click). */
  clickSlot(ref: SlotRef, button: 'left' | 'right', shift: boolean) {
    if (ref.kind === 'result') {
      this.takeCraft(shift);
      return;
    }
    if (ref.kind === 'furnace' && ref.slot === 'output') {
      const out = this.getSlot(ref);
      if (!out) return;
      if (shift) {
        const left = this.giveItem(out);
        this.setSlot(ref, left ? { ...out, count: left } : null);
      } else if (!this.cursor) {
        this.cursor = { ...out };
        this.setSlot(ref, null);
      } else if (this.cursor.id === out.id && this.cursor.count + out.count <= maxStack(out.id)) {
        this.cursor.count += out.count;
        this.setSlot(ref, null);
      }
      return;
    }
    const slot = this.getSlot(ref);
    if (shift && slot) {
      this.quickMove(ref, slot);
      return;
    }
    const cursor = this.cursor;
    if (button === 'left') {
      if (cursor && slot && cursor.id === slot.id && !cursor.wear && !slot.wear) {
        const limit = maxStack(slot.id);
        const n = Math.min(limit - slot.count, cursor.count);
        slot.count += n;
        cursor.count -= n;
        if (cursor.count <= 0) this.cursor = null;
      } else {
        this.setSlot(ref, cursor);
        this.cursor = slot;
      }
    } else if (!cursor && slot) {
      const half = Math.ceil(slot.count / 2);
      this.cursor = { ...slot, count: half };
      slot.count -= half;
      if (slot.count <= 0) this.setSlot(ref, null);
    } else if (cursor) {
      if (!slot) {
        this.setSlot(ref, { ...cursor, count: 1 });
        cursor.count--;
      } else if (slot.id === cursor.id && slot.count < maxStack(slot.id) && !slot.wear) {
        slot.count++;
        cursor.count--;
      } else {
        this.setSlot(ref, cursor);
        this.cursor = slot;
        return;
      }
      if (cursor.count <= 0) this.cursor = null;
    }
  }

  private quickMove(ref: SlotRef, slot: Stack) {
    if (ref.kind === 'inv') {
      const screen = this.screen;
      if (screen?.kind === 'chest') {
        const chest = this.chestAt()!;
        const left = mergeInto(chest, slot, slotRange(0, 27));
        this.setSlot(ref, left ? { ...slot, count: left } : null);
        return;
      }
      if (screen?.kind === 'furnace') {
        const f = this.furnaceAt()!;
        const target = SMELTING[slot.id] ? 'input' : ITEMS[slot.id]?.fuel ? 'fuel' : null;
        if (target) {
          const cur = f[target];
          if (!cur) {
            f[target] = { ...slot };
            this.setSlot(ref, null);
          } else if (cur.id === slot.id) {
            const n = Math.min(maxStack(slot.id) - cur.count, slot.count);
            cur.count += n;
            slot.count -= n;
            if (!slot.count) this.setSlot(ref, null);
          }
          return;
        }
      }
      // Hotbar <-> main inventory.
      const range = ref.index < 9 ? slotRange(9, 36) : slotRange(0, 9);
      const left = mergeInto(this.inventory, slot, range);
      this.setSlot(ref, left ? { ...slot, count: left } : null);
      return;
    }
    const left = this.giveItem(slot);
    this.setSlot(ref, left ? { ...slot, count: left } : null);
  }

  private takeCraft(shift: boolean) {
    let result = this.craftResult();
    for (let guard = 0; result && guard < 64; guard++) {
      if (shift) {
        // Like vanilla, shift-crafting stops once a whole result no longer fits.
        if (!this.canFit(result)) return;
        this.giveItem(result);
      } else {
        if (
          this.cursor &&
          (this.cursor.id !== result.id || this.cursor.count + result.count > maxStack(result.id))
        )
          return;
        if (this.cursor) this.cursor.count += result.count;
        else this.cursor = { ...result };
      }
      this.consumeGrid();
      this.sound('random/click', this.player.x, this.player.y, this.player.z, 0.2);
      if (!shift) return;
      result = this.craftResult();
    }
  }

  private consumeGrid() {
    const indices = this.craftSize === 3 ? [0, 1, 2, 3, 4, 5, 6, 7, 8] : [0, 1, 3, 4];
    for (const i of indices) {
      const s = this.craftGrid[i];
      if (!s) continue;
      if (s.id === 'water_bucket' || s.id === 'lava_bucket') {
        this.craftGrid[i] = { id: 'bucket', count: 1 };
        continue;
      }
      s.count--;
      if (s.count <= 0) this.craftGrid[i] = null;
    }
  }

  /** Read-only view of a slot for the UI. */
  slot(ref: SlotRef): Stack | null {
    return this.getSlot(ref);
  }

  /** Whether the cursor stack may be dropped into a slot (output slots refuse). */
  accepts(ref: SlotRef) {
    return ref.kind !== 'result' && !(ref.kind === 'furnace' && ref.slot === 'output');
  }

  /**
   * Drag painting: spread the cursor stack evenly (left) or one each (right)
   * over the slots the mouse was dragged across.
   */
  distribute(refs: SlotRef[], button: 'left' | 'right') {
    const cursor = this.cursor;
    if (!cursor || refs.length === 0) return;
    const limit = maxStack(cursor.id);
    const targets = refs.filter((r) => {
      if (!this.accepts(r)) return false;
      const s = this.getSlot(r);
      return !s || (s.id === cursor.id && !s.wear && !cursor.wear && s.count < limit);
    });
    if (targets.length === 0) return;
    const each = button === 'right' ? 1 : Math.max(1, Math.floor(cursor.count / targets.length));
    for (const r of targets) {
      if (cursor.count <= 0) break;
      const s = this.getSlot(r);
      const room = limit - (s?.count ?? 0);
      const n = Math.min(each, room, cursor.count);
      if (n <= 0) continue;
      if (s) s.count += n;
      else this.setSlot(r, { ...cursor, count: n });
      cursor.count -= n;
    }
    if (cursor.count <= 0) this.cursor = null;
  }

  /** Number keys over a slot swap it with that hotbar slot. */
  swapWithHotbar(ref: SlotRef, hotbar: number) {
    if (!this.accepts(ref) || this.cursor) return;
    if (ref.kind === 'inv' && ref.index === hotbar) return;
    const a = this.getSlot(ref);
    const b = this.inventory[hotbar];
    this.setSlot(ref, b);
    this.inventory[hotbar] = a;
  }

  /** Double click: gather matching items from the open screen onto the cursor. */
  collectToCursor() {
    const cursor = this.cursor;
    if (!cursor || cursor.wear) return;
    const limit = maxStack(cursor.id);
    const pools: (Stack | null)[][] = [this.craftGrid, this.inventory];
    const chest = this.chestAt();
    if (chest) pools.unshift(chest);
    for (const pool of pools) {
      for (let i = 0; i < pool.length && cursor.count < limit; i++) {
        const s = pool[i];
        if (!s || s.id !== cursor.id || s.wear) continue;
        const n = Math.min(limit - cursor.count, s.count);
        cursor.count += n;
        s.count -= n;
        if (s.count <= 0) pool[i] = null;
      }
    }
  }

  /** Creative palette click: put a full stack (shift) or one item on the cursor. */
  creativePick(id: string, shift: boolean) {
    if (this.cursor && this.cursor.id === id) {
      this.cursor.count = Math.min(maxStack(id), this.cursor.count + 1);
      return;
    }
    if (this.cursor) {
      this.cursor = null;
      return;
    }
    this.cursor = { id, count: shift ? maxStack(id) : 1 };
  }

  /** Throw the cursor stack out of the inventory screen. */
  dropCursor() {
    if (!this.cursor) return;
    const p = this.player;
    const [dx, , dz] = this.lookVector();
    this.spawnItem(this.cursor, p.x, p.y + 1.3, p.z, dx * 0.3, 0.1, dz * 0.3, 40);
    this.cursor = null;
  }

  // -------------------------------------------------------------------------
  // Furnaces
  // -------------------------------------------------------------------------
  private tickFurnaces() {
    for (const [key, f] of this.furnaces) {
      const [x, y, z] = key.split(',').map(Number);
      if (!this.world.isLoaded(x, z)) continue;
      if (this.world.getBlock(x, y, z) !== B.furnace) {
        this.furnaces.delete(key);
        continue;
      }
      const wasLit = f.burn > 0;
      if (f.burn > 0) f.burn--;
      const result = f.input ? SMELTING[f.input.id] : undefined;
      const canSmelt =
        Boolean(result) &&
        (!f.output || (f.output.id === result && f.output.count < maxStack(result)));
      if (f.burn === 0 && canSmelt && f.fuel) {
        const fuel = ITEMS[f.fuel.id]?.fuel;
        if (fuel) {
          f.burnMax = fuel * TPS;
          f.burn = f.burnMax;
          if (f.fuel.id === 'lava_bucket') f.fuel = { id: 'bucket', count: 1 };
          else {
            f.fuel.count--;
            if (f.fuel.count <= 0) f.fuel = null;
          }
        }
      }
      if (f.burn > 0 && canSmelt) {
        f.cook++;
        if (f.cook >= SMELT_TIME * TPS) {
          f.cook = 0;
          f.input!.count--;
          if (f.input!.count <= 0) f.input = null;
          if (f.output) f.output.count++;
          else f.output = { id: result!, count: 1 };
          if (result === 'iron_ingot' || result === 'gold_ingot') this.addXp(1);
        }
      } else f.cook = Math.max(0, f.cook - 2);
      const lit = f.burn > 0;
      if (lit !== wasLit) {
        const meta = this.world.getMeta(x, y, z);
        this.world.setBlock(x, y, z, B.furnace, lit ? meta | 4 : meta & ~4, false);
      }
    }
  }

  // -------------------------------------------------------------------------
  // Block updates
  // -------------------------------------------------------------------------
  private processChecks() {
    if (this.pendingChecks.size === 0) return;
    const list = [...this.pendingChecks];
    this.pendingChecks.clear();
    for (const key of list) {
      const [x, y, z] = key.split(',').map(Number);
      this.checkBlock(x, y, z);
    }
  }

  private checkBlock(x: number, y: number, z: number) {
    const w = this.world;
    const id = w.getBlock(x, y, z);
    if (id === B.air || isLiquid(id)) return;
    const def = BLOCKS[id];
    const meta = w.getMeta(x, y, z);
    const below = w.getBlock(x, y - 1, z);
    const pop = () => {
      w.setBlock(x, y, z, B.air);
      this.dropBlockItems(x, y, z, id, meta, undefined);
      this.dropContainer(x, y, z);
    };
    if (def.gravity) {
      if (
        below === B.air ||
        isLiquid(below) ||
        (!BLOCKS[below].solid && BLOCKS[below].replaceable)
      ) {
        w.setBlock(x, y, z, B.air);
        const e = this.newEntity('falling', x + 0.5, y, z + 0.5, 0.98, 0.98);
        e.block = id;
        this.entities.push(e);
      }
      return;
    }
    if (id === B.torch) {
      if (meta === 0) {
        if (!BLOCKS[below].solid) pop();
      } else {
        const ring = WALL_RING[meta - 1];
        if (!BLOCKS[w.getBlock(x + ring[0], y, z + ring[2])].opaque) pop();
      }
      return;
    }
    if (id === B.ladder) {
      const ring = WALL_RING[meta & 3];
      if (!BLOCKS[w.getBlock(x + ring[0], y, z + ring[2])].opaque) pop();
      return;
    }
    if (id === B.door) {
      if (meta & 8) {
        if (below !== B.door) w.setBlock(x, y, z, B.air);
      } else if (w.getBlock(x, y + 1, z) !== B.door) w.setBlock(x, y, z, B.air);
      else if (!BLOCKS[below].solid) {
        w.setBlock(x, y + 1, z, B.air);
        pop();
      }
      return;
    }
    if (id === B.cactus) {
      if (below !== B.sand && below !== B.cactus) pop();
      else
        for (const [dx, dz] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ])
          if (BLOCKS[w.getBlock(x + dx, y, z + dz)].solid) {
            pop();
            break;
          }
      return;
    }
    if (id === B.sugarCane) {
      if (below !== B.sugarCane && below !== B.sand && below !== B.grass && below !== B.dirt) pop();
      return;
    }
    if (id === B.wheat) {
      if (below !== B.farmland) pop();
      return;
    }
    if (id === B.farmland) {
      const above = w.getBlock(x, y + 1, z);
      if (BLOCKS[above].opaque) w.setBlock(x, y, z, B.dirt);
      return;
    }
    if (def.needsSupport && (def.render === 'cross' || def.render === 'crop')) {
      if (id === B.deadBush) {
        if (below !== B.sand && below !== B.dirt && below !== B.grass) pop();
      } else if (
        below !== B.grass &&
        below !== B.dirt &&
        below !== B.farmland &&
        below !== B.snowyGrass
      )
        pop();
    }
    if (id === B.grass && BLOCKS[w.getBlock(x, y + 1, z)].opaque) w.setBlock(x, y, z, B.dirt);
  }

  private randomTicks() {
    const w = this.world;
    const pcx = Math.floor(this.player.x / 16);
    const pcz = Math.floor(this.player.z / 16);
    const r = this.random;
    for (let dz = -4; dz <= 4; dz++) {
      for (let dx = -4; dx <= 4; dx++) {
        const cx = pcx + dx;
        const cz = pcz + dz;
        if (!w.chunks.get(chunkKey(cx, cz))?.lit) continue;
        for (let s = 0; s < 24; s++) {
          const x = cx * 16 + Math.floor(r() * 16);
          const y = Math.floor(r() * HEIGHT);
          const z = cz * 16 + Math.floor(r() * 16);
          const id = w.getBlock(x, y, z);
          if (id === B.air || id === B.stone || id === B.deepslate || id === B.water) continue;
          this.randomTick(x, y, z, id);
        }
      }
    }
  }

  private randomTick(x: number, y: number, z: number, id: number) {
    const w = this.world;
    const r = this.random;
    const skyAbove = w.getLight(x, y + 1, z) >> 4;
    const blkAbove = w.getLight(x, y + 1, z) & 15;
    const lightAbove = Math.max(skyAbove - this.skyDarken(), blkAbove);
    switch (id) {
      case B.grass: {
        const above = w.getBlock(x, y + 1, z);
        if (BLOCKS[above].opaque || isLiquid(above)) {
          w.setBlock(x, y, z, B.dirt);
          return;
        }
        if (lightAbove >= 9) {
          const tx = x + Math.floor(r() * 3) - 1;
          const ty = y + Math.floor(r() * 5) - 3;
          const tz = z + Math.floor(r() * 3) - 1;
          if (
            w.getBlock(tx, ty, tz) === B.dirt &&
            !BLOCKS[w.getBlock(tx, ty + 1, tz)].opaque &&
            w.getLight(tx, ty + 1, tz) >> 4 >= 4
          )
            w.setBlock(tx, ty, tz, B.grass);
        }
        return;
      }
      case B.oakLeaves:
      case B.birchLeaves:
      case B.spruceLeaves: {
        if (w.getMeta(x, y, z) & 1) return;
        if (!this.logNearby(x, y, z)) {
          w.setBlock(x, y, z, B.air);
          this.dropBlockItems(x, y, z, id, 0, undefined);
        }
        return;
      }
      case B.oakSapling:
      case B.birchSapling:
      case B.spruceSapling: {
        if (lightAbove >= 9 && r() < 0.15) this.growTree(x, y, z, id);
        return;
      }
      case B.wheat: {
        const meta = w.getMeta(x, y, z);
        if (meta >= 7 || lightAbove < 9) return;
        const moist = w.getMeta(x, y - 1, z) > 0;
        if (r() < (moist ? 0.33 : 0.15)) w.setBlock(x, y, z, B.wheat, meta + 1, false);
        return;
      }
      case B.farmland: {
        let water = false;
        for (let dx = -4; dx <= 4 && !water; dx++)
          for (let dz = -4; dz <= 4 && !water; dz++)
            for (let dy = 0; dy <= 1; dy++)
              if (w.getBlock(x + dx, y + dy, z + dz) === B.water) water = true;
        const meta = w.getMeta(x, y, z);
        if (water && !meta) w.setBlock(x, y, z, B.farmland, 1, false);
        else if (!water && meta) w.setBlock(x, y, z, B.farmland, 0, false);
        else if (!water && w.getBlock(x, y + 1, z) !== B.wheat && r() < 0.2)
          w.setBlock(x, y, z, B.dirt);
        return;
      }
      case B.sugarCane:
      case B.cactus: {
        if (w.getBlock(x, y + 1, z) !== B.air || r() > 0.08) return;
        let h = 1;
        while (w.getBlock(x, y - h, z) === id) h++;
        if (h < 3) w.setBlock(x, y + 1, z, id);
        break;
      }
      default: {
        break;
      }
    }
  }

  private logNearby(x: number, y: number, z: number) {
    for (let dx = -4; dx <= 4; dx++)
      for (let dy = -4; dy <= 4; dy++)
        for (let dz = -4; dz <= 4; dz++) {
          if (Math.abs(dx) + Math.abs(dy) + Math.abs(dz) > 6) continue;
          const id = this.world.getBlock(x + dx, y + dy, z + dz);
          if (id === B.oakLog || id === B.birchLog || id === B.spruceLog) return true;
        }
    return false;
  }

  growTree(x: number, y: number, z: number, sapling: number) {
    const w = this.world;
    const height = 4 + Math.floor(this.random() * 3);
    for (let k = 1; k <= height + 1; k++) {
      const id = w.getBlock(x, y + k, z);
      if (id !== B.air && !BLOCKS[id].key.includes('leaves')) return false;
    }
    const log =
      sapling === B.birchSapling
        ? B.birchLog
        : sapling === B.spruceSapling
          ? B.spruceLog
          : B.oakLog;
    const leaves =
      sapling === B.birchSapling
        ? B.birchLeaves
        : sapling === B.spruceSapling
          ? B.spruceLeaves
          : B.oakLeaves;
    const crown = y + height;
    if (sapling === B.spruceSapling) {
      for (let yy = crown + 1; yy > y + 2; yy--) {
        const k = crown + 1 - yy;
        const radius = k < 2 ? k % 2 : k % 2 === 0 ? 1 : 2;
        for (let dx = -radius; dx <= radius; dx++)
          for (let dz = -radius; dz <= radius; dz++) {
            if (radius > 1 && Math.abs(dx) === radius && Math.abs(dz) === radius) continue;
            if (w.getBlock(x + dx, yy, z + dz) === B.air) w.setBlock(x + dx, yy, z + dz, leaves);
          }
      }
    } else {
      for (let dy = -3; dy <= 0; dy++) {
        const radius = dy >= -1 ? 1 : 2;
        for (let dx = -radius; dx <= radius; dx++)
          for (let dz = -radius; dz <= radius; dz++) {
            const corner = Math.abs(dx) === radius && Math.abs(dz) === radius;
            if (corner && (dy === 0 || this.random() < 0.5)) continue;
            if (w.getBlock(x + dx, crown + dy, z + dz) === B.air)
              w.setBlock(x + dx, crown + dy, z + dz, leaves);
          }
      }
    }
    w.setBlock(x, y, z, log);
    for (let k = 1; k < height; k++) w.setBlock(x, y + k, z, log);
    return true;
  }

  // -------------------------------------------------------------------------
  // Explosions
  // -------------------------------------------------------------------------
  primeTnt(x: number, y: number, z: number, fuse: number) {
    const e = this.newEntity('tnt', x + 0.5, y, z + 0.5, 0.98, 0.98);
    e.fuse = fuse;
    e.vy = 0.2;
    e.vx = (this.random() - 0.5) * 0.04;
    e.vz = (this.random() - 0.5) * 0.04;
    this.entities.push(e);
    this.sound('random/fuse', x, y, z, 0.6);
  }

  explode(x: number, y: number, z: number, power: number, breakBlocks = true) {
    const w = this.world;
    const destroyed = new Set<string>();
    if (breakBlocks) {
      for (let i = 0; i < 16; i++)
        for (let j = 0; j < 16; j++)
          for (let k = 0; k < 16; k++) {
            if (i !== 0 && i !== 15 && j !== 0 && j !== 15 && k !== 0 && k !== 15) continue;
            let dx = (i / 15) * 2 - 1;
            let dy = (j / 15) * 2 - 1;
            let dz = (k / 15) * 2 - 1;
            const len = Math.hypot(dx, dy, dz);
            dx /= len;
            dy /= len;
            dz /= len;
            let intensity = power * (0.7 + this.random() * 0.6);
            let rx = x;
            let ry = y;
            let rz = z;
            while (intensity > 0) {
              const bx = Math.floor(rx);
              const by = Math.floor(ry);
              const bz = Math.floor(rz);
              const id = w.getBlock(bx, by, bz);
              if (id !== B.air) intensity -= (resistance(id) / 5 + 0.3) * 0.3;
              if (intensity > 0 && id !== B.air && by >= 0) destroyed.add(`${bx},${by},${bz}`);
              rx += dx * 0.3;
              ry += dy * 0.3;
              rz += dz * 0.3;
              intensity -= 0.225;
            }
          }
    }
    for (const key of destroyed) {
      const [bx, by, bz] = key.split(',').map(Number);
      const id = w.getBlock(bx, by, bz);
      if (id === B.tnt) {
        w.setBlock(bx, by, bz, B.air);
        this.primeTnt(bx, by, bz, 10 + Math.floor(this.random() * 20));
        continue;
      }
      if (isLiquid(id)) continue;
      w.setBlock(bx, by, bz, B.air);
      this.dropContainer(bx, by, bz);
      if (this.random() < 1 / power) this.dropBlockItems(bx, by, bz, id, 0, 'diamond_pickaxe');
    }
    // Damage entities and the player.
    const radius = power * 2;
    const hit = (b: { x: number; y: number; z: number; h: number }) => {
      const dx = b.x - x;
      const dy = b.y + b.h / 2 - y;
      const dz = b.z - z;
      const d = Math.hypot(dx, dy, dz);
      if (d > radius) return null;
      const impact = 1 - d / radius;
      const dmg = Math.floor(((impact * impact + impact) / 2) * 7 * radius + 1);
      const n = d || 1;
      return { dmg, kx: (dx / n) * impact, ky: (dy / n) * impact, kz: (dz / n) * impact };
    };
    for (const e of this.entities) {
      if (e.removed) continue;
      const h = hit(e);
      if (!h) continue;
      if (e.kind === 'tnt' || e.kind === 'falling') {
        e.vx += h.kx;
        e.vy += h.ky;
        e.vz += h.kz;
        continue;
      }
      this.hurtEntity(e, h.dmg, h.kx, h.kz, 'explosion');
      e.vy += h.ky;
    }
    const ph = hit(this.player);
    if (ph && this.mode !== 'creative') {
      this.player.invulnerable = 0;
      this.hurtPlayer(ph.dmg, this.t('blew up', '被炸死了'), ph.kx * 2, ph.kz * 2);
      this.player.vy += ph.ky;
    }
    this.sound('random/explode', x, y, z, 1.2, 0.7 + this.random() * 0.2);
    this.events.push({ type: 'explode', x, y, z, power });
  }

  // -------------------------------------------------------------------------
  // Entities
  // -------------------------------------------------------------------------
  newEntity(kind: EntityKind, x: number, y: number, z: number, w: number, h: number): Entity {
    return {
      id: this.nextId++,
      kind,
      x,
      y,
      z,
      px: x,
      py: y,
      pz: z,
      vx: 0,
      vy: 0,
      vz: 0,
      w,
      h,
      step: kind === 'item' || kind === 'tnt' || kind === 'falling' ? 0 : 0.6,
      onGround: false,
      collidedH: false,
      yaw: this.random() * Math.PI * 2,
      pyaw: 0,
      pitch: 0,
      headYaw: 0,
      health: 1,
      maxHealth: 1,
      hurtTime: 0,
      invulnerable: 0,
      deathTime: 0,
      fire: 0,
      fallDistance: 0,
      age: 0,
      inWater: false,
      inLava: false,
      limbSwing: 0,
      limbAmount: 0,
      removed: false,
    };
  }

  spawnMob(kind: MobKind, x: number, y: number, z: number) {
    const stats = MOB_STATS[kind];
    const e = this.newEntity(kind, x, y, z, stats.w, stats.h);
    e.maxHealth = stats.health;
    e.health = stats.health;
    e.pyaw = e.yaw;
    this.entities.push(e);
    return e;
  }

  spawnItem(
    stack: Stack,
    x: number,
    y: number,
    z: number,
    vx?: number,
    vy?: number,
    vz?: number,
    delay = 10,
  ) {
    const e = this.newEntity('item', x, y - 0.125, z, 0.25, 0.25);
    e.stack = { ...stack };
    e.vx = vx ?? (this.random() - 0.5) * DROP_SPREAD * 2;
    e.vy = vy ?? 0.2;
    e.vz = vz ?? (this.random() - 0.5) * DROP_SPREAD * 2;
    e.pickupDelay = delay;
    this.entities.push(e);
    return e;
  }

  private spawnHostiles() {
    if (this.difficulty === 'peaceful') {
      for (const e of this.entities) if (HOSTILE.has(e.kind)) e.removed = true;
      return;
    }
    const p = this.player;
    let hostile = 0;
    for (const e of this.entities) if (HOSTILE.has(e.kind) && !e.removed) hostile++;
    if (hostile >= 16) return;
    const darken = this.skyDarken();
    for (let attempt = 0; attempt < 6; attempt++) {
      const angle = this.random() * Math.PI * 2;
      const dist = 24 + this.random() * 40;
      const x = Math.floor(p.x + Math.cos(angle) * dist);
      const z = Math.floor(p.z + Math.sin(angle) * dist);
      if (!this.world.chunkAt(x, z)?.lit) continue;
      const y0 = Math.floor(p.y) + 16 - Math.floor(this.random() * 48);
      for (let y = Math.min(HEIGHT - 3, y0); y > Math.max(1, y0 - 24); y--) {
        const below = this.world.getBlock(x, y - 1, z);
        if (!BLOCKS[below].opaque || below === B.bedrock) continue;
        if (this.world.getBlock(x, y, z) !== B.air || this.world.getBlock(x, y + 1, z) !== B.air)
          continue;
        const l = this.world.getLight(x, y, z);
        const effective = Math.max((l >> 4) - darken, l & 15);
        if ((l & 15) > 0 || effective > 7) break;
        const roll = this.random();
        const kind: MobKind = roll < 0.55 ? 'zombie' : roll < 0.85 ? 'creeper' : 'skeleton';
        const e = this.spawnMob(kind, x + 0.5, y, z + 0.5);
        e.yaw = this.random() * Math.PI * 2;
        return;
      }
    }
  }

  private tickEntities() {
    const p = this.player;
    for (const e of this.entities) {
      if (e.removed) continue;
      e.px = e.x;
      e.py = e.y;
      e.pz = e.z;
      e.pyaw = e.yaw;
      e.age++;
      if (!this.world.chunkAt(Math.floor(e.x), Math.floor(e.z))?.lit) continue;
      const dx = e.x - p.x;
      const dz = e.z - p.z;
      const d2 = dx * dx + dz * dz;
      if (HOSTILE.has(e.kind) && (d2 > 128 * 128 || (d2 > 32 * 32 && this.random() < 1 / 800))) {
        e.removed = true;
        continue;
      }
      switch (e.kind) {
        case 'item': {
          this.tickItem(e);
          break;
        }
        case 'tnt': {
          this.tickTnt(e);
          break;
        }
        case 'falling': {
          this.tickFalling(e);
          break;
        }
        case 'arrow': {
          this.tickArrow(e);
          break;
        }
        default: {
          this.tickMob(e);
        }
      }
    }
    for (let i = this.entities.length - 1; i >= 0; i--)
      if (this.entities[i].removed) this.entities.splice(i, 1);
  }

  private physics(e: Entity, gravity = 0.08, drag = 0.98) {
    e.inWater = liquidAt(this.world, e.x, e.y + 0.2, e.z, B.water);
    e.inLava = liquidAt(this.world, e.x, e.y + 0.2, e.z, B.lava);
    const startY = e.y;
    move(this.world, e, e.vx, e.vy, e.vz);
    if (e.inWater || e.inLava) {
      e.vx *= 0.8;
      e.vz *= 0.8;
      e.vy = e.vy * 0.8 - 0.02;
      e.fallDistance = 0;
    } else {
      const friction = e.onGround ? 0.6 * 0.91 : 0.91;
      e.vx *= friction;
      e.vz *= friction;
      e.vy = (e.vy - gravity) * drag;
    }
    if (!e.onGround && e.y < startY) e.fallDistance += startY - e.y;
    if (e.y < -64) e.removed = true;
  }

  private tickItem(e: Entity) {
    const p = this.player;
    if (e.pickupDelay! > 0) e.pickupDelay!--;
    // Magnet and pickup.
    const dx = p.x - e.x;
    const dy = p.y + 0.9 - e.y;
    const dz = p.z - e.z;
    const d = Math.hypot(dx, dy, dz);
    if (!p.dead && e.pickupDelay === 0 && d < 1.6) {
      if (d < 1.1) {
        const left = this.giveItem(e.stack!);
        if (left < e.stack!.count)
          this.sound('random/pop', e.x, e.y, e.z, 0.2, 1.4 + this.random() * 0.8);
        if (!left) {
          e.removed = true;
          return;
        }
        e.stack!.count = left;
      } else {
        e.vx += (dx / d) * 0.04;
        e.vy += (dy / d) * 0.04;
        e.vz += (dz / d) * 0.04;
      }
    }
    if (e.inWater) e.vy += 0.03;
    this.physics(e, 0.04);
    if (e.onGround) {
      e.vx *= 0.7;
      e.vz *= 0.7;
    }
    if (e.age > 6000) e.removed = true;
    // Merge with nearby equal stacks.
    if (e.age % 10 === 0) {
      for (const o of this.entities) {
        if (
          o === e ||
          o.removed ||
          o.kind !== 'item' ||
          o.stack!.id !== e.stack!.id ||
          o.stack!.wear ||
          e.stack!.wear
        )
          continue;
        if (Math.abs(o.x - e.x) > 0.6 || Math.abs(o.y - e.y) > 0.6 || Math.abs(o.z - e.z) > 0.6)
          continue;
        const total = o.stack!.count + e.stack!.count;
        if (total > maxStack(e.stack!.id)) continue;
        e.stack!.count = total;
        o.removed = true;
      }
    }
  }

  private tickTnt(e: Entity) {
    this.physics(e, 0.04);
    e.fuse = (e.fuse ?? 80) - 1;
    if (e.fuse <= 0) {
      e.removed = true;
      this.explode(e.x, e.y + 0.5, e.z, 4);
    }
  }

  private tickFalling(e: Entity) {
    this.physics(e, 0.04);
    if (e.onGround || e.age > 600) {
      e.removed = true;
      const x = Math.floor(e.x);
      const y = Math.floor(e.y + 0.1);
      const z = Math.floor(e.z);
      const here = this.world.getBlock(x, y, z);
      if (here === B.air || isLiquid(here) || BLOCKS[here].replaceable) {
        this.world.setBlock(x, y, z, e.block!);
        this.pendingChecks.add(`${x},${y},${z}`);
      } else this.spawnItem({ id: BLOCKS[e.block!].key, count: 1 }, e.x, e.y + 0.5, e.z);
    }
  }

  private tickArrow(e: Entity) {
    const p = this.player;
    if (e.onGround || e.collidedH) {
      if (e.age > 200) e.removed = true;
      e.vx = 0;
      e.vy = 0;
      e.vz = 0;
      return;
    }
    e.yaw = Math.atan2(-e.vx, -e.vz);
    move(this.world, e, e.vx, e.vy, e.vz);
    e.vy -= 0.05;
    e.vx *= 0.99;
    e.vz *= 0.99;
    const box = bodyBox(p);
    if (
      e.x > box.x0 - 0.1 &&
      e.x < box.x1 + 0.1 &&
      e.z > box.z0 - 0.1 &&
      e.z < box.z1 + 0.1 &&
      e.y > box.y0 &&
      e.y < box.y1
    ) {
      const speed = Math.hypot(e.vx, e.vy, e.vz);
      this.hurtPlayer(
        Math.ceil(speed * 2),
        `${this.t('was shot by Skeleton', '被骷髅射杀了')} by mob`,
        e.vx * 0.3,
        e.vz * 0.3,
      );
      e.removed = true;
    }
    if (e.age > 1200) e.removed = true;
  }

  private tickMob(e: Entity) {
    const p = this.player;
    const kind = e.kind as MobKind;
    const stats = MOB_STATS[kind];
    if (e.deathTime > 0) {
      e.deathTime++;
      e.vx *= 0.5;
      e.vz *= 0.5;
      this.physics(e);
      if (e.deathTime > 20) e.removed = true;
      return;
    }
    if (e.hurtTime > 0) e.hurtTime--;
    if (e.invulnerable > 0) e.invulnerable--;
    // Environment damage.
    const sky =
      this.world.getLight(Math.floor(e.x), Math.floor(e.y + e.h - 0.1), Math.floor(e.z)) >> 4;
    const day = daylight(this.time) > 0.75;
    if ((kind === 'zombie' || kind === 'skeleton') && day && sky === 15 && !e.inWater)
      e.fire = Math.max(e.fire, 40);
    if (e.inLava) e.fire = 160;
    if (e.inWater) e.fire = 0;
    if (e.fire > 0) {
      e.fire--;
      if (e.fire % 20 === 0) this.hurtEntity(e, e.inLava ? 4 : 1, 0, 0, 'fire');
    }
    if (e.onGround && e.fallDistance > 3)
      this.hurtEntity(e, Math.ceil(e.fallDistance - 3), 0, 0, 'fall');
    if (e.onGround) e.fallDistance = 0;
    if (e.deathTime > 0) return;

    // AI.
    let tx: number | undefined;
    let tz: number | undefined;
    let speed = stats.speed;
    const dx = p.x - e.x;
    const dz = p.z - e.z;
    const dist = Math.hypot(dx, dz);
    const dy = p.y - e.y;
    const canTarget = !p.dead && this.mode !== 'creative' && dist < 32 && Math.abs(dy) < 12;
    if (HOSTILE.has(kind) && canTarget) {
      tx = p.x;
      tz = p.z;
      if (kind === 'creeper') {
        if (dist < 3 && Math.abs(dy) < 3) {
          if (!e.fuse) this.sound('random/fuse', e.x, e.y, e.z, 0.6);
          e.fuse = (e.fuse ?? 0) + 1;
          speed = 0;
          if (e.fuse >= 30) {
            e.removed = true;
            this.explode(e.x, e.y + 0.8, e.z, 3);
            return;
          }
        } else if (e.fuse) e.fuse = Math.max(0, e.fuse - 1);
      } else if (kind === 'skeleton') {
        e.attackCooldown = (e.attackCooldown ?? 40) - 1;
        if (dist < 10) {
          speed = dist < 6 ? -stats.speed * 0.6 : 0;
          if (e.attackCooldown <= 0 && dist < 15) {
            e.attackCooldown = 40;
            const arrow = this.newEntity('arrow', e.x, e.y + 1.5, e.z, 0.2, 0.2);
            const ty = p.y + 1.2 - (e.y + 1.5);
            const horizontal = Math.max(0.1, dist);
            const v = 1.6;
            arrow.vx = (dx / horizontal) * v;
            arrow.vz = (dz / horizontal) * v;
            arrow.vy = (ty / horizontal) * v + horizontal * 0.016;
            arrow.owner = 'mob';
            this.entities.push(arrow);
            this.sound('random/bow', e.x, e.y + 1.5, e.z, 0.6);
          }
        }
      } else {
        e.attackCooldown = Math.max(0, (e.attackCooldown ?? 0) - 1);
        if (dist < 1.2 && Math.abs(dy) < 1.5 && e.attackCooldown === 0) {
          e.attackCooldown = 20;
          const n = dist || 1;
          this.hurtPlayer(
            3,
            `${this.t('was slain by Zombie', '被僵尸杀死了')} by mob`,
            dx / n,
            dz / n,
          );
        }
      }
    } else if (e.panic && e.panic > 0) {
      e.panic--;
      speed = stats.speed * 1.6;
      if (!e.wanderTime || e.wanderTime <= 0 || e.age % 20 === 0) {
        e.wanderX = e.x + (this.random() - 0.5) * 16;
        e.wanderZ = e.z + (this.random() - 0.5) * 16;
        e.wanderTime = 20;
      }
      tx = e.wanderX;
      tz = e.wanderZ;
    } else {
      e.wanderTime = (e.wanderTime ?? 0) - 1;
      if (e.wanderTime <= 0) {
        if (this.random() < 0.4) {
          e.wanderX = e.x + (this.random() - 0.5) * 14;
          e.wanderZ = e.z + (this.random() - 0.5) * 14;
        } else {
          e.wanderX = undefined;
          e.wanderZ = undefined;
        }
        e.wanderTime = 60 + Math.floor(this.random() * 120);
      }
      tx = e.wanderX;
      tz = e.wanderZ;
      // Passive mobs look at nearby players.
      if (!HOSTILE.has(kind) && dist < 6 && tx === undefined)
        e.yaw = approachAngle(e.yaw, Math.atan2(-dx, -dz), 0.2);
    }
    if (tx !== undefined && tz !== undefined && speed !== 0) {
      const mx = tx - e.x;
      const mz = tz - e.z;
      const md = Math.hypot(mx, mz);
      if (md > 0.6) {
        const yaw = Math.atan2(-mx, -mz);
        e.yaw = approachAngle(e.yaw, yaw, 0.35);
        const accel = (e.onGround ? 0.1 : 0.02) * speed * 4.3;
        e.vx += -Math.sin(e.yaw) * accel;
        e.vz += -Math.cos(e.yaw) * accel;
        // Avoid walking off high drops when calm.
        if (!HOSTILE.has(kind) && !e.panic && e.onGround) {
          const ax = Math.floor(e.x - Math.sin(e.yaw) * 0.8);
          const az = Math.floor(e.z - Math.cos(e.yaw) * 0.8);
          const fy = Math.floor(e.y);
          if (
            !BLOCKS[this.world.getBlock(ax, fy - 1, az)].solid &&
            !BLOCKS[this.world.getBlock(ax, fy - 2, az)].solid &&
            !BLOCKS[this.world.getBlock(ax, fy - 3, az)].solid
          ) {
            e.vx = 0;
            e.vz = 0;
            e.wanderTime = 0;
          }
        }
      } else if (!HOSTILE.has(kind)) e.wanderTime = 0;
    }
    if ((e.collidedH && e.onGround) || (e.inWater && this.random() < 0.8))
      e.vy = e.inWater ? 0.04 + e.vy : 0.42;
    e.headYaw = HOSTILE.has(kind) && canTarget ? Math.atan2(-dx, -dz) : e.yaw;
    this.physics(e);
    // Push apart from other mobs and the player.
    const moved = Math.hypot(e.x - e.px, e.z - e.pz);
    e.limbAmount += (Math.min(1, moved * 4) - e.limbAmount) * 0.4;
    e.limbSwing += e.limbAmount;
    // Ambient sounds.
    const say = SAY[kind];
    if (say && this.random() < 1 / 160 && dist < 16)
      this.sound(say, e.x, e.y + e.h, e.z, 0.6, 0.9 + this.random() * 0.2);
    if (kind === 'chicken' && !e.onGround && e.vy < 0) e.vy *= 0.6;
  }

  // -------------------------------------------------------------------------
  // Commands
  // -------------------------------------------------------------------------
  command(line: string): string {
    const parts = line.trim().replace(/^\//, '').split(/\s+/);
    const [cmd, ...args] = parts;
    const p = this.player;
    switch (cmd) {
      case 'gamemode': {
        const mode =
          args[0] === 'creative' || args[0] === '1' || args[0] === 'c'
            ? 'creative'
            : args[0] === 'survival' || args[0] === '0' || args[0] === 's'
              ? 'survival'
              : null;
        if (!mode)
          return this.t('Usage: /gamemode survival|creative', '用法：/gamemode survival|creative');
        this.mode = mode;
        if (mode === 'survival') p.flying = false;
        return this.t(
          `Set own game mode to ${mode === 'creative' ? 'Creative' : 'Survival'} Mode`,
          `已将自己的游戏模式设置为${mode === 'creative' ? '创造' : '生存'}模式`,
        );
      }
      case 'time': {
        const v = args[1];
        const named: Record<string, number> = {
          day: 1000,
          noon: 6000,
          night: 13000,
          midnight: 18000,
          sunrise: 23000,
        };
        const value = named[v] ?? Number(v);
        if (!Number.isFinite(value))
          return this.t('Usage: /time set day|night|<ticks>', '用法：/time set day|night|<刻>');
        if (args[0] === 'add') this.time += value;
        else this.time = Math.floor(this.time / DAY) * DAY + value;
        return this.t(`Set the time to ${value}`, `已将时间设为 ${value}`);
      }
      case 'tp': {
        const [x, y, z] = args.map(Number);
        if ([x, y, z].some((n) => !Number.isFinite(n)))
          return this.t('Usage: /tp x y z', '用法：/tp x y z');
        Object.assign(p, { x, y, z, px: x, py: y, pz: z, vx: 0, vy: 0, vz: 0 });
        return this.t(`Teleported to ${x}, ${y}, ${z}`, `已传送至 ${x}, ${y}, ${z}`);
      }
      case 'give': {
        if (args[0]?.startsWith('@')) args.shift();
        const id = (args[0] ?? '').replace('minecraft:', '');
        const count = Number(args[1] ?? 1);
        if (!ITEMS[id]) return this.t(`Unknown item '${id}'`, `未知的物品“${id}”`);
        this.giveItem({ id, count: Math.max(1, Math.min(64 * 36, count || 1)) });
        return this.t(
          `Gave ${count || 1} [${itemName(id, 'en')}]`,
          `已将 ${count || 1} 个[${itemName(id, 'zh')}]给予玩家`,
        );
      }
      case 'difficulty': {
        const d = args[0] as Difficulty;
        if (!['peaceful', 'easy', 'normal', 'hard'].includes(d))
          return this.t(
            'Usage: /difficulty peaceful|easy|normal|hard',
            '用法：/difficulty peaceful|easy|normal|hard',
          );
        this.difficulty = d;
        return this.t(`The difficulty has been set to ${d}`, `难度已设置为 ${d}`);
      }
      case 'seed': {
        return this.t(`Seed: [${this.options.seed}]`, `种子：[${this.options.seed}]`);
      }
      case 'kill': {
        p.invulnerable = 0;
        if (this.mode === 'creative') {
          p.dead = true;
          p.deathMessage = this.t('fell out of the world', '掉出了这个世界');
          this.events.push({ type: 'death' });
        } else this.hurtPlayer(1000, this.t('fell out of the world', '掉出了这个世界'));
        return '';
      }
      case 'summon': {
        const kind = (args[0] ?? '').replace('minecraft:', '') as MobKind;
        if (!MOB_STATS[kind] && kind !== ('tnt' as MobKind))
          return this.t(`Unknown entity '${kind}'`, `未知的实体“${kind}”`);
        const [lx, , lz] = this.lookVector();
        if (kind === ('tnt' as MobKind))
          this.primeTnt(Math.floor(p.x + lx * 3), Math.floor(p.y), Math.floor(p.z + lz * 3), 80);
        else this.spawnMob(kind, p.x + lx * 3, p.y, p.z + lz * 3);
        return this.t(`Summoned new ${kind}`, `已生成新的 ${kind}`);
      }
      case 'spawnpoint': {
        p.spawnX = p.x;
        p.spawnY = p.y;
        p.spawnZ = p.z;
        return this.t('Set spawn point', '已设置出生点');
      }
      case 'clear': {
        this.inventory.fill(null);
        return this.t('Cleared the inventory', '已清空物品栏');
      }
      case 'help': {
        return '/gamemode /time /tp /give /difficulty /seed /kill /summon /spawnpoint /clear';
      }
      default: {
        return this.t(`Unknown command: ${cmd}`, `未知的命令：${cmd}`);
      }
    }
  }
}

/** Offset to the wall for facing 0 +Z, 1 -X, 2 -Z, 3 +X. */
const WALL_RING: readonly [number, number, number][] = [
  [0, 0, 1],
  [-1, 0, 0],
  [0, 0, -1],
  [1, 0, 0],
];
const INTERACTIVE = new Set<number>([B.craftingTable, B.furnace, B.chest, B.door]);

function emptySlots(n: number): (Stack | null)[] {
  return Array.from({ length: n }, () => null);
}
function slotRange(from: number, to: number) {
  return Array.from({ length: to - from }, (_, i) => from + i);
}

function emptyFurnace(): Furnace {
  return { input: null, fuel: null, output: null, burn: 0, burnMax: 0, cook: 0 };
}

function mergeInto(target: (Stack | null)[], stack: Stack, indices: number[]) {
  let left = stack.count;
  const limit = maxStack(stack.id);
  for (const i of indices) {
    const s = target[i];
    if (s && s.id === stack.id && !s.wear && !stack.wear && s.count < limit) {
      const n = Math.min(limit - s.count, left);
      s.count += n;
      left -= n;
      if (!left) return 0;
    }
  }
  for (const i of indices) {
    if (!target[i]) {
      target[i] = { ...stack, count: left };
      return 0;
    }
  }
  return left;
}

export function approachAngle(from: number, to: number, max: number) {
  let d = to - from;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return from + Math.max(-max, Math.min(max, d));
}

export type { BlockDef };
export { emission };
