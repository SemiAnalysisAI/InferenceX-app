import type { InferenceData } from '@/components/inference/types';
import { getPointLabel } from '@/components/inference/utils/tooltipUtils';

// Color palette for Pareto frontier section labels
export const PARETO_LABEL_COLORS = [
  '#6366f1', // indigo
  '#f59e0b', // amber
  '#10b981', // emerald
  '#ef4444', // red
  '#8b5cf6', // violet
  '#06b6d4', // cyan
  '#f97316', // orange
  '#ec4899', // pink
  '#14b8a6', // teal
  '#a855f7', // purple
];

export interface ParetoPointLabel {
  point: InferenceData;
  label: string;
  color: string;
}

/**
 * Returns a Pareto frontier label for a data point.
 * Always prefixes with "TP" for simple numeric labels (legacy data without ep).
 * For data with ep/dp_attention, uses the full parallelism label.
 */
export const getParetoLabel = (d: InferenceData): string => {
  const label = getPointLabel(d);
  // If the label is just a number (no parallelism info), prefix with "TP"
  if (/^\d+$/.test(label)) {
    return `TP${label}`;
  }
  return label;
};

/**
 * Parses a parallelism label into its component sub-strategies.
 * E.g. "1xDPAEP4+1xDPAEP32" → ["DPAEP4", "DPAEP32"]
 * E.g. "TP8" → ["TP8"], "TEP8" → ["TEP8"], "DEP8" → ["DEP8"]
 * E.g. "2xEP4+1xDPAEP32" → ["EP4", "DPAEP32"]
 */
export const parseLabelComponents = (label: string): string[] => {
  // Split multinode labels on "+"
  const parts = label.split('+');
  return parts.map((p) => {
    // Strip the leading "NxNNN" multiplier (e.g., "1x" or "3x")
    const match = p.match(/^\d+x(.+)$/);
    return match ? match[1] : p;
  });
};

/**
 * Computes the similarity between two parallelism labels (0..1).
 * Returns 1 if identical, 0 if completely different, and a fractional
 * value based on how many sub-strategies are shared.
 */
export const labelSimilarity = (a: string, b: string): number => {
  if (a === b) return 1;
  const partsA = parseLabelComponents(a);
  const partsB = parseLabelComponents(b);
  const all = new Set([...partsA, ...partsB]);
  const shared = partsA.filter((p) => partsB.includes(p)).length;
  return shared / all.size;
};

/**
 * Annotates roofline points with their parallelism label and assigned color.
 */
export const computeParetoPointLabels = (
  rooflinePoints: InferenceData[],
  colorMap: Map<string, string>,
): ParetoPointLabel[] => {
  return rooflinePoints.map((point) => {
    const label = getParetoLabel(point);
    return {
      point,
      label,
      color: colorMap.get(label) || '#888',
    };
  });
};

/**
 * Builds a lookup from data point reference → gradient label color.
 * Used to color scatter points by their parallelism strategy when gradient labels are enabled.
 */
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

/**
 * Builds SVG gradient stops for a roofline path, coloring each segment
 * by its parallelism strategy. Uses the ±0.5-to-neighbor territory rule
 * and blends at boundaries when adjacent labels share sub-strategies.
 *
 * Returns gradient stops as {offset, color} pairs (offset in 0..1 range),
 * or null if only one label is present (use the GPU base color instead).
 */
export const computeGradientStops = (
  pointLabels: ParetoPointLabel[],
  xScale: (x: number) => number,
): { offset: number; color: string }[] | null => {
  if (pointLabels.length < 2) return null;

  // Check if there are multiple distinct labels
  const distinctLabels = new Set(pointLabels.map((p) => p.label));
  if (distinctLabels.size < 2) return null;

  const stops: { offset: number; color: string }[] = [];
  const totalMinPx = xScale(pointLabels[0].point.x);
  const totalMaxPx = xScale(pointLabels[pointLabels.length - 1].point.x);
  const totalRange = totalMaxPx - totalMinPx;
  if (totalRange <= 0) return null;

  const toOffset = (px: number) => Math.max(0, Math.min(1, (px - totalMinPx) / totalRange));

  for (let i = 0; i < pointLabels.length; i++) {
    const curr = pointLabels[i];
    const currPx = xScale(curr.point.x);

    // Compute territory boundaries
    const leftPx = i === 0 ? totalMinPx : (currPx + xScale(pointLabels[i - 1].point.x)) / 2;
    const rightPx =
      i === pointLabels.length - 1 ? totalMaxPx : (currPx + xScale(pointLabels[i + 1].point.x)) / 2;

    // At the boundary with the next point, blend if they share sub-strategies
    if (i < pointLabels.length - 1) {
      const next = pointLabels[i + 1];
      if (curr.label !== next.label) {
        const similarity = labelSimilarity(curr.label, next.label);
        // Blend zone: 5-20% of the gap depending on similarity
        // Higher similarity = wider blend for a smoother transition
        const gap = rightPx - leftPx;
        const nextLeftPx =
          i + 1 === pointLabels.length - 1
            ? totalMaxPx
            : (xScale(next.point.x) + xScale(pointLabels[i + 2].point.x)) / 2;
        const nextGap = nextLeftPx - rightPx;
        const blendFraction = 0.05 + similarity * 0.15;
        const blendSize = Math.min(gap, nextGap) * blendFraction;

        // Current color runs solid until just before boundary
        stops.push({ offset: toOffset(leftPx), color: curr.color });
        stops.push({ offset: toOffset(rightPx - blendSize), color: curr.color });
        // Blend zone
        stops.push({ offset: toOffset(rightPx + blendSize), color: next.color });
      } else {
        // Same label, just add the territory start
        if (i === 0) {
          stops.push({ offset: toOffset(leftPx), color: curr.color });
        }
      }
    } else {
      // Last point — add final stop
      stops.push({ offset: toOffset(rightPx), color: curr.color });
    }
  }

  // Ensure starts at 0 and ends at 1
  if (stops.length > 0 && stops[0].offset > 0) {
    stops.unshift({ offset: 0, color: stops[0].color });
  }
  if (stops.length > 0 && stops[stops.length - 1].offset < 1) {
    stops.push({ offset: 1, color: stops[stops.length - 1].color });
  }

  return stops;
};
