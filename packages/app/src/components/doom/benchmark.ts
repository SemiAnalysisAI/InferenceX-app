import {
  canvasPointLayerOf,
  CANVAS_POINT_LAYER_SELECTOR as LAYER,
} from '@/lib/d3-chart/layers/canvas-point-registry';
interface Run {
  x: number;
  y: number;
  precision: string;
  output_tput_per_gpu?: number;
  median_ttft?: number;
  median_intvty?: number;
  hw?: string;
  hwKey?: string;
  conc?: number;
}
export interface Sample {
  tps: number;
  first: number;
  perUser: number;
  name: string;
  batch: number;
}
// Measured MI355X FP4 1K/1K fixture run, not a simulated performance claim.
const fixture: Sample = {
  tps: 98.988,
  first: 102.174,
  perUser: 103.648,
  name: 'MI355X FP4',
  batch: 4,
};
export function sampleFromChart(scope: ParentNode = document): {
  sample: Sample;
  count: number;
  live: boolean;
} {
  let best: Sample | null = null,
    count = 0;
  for (const layer of scope.querySelectorAll(LAYER)) {
    if (layer.closest('[id$="-export"]') || !layer.getBoundingClientRect().width) continue;
    const rows = canvasPointLayerOf<Run>(layer)?.snapshot() || [];
    for (const { datum, opacity, interactive } of rows) {
      const { output_tput_per_gpu: t, median_ttft: f, median_intvty: u } = datum;
      if (
        !interactive ||
        opacity < 0.1 ||
        !(
          typeof t === 'number' &&
          t > 0 &&
          typeof f === 'number' &&
          f > 0 &&
          typeof u === 'number' &&
          u > 0
        )
      )
        continue;
      count++;
      if (!best || t > best.tps)
        best = {
          tps: t,
          first: f * 1000,
          perUser: u,
          name: `${datum.hw || datum.hwKey || 'GPU'} ${datum.precision}`.toUpperCase(),
          batch: datum.conc || 1,
        };
    }
  }
  return { sample: best || fixture, count, live: Boolean(best) };
}
