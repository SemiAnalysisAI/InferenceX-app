import { addCash, getGtaState } from './gta-store';

/**
 * The heist car's tune, in the terms the dashboard measures.
 *
 * - Batch size: a bigger batch carries more per job (throughput, so a bigger take) and is
 *   slower off the line (a longer wait for the first token, so weaker acceleration).
 * - Precision: FP8 and FP4 run faster than BF16 (a higher top speed) and lose accuracy (every
 *   crash and every police ram costs more health).
 * - KV cache: a warm prefix is not recomputed, so each delivery repairs the car.
 *
 * The phone's garage sells the parts between runs for site cash; the game reads the tune when a
 * run starts and lets the driver change the batch size between jobs, while stopped.
 */
export const BATCHES = [1, 4, 16] as const;
export type Batch = (typeof BATCHES)[number];
export const PRECISIONS = ['bf16', 'fp8', 'fp4'] as const;
export type Precision = (typeof PRECISIONS)[number];

export const UPGRADES = [
  { id: 'fp8', price: 2000 },
  { id: 'kv', price: 3000 },
  { id: 'batch16', price: 4000 },
  { id: 'fp4', price: 6000 },
] as const;
export type UpgradeId = (typeof UPGRADES)[number]['id'];

export interface Loadout {
  batch: Batch;
  precision: Precision;
  owned: UpgradeId[];
}

export interface Tuning {
  /** Multiplier on what each job pays. */
  take: number;
  /** Multiplier on acceleration. */
  accel: number;
  /** Multiplier on top speed. */
  top: number;
  /** Multiplier on health lost to a crash or a ram. */
  damage: number;
  /** Health restored at each delivery. */
  repair: number;
}

export const DEFAULT_LOADOUT: Loadout = { batch: 1, precision: 'bf16', owned: [] };
export const KV_REPAIR = 30;

const BATCH_TAKE: Record<Batch, number> = { 1: 1, 4: 1.5, 16: 2.25 };
const BATCH_ACCEL: Record<Batch, number> = { 1: 1, 4: 0.85, 16: 0.7 };
const PRECISION_TOP: Record<Precision, number> = { bf16: 1, fp8: 1.12, fp4: 1.25 };
const PRECISION_DAMAGE: Record<Precision, number> = { bf16: 1, fp8: 1.35, fp4: 1.8 };
const KEY = 'gta-loadout';

export const batchAllowed = (loadout: Loadout, batch: Batch) =>
  batch !== 16 || loadout.owned.includes('batch16');

export const precisionAllowed = (loadout: Loadout, precision: Precision) =>
  precision === 'bf16' || loadout.owned.includes(precision);

export function tuningOf(loadout: Loadout): Tuning {
  return {
    take: BATCH_TAKE[loadout.batch],
    accel: BATCH_ACCEL[loadout.batch],
    top: PRECISION_TOP[loadout.precision],
    damage: PRECISION_DAMAGE[loadout.precision],
    repair: loadout.owned.includes('kv') ? KV_REPAIR : 0,
  };
}

/** What job number `job` (from 0) pays with this tune. */
export const jobPay = (job: number, tuning: Tuning) => Math.round((1500 + job * 500) * tuning.take);

/** What a full run of `jobs` jobs pays with this tune. */
export function heistPay(jobs: number, tuning: Tuning): number {
  let total = 0;
  for (let job = 0; job < jobs; job++) total += jobPay(job, tuning);
  return total;
}

/** What rolling resistance and air take off a car each second at speed `v` (m/s), in m/s². */
export const dragOf = (v: number) => 0.0009 * v * Math.abs(v) + 0.25 * Math.sign(v);

/**
 * The speed (m/s) a car with this acceleration and gearing levels off at on a flat road: where
 * the engine's `accel * (1 - v / top)` pull equals the drag. This is what the driver gets.
 */
export function cruiseTop(accel: number, top: number): number {
  let low = 0,
    high = top;
  for (let i = 0; i < 40; i++) {
    const v = (low + high) / 2;
    if (accel * (1 - v / top) > dragOf(v)) low = v;
    else high = v;
  }
  return low;
}

/**
 * Seconds from a standstill to 100 km/h on a flat road for a car with this acceleration and
 * gearing (the engine's units, m/s² and m/s), stepped the way the engine steps the car, drag
 * included.
 */
export function launchSeconds(accel: number, top: number): number {
  const goal = 100 / 3.6,
    dt = 1 / 60;
  let v = 0;
  for (let t = dt; t < 60; t += dt) {
    v += accel * (1 - v / top) * dt;
    v -= dragOf(v) * dt;
    if (v >= goal) return t;
  }
  return Infinity;
}

function clean(value: unknown): Loadout {
  const raw = (value && typeof value === 'object' ? value : {}) as Partial<Loadout>;
  const owned = UPGRADES.map((upgrade) => upgrade.id).filter(
    (id) => Array.isArray(raw.owned) && raw.owned.includes(id),
  );
  const loadout: Loadout = { batch: 1, precision: 'bf16', owned };
  const batch = BATCHES.find((option) => option === raw.batch);
  if (batch && batchAllowed(loadout, batch)) loadout.batch = batch;
  const precision = PRECISIONS.find((option) => option === raw.precision);
  if (precision && precisionAllowed(loadout, precision)) loadout.precision = precision;
  return loadout;
}

export function readLoadout(): Loadout {
  try {
    return clean(JSON.parse(localStorage.getItem(KEY) ?? '{}'));
  } catch {
    return clean(null);
  }
}

export function saveLoadout(loadout: Loadout): Loadout {
  const next = clean(loadout);
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Storage may be blocked; the tune still holds for this page view.
  }
  return next;
}

/** Buys a part with site cash. Returns the new loadout, or null when it cannot be bought. */
export function buyUpgrade(id: UpgradeId): Loadout | null {
  const loadout = readLoadout();
  const upgrade = UPGRADES.find((entry) => entry.id === id);
  if (!upgrade || loadout.owned.includes(id) || getGtaState().cash < upgrade.price) return null;
  addCash(-upgrade.price);
  return saveLoadout({ ...loadout, owned: [...loadout.owned, id] });
}

/** The next batch size this loadout may run, after the one it has. */
export function nextBatch(loadout: Loadout): Batch {
  const options = BATCHES.filter((batch) => batchAllowed(loadout, batch));
  return options[(options.indexOf(loadout.batch) + 1) % options.length];
}
