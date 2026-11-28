/**
 * Simulation for Kamaji's Boiler. Pure TypeScript with no DOM, so the shift can be stepped
 * headlessly. Soot sprites carry requests (coal lumps) down chutes; Howl's door dial picks
 * which chute feeds Calcifer's hearth. Everything in the hearth decodes together as one
 * continuous batch, so a bigger batch raises throughput while each user's tokens slow down:
 * the Pareto trade-off the site charts. KV cache, heat (decode clock), TTFT and goodput
 * against an interactivity SLO decide the score.
 */
import {
  BLEND_SPECS,
  CHAPTERS,
  ENDLESS_WAVES,
  KINDS,
  type Chapter,
  type Hazards,
  type LumpKind,
  type RequestKind,
  type Tuning,
} from './ghibli-boiler-levels';
import type { Blend, Helper, SandboxSettings } from './ghibli-boiler-store';

export const FIELD_W = 480;
export const FIELD_H = 600;
export const DOOR_Y = 408;
export const CHUTE_TOP = 104;
export const HEARTH = { x: 240, y: 520 };
const SPACING = 34;
const WALK = 90;
const ADMIT_GAP = 0.2;
const DROP_TTFT = 15;
const HEAT_LINE = 55;
/** Batch sizes the grate lever steps through. */
export const BATCH_STEPS = [4, 8, 12, 16, 24, 32, 48, 64] as const;

export type Mode = 'campaign' | 'endless' | 'sandbox';

export interface Lump {
  id: number;
  lane: number;
  x: number;
  y: number;
  kind: LumpKind;
  users: number;
  star: boolean;
  born: number;
  state: 'walk' | 'enter' | 'gone';
  enterT: number;
  fromX: number;
  fromY: number;
  carrier: number;
  /** Seconds this lump has sat at the head of its queue (ash crumbles). */
  atDoor: number;
  washed: number;
}

export interface InFlight {
  kind: LumpKind;
  users: number;
  total: number;
  remaining: number;
  kvPerUser: number;
  hold: number;
  star: boolean;
}

export interface Sprite {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  variant: number;
}

export interface Parakeet {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  state: 'in' | 'flee';
}

export interface Sample {
  interactivity: number;
  throughput: number;
  batch: number;
}

export type BoilerEvent =
  | 'door'
  | 'lever'
  | 'admit'
  | 'complete'
  | 'konpeito'
  | 'oom'
  | 'out'
  | 'tag'
  | 'tag-empty'
  | 'gold'
  | 'drop'
  | 'kodama'
  | 'night'
  | 'day'
  | 'wave'
  | 'parakeet'
  | 'shoo'
  | 'stolen'
  | 'surge'
  | 'wave-up'
  | 'warn-kv'
  | 'boss-phase'
  | 'boss-eat'
  | 'boss-hit'
  | 'helper'
  | 'end';

export interface RunSetup {
  mode: Mode;
  chapterIndex: number;
  tuning: Tuning;
  sandbox?: SandboxSettings;
  blend?: Blend;
  helper?: Helper;
  seed?: number;
  /** No-Face's banquet resumes at this phase (a checkpoint earned in an earlier banquet). */
  bossPhase?: 1 | 2 | 3;
}

export interface Result {
  mode: Mode;
  chapterIndex: number;
  goodput: number;
  tokens: number;
  goal: number;
  lanterns: number;
  p50: number;
  p99: number;
  peakThroughput: number;
  walk: number;
  wave: number;
  stars: number;
  timeLeft: number;
  failed: boolean;
  medal: 0 | 1 | 2 | 3;
}

function mulberry(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 1831565813) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function percentile(values: number[], fraction: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(fraction * sorted.length))];
}

const SANDBOX_MIX: Record<SandboxSettings['mix'], Partial<Record<RequestKind, number>>> = {
  balanced: { fp4: 2, fp8: 3, bf16: 2, longkv: 1 },
  fp4: { fp4: 5, fp8: 1 },
  bf16: { bf16: 5, fp8: 1 },
  longkv: { longkv: 4, bf16: 1 },
};

export class BoilerEngine {
  readonly mode: Mode;
  readonly chapter: Chapter;
  readonly chapterIndex: number;
  readonly tuning: Tuning;
  readonly blend: Blend;
  readonly helper: Helper;
  sandbox: SandboxSettings | undefined;
  private rand: () => number;
  private listeners: ((event: BoilerEvent) => void)[] = [];
  private nextId = 1;

  t = 0;
  lanes: number;
  door = 0;
  /** Index into BATCH_STEPS: the player's chosen max batch (the grate lever). */
  lever = 3;
  lumps: Lump[] = [];
  inflight: InFlight[] = [];
  heat = 62;
  lanterns = 3;
  tags: number;
  tagCharge = 0;
  tokens = 0;
  goodput = 0;
  stars = 0;
  ttft: number[] = [];
  dropped = 0;
  served = 0;
  sputter = 0;
  admitCooldown = 0;
  spawnTimer = 0.6;
  curse = 0;
  walk = 0;
  /** 0 day, 1 deep night. */
  night = 0;
  tide = 0;
  wave = 1;
  waveTimer = 0;
  over = false;
  failed = false;
  peakThroughput = 0;
  warawara: Sprite[] = [];
  embers: Sprite[] = [];
  parakeets: Parakeet[] = [];
  noface = { x: 120, throwT: 4, active: false };
  waveFish = { lane: -1, t: 0, timer: 6 };
  surgeTimer = 9;
  riverT = 0;
  goldTimer = 4.5;
  ashTimer = 5;
  parakeetTimer = 6;
  nightClock = 0;
  samples: Sample[] = [];
  pinned: Sample[] = [];
  private sampleTimer = 0;
  private autoTimer = 0;
  private lastKind: LumpKind | null = null;
  private kvWarned = false;
  /** Smoothed meters for the HUD. */
  interactivity = 0;
  throughput = 0;
  /** Seconds the last flash should glow (OOM, tag) for the renderer. */
  flash = { kind: '' as '' | 'oom' | 'tag' | 'out', t: 0 };

  constructor(setup: RunSetup) {
    this.mode = setup.mode;
    this.chapterIndex = Math.max(0, Math.min(CHAPTERS.length - 1, setup.chapterIndex));
    this.chapter = CHAPTERS[setup.mode === 'campaign' ? this.chapterIndex : 2];
    this.tuning = setup.tuning;
    this.sandbox = setup.sandbox;
    this.blend = setup.mode === 'sandbox' ? 'fp8' : (setup.blend ?? 'fp8');
    this.helper = setup.mode === 'sandbox' ? 'none' : (setup.helper ?? 'none');
    this.rand = mulberry(setup.seed ?? Math.floor(Math.random() * 1e9));
    this.lanes = setup.mode === 'campaign' ? this.chapter.lanes : 4;
    this.tags = this.tuning.tags;
    this.noface.active = Boolean(this.hazards.noface || this.hazards.boss);
    const resume = this.hazards.boss ? (setup.bossPhase ?? 1) : 1;
    if (this.hazards.boss)
      this.boss = {
        hp:
          resume === 1
            ? this.chapter.goal
            : Math.round(this.chapter.goal * (resume === 2 ? 0.64 : 0.31)),
        max: this.chapter.goal,
        phase: resume,
        kv: 0,
        eatT: 6,
        size: 1,
      };
  }

  /** No-Face's rampage in the finale; null in every other shift. */
  boss: {
    hp: number;
    max: number;
    phase: 1 | 2 | 3;
    kv: number;
    eatT: number;
    size: number;
  } | null = null;
  private helperT = 0;
  private emptyT = 0;

  /** True while No-Face stands over the open door in his last phase. */
  get doorBlocked(): boolean {
    return Boolean(
      this.boss && this.boss.phase === 3 && Math.abs(this.noface.x - this.laneX(this.door)) < 30,
    );
  }

  on(listener: (event: BoilerEvent) => void) {
    this.listeners.push(listener);
  }

  private emit(event: BoilerEvent) {
    for (const listener of this.listeners) listener(event);
  }

  get hazards(): Hazards {
    if (this.mode === 'campaign') return this.chapter.hazards;
    if (this.mode === 'sandbox') return {};
    return ENDLESS_WAVES[(this.wave - 1) % ENDLESS_WAVES.length];
  }

  /** Hard ceiling from the hearth upgrade (or the sandbox slider). */
  get batchCap(): number {
    return this.mode === 'sandbox' && this.sandbox ? this.sandbox.batchCap : this.tuning.batchCap;
  }

  /** Max batch in force: the lever, clipped to the hearth size. */
  get batchLimit(): number {
    if (this.mode === 'sandbox') return this.batchCap;
    return Math.min(BATCH_STEPS[this.lever], this.batchCap);
  }

  setLever(step: number) {
    if (this.over || this.mode === 'sandbox') return;
    let next = Math.max(0, Math.min(BATCH_STEPS.length - 1, this.lever + step));
    // Raising the lever stops at the hearth's size.
    if (step > 0) while (next > 0 && BATCH_STEPS[next] > this.batchCap) next -= 1;
    if (next === this.lever) return;
    this.lever = next;
    this.emit('lever');
  }

  get kvCap(): number {
    const base =
      this.mode === 'sandbox' && this.sandbox
        ? this.sandbox.kvCap
        : this.tuning.kvCap * (this.mode === 'campaign' ? this.chapter.kvScale : 1);
    return base * (1 - 0.32 * this.night);
  }

  /** KV held by No-Face's swallowed meals in the finale. */
  get bossKv(): number {
    return this.boss?.kv ?? 0;
  }

  get batch(): number {
    let users = 0;
    for (const item of this.inflight) if (item.hold <= 0) users += item.users;
    return users;
  }

  get kv(): number {
    let used = 0;
    for (const item of this.inflight) {
      const progress = item.total > 0 ? 1 - item.remaining / item.total : 1;
      used += item.users * item.kvPerUser * (0.6 + 0.4 * progress);
    }
    return used + this.bossKv;
  }

  get timeLeft(): number {
    if (this.mode !== 'campaign') return Infinity;
    return Math.max(0, this.chapter.seconds - this.t);
  }

  get goal(): number {
    return this.mode === 'campaign' ? this.chapter.goal : 0;
  }

  get slo(): number {
    if (this.mode === 'campaign') return this.chapter.slo;
    return 20 + Math.min(6, this.wave - 1);
  }

  get queueTop(): number {
    return CHUTE_TOP + this.tide * 120;
  }

  laneX(lane: number): number {
    return FIELD_W / 2 + (lane - (this.lanes - 1) / 2) * 104;
  }

  /** Per-user decode speed at batch size `batch`, before kind multipliers. */
  rateAt(batch: number): number {
    const heatFactor = 0.6 + (0.4 * this.heat) / 100;
    const curse = this.curse > 0 ? 0.6 : 1;
    const blend = BLEND_SPECS[this.blend].decode;
    return (64 * this.tuning.decode * blend * heatFactor * curse) / (1 + batch / 14);
  }

  p50() {
    return percentile(this.ttft, 0.5);
  }

  p99() {
    return percentile(this.ttft, 0.99);
  }

  // ----- Player actions -----

  setDoor(lane: number) {
    if (this.over || lane < 0 || lane >= this.lanes || lane === this.door) return;
    this.door = lane;
    this.emit('door');
  }

  moveDoor(step: number) {
    this.setDoor((this.door + step + this.lanes) % this.lanes);
  }

  useTag() {
    if (this.over) return;
    if (this.tags <= 0) {
      this.emit('tag-empty');
      return;
    }
    this.tags -= 1;
    for (const item of this.inflight) item.kvPerUser *= 0.6;
    for (const lump of this.lumps) {
      if (
        lump.state === 'walk' &&
        (lump.kind === 'gold' || lump.kind === 'ash' || lump.kind === 'curse')
      )
        lump.washed = 0.6;
    }
    this.inflight = this.inflight.filter((item) => item.kind !== 'gold' && item.kind !== 'ash');
    this.curse = 0;
    this.flash = { kind: 'tag', t: 0.8 };
    this.emit('tag');
    if (this.boss) {
      // In the finale a herbal tag is a River Spirit dumpling: No-Face coughs up what he ate.
      this.boss.kv = 0;
      this.boss.size = Math.max(1, this.boss.size - 0.4);
      this.damageBoss(this.boss.max * 0.06);
      this.emit('boss-hit');
    }
  }

  /** Shoo the parakeet nearest the point (or nearest the hearth when no point is given). */
  shoo(x?: number, y?: number): boolean {
    let best: Parakeet | null = null;
    let bestDistance = x === undefined ? Infinity : 52;
    for (const bird of this.parakeets) {
      if (bird.state !== 'in') continue;
      const distance =
        x === undefined || y === undefined
          ? Math.hypot(bird.x - HEARTH.x, bird.y - HEARTH.y)
          : Math.hypot(bird.x - x, bird.y - y);
      if (distance < bestDistance) {
        best = bird;
        bestDistance = distance;
      }
    }
    if (!best) return false;
    best.state = 'flee';
    best.vx = best.x < FIELD_W / 2 ? -220 : 220;
    best.vy = -160;
    this.emit('shoo');
    return true;
  }

  /** Field coordinates to a lane, or -1 when the point is not over a chute. */
  laneAt(x: number, y: number): number {
    if (y < 60 || y > DOOR_Y + 50) return -1;
    for (let lane = 0; lane < this.lanes; lane++) {
      if (Math.abs(x - this.laneX(lane)) < 50) return lane;
    }
    return -1;
  }

  pin() {
    this.pinned.push({
      interactivity: this.interactivity,
      throughput: this.throughput,
      batch: this.batch,
    });
    if (this.pinned.length > 12) this.pinned.shift();
  }

  // ----- Simulation -----

  private pick<T extends string>(weights: Partial<Record<T, number>>): T {
    const entries = Object.entries(weights) as [T, number][];
    const total = entries.reduce((sum, [, weight]) => sum + weight, 0);
    let roll = this.rand() * total;
    for (const [key, weight] of entries) {
      roll -= weight;
      if (roll <= 0) return key;
    }
    return entries[0][0];
  }

  private spawn(kind: LumpKind, lane: number, users: number, star = false) {
    const queued = this.lumps.filter((lump) => lump.lane === lane && lump.state === 'walk');
    const tail = queued.length > 0 ? Math.min(...queued.map((lump) => lump.y)) : Infinity;
    if (DOOR_Y - queued.length * SPACING < this.queueTop + 6 || tail < this.queueTop + SPACING) {
      // The chute is full: the request times out before it ever reaches the hearth.
      if (kind !== 'gold' && kind !== 'ash') {
        this.dropped += 1;
        this.ttft.push(DROP_TTFT);
        this.emit('drop');
      }
      return;
    }
    this.lumps.push({
      id: this.nextId++,
      lane,
      x: this.laneX(lane),
      y: this.queueTop - 30,
      kind,
      users,
      star,
      born: this.t,
      state: 'walk',
      enterT: 0,
      fromX: 0,
      fromY: 0,
      carrier: Math.floor(this.rand() * 3),
      atDoor: 0,
      washed: 0,
    });
  }

  private spawnRequest() {
    const chapter = this.chapter;
    const mix =
      this.mode === 'sandbox' && this.sandbox
        ? SANDBOX_MIX[this.sandbox.mix]
        : this.mode === 'endless'
          ? { fp4: 3, fp8: 3, bf16: 2, longkv: this.hazards.river ? 4 : 2 }
          : chapter.mix;
    let kind: LumpKind = this.pick(mix);
    if (this.hazards.curse && this.rand() < 0.12) kind = 'curse';
    const [low, high] = this.mode === 'campaign' ? chapter.users : [1, 4];
    const users = low + Math.floor(this.rand() * (high - low + 1));
    // The first guest of a shift walks to the open door, so the dial makes sense at once.
    const lane = this.served === 0 && this.t < 3 ? this.door : Math.floor(this.rand() * this.lanes);
    this.spawn(kind, lane, users, this.rand() < 0.14);
  }

  private spawnInterval(): number {
    if (this.mode === 'sandbox') return 1 / (this.sandbox?.arrival ?? 1);
    if (this.mode === 'endless') return Math.max(0.55, 1.2 - 0.05 * (this.wave - 1));
    const progress = Math.min(1, this.t / this.chapter.seconds);
    return this.chapter.spawnStart + (this.chapter.spawnEnd - this.chapter.spawnStart) * progress;
  }

  private loseLantern() {
    if (this.mode === 'sandbox') return;
    this.lanterns -= 1;
    if (this.lanterns <= 0) this.finish(true);
  }

  private oom() {
    this.inflight = [];
    this.sputter = 2;
    this.flash = { kind: 'oom', t: 1 };
    this.kvWarned = false;
    this.emit('oom');
    this.loseLantern();
  }

  private finish(failed: boolean) {
    if (this.over) return;
    this.over = true;
    this.failed = failed;
    this.emit('end');
  }

  step(dt: number) {
    if (this.over) return;
    dt = Math.min(dt, 0.05);
    this.t += dt;
    const hazards = this.hazards;
    this.flash.t = Math.max(0, this.flash.t - dt);
    this.sputter = Math.max(0, this.sputter - dt);
    this.admitCooldown -= dt;
    this.curse = Math.max(0, this.curse - dt);

    // Waves in the endless shift.
    if (this.mode === 'endless') {
      this.waveTimer += dt;
      if (this.waveTimer >= 40) {
        this.waveTimer = 0;
        this.wave += 1;
        this.stars += 1;
        if (this.wave % 3 === 1) this.lanterns = Math.min(3, this.lanterns + 1);
        this.tags = Math.min(this.tuning.tags, this.tags + 1);
        this.noface.active = Boolean(this.hazards.noface);
        this.emit('wave-up');
      }
    }

    // Tag recharge (Lin brings them faster).
    if (this.tags < this.tuning.tags) {
      this.tagCharge += dt;
      if (this.tagCharge >= (this.helper === 'lin' ? 13 : 22)) {
        this.tagCharge = 0;
        this.tags += 1;
      }
    } else this.tagCharge = 0;

    // Arrivals.
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) {
      this.spawnTimer = this.spawnInterval() * (0.7 + this.rand() * 0.6);
      this.spawnRequest();
    }

    this.stepHazards(dt, hazards);

    // Sandbox auto door: Kamaji serves the longest queue.
    if (this.mode === 'sandbox' && this.sandbox?.autoDoor) {
      this.autoTimer -= dt;
      if (this.autoTimer <= 0) {
        this.autoTimer = 0.9;
        let best = this.door;
        let bestCount = -1;
        for (let lane = 0; lane < this.lanes; lane++) {
          const count = this.lumps.filter(
            (lump) => lump.lane === lane && lump.state === 'walk',
          ).length;
          if (count > bestCount) {
            best = lane;
            bestCount = count;
          }
        }
        if (best !== this.door) this.door = best;
      }
    }

    this.stepHelper(dt);
    this.stepLumps(dt, hazards);
    this.stepDecode(dt);
    this.stepSprites(dt);

    // Heat: Calcifer burns down when nothing feeds him.
    const decay = 2.2 + this.heat * 0.025 + (this.inflight.length > 0 ? 0 : 2);
    this.heat = Math.max(0, Math.min(100, this.heat - decay * dt));
    if (this.heat <= 0 && this.sputter <= 0) {
      this.heat = 38;
      this.sputter = 2.5;
      this.flash = { kind: 'out', t: 1 };
      this.emit('out');
      this.loseLantern();
    }
    if (hazards.castle && this.heat >= HEAT_LINE) this.walk = Math.min(100, this.walk + dt * 2.1);

    // Meters and samples for the Pareto plot.
    this.sampleTimer += dt;
    if (this.sampleTimer >= 1) {
      this.sampleTimer = 0;
      if (this.batch > 0) {
        this.samples.push({
          interactivity: this.interactivity,
          throughput: this.throughput,
          batch: this.batch,
        });
        if (this.samples.length > 90) this.samples.shift();
      }
    }

    if (this.mode === 'campaign' && this.t >= this.chapter.seconds) this.finish(false);
  }

  private stepHelper(dt: number) {
    if (this.helper === 'kamaji') {
      // Kamaji's long arms swing the dial to the fullest chute once the open one runs dry.
      const open = this.queue(this.door).length;
      this.emptyT = open > 0 ? 0 : this.emptyT + dt;
      if (this.emptyT > 0.8) {
        this.emptyT = 0;
        let best = this.door;
        let bestCount = 0;
        for (let lane = 0; lane < this.lanes; lane++) {
          const queue = this.queue(lane);
          const real = queue.length > 0 && queue[0].kind !== 'gold' && queue[0].kind !== 'ash';
          if (real && queue.length > bestCount) {
            best = lane;
            bestCount = queue.length;
          }
        }
        if (best !== this.door) {
          this.door = best;
          this.emit('helper');
        }
      }
    } else if (this.helper === 'turnip') {
      // Turnip Head hops out to chase parakeets that come too close.
      this.helperT -= dt;
      if (this.helperT <= 0) {
        for (const bird of this.parakeets) {
          if (bird.state === 'in' && Math.hypot(bird.x - HEARTH.x, bird.y - HEARTH.y) < 150) {
            this.shoo(bird.x, bird.y);
            this.helperT = 6;
            this.emit('helper');
            break;
          }
        }
      }
    }
  }

  private damageBoss(amount: number) {
    const boss = this.boss;
    if (!boss) return;
    boss.hp = Math.max(0, boss.hp - amount);
    const phase = boss.hp > boss.max * 0.66 ? 1 : boss.hp > boss.max * 0.33 ? 2 : 3;
    if (phase !== boss.phase) {
      boss.phase = phase;
      this.emit('boss-phase');
    }
    if (boss.hp <= 0) this.finish(false);
  }

  private stepBoss(dt: number) {
    const boss = this.boss;
    if (!boss) return;
    // Phase 2+: he swallows the head of the fullest queue and grows, holding its KV.
    if (boss.phase >= 2) {
      boss.eatT -= dt;
      if (boss.eatT <= 0) {
        boss.eatT = boss.phase === 3 ? 5 : 6.5;
        let target = -1;
        let longest = 0;
        for (let lane = 0; lane < this.lanes; lane++) {
          const length = this.queue(lane).length;
          if (length > longest) {
            longest = length;
            target = lane;
          }
        }
        const meal = target >= 0 ? this.queue(target)[0] : undefined;
        if (meal) {
          meal.state = 'gone';
          if (meal.kind !== 'gold' && meal.kind !== 'ash') {
            this.dropped += 1;
            this.ttft.push(DROP_TTFT);
          }
          boss.kv += 7;
          boss.size = Math.min(2.2, boss.size + 0.2);
          this.emit('boss-eat');
        }
      }
    }
  }

  get heatLine() {
    return HEAT_LINE;
  }

  private stepHazards(dt: number, hazards: Hazards) {
    // No-Face drifts toward the open door and drops fake gold into it.
    if (hazards.noface || hazards.boss) {
      const target = this.laneX(this.door);
      const dx = target - this.noface.x;
      const pace = this.boss ? (this.boss.phase === 3 ? 62 : 52) : 46;
      this.noface.x += Math.sign(dx) * Math.min(Math.abs(dx), pace * dt);
      this.noface.throwT -= dt;
      if (this.noface.throwT <= 0) {
        this.noface.throwT = this.boss
          ? 3.4 + this.rand() * 1.5
          : (this.mode === 'campaign' && this.chapter.id === 'tower' ? 8 : 5.5) + this.rand() * 2.5;
        const lane = this.laneAt(this.noface.x, CHUTE_TOP + 40);
        if (lane >= 0) {
          this.spawn('gold', lane, 1);
          this.emit('gold');
        }
      }
    }
    if (hazards.boss) {
      this.stepBoss(dt);
      if (this.boss && this.boss.phase === 3) {
        this.ashTimer -= dt;
        if (this.ashTimer <= 0) {
          this.ashTimer = 5 + this.rand() * 2;
          this.spawn('ash', Math.floor(this.rand() * this.lanes), 1);
        }
      }
    }
    if (hazards.river) {
      this.surgeTimer -= dt;
      this.riverT = Math.max(0, this.riverT - dt);
      if (this.surgeTimer <= 0) {
        this.surgeTimer = 15 + this.rand() * 4;
        this.riverT = 3;
        for (let index = 0; index < 3; index++)
          this.spawn(
            'longkv',
            Math.floor(this.rand() * this.lanes),
            2 + Math.floor(this.rand() * 2),
          );
        this.emit('surge');
      }
    }
    if (hazards.ash) {
      this.ashTimer -= dt;
      if (this.ashTimer <= 0) {
        this.ashTimer = 6 + this.rand() * 3;
        this.spawn('ash', this.lanes - 1, 1);
      }
    }
    if (hazards.night) {
      this.nightClock += dt;
      const cycle = this.nightClock % 26;
      const before = this.night;
      // Day 0-14, dusk 14-16, night 16-24, dawn 24-26.
      const target =
        cycle < 14 ? 0 : cycle < 16 ? (cycle - 14) / 2 : cycle < 24 ? 1 : 1 - (cycle - 24) / 2;
      this.night = target;
      if (cycle >= 12 && cycle - dt < 12) this.emit('kodama');
      if (before < 1 && target >= 1) this.emit('night');
      if (before > 0 && target <= 0) this.emit('day');
    } else this.night = 0;
    if (hazards.tide) {
      this.tide = 0.5 - 0.5 * Math.cos((this.t / 28) * Math.PI * 2);
      this.waveFish.timer -= dt;
      this.waveFish.t = Math.max(0, this.waveFish.t - dt);
      if (this.waveFish.timer <= 0) {
        this.waveFish.timer = 7 + this.rand() * 3;
        const lane = Math.floor(this.rand() * this.lanes);
        const to =
          lane === 0 ? 1 : lane === this.lanes - 1 ? lane - 1 : lane + (this.rand() < 0.5 ? -1 : 1);
        this.waveFish = { ...this.waveFish, lane, t: 1.2 };
        for (const lump of this.lumps)
          if (lump.state === 'walk' && lump.lane === lane) lump.lane = to;
        this.emit('wave');
      }
      // A high tide spills the top of every queue.
      for (let lane = 0; lane < this.lanes; lane++) {
        const queue = this.queue(lane);
        while (queue.length > 0 && DOOR_Y - (queue.length - 1) * SPACING < this.queueTop) {
          const spilled = queue.pop();
          if (!spilled) break;
          spilled.state = 'gone';
          if (spilled.kind !== 'gold' && spilled.kind !== 'ash') {
            this.dropped += 1;
            this.ttft.push(DROP_TTFT);
            this.emit('drop');
          }
        }
      }
    } else this.tide = 0;
    if (hazards.parakeets) {
      this.parakeetTimer -= dt;
      if (this.parakeetTimer <= 0) {
        this.parakeetTimer = 6 + this.rand() * 4;
        const left = this.rand() < 0.5;
        const x = left ? -20 : FIELD_W + 20;
        const y = 150 + this.rand() * 120;
        const time = 3.2;
        this.parakeets.push({
          id: this.nextId++,
          x,
          y,
          vx: (HEARTH.x - x) / time,
          vy: (HEARTH.y - 40 - y) / time,
          state: 'in',
        });
        this.emit('parakeet');
      }
    }
    for (const bird of this.parakeets) {
      bird.x += bird.vx * dt;
      bird.y += bird.vy * dt;
      if (bird.state === 'in' && Math.hypot(bird.x - HEARTH.x, bird.y - (HEARTH.y - 40)) < 16) {
        // Stolen output tokens: they leave the score.
        const stolen = Math.min(this.goodput, 160);
        this.goodput -= stolen;
        bird.state = 'flee';
        bird.vx = bird.x < FIELD_W / 2 ? -180 : 180;
        bird.vy = -200;
        this.warawara.splice(0, 4);
        this.emit('stolen');
      }
    }
    this.parakeets = this.parakeets.filter(
      (bird) => bird.x > -60 && bird.x < FIELD_W + 60 && bird.y > -60,
    );
  }

  queue(lane: number): Lump[] {
    return this.lumps
      .filter((lump) => lump.lane === lane && lump.state === 'walk')
      .sort((a, b) => b.y - a.y);
  }

  private stepLumps(dt: number, hazards: Hazards) {
    const speed = WALK * this.tuning.walk;
    for (let lane = 0; lane < this.lanes; lane++) {
      const queue = this.queue(lane);
      queue.forEach((lump, index) => {
        const targetY = DOOR_Y - index * SPACING;
        const x = this.laneX(lane);
        lump.x += (x - lump.x) * Math.min(1, dt * 6);
        const mud = hazards.river && lump.kind === 'longkv' ? 0.7 : 1;
        lump.y =
          lump.y < targetY
            ? Math.min(targetY, lump.y + speed * mud * dt)
            : Math.max(targetY, lump.y - speed * dt);
        if (index === 0 && lump.y >= DOOR_Y - 1) lump.atDoor += dt;
        if (lump.kind === 'ash' && lump.atDoor > (this.helper === 'turnip' ? 4 : 8)) {
          lump.state = 'gone';
        } else if (lump.kind !== 'gold' && lump.kind !== 'ash' && this.t - lump.born > DROP_TTFT) {
          // Waited too long: the soot gives up and the request times out.
          lump.state = 'gone';
          this.dropped += 1;
          this.ttft.push(DROP_TTFT);
          this.emit('drop');
        }
        if (lump.washed > 0) {
          lump.washed -= dt;
          if (lump.washed <= 0) lump.state = 'gone';
        }
      });
    }

    // Admission through the open door. Soot still walking into the hearth counts against the
    // batch cap, so a short admission gap cannot overshoot it.
    const head = this.queue(this.door)[0];
    let entering = 0;
    for (const lump of this.lumps) {
      if (lump.state === 'enter' && lump.kind !== 'gold' && lump.kind !== 'ash')
        entering += lump.users;
    }
    if (
      head &&
      head.washed <= 0 &&
      head.y >= DOOR_Y - 1 &&
      this.admitCooldown <= 0 &&
      this.sputter <= 0 &&
      !this.doorBlocked &&
      (head.kind === 'gold' ||
        head.kind === 'ash' ||
        this.batch + entering + head.users <= this.batchLimit)
    ) {
      head.state = 'enter';
      head.enterT = 0;
      head.fromX = head.x;
      head.fromY = head.y;
      this.admitCooldown = ADMIT_GAP;
    }

    for (const lump of this.lumps) {
      if (lump.state !== 'enter') continue;
      lump.enterT += dt / 0.35;
      const eased = Math.min(1, lump.enterT);
      lump.x = lump.fromX + (HEARTH.x - lump.fromX) * eased;
      lump.y = lump.fromY + (HEARTH.y - 10 - lump.fromY) * eased;
      if (lump.enterT >= 1) {
        lump.state = 'gone';
        this.admit(lump);
      }
    }
    this.lumps = this.lumps.filter((lump) => lump.state !== 'gone');
  }

  private admit(lump: Lump) {
    const spec = KINDS[lump.kind];
    const prefill = lump.kind === 'longkv' ? 1.1 : 0.3;
    const real = lump.kind !== 'gold' && lump.kind !== 'ash';
    if (real) {
      this.ttft.push(this.t - lump.born + prefill);
      if (this.ttft.length > 400) this.ttft.shift();
    }
    let kvPerUser = spec.kv * (real ? BLEND_SPECS[this.blend].kv : 1);
    if (real && this.lastKind === lump.kind) kvPerUser *= 1 - this.tuning.prefix;
    if (real) this.lastKind = lump.kind;
    this.inflight.push({
      kind: lump.kind,
      users: lump.users,
      total: spec.tokens,
      remaining: spec.tokens,
      kvPerUser,
      hold: real ? 0 : 6,
      star: lump.star,
    });
    this.heat = Math.max(0, Math.min(100, this.heat + spec.heat * lump.users * 0.4));
    if (lump.kind === 'curse') this.curse = 6;
    this.emit(lump.kind === 'gold' ? 'gold' : 'admit');
    for (let index = 0; index < 3; index++) {
      this.embers.push({
        x: HEARTH.x + (this.rand() - 0.5) * 40,
        y: HEARTH.y - 20,
        vx: (this.rand() - 0.5) * 40,
        vy: -50 - this.rand() * 40,
        life: 0,
        max: 0.8,
        variant: 0,
      });
    }
  }

  private stepDecode(dt: number) {
    const batch = this.batch;
    const rate = this.sputter > 0 ? 0 : this.rateAt(batch);
    let produced = 0;
    let weighted = 0;
    for (const item of this.inflight) {
      if (item.hold > 0) {
        item.hold -= dt;
        continue;
      }
      const speed = KINDS[item.kind].speed * rate;
      const step = Math.min(item.remaining, speed * dt);
      item.remaining -= step;
      produced += step * item.users;
      weighted += speed * item.users;
    }
    const interactivity = batch ? weighted / batch : 0;
    const throughput = dt > 0 ? produced / dt : 0;
    const blend = Math.min(1, dt * 3);
    this.interactivity += (interactivity - this.interactivity) * blend;
    this.throughput += (throughput - this.throughput) * blend;
    this.peakThroughput = Math.max(this.peakThroughput, this.throughput);
    this.tokens += produced;
    const good =
      (interactivity >= this.slo ? produced : produced * 0.5) * BLEND_SPECS[this.blend].quality;
    this.goodput += good;
    if (this.boss && good > 0) this.damageBoss(good);

    const finished = this.inflight.filter(
      (item) => item.hold <= 0 && item.remaining <= 0 && item.total > 0,
    );
    if (finished.length > 0) {
      for (const item of finished) {
        this.served += item.users;
        if (item.star) {
          this.stars += 1;
          this.emit('konpeito');
        }
        for (let index = 0; index < Math.min(5, item.users + 1); index++) {
          this.warawara.push({
            x: HEARTH.x + (this.rand() - 0.5) * 60,
            y: HEARTH.y - 30,
            vx: (this.rand() - 0.5) * 24,
            vy: -26 - this.rand() * 22,
            life: 0,
            max: 4 + this.rand() * 2,
            variant: Math.floor(this.rand() * 2),
          });
        }
      }
      this.emit('complete');
    }
    this.inflight = this.inflight.filter((item) => item.hold > 0 || item.remaining > 0);

    const kv = this.kv;
    const cap = this.kvCap;
    if (kv > cap) this.oom();
    else if (kv > cap * 0.86 && !this.kvWarned) {
      this.kvWarned = true;
      this.emit('warn-kv');
    } else if (kv < cap * 0.7) this.kvWarned = false;
  }

  private stepSprites(dt: number) {
    for (const sprite of this.warawara) {
      sprite.life += dt;
      sprite.x += sprite.vx * dt + Math.sin(sprite.life * 2 + sprite.variant) * 8 * dt;
      sprite.y += sprite.vy * dt;
    }
    this.warawara = this.warawara.filter((sprite) => sprite.life < sprite.max && sprite.y > -20);
    if (this.warawara.length > 60) this.warawara.splice(0, this.warawara.length - 60);
    for (const ember of this.embers) {
      ember.life += dt;
      ember.x += ember.vx * dt;
      ember.y += ember.vy * dt;
    }
    this.embers = this.embers.filter((ember) => ember.life < ember.max);
  }

  result(): Result {
    const p99 = this.p99();
    const goal = this.goal;
    let medal: Result['medal'] = 0;
    if (this.boss) {
      if (!this.failed && this.boss.hp <= 0) {
        medal = 1;
        if (this.lanterns >= 2) medal = 2;
        if (this.lanterns >= 3 && this.timeLeft >= 30) medal = 3;
      }
    } else if (this.mode === 'campaign' && !this.failed) {
      const castleOk = !this.chapter.hazards.castle || this.walk >= 100;
      if (this.goodput >= goal && castleOk) {
        medal = 1;
        if (this.lanterns >= 2 && this.goodput >= goal * 1.25) medal = 2;
        if (this.lanterns >= 3 && this.goodput >= goal * 1.5 && this.p50() <= this.chapter.ttftGold)
          medal = 3;
      }
    }
    return {
      mode: this.mode,
      chapterIndex: this.chapterIndex,
      goodput: Math.round(this.goodput),
      tokens: Math.round(this.tokens),
      // The banquet is won on No-Face's hunger, not a goodput target: no goodput goal to compare.
      goal: this.boss ? 0 : goal,
      lanterns: this.lanterns,
      p50: this.p50(),
      p99,
      peakThroughput: Math.round(this.peakThroughput),
      walk: this.walk,
      wave: this.wave,
      stars: this.stars,
      timeLeft: this.mode === 'campaign' ? this.timeLeft : 0,
      failed: this.failed,
      medal,
    };
  }
}
