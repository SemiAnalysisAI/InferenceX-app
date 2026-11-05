import type { InferenceData } from '@/components/inference/types';
import { getPointLabel } from '@/components/inference/utils/tooltipUtils';
import { isKvOffloadEnabled } from '@/lib/benchmarks/kv-offload';

export const PARETO_LABEL_COLORS = [
  '#6366f1',
  '#f59e0b',
  '#10b981',
  '#ef4444',
  '#8b5cf6',
  '#06b6d4',
  '#f97316',
  '#ec4899',
  '#14b8a6',
  '#a855f7',
];

export interface ParetoPointLabel {
  point: InferenceData;
  label: string;
  color: string;
}

export const KV_OFFLOAD_LABEL_SUFFIX = ' + CPU KV Offloading';

export const getParetoLabel = (d: InferenceData): string => {
  const label = getPointLabel(d);
  const base = /^\d+$/u.test(label) ? `TP${label}` : label;
  return isKvOffloadEnabled(d) ? `${base}${KV_OFFLOAD_LABEL_SUFFIX}` : base;
};

export const parseLabelComponents = (label: string): string[] => {
  const parts = label.split('+').map((p) => p.trim());
  return parts.map((p) => {
    const match = p.match(/^\d+x(?<strategy>.+)$/u);
    return match?.groups?.strategy ?? p;
  });
};

export const labelSimilarity = (a: string, b: string): number => {
  if (a === b) return 1;
  const partsA = parseLabelComponents(a);
  const partsB = parseLabelComponents(b);
  const all = new Set([...partsA, ...partsB]);
  const shared = partsA.filter((p) => partsB.includes(p)).length;
  return shared / all.size;
};

export const computeParetoPointLabels = (
  rooflinePoints: InferenceData[],
  colorMap: Map<string, string>,
): ParetoPointLabel[] =>
  rooflinePoints.map((point) => {
    const label = getParetoLabel(point);
    return {
      point,
      label,
      color: colorMap.get(label) || '#888',
    };
  });

export const buildGradientColorMap = (
  labelsByKey: Record<string, ParetoPointLabel[]>,
): Map<InferenceData, string> => {
  const map = new Map<InferenceData, string>();
  for (const labels of Object.values(labelsByKey)) {
    for (const { point, color } of labels) {
      map.set(point, color);
    }
  }
  return map;
};

export const computeGradientStops = (
  pointLabels: ParetoPointLabel[],
  xScale: (x: number) => number,
): { offset: number; color: string }[] | null => {
  if (pointLabels.length < 2) return null;

  const distinctLabels = new Set(pointLabels.map((p) => p.label));
  if (distinctLabels.size < 2) return null;

  const stops: { offset: number; color: string }[] = [];
  const totalMinPx = xScale(pointLabels[0].point.x);
  const totalMaxPx = xScale(pointLabels.at(-1)!.point.x);
  const totalRange = totalMaxPx - totalMinPx;
  if (totalRange <= 0) return null;

  const toOffset = (px: number) => Math.max(0, Math.min(1, (px - totalMinPx) / totalRange));

  for (let i = 0; i < pointLabels.length; i++) {
    const curr = pointLabels[i];
    const currPx = xScale(curr.point.x);

    const leftPx = i === 0 ? totalMinPx : (currPx + xScale(pointLabels[i - 1].point.x)) / 2;
    const rightPx =
      i === pointLabels.length - 1 ? totalMaxPx : (currPx + xScale(pointLabels[i + 1].point.x)) / 2;

    if (i < pointLabels.length - 1) {
      const next = pointLabels[i + 1];
      if (curr.label !== next.label) {
        const similarity = labelSimilarity(curr.label, next.label);
        const gap = rightPx - leftPx;
        const nextLeftPx =
          i + 1 === pointLabels.length - 1
            ? totalMaxPx
            : (xScale(next.point.x) + xScale(pointLabels[i + 2].point.x)) / 2;
        const nextGap = nextLeftPx - rightPx;
        const blendFraction = 0.05 + similarity * 0.15;
        const blendSize = Math.min(gap, nextGap) * blendFraction;

        stops.push(
          { offset: toOffset(leftPx), color: curr.color },
          { offset: toOffset(rightPx - blendSize), color: curr.color },
          { offset: toOffset(rightPx + blendSize), color: next.color },
        );
      } else if (i === 0) {
        stops.push({ offset: toOffset(leftPx), color: curr.color });
      }
    } else {
      stops.push({ offset: toOffset(rightPx), color: curr.color });
    }
  }

  if (stops.length > 0 && stops[0].offset > 0) {
    stops.unshift({ offset: 0, color: stops[0].color });
  }
  if (stops.length > 0 && stops.at(-1)!.offset < 1) {
    stops.push({ offset: 1, color: stops.at(-1)!.color });
  }

  return stops;
};
