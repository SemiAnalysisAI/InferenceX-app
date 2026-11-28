'use client';

import { useEffect, useRef, useState } from 'react';

import type { Locale } from '@/lib/i18n/i18n';

import {
  duckCsgoMusic,
  playBomb,
  playClip,
  playHit,
  playShot,
  playSting,
  setCsgoDrive,
  unlockCsgoAudio,
} from './csgo-audio';
import { drawOps } from './csgo-ops-art';
import { emitCsgoLine } from './csgo-radio';
import { mergeSave, prefersReducedMotion, readSave } from './csgo-store';
import { csgoCopy, type CsgoCopy } from './csgo-strings';

/**
 * Operation Pareto. Five Dust II sites, camera-followed.
 * Coupled systems: aim and TTFT recoil, a precision buy plus KV smoke economy,
 * and holders whose doors slam when the cache fills. Campaign, endless, sandbox.
 */

const CELL = 40;
const COLS = 50;
const ROWS = 35;
const WORLD_W = COLS * CELL;
const WORLD_H = ROWS * CELL;

type Mode = 'campaign' | 'endless' | 'sandbox';
type GunId = 'usp' | 'mp9' | 'ak' | 'awp';

interface Gun {
  id: GunId;
  en: string;
  zh: string;
  dmg: number;
  spread: number;
  rate: number;
  speed: number;
  cost: number;
  range: number;
  ttft: number;
  batch: number;
}

const GUNS: Gun[] = [
  {
    id: 'usp',
    en: 'FP4 USP',
    zh: 'FP4 手枪',
    dmg: 22,
    spread: 0.09,
    rate: 0.28,
    speed: 1,
    cost: 0,
    range: 420,
    ttft: 0,
    batch: 1,
  },
  {
    id: 'mp9',
    en: 'FP8 MP9',
    zh: 'FP8 冲锋枪',
    dmg: 12,
    spread: 0.14,
    rate: 0.08,
    speed: 1.08,
    cost: 800,
    range: 300,
    ttft: 0.04,
    batch: 4,
  },
  {
    id: 'ak',
    en: 'BF16 AK',
    zh: 'BF16 步枪',
    dmg: 34,
    spread: 0.05,
    rate: 0.12,
    speed: 0.84,
    cost: 2700,
    range: 560,
    ttft: 0.08,
    batch: 8,
  },
  {
    id: 'awp',
    en: 'Spec AWP',
    zh: '投机 AWP',
    dmg: 100,
    spread: 0.012,
    rate: 0.9,
    speed: 0.7,
    cost: 4750,
    range: 980,
    ttft: 0.32,
    batch: 1,
  },
];

interface Bot {
  x: number;
  y: number;
  hp: number;
  max: number;
  zone: number;
  cooldown: number;
  peek: number;
  flash: number;
  alive: boolean;
  boss: boolean;
  aim: number;
  muzzle: number;
}

interface Smoke {
  x: number;
  y: number;
  life: number;
}

interface Sim {
  mode: Mode;
  x: number;
  y: number;
  aim: number;
  hp: number;
  money: number;
  kv: number;
  tok: number;
  inter: number;
  gun: number;
  owned: GunId[];
  cooldown: number;
  pending: number;
  plant: number;
  camping: number;
  moved: number;
  combat: number;
  flash: number;
  hit: number;
  wave: number;
  score: number;
  longClear: boolean;
  midClear: boolean;
  aPlanted: boolean;
  bClear: boolean;
  won: boolean;
  dead: boolean;
  seen: string[];
  smokes: Smoke[];
  bots: Bot[];
  boss: Bot | null;
  camX: number;
  camY: number;
  viewW: number;
  viewH: number;
  beam: number;
  muzzle: number;
  feed: { text: string; life: number }[];
  tracers: { x: number; y: number; angle: number; range: number; life: number }[];
  kits: string[];
  hpMax: number;
  sandboxHostile: boolean;
  sandboxKv: boolean;
  misses: number;
  doorCool: number;
  defuse: number;
  defused: boolean;
}

const baseSolid = new Uint8Array(COLS * ROWS);
baseSolid.fill(1);

function carve(c0: number, r0: number, c1: number, r1: number) {
  for (let r = r0; r <= r1; r += 1) {
    for (let c = c0; c <= c1; c += 1) baseSolid[r * COLS + c] = 0;
  }
}

carve(1, 1, 12, 12);
carve(13, 5, 15, 8);
carve(16, 4, 26, 18);
carve(27, 6, 29, 9);
carve(30, 1, 47, 11);
carve(16, 19, 20, 21);
carve(1, 22, 22, 32);
carve(36, 12, 40, 15);
carve(30, 16, 47, 32);
carve(23, 25, 29, 28);

const ZONE_KEYS = ['long', 'mid', 'a', 'b', 'major'];
const BENCHES = [
  { c: 11, r: 6 },
  { c: 25, r: 7 },
  { c: 18, r: 18 },
  { c: 38, r: 11 },
];

function nearBench(sim: Sim) {
  return BENCHES.some(
    (bench) => Math.hypot(sim.x - (bench.c * CELL + 20), sim.y - (bench.r * CELL + 20)) < 92,
  );
}

function ventAmount(sim: Sim) {
  return sim.kits.includes('vent') ? 52 : 36;
}

function center(c: number, r: number) {
  return { x: c * CELL + CELL / 2, y: r * CELL + CELL / 2 };
}

function zoneAt(x: number, y: number): number {
  const c = Math.floor(x / CELL);
  const r = Math.floor(y / CELL);
  if (c >= 30 && r >= 16) return 4;
  if (c >= 30 && r <= 11) return 2;
  if (r >= 22 && c <= 22) return 3;
  if (c <= 12 && r <= 12) return 0;
  if (c >= 16 && c <= 26 && r <= 18) return 1;
  if (c < 16) return r < 16 ? 0 : 3;
  if (r < 16) return c < 30 ? 1 : 2;
  return 4;
}

function inRect(c: number, r: number, c0: number, r0: number, c1: number, r1: number) {
  return c >= c0 && c <= c1 && r >= r0 && r <= r1;
}

function gateSolid(sim: Sim, c: number, r: number): boolean {
  const campaign = sim.mode === 'campaign';
  const kvShut = (sim.mode !== 'sandbox' || sim.sandboxKv) && sim.kv > 78;
  if (inRect(c, r, 13, 5, 15, 8) && campaign && !sim.longClear) return true;
  if (inRect(c, r, 27, 6, 29, 9) && ((campaign && !sim.midClear) || kvShut)) return true;
  if (inRect(c, r, 16, 19, 20, 21) && ((campaign && !sim.midClear) || kvShut)) return true;
  if (inRect(c, r, 36, 12, 40, 15) && campaign && !(sim.aPlanted && sim.bClear)) return true;
  if (inRect(c, r, 23, 25, 29, 28) && campaign && !(sim.aPlanted && sim.bClear)) return true;
  return false;
}

function cellBlocked(sim: Sim, c: number, r: number) {
  if (c < 0 || r < 0 || c >= COLS || r >= ROWS) return true;
  return baseSolid[r * COLS + c] === 1 || gateSolid(sim, c, r);
}

function blocked(sim: Sim, x: number, y: number) {
  const rad = 11;
  const points = [
    [0, 0],
    [rad, 0],
    [-rad, 0],
    [0, rad],
    [0, -rad],
  ];
  return points.some(([dx, dy]) =>
    cellBlocked(sim, Math.floor((x + dx!) / CELL), Math.floor((y + dy!) / CELL)),
  );
}

function inSmoke(sim: Sim, x: number, y: number) {
  return sim.smokes.some((smoke) => smoke.life > 0 && Math.hypot(smoke.x - x, smoke.y - y) < 72);
}

function los(sim: Sim, x0: number, y0: number, x1: number, y1: number) {
  const dist = Math.hypot(x1 - x0, y1 - y0);
  const steps = Math.max(1, Math.ceil(dist / 16));
  for (let i = 1; i < steps; i += 1) {
    const x = x0 + ((x1 - x0) * i) / steps;
    const y = y0 + ((y1 - y0) * i) / steps;
    if (inSmoke(sim, x, y)) return false;
    if (cellBlocked(sim, Math.floor(x / CELL), Math.floor(y / CELL))) return false;
  }
  return true;
}

function makeBot(c: number, r: number, zone: number, boss = false): Bot {
  const spot = center(c, r);
  const hp = boss ? 240 : 36 + zone * 6;
  return {
    x: spot.x,
    y: spot.y,
    hp,
    max: hp,
    zone,
    cooldown: 0.4,
    peek: 0,
    flash: 0,
    alive: true,
    boss,
    aim: Math.atan2(16 * CELL - spot.y, 25 * CELL - spot.x),
    muzzle: 0,
  };
}

const CAMPAIGN_BOTS: [number, number, number][] = [
  [3, 3, 0],
  [10, 3, 0],
  [4, 10, 0],
  [10, 9, 0],
  [18, 7, 1],
  [24, 10, 1],
  [20, 15, 1],
  [33, 3, 2],
  [40, 6, 2],
  [44, 9, 2],
  [4, 25, 3],
  [12, 28, 3],
  [18, 24, 3],
];

function createSim(mode: Mode): Sim {
  const save = readSave();
  const start = center(3, 7);
  const sim: Sim = {
    mode,
    x: start.x,
    y: start.y,
    aim: 0,
    hp: 100,
    money: mode === 'sandbox' ? 8000 : 800,
    kv: 12,
    tok: 28,
    inter: 64,
    gun: 0,
    owned:
      mode === 'sandbox'
        ? save.unlocked.filter((id): id is GunId => GUNS.some((gun) => gun.id === id))
        : [],
    cooldown: 0,
    pending: 0,
    plant: 0,
    camping: 0,
    moved: 0,
    combat: 0,
    flash: 0,
    hit: 0,
    wave: 1,
    score: 0,
    longClear: mode !== 'campaign',
    midClear: mode !== 'campaign',
    aPlanted: mode !== 'campaign',
    bClear: mode !== 'campaign',
    won: false,
    dead: false,
    seen: [],
    smokes: [],
    bots: [],
    boss: null,
    camX: 0,
    camY: 0,
    viewW: 800,
    viewH: 480,
    beam: 0,
    muzzle: 0,
    feed: [],
    tracers: [],
    kits: save.kits.filter((id) => id === 'armor' || id === 'light' || id === 'vent'),
    hpMax: save.kits.includes('armor') ? 125 : 100,
    sandboxHostile: false,
    sandboxKv: false,
    misses: 0,
    doorCool: 0,
    defuse: 0,
    defused: false,
  };
  sim.hp = sim.hpMax;
  if (!sim.owned.includes('usp')) sim.owned.unshift('usp');
  if (mode === 'campaign') sim.bots = CAMPAIGN_BOTS.map(([c, r, zone]) => makeBot(c, r, zone));
  else spawnWave(sim, true);
  if (mode === 'sandbox') sim.boss = makeBot(40, 24, 4, true);
  return sim;
}

function spawnWave(sim: Sim, first = false) {
  const zone = (sim.wave - 1) % 5;
  const pool = CAMPAIGN_BOTS.filter((row) => row[2] === zone);
  const count = Math.min(pool.length, 2 + Math.min(sim.wave, 3));
  sim.bots = pool.slice(0, count).map(([c, r, z], index) => {
    const bot = makeBot(c, r, z);
    bot.hp += sim.wave * 4;
    bot.max = bot.hp;
    bot.x += index * 6;
    return bot;
  });
  if (sim.bots.length === 0) sim.bots = [makeBot(18, 7, 1)];
  if (!first && sim.wave % 4 === 0) sim.boss = makeBot(40, 24, 4, true);
}

function gunOf(sim: Sim): Gun {
  return GUNS[sim.gun] ?? GUNS[0]!;
}

function near(x: number, y: number, c: number, r: number, reach = 46) {
  const spot = center(c, r);
  return Math.hypot(x - spot.x, y - spot.y) < reach;
}

let coldPlantAt = 0;

function noteColdPlant(sim: Sim) {
  const now = performance.now();
  if (now - coldPlantAt < 2800) return;
  coldPlantAt = now;
  const zh = document.documentElement.dataset.csgoLocale === 'zh';
  sim.feed.unshift({
    text: zh
      ? '帕累托 COLD。换冲锋枪或步枪，或开火把 tok/s 打过 40。'
      : 'Pareto COLD. Equip an SMG or rifle, or fire until tok/s is over 40.',
    life: 3.4,
  });
}

function award(sim: Sim, xp: number, medal?: { id: string; tier: number }) {
  const next = mergeSave({
    xp: readSave().xp + xp,
    medal,
    unlocked: sim.owned,
    zonesSeen: sim.seen,
    clears: sim.won ? Math.max(1, readSave().clears + 1) : undefined,
    bestEndless: sim.mode === 'endless' ? sim.score : undefined,
  });
  if (next.xp >= 2600 && !next.medals.global) mergeSave({ medal: { id: 'global', tier: 1 } });
}

function noteZone(sim: Sim) {
  const key = ZONE_KEYS[zoneAt(sim.x, sim.y)] ?? 'long';
  if (!sim.seen.includes(key)) {
    sim.seen.push(key);
    mergeSave({ zonesSeen: sim.seen });
  }
}

function tryShot(sim: Sim, calm: boolean) {
  const gun = gunOf(sim);
  if (sim.cooldown > 0 || sim.pending > 0) return;
  const prefill = zoneAt(sim.x, sim.y) === 0 ? 0.16 : 0;
  sim.pending = gun.ttft + prefill;
  sim.cooldown = gun.rate;
  if (sim.pending <= 0) resolveShot(sim, calm);
}

function resolveShot(sim: Sim, calm: boolean) {
  const gun = gunOf(sim);
  const spread = (Math.random() - 0.5) * gun.spread * 2;
  const angle = sim.aim + spread;
  playShot(gun.id);
  sim.combat = 1.2;
  sim.muzzle = calm ? 0 : 0.12;
  sim.tracers.push({ x: sim.x, y: sim.y, angle, range: gun.range, life: 0.08 });
  if (!calm) sim.aim += gun.id === 'awp' ? 0.08 : 0.03;
  let best: Bot | null = null;
  let bestDist = gun.range;
  const pool = [...sim.bots, ...(sim.boss?.alive ? [sim.boss] : [])];
  for (const bot of pool) {
    if (!bot.alive) continue;
    const dist = Math.hypot(bot.x - sim.x, bot.y - sim.y);
    if (dist > bestDist) continue;
    const angleTo = Math.atan2(bot.y - sim.y, bot.x - sim.x);
    let delta = Math.abs(angleTo - angle);
    if (delta > Math.PI) delta = Math.PI * 2 - delta;
    if (delta > 0.18 + gun.spread) continue;
    if (!los(sim, sim.x, sim.y, bot.x, bot.y)) continue;
    best = bot;
    bestDist = dist;
  }
  if (!best) {
    sim.misses += 1;
    if (sim.misses === 5) {
      emitCsgoLine('backup');
      sim.feed.unshift({
        text:
          document.documentElement.dataset.csgoLocale === 'zh'
            ? '第 1–5 枪：明显打空。'
            : 'Shots 1-5: clearly missed.',
        life: 3.6,
      });
    }
    return;
  }
  sim.misses = 0;
  best.hp -= gun.dmg;
  playHit();
  sim.tok = Math.min(100, sim.tok + 6 + gun.batch);
  if (best.hp <= 0) {
    best.alive = false;
    const zh = document.documentElement.dataset.csgoLocale === 'zh';
    sim.feed.unshift({
      text: `${zh ? gun.zh : gun.en}  ${best.boss ? (zh ? 'Major' : 'MAJOR') : zh ? '匪' : 'T'}`,
      life: 4,
    });
    sim.money += best.boss ? 800 : 300;
    award(sim, best.boss ? 180 : 40, best.boss ? { id: 'major', tier: 2 } : undefined);
  }
}

function stepBots(sim: Sim, dt: number, calm: boolean) {
  const hostile = sim.mode !== 'sandbox' || sim.sandboxHostile;
  const all = [...sim.bots, ...(sim.boss ? [sim.boss] : [])];
  for (const bot of all) {
    if (!bot.alive) continue;
    bot.cooldown = Math.max(0, bot.cooldown - dt);
    bot.flash = Math.max(0, bot.flash - dt);
    bot.muzzle = Math.max(0, bot.muzzle - dt);
    const dist = Math.hypot(bot.x - sim.x, bot.y - sim.y);
    const sees =
      hostile &&
      bot.flash <= 0 &&
      dist < (bot.boss ? 520 : 380) &&
      los(sim, bot.x, bot.y, sim.x, sim.y);
    bot.aim = sees ? Math.atan2(sim.y - bot.y, sim.x - bot.x) : bot.aim + dt * 0.15;
    if (sees) bot.peek += dt;
    else bot.peek = Math.max(0, bot.peek - dt);
    const delay = bot.boss ? 0.35 : 0.45 + bot.zone * 0.12;
    if (sees && bot.peek > delay && bot.cooldown <= 0) {
      bot.cooldown = bot.boss ? 0.55 : 0.85;
      bot.muzzle = calm ? 0 : 0.1;
      sim.hp -= bot.boss ? 12 : 7;
      sim.hit = calm ? 0 : 0.18;
      sim.combat = 1;
      if (sim.hp <= 0) {
        sim.hp = 0;
        sim.dead = true;
        if (sim.mode === 'endless') award(sim, 0);
      }
    }
    if (bot.boss) {
      sim.beam += dt * (calm ? 0.35 : 0.9);
      const phase = bossPhase(sim);
      if (phase === 0 && sees) {
        const beamAngle = sim.beam % (Math.PI * 2);
        const angleTo = Math.atan2(sim.y - bot.y, sim.x - bot.x);
        let delta = Math.abs(angleTo - beamAngle);
        if (delta > Math.PI) delta = Math.PI * 2 - delta;
        if (delta < 0.22 && dist < 460) {
          sim.hp -= calm ? 4 * dt : 10 * dt;
          sim.hit = calm ? 0 : 0.12;
        }
      }
      if (phase === 1) sim.kv = Math.min(100, sim.kv + 22 * dt);
    }
  }
}

function bossPhase(sim: Sim): number {
  if (!sim.boss?.alive) return sim.mode === 'campaign' && sim.aPlanted && sim.bClear ? 2 : -1;
  if (sim.boss.hp > 150) return 0;
  if (sim.boss.hp > 70) return 1;
  return 2;
}

function refreshClears(sim: Sim) {
  const long = sim.bots.filter((bot) => bot.zone === 0 && bot.alive).length === 0;
  const mid = sim.bots.filter((bot) => bot.zone === 1 && bot.alive).length === 0;
  const b = sim.bots.filter((bot) => bot.zone === 3 && bot.alive).length === 0;
  if (sim.mode === 'campaign') {
    if (long && !sim.longClear) {
      sim.longClear = true;
      if (!sim.owned.includes('mp9')) sim.owned.push('mp9');
      award(sim, 150, { id: 'long', tier: 1 });
      emitCsgoLine('clear');
    }
    if (mid && sim.longClear && !sim.midClear) {
      sim.midClear = true;
      if (!sim.owned.includes('ak')) sim.owned.push('ak');
      award(sim, 150, { id: 'mid', tier: 1 });
    }
    if (b && sim.midClear && !sim.bClear) {
      sim.bClear = true;
      if (!sim.owned.includes('awp')) sim.owned.push('awp');
      award(sim, 150, { id: 'awp', tier: 1 });
    }
    if (sim.aPlanted && sim.bClear && !sim.boss) sim.boss = makeBot(40, 24, 4, true);
  }
  if (sim.mode === 'endless' && sim.bots.every((bot) => !bot.alive) && !sim.boss?.alive) {
    sim.score = sim.wave;
    award(sim, 80, { id: 'endless', tier: Math.min(3, 1 + Math.floor(sim.wave / 3)) });
    sim.wave += 1;
    sim.money += 500;
    spawnWave(sim);
  }
}

function step(
  sim: Sim,
  dt: number,
  wishX: number,
  wishY: number,
  fire: boolean,
  planting: boolean,
  calm: boolean,
) {
  if (sim.dead || sim.won) return;
  const gun = gunOf(sim);
  const speed =
    168 *
    gun.speed *
    (sim.kits.includes('light') ? 1.12 : 1) *
    (zoneAt(sim.x, sim.y) === 3 && gun.batch >= 8 ? 0.72 : 1);
  const mag = Math.hypot(wishX, wishY) || 1;
  const vx = (wishX / mag) * speed;
  const vy = (wishY / mag) * speed;
  const nx = sim.x + vx * dt;
  const ny = sim.y + vy * dt;
  const ox = sim.x;
  const oy = sim.y;
  if (!blocked(sim, nx, sim.y)) sim.x = nx;
  if (!blocked(sim, sim.x, ny)) sim.y = ny;
  sim.doorCool = Math.max(0, sim.doorCool - dt);
  if (Math.hypot(wishX, wishY) > 0.35 && sim.x === ox && sim.y === oy && sim.doorCool <= 0) {
    const cellC = Math.max(0, Math.min(COLS - 1, Math.floor(nx / CELL)));
    const cellR = Math.max(0, Math.min(ROWS - 1, Math.floor(ny / CELL)));
    if (gateSolid(sim, cellC, cellR)) {
      sim.doorCool = 4.5;
      emitCsgoLine('fallback');
      sim.feed.unshift({
        text:
          document.documentElement.dataset.csgoLocale === 'zh'
            ? 'DOOR STUCK。中路门。'
            : 'DOOR STUCK. Mid doors.',
        life: 3.2,
      });
    }
  }
  sim.moved = Math.hypot(vx, vy);
  sim.camping = sim.moved < 24 ? sim.camping + dt : 0;
  sim.kv = sim.camping > 0.45 ? Math.min(100, sim.kv + 16 * dt) : Math.max(0, sim.kv - 7 * dt);
  sim.smokes = sim.smokes.filter((smoke) => {
    smoke.life -= dt;
    return smoke.life > 0;
  });
  if (sim.smokes.length > 0) sim.kv = Math.max(0, sim.kv - 10 * dt);
  const camp = sim.camping > 0.45;
  const tokTarget = 16 + gun.batch * 7 + (sim.combat > 0 ? 20 : 0);
  const interTarget = Math.max(
    4,
    84 - sim.kv * 0.42 - (camp ? 26 : 0) - gun.ttft * 36 - (gun.batch >= 8 ? 8 : 0),
  );
  sim.tok += (tokTarget - sim.tok) * Math.min(1, dt * 1.4);
  sim.inter += (interTarget - sim.inter) * Math.min(1, dt * 1.4);
  sim.cooldown = Math.max(0, sim.cooldown - dt);
  sim.combat = Math.max(0, sim.combat - dt);
  sim.flash = Math.max(0, sim.flash - dt);
  sim.hit = Math.max(0, sim.hit - dt);
  sim.muzzle = Math.max(0, sim.muzzle - dt);
  sim.feed = sim.feed.filter((row) => {
    row.life -= dt;
    return row.life > 0;
  });
  sim.tracers = sim.tracers.filter((row) => {
    row.life -= dt;
    return row.life > 0;
  });
  if (sim.pending > 0) {
    sim.pending -= dt;
    if (sim.pending <= 0) resolveShot(sim, calm);
  } else if (fire) tryShot(sim, calm);
  const hot = sim.tok > 40 && sim.inter > 40;
  const atA = near(sim.x, sim.y, 42, 5);
  const atCore = near(sim.x, sim.y, 40, 24, 58);
  const aClear = sim.bots.filter((bot) => bot.zone === 2 && bot.alive).length === 0;
  const atPlantSite =
    (sim.mode === 'campaign' && sim.midClear && aClear && !sim.aPlanted && atA) ||
    (sim.mode === 'campaign' && bossPhase(sim) === 2 && atCore);
  const canPlant = hot && atPlantSite;
  if (planting && atPlantSite && !hot) noteColdPlant(sim);
  if (planting && canPlant) {
    sim.plant += dt / 2.4;
    if (Math.floor(sim.plant * 8) !== Math.floor((sim.plant - dt / 2.4) * 8))
      playBomb(sim.plant * 40);
    if (sim.plant >= 1) {
      sim.plant = 0;
      if (atCore && bossPhase(sim) === 2 && sim.mode === 'campaign') {
        sim.won = true;
        playClip('ctwin');
        emitCsgoLine('nice');
        playSting();
        award(sim, 500, { id: 'major', tier: 3 });
        mergeSave({ medal: { id: 'global', tier: 1 } });
      } else if (!sim.aPlanted) {
        sim.aPlanted = true;
        if (!sim.owned.includes('awp')) sim.owned.push('awp');
        award(sim, 200, { id: 'plant', tier: 1 });
        playClip('bombpl');
        emitCsgoLine('backup');
        sim.feed.unshift({
          text:
            document.documentElement.dataset.csgoLocale === 'zh'
              ? '炸弹已安放。'
              : 'Bomb has been planted.',
          life: 3.4,
        });
      }
    }
  } else if (planting && sim.aPlanted && atA && !sim.defused) {
    sim.defuse += dt / 3.4;
    sim.flash = calm ? 0 : 0.35;
    if (sim.defuse >= 1) {
      sim.defused = true;
      award(sim, 120, { id: 'defuse', tier: 1 });
      playClip('bombdef');
      playClip('nice');
      emitCsgoLine('nice');
      sim.feed.unshift({
        text:
          document.documentElement.dataset.csgoLocale === 'zh'
            ? '火里拆完。交互性还剩一点。'
            : 'Defuse in the fire. Interactivity was almost gone.',
        life: 4,
      });
    }
  } else sim.plant = Math.max(0, sim.plant - dt * 0.8);
  if (sim.hp < sim.hpMax && sim.hit <= 0 && (sim.mode !== 'sandbox' || sim.sandboxHostile))
    sim.hp = Math.min(sim.hpMax, sim.hp + 3 * dt);
  if (sim.mode === 'sandbox' && !sim.sandboxHostile) sim.hp = sim.hpMax;
  stepBots(sim, dt, calm);
  refreshClears(sim);
  noteZone(sim);
  if (sim.hp <= 0) sim.dead = true;
  setCsgoDrive({ intensity: sim.combat > 0 ? 0.9 : 0.22, heat: sim.kv / 100 });
  duckCsgoMusic(sim.plant > 0.05 || bossPhase(sim) >= 1);
}

function draw(ctx: CanvasRenderingContext2D, sim: Sim, copy: CsgoCopy, calm: boolean) {
  const zone = zoneAt(sim.x, sim.y);
  drawOps(ctx, sim, {
    calm,
    zoneName: copy.zones[zone] ?? '',
    side: document.documentElement.dataset.csgoSide ?? 'ct',
    zoneAt,
    gateSolid: (c, r) => gateSolid(sim, c, r),
    solid: (c, r) => c < 0 || r < 0 || c >= COLS || r >= ROWS || baseSolid[r * COLS + c] === 1,
    benches: BENCHES,
    benchHint: nearBench(sim) ? copy.benchHint : '',
  });
}

interface Hud {
  hp: number;
  money: number;
  kv: number;
  tok: number;
  inter: number;
  gun: string;
  zone: string;
  objective: string;
  status: string;
  plant: number;
  wave: number;
}

function actIndex(sim: Sim): number {
  if (sim.longClear && sim.midClear && sim.aPlanted && sim.bClear) return 4;
  if (sim.longClear && sim.midClear && sim.aPlanted) return 3;
  if (sim.longClear && sim.midClear) return 2;
  if (sim.longClear) return 1;
  return 0;
}

function hudOf(sim: Sim, copy: CsgoCopy, locale: Locale): Hud {
  const act = actIndex(sim);
  const objective =
    sim.mode === 'endless'
      ? copy.step(sim.wave)
      : sim.mode === 'sandbox'
        ? (copy.howLines[4] ?? '')
        : (copy.objectives[act] ?? '');
  const gun = gunOf(sim);
  return {
    hp: Math.round(sim.hp),
    money: sim.money,
    kv: Math.round(sim.kv),
    tok: Math.round(sim.tok),
    inter: Math.round(sim.inter),
    gun: locale === 'zh' ? gun.zh : gun.en,
    zone: copy.zones[zoneAt(sim.x, sim.y)] ?? '',
    objective,
    status: sim.won ? 'win' : sim.dead ? 'dead' : 'playing',
    plant: sim.plant,
    wave: sim.wave,
  };
}

export default function CsgoOps({
  locale,
  mode,
  onExit,
}: {
  locale: Locale;
  mode: Mode;
  onExit: () => void;
}) {
  const copy = csgoCopy(locale);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const simRef = useRef<Sim | null>(null);
  const pausedRef = useRef(false);
  const overlayRef = useRef<string | null>(null);
  const keys = useRef(new Set<string>());
  const fireRef = useRef(false);
  const plantRef = useRef(false);
  const stick = useRef({ x: 0, y: 0 });
  const localeRef = useRef(locale);
  localeRef.current = locale;
  const [run, setRun] = useState(0);
  const [overlay, setOverlay] = useState<string | null>(null);
  const [hud, setHud] = useState<Hud | null>(null);
  const [buyOpen, setBuyOpen] = useState(false);
  const [sandboxFlags, setSandboxFlags] = useState({ hostile: false, kv: false });
  const [nearKit, setNearKit] = useState(false);
  const [siteMark, setSiteMark] = useState('long');
  const majorAwarded = useRef(false);

  function setModeOverlay(next: string | null) {
    overlayRef.current = next;
    pausedRef.current = next !== null;
    setOverlay(next);
    setBuyOpen(next === 'buy');
  }

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext('2d');
    if (!context) return;
    const sim = createSim(mode);
    simRef.current = sim;
    pausedRef.current = false;
    overlayRef.current = null;
    setOverlay(null);
    setHud(hudOf(sim, csgoCopy(localeRef.current), localeRef.current));
    setSandboxFlags({ hostile: false, kv: false });
    setNearKit(false);
    const calmQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    let calm = calmQuery.matches || prefersReducedMotion();
    const onCalm = () => {
      calm = calmQuery.matches;
    };
    calmQuery.addEventListener('change', onCalm);
    let raf = 0;
    let last = performance.now();
    let hudAt = 0;
    let alive = true;

    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' || event.repeat) return;
      const target = event.target;
      if (target instanceof HTMLElement && target.closest('input, textarea')) return;
      keys.current.add(event.key.toLowerCase());
      if (event.key === ' ') {
        event.preventDefault();
        fireRef.current = true;
      }
      if (event.key.toLowerCase() === 'f') plantRef.current = true;
      if (event.key.toLowerCase() === 'b')
        setModeOverlay(overlayRef.current === 'buy' ? null : 'buy');
      if (event.key.toLowerCase() === 'q') {
        sim.smokes.push({
          x: sim.x + Math.cos(sim.aim) * 70,
          y: sim.y + Math.sin(sim.aim) * 70,
          life: 4,
        });
        sim.kv = Math.max(0, sim.kv - ventAmount(sim));
      }
      if (event.key.toLowerCase() === 'g' && nearBench(sim))
        setModeOverlay(overlayRef.current === 'bench' ? null : 'bench');
      if (event.key.toLowerCase() === 'e') {
        sim.flash = calm ? 0 : 0.25;
        for (const bot of [...sim.bots, ...(sim.boss ? [sim.boss] : [])]) {
          if (Math.hypot(bot.x - sim.x, bot.y - sim.y) < 230) bot.flash = 1.6;
        }
      }
      const slot = Number(event.key);
      if (slot >= 1 && slot <= 4) {
        const gun = GUNS[slot - 1];
        if (gun && (mode === 'sandbox' || sim.owned.includes(gun.id))) sim.gun = slot - 1;
      }
      if (event.key.toLowerCase() === 'r' && (sim.dead || sim.won)) setRun((value) => value + 1);
    };
    const onUp = (event: KeyboardEvent) => {
      keys.current.delete(event.key.toLowerCase());
      if (event.key === ' ') fireRef.current = false;
      if (event.key.toLowerCase() === 'f') plantRef.current = false;
    };
    const aimFrom = (event: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      const px = event.clientX - rect.left;
      const py = event.clientY - rect.top;
      sim.aim = Math.atan2(py + sim.camY - sim.y, px + sim.camX - sim.x);
    };
    const onPointer = (event: PointerEvent) => {
      unlockCsgoAudio();
      if (event.button !== 0) return;
      aimFrom(event);
      fireRef.current = true;
    };
    const onMove = (event: PointerEvent) => {
      if (
        event.pointerType === 'touch' &&
        event.clientX <
          canvas.getBoundingClientRect().left + canvas.getBoundingClientRect().width * 0.42
      )
        return;
      aimFrom(event);
    };
    const onPointerUp = () => {
      fireRef.current = false;
    };

    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onUp);
    canvas.addEventListener('pointerdown', onPointer);
    canvas.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onPointerUp);

    const frame = (now: number) => {
      if (!alive) return;
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = Math.max(1, Math.floor(rect.width * dpr));
      const h = Math.max(1, Math.floor(rect.height * dpr));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
      sim.viewW = Math.max(1, rect.width);
      sim.viewH = Math.max(1, rect.height);
      if (!pausedRef.current) {
        let wishX = stick.current.x;
        let wishY = stick.current.y;
        if (keys.current.has('a') || keys.current.has('arrowleft')) wishX -= 1;
        if (keys.current.has('d') || keys.current.has('arrowright')) wishX += 1;
        if (keys.current.has('w') || keys.current.has('arrowup')) wishY -= 1;
        if (keys.current.has('s') || keys.current.has('arrowdown')) wishY += 1;
        step(sim, dt, wishX, wishY, fireRef.current, plantRef.current, calm);
        if (sim.dead && overlayRef.current !== 'dead') setModeOverlay('dead');
        if (sim.won && overlayRef.current !== 'win') setModeOverlay('win');
      }
      sim.camX = Math.max(0, Math.min(WORLD_W - sim.viewW, sim.x - sim.viewW / 2));
      sim.camY = Math.max(0, Math.min(WORLD_H - sim.viewH, sim.y - sim.viewH / 2));
      draw(context, sim, csgoCopy(localeRef.current), calm);
      if (now - hudAt > 140) {
        hudAt = now;
        setHud(hudOf(sim, csgoCopy(localeRef.current), localeRef.current));
        setNearKit(nearBench(sim));
      }
      raf = window.requestAnimationFrame(frame);
    };
    raf = window.requestAnimationFrame(frame);
    return () => {
      alive = false;
      window.cancelAnimationFrame(raf);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keyup', onUp);
      canvas.removeEventListener('pointerdown', onPointer);
      canvas.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onPointerUp);
      calmQuery.removeEventListener('change', onCalm);
      duckCsgoMusic(false);
      setCsgoDrive({ intensity: 0.15, heat: 0.2 });
      if (sim.mode === 'endless') mergeSave({ bestEndless: sim.score });
    };
  }, [mode, run]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const onEscape = () => {
      if (overlayRef.current === 'dead' || overlayRef.current === 'win') return;
      setModeOverlay(overlayRef.current ? null : 'pause');
    };
    root.addEventListener('csgo-escape', onEscape);
    return () => root.removeEventListener('csgo-escape', onEscape);
  }, [run]);

  const status =
    overlay === 'dead' ? 'dead' : overlay === 'win' ? 'win' : overlay ? 'paused' : 'playing';
  const sim = simRef.current;

  function buy(index: number) {
    const current = simRef.current;
    const gun = GUNS[index];
    if (!current || !gun) return;
    if (mode !== 'sandbox') {
      if (!current.owned.includes(gun.id) && current.money < gun.cost) return;
      if (!current.owned.includes(gun.id)) {
        current.money -= gun.cost;
        current.owned.push(gun.id);
        mergeSave({ unlocked: current.owned });
      }
    }
    current.gun = index;
    setHud(hudOf(current, copy, locale));
  }

  function smoke() {
    const current = simRef.current;
    if (!current) return;
    current.smokes.push({
      x: current.x + Math.cos(current.aim) * 70,
      y: current.y + Math.sin(current.aim) * 70,
      life: 4,
    });
    current.kv = Math.max(0, current.kv - ventAmount(current));
  }

  function buyKit(id: 'armor' | 'light' | 'vent', cost: number) {
    const current = simRef.current;
    if (!current || current.kits.includes(id) || current.money < cost) return;
    current.money -= cost;
    current.kits.push(id);
    if (id === 'armor') {
      current.hpMax = 125;
      current.hp = Math.min(125, current.hp + 25);
    }
    mergeSave({
      kits: current.kits,
      xp: readSave().xp + 220,
      medal: { id: 'kit', tier: 1 },
    });
    setHud(hudOf(current, copy, locale));
  }

  function queueSite(site: 'mid' | 'b' | 'major') {
    const current = simRef.current;
    if (!current) return;
    current.longClear = true;
    if (site === 'mid') {
      current.x = 20 * CELL + 20;
      current.y = 8 * CELL + 20;
      document.documentElement.dataset.csgoMap = 'Mirage';
    } else if (site === 'b') {
      current.midClear = true;
      current.x = 8 * CELL + 20;
      current.y = 26 * CELL + 20;
      document.documentElement.dataset.csgoMap = 'Dust II';
    } else {
      current.midClear = true;
      current.aPlanted = true;
      current.bClear = true;
      current.x = 42 * CELL + 20;
      current.y = 24 * CELL + 20;
      if (!current.boss) current.boss = makeBot(40, 24, 4, true);
      document.documentElement.dataset.csgoMap = 'Major';
      if (!majorAwarded.current) {
        majorAwarded.current = true;
        mergeSave({ xp: readSave().xp + 220, medal: { id: 'major', tier: 1 } });
      }
    }
    const zh = locale === 'zh';
    current.feed.unshift({
      text:
        site === 'major' ? (zh ? 'Major 包点。' : 'Major bombsite.') : site === 'b' ? 'B' : 'Mid',
      life: 4,
    });
    setSiteMark(site);
    setHud(hudOf(current, copy, locale));
  }

  function toggleSandbox(flag: 'hostile' | 'kv') {
    const current = simRef.current;
    if (!current) return;
    if (flag === 'hostile') current.sandboxHostile = !current.sandboxHostile;
    else current.sandboxKv = !current.sandboxKv;
    setSandboxFlags({ hostile: current.sandboxHostile, kv: current.sandboxKv });
  }

  function spawnPractice() {
    const current = simRef.current;
    if (!current) return;
    current.wave += 1;
    spawnWave(current);
    setHud(hudOf(current, copy, locale));
  }

  function grantCash() {
    const current = simRef.current;
    if (!current) return;
    current.money += 1600;
    setHud(hudOf(current, copy, locale));
  }

  function flash() {
    const current = simRef.current;
    if (!current) return;
    const calm = prefersReducedMotion();
    current.flash = calm ? 0 : 0.25;
    for (const bot of [...current.bots, ...(current.boss ? [current.boss] : [])]) {
      if (Math.hypot(bot.x - current.x, bot.y - current.y) < 230) bot.flash = 1.6;
    }
  }

  return (
    <div
      ref={rootRef}
      className="csgo-ops"
      data-testid="csgo-ops"
      data-status={status}
      data-mode={mode}
      data-site={siteMark}
      data-overlay={overlay ?? ''}
    >
      <div className="csgo-ops-hud" aria-live="polite">
        <span>
          {copy.hp} {hud?.hp ?? 100}
        </span>
        <span>
          {copy.money} ${hud?.money ?? 0}
        </span>
        <span className="csgo-meter">
          {copy.kv} {hud?.kv ?? 0}
          <i style={{ width: `${hud?.kv ?? 0}%` }} />
        </span>
        <span className="csgo-meter">
          {copy.throughput} {hud?.tok ?? 0}
          <i style={{ width: `${hud?.tok ?? 0}%` }} />
        </span>
        <span className="csgo-meter">
          {copy.interactivity} {hud?.inter ?? 0}
          <i style={{ width: `${hud?.inter ?? 0}%` }} />
        </span>
        <span>
          {copy.pareto} {(hud?.tok ?? 0) > 40 && (hud?.inter ?? 0) > 40 ? 'HOT' : 'COLD'}
        </span>
        <span>{hud?.gun}</span>
        <span>
          {copy.act} {hud?.zone}
        </span>
        {mode === 'endless' ? <span>{copy.step(hud?.wave ?? 1)}</span> : null}
        {mode === 'sandbox' ? (
          <div className="csgo-sandbox" data-testid="csgo-sandbox">
            <button
              type="button"
              data-testid="csgo-sandbox-bots"
              aria-pressed={sandboxFlags.hostile}
              onClick={() => toggleSandbox('hostile')}
            >
              {copy.sandboxBots}
            </button>
            <button type="button" data-testid="csgo-sandbox-wave" onClick={spawnPractice}>
              {copy.sandboxWave}
            </button>
            <button type="button" data-testid="csgo-sandbox-cash" onClick={grantCash}>
              {copy.sandboxCash}
            </button>
            <button
              type="button"
              data-testid="csgo-sandbox-kv"
              aria-pressed={sandboxFlags.kv}
              onClick={() => toggleSandbox('kv')}
            >
              {copy.sandboxKv}
            </button>
          </div>
        ) : null}
      </div>
      <canvas ref={canvasRef} tabIndex={0} aria-label={copy.gameTitle} data-csgo-silent />
      <div className="csgo-ops-bar">
        <span className="text-sm">{hud?.objective}</span>
        <button type="button" onClick={() => setModeOverlay(overlay === 'pause' ? null : 'pause')}>
          {copy.pause}
        </button>
        <button type="button" onClick={() => setModeOverlay('howto')}>
          {copy.howto}
        </button>
        <button type="button" onClick={() => setModeOverlay(overlay === 'buy' ? null : 'buy')}>
          {copy.buy}
        </button>
        {mode === 'sandbox' ? (
          <>
            <button type="button" data-testid="csgo-site-mid" onClick={() => queueSite('mid')}>
              Mid
            </button>
            <button type="button" data-testid="csgo-site-b" onClick={() => queueSite('b')}>
              B
            </button>
            <button type="button" data-testid="csgo-site-major" onClick={() => queueSite('major')}>
              Major
            </button>
            <button type="button" data-testid="csgo-buy-armor" onClick={() => buyKit('armor', 900)}>
              {copy.kitArmor}
            </button>
            <button
              type="button"
              data-testid="csgo-rush"
              onClick={() => {
                const current = simRef.current;
                if (!current) return;
                emitCsgoLine('go');
                const zh = locale === 'zh';
                current.feed.unshift(
                  { text: zh ? '冲冲冲。Rush B。' : 'Go go go. Rush B.', life: 3.2 },
                  { text: zh ? '批处理点塌了。' : 'Batch site collapsed.', life: 3.2 },
                  { text: 'DOOR STUCK.', life: 3.2 },
                );
                setHud(hudOf(current, copy, locale));
              }}
            >
              Rush B
            </button>
          </>
        ) : null}
        <button
          type="button"
          data-testid="csgo-bench"
          disabled={!nearKit && overlay !== 'bench'}
          onClick={() => nearKit && setModeOverlay(overlay === 'bench' ? null : 'bench')}
        >
          {copy.bench}
        </button>
        <button type="button" onClick={smoke}>
          {copy.smoke}
        </button>
        <button type="button" onClick={flash}>
          {copy.flash}
        </button>
        <button
          type="button"
          data-testid="csgo-plant"
          onPointerDown={(event) => {
            plantRef.current = true;
            event.currentTarget.dataset.planting = '1';
            event.currentTarget.setPointerCapture(event.pointerId);
          }}
          onPointerUp={(event) => {
            plantRef.current = false;
            delete event.currentTarget.dataset.planting;
          }}
          onPointerCancel={(event) => {
            plantRef.current = false;
            delete event.currentTarget.dataset.planting;
          }}
        >
          {copy.plant}
        </button>
        <div className="csgo-touch">
          <div
            className="csgo-stick"
            aria-label={copy.howLines[5]}
            onPointerDown={(event) => {
              stick.current = { x: 0, y: 0 };
              event.currentTarget.setPointerCapture(event.pointerId);
            }}
            onPointerMove={(event) => {
              if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
              const rect = event.currentTarget.getBoundingClientRect();
              stick.current = {
                x: Math.max(-1, Math.min(1, (event.clientX - rect.left - rect.width / 2) / 30)),
                y: Math.max(-1, Math.min(1, (event.clientY - rect.top - rect.height / 2) / 30)),
              };
            }}
            onPointerUp={(event) => {
              stick.current = { x: 0, y: 0 };
              if (event.currentTarget.hasPointerCapture(event.pointerId))
                event.currentTarget.releasePointerCapture(event.pointerId);
            }}
          />
        </div>
      </div>
      {overlay ? (
        <div
          className={
            overlay === 'buy' || overlay === 'bench'
              ? 'csgo-ops-overlay csgo-buy-menu'
              : 'csgo-ops-overlay'
          }
          role="dialog"
          aria-label={copy.pause}
        >
          <strong>
            {overlay === 'dead'
              ? copy.dead
              : overlay === 'win'
                ? copy.win
                : overlay === 'howto'
                  ? copy.howto
                  : overlay === 'buy'
                    ? copy.buy
                    : overlay === 'bench'
                      ? copy.bench
                      : copy.pause}
          </strong>
          {overlay === 'howto' || overlay === 'pause' ? (
            <ul>
              {copy.howLines.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          ) : null}
          {overlay === 'bench' ? (
            <>
              <button
                type="button"
                className="csgo-buy-row"
                data-testid="csgo-buy-kit-armor"
                onClick={() => buyKit('armor', 900)}
              >
                <i>A</i>
                <span>{copy.kitArmor}</span>
                <b>$900</b>
              </button>
              <button type="button" className="csgo-buy-row" onClick={() => buyKit('light', 700)}>
                <i>L</i>
                <span>{copy.kitLight}</span>
                <b>$700</b>
              </button>
              <button type="button" className="csgo-buy-row" onClick={() => buyKit('vent', 600)}>
                <i>V</i>
                <span>{copy.kitVent}</span>
                <b>$600</b>
              </button>
            </>
          ) : null}
          {buyOpen
            ? GUNS.map((gun, index) => (
                <button
                  key={gun.id}
                  type="button"
                  className="csgo-buy-row"
                  onClick={() => buy(index)}
                >
                  <i>{index + 1}</i>
                  <span>{locale === 'zh' ? gun.zh : gun.en}</span>
                  <b>
                    ${gun.cost}
                    {sim && mode !== 'sandbox' && !sim.owned.includes(gun.id) ? ' ·' : ''}
                  </b>
                </button>
              ))
            : null}
          {overlay !== 'dead' && overlay !== 'win' ? (
            <button type="button" onClick={() => setModeOverlay(null)}>
              {copy.resume}
            </button>
          ) : null}
          <button type="button" onClick={() => setRun((value) => value + 1)}>
            {copy.restart}
          </button>
          <button type="button" onClick={onExit}>
            {copy.quit}
          </button>
          {hud && hud.plant > 0 ? (
            <span>
              {copy.plant} {Math.round(hud.plant * 100)}%
            </span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
