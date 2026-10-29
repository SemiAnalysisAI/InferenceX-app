import { compareMetrics } from '@/components/video-benchmark/compare';
import {
  readVideoCompareSelection,
  resolveCompareSelection,
} from '@/components/video-benchmark/compare-url-state';
import { leadCell } from '@/components/video-benchmark/deployment';
import {
  concurrencyPlateau,
  evidenceFacts,
  plateauSummary,
  powerRange,
  powerUtilization,
  scalingVsSpec,
} from '@/components/video-benchmark/evidence';
import { VIDEO_HARDWARE_ROSTER } from '@/components/video-benchmark/hardware';
import type { VideoHistoryPage } from '@/components/video-benchmark/history';
import {
  metricValue,
  VIDEO_METRICS,
  type MetricId,
  type VideoPoint,
} from '@/components/video-benchmark/metrics';
import { listedVideoCells, plotVideoPoints } from '@/components/video-benchmark/plot';
import { dashboardCells, videoPoints } from '@/components/video-benchmark/points';
import {
  metricOptions,
  readVideoDashboardState,
} from '@/components/video-benchmark/video-url-state';

/** Public metadata and the dashboard's existing pure calculations; no bundle or asset URLs. */
export function videoDashboardProjection(pages: VideoHistoryPage[], search: string) {
  const state = readVideoDashboardState(search);
  const { cells, workload, otherWorkloads } = dashboardCells(videoPoints(pages));
  const options = metricOptions(state);
  const hidden = new Set(state.hidden);
  const metrics = (point: VideoPoint) =>
    Object.fromEntries(
      (Object.keys(VIDEO_METRICS) as MetricId[]).map((id) => [id, metricValue(point, id, options)]),
    );
  const pair = resolveCompareSelection(readVideoCompareSelection(search), cells);
  const power = powerUtilization(cells);
  const plateau = concurrencyPlateau(cells);
  return {
    params: {
      ...state,
      baseline: pair.baseline?.hardwareKey ?? null,
      candidate: pair.candidate?.hardwareKey ?? null,
      caseIndex: pair.caseIndex,
    },
    workload,
    otherWorkloads,
    cells,
    metricDefinitions: VIDEO_METRICS,
    // Color is renderer state; use the exact plot model with an empty color.
    plot: plotVideoPoints(cells, state, () => '', hidden),
    rows: listedVideoCells(cells, state, hidden).map((point) => ({
      point,
      metrics: metrics(point),
    })),
    kpis: VIDEO_HARDWARE_ROSTER.map(({ key }) => {
      const point = leadCell(cells, key, options);
      return { hardwareKey: key, point: point ?? null, metrics: point ? metrics(point) : null };
    }),
    comparison: {
      baseline: pair.baseline,
      candidate: pair.candidate,
      metrics:
        pair.baseline && pair.candidate
          ? compareMetrics(pair.baseline, pair.candidate, options)
          : [],
    },
    evidence: {
      power,
      powerRange: powerRange(power),
      plateau,
      plateauSummary: plateauSummary(plateau),
      scaling: scalingVsSpec(cells),
      facts: evidenceFacts(cells),
    },
    provenance: pages.flatMap((page) =>
      page.entries.map((entry) => ({
        runId: entry.runId,
        artifactId: entry.artifact.id,
        publishedAt: entry.publishedAt,
        unavailable: entry.error !== null,
        sources: entry.sources.map((source) => ({
          id: source.id,
          sha256: source.sha256,
          sourceSha: source.sourceSha,
          observedAt: source.observedAt,
          kind: source.kind,
          execution: source.execution,
          fidelity: source.fidelity,
          calibration: source.calibration,
          releaseQualified: source.releaseQualified,
          unavailable: source.error !== null,
        })),
      })),
    ),
  };
}
