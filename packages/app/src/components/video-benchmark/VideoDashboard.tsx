'use client';

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
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
import { isQueueing, layoutLabel, leadCell } from './deployment';
import { costPerGpuHour, hardwareLabel, VIDEO_HARDWARE_ROSTER } from './hardware';
import {
  metricLabel,
  metricValue,
  TIER_LABELS,
  VIDEO_METRICS,
  type MetricId,
  type VideoPoint,
} from './metrics';
import { dashboardCells } from './points';
import { formatApiPrice, H3_API_REFERENCE } from './api-reference';
import { useVideoPoints } from './use-video-points';
import VideoHistory from './VideoHistory';
import VideoCompare from './VideoCompare';
import VideoConfigBar from './VideoConfigBar';
import VideoEvidence from './VideoEvidence';
import VideoHardwareChart, { VIDEO_CHART_ID } from './VideoHardwareChart';
import VideoKpiCards from './VideoKpiCards';
import VideoPointsTable, { videoTableRows } from './VideoPointsTable';
import { useVideoDashboardState } from './use-video-dashboard-state';
import { metricOptions } from './video-url-state';

/** History filter params; a deep link carrying one opens the history section on load. */
const HISTORY_SECTION_PARAMS = ['history-hardware', 'history-concurrency', 'history-query'];
const CSV_METRICS: readonly MetricId[] = [
  'p50Latency',
  'p90Latency',
  'videosPerGpuHour',
  'videosPerDollar',
  'dollarsPerVideo',
  'kjPerVideo',
  'powerPctCap',
  'apiPricePerVideo',
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
    apiReference: 'API reference',
    idle: (list: string) =>
      `Per participating GPU: ${list} reserved more boards than one video uses; the idle boards are not counted.`,
    idleItem: (hardware: string, used: number, reserved: number) =>
      `${hardware} (${used} of ${reserved})`,
    deployments: (n: number) => `${n} deployments`,
    history: 'Performance history',
    historyHint: 'Every published H3 result, including older runs.',
    loading: 'Loading published results…',
    error: 'Could not load published results',
    retry: 'Retry',
    replay: 'Replaying retained results (local fixture), not a new measurement.',
    vs: 'vs.',
    notMeasured: 'not measured',
    runtime: 'runtime',
    workloads: (n: number) => ` (${n} other workloads hidden)`,
  },
  zh: {
    title: 'VideoGenX · MiniMax-H3 跨硬件对比',
    subtitle:
      '固定的工作负载、模型与运行时，在每种 GPU 上实测：出片时间、每 GPU 小时和每美元 TCO 的有效产出，以及 GPU 板卡的实测能耗。',
    chart: '图表',
    table: '表格',
    viewToggle: '图表或表格视图',
    tier: '成本档位',
    badges: 'TCO $/chip/hr',
    source: '来源',
    apiReference: 'API 参考价',
    idle: (list: string) =>
      `按参与计算的 GPU 计：${list}预留的板卡多于单条视频所需，空闲板卡未计入。`,
    idleItem: (hardware: string, used: number, reserved: number) =>
      `${hardware}（${used} / ${reserved} 张）`,
    deployments: (n: number) => `${n} 种部署`,
    history: '性能历史',
    historyHint: '所有已发布的 H3 结果，包括较早的运行。',
    loading: '正在加载已发布结果…',
    error: '无法加载已发布结果',
    retry: '重试',
    replay: '正在回放保留结果（本地 fixture），不是新的测量。',
    vs: 'vs.',
    notMeasured: '未测得',
    runtime: 'runtime',
    workloads: (n: number) => `（另有 ${n} 个工作负载未显示）`,
  },
};

const subscribeNoop = () => () => {};

function csvCell(value: string | number | null): string {
  if (value === null) return '';
  const text = String(value);
  return /[",\n]/u.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export default function VideoDashboard() {
  const locale = useLocale();
  const s = STRINGS[locale];
  const { points, loading, error, replay, retry } = useVideoPoints();
  const { state, update } = useVideoDashboardState();
  const [hidden, setHidden] = useState<ReadonlySet<string>>(() => new Set());
  const [legendExpanded, setLegendExpanded] = useState(true);
  const [historyOpen, setHistoryOpen] = useState(false);
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    setHistoryOpen(HISTORY_SECTION_PARAMS.some((key) => params.has(key)));
  }, []);

  const hardwareKeys = useMemo(() => VIDEO_HARDWARE_ROSTER.map((item) => item.key), []);
  const { resolveColor, getCssColor } = useThemeColors({
    highContrast: false,
    activeKeys: hardwareKeys,
  });
  // Vendor hues depend on the resolved theme and computed styles, which the
  // server cannot know; render the neutral token until hydration completes so
  // the first client render matches the server HTML.
  const mounted = useSyncExternalStore(
    subscribeNoop,
    () => true,
    () => false,
  );
  const colorFor = useCallback(
    (key: string) => (mounted ? getCssColor(resolveColor(key)) : 'var(--muted-foreground)'),
    [mounted, resolveColor, getCssColor],
  );

  const options = metricOptions(state);
  const {
    cells,
    workload: primaryWorkload,
    otherWorkloads,
  } = useMemo(() => dashboardCells(points), [points]);
  const measured = useMemo(
    () =>
      new Map(
        hardwareKeys.flatMap((key) => {
          const point = leadCell(cells, key, { tier: state.tier });
          return point ? [[key, point] as const] : [];
        }),
      ),
    [cells, hardwareKeys, state.tier],
  );
  const lead = measured.values().next().value ?? cells[0];
  const layouts = [
    ...new Set(cells.filter((p) => !isQueueing(p)).map((p) => layoutLabel(p, locale))),
  ];
  const deploymentLabel =
    layouts.length > 2 ? s.deployments(layouts.length) : layouts.join(' | ') || '—';
  // "1344 × 768 · 8 s · 24 fps · 50 steps · model @ rev · seeds · prompt" → shape, then model @ rev.
  const workloadParts = primaryWorkload?.split(' · ') ?? [];
  const workloadLabel = workloadParts.slice(0, 4).join(' · ') || '—';
  const modelLabel = workloadParts[4] ?? lead?.model ?? '—';
  const workloadSuffix = otherWorkloads > 0 ? s.workloads(otherWorkloads) : '';
  // Jobs that reserved a whole node but generated on part of it: say so beside the per-GPU numbers.
  const idle = [...measured.values()]
    .filter(
      (p) => p.participating !== null && p.allocated !== null && p.allocated > p.participating,
    )
    .map((p) => s.idleItem(hardwareLabel(p.hardwareKey ?? ''), p.participating!, p.allocated!));

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
    const rows = videoTableRows(cells, hidden);
    const header = [
      'hardware',
      'concurrency',
      'valid',
      'scheduled',
      'participating_gpus',
      'allocated_gpus',
      'api_price_usd_per_video_second',
      'tp_size',
      'ulysses_degree',
      'replicas',
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
        state.apiPrice,
        p.server?.tp ?? null,
        p.server?.ulysses ?? null,
        p.replicas,
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
    anchor.download = `videogenx-${state.y}-vs-${state.x}-${state.tier}.csv`;
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
        deploymentLabel={deploymentLabel}
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
                {s.apiReference}: {formatApiPrice(state.apiPrice)}/video-s (
                {H3_API_REFERENCE.capturedOn})
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
            {idle.length > 0 && (
              <p className="mt-1 text-xs text-muted-foreground" data-testid="video-idle-note">
                {s.idle(idle.join(locale === 'zh' ? '、' : ', '))}
              </p>
            )}
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
                    points={cells}
                    state={state}
                    colorFor={colorFor}
                    hidden={hidden}
                    onSelect={(p: VideoPoint) =>
                      track('video_point_selected', { hardware: p.hardwareKey ?? '', run: p.runId })
                    }
                  />
                ) : (
                  <VideoPointsTable points={cells} state={state} hidden={hidden} />
                )}
              </div>
              <div data-testid="video-legend">
                <ChartLegend
                  variant="sidebar"
                  legendItems={legendItems}
                  isLegendExpanded={legendExpanded}
                  onExpandedChange={setLegendExpanded}
                  disableActiveSort
                />
              </div>
            </div>
          )}
        </div>
      </ChartSection>
      <VideoKpiCards points={cells} state={state} colorFor={colorFor} loading={loading} />
      {!loading && !error && (
        <>
          <VideoCompare points={cells} options={options} colorFor={colorFor} />
          <VideoEvidence points={cells} colorFor={colorFor} />
        </>
      )}
      <details
        className="rounded-xl border px-4 py-3"
        data-testid="video-history-section"
        open={historyOpen}
        onToggle={(event) => {
          const open = event.currentTarget.open;
          if (open === historyOpen) return;
          setHistoryOpen(open);
          track('video_history_section_toggled', { open });
        }}
      >
        <summary className="cursor-pointer text-sm font-medium">
          {s.history}
          <span className="ml-2 font-normal text-muted-foreground">{s.historyHint}</span>
        </summary>
        <div className="mt-3">{historyOpen && <VideoHistory />}</div>
      </details>
    </div>
  );
}
