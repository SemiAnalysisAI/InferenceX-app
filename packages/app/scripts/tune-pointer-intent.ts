#!/usr/bin/env bun
/**
 * Offline tuner for the cursor-trajectory prefetch predictor. Simulates aimed mouse movements
 * (Fitts-law timing, minimum-jerk primary submovement with undershoot, corrective submovement,
 * 60Hz sampling) over real link layouts captured at 1440x900, then scores predictor settings.
 *
 *   bun scripts/tune-pointer-intent.ts          compare hover-only, first version and shipped
 *   bun scripts/tune-pointer-intent.ts --grid   also print the Pareto frontier of a parameter grid
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { projectPointer, segmentHitsRect } from '../src/components/ui/pointer-intent';

interface Rect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}
interface El {
  id: string;
  rect: Rect;
  watched: boolean;
}
interface Sample {
  x: number;
  y: number;
  t: number;
}
interface Move {
  samples: Sample[];
  target: El | null;
  clickT: number | null;
}
interface Visit {
  layout: El[];
  moves: Move[];
}
interface Params {
  windowMs: number;
  lookaheadMs: number;
  minSpeed: number;
  slop: number;
  maxDist: number;
  decel: boolean;
  shipped?: boolean;
}
interface Score {
  medGain: number;
  p25Gain: number;
  wastePerVisit: number;
  p90Overshoot: number;
}

const VW = 1440;
const VH = 900;

let seed = 1;
const rand = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32;
const gauss = () => Math.sqrt(-2 * Math.log(rand() + 1e-12)) * Math.cos(2 * Math.PI * rand());
const minJerk = (s: number) => 10 * s ** 3 - 15 * s ** 4 + 6 * s ** 5;
const sorted = (a: number[]) => [...a].sort((x, y) => x - y);
const quantile = (a: number[], q: number) => sorted(a)[Math.floor(a.length * q)] ?? 0;
const inside = (r: Rect, x: number, y: number) =>
  x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;

const raw = JSON.parse(
  readFileSync(path.join(import.meta.dirname, 'pointer-intent-layouts.json'), 'utf8'),
) as Record<string, { id: string | null; r: [number, number, number, number] }[]>;
const ACTIVE: Record<string, string[]> = {
  '/': ['nav-link-home'],
  '/infx/inference': ['tab-trigger-inference', 'nav-link-dashboard'],
};
const layouts: El[][] = Object.entries(raw).map(([page, els]) =>
  els.map((e, i) => ({
    id: e.id ?? `el${i}`,
    rect: { left: e.r[0], top: e.r[1], right: e.r[2], bottom: e.r[3] },
    watched:
      /^(?:nav-link-|tab-trigger-|header-brand|language)/u.test(e.id ?? '') &&
      !ACTIVE[page]?.includes(e.id ?? ''),
  })),
);

function aimed(from: Sample, to: { x: number; y: number }, width: number, t0: number): Sample[] {
  const d = Math.hypot(to.x - from.x, to.y - from.y);
  const mt = Math.max(
    120,
    (100 + 150 * Math.log2(d / Math.max(width, 8) + 1)) * Math.exp(0.15 * gauss()),
  );
  const frac = Math.min(1.02, 0.93 + 0.04 * gauss());
  const mid = { x: from.x + (to.x - from.x) * frac, y: from.y + (to.y - from.y) * frac };
  const curve = 0.06 * gauss() * d;
  const nx = d ? -(to.y - from.y) / d : 0;
  const ny = d ? (to.x - from.x) / d : 0;
  const t1 = mt * 0.72;
  const out: Sample[] = [];
  let t = t0;
  while (t - t0 < mt) {
    t += 16 + (rand() - 0.5) * 2;
    const e = t - t0;
    let x: number;
    let y: number;
    if (e <= t1) {
      const s = minJerk(Math.min(1, e / t1));
      const bow = Math.sin(Math.PI * s) * curve;
      x = from.x + (mid.x - from.x) * s + nx * bow;
      y = from.y + (mid.y - from.y) * s + ny * bow;
    } else {
      const s = minJerk(Math.min(1, (e - t1) / (mt - t1)));
      x = mid.x + (to.x - mid.x) * s;
      y = mid.y + (to.y - mid.y) * s;
    }
    out.push({ x: Math.round(x + 0.4 * gauss()), y: Math.round(y + 0.4 * gauss()), t });
  }
  return out;
}

/** One page visit: movements to links (20%), other controls (35%), flicks (25%), anywhere (20%). */
function visit(layout: El[], moves: number): Move[] {
  const watched = layout.filter((e) => e.watched);
  const other = layout.filter((e) => !e.watched);
  let cur: Sample = { x: 200 + rand() * 1000, y: 300 + rand() * 500, t: 0 };
  const out: Move[] = [];
  for (let i = 0; i < moves; i++) {
    const kind = rand();
    let target: El | null = null;
    let to: { x: number; y: number };
    let width: number;
    if (kind < 0.2) target = watched[Math.floor(rand() * watched.length)]!;
    else if (kind < 0.55) target = other[Math.floor(rand() * other.length)]!;
    if (target) {
      const r = target.rect;
      to = {
        x: r.left + (r.right - r.left) * (0.2 + 0.6 * rand()),
        y: r.top + (r.bottom - r.top) * (0.25 + 0.5 * rand()),
      };
      width = Math.min(r.right - r.left, r.bottom - r.top);
    } else if (kind < 0.8) {
      const a = rand() * 2 * Math.PI;
      const dist = 30 + rand() * 250;
      to = { x: cur.x + Math.cos(a) * dist, y: cur.y + Math.sin(a) * dist };
      width = 40;
    } else {
      to = { x: rand() * VW, y: 60 + rand() * (VH - 60) };
      width = 60;
    }
    to.x = Math.max(2, Math.min(VW - 2, to.x));
    to.y = Math.max(2, Math.min(VH - 2, to.y));
    const samples = aimed(cur, to, width, cur.t + 150 + rand() * 600);
    const last = samples.at(-1)!;
    const clickT = target ? last.t + 80 + rand() * 170 : null;
    out.push({ samples, target, clickT });
    cur = { ...last, t: clickT ?? last.t };
  }
  return out;
}

function makeVisits(n: number, s: number): Visit[] {
  seed = s;
  return Array.from({ length: n }, (_, i) => {
    const layout = layouts[i % layouts.length]!;
    return { layout, moves: visit(layout, 25) };
  });
}

function endpoint(win: Sample[], p: Params): { x: number; y: number } | null {
  if (p.shipped) return projectPointer(win);
  const last = win.at(-1)!;
  const first = win[0]!;
  const dt = last.t - first.t;
  if (dt <= 0) return null;
  const vx = (last.x - first.x) / dt;
  const vy = (last.y - first.y) / dt;
  const speed = Math.hypot(vx, vy);
  if (speed < p.minSpeed) return null;
  let dist = speed * p.lookaheadMs;
  const m = win[win.length >> 1]!;
  if (p.decel && win.length >= 3 && m.t > first.t && last.t > m.t) {
    const s1 = Math.hypot(m.x - first.x, m.y - first.y) / (m.t - first.t);
    const s2 = Math.hypot(last.x - m.x, last.y - m.y) / (last.t - m.t);
    const a = (s2 - s1) / (dt / 2);
    if (a < 0) dist = Math.min(dist, (speed * speed) / (2 * -a));
  }
  dist = Math.min(dist, p.maxDist);
  return { x: last.x + (vx / speed) * dist, y: last.y + (vy / speed) * dist };
}

function evaluate(p: Params | null, visits: Visit[]): Score {
  const gains: number[] = [];
  const overshoot: number[] = [];
  let wasted = 0;
  for (const { layout, moves } of visits) {
    const watched = layout.filter((e) => e.watched);
    const firedAt = new Map<string, number>();
    const hoverAt = new Map<string, number>();
    const clicked = new Set<string>();
    for (const move of moves) {
      const s = move.samples;
      for (let i = 0; i < s.length; i++) {
        const cur = s[i]!;
        for (const el of watched) {
          if (!hoverAt.has(el.id) && inside(el.rect, cur.x, cur.y)) hoverAt.set(el.id, cur.t);
        }
        if (!p) continue;
        let j = i;
        while (j > 0 && cur.t - s[j - 1]!.t <= p.windowMs) j--;
        if (i === j) continue;
        const end = endpoint(s.slice(j, i + 1), p);
        if (!end) continue;
        const fin = s.at(-1)!;
        overshoot.push(
          Math.max(
            0,
            Math.hypot(end.x - cur.x, end.y - cur.y) - Math.hypot(fin.x - cur.x, fin.y - cur.y),
          ),
        );
        for (const el of watched) {
          if (!firedAt.has(el.id) && segmentHitsRect(cur.x, cur.y, end.x, end.y, el.rect, p.slop))
            firedAt.set(el.id, cur.t);
        }
      }
      if (move.target?.watched && move.clickT !== null && !clicked.has(move.target.id)) {
        clicked.add(move.target.id);
        const hover = hoverAt.get(move.target.id) ?? move.clickT;
        gains.push(hover - Math.min(firedAt.get(move.target.id) ?? Infinity, hover));
      }
    }
    for (const el of watched) {
      if (!clicked.has(el.id) && (firedAt.has(el.id) || hoverAt.has(el.id))) wasted++;
    }
  }
  return {
    medGain: quantile(gains, 0.5),
    p25Gain: quantile(gains, 0.25),
    wastePerVisit: wasted / visits.length,
    p90Overshoot: quantile(overshoot, 0.9),
  };
}

const fmt = (r: Score) =>
  `gain vs hover med ${String(Math.round(r.medGain)).padStart(4)}ms p25 ${String(Math.round(r.p25Gain)).padStart(4)}ms | waste/visit ${r.wastePerVisit.toFixed(2)} | overshoot p90 ${String(Math.round(r.p90Overshoot)).padStart(4)}px`;

const train = makeVisits(300, 1);
const test = makeVisits(300, 7);
const firstVersion: Params = {
  windowMs: 80,
  lookaheadMs: 160,
  minSpeed: 0.15,
  slop: 6,
  maxDist: Infinity,
  decel: false,
};
const shipped: Params = { ...firstVersion, windowMs: 40, slop: 0, shipped: true };

console.log('test set (300 visits)');
console.log(`  hover only     ${fmt(evaluate(null, test))}`);
console.log(`  first version  ${fmt(evaluate(firstVersion, test))}`);
console.log(`  shipped        ${fmt(evaluate(shipped, test))}`);

if (process.argv.includes('--grid')) {
  const results: { p: Params; r: Score }[] = [];
  for (const windowMs of [40, 60, 80])
    for (const lookaheadMs of [80, 120, 160, 220, 300, 400])
      for (const minSpeed of [0.15, 0.3])
        for (const maxDist of [80, 120, 180, 260, 360, Infinity])
          for (const decel of [false, true]) {
            const p = { windowMs, lookaheadMs, minSpeed, slop: 0, maxDist, decel };
            results.push({ p, r: evaluate(p, train) });
          }
  const dominated = (a: Score, b: Score) =>
    b.medGain >= a.medGain &&
    b.wastePerVisit <= a.wastePerVisit &&
    b.p90Overshoot <= a.p90Overshoot &&
    (b.medGain > a.medGain || b.wastePerVisit < a.wastePerVisit || b.p90Overshoot < a.p90Overshoot);
  const pareto = results
    .filter((a) => a.r.medGain > 50 && !results.some((b) => dominated(a.r, b.r)))
    .sort((a, b) => a.r.wastePerVisit - b.r.wastePerVisit);
  console.log('\nPareto frontier (chosen on train, scored on test)');
  for (const { p } of pareto) {
    const label = `w${p.windowMs} L${p.lookaheadMs} v${p.minSpeed} max${p.maxDist}${p.decel ? ' decel' : ''}`;
    console.log(`  ${label.padEnd(34)}`, fmt(evaluate(p, test)));
  }
}
