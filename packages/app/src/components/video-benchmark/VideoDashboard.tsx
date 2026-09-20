'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  HW_REGISTRY,
  TCO_SOURCE_TITLE,
  TCO_SOURCE_URL,
} from '@semianalysisai/inferencex-constants';
import { Button } from '@/components/ui/button';
import ChartLegend from '@/components/ui/chart-legend';
import { ChartSection } from '@/components/ui/chart-section';
import { Heading } from '@/components/ui/heading';
import { useThemeColors } from '@/hooks/useThemeColors';
import { track } from '@/lib/analytics';
import { useLocale } from '@/lib/use-locale';
import { costPerGpuHour, hardwareLabel, VIDEO_HARDWARE_ROSTER } from './hardware';
import {
  metricLabel,
  metricValue,
  TIER_LABELS,
  VIDEO_METRICS,
  type MetricId,
  type VideoPoint,
} from './metrics';
import { latestVideoCells } from './points';
import { useVideoPoints } from './use-video-points';
import VideoCIRuns from './VideoCIRuns';
import VideoConfigBar from './VideoConfigBar';
import VideoHardwareChart, { VIDEO_CHART_ID } from './VideoHardwareChart';
import VideoKpiCards from './VideoKpiCards';
import VideoPointsTable, { videoTableRows } from './VideoPointsTable';
import {
  DEFAULT_VIDEO_DASHBOARD_STATE,
  readVideoDashboardState,
  writeVideoDashboardState,
  type VideoDashboardState,
} from './video-url-state';

/** URL params owned by the run/results/history views; any of them opens that section on load. */
const RUNS_SECTION_PARAMS = [
  'run',
  'artifact',
  'source',
  'cell',
  'view',
  'compare',
  'history-hardware',
  'history-concurrency',
  'history-query',
];
const CSV_METRICS: readonly MetricId[] = [
  'p50Latency',
  'p90Latency',
  'genSpeed',
  'videosPerGpuHour',
  'videoSecondsPerGpuHour',
  'videosPerDollar',
  'dollarsPerVideo',
  'dollarsPerVideoSecond',
  'kjPerVideo',
  'videosPerKwh',
  'powerPctCap',
];

const STRINGS = {
  en: {
    title: 'VideoGenX · MiniMax-H3 across hardware',
    subtitle:
      'One frozen workload, one model and runtime, measured on each GPU: time to video, useful output per GPU-hour and per TCO dollar, and metered GPU-board energy.',
    chart: 'Chart',
    table: 'Table',
    viewToggle: 'Chart or table view',
    tier: 'Cost tier',
    badges: 'TCO $/chip/hr',
    source: 'Source',
    queue: 'Show queueing (C2/C4)',
    optimal: 'Optimal only',
    runs: 'Runs, videos & evidence',
    runsHint: 'Per-run results, generated clips, fidelity checks and the performance history list.',
    loading: 'Loading published results…',
    error: 'Could not load published results',
    retry: 'Retry',
    replay: 'Replaying retained results (local fixture), not a new measurement.',
    vs: 'vs.',
    notMeasured: 'not measured',
    runtime: 'runtime',
    workloads: (n: number) => ` (+${n} more)`,
  },
  zh: {
    title: 'VideoGenX · MiniMax-H3 跨硬件对比',
    subtitle:
      '同一冻结的工作负载、同一模型与运行时，在每种 GPU 上实测：出片时间、每 GPU 小时与每美元 TCO 的有效产出、GPU 板卡实测能耗。',
    chart: '图表',
    table: '表格',
    viewToggle: '图表或表格视图',
    tier: '成本分档',
    badges: 'TCO $/chip/hr',
    source: '来源',
    queue: '显示排队尾迹（C2/C4）',
    optimal: '仅最优',
    runs: '运行、视频与证据',
    runsHint: '按运行查看结果、生成的视频、保真度检查以及性能历史列表。',
    loading: '正在加载已发布结果…',
    error: '无法加载已发布结果',
    retry: '重试',
    replay: '正在回放保留结果（本地 fixture），不是新的测量。',
    vs: 'vs.',
    notMeasured: '未测得',
    runtime: 'runtime',
    workloads: (n: number) => `（另有 ${n} 个）`,
  },
};

function csvCell(value: string | number | null): string {
  if (value === null) return '';
  const text = String(value);
  return /[",\n]/u.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export default function VideoDashboard() {
  const locale = useLocale();
  const s = STRINGS[locale];
  const { points, loading, error, replay, retry } = useVideoPoints();
  const [state, setState] = useState<VideoDashboardState>(DEFAULT_VIDEO_DASHBOARD_STATE);
  const [hidden, setHidden] = useState<ReadonlySet<string>>(() => new Set());
  const [legendExpanded, setLegendExpanded] = useState(true);
  const [runsOpen, setRunsOpen] = useState(false);
  useEffect(() => {
    setState(readVideoDashboardState(location.search));
    const params = new URLSearchParams(location.search);
    setRunsOpen(RUNS_SECTION_PARAMS.some((key) => params.has(key)));
  }, []);
  const update = useCallback((patch: Partial<VideoDashboardState>) => {
    setState((old) => {
      const next = { ...old, ...patch };
      history.replaceState(null, '', writeVideoDashboardState(new URL(location.href), next));
      return next;
    });
  }, []);

  const hardwareKeys = useMemo(() => VIDEO_HARDWARE_ROSTER.map((item) => item.key), []);
  const { resolveColor, getCssColor } = useThemeColors({
    highContrast: false,
    activeKeys: hardwareKeys,
  });
  const colorFor = useCallback(
    (key: string) => getCssColor(resolveColor(key)),
    [resolveColor, getCssColor],
  );

  const options = { tier: state.tier, basis: state.basis };
  const cells = useMemo(() => latestVideoCells(points), [points]);
  const measured = useMemo(
    () => new Map(cells.filter((p) => p.concurrency === 1).map((p) => [p.hardwareKey, p])),
    [cells],
  );
  const lead = cells.find((p) => p.concurrency === 1) ?? cells[0];
  // "1344 × 768 · 8 s · 24 fps · 50 steps · model @ rev · seeds · prompt" → shape, then model @ rev.
  const workloadParts = lead?.workload.split(' · ') ?? [];
  const workloadLabel = workloadParts.slice(0, 4).join(' · ') || '—';
  const modelLabel = workloadParts[4] ?? lead?.model ?? '—';
  const otherWorkloads = new Set(cells.map((p) => p.workload.split(' · ').slice(0, 5).join(' · ')))
    .size;
  const workloadSuffix = otherWorkloads > 1 ? s.workloads(otherWorkloads - 1) : '';

  const legendItems = VIDEO_HARDWARE_ROSTER.map(({ key, unavailable }) => {
    const point = measured.get(key);
    return {
      name: key,
      hw: key,
      label: point
        ? `${hardwareLabel(key)} · ${s.runtime} ${point.runtime.slice(0, 8)}`
        : `${hardwareLabel(key)} · ${s.notMeasured}`,
      color: colorFor(key),
      isActive: point !== undefined && !hidden.has(key),
      isRemovable: point !== undefined,
      title: unavailable?.[locale],
      onClick: (name: string) => {
        if (!measured.has(name)) return;
        setHidden((old) => {
          const next = new Set(old);
          if (next.has(name)) next.delete(name);
          else next.add(name);
          return next;
        });
        track('video_legend_toggled', { hardware: name });
      },
    };
  });

  const exportCsv = () => {
    const rows = videoTableRows(points, state, hidden);
    const header = [
      'hardware',
      'concurrency',
      'valid',
      'scheduled',
      'participating_gpus',
      'allocated_gpus',
      ...CSV_METRICS.map((id) => `${id} (${VIDEO_METRICS[id].unit})`),
      'board_power_w',
      'enforced_limit_w',
      'runtime',
      'ci_run',
    ];
    const lines = rows.map((p) =>
      [
        hardwareLabel(p.hardwareKey ?? ''),
        p.concurrency,
        p.valid,
        p.scheduled,
        p.participating,
        p.allocated,
        ...CSV_METRICS.map((id) => metricValue(p, id, options)),
        p.avgPowerW,
        p.enforcedLimitW,
        p.runtime,
        `https://github.com/SemiAnalysisAI/InferenceX/actions/runs/${p.runId}`,
      ]
        .map(csvCell)
        .join(','),
    );
    const blob = new Blob([`${[header.join(','), ...lines].join('\n')}\n`], {
      type: 'text/csv;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `videogenx-${state.y}-vs-${state.x}-${state.tier}-${state.basis}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="mx-auto min-w-0 w-full max-w-7xl space-y-4 py-2" data-testid="video-dashboard">
      <div>
        <Heading as="h1" level="section">
          {s.title}
        </Heading>
        <p className="mt-1 max-w-4xl text-sm text-muted-foreground">{s.subtitle}</p>
      </div>
      <VideoConfigBar
        state={state}
        onChange={update}
        modelLabel={modelLabel}
        workloadLabel={`${workloadLabel}${workloadSuffix}`}
      />
      <ChartSection
        chartId={VIDEO_CHART_ID}
        analyticsPrefix="video"
        exportFileName={`videogenx-${state.y}-vs-${state.x}`}
        onExportCsv={exportCsv}
        hideImageExport={state.view === 'table'}
        setIsLegendExpanded={setLegendExpanded}
        leadingControls={
          <div className="flex gap-1" role="group" aria-label={s.viewToggle}>
            {(['chart', 'table'] as const).map((view) => (
              <Button
                key={view}
                size="sm"
                variant={state.view === view ? 'default' : 'outline'}
                aria-pressed={state.view === view}
                onClick={() => {
                  update({ view });
                  track('video_view_changed', { view });
                }}
              >
                {s[view]}
              </Button>
            ))}
          </div>
        }
      >
        <div className="space-y-3 px-4 md:px-6" data-testid="video-chart-card">
          <div className="min-w-0 pr-0 md:pr-56">
            <Heading level="card">
              {modelLabel} · {metricLabel(state.y, locale, options)} {s.vs}{' '}
              {metricLabel(state.x, locale, options)}
            </Heading>
            <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
              <span>
                {s.tier}: {TIER_LABELS[state.tier][locale]}
              </span>
              <span className="flex flex-wrap items-center gap-1">
                {s.badges}:
                {hardwareKeys.map((key) => (
                  <span
                    key={key}
                    className="rounded border px-1.5 py-0.5 tabular-nums"
                    data-testid="video-tco-badge"
                  >
                    {HW_REGISTRY[key]?.badgeLabel ?? hardwareLabel(key)}{' '}
                    {costPerGpuHour(key, state.tier)?.toFixed(2) ?? '—'}
                  </span>
                ))}
              </span>
              <span>
                {s.source}:{' '}
                <a
                  className="underline underline-offset-2"
                  href={TCO_SOURCE_URL}
                  target="_blank"
                  rel="noreferrer"
                >
                  {TCO_SOURCE_TITLE}
                </a>
              </span>
            </p>
          </div>
          {replay && (
            <p className="text-xs text-muted-foreground" role="status" data-testid="video-replay">
              {s.replay}
            </p>
          )}
          {loading && (
            <p role="status" className="text-sm text-muted-foreground">
              {s.loading}
            </p>
          )}
          {error && (
            <div role="alert" className="flex flex-wrap items-center gap-3 text-sm">
              <p>
                {s.error}: {error}
              </p>
              <Button variant="outline" size="sm" onClick={retry}>
                {s.retry}
              </Button>
            </div>
          )}
          {!loading && !error && (
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_260px]">
              <div className="min-w-0">
                {state.view === 'chart' ? (
                  <VideoHardwareChart
                    points={points}
                    state={state}
                    colorFor={colorFor}
                    hidden={hidden}
                    onSelect={(p: VideoPoint) =>
                      track('video_point_selected', { hardware: p.hardwareKey ?? '', run: p.runId })
                    }
                  />
                ) : (
                  <VideoPointsTable points={points} state={state} hidden={hidden} />
                )}
              </div>
              <div data-testid="video-legend">
                <ChartLegend
                  variant="sidebar"
                  legendItems={legendItems}
                  isLegendExpanded={legendExpanded}
                  onExpandedChange={setLegendExpanded}
                  disableActiveSort
                  switches={[
                    {
                      id: 'video-queue',
                      label: s.queue,
                      checked: state.queue,
                      onCheckedChange: (checked) => {
                        update({ queue: checked });
                        track('video_queue_changed', { value: String(checked) });
                      },
                    },
                    {
                      id: 'video-optimal',
                      label: s.optimal,
                      checked: state.optimal,
                      onCheckedChange: (checked) => {
                        update({ optimal: checked });
                        track('video_optimal_changed', { value: String(checked) });
                      },
                    },
                  ]}
                />
              </div>
            </div>
          )}
        </div>
      </ChartSection>
      <VideoKpiCards points={points} state={state} colorFor={colorFor} />
      <details
        className="rounded-xl border px-4 py-3"
        data-testid="video-runs-section"
        open={runsOpen}
        onToggle={(event) => {
          const open = event.currentTarget.open;
          if (open === runsOpen) return;
          setRunsOpen(open);
          track('video_runs_section_toggled', { open });
        }}
      >
        <summary className="cursor-pointer text-sm font-medium">
          {s.runs}
          <span className="ml-2 font-normal text-muted-foreground">{s.runsHint}</span>
        </summary>
        <div className="mt-3">{runsOpen && <VideoCIRuns />}</div>
      </details>
    </div>
  );
}
