/** Toy queueing model for the arcade, never benchmark measurements. */
import { SHOP, stopFor, type Mode, type ShopItem } from './defense-routes';
import { paintHorizon } from './route-world';
import { paintRoads, paintObstacle, road, target, type Obstacle, type Snowball } from './roadbook';
export const BATCHES = [1, 8, 32, 64] as const;
export type Phase = 'ready' | 'running' | 'paused' | 'shop' | 'won' | 'lost';
export interface Slip {
  id: number;
  lane: number;
  x: number;
  boss: boolean;
  shifted?: boolean;
  wait?: number;
}
export const LANE_COLORS = ['#b73c36', '#387546', '#247888', '#ae521e'];
export function begin(mode: Mode, wave = 1, seed = 285) {
  return {
    mode,
    rehearsal: false,
    phase: 'running' as Phase,
    wave,
    lane: 0,
    batch: 1,
    load: 22,
    throughput: 0,
    seed,
    rng: seed,
    tickets: 3,
    gear: { plow: 0, cache: 0, express: 0, scoop: 0 },
    groups: 1,
    rushed: 0,
    firstReceipt: null as { lane: number; throughput: number; load: number } | null,
    stopTime: 0,
    shots: [] as Snowball[],
    obstacles: [{ id: 0, lane: 1, x: 0.52, kind: (wave - 1) % 5, age: 0 }] as Obstacle[],
    aimX: 0.48,
    aimY: 0.5,
    locked: -1,
    cooldown: 0,
    cleared: 0,
    gateOpen: 0,
    impact: 0,
    impactX: 0.5,
    impactY: 0.5,
    impactHold: 0,
    reserveUsed: false,
    depotRig: 0 as 0 | 1 | 2,
    bestPace: 0,
    precision: 1,
    travel: 0,
    shield: 2,
    lastHazard: 0,
    overdrive: 0,
    stamps: [0, 0, 0, 0, 0],
    stations: [0, 0, 0, 0],
    pace: 0,
    ttft: 0,
    score: 0,
    served: 0,
    waveServed: 0,
    peak: 0,
    strikes: 0,
    streak: 0,
    clock: 0,
    next: Number(stopFor(wave).gap),
    serial: 1,
    glow: 0,
    hit: -1,
    notice: 'go' as Notice,
    lostCase: 11,
    buses: [{ id: 0, lane: 0, x: 0.52, boss: false }] as Slip[],
  };
}
export type Run = ReturnType<typeof begin>;
export type Notice =
  | 'go'
  | 'early'
  | 'clear'
  | 'combo'
  | 'limit'
  | 'vent'
  | 'miss'
  | 'stage'
  | 'boss'
  | 'hero'
  | 'oom'
  | 'finish'
  | 'snack'
  | 'detour'
  | 'funds'
  | 'gear'
  | 'ice'
  | 'block'
  | 'gate'
  | 'yield'
  | 'shot'
  | 'barrage';
export function quota(r: Run) {
  return stopFor(r.wave).quota;
}
export function medal(r: Run) {
  return r.strikes === 0 && r.peak >= 150 ? 3 : r.strikes <= 1 ? 2 : 1;
}
export function buy(r: Run, id: ShopItem) {
  const item = SHOP.find((s) => s.id === id)!;
  if (!['running', 'shop'].includes(r.phase) || r.gear[id] >= 2 || r.tickets < item.cost) {
    r.notice = 'funds';
    return false;
  }
  r.tickets -= item.cost;
  r.gear[id]++;
  r.notice = 'gear';
  return true;
}
export function detour(r: Run) {
  const lead = [...r.buses].sort((a, b) => b.x - a.x).find((b) => b.lane !== r.lane && !b.boss);
  if (!lead || r.phase !== 'running') return false;
  if (r.tickets < 1) {
    r.notice = 'funds';
    return false;
  }
  r.tickets--;
  lead.lane = r.lane;
  lead.shifted = true;
  r.notice = 'detour';
  return true;
}
const zoneOf = (r: Run) => (r.wave - 1) % 5;
export const gateRed = (r: Run) => zoneOf(r) === 1 && r.gateOpen <= 0 && r.stopTime % 8.8 < 3.4;
export function readyAt(r: Run, b: Slip) {
  return b.boss ? 0.14 : zoneOf(r) === 2 ? 0.53 : zoneOf(r) === 3 ? 0.57 : 0.44;
}
export function leadBus(r: Run, lane: number) {
  let lead: Slip | undefined;
  for (const bus of r.buses) if (bus.lane === lane && (!lead || bus.x > lead.x)) lead = bus;
  return lead;
}
function occupiedMerge(r: Run, bus: Slip) {
  return (
    zoneOf(r) === 3 &&
    r.buses.some((b) => b.id < bus.id && b.lane >> 1 === bus.lane >> 1 && b.x > 0.37 && b.x < 0.8)
  );
}
export function dispatchBlock(
  r: Run,
  bus: Slip | undefined,
): 'early' | 'block' | 'gate' | 'yield' | 'boss' | null {
  if (!bus) return 'early';
  const atBay = bus.x >= readyAt(r, bus);
  const barrier = obstruction(r, bus);
  if (barrier && (atBay || bus.x >= barrier.x - 0.045)) return 'block';
  if (gateRed(r) && bus.x >= 0.44 && bus.x < 0.54) return 'gate';
  if (bus.x > 0.4 && occupiedMerge(r, bus)) return 'yield';
  if (!atBay) return 'early';
  if (bus.boss && (BATCHES[r.batch] > 8 || (r.shield === 1 && r.precision !== 2))) return 'boss';
  return null;
}
export function bellCost(r: Run) {
  const skipped = Math.max(0, Math.min(1, r.next / stopFor(r.wave).gap));
  const profile = [0.7, 1, 1.2, 1.4][r.batch] * [0.8, 1, 1.15][r.precision];
  const backlog = r.wave === 1 ? 0 : Math.min(16, Math.max(0, r.rushed - 2) * 2);
  return Math.ceil(skipped * (3 + Math.min(5, r.rushed) + backlog) * profile);
}
export function cycleAim(r: Run) {
  if (r.obstacles.length === 0) return;
  const i = r.obstacles.findIndex((o) => o.id === r.locked),
    o = r.obstacles[(i + 1) % r.obstacles.length];
  const p = target(zoneOf(r), o);
  r.locked = o.id;
  r.aimX = p.x;
  r.aimY = p.y;
}
export function fire(r: Run, x = r.aimX, y = r.aimY) {
  if (r.phase !== 'running' || r.cooldown > 0) return false;
  r.aimX = Math.max(0, Math.min(1, x));
  r.aimY = Math.max(0.12, Math.min(0.98, y));
  r.shots.push({ x: r.aimX, y: r.aimY, lane: r.lane, age: 0 });
  r.cooldown = 0.39 - r.gear.scoop * 0.075;
  return true;
}
function obstruction(r: Run, b: Slip) {
  return r.obstacles.find((o) => o.lane === b.lane && o.x >= b.x - 0.055);
}
function spawn(r: Run) {
  if (r.groups >= quota(r)) return;
  r.groups++;
  const zone = zoneOf(r),
    boss = zone === 4 && r.groups === quota(r);
  r.rng = (Math.imul(r.rng, 1664525) + 1013904223) >>> 0;
  const lane = boss ? 2 : (r.rng >>> 14) % 4;
  r.buses.push({ id: r.serial++, lane, x: 0, boss });
  if (r.groups % 4 === 0 && !boss)
    r.buses.push({ id: r.serial++, lane: (lane + 1) % 4, x: -0.12, boss: false });
  if (r.groups % 2 === 0 || zone === 4 || boss) {
    const kind = zone === 4 ? (r.groups >= 9 ? 4 : 5) : zone;
    const add = (l: number, x: number, k: number) => {
      if (r.obstacles.some((o) => o.lane === l)) return;
      r.obstacles.push({ id: r.serial++, lane: l, x, kind: k, age: 0 });
    };
    add(lane, 0.47 + ((r.rng >>> 19) % 22) / 100, kind);
    if (zone === 4 && r.groups >= 9) {
      add((lane + 2) % 4, 0.7, 4);
      r.notice = 'barrage';
    }
  }
  if (boss) r.notice = 'boss';
}
/** Ring the next scheduled group into the service bay once all prior buses have left.
 * There is no free dispatch: lane, obstruction, tickets, strikes and quota rules still apply. */
export function ringIn(r: Run) {
  if (r.phase !== 'running' || r.buses.length > 0 || r.groups >= quota(r)) return false;
  r.load = Math.min(100, r.load + bellCost(r));
  if (r.load >= 100) {
    r.phase = 'lost';
    r.lostCase = 11;
    r.notice = 'oom';
    return true;
  }
  r.rushed++;
  spawn(r);
  for (const bus of r.buses) bus.x = bus.boss ? 0.14 : 0.46;
  r.next = stopFor(r.wave).gap;
  return true;
}
export function purge(r: Run) {
  if (r.phase !== 'running' || r.gear.cache < 2 || r.reserveUsed) return false;
  r.reserveUsed = true;
  r.load = Math.max(4, r.load - 24);
  r.notice = 'vent';
  return true;
}
/** A workshop exercise in the Lab, using the regular encounter, obstacles and win conditions. */
export function rehearseProfiler(r: Run) {
  if (r.mode !== 'lab' || r.wave !== 5) return;
  r.rehearsal = true;
  r.groups = quota(r) - 1;
  r.buses = [];
  r.obstacles = [];
  spawn(r);
}
export function depart(r: Run) {
  if (r.phase !== 'shop') return false;
  r.wave++;
  r.phase = 'running';
  r.groups = 1;
  r.stopTime = 0;
  r.travel = 0.85;
  r.shield = 2;
  r.gateOpen = 0;
  r.reserveUsed = false;
  r.waveServed = 0;
  r.rushed = 0;
  r.load = Math.max(6, r.load - 12);
  r.notice = r.wave % 4 === 0 ? 'hero' : 'stage';
  r.locked = -1;
  r.shots = [];
  r.obstacles = [{ id: r.serial++, lane: 1, x: 0.51, kind: zoneOf(r), age: 0 }];
  r.buses = [{ id: r.serial++, lane: 0, x: 0.42, boss: false }];
  r.next = stopFor(r.wave).gap;
  return true;
}
export function fitRig(r: Run, rig: 1 | 2) {
  if (r.phase !== 'shop' || r.depotRig !== 0) return false;
  r.depotRig = rig;
  return true;
}
function advanceIfClear(r: Run) {
  if (r.phase !== 'running' || r.groups < quota(r) || r.buses.length > 0) return;
  r.stamps[zoneOf(r)] = medal(r);
  r.obstacles = [];
  r.shots = [];
  if ((r.mode === 'episode' && r.wave === 5) || r.mode === 'lab') {
    r.phase = 'won';
    r.notice = 'finish';
  } else {
    r.phase = 'shop';
    r.tickets += 3;
    r.notice = 'stage';
  }
}
export function step(r: Run, dt: number) {
  if (r.phase !== 'running') return;
  r.clock += dt;
  r.stopTime += dt;
  r.gateOpen = Math.max(0, r.gateOpen - dt);
  r.cooldown = Math.max(0, r.cooldown - dt);
  r.impact = Math.max(0, r.impact - dt);
  const zone = zoneOf(r);
  for (const o of r.obstacles) o.age += dt;
  for (const s of r.shots) {
    s.age += dt;
    if (s.age < 0.22) continue;
    const radius = 0.053 + r.gear.scoop * 0.018;
    const n = r.obstacles.findIndex((o) => {
      const p = target(zone, o);
      return Math.hypot((s.x - p.x) * 1.8, s.y - p.y) < radius;
    });
    if (n !== -1) {
      const [o] = r.obstacles.splice(n, 1);
      r.cleared++;
      r.tickets++;
      r.impact = 0.3;
      r.impactX = s.x;
      r.impactY = s.y;
      r.impactHold = 0.05;
      r.load = Math.max(4, r.load - 3);
      r.notice = 'shot';
      if (o.kind === 1) r.gateOpen = 4;
    }
  }
  r.shots = r.shots.filter((s) => s.age < 0.22);
  r.travel = Math.max(0, r.travel - dt);
  r.overdrive = Math.max(0, r.overdrive - dt);
  r.next -= dt;
  r.glow = Math.max(0, r.glow - dt);
  const stop = stopFor(r.wave);
  r.load = Math.max(5, r.load - dt * (stop.id === 'cache' ? 1.35 : 2.8));
  if (r.next <= 0 && r.groups < quota(r)) {
    r.rushed = 0;
    spawn(r);
    r.next = Math.max(0.85, stop.gap - Math.floor((r.wave - 1) / 5) * 0.15);
  }
  for (const bus of r.buses) {
    const o = obstruction(r, bus);
    const stopped =
      (o && bus.x >= o.x - 0.045) ||
      (gateRed(r) && bus.x >= 0.44 && bus.x < 0.53) ||
      (bus.x > 0.4 && bus.x < 0.59 && occupiedMerge(r, bus));
    if (stopped) {
      bus.wait = (bus.wait ?? 0) + dt;
      r.load += (dt * (o?.kind === 4 ? 2.8 : 1.15)) / (1 + r.gear.cache * 0.35);
      if (bus.wait < 14) continue;
      bus.x = 1;
    }
    bus.x +=
      dt *
      stop.speed *
      (bus.boss ? 0.78 : 1) *
      (stop.id === 'decode' && bus.id % 2 === 0 ? 1.38 : 1);
    if (zone === 2 && !bus.shifted && bus.x > 0.42) {
      bus.lane = (bus.lane + 1) % 4;
      bus.shifted = true;
      r.notice = 'ice';
    }
  }
  for (const bus of r.buses.filter((b) => b.x >= 1)) {
    r.buses = r.buses.filter((b) => b !== bus);
    r.strikes++;
    r.streak = 0;
    r.load += 12;
    r.notice = 'miss';
    if (r.strikes >= 3 || r.load >= 100 || bus.boss) {
      r.phase = 'lost';
      r.lostCase = bus.boss ? 6 : r.load >= 100 ? 11 : (bus.id + r.wave * 3) % 12;
      break;
    }
  }
  if (r.load >= 100) {
    r.load = 100;
    r.phase = 'lost';
    r.lostCase = 11;
    r.notice = 'oom';
  }
  advanceIfClear(r);
}
export function dispatch(r: Run, lane: number) {
  if (r.phase !== 'running') return false;
  r.lane = lane;
  const bus = leadBus(r, lane),
    blocked = dispatchBlock(r, bus);
  if (!bus || blocked) {
    r.notice = blocked ?? 'early';
    return false;
  }
  const batch = BATCHES[r.batch];
  const hero = r.wave % 4 === 0 || r.overdrive > 0;
  const stop = stopFor(r.wave),
    sweet = bus.x >= 0.54;
  if (bus.boss && r.shield > 0) {
    r.shield--;
    bus.x = 0.18;
    bus.lane = r.shield === 1 ? 0 : 2;
    r.tickets++;
    r.notice = 'boss';
    r.glow = 0.4;
    return true;
  }
  r.lastHazard = (bus.id + r.wave * 3) % 12;
  r.streak = sweet ? r.streak + 1 : 0;
  r.throughput = Math.round(
    (36 + batch * 4.5) *
      (hero ? 2 : 1) *
      (lane === 1 && r.streak > 0 ? 1.3 : 1) *
      (sweet ? 1.15 : 1) *
      (1 + r.gear.express * 0.17) *
      (stop.id === 'decode' && r.streak >= 2 ? 1.35 : 1),
  );
  r.pace = Math.round(
    (48 * (hero ? 2 : 1) * (lane === 1 && sweet ? 1.25 : 1)) /
      (1 + batch * 0.033 + r.load / 230 + r.buses.length * 0.025),
  );
  r.throughput = Math.round(r.throughput * [1.24, 1, 0.84][r.precision]);
  r.ttft = Math.round(
    (38 + r.load * 1.6 + batch * (lane === 0 ? 0.7 : 1.6) + r.buses.length * 9) /
      (1 + r.gear.plow * 0.18),
  );
  r.load +=
    (([0, 4, 15, 30][r.batch] + (stop.id === 'cache' ? 4 : 0)) *
      stop.tax *
      (lane === 2 ? 0.55 : 1)) /
      (1 + r.gear.cache * 0.35) -
    (lane === 3 ? 27 : 0);
  if (lane === 2 && batch >= 32) {
    r.load += 8;
    r.notice = 'snack';
  } else r.notice = (['clear', 'combo', 'limit', 'vent'] as const)[lane];
  r.load += (r.precision - 1) * batch * 0.17;
  if (r.stations[lane] === 1) r.load -= 9;
  if (r.stations[lane] === 2) {
    r.throughput = Math.round(r.throughput * 1.3);
    r.load += 5;
  }
  if (r.depotRig === 1) {
    r.throughput = Math.round(r.throughput * 0.9);
    r.load -= 6;
  } else if (r.depotRig === 2) {
    r.throughput = Math.round(r.throughput * 1.2);
    r.load += 5;
  }
  r.load = Math.min(100, Math.max(0, r.load));
  r.firstReceipt ??= { lane, throughput: r.throughput, load: Math.round(r.load) };
  r.peak = Math.max(r.peak, r.throughput);
  r.glow = 0.45;
  r.hit = lane;
  r.served++;
  r.waveServed++;
  r.tickets += sweet ? 2 : 1;
  r.bestPace = Math.max(r.bestPace, r.pace);
  r.score += Math.round(r.throughput * (sweet ? 1.25 : 1) + r.pace * 2 - r.ttft * 0.07);
  r.buses = r.buses.filter((b) => b !== bus);
  if (r.load >= 100) {
    r.phase = 'lost';
    r.notice = 'oom';
    r.lostCase = 11;
    return true;
  }
  advanceIfClear(r);
  return true;
}

export function loadArt() {
  const pictures = new Map<string, HTMLImageElement>();
  for (const id of [
    'bus-stop',
    'school-bus',
    'main-street',
    'pond',
    'elementary',
    'casa',
    'stan',
    'kyle-ski',
    'cop',
    'cartman',
    'kenny',
    'mysterion',
  ]) {
    const img = new Image();
    img.src = `/decorative/south-park/art/${id}.webp`;
    pictures.set(id, img);
  }
  return pictures;
}
const INK = '#233c3b';
function polygon(c: CanvasRenderingContext2D, fill: string, p: number[][]) {
  c.fillStyle = fill;
  c.beginPath();
  for (const [i, [x, y]] of p.entries()) {
    if (i === 0) c.moveTo(x, y);
    else c.lineTo(x, y);
  }
  c.closePath();
  c.fill();
}
function busArt(
  c: CanvasRenderingContext2D,
  x: number,
  y: number,
  boss: boolean,
  compact: boolean,
) {
  c.save();
  c.translate(x, y);
  if (compact) c.scale(0.85, 0.85);
  if (boss) {
    c.fillStyle = '#9cd7bf';
    c.beginPath();
    c.ellipse(0, -7, 9, 6, 0, 0, 7);
    c.fill();
    c.fillStyle = '#7878a6';
    c.beginPath();
    c.ellipse(0, -2, 16, 5, 0, 0, 7);
    c.fill();
    c.fillStyle = '#f5cd4b';
    c.fillRect(-8, -2, 4, 2);
    c.fillRect(3, -2, 4, 2);
  } else {
    polygon(c, INK, [
      [-20, -12],
      [10, -13],
      [16, -5],
      [21, -4],
      [20, 7],
      [-20, 8],
    ]);
    polygon(c, '#f7bf4c', [
      [-18, -10],
      [9, -11],
      [14, -3],
      [18, -2],
      [18, 4],
      [-18, 5],
    ]);
    c.fillStyle = '#e0f0ea';
    for (const xx of [-15, -7, 1]) c.fillRect(xx, -8, 5, 5);
    c.fillStyle = '#283c38';
    c.fillRect(-16, 0, 28, 2);
    for (const xx of [-10, 11]) {
      c.beginPath();
      c.arc(xx, 6, 3.7, 0, 7);
      c.fill();
    }
  }
  c.restore();
}
/** The cast uses the documented studio WebPs; the canvas draws roads and game props. */
export function draw(
  canvas: HTMLCanvasElement,
  images: ReturnType<typeof loadArt>,
  r: Run,
  reduce: boolean,
) {
  const c = canvas.getContext('2d');
  if (!c) return;
  const w = canvas.clientWidth || 600,
    small = w < 460,
    h = small ? 216 : 253,
    dpr = Math.min(devicePixelRatio || 1, 2);
  if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
  }
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
  c.clearRect(0, 0, w, h);
  if (!reduce && r.impact > 0.19)
    c.translate(Math.sin(r.impact * 90) * 1.5, Math.cos(r.impact * 80));
  const ridge = images.get('bus-stop');
  c.fillStyle = '#acd9de';
  c.fillRect(0, 0, w, h);
  if (ridge?.complete && ridge.naturalWidth)
    c.drawImage(
      ridge,
      0,
      ridge.naturalHeight * 0.13,
      ridge.naturalWidth,
      ridge.naturalHeight * 0.58,
      0,
      0,
      w,
      h * 0.42,
    );
  const floor = h * 0.21,
    door = w * 0.95;
  const zone = (r.wave - 1) % 5;
  paintHorizon(c, w, floor, zone, r.travel, reduce, images);
  paintRoads(c, zone, w, h, gateRed(r), r.clock, reduce);
  if (zone === 4) {
    const cartman = images.get('cartman');
    if (cartman?.complete && cartman.naturalWidth) {
      const hh = floor * 0.88,
        ww = (hh * cartman.naturalWidth) / cartman.naturalHeight;
      c.drawImage(cartman, w * 0.67 - ww / 2, 2, ww, hh);
    }
  }
  for (let i = 0; i < 4; i++) {
    const mid = h * road(zone, i, 1),
      originY = h * road(zone, i, 0);
    c.fillStyle = LANE_COLORS[i];
    c.fillRect(2, originY - 8, 17, 17);
    c.fillStyle = 'white';
    c.font = 'bold 12px system-ui';
    c.textAlign = 'center';
    c.fillText(String(i + 1), 10, originY + 4);
    const id = [
        'stan',
        'kyle-ski',
        'cop',
        r.wave % 4 === 0 || r.overdrive > 0 ? 'mysterion' : 'kenny',
      ][i],
      img = images.get(id);
    if (img?.complete && img.naturalWidth) {
      const hh = h * 0.148,
        ww = (hh * img.naturalWidth) / img.naturalHeight;
      c.drawImage(img, door - ww / 2, mid - hh / 2, ww, hh);
    }
    if (r.glow > 0 && r.hit === i && !reduce) {
      c.strokeStyle = LANE_COLORS[i];
      c.lineWidth = 2;
      c.strokeRect(door - 20, mid - 19, 40, 38);
      c.lineWidth = 1;
    }
    const lead = leadBus(r, i);
    for (const bus of r.buses.filter((b) => b.lane === i)) {
      const frac = reduce ? Math.round(bus.x * 18) / 18 : bus.x;
      const x = w * (0.06 + 0.82 * frac),
        y = h * road(zone, i, frac);
      const plate = images.get('school-bus');
      if (!bus.boss && plate?.complete && plate.naturalWidth) {
        const width = small ? 38 : 52;
        c.drawImage(
          plate,
          x - width / 2,
          y - width * 0.2,
          width,
          (width * plate.naturalHeight) / plate.naturalWidth,
        );
      } else busArt(c, x, y, bus.boss, small);
      if (bus === lead && r.phase === 'running') {
        const blocked = dispatchBlock(r, bus);
        if (blocked !== 'early') {
          c.save();
          c.strokeStyle = blocked ? '#a13b31' : '#214f3e';
          c.lineWidth = 2.5;
          if (blocked) c.setLineDash([3, 2]);
          c.strokeRect(x - (small ? 21 : 28), y - 12, small ? 42 : 56, 24);
          c.restore();
        }
      }
    }
  }
  for (const o of r.obstacles) {
    const p = target(zone, o);
    paintObstacle(c, p.x * w, p.y * h, o.kind, o.id === r.locked);
  }
  if (r.phase === 'running') {
    const x = r.aimX * w,
      y = r.aimY * h;
    c.strokeStyle = '#293f3b';
    c.lineWidth = 1.2;
    c.beginPath();
    c.arc(x, y, 8, 0, 7);
    c.moveTo(x - 13, y);
    c.lineTo(x - 5, y);
    c.moveTo(x + 5, y);
    c.lineTo(x + 13, y);
    c.moveTo(x, y - 13);
    c.lineTo(x, y - 5);
    c.stroke();
    if (!reduce)
      for (const s of r.shots) {
        const k = Math.min(1, s.age / 0.22);
        const sx = door + (s.x * w - door) * k,
          sy = h * road(zone, s.lane, 1) * (1 - k) + h * s.y * k - 20 * Math.sin(Math.PI * k);
        c.fillStyle = 'white';
        c.strokeStyle = '#346573';
        c.beginPath();
        c.arc(sx, sy, 5.5, 0, 7);
        c.fill();
        c.stroke();
      }
    if (r.impact > 0) {
      const u = 1 - r.impact / 0.3,
        hitX = w * r.impactX,
        hitY = h * r.impactY;
      c.save();
      if (reduce) {
        c.strokeStyle = '#365740';
        c.lineWidth = 3;
        c.strokeRect(hitX - 11, hitY - 11, 22, 22);
      } else
        for (let i = 0; i < 10; i++) {
          const a = i * 2.399,
            radius = 7 + u * (16 + (i % 3) * 4);
          c.fillStyle = ['#fffdf0', '#4e8f9c', '#e7bb50'][i % 3];
          c.fillRect(
            hitX + Math.cos(a) * radius,
            hitY + Math.sin(a) * radius + u * u * 7,
            3 + (i % 2),
            4,
          );
        }
      c.restore();
    }
  }
}
