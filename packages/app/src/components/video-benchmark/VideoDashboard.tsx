'use client';

import { ChevronDown } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { HW_REGISTRY } from '@semianalysisai/inferencex-constants';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import ChartLegend from '@/components/ui/chart-legend';
import { ChartSection } from '@/components/ui/chart-section';
import { CollapsibleSection } from '@/components/ui/collapsible-section';
import { DashboardSectionHeader } from '@/components/ui/dashboard-section-header';
import { EmptyState } from '@/components/ui/empty-state';
import { Heading } from '@/components/ui/heading';
import { InfoHelp } from '@/components/ui/option-info';
import { CaptionField, ResultContext } from '@/components/ui/result-context';
import { PricesSourceLink } from '@/components/ui/chart-display-helpers';
import { TcoPriceTable } from '@/components/ui/editable-tco-badges';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { SegmentedToggle } from '@/components/ui/segmented-toggle';
import { ShareButton } from '@/components/ui/share-button';
import { useThemeColors } from '@/hooks/useThemeColors';
import { track } from '@/lib/analytics/analytics';
import { useLocale } from '@/lib/i18n/use-locale';
import { isQueueing, layoutLabel, leadCell } from './deployment';
import { costPerGpuHour, hardwareLabel, VIDEO_HARDWARE_ROSTER, type CostTier } from './hardware';
import {
  COST_TIERS,
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
/** Compare choices; a deep link carrying one opens the Compare section on load. */
const COMPARE_SECTION_PARAMS = ['v_base', 'v_cand', 'v_case'];
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
      'Measured GPU deployments on one workload: time to video, useful output per GPU-hour and per TCO dollar, and metered GPU-board energy. Runtime and layout details accompany each result.',
    chart: 'Chart',
    table: 'Table',
    viewToggle: 'Chart or table view',
    optimalOnly: 'Optimal only',
    optimalInfo:
      "Show only each hardware's Pareto-optimal deployments for the selected axes; turn off to see the dominated deployments faded.",
    compare: 'Compare',
    evidence: 'Performance evidence',
    toggleCompare: 'Show or hide the Compare section',
    toggleEvidence: 'Show or hide performance evidence',
    tier: 'Cost tier',
    tierInfo: 'Which published TCO tier sets the $/chip/hr behind the cost metrics.',
    apiReference: 'API reference',
    idle: (list: string) =>
      `Per participating GPU: ${list} reserved more boards than one video uses; the idle boards are not counted.`,
    idleItem: (hardware: string, used: number, reserved: number) =>
      `${hardware} (${used} of ${reserved})`,
    deployments: (n: number) => `${n} deployments`,
    history: 'Performance history',
    historyHint: 'Stored H3 evidence, including older runs without approval',
    loading: 'Loading video results…',
    error: 'Could not load video results',
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
      '同一工作负载在不同 GPU 部署下的实测结果：出片时间、每 GPU 小时和每美元 TCO 的有效产出，以及 GPU 板卡能耗。各结果同时列出 runtime 与部署配置。',
    chart: '图表',
    table: '表格',
    viewToggle: '图表或表格视图',
    optimalOnly: '仅最优',
    optimalInfo: '只显示各硬件在当前坐标轴下的 Pareto 最优部署；关闭后以淡色显示被支配的部署。',
    compare: '对比',
    evidence: '性能测量证据',
    toggleCompare: '展开或收起“对比”区块',
    toggleEvidence: '展开或收起性能测量证据',
    tier: '成本档位',
    tierInfo: '成本指标所用的 $/chip/hr 采用哪一档已发布的 TCO。',
    apiReference: 'API 参考价',
    idle: (list: string) =>
      `按参与计算的 GPU 计：${list}预留的板卡多于单条视频所需，空闲板卡未计入。`,
    idleItem: (hardware: string, used: number, reserved: number) =>
      `${hardware}（${used} / ${reserved} 张）`,
    deployments: (n: number) => `${n} 种部署`,
    history: '性能历史',
    historyHint: '已存储的 H3 结果，包括尚无发布批准记录的旧运行',
    loading: '正在加载视频结果…',
    error: '无法加载视频结果',
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
  const hidden = useMemo(() => new Set(state.hidden), [state.hidden]);
  const [legendExpanded, setLegendExpanded] = useState(true);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [compareOpen, setCompareOpen] = useState(false);
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    setHistoryOpen(HISTORY_SECTION_PARAMS.some((key) => params.has(key)));
    setCompareOpen(COMPARE_SECTION_PARAMS.some((key) => params.has(key)));
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
        const next = new Set(hidden);
        if (next.has(name)) next.delete(name);
        else next.add(name);
        update({ hidden: [...next] });
        track('video_legend_toggled', { gpu: name });
      },
    };
  });

  const exportCsv = () => {
    const rows = videoTableRows(cells, hidden, state);
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

  const legend = (
    <div data-testid="video-legend">
      <ChartLegend
        variant="sidebar"
        legendItems={legendItems}
        isLegendExpanded={legendExpanded}
        onExpandedChange={setLegendExpanded}
        disableActiveSort
        reset={{
          id: 'video-reset-filter',
          disabled: hidden.size === 0,
          onClick: () => {
            update({ hidden: [] });
            track('video_legend_filter_reset');
          },
        }}
        switches={[
          {
            id: 'video-optimal-only',
            label: s.optimalOnly,
            checked: state.optimal,
            infoTooltip: s.optimalInfo,
            onCheckedChange: (checked) => {
              update({ optimal: checked });
              track('video_optimal_toggled', { enabled: checked });
            },
          },
        ]}
      />
    </div>
  );

  const priceItems = [...measured.keys()]
    .filter((key) => !hidden.has(key))
    .map((key) => ({
      base: key,
      label: HW_REGISTRY[key]?.badgeLabel ?? hardwareLabel(key),
      value: costPerGpuHour(key, state.tier)?.toFixed(2) ?? '—',
    }));

  const footer = (
    <ResultContext
      locale={locale}
      layout="footer"
      scenario={
        <CaptionField
          label={s.tier}
          value={TIER_LABELS[state.tier][locale]}
          testId="result-context-cost-tier"
          hideLabel
          control={
            <span className="inline-flex items-center gap-0.5">
              <SearchableSelect
                triggerTestId="video-cost-tier"
                triggerAriaLabel={s.tier}
                value={state.tier}
                onValueChange={(value) => {
                  update({ tier: value as CostTier });
                  track('video_tier_changed', { value });
                }}
                placeholder={s.tier}
                initialLabel={TIER_LABELS[state.tier][locale]}
                searchable={false}
                trackPrefix="video_cost_tier"
                size="sm"
                className="w-auto max-w-full text-xs"
                contentClassName="w-72"
                groups={[
                  {
                    label: '',
                    options: COST_TIERS.map((tier) => ({
                      value: tier,
                      label: TIER_LABELS[tier][locale],
                      testId: `video-cost-tier-${tier}`,
                    })),
                  },
                ]}
              />
              <InfoHelp label={s.tier} value="video-cost-tier" align="start">
                {s.tierInfo}
              </InfoHelp>
            </span>
          }
        />
      }
      controlsEnd={
        priceItems.length > 0 ? (
          <TcoPriceTable
            items={priceItems}
            testId="video-tco-table"
            cellTestId="video-tco-badge"
            inputIdPrefix="video-tco"
          />
        ) : undefined
      }
      source="SemiAnalysis InferenceX™"
      metaEnd={
        <span className="inline-flex flex-wrap items-center gap-x-2">
          <span className="tabular-nums">
            {s.apiReference}
            {locale === 'zh' ? '：' : ': '}
            {formatApiPrice(state.apiPrice)}/video-s ({H3_API_REFERENCE.capturedOn})
          </span>
          <PricesSourceLink />
        </span>
      }
    />
  );
  return (
    <div className="flex min-w-0 w-full flex-col gap-4" data-testid="video-dashboard">
      <section className="relative z-20">
        <Card>
          <div className="flex flex-col gap-4">
            <DashboardSectionHeader
              headingAs="h1"
              title={s.title}
              description={s.subtitle}
              actions={<ShareButton />}
            />
            <VideoConfigBar
              state={state}
              onChange={update}
              modelLabel={modelLabel}
              workloadLabel={`${workloadLabel}${workloadSuffix}`}
              deploymentLabel={deploymentLabel}
            />
          </div>
        </Card>
      </section>
      <ChartSection
        chartId={VIDEO_CHART_ID}
        analyticsPrefix="video"
        exportFileName={`videogenx-${state.y}-vs-${state.x}`}
        onExportCsv={exportCsv}
        hideImageExport={state.view === 'table'}
        setIsLegendExpanded={setLegendExpanded}
        leadingControls={
          <SegmentedToggle
            value={state.view}
            role="group"
            ariaLabel={s.viewToggle}
            options={[
              { value: 'chart', label: s.chart },
              { value: 'table', label: s.table },
            ]}
            onValueChange={(view) => {
              update({ view });
              track('video_view_changed', { view });
            }}
          />
        }
      >
        <div className="space-y-3 px-4 md:px-6" data-testid="video-chart-card">
          <div className="min-w-0 pr-0 md:pr-56">
            <Heading level="card">
              {modelLabel} · {metricLabel(state.y, locale, options)} {s.vs}{' '}
              {metricLabel(state.x, locale, options)}
            </Heading>
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
            <EmptyState bare role="status" className="min-h-110">
              {s.loading}
            </EmptyState>
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
          {!loading &&
            !error &&
            (state.view === 'chart' ? (
              <VideoHardwareChart
                points={cells}
                state={state}
                colorFor={colorFor}
                hidden={hidden}
                onSelect={(p: VideoPoint) =>
                  track('video_point_selected', {
                    gpu: p.hardwareKey ?? '',
                    run: p.runId,
                  })
                }
                legend={legend}
                footer={footer}
              />
            ) : (
              <>
                <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_260px]">
                  <div className="min-w-0">
                    <VideoPointsTable points={cells} state={state} hidden={hidden} />
                  </div>
                  {legend}
                </div>
                {footer}
              </>
            ))}
        </div>
      </ChartSection>
      <VideoKpiCards points={cells} state={state} colorFor={colorFor} loading={loading} />
      {/* These mount after the first fetch resolves, so the deep-link flag read on mount is settled. */}
      {!loading && !error && (
        <>
          <CollapsibleSection
            title={s.compare}
            toggleLabel={s.toggleCompare}
            defaultOpen={compareOpen}
            titleWhenOpen={false}
            testId="video-compare-toggle"
            onToggle={(enabled) => track('video_compare_section_toggled', { enabled })}
          >
            <VideoCompare points={cells} options={options} colorFor={colorFor} />
          </CollapsibleSection>
          <CollapsibleSection
            title={s.evidence}
            toggleLabel={s.toggleEvidence}
            defaultOpen={false}
            titleWhenOpen={false}
            testId="video-evidence-toggle"
            onToggle={(enabled) => track('video_evidence_section_toggled', { enabled })}
          >
            <VideoEvidence points={cells} colorFor={colorFor} />
          </CollapsibleSection>
        </>
      )}
      <details
        className="group/history"
        data-testid="video-history-section"
        open={historyOpen}
        onToggle={(event) => {
          const open = event.currentTarget.open;
          if (open === historyOpen) return;
          setHistoryOpen(open);
          track('video_history_section_toggled', { enabled: open });
        }}
      >
        <summary className="mb-2 flex cursor-pointer list-none flex-wrap items-center gap-x-2 gap-y-1 [&::-webkit-details-marker]:hidden">
          <ChevronDown
            aria-hidden="true"
            className="size-5 text-muted-foreground transition-transform duration-200 group-open/history:rotate-180"
          />
          <h2 className="text-lg font-medium">{s.history}</h2>
          <span className="text-sm text-muted-foreground">{s.historyHint}</span>
        </summary>
        <div>{historyOpen && <VideoHistory />}</div>
      </details>
    </div>
  );
}
