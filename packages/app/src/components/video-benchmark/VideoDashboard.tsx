'use client';

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import {
  HW_REGISTRY,
  TCO_SOURCE_TITLE,
  TCO_SOURCE_URL,
} from '@semianalysisai/inferencex-constants';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import ChartLegend from '@/components/ui/chart-legend';
import { ChartSection } from '@/components/ui/chart-section';
import { CollapsibleSection } from '@/components/ui/collapsible-section';
import { DashboardSectionHeader } from '@/components/ui/dashboard-section-header';
import { Heading } from '@/components/ui/heading';
import { captionControlTriggerClassName } from '@/components/ui/result-context';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { ShareButton } from '@/components/ui/share-button';
import { useThemeColors } from '@/hooks/useThemeColors';
import { track } from '@/lib/analytics';
import { useLocale } from '@/lib/use-locale';
import { isQueueing, layoutLabel, leadCell } from './deployment';
import { costPerGpuHour, hardwareLabel, type CostTier } from './hardware';
import { COST_TIERS, metricLabel, TIER_LABELS, type VideoPoint } from './metrics';
import { dashboardCells } from './points';
import { formatApiPrice } from './api-reference';
import { VIDEO_MODELS, videoModelHardware } from './models';
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
import { videoCsv } from './csv';
import VideoQualitySummary from './VideoQualitySummary';
import VideoPointDetails from './VideoPointDetails';
import VideoServingEvidence from './VideoServingEvidence';

/** History filter params; a deep link carrying one opens the history section on load. */
const HISTORY_SECTION_PARAMS = ['history-hardware', 'history-concurrency', 'history-query'];
/** Compare choices; a deep link carrying one opens the Compare section on load. */
const COMPARE_SECTION_PARAMS = ['v_base', 'v_cand', 'v_case'];

const STRINGS = {
  en: {
    title: 'VideoGenX',
    subtitle:
      'Measured GPU deployments on one workload: time to video, useful output per GPU-hour and per TCO dollar, and metered GPU-board energy. Runtime and layout details accompany each result.',
    chart: 'Chart',
    table: 'Table',
    viewToggle: 'Chart or table view',
    optimalOnly: 'Optimal Only',
    optimalInfo:
      "Show only each hardware's Pareto-optimal deployments for the selected axes; turn off to see the dominated deployments faded.",
    compare: 'Compare',
    evidence: 'Performance evidence',
    serving: 'Serving evidence',
    toggleServing: 'Show or hide serving evidence',
    toggleCompare: 'Show or hide the Compare section',
    toggleEvidence: 'Show or hide performance evidence',
    tier: 'Cost tier',
    badges: 'TCO $/chip/hr',
    source: 'Source',
    apiReference: 'API reference',
    idle: (list: string) =>
      `Per participating GPU: ${list} reserved more boards than one video uses; the idle boards are not counted.`,
    idleItem: (hardware: string, used: number, reserved: number) =>
      `${hardware} (${used} of ${reserved})`,
    deployments: (n: number) => `${n} GPU layouts`,
    history: 'Performance history',
    historyHint: 'Published results for the selected model, including older runs.',
    empty:
      'No Wan2.2 performance measurements are available in the loaded history. This text-to-video view has no measurements or verified API price yet. H3 results remain separate.',
    wanSubtitle:
      'Text-to-video results are kept separate from H3’s video-with-audio workload. Compare hardware only within the selected model and measured workload.',
    wanWorkload: 'Text to video · not measured',
    unknownPrice: 'Not provided',
    customPrice: 'reader assumption',
    loading: 'Loading published results…',
    error: 'Could not load published results',
    retry: 'Retry',
    replay: 'Local replay of retained measurements. No new measurement or result publication.',
    vs: 'vs.',
    notMeasured: 'not measured',
    runtime: 'runtime',
    workloads: (n: number) => ` (${n} other workloads hidden)`,
  },
  zh: {
    title: 'VideoGenX',
    subtitle:
      '同一工作负载在不同 GPU 部署下的实测结果：出片时间、每 GPU 小时和每美元 TCO 的有效产出，以及 GPU 板卡能耗。各结果同时列出 runtime 与部署配置。',
    chart: '图表',
    table: '表格',
    viewToggle: '图表或表格视图',
    optimalOnly: '仅最优',
    optimalInfo: '只显示各硬件在当前坐标轴下的 Pareto 最优部署；关闭后以淡色显示被支配的部署。',
    compare: '对比',
    evidence: '性能测量证据',
    serving: '服务结果记录',
    toggleServing: '展开或收起服务结果记录',
    toggleCompare: '展开或收起“对比”区块',
    toggleEvidence: '展开或收起性能测量证据',
    tier: '成本档位',
    badges: 'TCO $/chip/hr',
    source: '来源',
    apiReference: 'API 参考价',
    idle: (list: string) =>
      `按参与计算的 GPU 计：${list}预留的板卡多于单条视频所需，空闲板卡未计入。`,
    idleItem: (hardware: string, used: number, reserved: number) =>
      `${hardware}（${used} / ${reserved} 张）`,
    deployments: (n: number) => `${n} 种 GPU 布局`,
    history: '性能历史',
    historyHint: '所选模型已发布的结果，包括较早的运行。',
    empty:
      '已加载的历史中暂无 Wan2.2 性能测量。此文生视频视图尚无测量数据或已验证 API 参考价。H3 结果单独保留。',
    wanSubtitle:
      '文生视频结果与 H3 的音视频工作负载分别展示。仅在所选模型和实测工作负载内比较硬件。',
    wanWorkload: '文生视频 · 未测量',
    unknownPrice: '未提供',
    customPrice: '读者假设',
    loading: '正在加载已发布结果…',
    error: '无法加载已发布结果',
    retry: '重试',
    replay: '正在本地回放保留测量，未重新测量或发布结果。',
    vs: 'vs.',
    notMeasured: '未测得',
    runtime: 'runtime',
    workloads: (n: number) => `（另有 ${n} 个工作负载未显示）`,
  },
};

const subscribeNoop = () => () => {};

export default function VideoDashboard() {
  const locale = useLocale();
  const s = STRINGS[locale];
  const { state, update } = useVideoDashboardState();
  const { points, servingEvidence, loading, error, replay, retry } = useVideoPoints(state.model);
  const model = VIDEO_MODELS[state.model];
  const {
    cells,
    workload: primaryWorkload,
    otherWorkloads,
  } = useMemo(() => dashboardCells(points), [points]);
  const roster = useMemo(() => videoModelHardware(state.model, cells), [state.model, cells]);
  const hidden = useMemo(() => new Set(state.hidden), [state.hidden]);
  const [legendExpanded, setLegendExpanded] = useState(true);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [compareOpen, setCompareOpen] = useState(false);
  const [selectedPoint, setSelectedPoint] = useState<VideoPoint | null>(null);
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    setHistoryOpen(HISTORY_SECTION_PARAMS.some((key) => params.has(key)));
    setCompareOpen(COMPARE_SECTION_PARAMS.some((key) => params.has(key)));
  }, []);

  const hardwareKeys = useMemo(() => roster.map((item) => item.key), [roster]);
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
  const workloadLabel =
    workloadParts.slice(0, 4).join(' · ') || (state.model === 'wan22' ? s.wanWorkload : '—');
  const modelLabel = workloadParts[4] ?? lead?.model ?? model.label;
  const workloadSuffix = otherWorkloads > 0 ? s.workloads(otherWorkloads) : '';
  // Jobs that reserved a whole node but generated on part of it: say so beside the per-GPU numbers.
  const idle = [...measured.values()]
    .filter(
      (p) => p.participating !== null && p.allocated !== null && p.allocated > p.participating,
    )
    .map((p) => s.idleItem(hardwareLabel(p.hardwareKey ?? ''), p.participating!, p.allocated!));

  const legendItems = roster.map(({ key, unavailable }) => {
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
        track('video_legend_toggled', { hardware: name });
      },
    };
  });

  const exportCsv = () => {
    const blob = new Blob([videoCsv(cells, state)], {
      type: 'text/csv;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `videogenx-${state.model}-${state.y}-vs-${state.x}-${state.tier}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="mx-auto min-w-0 w-full max-w-7xl space-y-4 py-2" data-testid="video-dashboard">
      <section className="relative z-20">
        <Card>
          <div className="flex flex-col gap-4">
            <DashboardSectionHeader
              headingAs="h1"
              title={`${s.title} · ${model.label}`}
              description={state.model === 'wan22' ? s.wanSubtitle : s.subtitle}
              actions={<ShareButton />}
            />
            <VideoConfigBar
              state={state}
              onChange={update}
              workloadLabel={`${workloadLabel}${workloadSuffix}`}
              deploymentLabel={deploymentLabel}
            />
          </div>
        </Card>
      </section>
      <ChartSection
        chartId={VIDEO_CHART_ID}
        analyticsPrefix="video"
        exportFileName={`videogenx-${state.model}-${state.y}-vs-${state.x}`}
        onExportCsv={exportCsv}
        hideImageExport={state.view === 'table' || cells.length === 0}
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
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
              <span className="inline-flex flex-wrap items-center gap-x-1">
                <span className="font-medium text-foreground">{s.tier}:</span>{' '}
                <span className="no-export inline-flex items-center">
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
                    className={captionControlTriggerClassName}
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
                </span>
                <span className="export-only hidden">{TIER_LABELS[state.tier][locale]}</span>
              </span>
              <span className="flex flex-wrap items-center gap-1">
                {hardwareKeys.length > 0 && `${s.badges}:`}
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
                {s.apiReference}:{' '}
                {state.apiPrice === null
                  ? s.unknownPrice
                  : `${formatApiPrice(state.apiPrice)}/video-s`}
                {state.apiPrice !== null &&
                  ` (${state.apiPrice === model.apiReference?.pricePerVideoSecondUsd ? model.apiReference.capturedOn : s.customPrice})`}
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
            </div>
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
          {state.model === 'wan22' && !loading && !error && points.length === 0 && (
            <p
              role="status"
              className="rounded-lg border bg-muted/30 p-4 text-sm"
              data-testid="video-model-empty"
            >
              {s.empty}
            </p>
          )}
          {state.model === 'h3' && <VideoQualitySummary points={cells} state={state} />}
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
          {!loading && !error && (state.model === 'h3' || points.length > 0) && (
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_260px]">
              <div className="min-w-0">
                {state.view === 'chart' ? (
                  <VideoHardwareChart
                    points={cells}
                    state={state}
                    colorFor={colorFor}
                    hidden={hidden}
                    onSelect={(p: VideoPoint) => {
                      setSelectedPoint(p);
                      track('video_point_selected', {
                        hardware: p.hardwareKey ?? '',
                        run: p.runId,
                      });
                    }}
                  />
                ) : (
                  <VideoPointsTable
                    points={cells}
                    state={state}
                    hidden={hidden}
                    onSelect={setSelectedPoint}
                  />
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
            </div>
          )}
          {selectedPoint &&
            videoTableRows(cells, hidden, state).some((p) => p.id === selectedPoint.id) && (
              <VideoPointDetails
                point={selectedPoint}
                state={state}
                onClose={() => setSelectedPoint(null)}
              />
            )}
        </div>
      </ChartSection>
      <VideoKpiCards points={cells} state={state} colorFor={colorFor} loading={loading} />
      {!loading && !error && (state.model === 'h3' || servingEvidence.length > 0) && (
        <CollapsibleSection
          title={s.serving}
          toggleLabel={s.toggleServing}
          defaultOpen={false}
          titleWhenOpen={false}
          testId="video-serving-toggle"
        >
          <VideoServingEvidence rows={servingEvidence} />
        </CollapsibleSection>
      )}
      {/* These mount after the first fetch resolves, so the deep-link flag read on mount is settled. */}
      {!loading && !error && (state.model === 'h3' || points.length > 0) && (
        <>
          <CollapsibleSection
            title={s.compare}
            toggleLabel={s.toggleCompare}
            defaultOpen={compareOpen}
            titleWhenOpen={false}
            testId="video-compare-toggle"
            onToggle={(open) => track('video_compare_section_toggled', { open })}
          >
            <VideoCompare key={state.model} points={cells} options={options} colorFor={colorFor} />
          </CollapsibleSection>
          <CollapsibleSection
            title={s.evidence}
            toggleLabel={s.toggleEvidence}
            defaultOpen={false}
            titleWhenOpen={false}
            testId="video-evidence-toggle"
            onToggle={(open) => track('video_evidence_section_toggled', { open })}
          >
            <VideoEvidence points={cells} colorFor={colorFor} />
          </CollapsibleSection>
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
        <div className="mt-3">
          {historyOpen && <VideoHistory key={state.model} model={state.model} />}
        </div>
      </details>
    </div>
  );
}
