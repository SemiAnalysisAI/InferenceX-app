import type { InferenceSeriesEntry, InferenceSeriesPoint } from '@/lib/views-api/series';

/**
 * The public views API as the tutorial widgets read it. Every measured number on the page comes
 * from here (or from the power model port fed with one of these points); nothing is embedded.
 */

export interface TutorialViewResponse {
  series: readonly InferenceSeriesEntry[];
  xAxis: { label: string };
  metric: { label: string; labelZh: string; unit: string | null };
  count: number;
}

/** The validated-power pair on prod: DeepSeek-V4-Pro on AgentX traces, FP4. */
export const TUTORIAL_PRESET = {
  model: 'DeepSeek-V4-Pro',
  sequence: 'agentic-traces',
  precisions: 'fp4',
} as const;

export function viewsInferenceUrl(metric: string, gpus: readonly string[]): string {
  const params = new URLSearchParams({
    model: TUTORIAL_PRESET.model,
    sequence: TUTORIAL_PRESET.sequence,
    gpus: gpus.join(','),
    precisions: TUTORIAL_PRESET.precisions,
    metric,
  });
  return `/api/v1/views/inference?${params.toString()}`;
}

export interface PickedPoint {
  hwKey: string;
  label: string;
  gpu: string;
  x: number;
  y: number;
  concurrency: number;
  date: string;
}

/** The point of `gpu` whose interactivity is closest to `targetX`, or null when it has none. */
export function pickPoint(
  series: readonly InferenceSeriesEntry[],
  gpu: string,
  targetX: number,
): PickedPoint | null {
  let best: PickedPoint | null = null;
  for (const entry of series) {
    if (entry.gpu !== gpu) continue;
    for (const point of entry.points) {
      if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) continue;
      if (best === null || Math.abs(point.x - targetX) < Math.abs(best.x - targetX)) {
        best = toPicked(entry, point);
      }
    }
  }
  return best;
}

function toPicked(entry: InferenceSeriesEntry, point: InferenceSeriesPoint): PickedPoint {
  return {
    hwKey: entry.hwKey,
    label: entry.label,
    gpu: entry.gpu,
    x: point.x,
    y: point.y,
    concurrency: point.concurrency,
    date: point.date,
  };
}

const cache = new Map<string, Promise<TutorialViewResponse>>();

/** Fetches a views-API URL once per page; a failure is forgotten so a later mount can retry. */
export function fetchView(url: string): Promise<TutorialViewResponse> {
  const cached = cache.get(url);
  if (cached) return cached;
  const request = fetch(url)
    .then(async (response) => {
      if (!response.ok) throw new Error(`views API ${response.status}`);
      return (await response.json()) as TutorialViewResponse;
    })
    .catch((error: unknown) => {
      cache.delete(url);
      throw error;
    });
  cache.set(url, request);
  return request;
}
