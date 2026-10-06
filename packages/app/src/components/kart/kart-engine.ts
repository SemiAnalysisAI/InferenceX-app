import {
  curvatureAt,
  ITEM_LANES,
  ITEM_ROWS,
  mod,
  nearest,
  pointAt,
  TRACK_LENGTH,
  wrapAngle,
} from './kart-track';
import {
  heightAt,
  isCourseSurface,
  SURFACE,
  surfaceAt,
  syntheticSurface,
  type SurfaceMap,
} from './kart-surface';

export { TRACK, TRACK_LENGTH } from './kart-track';
export const LAPS = 3;
export const STEP = 1 / 60;

// ---------------------------------------------------------------------------
// Roster and stats
// ---------------------------------------------------------------------------
export type Weight = 'light' | 'medium' | 'heavy';
export const CHARACTERS = [
  { id: 'mario', name: 'Mario', weight: 'medium', color: '#e52521' },
  { id: 'luigi', name: 'Luigi', weight: 'medium', color: '#21a336' },
  { id: 'peach', name: 'Peach', weight: 'medium', color: '#f483b6' },
  { id: 'daisy', name: 'Daisy', weight: 'medium', color: '#f7a21b' },
  { id: 'yoshi', name: 'Yoshi', weight: 'medium', color: '#5ac83a' },
  { id: 'toad', name: 'Toad', weight: 'light', color: '#2f6ff0' },
  { id: 'dk', name: 'Donkey Kong', weight: 'heavy', color: '#9a5a1c' },
  { id: 'bowser', name: 'Bowser', weight: 'heavy', color: '#f2c11b' },
] as const satisfies readonly { id: string; name: string; weight: Weight; color: string }[];
export type CharacterId = (typeof CHARACTERS)[number]['id'];
export const ENGINE_CLASSES = [50, 100, 150] as const;
export type EngineClass = (typeof ENGINE_CLASSES)[number];

const WEIGHT_STATS: Record<
  Weight,
  {
    top: number;
    accel: number;
    handling: number;
    mass: number;
    drift: number;
    offroad: number;
    radius: number;
  }
> = {
  light: { top: 64, accel: 44, handling: 2.05, mass: 0.8, drift: 1.12, offroad: 0.6, radius: 2.3 },
  medium: { top: 66, accel: 38, handling: 1.9, mass: 1, drift: 1, offroad: 0.55, radius: 2.6 },
  heavy: { top: 68, accel: 32, handling: 1.74, mass: 1.38, drift: 0.9, offroad: 0.5, radius: 3.1 },
};
const CC_SCALE: Record<EngineClass, number> = { 50: 0.8, 100: 0.9, 150: 1 };

// ---------------------------------------------------------------------------
// Items
// ---------------------------------------------------------------------------
export const ITEMS = [
  'mushroom',
  'triple-mushroom',
  'golden-mushroom',
  'banana',
  'triple-banana',
  'green-shell',
  'triple-green-shell',
  'red-shell',
  'star',
  'bobomb',
  'lightning',
] as const;
export type ItemKind = (typeof ITEMS)[number];
// Odds by rank, loosely following the game's position-weighted roulette:
// leaders mostly get defensive items, the back of the pack gets catch-up items.
const ODDS: Record<ItemKind, [number, number, number, number]> = {
  banana: [34, 12, 3, 0],
  'triple-banana': [12, 8, 2, 0],
  'green-shell': [34, 18, 6, 0],
  'triple-green-shell': [4, 12, 8, 2],
  'red-shell': [0, 22, 20, 10],
  mushroom: [12, 16, 14, 6],
  'triple-mushroom': [0, 6, 20, 24],
  'golden-mushroom': [0, 0, 8, 16],
  star: [0, 0, 8, 18],
  bobomb: [4, 6, 9, 6],
  lightning: [0, 0, 2, 18],
};
const COUNTS: Partial<Record<ItemKind, number>> = {
  'triple-mushroom': 3,
  'triple-banana': 3,
  'triple-green-shell': 3,
};

export interface Controls {
  throttle: boolean;
  brake: boolean;
  left: boolean;
  right: boolean;
  drift: boolean;
  item: boolean;
  lookBack: boolean;
}
export const EMPTY_CONTROLS: Controls = {
  throttle: false,
  brake: false,
  left: false,
  right: false,
  drift: false,
  item: false,
  lookBack: false,
};
export type Phase = 'ready' | 'countdown' | 'racing' | 'paused' | 'finished';

export interface Kart {
  index: number;
  character: CharacterId;
  human: boolean;
  x: number;
  y: number;
  z: number;
  vy: number;
  heading: number;
  /** Signed forward speed in course units per second. */
  speed: number;
  /** Sideways slide velocity (+ left), used while drifting and after impacts. */
  slip: number;
  steer: number;
  grounded: boolean;
  surface: number;
  hop: number;
  driftArmed: boolean;
  driftDir: -1 | 0 | 1;
  driftCharge: number;
  /** 0 none, 1 blue mini-turbo, 2 orange super mini-turbo. */
  driftStage: 0 | 1 | 2;
  boost: number;
  boostPower: number;
  boostPanelContact: boolean;
  draft: number;
  spin: number;
  tumble: number;
  shrink: number;
  star: number;
  golden: number;
  respawn: number;
  invulnerable: number;
  bumpCooldown: number;
  wallHit: number;
  item: ItemKind | null;
  itemCount: number;
  roulette: number;
  trailing: boolean;
  itemHeld: boolean;
  itemCooldown: number;
  /** Unwrapped progress along the course; laps = floor(progress / TRACK_LENGTH). */
  progress: number;
  trackIndex: number;
  lateral: number;
  wrongWay: number;
  lapTimes: number[];
  finishedAt: number | null;
  place: number;
  burnout: number;
  startCharge: number | null;
  ai: {
    lane: number;
    skill: number;
    itemTimer: number;
    avoid: number;
    noise: number;
    band: number;
    stuck: number;
    reverse: number;
    /** Furthest progress so far and seconds without improving it. */
    best: number;
    stall: number;
  };
  hits: number;
  wheelTurn: number;
}

export type ProjectileKind = 'banana' | 'green-shell' | 'red-shell' | 'bobomb';
export interface Projectile {
  id: number;
  kind: ProjectileKind;
  x: number;
  y: number;
  z: number;
  vx: number;
  vz: number;
  vy: number;
  owner: number;
  target: number;
  age: number;
  life: number;
  bounces: number;
  fuse: number;
  progress: number;
  trackIndex: number;
  grounded: boolean;
}
export interface Explosion {
  id: number;
  x: number;
  y: number;
  z: number;
  age: number;
}
export interface ItemBox {
  x: number;
  y: number;
  z: number;
  respawn: number;
}
export interface RaceEvent {
  type:
    | 'countdown'
    | 'go'
    | 'item-box'
    | 'item-ready'
    | 'item-use'
    | 'hit'
    | 'spin'
    | 'boost'
    | 'mini-turbo'
    | 'wall'
    | 'lap'
    | 'final-lap'
    | 'finish'
    | 'explosion'
    | 'lightning'
    | 'respawn'
    | 'rocket-start'
    | 'burnout'
    | 'drift';
  kart: number;
  value?: number;
}
export interface Race {
  phase: Phase;
  resumePhase: 'countdown' | 'racing';
  countdown: number;
  elapsed: number;
  karts: Kart[];
  projectiles: Projectile[];
  explosions: Explosion[];
  boxes: ItemBox[];
  /** Seconds remaining on the global lightning flash. */
  lightning: number;
  engineClass: EngineClass;
  playerCharacter: CharacterId;
  events: RaceEvent[];
  seed: number;
  nextId: number;
  surface: SurfaceMap;
  /** Back-compat accessor for the human racer. */
  player: Kart;
  place: number;
}

let fallbackSurface: SurfaceMap | null = null;
function defaultSurface() {
  fallbackSurface ??= syntheticSurface();
  return fallbackSurface;
}

export function rng(race: Race) {
  // mulberry32
  race.seed = Math.imul(race.seed + 1_831_565_813, 1);
  let t = race.seed;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export function stats(k: Kart, race: Race) {
  const w = WEIGHT_STATS[CHARACTERS.find((c) => c.id === k.character)?.weight ?? 'medium'];
  const cc = CC_SCALE[race.engineClass];
  return {
    ...w,
    top: w.top * cc * (k.human ? 1 : k.ai.skill * k.ai.band),
    accel: w.accel * (0.85 + 0.15 * cc),
  };
}

export interface RaceOptions {
  character?: CharacterId;
  engineClass?: EngineClass;
  surface?: SurfaceMap;
  seed?: number;
}
export function newRace(options: RaceOptions = {}): Race {
  const surface = options.surface ?? defaultSurface();
  const playerCharacter = options.character ?? 'mario';
  const engineClass = options.engineClass ?? 150;
  const others = CHARACTERS.map((c) => c.id).filter((id) => id !== playerCharacter);
  // The human starts at the back of the grid, as in a Grand Prix's first race.
  const order: CharacterId[] = [...others, playerCharacter];
  const karts: Kart[] = order.map((character, slot) => {
    const row = Math.floor(slot / 2);
    const distance = -8 - row * 11 - (slot % 2) * 5.5;
    const lane = slot % 2 === 0 ? 6.5 : -6.5;
    const p = pointAt(distance, lane);
    const y = heightAt(surface, p.x, p.z);
    const human = character === playerCharacter;
    return {
      index: slot,
      character,
      human,
      x: p.x,
      y,
      z: p.z,
      vy: 0,
      heading: p.heading,
      speed: 0,
      slip: 0,
      steer: 0,
      grounded: true,
      surface: SURFACE.road,
      hop: 0,
      driftArmed: false,
      driftDir: 0,
      driftCharge: 0,
      driftStage: 0,
      boost: 0,
      boostPower: 1,
      boostPanelContact: false,
      draft: 0,
      spin: 0,
      tumble: 0,
      shrink: 0,
      star: 0,
      golden: 0,
      respawn: 0,
      invulnerable: 0,
      bumpCooldown: 0,
      wallHit: 0,
      item: null,
      itemCount: 0,
      roulette: 0,
      trailing: false,
      itemHeld: false,
      itemCooldown: 0,
      progress: distance,
      trackIndex: nearest(p.x, p.z).index,
      lateral: lane,
      wrongWay: 0,
      lapTimes: [],
      finishedAt: null,
      place: slot + 1,
      burnout: 0,
      startCharge: null,
      ai: {
        lane: (slot % 3) * 3 - 3,
        skill: 0.99 + (slot / 7) * 0.04,
        itemTimer: 0,
        avoid: 0,
        noise: slot * 1.7,
        band: 1,
        stuck: 0,
        reverse: 0,
        best: distance,
        stall: 0,
      },
      hits: 0,
      wheelTurn: 0,
    };
  });
  const boxes: ItemBox[] = [];
  for (const d of ITEM_ROWS)
    for (const lane of ITEM_LANES) {
      const p = pointAt(d, lane);
      boxes.push({ x: p.x, z: p.z, y: heightAt(surface, p.x, p.z) + 2.2, respawn: 0 });
    }
  const player = karts.find((k) => k.human)!;
  return {
    phase: 'ready',
    resumePhase: 'racing',
    countdown: 3,
    elapsed: 0,
    karts,
    projectiles: [],
    explosions: [],
    boxes,
    lightning: 0,
    engineClass,
    playerCharacter,
    events: [],
    seed: options.seed ?? 24_301,
    nextId: 1,
    surface,
    player,
    place: player.place,
  };
}

export function startRace(race: Race) {
  if (race.phase === 'ready') {
    race.phase = 'countdown';
    race.events.push({ type: 'countdown', kart: race.player.index, value: 3 });
  } else if (race.phase === 'paused') race.phase = race.resumePhase;
}
export function pauseRace(race: Race) {
  if (race.phase === 'racing' || race.phase === 'countdown') {
    race.resumePhase = race.phase;
    race.phase = 'paused';
  }
}
export function lap(race: Race, kart: Kart = race.player) {
  return Math.max(1, Math.min(LAPS, Math.floor(kart.progress / TRACK_LENGTH) + 1));
}
export const isStunned = (k: Kart) => k.spin > 0 || k.tumble > 0 || k.respawn > 0;

// ---------------------------------------------------------------------------
// Simulation
// ---------------------------------------------------------------------------
const blocked = (race: Race, k: { x: number; y: number; z: number }, x: number, z: number) => {
  const s = surfaceAt(race.surface, x, z);
  if (s === SURFACE.wall || s === SURFACE.none) return true;
  // Barrier rails and building ledges register as floors that are too tall to climb.
  const allowance =
    s === SURFACE.bank || s === SURFACE.boost ? 1.6 + Math.hypot(x - k.x, z - k.z) * 1.15 : 1.6;
  return heightAt(race.surface, x, z) - k.y > allowance;
};
const RING = Array.from({ length: 10 }, (_, i) => [
  Math.cos((i / 10) * Math.PI * 2),
  Math.sin((i / 10) * Math.PI * 2),
]);
/** Returns an outward wall normal if a circle at (x, z) overlaps blocked terrain. */
function wallNormal(
  race: Race,
  k: { x: number; y: number; z: number },
  x: number,
  z: number,
  r: number,
) {
  let nx = 0;
  let nz = 0;
  let hit = false;
  for (const [cx, cz] of RING) {
    for (const rr of [r, r * 0.55]) {
      if (blocked(race, k, x + cx * rr, z + cz * rr)) {
        nx -= cx;
        nz -= cz;
        hit = true;
      }
    }
  }
  if (!hit) return null;
  const len = Math.hypot(nx, nz);
  if (len < 1e-6) return { nx: 0, nz: 0 };
  return { nx: nx / len, nz: nz / len };
}

function giveBoost(k: Kart, seconds: number, power: number) {
  k.boost = Math.max(k.boost, seconds);
  k.boostPower = Math.max(k.boost > 0 ? k.boostPower : 1, power);
}

function hitKart(race: Race, k: Kart, kind: 'spin' | 'tumble', source = -1) {
  if (k.star > 0 || k.invulnerable > 0 || k.respawn > 0 || k.finishedAt !== null) return false;
  if (kind === 'spin') {
    k.spin = 1.05;
    k.speed *= 0.45;
  } else {
    k.tumble = 1.45;
    k.speed *= 0.12;
    k.vy = 14;
    k.grounded = false;
    if (k.trailing) dropTrailing(k);
  }
  k.driftDir = 0;
  k.driftCharge = 0;
  k.driftStage = 0;
  k.boost = 0;
  k.invulnerable = kind === 'spin' ? 1.6 : 2.1;
  k.hits++;
  race.events.push({ type: kind === 'spin' ? 'spin' : 'hit', kart: k.index, value: source });
  return true;
}
function dropTrailing(k: Kart) {
  k.trailing = false;
  if (k.item && TRAILABLE.includes(k.item)) {
    k.itemCount = Math.max(0, k.itemCount - 1);
    if (k.itemCount === 0) k.item = null;
  }
}

function pickItem(race: Race, k: Kart): ItemKind {
  const n = race.karts.length;
  const r = (k.place - 1) / Math.max(1, n - 1);
  const f = r * 3;
  const a = Math.min(2, Math.floor(f));
  const u = f - a;
  const weights = ITEMS.map((item) => {
    const w = ODDS[item][a] * (1 - u) + ODDS[item][a + 1] * u;
    // Only one lightning per race window and never to the leader.
    if (item === 'lightning' && (race.lightning > 0 || k.place === 1)) return 0;
    return w;
  });
  const total = weights.reduce((s, w) => s + w, 0);
  let roll = rng(race) * total;
  for (let i = 0; i < ITEMS.length; i++) {
    roll -= weights[i];
    if (roll <= 0) return ITEMS[i];
  }
  return 'banana';
}

function spawn(race: Race, k: Kart, kind: ProjectileKind, backward: boolean) {
  const dir = backward ? -1 : 1;
  const fx = Math.sin(k.heading);
  const fz = Math.cos(k.heading);
  const off = backward || kind === 'banana' ? -5.5 : 6;
  const x = k.x + fx * off;
  const z = k.z + fz * off;
  const n = nearest(x, z, k.trackIndex);
  let target = -1;
  if (kind === 'red-shell' && !backward) {
    const ahead = race.karts
      .filter((o) => o !== k && o.finishedAt === null && o.progress > k.progress)
      .sort((a, b) => a.progress - b.progress)[0];
    target = ahead ? ahead.index : -1;
  }
  const shellSpeed = 112 * CC_SCALE[race.engineClass] ** 0.5;
  const speed =
    kind === 'banana' ? (backward ? 0 : 0) : kind === 'bobomb' ? (backward ? 0 : 46) : shellSpeed;
  const p: Projectile = {
    id: race.nextId++,
    kind,
    x,
    y: k.y + (kind === 'bobomb' && !backward ? 2 : 0.4),
    z,
    vx: fx * speed * dir + (kind === 'bobomb' ? fx * Math.max(0, k.speed) : 0),
    vz: fz * speed * dir + (kind === 'bobomb' ? fz * Math.max(0, k.speed) : 0),
    vy: kind === 'bobomb' && !backward ? 18 : 0,
    owner: k.index,
    target,
    age: 0,
    life: kind === 'banana' ? 9999 : kind === 'bobomb' ? 9999 : kind === 'red-shell' ? 14 : 11,
    bounces: 0,
    fuse: kind === 'bobomb' ? 2.6 : 0,
    progress: k.progress,
    trackIndex: n.index,
    grounded: kind !== 'bobomb' || backward,
  };
  race.projectiles.push(p);
  // A dropped banana/bob-omb sits still; keep it on the ground.
  if (kind === 'banana') p.y = heightAt(race.surface, x, z);
}

function useItem(race: Race, k: Kart, backward: boolean) {
  const item = k.item;
  if (!item || k.roulette > 0) return;
  race.events.push({ type: 'item-use', kart: k.index, value: ITEMS.indexOf(item) });
  const consume = () => {
    k.itemCount -= 1;
    if (k.itemCount <= 0) {
      k.item = null;
      k.itemCount = 0;
    }
  };
  switch (item) {
    case 'mushroom':
    case 'triple-mushroom': {
      giveBoost(k, 1.15, 1.42);
      k.speed = Math.max(k.speed, stats(k, race).top * 1.1);
      race.events.push({ type: 'boost', kart: k.index });
      consume();
      break;
    }
    case 'golden-mushroom': {
      if (k.golden <= 0) k.golden = 7.5;
      giveBoost(k, 1, 1.42);
      k.speed = Math.max(k.speed, stats(k, race).top * 1.1);
      race.events.push({ type: 'boost', kart: k.index });
      break;
    }
    case 'banana':
    case 'triple-banana': {
      spawn(race, k, 'banana', true);
      consume();
      break;
    }
    case 'green-shell':
    case 'triple-green-shell': {
      spawn(race, k, 'green-shell', backward);
      consume();
      break;
    }
    case 'red-shell': {
      spawn(race, k, 'red-shell', backward);
      consume();
      break;
    }
    case 'bobomb': {
      spawn(race, k, 'bobomb', backward);
      consume();
      break;
    }
    case 'star': {
      k.star = 7.5;
      k.spin = 0;
      k.tumble = 0;
      giveBoost(k, 0.6, 1.25);
      consume();
      break;
    }
    case 'lightning': {
      race.lightning = 0.6;
      race.events.push({ type: 'lightning', kart: k.index });
      for (const o of race.karts) {
        if (o === k || o.star > 0 || o.respawn > 0 || o.finishedAt !== null) continue;
        // Leaders stay small for longer.
        o.shrink = 3.5 + (race.karts.length - o.place) * 0.6;
        o.spin = Math.max(o.spin, 0.7);
        o.speed *= 0.5;
        o.driftDir = 0;
        o.driftCharge = 0;
        o.driftStage = 0;
        if (o.roulette <= 0) {
          o.item = null;
          o.itemCount = 0;
          o.trailing = false;
        }
      }
      consume();
      break;
    }
  }
  k.trailing = false;
  k.itemCooldown = 0.25;
  k.ai.itemTimer = 1 + rng(race) * 1.5;
}
const TRAILABLE: ItemKind[] = [
  'banana',
  'triple-banana',
  'green-shell',
  'triple-green-shell',
  'red-shell',
];

function respawnKart(race: Race, k: Kart) {
  const back = Math.max(k.progress - 14, -8);
  const p = pointAt(back, Math.max(-6, Math.min(6, k.lateral * 0.3)));
  k.x = p.x;
  k.z = p.z;
  k.y = heightAt(race.surface, p.x, p.z);
  k.heading = p.heading;
  k.speed = 0;
  k.slip = 0;
  k.vy = 0;
  k.progress = back;
  k.trackIndex = nearest(p.x, p.z).index;
  k.grounded = true;
  k.invulnerable = 1.5;
  k.ai.best = k.progress;
  k.ai.stall = 0;
  race.events.push({ type: 'respawn', kart: k.index });
}

const LINE_LANES = [-12, -10, -8, -6, -4, -2, 0, 2, 4, 6, 8, 10, 12];
/** Surface under a point `lane` units left of the centerline at `distance`. */
function laneSurface(race: Race, distance: number, lane: number) {
  const p = pointAt(distance, lane);
  return surfaceAt(race.surface, p.x, p.z);
}
const laneClear = (race: Race, distance: number, lane: number) =>
  isCourseSurface(laneSurface(race, distance, lane));
/** Ahead/side offsets of a world point in the kart's frame (+side is left). */
function relative(k: Kart, x: number, z: number) {
  const dx = x - k.x;
  const dz = z - k.z;
  return {
    ahead: dx * Math.sin(k.heading) + dz * Math.cos(k.heading),
    side: dx * Math.cos(k.heading) - dz * Math.sin(k.heading),
  };
}

/**
 * AI driver: plans a racing line over the real course surface, brakes for
 * bends it cannot hold, chains drift mini-turbos, takes boost strips, dodges
 * hazards, and plays items against the racers around it, all through the same
 * controls a person presses.
 */
export function aiControls(race: Race, k: Kart): Controls {
  const c: Controls = { ...EMPTY_CONTROLS };
  const s = stats(k, race);
  const player = race.player;
  // Rubber-banding toward the human, strongest when the human leads.
  if (!k.human) {
    const gap = player.progress - k.progress;
    k.ai.band =
      gap > 120
        ? 1.14
        : gap > 60
          ? 1.09
          : gap > 25
            ? 1.05
            : gap > 0
              ? 1.02
              : gap < -220
                ? 0.96
                : gap < -120
                  ? 0.99
                  : 1;
  }
  const speed = Math.max(0, k.speed);
  const look = 12 + speed * 0.36;
  const curve = curvatureAt(k.progress + look);
  const curveFar = curvatureAt(k.progress + look * 2);
  let sharpest = 0;
  for (let d = 10; d <= 20 + speed * 0.9; d += 8) {
    const v = curvatureAt(k.progress + d);
    if (Math.abs(v) > Math.abs(sharpest)) sharpest = v;
  }
  const here = nearest(k.x, k.z, k.trackIndex).lateral;

  // Racing line: aim for the inside of the coming bend, then pick the nearest
  // lane that stays on drivable surface both midway and at the aim point.
  const ideal = Math.max(
    -10,
    Math.min(10, (curve * 0.6 + curveFar * 0.4) * 640 + k.ai.lane * 0.35),
  );
  let lane = ideal;
  let bestCost = Infinity;
  for (const l of LINE_LANES) {
    if (!laneClear(race, k.progress + look, l) || !laneClear(race, k.progress + look * 0.5, l))
      continue;
    let cost = Math.abs(l - ideal) + Math.abs(l - here) * 0.15;
    // Boost strips are worth a detour.
    if (
      laneSurface(race, k.progress + look, l) === SURFACE.boost ||
      laneSurface(race, k.progress + look * 0.5, l) === SURFACE.boost
    )
      cost -= 9;
    if (cost < bestCost) {
      bestCost = cost;
      lane = l;
    }
  }

  // Dodge bananas, Bob-ombs, and oncoming green shells; pass slower karts.
  let threat = false;
  for (const p of race.projectiles) {
    if (p.owner === k.index && p.age < 0.6) continue;
    const r = relative(k, p.x, p.z);
    if (p.kind === 'banana' || p.kind === 'bobomb') {
      if (r.ahead > 0 && r.ahead < 34 && Math.abs(r.side) < 5.5) lane += r.side > 0 ? -6.5 : 6.5;
    } else if (r.ahead > -40 && r.ahead < 40 && Math.hypot(r.ahead, r.side) < 40) {
      const closing = p.vx * (k.x - p.x) + p.vz * (k.z - p.z) > 0;
      if (closing) {
        threat = true;
        if (Math.abs(r.side) < 6 && p.kind.includes('green')) lane += r.side > 0 ? -7 : 7;
      }
    }
  }
  for (const o of race.karts) {
    if (o === k || o.respawn > 0) continue;
    const r = relative(k, o.x, o.z);
    if (r.ahead > 2 && r.ahead < 16 && Math.abs(r.side) < 4 && o.speed < k.speed - 2)
      lane += r.side > 0 ? -4.5 : 4.5;
  }
  // Grab item boxes when empty-handed and the box is close to the line.
  if (!k.item && k.roulette <= 0) {
    let best = Infinity;
    for (const b of race.boxes) {
      if (b.respawn > 0) continue;
      const r = relative(k, b.x, b.z);
      if (r.ahead < 6 || r.ahead > 45) continue;
      const nb = nearest(b.x, b.z, k.trackIndex);
      if (Math.abs(nb.lateral - lane) > 9) continue;
      if (r.ahead < best) {
        best = r.ahead;
        lane = nb.lateral;
      }
    }
  }
  lane = Math.max(-13, Math.min(13, lane));

  const target = pointAt(k.progress + look, lane);
  const desired = Math.atan2(target.x - k.x, target.z - k.z);
  const err = wrapAngle(desired - k.heading);
  const steer = Math.max(-1, Math.min(1, err * 3.2));
  if (steer > 0.08) c.left = true;
  if (steer < -0.08) c.right = true;
  // Analog-ish steering through press modulation on gentle corrections.
  if (Math.abs(steer) < 0.35 && Math.floor(race.elapsed * 30 + k.index) % 3 === 0) {
    c.left = false;
    c.right = false;
  }
  c.throttle = true;

  // Unstick: back out of walls; if progress stalls anyway, let Lakitu help.
  if (k.progress > k.ai.best + 6) {
    k.ai.best = k.progress;
    k.ai.stall = 0;
  } else if (!isStunned(k) && k.burnout <= 0) k.ai.stall += STEP;
  if (Math.abs(k.speed) < 4 && !isStunned(k) && k.burnout <= 0) k.ai.stuck += STEP;
  else k.ai.stuck = Math.max(0, k.ai.stuck - STEP * 2);
  if (k.ai.stuck > 0.8 && k.ai.reverse <= 0) {
    k.ai.reverse = 0.8;
    k.ai.stuck = 0;
  }
  if (k.ai.stall > 3.5) {
    k.ai.stall = 0;
    k.ai.stuck = 0;
    k.ai.reverse = 0;
    k.respawn = 1.4;
    return c;
  }
  if (k.ai.reverse > 0) {
    k.ai.reverse -= STEP;
    return { ...EMPTY_CONTROLS, brake: true, left: err < 0, right: err > 0 };
  }

  // Corner speed: lift or brake when the bend ahead is tighter than the kart
  // can hold, or when the current heading would carry it off the course.
  const limit =
    Math.sqrt(150 / Math.max(0.0035, Math.abs(sharpest))) * (k.driftDir === 0 ? 1 : 1.12);
  const projected = pointAt(k.progress + look * 0.6, here + Math.sin(-err) * look * 0.6);
  const headingOff = !isCourseSurface(surfaceAt(race.surface, projected.x, projected.z));
  if (k.boost <= 0 && k.star <= 0) {
    if (speed > limit * 1.18 || (headingOff && Math.abs(err) > 0.45 && speed > 30)) {
      c.throttle = false;
      c.brake = speed > limit * 1.3;
    } else if (speed > limit) c.throttle = false;
  }
  if (Math.abs(err) > 1.6) {
    c.throttle = false;
    c.brake = k.speed > 15;
  }

  // Drift into bends in the bend's direction for mini-turbos; release once
  // the orange spark is ready on the exit or if the drift is carrying it wide.
  const bend = Math.abs(curve) + Math.abs(curveFar);
  const bendDir = Math.sign(curve + curveFar);
  const wide = !laneClear(race, k.progress + 8, here - k.driftDir * 4);
  c.drift =
    k.driftDir === 0
      ? bend > 0.011 &&
        speed > s.top * 0.6 &&
        k.grounded &&
        Math.sign(steer) === bendDir &&
        Math.abs(steer) > 0.25 &&
        !headingOff
      : k.driftDir === bendDir &&
        !wide &&
        bend > 0.005 &&
        !(k.driftStage === 2 && Math.abs(curve) < 0.007);

  // Items.
  if (k.item && k.roulette <= 0 && k.itemCooldown <= 0) {
    k.ai.itemTimer -= STEP;
    const inSights = (o: Kart, range: number, cone: number) => {
      const r = relative(k, o.x, o.z);
      return r.ahead > 3 && r.ahead < range && Math.abs(Math.atan2(r.side, r.ahead)) < cone;
    };
    const rivals = race.karts.filter((o) => o !== k && o.respawn <= 0 && o.finishedAt === null);
    const ahead =
      (inSights(player, 60, 0.14) && player !== k ? player : undefined) ??
      rivals.find((o) => inSights(o, 50, 0.1));
    const behind = rivals.find((o) => o.progress < k.progress && k.progress - o.progress < 22);
    const playerBehind =
      player !== k && player.progress < k.progress && k.progress - player.progress < 30;
    const playerAhead =
      player !== k && player.progress > k.progress && player.progress - k.progress < 140;
    const straight = Math.abs(curve) < 0.004 && Math.abs(curveFar) < 0.004;
    const offroadAhead = !laneClear(race, k.progress + 25, here);
    let use = false;
    let hold = false;
    switch (k.item) {
      case 'mushroom':
      case 'triple-mushroom':
      case 'golden-mushroom': {
        hold = k.item === 'triple-mushroom' && threat;
        use =
          (k.ai.itemTimer <= 0 &&
            (straight || offroadAhead || playerAhead || (k.boost <= 0 && k.speed < s.top * 0.7))) ||
          k.ai.itemTimer < -4;
        break;
      }
      case 'banana':
      case 'triple-banana': {
        // Trail it as a shield, drop it in the human's path.
        hold = true;
        use =
          (playerBehind && k.ai.itemTimer <= 0) ||
          (Boolean(behind) && k.ai.itemTimer < -2) ||
          k.ai.itemTimer < -12;
        break;
      }
      case 'green-shell':
      case 'triple-green-shell': {
        hold = true;
        use = Boolean(ahead) || (playerBehind && k.ai.itemTimer < -1) || k.ai.itemTimer < -14;
        break;
      }
      case 'red-shell': {
        // Fire when the human is the next kart up the road; otherwise keep it trailing as a shield.
        const nextUp = rivals
          .filter((o) => o.progress > k.progress)
          .sort((a, b) => a.progress - b.progress)[0];
        use =
          k.ai.itemTimer <= 0 &&
          k.place > 1 &&
          (nextUp === player || playerAhead || k.ai.itemTimer < -6);
        hold = !use;
        break;
      }
      case 'bobomb': {
        use = Boolean(ahead) || (playerBehind && k.ai.itemTimer < -1) || k.ai.itemTimer < -6;
        break;
      }
      case 'star': {
        use = threat || k.ai.itemTimer <= 0;
        break;
      }
      case 'lightning': {
        use = k.ai.itemTimer <= 0 && (k.place > 2 || playerAhead);
        break;
      }
    }
    // Hold to trail, release to use; triple items fire one per press.
    if (TRAILABLE.includes(k.item)) c.item = use ? !k.trailing : hold;
    else c.item = use && !k.itemHeld;
    if (use && !ahead && (playerBehind || behind) && k.item.includes('green')) c.brake = true;
  }
  return c;
}

function stepKart(race: Race, k: Kart, input: Controls, dt: number) {
  const s = stats(k, race);
  k.bumpCooldown = Math.max(0, k.bumpCooldown - dt);
  k.invulnerable = Math.max(0, k.invulnerable - dt);
  k.itemCooldown = Math.max(0, k.itemCooldown - dt);
  k.wallHit = Math.max(0, k.wallHit - dt);
  k.star = Math.max(0, k.star - dt);
  if (k.golden > 0) {
    k.golden = Math.max(0, k.golden - dt);
    if (k.golden === 0 && k.item === 'golden-mushroom') {
      k.item = null;
      k.itemCount = 0;
    }
  }
  k.shrink = Math.max(0, k.shrink - dt);
  k.burnout = Math.max(0, k.burnout - dt);
  const finished = k.finishedAt !== null;

  if (k.respawn > 0) {
    k.respawn -= dt;
    if (k.respawn <= 0) respawnKart(race, k);
    return;
  }

  // Item roulette and use.
  if (k.roulette > 0) {
    k.roulette -= dt;
    if (k.roulette <= 0) {
      k.item = pickItem(race, k);
      k.itemCount = COUNTS[k.item] ?? 1;
      if (k.item === 'golden-mushroom') k.itemCount = 1;
      k.ai.itemTimer = 0.8 + rng(race) * 2.2;
      race.events.push({ type: 'item-ready', kart: k.index, value: ITEMS.indexOf(k.item) });
    }
  }
  if (k.item && k.roulette <= 0 && !finished) {
    const trailable = TRAILABLE.includes(k.item);
    if (input.item && !k.itemHeld && k.itemCooldown <= 0) {
      if (trailable && !isStunned(k)) k.trailing = true;
      else if (!isStunned(k)) useItem(race, k, input.brake);
    } else if (!input.item && k.itemHeld && k.trailing) {
      useItem(race, k, input.brake);
    }
  }
  k.itemHeld = input.item;

  // Steering smoothing gives the analogue feel of a stick.
  const target = (input.left ? 1 : 0) - (input.right ? 1 : 0);
  k.steer += (target - k.steer) * Math.min(1, dt * (target === 0 ? 9 : 6));

  const stunned = isStunned(k);
  if (k.spin > 0) k.spin = Math.max(0, k.spin - dt);
  if (k.tumble > 0) k.tumble = Math.max(0, k.tumble - dt);

  // Surface response.
  const surf = surfaceAt(race.surface, k.x, k.z);
  k.surface = surf;
  const immune = k.star > 0 || k.boost > 0;
  let grip = 1;
  let maxSpeed = s.top;
  if (surf === SURFACE.offroad && !immune) {
    maxSpeed *= s.offroad;
    grip = 0.85;
  } else if (surf === SURFACE.sand && !immune) {
    maxSpeed *= s.offroad * 0.9;
    grip = 0.8;
  } else if (surf === SURFACE.curb) maxSpeed *= 0.97;
  if (k.shrink > 0) maxSpeed *= 0.68;
  if (k.star > 0) maxSpeed = Math.max(maxSpeed, s.top * 1.22);
  if (k.boost > 0) {
    k.boost = Math.max(0, k.boost - dt);
    maxSpeed = Math.max(maxSpeed, s.top * k.boostPower);
    if (k.boost <= 0) k.boostPower = 1;
  }
  if (finished) maxSpeed *= 0.7;

  // Longitudinal dynamics.
  const throttle = input.throttle && !stunned && k.burnout <= 0;
  if (k.boost > 0 && !stunned) {
    k.speed += (maxSpeed - k.speed) * Math.min(1, dt * 6);
  } else if (throttle && !input.brake) {
    if (k.speed < 0) k.speed = Math.min(0, k.speed + 70 * dt);
    else if (k.speed < maxSpeed)
      k.speed = Math.min(maxSpeed, k.speed + s.accel * dt * (1.15 - 0.75 * (k.speed / maxSpeed)));
    else k.speed = Math.max(maxSpeed, k.speed - 42 * dt);
  } else if (input.brake && !stunned) {
    k.speed =
      k.speed > 0
        ? Math.max(0, k.speed - (input.throttle ? 22 : 75) * dt)
        : Math.max(-18, k.speed - 24 * dt);
  } else {
    const drag = stunned ? 55 : 16;
    k.speed = k.speed > 0 ? Math.max(0, k.speed - drag * dt) : Math.min(0, k.speed + drag * dt);
    if (k.speed > maxSpeed) k.speed = Math.max(maxSpeed, k.speed - 42 * dt);
  }

  // Drifting: hop, then slide; steering tightens or widens the arc.
  const driftHeld = input.drift && !stunned;
  if (driftHeld && k.grounded && k.hop <= 0 && k.driftDir === 0 && !k.driftArmed && k.speed > 10) {
    k.hop = 0.22;
    k.vy = 7.5;
    k.grounded = false;
    k.driftArmed = true;
  }
  if (!driftHeld) k.driftArmed = false;
  if (k.hop > 0) k.hop -= dt;
  // A hop started below drift speed stays armed while held. Otherwise the player
  // can accelerate through the threshold but never start drifting until re-pressing.
  if (
    driftHeld &&
    (k.hop > 0 || (k.driftArmed && k.grounded)) &&
    Math.abs(k.steer) > 0.3 &&
    k.driftDir === 0 &&
    k.speed > 22
  )
    k.driftDir = k.steer > 0 ? 1 : -1;
  if (k.driftDir !== 0) {
    if (!driftHeld || k.speed < 18 || stunned || surf === SURFACE.water) {
      // Release: mini-turbo.
      if (!stunned && !driftHeld && k.driftStage > 0 && k.speed >= 18 && surf !== SURFACE.water) {
        const stage = k.driftStage;
        giveBoost(k, stage === 2 ? 1.25 : 0.7, stage === 2 ? 1.3 : 1.22);
        race.events.push({ type: 'mini-turbo', kart: k.index, value: stage });
      }
      k.driftDir = 0;
      k.driftCharge = 0;
      k.driftStage = 0;
    } else {
      const inward = k.steer * k.driftDir;
      k.driftCharge += dt * s.drift * (inward > 0.3 ? 1.35 : inward < -0.3 ? 0.55 : 1);
      if (k.driftCharge > 2.1) k.driftStage = 2;
      else if (k.driftCharge > 1.15) k.driftStage = 1;
    }
  }

  // Yaw.
  const speedFactor =
    Math.min(1, Math.abs(k.speed) / 16) * (1 - 0.28 * Math.min(1, Math.abs(k.speed) / s.top));
  let yaw =
    k.driftDir === 0
      ? k.steer * s.handling * speedFactor * Math.sign(k.speed || 1) * (k.grounded ? 1 : 0.6)
      : // Keep the same speed-dependent steering envelope as normal driving.
        k.driftDir * s.handling * (0.55 + 0.45 * k.steer * k.driftDir) * speedFactor;
  if (k.spin > 0) yaw = 0;
  if (k.tumble > 0) yaw *= 0.2;
  yaw *= grip;
  k.heading = wrapAngle(k.heading + yaw * dt);

  // Lateral slide: drifting slides out of the turn, then grip recovers.
  if (k.driftDir === 0) {
    k.slip *= Math.max(0, 1 - dt * 5);
  } else {
    k.slip += (-k.driftDir * k.speed * 0.16 - k.slip) * Math.min(1, dt * 4);
  }

  // Slipstream behind other racers.
  if (!stunned && k.speed > s.top * 0.75 && k.boost <= 0) {
    const drafting = race.karts.some((o) => {
      if (o === k) return false;
      const dx = o.x - k.x;
      const dz = o.z - k.z;
      const d = Math.hypot(dx, dz);
      if (d > 26 || d < 4) return false;
      return Math.abs(wrapAngle(Math.atan2(dx, dz) - k.heading)) < 0.16;
    });
    k.draft = drafting ? k.draft + dt : Math.max(0, k.draft - dt * 2);
    if (k.draft > 1.35) {
      giveBoost(k, 1, 1.24);
      k.draft = 0;
      race.events.push({ type: 'boost', kart: k.index });
    }
  } else k.draft = Math.max(0, k.draft - dt * 2);

  // Integrate position with wall collisions.
  const fx = Math.sin(k.heading);
  const fz = Math.cos(k.heading);
  const lx = fz;
  const lz = -fx;
  let vx = fx * k.speed + lx * k.slip;
  let vz = fz * k.speed + lz * k.slip;
  const r = s.radius * (k.shrink > 0 ? 0.6 : 1);
  let nx = k.x + vx * dt;
  let nz = k.z + vz * dt;
  const n = wallNormal(race, k, nx, nz, r);
  if (n) {
    const vn = vx * n.nx + vz * n.nz;
    if (vn < 0) {
      const impact = -vn;
      vx -= 1.35 * vn * n.nx;
      vz -= 1.35 * vn * n.nz;
      const forward = vx * fx + vz * fz;
      k.speed = forward * (impact > 20 ? 0.62 : 0.9);
      k.slip = (vx * lx + vz * lz) * 0.5;
      if (impact > 14 && k.wallHit <= 0) {
        k.wallHit = 0.35;
        race.events.push({ type: 'wall', kart: k.index, value: impact });
        if (impact > 30 && k.driftDir !== 0) {
          k.driftDir = 0;
          k.driftCharge = 0;
          k.driftStage = 0;
        }
      }
    }
    nx = k.x + vx * dt + n.nx * 0.35;
    nz = k.z + vz * dt + n.nz * 0.35;
    // If still embedded, step out along the normal.
    for (let i = 0; i < 6 && wallNormal(race, k, nx, nz, r); i++) {
      nx += n.nx * 0.4;
      nz += n.nz * 0.4;
    }
    if (blocked(race, k, nx, nz)) {
      nx = k.x;
      nz = k.z;
      k.speed *= 0.5;
    }
  }
  k.x = nx;
  k.z = nz;
  k.wheelTurn += (k.speed * dt) / 0.9;

  // Vertical: follow terrain, fall off edges, splash into water.
  const floor = heightAt(race.surface, k.x, k.z);
  if (k.grounded) {
    if (floor < k.y - 1.2) {
      k.grounded = false;
      k.vy = 0;
    } else k.y = floor;
  }
  if (!k.grounded) {
    k.vy -= 46 * dt;
    k.y += k.vy * dt;
    if (k.y <= floor) {
      k.y = floor;
      k.vy = 0;
      k.grounded = true;
      if (k.hop > -1 && driftHeld && k.driftDir === 0 && Math.abs(k.steer) > 0.3 && k.speed > 22)
        k.driftDir = k.steer > 0 ? 1 : -1;
    }
  }
  const landedSurface = surfaceAt(race.surface, k.x, k.z);
  const onPanel = landedSurface === SURFACE.boost && k.grounded;
  if (onPanel && !k.boostPanelContact && !stunned && !finished) {
    giveBoost(k, 1, 1.35);
    race.events.push({ type: 'boost', kart: k.index });
  }
  k.boostPanelContact = onPanel;
  if (landedSurface === SURFACE.water && k.grounded) {
    k.respawn = 1.8;
    k.trailing = false;
    k.driftDir = 0;
    k.driftCharge = 0;
    k.driftStage = 0;
    k.boost = 0;
    race.events.push({ type: 'hit', kart: k.index, value: -2 });
  }

  // Progress along the course (clamped so shortcuts through walls cannot teleport laps).
  const near = nearest(k.x, k.z, k.trackIndex);
  k.trackIndex = near.index;
  k.lateral = near.lateral;
  const cur = mod(k.progress, TRACK_LENGTH);
  let delta = near.distance - cur;
  if (delta > TRACK_LENGTH / 2) delta -= TRACK_LENGTH;
  if (delta < -TRACK_LENGTH / 2) delta += TRACK_LENGTH;
  const maxStep = Math.abs(k.speed) * dt * 1.6 + 1.2;
  delta = Math.max(-maxStep, Math.min(maxStep, delta));
  const before = k.progress;
  k.progress += delta;
  // Wrong way detection.
  const along = (vx * near.tx + vz * near.tz) / Math.max(1, Math.hypot(vx, vz));
  k.wrongWay =
    along < -0.5 && Math.abs(k.speed) > 6 ? k.wrongWay + dt : Math.max(0, k.wrongWay - dt * 3);
  // Laps.
  const lapBefore = Math.floor(before / TRACK_LENGTH);
  const lapAfter = Math.floor(k.progress / TRACK_LENGTH);
  if (lapAfter > lapBefore && lapAfter > k.lapTimes.length && k.finishedAt === null) {
    const prev = k.lapTimes.reduce((a, b) => a + b, 0);
    k.lapTimes.push(race.elapsed - prev);
    if (lapAfter >= LAPS) {
      k.finishedAt = race.elapsed;
      k.progress = LAPS * TRACK_LENGTH;
      race.events.push({ type: 'finish', kart: k.index });
    } else
      race.events.push({
        type: lapAfter === LAPS - 1 ? 'final-lap' : 'lap',
        kart: k.index,
        value: lapAfter + 1,
      });
  }
  if (k.finishedAt !== null) k.progress = Math.max(k.progress, LAPS * TRACK_LENGTH);
}

function stepProjectiles(race: Race, dt: number) {
  const keep: Projectile[] = [];
  for (const p of race.projectiles) {
    p.age += dt;
    let alive = p.age < p.life;
    if (p.kind === 'green-shell' || p.kind === 'red-shell') {
      if (p.kind === 'red-shell' && p.target >= 0) {
        const t = race.karts[p.target];
        // Follow the course, then lock on when close.
        const near = nearest(p.x, p.z, p.trackIndex);
        p.trackIndex = near.index;
        const close = Math.hypot(t.x - p.x, t.z - p.z) < 45;
        const aim = close ? { x: t.x, z: t.z } : pointAt(near.distance + 18, 0);
        const sp = Math.hypot(p.vx, p.vz);
        const want = Math.atan2(aim.x - p.x, aim.z - p.z);
        const cur = Math.atan2(p.vx, p.vz);
        const turn = Math.max(-5 * dt, Math.min(5 * dt, wrapAngle(want - cur)));
        p.vx = Math.sin(cur + turn) * sp;
        p.vz = Math.cos(cur + turn) * sp;
        if (t.finishedAt !== null || t.respawn > 0) p.target = -1;
      }
      const nx = p.x + p.vx * dt;
      const nz = p.z + p.vz * dt;
      const n = wallNormal(race, p, nx, nz, 1);
      if (n) {
        const vn = p.vx * n.nx + p.vz * n.nz;
        if (vn < 0) {
          p.vx -= 2 * vn * n.nx;
          p.vz -= 2 * vn * n.nz;
        }
        p.bounces++;
        if (p.kind === 'red-shell' || p.bounces > 7) alive = false;
        else {
          p.x += n.nx * 0.5;
          p.z += n.nz * 0.5;
        }
      } else {
        p.x = nx;
        p.z = nz;
      }
      p.y = heightAt(race.surface, p.x, p.z);
      if (surfaceAt(race.surface, p.x, p.z) === SURFACE.water) alive = false;
    } else if (p.kind === 'bobomb') {
      if (p.grounded) {
        p.x += p.vx * dt;
        p.z += p.vz * dt;
        p.vx *= Math.max(0, 1 - dt * 3);
        p.vz *= Math.max(0, 1 - dt * 3);
        p.y = heightAt(race.surface, p.x, p.z);
        p.fuse -= dt;
        if (p.fuse <= 0) {
          explode(race, p);
          alive = false;
        }
      } else {
        p.vy -= 46 * dt;
        p.x += p.vx * dt;
        p.z += p.vz * dt;
        p.y += p.vy * dt;
        const floor = heightAt(race.surface, p.x, p.z);
        if (p.y <= floor || wallNormal(race, p, p.x, p.z, 0.8)) {
          p.y = floor;
          p.grounded = true;
          p.vx *= 0.25;
          p.vz *= 0.25;
        }
      }
    }
    // Collisions with karts.
    if (alive)
      for (const k of race.karts) {
        if (k.respawn > 0) continue;
        if (k.index === p.owner && p.age < (p.kind === 'banana' ? 0.6 : 0.45)) continue;
        const r =
          stats(k, race).radius * (k.shrink > 0 ? 0.6 : 1) + (p.kind === 'banana' ? 1 : 1.2);
        if (Math.abs(k.x - p.x) > r || Math.abs(k.z - p.z) > r) continue;
        if (Math.hypot(k.x - p.x, k.z - p.z) > r || Math.abs(k.y - p.y) > 3.5) continue;
        if (p.kind === 'bobomb') {
          explode(race, p);
          alive = false;
          break;
        }
        // A trailing item blocks hits from behind.
        const fromBehind = Math.cos(wrapAngle(Math.atan2(p.x - k.x, p.z - k.z) - k.heading)) < -0.2;
        if (k.trailing && fromBehind) {
          dropTrailing(k);
          alive = false;
          break;
        }
        if (k.star > 0) {
          alive = false;
          break;
        }
        hitKart(race, k, p.kind === 'banana' ? 'spin' : 'tumble', p.owner);
        alive = false;
        break;
      }
    // Projectiles destroy each other.
    if (alive)
      for (const q of keep) {
        if (Math.hypot(q.x - p.x, q.z - p.z) < 2.2) {
          if (q.kind === 'bobomb' || p.kind === 'bobomb')
            explode(race, q.kind === 'bobomb' ? q : p);
          q.life = 0;
          alive = false;
          break;
        }
      }
    if (alive) keep.push(p);
  }
  race.projectiles = keep.filter((p) => p.life > 0 && p.age < p.life);
}
function explode(race: Race, p: Projectile) {
  race.explosions.push({ id: race.nextId++, x: p.x, y: p.y, z: p.z, age: 0 });
  race.events.push({ type: 'explosion', kart: p.owner });
  for (const k of race.karts)
    if (Math.hypot(k.x - p.x, k.z - p.z) < 15 && Math.abs(k.y - p.y) < 8)
      hitKart(race, k, 'tumble', p.owner);
}

function kartContacts(race: Race) {
  const ks = race.karts;
  for (let i = 0; i < ks.length; i++)
    for (let j = i + 1; j < ks.length; j++) {
      const a = ks[i];
      const b = ks[j];
      if (a.respawn > 0 || b.respawn > 0) continue;
      const sa = stats(a, race);
      const sb = stats(b, race);
      const ra = sa.radius * (a.shrink > 0 ? 0.6 : 1);
      const rb = sb.radius * (b.shrink > 0 ? 0.6 : 1);
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const d = Math.hypot(dx, dz);
      if (d >= ra + rb || d < 1e-6 || Math.abs(a.y - b.y) > 4) continue;
      const nx = dx / d;
      const nz = dz / d;
      const overlap = ra + rb - d;
      const ma = sa.mass * (a.star > 0 ? 6 : 1) * (a.shrink > 0 ? 0.3 : 1);
      const mb = sb.mass * (b.star > 0 ? 6 : 1) * (b.shrink > 0 ? 0.3 : 1);
      const wa = mb / (ma + mb);
      const wb = ma / (ma + mb);
      a.x -= nx * overlap * wa;
      a.z -= nz * overlap * wa;
      b.x += nx * overlap * wb;
      b.z += nz * overlap * wb;
      if (a.bumpCooldown <= 0 && b.bumpCooldown <= 0) {
        // Bump: lighter karts get shoved sideways.
        a.slip -= (nx * Math.cos(a.heading) - nz * Math.sin(a.heading)) * 10 * wa;
        b.slip += (nx * Math.cos(b.heading) - nz * Math.sin(b.heading)) * 10 * wb;
        a.speed *= 1 - 0.18 * wa;
        b.speed *= 1 - 0.18 * wb;
        a.bumpCooldown = 0.35;
        b.bumpCooldown = 0.35;
        if (a.star > 0 && b.star <= 0) hitKart(race, b, 'tumble', a.index);
        else if (b.star > 0 && a.star <= 0) hitKart(race, a, 'tumble', b.index);
        else if (a.shrink > 0 && b.shrink <= 0) hitKart(race, a, 'spin', b.index);
        else if (b.shrink > 0 && a.shrink <= 0) hitKart(race, b, 'spin', a.index);
      }
    }
}

function rank(race: Race) {
  const order = [...race.karts].sort((a, b) => {
    if (a.finishedAt !== null && b.finishedAt !== null) return a.finishedAt - b.finishedAt;
    if (a.finishedAt !== null) return -1;
    if (b.finishedAt !== null) return 1;
    return b.progress - a.progress;
  });
  order.forEach((k, i) => {
    k.place = i + 1;
  });
  race.place = race.player.place;
}

export function stepRace(race: Race, input: Controls, seconds: number) {
  if (!Number.isFinite(seconds)) return;
  if (race.phase !== 'racing' && race.phase !== 'countdown' && race.phase !== 'finished') return;
  const dt = Math.max(0, Math.min(seconds, 1 / 30));
  if (race.phase === 'countdown') {
    const before = Math.ceil(race.countdown);
    race.countdown = Math.max(0, race.countdown - dt);
    const after = Math.ceil(race.countdown);
    // Start boost: press accelerate just after "2" appears; pressing during "3" burns out.
    for (const k of race.karts) {
      const pressing = k.human
        ? input.throttle
        : race.countdown < 1.55 - (k.index % 4) * 0.12 && k.ai.skill > 0.96;
      if (pressing && k.startCharge === null) k.startCharge = race.countdown;
      if (!pressing) k.startCharge = null;
    }
    if (after !== before && after > 0)
      race.events.push({ type: 'countdown', kart: race.player.index, value: after });
    if (race.countdown <= 0) {
      race.phase = 'racing';
      race.events.push({ type: 'go', kart: race.player.index });
      for (const k of race.karts) {
        if (k.startCharge === null) continue;
        if (k.startCharge > 2) {
          k.burnout = 1;
          race.events.push({ type: 'burnout', kart: k.index });
        } else if (k.startCharge <= 1.75 && k.startCharge >= 0.9) {
          giveBoost(k, 1.4, 1.3);
          k.speed = stats(k, race).top;
          race.events.push({ type: 'rocket-start', kart: k.index });
        }
      }
    }
    return;
  }
  race.elapsed += dt;
  race.lightning = Math.max(0, race.lightning - dt);
  for (const b of race.boxes) b.respawn = Math.max(0, b.respawn - dt);
  for (const e of race.explosions) e.age += dt;
  race.explosions = race.explosions.filter((e) => e.age < 1.2);
  for (const k of race.karts) {
    const controls = k.human && k.finishedAt === null ? input : aiControls(race, k);
    stepKart(race, k, controls, dt);
    // Item boxes.
    if (k.respawn <= 0)
      for (const b of race.boxes) {
        if (b.respawn > 0) continue;
        if (Math.abs(b.x - k.x) > 4 || Math.abs(b.z - k.z) > 4) continue;
        if (Math.hypot(b.x - k.x, b.z - k.z) > 4 || Math.abs(b.y - 2.2 - k.y) > 4) continue;
        b.respawn = 1.4;
        race.events.push({ type: 'item-box', kart: k.index });
        if (!k.item && k.roulette <= 0 && k.finishedAt === null) k.roulette = 1.7;
      }
  }
  stepProjectiles(race, dt);
  kartContacts(race);
  rank(race);
  if (race.player.finishedAt !== null && race.phase === 'racing') race.phase = 'finished';
}

/** Estimated finish time for racers still on course when the human finishes. */
export function projectedFinish(race: Race, k: Kart) {
  if (k.finishedAt !== null) return k.finishedAt;
  const remaining = Math.max(0, LAPS * TRACK_LENGTH - k.progress);
  const pace = Math.max(20, stats(k, race).top * 0.86);
  return race.elapsed + remaining / pace;
}
export function standings(race: Race) {
  return [...race.karts]
    .map((k) => ({ kart: k, time: projectedFinish(race, k) }))
    .sort((a, b) =>
      a.kart.finishedAt !== null || b.kart.finishedAt !== null || race.phase === 'finished'
        ? a.time - b.time
        : a.kart.place - b.kart.place,
    );
}

export function raceText(race: Race) {
  const p = race.player;
  return JSON.stringify({
    phase: race.phase,
    coordinateSystem: 'Y up; course X/Z; heading 0 faces +Z; progress along closed track',
    player: {
      character: p.character,
      x: Number(p.x.toFixed(2)),
      y: Number(p.y.toFixed(2)),
      z: Number(p.z.toFixed(2)),
      heading: Number(p.heading.toFixed(3)),
      speed: Number(p.speed.toFixed(2)),
      progress: Number(p.progress.toFixed(1)),
      lateral: Number(p.lateral.toFixed(1)),
      surface: p.surface,
      drift: p.driftDir,
      driftStage: p.driftStage,
      boost: Number(p.boost.toFixed(2)),
      item: p.item,
      itemCount: p.itemCount,
      roulette: p.roulette > 0,
      star: p.star > 0,
      shrink: p.shrink > 0,
      wrongWay: p.wrongWay > 1,
    },
    lap: lap(race),
    laps: LAPS,
    place: race.place,
    elapsed: race.elapsed,
    countdown: race.countdown,
    projectiles: race.projectiles.map((q) => q.kind),
    opponents: race.karts
      .filter((k) => !k.human)
      .map((k) => ({ character: k.character, place: k.place, progress: Math.round(k.progress) })),
  });
}
