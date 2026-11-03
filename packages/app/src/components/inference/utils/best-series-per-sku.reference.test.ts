import { describe, expect, it } from 'vitest';

import type { InferenceData } from '@/components/inference/types';
import { isFrontierEligible, paretoFrontForDirection } from '@/lib/charts/chart-utils';

import { baseSku, bestSeriesPerSku, hypervolume } from './best-series-per-sku';

type Direction = 'upper_right' | 'upper_left' | 'lower_left' | 'lower_right';
const DIRECTIONS: Direction[] = ['upper_right', 'upper_left', 'lower_left', 'lower_right'];

function referenceBaseSku(point: Pick<InferenceData, 'hw' | 'hwKey'>): string {
  const rawHardware = String(point.hw || '').split('-')[0];
  return rawHardware || String(point.hwKey).split(/[_-]/u)[0];
}

function reference(
  points: InferenceData[],
  direction: Direction,
  precisions?: readonly string[],
): string[] {
  const bySku = new Map<string, Map<string, InferenceData[]>>();
  const featured = new Set<string>();
  for (const point of points) {
    if (precisions && !precisions.includes(point.precision)) continue;
    if (point.powerVariant || !isFrontierEligible(point) || !Number.isFinite(point.y)) continue;
    const sku = referenceBaseSku(point);
    const key = String(point.hwKey);
    if (point.framework === 'tilert') featured.add(key);
    let series = bySku.get(sku);
    if (!series) {
      series = new Map();
      bySku.set(sku, series);
    }
    const rows = series.get(key) ?? [];
    rows.push(point);
    series.set(key, rows);
  }
  const selected = new Set(featured);
  for (const series of bySku.values()) {
    const usable = [...series.entries()]
      .map(([key, rows]) => ({
        key,
        points: paretoFrontForDirection(direction)([...rows]).toSorted((a, b) => a.x - b.x),
      }))
      .filter((candidate) => candidate.points.length > 0);
    if (usable.length === 0) continue;
    if (usable.length === 1) {
      selected.add(usable[0].key);
      continue;
    }
    const comparable = usable.filter((candidate) => candidate.points.length >= 2);
    const pool =
      comparable.length > 0
        ? comparable
        : usable.filter(
            (candidate) =>
              candidate.points.length === Math.max(...usable.map((item) => item.points.length)),
          );
    if (pool.length === 1) {
      selected.add(pool[0].key);
      continue;
    }
    const winner = pool
      .map((candidate) => ({ candidate, score: hypervolume(candidate.points, direction) }))
      .toSorted((a, b) => b.score - a.score || a.candidate.key.localeCompare(b.candidate.key))[0];
    selected.add(winner.candidate.key);
  }
  return [...selected];
}

function rng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
    return state / 2 ** 32;
  };
}

const HW = ['h100-sxm', 'h100-nvl', 'b200', 'b200-8', '', '-odd', 'mi355x-amd', 'x9-1'];
const KEYS = ['h100_vllm', 'h100_sglang', 'b200_trt', 'b200_sglang', 'mi355x_sglang', 'x9_vllm'];
const VALUES = [0, -1, 0.5, 1, 2, 3, 5, 8, Number.NaN, Number.POSITIVE_INFINITY, 1e-320];

function randomPoints(random: () => number, count: number): InferenceData[] {
  const pick = <T>(items: readonly T[]): T => items[Math.floor(random() * items.length)];
  const points: InferenceData[] = [];
  let hw = pick(HW);
  let hwKey = pick(KEYS);
  for (let i = 0; i < count; i++) {
    if (random() < 0.2) {
      hw = pick(HW);
      hwKey = pick(KEYS);
    }
    const value = () => (random() < 0.85 ? Math.ceil(random() * 6) * 0.75 : pick(VALUES));
    points.push({
      hw,
      hwKey,
      x: value(),
      y: value(),
      precision: random() < 0.7 ? 'fp8' : 'fp4',
      framework: random() < 0.03 ? 'tilert' : 'vllm',
      powerVariant: random() < 0.03 ? 'p' : undefined,
    } as InferenceData);
  }
  return points;
}

describe('bestSeriesPerSku matches the reference ranking', () => {
  it('agrees on randomized inputs with ties, gaps, mixed SKUs and invalid values', () => {
    const random = rng(7);
    for (let round = 0; round < 3000; round++) {
      const points = randomPoints(random, Math.floor(random() * 90));
      const direction = DIRECTIONS[round % 4];
      const precisions = round % 3 === 0 ? ['fp8'] : undefined;
      const snapshot = points.map((point) => ({ ...point }));
      expect([...bestSeriesPerSku(points, direction, precisions)]).toEqual(
        reference(points, direction, precisions),
      );
      expect(points).toEqual(snapshot);
    }
  });

  it('keeps the reference SKU for hardware names without a usable prefix', () => {
    for (const hw of HW) {
      for (const hwKey of [...KEYS, 'plain', '_lead', '']) {
        expect(baseSku({ hw, hwKey })).toBe(referenceBaseSku({ hw, hwKey }));
      }
    }
  });
});
