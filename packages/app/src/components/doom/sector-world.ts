import type { Pass } from './pass';
import { sampleFromChart } from './benchmark';
import type { Cue } from './signals';
export type Mode = 'episode' | 'nightmare' | 'foundry';
export type Action = 'forward' | 'back' | 'left' | 'right' | 'cw' | 'ccw' | 'fire' | 'use' | 'vent';
interface XY {
  x: number;
  y: number;
}
export type Mob = XY & {
  kind: number;
  hp: number;
  max: number;
  phase: number;
  clock: number;
  wind: number;
};
export type Prop = XY & {
  type: 'key' | 'cool' | 'med' | 'exit' | 'secret' | 'relay';
  active: boolean;
};
export const maps = [1, 2, 3, 5, 8];
export const campaigns = [
  ['Prefill Hangar', '预填充机库'],
  ['Nuclear Coolant', '核冷却站'],
  ['Speculative Refinery', '推测精炼厂'],
  ['Argent Archive', '银色档案库'],
  ['Phobos Anomaly', '火卫一异常区'],
] as const;
export const rules = [
  ['Recover the blue key; leave through the uplink.', '取得蓝卡，再从上行链路撤离。'],
  ['Flush both KV relays before the exit opens.', '清空两处缓存中继，再前往出口。'],
  ['Banish three faults to stabilize the refinery.', '驱散三个故障以稳定精炼厂。'],
  ['Find the hidden cache and recover the red key.', '找到密藏并取得红卡。'],
  ['Ground both relays, then break the OOM Overseer.', '接地两处中继，再击破显存溢出监工。'],
] as const;
export const emitters = [
  ['BF16 Pump', 'BF16 泵'],
  ['Spec Burst', '推测脉冲'],
  ['Batch Plasma', '批量等离子'],
  ['NVL Nova', 'NVL 新星'],
] as const;
const colors = ['#e59059', '#9bc16b', '#6ecac6', '#bf97d4', '#f47954'];
export const worldColor = (i: number) => colors[i % 5];
const W = 23,
  H = 19;
const routes = [
  [
    [3, 9],
    [8, 9],
    [8, 4],
    [16, 4],
    [16, 12],
    [20, 13],
  ],
  [
    [3, 14],
    [7, 14],
    [7, 5],
    [14, 5],
    [14, 13],
    [20, 13],
  ],
  [
    [3, 5],
    [8, 5],
    [8, 14],
    [14, 14],
    [14, 6],
    [20, 6],
  ],
  [
    [3, 13],
    [8, 13],
    [8, 4],
    [16, 4],
    [16, 13],
    [20, 13],
  ],
  [
    [3, 9],
    [8, 9],
    [8, 4],
    [16, 4],
    [16, 10],
    [20, 10],
  ],
];
const dist = (a: XY, b: XY) => Math.hypot(a.x - b.x, a.y - b.y);
const angle = (v: number) => Math.atan2(Math.sin(v), Math.cos(v));
const at = (p: number[]): XY => ({ x: p[0] + 0.5, y: p[1] + 0.5 });
export function availableSector(zone: number, rank: number) {
  return zone === 4 && rank < 4 ? 0 : zone;
}
export function makeWorld(
  zone: number,
  mode: Mode,
  pass: Pass,
  wave = 1,
  loadout = 0,
  carry?: number,
) {
  const rank = availableSector(zone % 5, pass.rank),
    maxHp = 100 + pass.upgrades[1] * 15,
    route = routes[rank],
    grid = Array.from({ length: H }, () => Array.from({ length: W }, () => 1));
  function room(x: number, y: number, r: number) {
    for (let j = y - r; j <= y + r; j++)
      for (let i = x - r; i <= x + r; i++)
        if (i > 0 && j > 0 && i < W - 1 && j < H - 1) grid[j][i] = 0;
  }
  for (let i = 0; i < route.length; i++) {
    const [x, y] = route[i];
    room(x, y, i === 5 ? 2 : 1);
    if (i) {
      const [a, b] = route[i - 1];
      for (let u = Math.min(x, a); u <= Math.max(x, a); u++) room(u, b, 1);
      for (let v = Math.min(y, b); v <= Math.max(y, b); v++) room(x, v, 1);
    }
  }
  // A service loop and cache alcove give each station a second approach.
  const alc = [route[2][0] - 3, route[2][1]];
  for (let x = alc[0]; x <= route[2][0]; x++) room(x, alc[1], 1);
  for (let y = Math.min(route[1][1], route[4][1]); y <= Math.max(route[1][1], route[4][1]); y++)
    room(route[1][0], y, 1);
  for (let x = route[1][0]; x <= route[4][0]; x++) room(x, route[4][1], 1);
  const props: Prop[] = [],
    mobs: Mob[] = [];
  const prop = (type: Prop['type'], p: number[]) => props.push({ ...at(p), type, active: true });
  const mob = (kind: number, p: number[], n: number) => {
    const hp = kind === 3 ? 180 : kind === 1 ? 35 : kind === 2 ? 42 : 25;
    mobs.push({ ...at(p), kind, hp, max: hp, clock: 2 + n * 0.7, phase: n * 2, wind: 0 });
  };
  prop('key', route[2]);
  prop('exit', route[5]);
  prop('secret', alc);
  prop('cool', route[1]);
  prop('med', [route[4][0], route[4][1] + 1]);
  if (rank === 1 || rank === 4) {
    prop('relay', route[1]);
    prop('relay', route[3]);
  }
  for (let j = 0; j < (mode === 'nightmare' ? Math.min(12, 3 + wave) : 4); j++) {
    const p = route[1 + (j % 4)];
    mob((j + rank) % 3, [p[0] + (j % 2), p[1] + (j % 3 === 0 ? 0 : 1)], j);
  }
  if (rank === 4) mob(3, [route[5][0] - 1, route[5][1]], 5);
  if (mode === 'foundry')
    pass.lab.forEach((type, i) => {
      const p = route[i];
      if (type === 1) mob(1, [p[0] + 1, p[1]], i + 2);
      else prop((['cool', 'cool', 'relay', 'med'] as const)[type], [p[0], p[1] + 1]);
    });
  return {
    grid,
    props,
    mobs,
    route,
    zone: rank,
    mode,
    wave,
    player: { ...at(route[0]), a: 0 },
    profile: sampleFromChart(),
    hp:
      carry === undefined
        ? maxHp
        : Math.min(maxHp, Math.max(1, carry) + (mode === 'episode' ? 12 : 0)),
    maxHp,
    salvage: 0,
    heat: 0,
    charge: 100,
    kit: loadout,
    batch: 1 + pass.preset,
    upgrades: [...pass.upgrades],
    key: false,
    kills: 0,
    items: 0,
    secrets: 0,
    relays: 0,
    time: 0,
    score: 0,
    cooldown: 0,
    flash: 0,
    hurt: 0,
    locked: 0,
    notice: 'entry',
    noticeTime: 3,
    status: 'live' as 'live' | 'win' | 'lost',
    rays: [] as (XY & { a: number; life: number; damage: number })[],
    cue: [] as Cue[],
    total: mobs.length,
  };
}
export type World = ReturnType<typeof makeWorld>;
export function wall(w: World, x: number, y: number) {
  return w.grid[Math.floor(y)]?.[Math.floor(x)] !== 0;
}
export function sight(w: World, a: XY, b: XY) {
  const d = dist(a, b),
    steps = Math.ceil(d * 5);
  for (let i = 1; i < steps; i++)
    if (wall(w, a.x + ((b.x - a.x) * i) / steps, a.y + ((b.y - a.y) * i) / steps)) return false;
  return true;
}
function move(w: World, p: XY, dx: number, dy: number) {
  const r = 0.35;
  if (!wall(w, p.x + dx + Math.sign(dx) * r, p.y)) p.x += dx;
  if (!wall(w, p.x, p.y + dy + Math.sign(dy) * r)) p.y += dy;
}
function msg(w: World, key: string, c?: Cue) {
  w.notice = key;
  w.noticeTime = 2.4;
  if (c) w.cue.push(c);
}
export function ready(w: World) {
  if (w.mode === 'foundry')
    return (
      w.key &&
      !w.props.some((p) => p.type === 'relay' && p.active) &&
      !w.mobs.some((m) => m.kind === 3 && m.hp > 0)
    );
  return (
    w.key &&
    [
      true,
      w.relays >= 2,
      w.kills >= 3,
      w.secrets >= 1,
      !w.mobs.some((m) => m.kind === 3 && m.hp > 0),
    ][w.zone]
  );
}
export function stats(w: World) {
  const profile = w.profile.sample,
    precision = [1, 0.66, 0.5, 0.82][w.kit];
  return {
    tps: Math.round(
      profile.tps * (0.68 + w.batch * 0.32) * (1 + (1 - precision) * 0.6) * (1 - w.heat * 0.0024),
    ),
    ttft: Math.round(profile.first * (0.73 + w.batch * 0.27) * (1 + w.heat * 0.008)),
    kv: Math.round(5 + w.batch * 22 * precision + w.heat * 0.46),
    perUser: Math.round(profile.perUser / (0.78 + w.batch * 0.22 + w.heat * 0.004)),
  };
}
// Discrete keyboard/touch navigation for motion-sensitive players. One press = one tile;
// objectives, combat, heat and economy are identical to free movement.
export function routeStep(w: World) {
  if (w.status !== 'live') return;
  const target =
    (!w.key && w.props.find((p) => p.active && p.type === 'key')) ||
    ((w.mode === 'foundry' || ((w.zone === 1 || w.zone === 4) && w.relays < 2)) &&
      w.props.find((p) => p.active && p.type === 'relay')) ||
    (w.mode !== 'foundry' &&
      w.zone === 3 &&
      !w.secrets &&
      w.props.find((p) => p.active && p.type === 'secret')) ||
    (!ready(w) && w.mobs.find((m) => m.hp > 0 && (w.zone !== 4 || m.kind === 3))) ||
    w.props.find((p) => p.type === 'exit');
  if (!target) return;
  if ('hp' in target && dist(w.player, target) < 5 && sight(w, w.player, target)) {
    w.player.a = Math.atan2(target.y - w.player.y, target.x - w.player.x);
    msg(w, 'aim');
    return;
  }
  if ('type' in target && dist(w.player, target) < 1.65) {
    if (target.type === 'exit') action(w, 'use');
    else collect(w, target);
    return;
  }
  const id = (x: number, y: number) => Math.floor(x) + Math.floor(y) * W,
    start = id(w.player.x, w.player.y),
    end = id(target.x, target.y),
    q = [start],
    links = new Map<number, number>([[start, -1]]);
  for (let i = 0; i < q.length && !links.has(end); i++) {
    const k = q[i];
    for (const n of [k + 1, k - 1, k + W, k - W])
      if (!links.has(n) && !wall(w, n % W, Math.floor(n / W))) {
        links.set(n, k);
        q.push(n);
      }
  }
  if (!links.has(end)) return;
  let n = end;
  while (links.get(n) !== start && n !== start) n = links.get(n)!;
  const x = (n % W) + 0.5,
    y = Math.floor(n / W) + 0.5;
  w.player.a = Math.atan2(y - w.player.y, x - w.player.x);
  w.player.x = x;
  w.player.y = y;
}
export function action(w: World, command: Action) {
  if (w.status !== 'live') return;
  if (command === 'vent') {
    if (w.locked <= 0 && w.heat > 5) {
      w.heat = Math.max(0, w.heat - 45);
      w.charge = Math.min(100, w.charge + 14);
      w.locked = 0.65;
      msg(w, 'cooled', 'vent');
    }
    return;
  }
  if (command === 'use') {
    const p = w.props
      .filter((candidate) => candidate.active && dist(candidate, w.player) < 2.15)
      .sort((a, b) => dist(a, w.player) - dist(b, w.player))[0];
    if (!p) {
      msg(w, 'near');
      return;
    }
    if (p.type === 'exit') {
      if (!ready(w)) {
        msg(w, 'locked', 'tick');
        return;
      }
      w.status = 'win';
      const sim = stats(w),
        seed = w.profile.sample;
      w.score +=
        600 +
        Math.round(w.hp * 2 + (45 * sim.tps) / seed.tps + (45 * sim.perUser) / seed.perUser) +
        w.secrets * 120;
      msg(w, 'cleared', 'clear');
      return;
    }
    collect(w, p);
    return;
  }
  if (command !== 'fire' || w.cooldown > 0 || w.locked > 0) return;
  const i = w.kit;
  const pulse = stats(w);
  if (pulse.kv > 94) {
    w.locked = 1;
    w.batch = Math.max(1, w.batch - 1);
    w.heat = Math.max(0, w.heat - 25);
    msg(w, 'oom', 'alarm');
    return;
  }
  if (w.charge < [0, 8, 12, 34][i] || w.heat > 92) {
    msg(w, 'overheat', 'alarm');
    w.locked = 0.4;
    return;
  }
  w.flash = 0.17;
  w.cooldown = [0.25, 0.15, 0.21, 0.74][i] + Math.min(0.25, pulse.ttft / 1000) * 0.65;
  w.charge = Math.max(0, w.charge - [0, 8, 12, 34][i]);
  w.heat = Math.min(100, w.heat + [11, 8, 12, 30][i] + w.batch * 1.5);
  w.cue.push((['pulse', 'burst', 'plasma', 'nova'] as const)[i]);
  const nearest = w.mobs
    .filter(
      (m) =>
        m.hp > 0 &&
        sight(w, w.player, m) &&
        Math.abs(angle(Math.atan2(m.y - w.player.y, m.x - w.player.x) - w.player.a)) <
          (i === 3 ? 1.3 : 0.37 + 1 / Math.max(3, dist(m, w.player))),
    )
    .sort((a, b) => dist(a, w.player) - dist(b, w.player));
  for (const m of nearest.slice(0, i === 3 ? 6 : i === 2 ? 2 : 1)) {
    if (
      m.kind === 3 &&
      (w.relays < 2 || Math.sin(w.time * (m.hp <= m.max / 2 ? 2.2 : 1.45)) > 0.72)
    ) {
      msg(w, 'shield', 'tick');
      continue;
    }
    m.hp -= ([22, 15, 26, 64][i] + 4 * w.batch) * (1 + w.upgrades[2] * 0.15);
    m.wind = 0.15;
    if (m.hp <= 0) {
      w.kills++;
      w.score += 85 + m.kind * 20;
      msg(w, 'banish', 'card');
    }
  }
}
function collect(w: World, p: Prop) {
  if (p.type === 'exit') return;
  p.active = false;
  w.items++;
  w.score += 40;
  if (p.type === 'key') {
    w.key = true;
    msg(w, 'key', 'card');
  } else if (p.type === 'relay') {
    w.relays++;
    w.heat = 0;
    msg(w, 'relay', 'vent');
  } else if (p.type === 'secret') {
    w.secrets++;
    w.charge = 100;
    w.score += 120;
    msg(w, 'secret', 'secret');
  } else if (p.type === 'med') {
    w.hp = Math.min(w.maxHp, w.hp + (w.mode === 'nightmare' ? 10 : 18));
    msg(w, 'med', 'card');
  } else {
    w.charge = 100;
    w.heat = 0;
    msg(w, 'cooled', 'vent');
  }
}
export function tick(w: World, keys: Set<Action>, dt: number) {
  if (w.status !== 'live') return;
  dt = Math.min(0.12, dt);
  w.time += dt;
  w.heat = Math.max(0, w.heat - dt * (12 + 2 * w.upgrades[0]));
  w.charge = Math.min(100, w.charge + dt * 7);
  w.cooldown -= dt;
  w.locked -= dt;
  w.flash = Math.max(0, w.flash - dt);
  w.hurt = Math.max(0, w.hurt - dt);
  w.noticeTime -= dt;
  // Grounded coolant relays cool nearby emitters; the refinery runs hotter with a wide batch.
  if (w.zone === 1 && w.props.some((v) => v.type === 'relay' && !v.active && dist(v, w.player) < 3))
    w.heat = Math.max(0, w.heat - dt * 16);
  if (w.zone === 2 && w.batch === 3) w.heat = Math.min(100, w.heat + dt * 7);
  w.player.a = angle(w.player.a + (Number(keys.has('cw')) - Number(keys.has('ccw'))) * dt * 2.3);
  const f = Number(keys.has('forward')) - Number(keys.has('back')),
    side = Number(keys.has('right')) - Number(keys.has('left')),
    s = (dt * 3.4) / Math.max(1, Math.hypot(f, side)),
    c = Math.cos(w.player.a),
    sn = Math.sin(w.player.a);
  move(w, w.player, (c * f - sn * side) * s, (sn * f + c * side) * s);
  if (keys.has('fire')) action(w, 'fire');
  for (const p of w.props)
    if (p.active && p.type !== 'exit' && p.type !== 'secret' && dist(p, w.player) < 0.8)
      collect(w, p);
  for (const m of w.mobs) {
    if (m.hp <= 0) continue;
    const d = dist(m, w.player),
      line = d < 9 && sight(w, m, w.player);
    m.clock -= dt;
    m.wind = Math.max(0, m.wind - dt);
    if (!line) continue;
    const a = Math.atan2(w.player.y - m.y, w.player.x - m.x),
      range = m.kind === 1 ? 0.9 : m.kind === 3 ? 4 : 3.5;
    if (d > range && m.wind <= 0) {
      const drift = m.kind === 2 ? Math.sin(w.time * 2 + m.phase) * 0.8 : 0,
        speed = [0.48, 1.14, 0.6, 0.25][m.kind] * dt;
      move(w, m, Math.cos(a + drift) * speed, Math.sin(a + drift) * speed);
    }
    if (d < range + 0.7 && m.clock <= 0) {
      const enraged = m.kind === 3 && m.hp <= m.max / 2;
      m.clock = m.kind === 3 ? (enraged ? 2 : 3.4) : 3 + m.phase * 0.04;
      m.wind = 0.6;
      const damage =
        (w.mode === 'nightmare' ? 12 + Math.min(8, w.wave) : 9) + (m.kind === 3 ? 5 : 0);
      w.rays.push({ x: m.x, y: m.y, a, life: 2.5, damage });
      if (enraged)
        for (const spread of [-0.18, 0.18])
          w.rays.push({ x: m.x, y: m.y, a: a + spread, life: 2.5, damage });
      if (m.kind === 3) msg(w, 'incoming', 'alarm');
    }
  }
  w.rays = w.rays.filter((r) => {
    r.life -= dt;
    r.x += Math.cos(r.a) * dt * 2.8;
    r.y += Math.sin(r.a) * dt * 2.8;
    if (dist(r, w.player) < 0.44) {
      w.hp = Math.max(0, w.hp - r.damage);
      w.hurt = 0.36;
      w.cue.push('hurt');
      return false;
    }
    return r.life > 0 && !wall(w, r.x, r.y);
  });
  if (w.hp <= 0) {
    w.status = 'lost';
    msg(w, 'failed', 'alarm');
  }
}
