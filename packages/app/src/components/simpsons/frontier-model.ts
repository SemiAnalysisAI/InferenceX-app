/** Arcade simulation, not measured hardware results. Coordinates stay in rink units at any DPR. */
export type Mode = 'shift' | 'endless' | 'lab';
export type Action = 'ollie' | 'horn' | 'less' | 'more' | 'step' | 'alley' | 0 | 1 | 2 | 3;
export interface Item {
  x: number;
  kind: 'donut' | 'rod' | 'check' | 'wave';
  used: boolean;
}
export const batches = [1, 4, 16, 64] as const;
export const limit = 1640;
export type Feedback =
  | 'drop'
  | 'jump'
  | 'cache'
  | 'burn'
  | 'wave'
  | 'clear'
  | 'judge'
  | 'stall'
  | 'oom'
  | 'grind'
  | 'shield'
  | 'crane';
export interface Run {
  mode: Mode;
  stage: number;
  x: number;
  air: number;
  vy: number;
  gear: number;
  cache: number;
  boost: number;
  cooldown: number;
  hits: number;
  donuts: number;
  delivery: 'pickup' | 'carrying' | 'paid' | 'late' | 'busted';
  alert: number;
  alley: boolean;
  timeLeft: number;
  clears: number;
  controlled: boolean;
  tricks: number;
  targetTime: number;
  elapsed: number;
  score: number;
  grades: number[];
  status: 'ready' | 'live' | 'pause' | 'card' | 'over';
  message: Feedback;
  flash: number;
  items: Item[];
  seed: number;
  waves: number;
  tokens: number;
  tickets: number;
  tune: [number, number, number];
  airJumps: number;
  jitter: number;
  pulse: number;
  clearsTotal: number;
  precision: 0 | 1 | 2;
  momentum: number;
  heat: number;
  grind: number;
  boss: {
    phase: 'track' | 'drop' | 'vent' | 'offline';
    time: number;
    armor: number;
    aim: number;
    hit: boolean;
    clean: boolean;
    lastFuse: number;
  };
  samples: number[] | null;
  profile: number;
}
function makeItems(seed: number, stage: number): Item[] {
  const kinds: Item['kind'][] = ['donut', 'rod', 'wave', 'check', 'donut', 'rod', 'wave', 'check'];
  let n = seed >>> 0;
  const jitter = () => ((n = (Math.imul(n, 1664525) + 1013904223) >>> 0) / 2 ** 32 - 0.5) * 64;
  return kinds.map((kind, i) => ({
    kind,
    x: 224 + i * 185 + jitter() + (stage % 3) * 4,
    used: false,
  }));
}
export function newRun(mode: Mode, stage = 0, seed = 601): Run {
  const items = makeItems(seed, stage);
  if (stage % 5 === 1) items[1].kind = 'check';
  if (stage % 5 === 3) {
    items[2].kind = 'donut';
    items[5].kind = 'check';
  }
  if (stage % 5 === 4) {
    items[3].kind = 'rod';
    items[7].kind = 'rod';
  }
  return {
    mode,
    stage,
    seed,
    x: 0,
    air: 0,
    vy: 0,
    gear: 1,
    cache: 0,
    boost: 0,
    cooldown: 0,
    hits: 0,
    donuts: 0,
    delivery: 'pickup',
    alert: 22,
    alley: false,
    timeLeft: 7,
    clears: 0,
    controlled: false,
    tricks: 0,
    targetTime: 0,
    elapsed: 0,
    score: 0,
    grades: [],
    status: 'ready',
    message: 'drop',
    flash: 0,
    items,
    waves: 0,
    tokens: 0,
    tickets: 3,
    tune: [0, 0, 0],
    airJumps: 0,
    jitter: 0,
    pulse: 0,
    clearsTotal: 0,
    precision: 1,
    momentum: 0,
    heat: 0,
    grind: 0,
    boss: { phase: 'track', time: 0, armor: 3, aim: 200, hit: false, clean: false, lastFuse: -10 },
    samples: null,
    profile: 0,
  };
}
export function advanceStage(s: Run) {
  const next = newRun(
    s.mode,
    s.stage + 1,
    s.mode === 'endless' ? Math.floor(Math.random() * 65536) : 601 + (s.stage + 1) * 103,
  );
  Object.assign(s, next, {
    score: s.score,
    grades: s.grades,
    tickets: s.tickets,
    tune: s.tune,
    clearsTotal: s.clearsTotal,
    precision: s.precision,
    samples: s.samples,
    profile: s.profile,
    status: 'live',
    hits: s.mode === 'endless' ? s.hits : 0,
  });
}
export function upgrade(s: Run, i: 0 | 1 | 2) {
  if (s.tickets < 2 || s.tune[i] >= 3) return false;
  s.tickets -= 2;
  s.tune[i]++;
  return true;
}
export function liftOf(o: Item, s: Run) {
  if (o.kind === 'donut') return 43 + Math.sin(s.elapsed * 2 + o.x) * 9;
  if (o.kind === 'wave') return 49 + Math.sin(s.elapsed * 3 + o.x) * 10;
  return o.kind === 'rod' && s.stage % 5 === 4
    ? 20 + 14 * Math.max(0, Math.sin(s.elapsed * 4 + o.x))
    : 20;
}
/** Each path is a periodic sequence of descending Pareto knees and connecting kick-turns. */
const knee = (v: number) => 1 / (1 + Math.exp(-10 * (v - 0.44)));
export function rail(x: number, s: Run) {
  const phase = s.stage % 3,
    period = [495, 400, 560][phase] + s.profile * 46 + (s.mode === 'endless' ? s.seed % 86 : 0);
  const u = (((x % period) + period) % period) / period;
  const v = u < 0.7 ? u / 0.7 : (1 - u) / 0.3;
  const a = s.samples,
    index = a ? v * (a.length - 1) : 0,
    left = Math.floor(index);
  const hill = a
    ? (a[left] + (a[Math.min(left + 1, a.length - 1)] - a[left]) * (index - left)) * 0.74 +
      knee(v) * 0.26
    : knee(v);
  return 147 + hill * [66, 56, 77][phase] + Math.sin((x + phase * 34) / 128) * 9;
}
export function metrics(s: Run) {
  const batch = batches[s.gear],
    loaded = s.gear / 3,
    slope = (rail(s.x + 4, s) - rail(s.x - 4, s)) / 8;
  const inter = Math.max(
    12,
    Math.round(
      84 -
        loaded * 57 +
        slope * 5 +
        (s.boost > 0 ? 22 : 0) +
        Math.min(s.cache, 3) * 2 +
        (1 - s.precision) * 8 -
        s.heat * 2,
    ),
  );
  const throughput = Math.round(inter * batch * (0.92 + 0.025 * Math.min(3, s.cache)));
  const ttft = Math.round(
    47 + loaded * 87 + s.cache * 5 - s.tune[1] * 5 + (s.flash > 0 && s.message === 'burn' ? 74 : 0),
  );
  const p99 = Math.round(
    ttft +
      22 +
      s.jitter * 34 +
      (s.stage % 5 === 4 ? 15 * Math.max(0, Math.sin(s.elapsed * 0.75)) : 0),
  );
  const met = [ttft <= 90, throughput >= 650, inter >= 55, s.cache >= 1 && ttft <= 114, p99 <= 117][
    s.stage % 5
  ];
  const memory = Math.round(
    (5 + batch * 0.27 + (batch === 64 ? 7 : 0) + s.cache * 2.8) * [0.65, 1, 1.6][s.precision],
  );
  const capacity = 34 + s.tune[1] * 6;
  return { batch, inter, throughput, ttft, p99, met, memory, capacity };
}
export function districtPassed(s: Run) {
  return (
    s.controlled &&
    s.tricks + s.donuts > 0 &&
    s.targetTime / Math.max(1, s.elapsed) >= 0.2 &&
    (s.grades.at(-1) ?? 0) >= 5.5 &&
    (s.stage % 5 !== 4 || s.boss.armor === 0)
  );
}
export function input(s: Run, action: Action, sound: (clip: string) => void) {
  if (s.status !== 'live') return;
  if (action === 'alley' && s.delivery === 'carrying' && !s.alley) {
    s.alley = true;
    s.alert = Math.max(0, s.alert - 50);
    s.timeLeft += 2;
    sound('stamp');
  }
  const oldGear = s.gear;
  if (typeof action === 'number') s.gear = action;
  if (action === 'less') s.gear = Math.max(0, s.gear - 1);
  if (action === 'more') s.gear = Math.min(3, s.gear + 1);
  if (s.gear !== oldGear) s.controlled = true;
  if (action === 'ollie' && (s.air === 0 || (s.stage % 5 === 2 && s.airJumps < 2))) {
    s.vy = 267 + s.tune[0] * 19;
    s.air = Math.max(0.1, s.air);
    s.airJumps++;
    s.controlled = true;
    s.message = 'jump';
    s.flash = 0.7;
    sound('ollie');
  }
  if (action === 'horn' && s.cooldown <= 0) {
    s.controlled = true;
    s.boost = 2.65;
    s.cooldown = 5.1 - s.tune[2] * 0.8;
    s.waves++;
    s.message = 'wave';
    s.flash = 1;
    sound('sax');
    if (
      s.stage % 5 === 4 &&
      s.boss.phase === 'vent' &&
      s.boss.clean &&
      s.elapsed - s.boss.lastFuse >= 2
    ) {
      s.boss.clean = false;
      s.boss.lastFuse = s.elapsed;
      s.cooldown = 2.1;
      s.boss.armor--;
      s.boss.phase = s.boss.armor <= 0 ? 'offline' : 'track';
      s.boss.time = 0;
      s.tickets += 2;
      s.message = 'shield';
    }
  }
}
export function tick(s: Run, dt: number, sound: (clip: string) => void) {
  if (s.status !== 'live') return;
  const m = metrics(s);
  s.elapsed += dt;
  if (s.delivery === 'carrying') {
    s.timeLeft = Math.max(0, s.timeLeft - dt);
    s.alert = Math.max(
      0,
      Math.min(100, s.alert + dt * (s.gear > 1 ? 11 : -2) * (s.alley ? 0.4 : 1)),
    );
    if (s.alert === 100) s.delivery = 'busted';
    if (!s.timeLeft) s.delivery = 'late';
  }
  s.targetTime += m.met ? dt : 0;
  s.tokens += m.throughput * dt;
  const slope = (rail(s.x + 4, s) - rail(s.x - 4, s)) / 8;
  s.momentum += (slope * 36 - s.momentum) * Math.min(1, dt * 2.2);
  s.heat = Math.max(0, s.heat - dt * 0.7);
  if (m.memory > m.capacity && s.heat <= 0) {
    s.cache = 0;
    s.heat = 2.8;
    s.gear = Math.max(0, s.gear - 1);
    s.jitter = 2;
    s.message = 'oom';
    s.flash = 1;
    sound('doh');
  }
  if (s.air === 0 && slope > 0.26 && m.met) {
    s.grind += dt;
    if (s.grind >= 1.4) {
      s.grind = 0;
      s.tickets++;
      s.message = 'grind';
      s.flash = 0.7;
      sound('stamp');
    }
  }
  s.x +=
    dt *
    (89 +
      s.momentum -
      s.heat * 4 +
      s.gear * 4 +
      (s.mode === 'endless' ? Math.min(40, s.stage * 4) : 0) +
      (s.boost > 0 ? 23 : 0));
  s.cooldown = Math.max(0, s.cooldown - dt);
  s.boost = Math.max(0, s.boost - dt);
  s.flash = Math.max(0, s.flash - dt);
  if (s.air > 0) {
    s.vy -= dt * (505 + s.gear * 38 + s.cache * 8);
    s.air = Math.max(0, s.air + s.vy * dt);
    if (!s.air) s.airJumps = 0;
  }
  s.jitter = Math.max(0, s.jitter - dt * 0.32);
  // Burns' targeting crane leads the rider, locks its aim, drops, then vents. A sax pulse
  // during the vulnerable vent burns one fuse. Three fuses shut the crane down.
  if (s.stage % 5 === 4 && s.boss.phase !== 'offline') {
    const b = s.boss;
    b.time += dt;
    if (b.phase === 'track') {
      b.aim = s.x + 88 + s.momentum * 0.35;
      if (b.time > 1.55) {
        b.phase = 'drop';
        b.time = 0;
        b.hit = false;
        b.clean = false;
        s.message = 'crane';
        s.flash = 0.8;
      }
    } else if (b.phase === 'drop') {
      if (!b.hit && Math.abs(s.x - b.aim) < 22 && b.time > 0.4) {
        b.hit = true;
        // The first rod crosses the rail, the next swings overhead, and the
        // last fuse electrifies fast batches. The hazard sign changes with it.
        const struck = b.armor === 3 ? s.air < 27 : b.armor === 2 ? s.air > 18 : s.gear > 0;
        if (struck) {
          s.hits++;
          s.jitter = 1.7;
          s.message = 'burn';
          s.flash = 0.8;
          sound('ha-ha');
        } else {
          b.clean = true;
          s.tricks++;
          s.clears++;
          s.tickets++;
        }
      }
      if (b.time > 1.35) {
        b.phase = 'vent';
        b.time = 0;
      }
    } else if (b.time > 1.6) {
      b.phase = 'track';
      b.time = 0;
    }
  }
  if (s.stage % 5 === 3) {
    s.pulse += dt;
    if (s.pulse >= 4 + s.tune[1]) {
      s.pulse = 0;
      s.cache = Math.max(0, s.cache - 1);
    }
  }
  for (const o of s.items) {
    if (o.used || s.x < o.x - 10) continue;
    if (s.x > o.x + 22) {
      o.used = true;
      continue;
    }
    if (o.kind === 'donut' || o.kind === 'wave') {
      if (Math.abs(s.air - liftOf(o, s)) > 27) continue;
      o.used = true;
      s.flash = 0.9;
      if (o.kind === 'donut') {
        s.cache = Math.min(4, s.cache + 1);
        s.gear = Math.min(3, s.gear + 1);
        s.donuts++;
        if (s.delivery === 'pickup') s.delivery = 'carrying';
        s.tickets++;
        s.message = 'cache';
        sound('donuts');
      } else {
        s.boost = 3;
        s.cooldown = 0;
        s.message = 'wave';
        sound('sax');
      }
    } else {
      o.used = true;
      s.flash = 1.15;
      if (
        (s.air > liftOf(o, s) + 4 && !(s.stage % 5 === 1 && o.kind === 'check')) ||
        (o.kind === 'check' && (m.met || s.boost > 0))
      ) {
        s.clears++;
        if (
          s.controlled &&
          (s.air > liftOf(o, s) + 4 || (o.kind === 'check' && (m.met || s.boost > 0)))
        )
          s.tricks++;
        s.clearsTotal++;
        if (o.kind === 'check' && s.delivery === 'carrying') {
          s.delivery = 'paid';
          s.tickets += s.alley ? 2 : 3;
        }
        s.tickets++;
        s.message = 'clear';
        sound('stamp');
      } else {
        s.hits++;
        if (s.delivery === 'carrying') s.alert = Math.min(100, s.alert + 37);
        s.jitter = 1.8;
        s.message = 'burn';
        s.cache = Math.max(0, s.cache - 1);
        sound(s.hits % 2 ? 'ha-ha' : 'doh');
      }
    }
  }
  if (s.x >= limit || (s.mode === 'endless' && s.hits >= 3)) {
    const quality = s.targetTime / Math.max(1, s.elapsed);
    const grade = Math.max(
      0,
      Math.min(
        10,
        Math.round(
          (4.5 +
            quality * 3.5 +
            s.clears * 0.36 +
            s.donuts * 0.4 -
            s.hits * 0.35 +
            (s.stage % 5 === 4 ? (3 - s.boss.armor) * 0.45 : 0)) *
            10,
        ) / 10,
      ),
    );
    s.grades = [...s.grades, grade];
    s.score += Math.round(s.tokens / 55 + grade * 38 + s.clears * 40 + s.donuts * 55);
    if (s.mode === 'lab' || districtPassed(s)) s.tickets += 2;
    s.status =
      (s.mode === 'endless' && s.hits >= 3) ||
      (s.mode === 'shift' && (s.stage === 4 || !districtPassed(s))) ||
      s.mode === 'lab'
        ? 'over'
        : 'card';
    s.message = s.mode === 'endless' && s.hits >= 3 ? 'stall' : 'judge';
    sound(s.message === 'stall' ? 'ha-ha' : 'ay-caramba');
  }
}
