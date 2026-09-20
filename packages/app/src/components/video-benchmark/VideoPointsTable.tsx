'use client';

import { DataTable, type DataTableColumn } from '@/components/ui/data-table';
import { useLocale } from '@/lib/use-locale';
import { isQueueing, layoutLabel } from './deployment';
import { hardwareLabel } from './hardware';
import { formatMetric, metricLabel, metricValue, type MetricId, type VideoPoint } from './metrics';
import { latestVideoCells } from './points';
import { metricOptions, type VideoDashboardState } from './video-url-state';

const STRINGS = {
  en: {
    hardware: 'Hardware',
    deployment: 'Deployment',
    counts: 'Valid / scheduled',
    power: 'Board power (W)',
    run: 'CI run',
  },
  zh: {
    hardware: '硬件',
    deployment: '部署',
    counts: '有效 / 计划',
    power: '板卡功率（W）',
    run: 'CI 运行',
  },
};
const METRIC_COLUMNS: readonly MetricId[] = [
  'p50Latency',
  'p90Latency',
  'videosPerGpuHour',
  'videosPerDollar',
  'dollarsPerVideo',
  'apiPricePerVideo',
  'kjPerVideo',
  'powerPctCap',
];

/** Rows for the plotted cells: every measured deployment, plus provenance. Queued cells stay in the evidence panel. */
export function videoTableRows(points: VideoPoint[], hidden: ReadonlySet<string>): VideoPoint[] {
  return latestVideoCells(points).filter(
    (p) => p.hardwareKey && !hidden.has(p.hardwareKey) && !isQueueing(p),
  );
}

export default function VideoPointsTable({
  points,
  state,
  hidden,
}: {
  points: VideoPoint[];
  state: VideoDashboardState;
  hidden: ReadonlySet<string>;
}) {
  const locale = useLocale();
  const s = STRINGS[locale];
  const options = metricOptions(state);
  const rows = videoTableRows(points, hidden);
  const columns: DataTableColumn<VideoPoint>[] = [
    {
      header: s.hardware,
      cell: (p) => hardwareLabel(p.hardwareKey ?? ''),
      sortValue: (p) => hardwareLabel(p.hardwareKey ?? ''),
      importance: 'key',
      pinned: true,
    },
    {
      header: s.deployment,
      cell: (p) => layoutLabel(p, locale),
      sortValue: (p) => p.participating ?? 0,
      importance: 'key',
    },
    {
      header: s.counts,
      align: 'right',
      cell: (p) => `${p.valid ?? '—'} / ${p.scheduled ?? '—'}`,
    },
    ...METRIC_COLUMNS.map((id): DataTableColumn<VideoPoint> => ({
      header: metricLabel(id, locale, options),
      align: 'right',
      cell: (p) => formatMetric(metricValue(p, id, options), id),
      sortValue: (p) => metricValue(p, id, options) ?? Number.NEGATIVE_INFINITY,
      importance: id === 'p50Latency' || id === 'videosPerDollar' ? 'key' : 'secondary',
    })),
    {
      header: s.power,
      align: 'right',
      cell: (p) =>
        p.avgPowerW === null
          ? '—'
          : p.avgPowerW.toLocaleString('en-US', { maximumFractionDigits: 0 }),
      sortValue: (p) => p.avgPowerW ?? 0,
      importance: 'secondary',
    },
    {
      header: s.run,
      cell: (p) => (
        <a
          className="underline underline-offset-2"
          href={`https://github.com/SemiAnalysisAI/InferenceX/actions/runs/${p.runId}`}
          target="_blank"
          rel="noreferrer"
        >
          #{p.runId}
        </a>
      ),
      importance: 'secondary',
    },
  ];
  return (
    <DataTable
      data={rows}
      columns={columns}
      testId="video-points-table"
      analyticsPrefix="video"
      searchable={false}
    />
  );
}
