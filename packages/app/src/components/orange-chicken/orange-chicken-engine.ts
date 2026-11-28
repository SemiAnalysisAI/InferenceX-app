/**
 * Simulation for the Wok Kitchen: a chef (movement, inertia, dash), woks that batch orders with
 * the serving model, a counter whose memory fills with KV cache, and autonomous agents (a clumsy
 * waiter, pigeons, a sous-chef, the health inspector). The engine has no DOM; the game shell
 * feeds it input and reads its state to draw.
 */
import type { Food } from './orange-chicken-art';
import {
  AUDITS,
  BATCHES,
  FOODS_LIST,
  PREC,
  RUSH_TARGETS,
  clamp,
  mulberry32,
  stepSeconds,
  throughput,
  upgradeLevel,
  userRate,
  type Precision,
  type Target,
  type ZoneConfig,
} from './orange-chicken-model';

export const WORLD_W = 700;
export const WORLD_H = 470;
const CHEF_R = 14;
const WOK_R = 30;
const REACH = 74;
const SHELF_MAX = 6;
const RAIL_MAX = 8;
const OIL_LIFE = 14;
const CARRY_BASE = 2;

export type GameMode = 'campaign' | 'endless' | 'sandbox' | 'challenge';

export type OrderState = 'rail' | 'carried' | 'cooking' | 'ready' | 'delivered' | 'lost';

export interface Order {
  id: number;
  dish: Food;
  tokens: number;
  ctx: number;
  arrival: number;
  patience: number;
  tipBase: number;
  state: OrderState;
  progress: number;
  ttft: number | null;
  sumActive: number;
  steps: number;
  prec: Precision;
  readyAt: number;
  quality: number;
}

export interface Wok {
  id: number;
  x: number;
  y: number;
  prec: Precision;
  slots: number;
  seqs: Order[];
  shelf: Order[];
  stepAcc: number;
  prefill: number;
  fire: number;
  fireAge: number;
  extinguish: number;
  reconf: number;
}

export interface Actor {
  kind: 'chef' | 'sous';
  x: number;
  y: number;
  vx: number;
  vy: number;
  face: number;
  carry: Order[];
  cap: number;
  dash: number;
  dashCool: number;
  hurt: number;
  bob: number;
  /** Steering input for agents (the chef reads `Game.move`). */
  ix?: number;
  iy?: number;
  think?: number;
}

export interface Puddle {
  x: number;
  y: number;
  life: number;
}

export interface Pigeon {
  x: number;
  y: number;
  vx: number;
  vy: number;
  state: 'seek' | 'flee';
  loot: Order | null;
  wing: number;
}

export interface Waiter {
  x: number;
  y: number;
  tx: number;
  ty: number;
  oil: number;
  bump: number;
}

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  kind: 'steam' | 'spark' | 'coin' | 'text' | 'food';
  text?: string;
  food?: Food;
  color?: string;
}

export type GameEvent =
  | { type: 'pickup' | 'load' | 'take' | 'dash' | 'nothing' | 'configure' | 'refuse' | 'ready' }
  | { type: 'serve'; tip: number; combo: number; late: boolean }
  | { type: 'walkout' | 'burn' | 'oom' | 'extinguish' | 'bump' | 'steal' | 'shoo' }
  | { type: 'rush'; start: boolean }
  | { type: 'audit'; index: number; phase: 'start' | 'pass' | 'fail' }
  | { type: 'first'; ttft: number }
  | { type: 'end'; win: boolean };

export interface GameConfig {
  mode: GameMode;
  zone: ZoneConfig;
  upgrades: Record<string, number>;
  calm: boolean;
  loadout: { precision: Precision; batch: number };
  seed: number;
  /** Sandbox knobs, read live. */
  sandbox?: Sandbox;
}

export interface Sandbox {
  arrival: number;
  hw: number;
  oil: boolean;
  pigeons: boolean;
  fire: boolean;
  wind: boolean;
}

export interface Results {
  win: boolean;
  served: number;
  tips: number;
  walkouts: number;
  burns: number;
  ooms: number;
  avgTtft: number;
  avgUser: number;
  avgThr: number;
  inBox: number;
  stars: number;
  score: number;
  time: number;
  audits: number;
  reputation: number;
}

export interface Station {
  x: number;
  y: number;
  w: number;
  h: number;
}

const mean = (list: number[]) =>
  list.length > 0 ? list.reduce((s, v) => s + v, 0) / list.length : 0;

export class Game {
  readonly cfg: GameConfig;
  readonly zone: ZoneConfig;
  readonly emit: (event: GameEvent) => void;
  readonly rand: () => number;
  time = 0;
  paused = false;
  over = false;
  results: Results | null = null;
  rail: Order[] = [];
  woks: Wok[] = [];
  chef: Actor;
  sous: Actor | null = null;
  puddles: Puddle[] = [];
  pigeons: Pigeon[] = [];
  waiter: Waiter | null = null;
  particles: Particle[] = [];
  readonly railBox: Station = { x: 24, y: 12, w: 160, h: 40 };
  pass: Station = { x: 664, y: 140, w: 30, h: 170 };
  /** Keyboard / joystick movement axes, set by the shell. */
  move = { x: 0, y: 0 };
  /** Click-to-move target in world coordinates. */
  goto: { x: number; y: number } | null = null;
  holding = false;
  // Counters and metrics.
  tips = 0;
  served = 0;
  walkouts = 0;
  burns = 0;
  ooms = 0;
  reputation = 100;
  combo = 1;
  strikes = 0;
  wind = 0;
  shake = 0;
  private nextId = 1;
  private nextArrival = 1.5;
  private nextPigeon = 12;
  private rushLeft = 0;
  private nextRush = 40;
  private ttfts: number[] = [];
  private users: number[] = [];
  private thrs: number[] = [];
  private busy = 0;
  private inBoxTime = 0;
  /** What the kitchen is doing right now, for the Pareto panel. */
  op = { user: 0, thr: 0, active: 0, inBox: false };
  target: Target;
  audit = { index: -1, left: 0, progress: 0, passed: 0, next: 16 };
  rushIndex = 0;
  private rushTimer = 25;
  private sousGoal: 'rail' | 'load' | 'shelf' | 'pass' | null = null;
  memory: number;
  readonly hw: number;

  constructor(cfg: GameConfig, emit: (event: GameEvent) => void) {
    this.cfg = cfg;
    this.zone = cfg.zone;
    this.emit = emit;
    this.rand = mulberry32(cfg.seed);
    const upgrades = cfg.upgrades;
    this.hw = 1 - 0.08 * upgradeLevel(upgrades, 'stove');
    this.memory = cfg.zone.memory + 10 * upgradeLevel(upgrades, 'counter');
    this.target = cfg.mode === 'challenge' ? (RUSH_TARGETS[0] as Target) : cfg.zone.target;
    this.chef = this.makeActor('chef', 350, 380);
    this.chef.cap = CARRY_BASE + upgradeLevel(upgrades, 'hands');
    const level = upgradeLevel(upgrades, 'sous');
    if (level > 0) {
      this.sous = this.makeActor('sous', 120, 120);
      this.sous.cap = 1 + (level >= 3 ? 1 : 0);
    }
    const count = cfg.zone.woks;
    const gap = 150;
    const first = WORLD_W / 2 - ((count - 1) * gap) / 2;
    for (let index = 0; index < count; index++) {
      const precision = cfg.zone.precisions.includes(cfg.loadout.precision)
        ? cfg.loadout.precision
        : (cfg.zone.precisions[0] as Precision);
      this.woks.push({
        id: index,
        x: first + index * gap,
        y: 215,
        prec: precision,
        slots: Math.min(cfg.zone.maxBatch, cfg.loadout.batch),
        seqs: [],
        shelf: [],
        stepAcc: 0,
        prefill: 0,
        fire: 0,
        fireAge: 0,
        extinguish: 0,
        reconf: 0,
      });
    }
    if (this.hazard('oil') && cfg.mode !== 'challenge') {
      this.waiter = { x: 560, y: 400, tx: 300, ty: 400, oil: 5, bump: 0 };
    }
    this.nextRush = 40;
  }

  private makeActor(kind: Actor['kind'], x: number, y: number): Actor {
    return {
      kind,
      x,
      y,
      vx: 0,
      vy: 0,
      face: 0,
      carry: [],
      cap: CARRY_BASE,
      dash: 0,
      dashCool: 0,
      hurt: 0,
      bob: 0,
    };
  }

  private hazard(name: 'oil' | 'pigeons' | 'fire' | 'wind' | 'boss'): boolean {
    const sandbox = this.cfg.sandbox;
    if (sandbox && name !== 'boss') return sandbox[name];
    if (this.cfg.mode === 'endless' && name !== 'boss') return name !== 'wind';
    if (this.cfg.mode === 'challenge') return name === 'oil';
    return this.zone.hazards[name];
  }

  private get hwNow(): number {
    return (this.cfg.sandbox?.hw ?? 1) * this.hw;
  }

  /** Memory in use: weights of every cooking wok plus the KV cache of every order in them. */
  memoryUsed(extra: Order | null = null, extraWok: Wok | null = null): number {
    let used = 0;
    for (const wok of this.woks) {
      const n = wok.seqs.length + (extra && extraWok === wok ? 1 : 0);
      if (n === 0 || wok.fire > 0) continue;
      const spec = PREC[wok.prec];
      used += spec.weights;
      for (const seq of wok.seqs) used += seq.ctx * spec.kv;
      if (extra && extraWok === wok) used += extra.ctx * spec.kv;
    }
    return used;
  }

  get rushActive(): boolean {
    return this.rushLeft > 0;
  }

  get quota(): number {
    return this.zone.quota;
  }

  get timeLeft(): number {
    if (this.cfg.mode === 'campaign') return Math.max(0, this.zone.time - this.time);
    if (this.cfg.mode === 'challenge') return Math.max(0, 120 - this.time);
    return Infinity;
  }

  private arrivalRate(): number {
    const base = this.cfg.sandbox ? 0.22 * this.cfg.sandbox.arrival : this.zone.arrival;
    let scale = 1;
    if (this.cfg.mode === 'endless') scale = 1 + this.time / 120;
    if (this.cfg.mode === 'challenge') scale = 1.4;
    return base * scale * (this.rushLeft > 0 ? 2.3 : 1) * (this.cfg.calm ? 0.8 : 1);
  }

  private spawnOrder() {
    if (this.rail.length >= RAIL_MAX) {
      this.loseRep(8, 'walkout');
      this.walkouts++;
      this.emit({ type: 'walkout' });
      return;
    }
    const z = this.zone;
    const r = this.rand;
    const tokens = Math.round(z.tokens[0] + r() * (z.tokens[1] - z.tokens[0]));
    const ctx = Math.round(z.ctx[0] + r() * (z.ctx[1] - z.ctx[0]));
    const order: Order = {
      id: this.nextId++,
      dish: FOODS_LIST[Math.floor(r() * FOODS_LIST.length)] as Food,
      tokens,
      ctx,
      arrival: this.time,
      patience: z.patience * (this.cfg.calm ? 1.3 : 1),
      tipBase: 6 + tokens * 0.8 + ctx * 2,
      state: 'rail',
      progress: 0,
      ttft: null,
      sumActive: 0,
      steps: 0,
      prec: 'FP8',
      readyAt: 0,
      quality: 1,
    };
    this.rail.push(order);
  }

  private loseRep(amount: number, _why: string) {
    if (this.cfg.mode === 'sandbox' || this.cfg.mode === 'challenge') return;
    this.reputation = Math.max(0, this.reputation - amount * (this.zone.id >= 4 ? 0.7 : 1));
    this.combo = 1;
  }

  // ------------------------------------------------------------------ wok control
  /** Changes a wok's precision or batch slots. Only an empty, cool wok can be reconfigured. */
  configure(index: number, precision?: Precision, slots?: number): boolean {
    const wok = this.woks[index];
    if (!wok || wok.seqs.length > 0 || wok.fire > 0) {
      this.emit({ type: 'refuse' });
      return false;
    }
    if (precision && this.zone.precisions.includes(precision) && precision !== wok.prec) {
      wok.prec = precision;
      wok.reconf = 0.8;
    }
    if (slots !== undefined) {
      const clampedSlots = Math.min(this.zone.maxBatch, Math.max(1, slots));
      if (clampedSlots !== wok.slots) {
        wok.slots = clampedSlots;
        wok.reconf = 0.5;
      }
    }
    this.emit({ type: 'configure' });
    return true;
  }

  nearestWok(actor: Actor = this.chef): Wok | null {
    let best: Wok | null = null;
    let bestDistance = Infinity;
    for (const wok of this.woks) {
      const d = Math.hypot(wok.x - actor.x, wok.y + 20 - actor.y);
      if (d < bestDistance) {
        bestDistance = d;
        best = wok;
      }
    }
    return best;
  }

  stepBatch(index: number, direction: 1 | -1) {
    const wok = this.woks[index];
    if (!wok) return;
    const options = BATCHES.filter((b) => b <= this.zone.maxBatch);
    const at = Math.max(
      0,
      options.findIndex((b) => b >= wok.slots),
    );
    const next = options[clamp(at + direction, 0, options.length - 1)] ?? 1;
    this.configure(index, undefined, next);
  }

  // --------------------------------------------------------------- interactions
  private near(actor: Actor, box: Station, reach = 54): boolean {
    const cx = clamp(actor.x, box.x, box.x + box.w);
    const cy = clamp(actor.y, box.y, box.y + box.h);
    return Math.hypot(cx - actor.x, cy - actor.y) <= reach;
  }

  /** The one context action: deliver, take from a shelf, load a wok, or take a ticket. */
  interact(actor: Actor): boolean {
    const isChef = actor.kind === 'chef';
    // Deliver dishes at the pass.
    if (this.near(actor, this.pass, 56) && actor.carry.some((o) => o.state === 'ready')) {
      for (const order of actor.carry.filter((o) => o.state === 'ready')) this.deliver(order);
      actor.carry = actor.carry.filter((o) => o.state !== 'ready' && o.state !== 'delivered');
      return true;
    }
    // Take finished dishes from the nearest shelf.
    const wok = this.nearestWok(actor);
    if (wok && Math.hypot(wok.x - actor.x, wok.y + 30 - actor.y) <= REACH) {
      if (wok.shelf.length > 0 && actor.carry.length < actor.cap) {
        while (wok.shelf.length > 0 && actor.carry.length < actor.cap) {
          const dish = wok.shelf.shift() as Order;
          actor.carry.push(dish);
        }
        if (isChef) this.emit({ type: 'take' });
        return true;
      }
      // Load tickets into the wok.
      const tickets = actor.carry.filter((o) => o.state === 'carried');
      if (tickets.length > 0 && wok.fire <= 0 && wok.reconf <= 0 && wok.seqs.length < wok.slots) {
        for (const ticket of tickets) {
          if (wok.seqs.length >= wok.slots) break;
          this.load(wok, ticket);
          actor.carry = actor.carry.filter((o) => o !== ticket);
          if (wok.fire > 0) break;
        }
        return true;
      }
      if (tickets.length > 0 && isChef) {
        this.emit({ type: 'refuse' });
        return true;
      }
    }
    // Take the oldest ticket from the rail.
    if (
      this.near(actor, this.railBox, 58) &&
      actor.carry.length < actor.cap &&
      this.rail.length > 0
    ) {
      const order = this.rail.shift() as Order;
      order.state = 'carried';
      actor.carry.push(order);
      if (isChef) this.emit({ type: 'pickup' });
      return true;
    }
    if (isChef) this.emit({ type: 'nothing' });
    return false;
  }

  private load(wok: Wok, order: Order) {
    const used = this.memoryUsed(order, wok);
    if (used > this.memory && this.hazard('fire')) {
      // Out of memory: the counter is full, the wok flares up and everything in it is lost.
      for (const seq of wok.seqs) this.lose(seq);
      this.lose(order);
      wok.seqs = [];
      this.ooms++;
      this.ignite(wok);
      this.emit({ type: 'oom' });
      return;
    }
    order.state = 'cooking';
    order.prec = wok.prec;
    wok.seqs.push(order);
    wok.prefill += 0.26 * order.ctx * this.hwNow;
    this.emit({ type: 'load' });
  }

  private ignite(wok: Wok) {
    wok.fire = 10;
    wok.fireAge = 0;
    wok.extinguish = 0;
    this.burns++;
    this.shake = this.cfg.calm ? 0 : 0.35;
    this.loseRep(10, 'burn');
    for (let index = 0; index < 10; index++) this.spark(wok.x, wok.y, '#ff8a2a');
    this.emit({ type: 'burn' });
  }

  private lose(order: Order) {
    order.state = 'lost';
  }

  private deliver(order: Order) {
    const spec = PREC[order.prec];
    const avgActive = order.steps > 0 ? order.sumActive / order.steps : 1;
    const user = userRate(order.prec, avgActive, this.hwNow);
    const speed = clamp(user / this.zone.target.user, 0.5, 1.2);
    const ttft = order.ttft ?? order.patience;
    const first = 1.25 - 0.5 * clamp(ttft / order.patience, 0, 1);
    const cold = clamp(1 - Math.max(0, this.time - order.readyAt - 10) * 0.04, 0.4, 1);
    const factor = first * speed * spec.flavor * cold;
    const gain = 1 + (this.combo - 1);
    const tip = Math.round(order.tipBase * factor * gain);
    this.tips += tip;
    this.served++;
    this.reputation = Math.min(100, this.reputation + 2);
    this.ttfts.push(ttft);
    this.users.push(user);
    this.thrs.push(throughput(order.prec, avgActive, this.hwNow));
    const late = factor < 0.85;
    this.combo = late ? 1 : Math.min(2, Math.round((this.combo + 0.1) * 10) / 10);
    order.state = 'delivered';
    this.text(this.pass.x - 20, this.pass.y + this.pass.h / 2, `+${tip}`, '#f6b93b');
    for (let index = 0; index < 6; index++) this.spark(this.pass.x, this.pass.y + 80, '#f6b93b');
    this.emit({ type: 'serve', tip, combo: this.combo, late });
  }

  // --------------------------------------------------------------------- effects
  private spark(x: number, y: number, color: string) {
    if (this.cfg.calm || this.particles.length > 160) return;
    const angle = this.rand() * Math.PI * 2;
    const speed = 40 + this.rand() * 90;
    this.particles.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 40,
      life: 0.6,
      max: 0.6,
      kind: 'spark',
      color,
    });
  }

  private text(x: number, y: number, text: string, color: string) {
    this.particles.push({ x, y, vx: 0, vy: -34, life: 1.1, max: 1.1, kind: 'text', text, color });
  }

  // ---------------------------------------------------------------------- update
  update(rawDt: number) {
    if (this.over || this.paused) return;
    const dt = Math.min(rawDt, 1 / 20);
    this.time += dt;
    this.shake = Math.max(0, this.shake - dt);
    this.updateOrders(dt);
    for (const wok of this.woks) this.updateWok(wok, dt);
    this.updateActor(this.chef, dt, true);
    if (this.sous) {
      this.thinkSous(this.sous, dt);
      this.updateActor(this.sous, dt, false);
    }
    this.updateHazards(dt);
    this.updateOperatingPoint(dt);
    this.updateParticles(dt);
    this.updateObjectives(dt);
  }

  private updateOrders(dt: number) {
    if (this.cfg.mode === 'sandbox' && this.cfg.sandbox && this.cfg.sandbox.arrival <= 0) {
      // No arrivals in the lab until the slider moves.
    } else {
      this.nextArrival -= dt;
      if (this.nextArrival <= 0) {
        this.spawnOrder();
        this.nextArrival = -Math.log(1 - this.rand()) / Math.max(0.02, this.arrivalRate());
      }
    }
    // Rush hour: a wave of arrivals.
    if (this.rushLeft > 0) {
      this.rushLeft -= dt;
      if (this.rushLeft <= 0) this.emit({ type: 'rush', start: false });
    } else if (this.cfg.mode !== 'sandbox' && this.cfg.mode !== 'challenge' && this.zone.id > 1) {
      this.nextRush -= dt;
      if (this.nextRush <= 0) {
        this.rushLeft = 12;
        this.nextRush = 48;
        this.emit({ type: 'rush', start: true });
      }
    }
    // Customers waiting for a first bite leave when their patience (TTFT) runs out.
    const waiting = [...this.rail, ...this.chef.carry, ...(this.sous?.carry ?? [])].filter(
      (o) => o.state === 'rail' || o.state === 'carried',
    );
    for (const order of waiting) {
      if (this.time - order.arrival > order.patience) {
        order.state = 'lost';
        this.walkouts++;
        this.loseRep(8, 'walkout');
        this.text(this.railBox.x + 80, this.railBox.y + 60, '✕', '#c8321c');
        this.emit({ type: 'walkout' });
      }
    }
    this.rail = this.rail.filter((o) => o.state === 'rail');
    for (const actor of [this.chef, this.sous]) {
      if (actor) actor.carry = actor.carry.filter((o) => o.state !== 'lost');
    }
  }

  private updateWok(wok: Wok, dt: number) {
    wok.reconf = Math.max(0, wok.reconf - dt);
    if (wok.fire > 0) {
      wok.fire -= dt;
      wok.fireAge += dt;
      if (this.rand() < dt * 10)
        this.spark(wok.x + (this.rand() - 0.5) * 40, wok.y - 10, '#ff8a2a');
      if (wok.fireAge > 5.5) {
        // Fire spreads to the next wok along the line.
        const neighbour = this.woks[wok.id + 1] ?? this.woks[wok.id - 1];
        if (neighbour && neighbour.fire <= 0) {
          for (const seq of neighbour.seqs) this.lose(seq);
          neighbour.seqs = [];
          this.ignite(neighbour);
        }
        wok.fireAge = -99;
      }
      // Hold the action key beside it to put it out.
      const chefNear = Math.hypot(wok.x - this.chef.x, wok.y - this.chef.y) < REACH;
      if (chefNear && this.holding) {
        wok.extinguish += dt;
        if (wok.extinguish >= 1.2) {
          wok.fire = 0;
          wok.extinguish = 0;
          wok.reconf = 1;
          this.emit({ type: 'extinguish' });
          this.text(wok.x, wok.y - 30, '✓', '#2f7d4f');
        }
      } else wok.extinguish = Math.max(0, wok.extinguish - dt);
      return;
    }
    if (wok.seqs.length === 0) {
      wok.stepAcc = 0;
      wok.prefill = 0;
    } else if (wok.prefill > 0) {
      wok.prefill -= dt;
      if (wok.prefill <= 0) {
        wok.prefill = 0;
        for (const seq of wok.seqs) {
          if (seq.ttft === null) {
            seq.ttft = this.time - seq.arrival;
            this.emit({ type: 'first', ttft: seq.ttft });
          }
        }
      }
    } else {
      wok.stepAcc += dt;
      let guard = 0;
      while (wok.seqs.length > 0 && guard++ < 6) {
        const step = stepSeconds(wok.prec, wok.seqs.length, this.hwNow);
        if (wok.stepAcc < step) break;
        wok.stepAcc -= step;
        const active = wok.seqs.length;
        const done: Order[] = [];
        for (const seq of wok.seqs) {
          seq.progress++;
          seq.sumActive += active;
          seq.steps++;
          if (seq.progress >= seq.tokens) done.push(seq);
        }
        for (const seq of done) {
          wok.seqs = wok.seqs.filter((o) => o !== seq);
          seq.state = 'ready';
          seq.readyAt = this.time;
          if (wok.shelf.length >= SHELF_MAX) {
            this.lose(seq);
            continue;
          }
          wok.shelf.push(seq);
          this.emit({ type: 'ready' });
        }
      }
      if (this.rand() < dt * (2 + wok.seqs.length)) {
        this.particles.push({
          x: wok.x + (this.rand() - 0.5) * 30,
          y: wok.y - 14,
          vx: (this.rand() - 0.5) * 12,
          vy: -26 - this.rand() * 20,
          life: 1.1,
          max: 1.1,
          kind: 'steam',
        });
      }
    }
    // Dishes that sit on the shelf too long go cold.
    for (const dish of wok.shelf)
      dish.quality = clamp(1 - Math.max(0, this.time - dish.readyAt - 10) * 0.04, 0.4, 1);
  }

  private updateActor(actor: Actor, dt: number, isChef: boolean) {
    actor.bob += dt * (Math.hypot(actor.vx, actor.vy) / 40);
    actor.hurt = Math.max(0, actor.hurt - dt);
    actor.dashCool = Math.max(0, actor.dashCool - dt);
    let ix: number;
    let iy: number;
    if (isChef) {
      ix = this.move.x;
      iy = this.move.y;
      if (ix === 0 && iy === 0 && this.goto) {
        const dx = this.goto.x - actor.x;
        const dy = this.goto.y - actor.y;
        const d = Math.hypot(dx, dy);
        if (d < 8) this.goto = null;
        else {
          ix = dx / d;
          iy = dy / d;
        }
      } else if (ix !== 0 || iy !== 0) this.goto = null;
    } else {
      ix = actor.ix ?? 0;
      iy = actor.iy ?? 0;
    }
    const mag = Math.hypot(ix, iy);
    if (mag > 1) {
      ix /= mag;
      iy /= mag;
    }
    const onOil = this.puddles.some((p) => Math.hypot(p.x - actor.x, p.y - actor.y) < 30);
    const shoes = 1 + 0.08 * upgradeLevel(this.cfg.upgrades, 'shoes');
    const max = (isChef ? 150 : 90 + 15 * upgradeLevel(this.cfg.upgrades, 'sous')) * shoes;
    const accel = onOil ? 140 : 1100;
    actor.vx += (ix * max - actor.vx) * Math.min(1, (accel / max) * dt);
    actor.vy += (iy * max - actor.vy) * Math.min(1, (accel / max) * dt);
    if (onOil) {
      actor.vx *= Math.exp(-0.5 * dt);
      actor.vy *= Math.exp(-0.5 * dt);
    } else {
      const fr = Math.exp(-(mag > 0 ? 1 : 9) * dt);
      actor.vx *= mag > 0 ? 1 : fr;
      actor.vy *= mag > 0 ? 1 : fr;
    }
    if (this.wind !== 0) actor.vx += this.wind * dt;
    if (actor.dash > 0) {
      actor.dash -= dt;
      const dir = Math.atan2(actor.vy, actor.vx);
      const speed = 430;
      actor.vx = Math.cos(dir) * speed;
      actor.vy = Math.sin(dir) * speed;
    }
    actor.x += actor.vx * dt;
    actor.y += actor.vy * dt;
    if (Math.hypot(actor.vx, actor.vy) > 12) actor.face = Math.atan2(actor.vy, actor.vx);
    // Solid things: woks, the rail and the pass.
    for (const wok of this.woks) {
      const dx = actor.x - wok.x;
      const dy = actor.y - wok.y;
      const d = Math.hypot(dx, dy) || 1;
      const min = WOK_R + CHEF_R;
      if (d < min) {
        actor.x = wok.x + (dx / d) * min;
        actor.y = wok.y + (dy / d) * min;
      }
    }
    for (const box of [this.railBox, this.pass]) {
      const cx = clamp(actor.x, box.x, box.x + box.w);
      const cy = clamp(actor.y, box.y, box.y + box.h);
      const dx = actor.x - cx;
      const dy = actor.y - cy;
      const d = Math.hypot(dx, dy);
      if (d < CHEF_R && d > 0) {
        actor.x = cx + (dx / d) * CHEF_R;
        actor.y = cy + (dy / d) * CHEF_R;
      } else if (d === 0) actor.y = box.y + box.h + CHEF_R;
    }
    actor.x = clamp(actor.x, 20, WORLD_W - 20);
    actor.y = clamp(actor.y, 20, WORLD_H - 46);
  }

  /** The sous-chef: take a ticket, load the emptiest wok, collect dishes, deliver them. */
  private thinkSous(sous: Actor, dt: number) {
    const dishes = sous.carry.filter((o) => o.state === 'ready');
    const tickets = sous.carry.filter((o) => o.state === 'carried');
    let target: { x: number; y: number };
    let goal: typeof this.sousGoal;
    const shelfWok = this.woks.find((w) => w.shelf.length > 0 && w.fire <= 0);
    const loadWok = this.woks
      .filter((w) => w.fire <= 0 && w.seqs.length < w.slots && w.reconf <= 0)
      .toSorted((a, b) => a.seqs.length - b.seqs.length)[0];
    const memoryOk = this.memoryUsed() < this.memory * 0.7;
    if (dishes.length > 0) {
      goal = 'pass';
      target = { x: this.pass.x - 30, y: this.pass.y + this.pass.h / 2 };
    } else if (tickets.length > 0 && loadWok && memoryOk) {
      goal = 'load';
      target = { x: loadWok.x, y: loadWok.y + 52 };
    } else if (shelfWok && sous.carry.length < sous.cap) {
      goal = 'shelf';
      target = { x: shelfWok.x, y: shelfWok.y + 52 };
    } else if (this.rail.length > 0 && sous.carry.length < sous.cap && loadWok && memoryOk) {
      goal = 'rail';
      target = { x: this.railBox.x + 80, y: this.railBox.y + 64 };
    } else {
      goal = null;
      target = { x: 190, y: 330 };
    }
    this.sousGoal = goal;
    const dx = target.x - sous.x;
    const dy = target.y - sous.y;
    const d = Math.hypot(dx, dy);
    sous.ix = d > 10 ? dx / d : 0;
    sous.iy = d > 10 ? dy / d : 0;
    sous.think = (sous.think ?? 0) - dt;
    if (goal && d < 46 && sous.think <= 0) {
      sous.think = 0.6;
      this.interact(sous);
    }
  }

  private updateHazards(dt: number) {
    // Wind: a slow gust across the street stall.
    this.wind = this.hazard('wind') ? Math.sin(this.time * 0.5) * 90 : 0;
    if ((this.zone.id === 3 || this.zone.id === 5) && !this.cfg.sandbox) {
      // The courier window rides along the street.
      this.pass.y = 120 + (Math.sin(this.time * 0.6) * 0.5 + 0.5) * 190;
    }
    // Oil puddles fade; the waiter drops them and bumps the chef.
    for (const puddle of this.puddles) puddle.life -= dt;
    this.puddles = this.puddles.filter((p) => p.life > 0);
    const waiter = this.waiter;
    if (waiter && this.hazard('oil')) {
      const dx = waiter.tx - waiter.x;
      const dy = waiter.ty - waiter.y;
      const d = Math.hypot(dx, dy);
      if (d < 12) {
        waiter.tx = 60 + this.rand() * (WORLD_W - 120);
        waiter.ty = 330 + this.rand() * 85;
      } else {
        const speed = this.cfg.calm ? 36 : 56;
        waiter.x += (dx / d) * speed * dt;
        waiter.y += (dy / d) * speed * dt;
      }
      waiter.oil -= dt;
      if (waiter.oil <= 0) {
        waiter.oil = this.cfg.calm ? 9 : 6;
        this.puddles.push({ x: waiter.x, y: waiter.y + 8, life: OIL_LIFE });
      }
      waiter.bump = Math.max(0, waiter.bump - dt);
      for (const actor of [this.chef, this.sous]) {
        if (!actor || actor.dash > 0 || actor.hurt > 0 || waiter.bump > 0) continue;
        if (Math.hypot(actor.x - waiter.x, actor.y - waiter.y) < 26) {
          waiter.bump = 1.5;
          actor.hurt = 1;
          actor.vx = (actor.x - waiter.x) * 6;
          actor.vy = (actor.y - waiter.y) * 6;
          for (const order of actor.carry) {
            if (order.state === 'ready') this.lose(order);
            else {
              order.state = 'rail';
              this.rail.unshift(order);
            }
          }
          actor.carry = [];
          this.shake = this.cfg.calm ? 0 : 0.2;
          this.emit({ type: 'bump' });
        }
      }
    }
    // Pigeons go for dishes on the shelves.
    if (this.hazard('pigeons') && !this.cfg.calm) {
      this.nextPigeon -= dt;
      if (this.nextPigeon <= 0 && this.pigeons.length < 3) {
        this.nextPigeon = this.zone.id >= 4 ? 9 : 13;
        this.pigeons.push({
          x: this.rand() < 0.5 ? -10 : WORLD_W + 10,
          y: 60 + this.rand() * 80,
          vx: 0,
          vy: 0,
          state: 'seek',
          loot: null,
          wing: 0,
        });
      }
    }
    for (const pigeon of this.pigeons) this.updatePigeon(pigeon, dt);
    this.pigeons = this.pigeons.filter(
      (p) => p.x > -60 && p.x < WORLD_W + 60 && p.y > -60 && p.y < WORLD_H + 60,
    );
  }

  private updatePigeon(pigeon: Pigeon, dt: number) {
    pigeon.wing += dt * 18;
    const chefDistance = Math.hypot(this.chef.x - pigeon.x, this.chef.y - pigeon.y);
    const scared = chefDistance < (this.chef.dash > 0 ? 90 : 38);
    if (pigeon.state === 'seek') {
      const wok = this.woks.find((w) => w.shelf.length > 0);
      const tx = wok ? wok.x : WORLD_W / 2;
      const ty = wok ? wok.y + 44 : 120;
      const dx = tx - pigeon.x;
      const dy = ty - pigeon.y;
      const d = Math.hypot(dx, dy) || 1;
      pigeon.vx += ((dx / d) * 120 - pigeon.vx) * Math.min(1, 3 * dt);
      pigeon.vy += ((dy / d) * 120 - pigeon.vy) * Math.min(1, 3 * dt);
      if (wok && d < 20) {
        const loot = wok.shelf.shift();
        if (loot) {
          pigeon.loot = loot;
          loot.state = 'lost';
          this.loseRep(4, 'steal');
          this.emit({ type: 'steal' });
        }
        pigeon.state = 'flee';
      }
      if (scared) {
        pigeon.state = 'flee';
        this.emit({ type: 'shoo' });
      }
    } else {
      const edge = pigeon.x < WORLD_W / 2 ? -1 : 1;
      pigeon.vx += (edge * 190 - pigeon.vx) * Math.min(1, 4 * dt);
      pigeon.vy += (-60 - pigeon.vy) * Math.min(1, 2 * dt);
    }
    pigeon.x += pigeon.vx * dt;
    pigeon.y += pigeon.vy * dt;
  }

  private updateOperatingPoint(dt: number) {
    let thr = 0;
    let seqs = 0;
    let weighted = 0;
    for (const wok of this.woks) {
      const n = wok.seqs.length;
      if (n === 0 || wok.fire > 0) continue;
      const rate = userRate(wok.prec, n, this.hwNow);
      thr += n * rate;
      weighted += n * rate;
      seqs += n;
    }
    const user = seqs > 0 ? weighted / seqs : 0;
    const inBox = seqs > 0 && user >= this.target.user && thr >= this.target.thr;
    this.op = { user, thr, active: seqs, inBox };
    if (seqs > 0) {
      this.busy += dt;
      if (inBox) this.inBoxTime += dt;
    }
    if (this.cfg.mode === 'challenge') {
      this.rushTimer -= dt;
      if (this.rushTimer <= 0) {
        this.rushTimer = 25;
        this.rushIndex = (this.rushIndex + 1) % RUSH_TARGETS.length;
        this.target = RUSH_TARGETS[this.rushIndex] as Target;
      }
    }
  }

  private updateParticles(dt: number) {
    for (const p of this.particles) {
      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.kind === 'spark') p.vy += 160 * dt;
    }
    this.particles = this.particles.filter((p) => p.life > 0);
  }

  private updateObjectives(dt: number) {
    const mode = this.cfg.mode;
    if (mode === 'campaign' && this.zone.hazards.boss) {
      // The health inspector's audits: hold the operating point inside the box.
      const a = this.audit;
      if (a.index < 0) {
        a.next -= dt;
        if (a.next <= 0 && a.passed < AUDITS.length) {
          a.index = a.passed;
          a.left = 20;
          a.progress = 0;
          this.target = AUDITS[a.index] as Target;
          this.emit({ type: 'audit', index: a.index, phase: 'start' });
        }
      } else {
        a.left -= dt;
        if (this.op.inBox) a.progress += dt;
        if (a.progress >= 12) {
          a.passed++;
          this.emit({ type: 'audit', index: a.index, phase: 'pass' });
          a.index = -1;
          a.next = 30;
          this.target = this.zone.target;
          this.reputation = Math.min(100, this.reputation + 10);
        } else if (a.left <= 0) {
          this.emit({ type: 'audit', index: a.index, phase: 'fail' });
          this.loseRep(15, 'audit');
          a.index = -1;
          a.next = 28;
          this.target = this.zone.target;
        }
      }
    }
    if (this.reputation <= 0 && mode !== 'sandbox' && mode !== 'challenge')
      return this.finish(false);
    if (mode === 'campaign') {
      const auditsDone = !this.zone.hazards.boss || this.audit.passed >= AUDITS.length;
      if (this.served >= this.zone.quota && auditsDone) return this.finish(true);
      if (this.timeLeft <= 0) return this.finish(false);
    }
    if (mode === 'challenge' && this.timeLeft <= 0) this.finish(true);
  }

  finish(win: boolean) {
    if (this.over) return;
    this.over = true;
    const inBox = this.busy > 0 ? this.inBoxTime / this.busy : 0;
    let stars = 0;
    if (win && this.cfg.mode === 'campaign') {
      stars = 1;
      if (inBox >= 0.5) stars = 2;
      if (inBox >= 0.75 && this.reputation >= 70 && this.ooms === 0) stars = 3;
    }
    const score =
      this.cfg.mode === 'challenge'
        ? Math.floor(this.inBoxTime * 10 + this.tips / 2 + this.served * 3)
        : Math.floor(this.tips + this.served * 5);
    this.results = {
      win,
      served: this.served,
      tips: this.tips,
      walkouts: this.walkouts,
      burns: this.burns,
      ooms: this.ooms,
      avgTtft: mean(this.ttfts),
      avgUser: mean(this.users),
      avgThr: mean(this.thrs),
      inBox,
      stars,
      score,
      time: this.time,
      audits: this.audit.passed,
      reputation: this.reputation,
    };
    this.emit({ type: 'end', win });
  }

  // ------------------------------------------------------------------ input verbs
  dash(): boolean {
    const chef = this.chef;
    if (chef.dashCool > 0 || this.over) return false;
    const speed = Math.hypot(chef.vx, chef.vy);
    if (speed < 5 && this.move.x === 0 && this.move.y === 0) return false;
    if (this.move.x !== 0 || this.move.y !== 0) {
      chef.vx = this.move.x;
      chef.vy = this.move.y;
    }
    chef.dash = 0.16;
    chef.dashCool = 0.9;
    this.emit({ type: 'dash' });
    return true;
  }

  get sousBusy(): string | null {
    return this.sousGoal;
  }
}
