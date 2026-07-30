import type { InferenceData } from '@/components/inference/types';

import { paretoFrontUpperRight } from './chart-utils';

export interface AgenticE2eFrontierPoint {
  e2eLatency?: number;
  throughput: number;
  date?: string;
}

interface FramedPoint<T extends AgenticE2eFrontierPoint> {
  x: number;
  y: number;
  orig: T;
}

/**
 * Keep only date-scoped winners on the AgentX
 * (E2E latency, selected throughput metric) Pareto frontier.
 */
export function restrictAgenticPointsToE2eFrontier<T extends AgenticE2eFrontierPoint>(
  points: readonly T[],
): T[] {
  const byDate = new Map<string, FramedPoint<T>[]>();

  for (const point of points) {
    if (
      !Number.isFinite(point.e2eLatency) ||
      (point.e2eLatency ?? 0) <= 0 ||
      !Number.isFinite(point.throughput) ||
      point.throughput <= 0
    ) {
      continue;
    }
    const date = point.date ?? '';
    const framed = { x: point.e2eLatency!, y: point.throughput, orig: point };
    const bucket = byDate.get(date);
    if (bucket) bucket.push(framed);
    else byDate.set(date, [framed]);
  }

  const winners = new Set<T>();
  for (const bucket of byDate.values()) {
    for (const winner of paretoFrontUpperRight(bucket as unknown as InferenceData[])) {
      winners.add((winner as unknown as FramedPoint<T>).orig);
    }
  }
  return points.filter((point) => winners.has(point));
}
