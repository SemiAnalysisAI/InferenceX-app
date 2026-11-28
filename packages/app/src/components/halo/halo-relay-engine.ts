export const WIDTH = 720;
export const HEIGHT = 340;
export const BATCHES = [1, 8, 32, 64] as const;
export const PRECISIONS = ['FP4', 'FP8', 'BF16'] as const;
const precisionModel = [
  { ttft: -68, kv: 1 },
  { ttft: 0, kv: 2 },
  { ttft: 72, kv: 4 },
] as const;
export type Mode = 'campaign' | 'endless' | 'sandbox';
export type Cue = 'relay' | 'collect' | 'hazard' | 'win';
interface Vec {
  x: number;
  y: number;
}
interface Block extends Vec {
  w: number;
  h: number;
}
type Packet = Vec & { kind: 'token' | 'cache' | 'coolant' };
export interface Controls extends Vec {
  target?: Vec;
}

export const CHAPTERS = [
  {
    name: 'Silent Cartographer',
    zh: '寂静制图师',
    rule: 'Stabilize the relay by picking up token shards and delivering batches.',
    zhRule: '收集令牌碎片并在中继点提交批次，稳定中继。',
    color: '#69e6ff',
    quota: 8,
    seconds: 110,
    heat: 0.32,
    drift: 0,
    speed: 52,
    blocks: [{ x: 336, y: 113, w: 48, h: 114 }],
  },
  {
    name: 'Reach Outpost',
    zh: '致远星哨站',
    rule: 'Crosswinds pull your skiff sideways. Coolant counts more in this sector.',
    zhRule: '侧风会改变航向，冷却剂在本区更有效。',
    color: '#ffc88c',
    quota: 12,
    seconds: 125,
    heat: 0.6,
    drift: 24,
    speed: 74,
    blocks: [
      { x: 275, y: 30, w: 21, h: 190 },
      { x: 450, y: 120, w: 24, h: 195 },
    ],
  },
  {
    name: 'Cortana’s Cache',
    zh: '科塔娜的缓存',
    rule: 'Cache cores cut first-token delay. A cache core is required for delivery.',
    zhRule: '缓存核心缩短首词元延迟。每次提交都需要缓存核心。',
    color: '#b6adff',
    quota: 14,
    seconds: 140,
    heat: 0.6,
    drift: 0,
    speed: 83,
    blocks: [
      { x: 304, y: 92, w: 116, h: 32 },
      { x: 304, y: 218, w: 116, h: 32 },
    ],
  },
  {
    name: 'Flood Quarantine',
    zh: '洪魔隔离区',
    rule: 'Heat climbs quickly, and anomalies pursue nearby skiffs. Keep batches compact.',
    zhRule: '温度上升更快，异常体会追踪附近的飞船。请缩小批次。',
    color: '#c1ed91',
    quota: 18,
    seconds: 155,
    heat: 0.95,
    drift: 11,
    speed: 99,
    blocks: [
      { x: 260, y: 52, w: 36, h: 140 },
      { x: 420, y: 150, w: 38, h: 140 },
    ],
  },
  {
    name: 'The Great Journey',
    zh: '伟大旅程',
    rule: 'Seal the Warden: relay at most 8 shards at a time, alternate sides, and dodge its pulses.',
    zhRule: '封印守卫：每次最多提交 8 枚碎片，交替抵达两侧并躲避脉冲。',
    color: '#ffb3df',
    quota: 24,
    seconds: 170,
    heat: 1.02,
    drift: 34,
    speed: 105,
    blocks: [
      { x: 225, y: 48, w: 52, h: 82 },
      { x: 358, y: 130, w: 28, h: 92 },
      { x: 494, y: 210, w: 55, h: 90 },
    ],
  },
];

export interface Attempt {
  mode: Mode;
  chapter: number;
  wave: number;
  time: number;
  score: number;
  quota: number;
  delivered: number;
  batch: number;
  precision: number;
  cargo: number;
  cache: number;
  heat: number;
  shield: number;
  energy: number;
  efficiency: number;
  firstToken: number;
  kvCost: number;
  interactivity: number;
  boss: { phase: number; pulse: number; radius: number };
  ship: Vec;
  velocity: Vec;
  packets: Packet[];
  sentinels: Vec[];
  relay: Vec;
  flip: boolean;
  flash: number;
  hitDelay: number;
  rechargeDelay: number;
  escape: boolean;
  upgrades: [number, number, number];
  ended: 'clear' | 'lost' | null;
  notice: 'cache' | 'empty' | 'heat' | 'bank' | 'escape' | 'blocked' | null;
}

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
const near = (a: Vec, b: Vec, radius: number) => Math.hypot(a.x - b.x, a.y - b.y) < radius;
const blocksPoint = (block: Block, p: Vec, pad = 10) =>
  p.x > block.x - pad &&
  p.x < block.x + block.w + pad &&
  p.y > block.y - pad &&
  p.y < block.y + block.h + pad;

function spawn(chapter: number, kind: Packet['kind']): Packet {
  for (let i = 0; i < 30; i++) {
    const cell = { x: 100 + Math.random() * 494, y: 37 + Math.random() * 260 };
    if (!CHAPTERS[chapter].blocks.some((block) => blocksPoint(block, cell, 19))) {
      return { ...cell, kind };
    }
  }
  return { x: 200, y: 85, kind };
}

export function createAttempt(mode: Mode, chapter: number, wave = 1, carry?: Attempt): Attempt {
  return {
    mode,
    chapter,
    wave,
    time: CHAPTERS[chapter].seconds,
    score: carry?.score ?? 0,
    quota: CHAPTERS[chapter].quota + (mode === 'endless' ? 2 * (wave - 1) : 0),
    delivered: 0,
    batch: carry?.batch ?? 1,
    precision: carry?.precision ?? 1,
    cargo: 0,
    cache: 0,
    heat: 0,
    shield: 100,
    energy: carry?.energy ?? 0,
    efficiency: 0,
    firstToken: 0,
    kvCost: 0,
    interactivity: 0,
    boss: { phase: 1, pulse: 0, radius: 0 },
    ship: { x: 58, y: 170 },
    velocity: { x: 0, y: 0 },
    packets: [
      { x: 122, y: 173, kind: 'token' },
      { x: 142, y: 115, kind: 'token' },
      ...(chapter === 0
        ? ([
            { x: 174, y: 90, kind: 'token' },
            { x: 212, y: 84, kind: 'token' },
            { x: 192, y: 86, kind: 'cache' },
          ] as const)
        : chapter === 4
          ? ([78, 112, 146, 180].map((x) => ({ x, y: 170, kind: 'token' })) as Packet[])
          : []),
      { x: 160, y: 210, kind: 'cache' },
      { x: 205, y: 140, kind: 'coolant' },
      ...Array.from({ length: 12 }, (_, i) =>
        spawn(chapter, i % 6 === 4 ? 'cache' : i % 6 === 5 ? 'coolant' : 'token'),
      ),
    ],
    sentinels: Array.from({ length: 2 + Math.min(4, chapter + Math.floor(wave / 3)) }, (_, i) => ({
      x: 265 + i * 72,
      y: i % 2 === 0 ? 75 : 280,
    })),
    relay: { x: 655, y: 172 },
    flip: false,
    flash: 0,
    hitDelay: 0,
    rechargeDelay: 0,
    escape: false,
    upgrades: carry?.upgrades ?? [0, 0, 0],
    ended: null,
    notice: null,
  };
}

export const restartStage = (mode: Mode, chapter: number) => (mode === 'endless' ? 0 : chapter);
export const inTransmitRange = (run: Attempt) => near(run.ship, run.relay, 47);

export const upgradeCost = (run: Attempt, kind: 0 | 1 | 2) =>
  run.mode === 'sandbox' ? 0 : 5 + run.upgrades[kind] * 4;

export function upgrade(run: Attempt, kind: 0 | 1 | 2) {
  const cost = upgradeCost(run, kind);
  if (run.upgrades[kind] >= 3 || run.energy < cost || run.ended === 'lost') return false;
  run.energy -= cost;
  run.upgrades = run.upgrades.map((value, i) => value + Number(i === kind)) as Attempt['upgrades'];
  if (kind === 2) run.shield = Math.min(100, run.shield + 22);
  return true;
}

export function step(
  run: Attempt,
  input: Controls,
  dt: number,
  clock: number,
  cue: (name: Cue) => void,
) {
  if (run.ended) return;
  const sector = CHAPTERS[run.chapter];
  if (run.mode !== 'sandbox') run.time -= dt;
  run.flash = Math.max(0, run.flash - dt);
  run.hitDelay = Math.max(0, run.hitDelay - dt);
  run.rechargeDelay = Math.max(0, run.rechargeDelay - dt);
  const target = input.target;
  const dx = target ? target.x - run.ship.x : input.x * 30;
  const dy = target ? target.y - run.ship.y : input.y * 30;
  const normal = Math.max(1, Math.hypot(dx, dy) / 24);
  const lurch = run.chapter === 4 ? 2.8 : 8;
  const speed = (6.1 + run.upgrades[0] * 0.75) * (run.heat > 76 ? 0.68 : 1);
  run.velocity.x +=
    ((dx / normal) * speed + Math.sin(clock * 1.2) * sector.drift - run.velocity.x) * dt * lurch;
  run.velocity.y += ((dy / normal) * speed - run.velocity.y) * dt * lurch;
  const x = clamp(run.ship.x + run.velocity.x * dt, 14, WIDTH - 14);
  const y = clamp(run.ship.y + run.velocity.y * dt, 14, HEIGHT - 14);
  const blockedX = sector.blocks.some((block) => blocksPoint(block, { x, y: run.ship.y }));
  if (blockedX) run.velocity.x *= -0.36;
  else run.ship.x = x;
  const blockedY = sector.blocks.some((block) => blocksPoint(block, { x: run.ship.x, y }));
  if (blockedY) run.velocity.y *= -0.36;
  else run.ship.y = y;
  if (target && (blockedX || blockedY)) {
    delete input.target;
    run.notice = 'blocked';
  }

  run.heat = clamp(
    run.heat +
      (BATCHES[run.batch] / 14 + run.cargo / 9) *
        sector.heat *
        [0.66, 1, 1.43][run.precision] *
        dt -
      (run.upgrades[1] * 0.6 + (near(run.ship, run.relay, 43) ? 6 : 0.55)) * dt,
    0,
    100,
  );
  run.sentinels.forEach((sentinel, i) => {
    const anchor = {
      x: 225 + i * 84 + Math.sin(clock * 0.78 + i) * 58,
      y: 171 + Math.cos(clock * (0.55 + i * 0.08) + i) * 118,
    };
    const sentry = i % 3 === 2;
    const pursuit = near(sentinel, run.ship, run.chapter >= 3 ? 124 : 72) && !sentry;
    const goal = pursuit ? run.ship : anchor;
    const len = Math.max(1, Math.hypot(goal.x - sentinel.x, goal.y - sentinel.y));
    const rate = (sector.speed + run.wave * 2) * dt * (pursuit ? 1 : sentry ? 0.36 : 0.63);
    sentinel.x += ((goal.x - sentinel.x) / len) * Math.min(len, rate);
    sentinel.y += ((goal.y - sentinel.y) / len) * Math.min(len, rate);
    if (near(run.ship, sentinel, 21) && run.hitDelay === 0) {
      run.shield -= Math.max(6, 23 - run.upgrades[2] * 5);
      run.heat = Math.min(100, run.heat + 10);
      run.hitDelay = 1.7;
      run.rechargeDelay = 4;
      run.flash = 0.6;
      cue('hazard');
    }
  });
  if (run.chapter === 4) {
    run.boss.phase = run.delivered >= 16 ? 3 : run.delivered >= 8 ? 2 : 1;
    const cycle = 6 - run.boss.phase;
    run.boss.pulse = (clock % cycle) / cycle;
    run.boss.radius = Math.max(0, (run.boss.pulse - 0.25) * (190 + run.boss.phase * 47));
    const distance = Math.hypot(run.ship.x - 360, run.ship.y - 170);
    if (run.boss.radius > 20 && Math.abs(distance - run.boss.radius) < 9 && run.hitDelay === 0) {
      run.hitDelay = 1.1;
      run.rechargeDelay = 4;
      run.shield -= 12 + run.boss.phase * 4;
      run.heat = Math.min(100, run.heat + 11);
      run.flash = 0.6;
      cue('hazard');
    }
  }
  run.packets = run.packets.map((packet) => {
    if (run.escape || !near(run.ship, packet, 20)) return packet;
    if (packet.kind === 'token') run.cargo = Math.min(64, run.cargo + 2);
    if (packet.kind === 'cache') run.cache = Math.min(6, run.cache + 1);
    if (packet.kind === 'coolant') {
      run.heat = Math.max(0, run.heat - (run.chapter === 1 ? 36 : 22));
      run.shield = Math.min(100, run.shield + 9);
    }
    run.energy += 1;
    cue('collect');
    return spawn(run.chapter, packet.kind);
  });
  if (run.mode !== 'sandbox' && (run.time <= 0 || run.shield <= 0)) {
    run.ended = 'lost';
    cue('hazard');
  } else if (run.escape && near(run.ship, run.relay, 32)) {
    run.ended = 'clear';
    run.score += Math.floor(Math.max(0, run.time) * 7);
    cue('win');
  }
  if (run.shield > 0 && run.rechargeDelay === 0) run.shield = Math.min(100, run.shield + dt * 11);
  if (run.mode === 'sandbox' && run.shield <= 0) run.shield = 100;
}

export function transmit(run: Attempt, cue: (name: Cue) => void) {
  if (run.ended || run.escape || !inTransmitRange(run)) return false;
  if (run.cargo === 0) {
    run.notice = 'empty';
    return false;
  }
  if (run.chapter === 2 && run.cache === 0) {
    run.notice = 'cache';
    return false;
  }
  if (run.heat >= 89) {
    run.notice = 'heat';
    return false;
  }
  const sent = Math.min(run.cargo, BATCHES[run.batch], run.chapter === 4 ? 8 : 64);
  run.notice = 'bank';
  run.cargo -= sent;
  run.delivered += sent;
  // A toy score, not benchmark data: batching favors throughput, cooling/cache favor responsiveness.
  const model = precisionModel[run.precision] ?? precisionModel[1];
  run.kvCost = sent * model.kv;
  run.firstToken = Math.round(
    Math.max(34, 210 + sent * 11 + run.heat * 4.3 - run.cache * 51 + model.ttft),
  );
  run.efficiency = Math.round(
    (sent * [96, 70, 52][run.precision]) / Math.max(1, sent / 7 + run.firstToken / 125),
  );
  run.interactivity = Math.round(run.efficiency / (1 + sent / 4 + run.firstToken / 800));
  run.score +=
    run.efficiency * 2 +
    run.interactivity * 3 +
    Math.max(0, 450 - run.firstToken) +
    Math.round(run.shield);
  run.cache = Math.max(0, run.cache - 1);
  run.energy += 2;
  run.heat = Math.min(100, run.heat + sent * [1.1, 1.65, 2.35][run.precision]);
  if (run.chapter === 4) {
    run.flip = !run.flip;
    run.relay = { x: run.flip ? 62 : 655, y: run.flip ? 265 : 172 };
    // A regular supply lane gives each alternate relay approach the same minimum inventory.
    if (run.delivered < run.quota) {
      const side = run.flip ? 1 : -1;
      const x = run.flip ? 62 : 655;
      run.packets.push(
        ...[28, 57, 86, 115].map((distance) => ({
          x: x + side * distance,
          y: run.relay.y,
          kind: 'token' as const,
        })),
        { x: x + side * 105, y: run.relay.y, kind: 'coolant' },
        { x: x + side * 16, y: run.relay.y, kind: 'coolant' },
      );
      if (run.packets.length > 36) run.packets.splice(0, run.packets.length - 36);
    }
  }
  if (run.mode !== 'sandbox' && run.delivered >= run.quota) {
    if (run.mode === 'campaign' && run.chapter === 4) {
      run.escape = true;
      run.notice = 'escape';
      run.time = 24;
      run.relay = { x: run.ship.x > WIDTH / 2 ? 52 : 666, y: 49 };
      cue('relay');
      return true;
    }
    run.ended = 'clear';
    run.score += Math.floor(Math.max(0, run.time) * 7);
    cue('win');
  } else cue('relay');
  return true;
}
