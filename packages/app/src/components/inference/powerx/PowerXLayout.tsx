'use client';

import { BarChart3, ChevronDown, ChevronRight, Table2 } from 'lucide-react';
import { type ReactNode, useId, useState } from 'react';

import {
  useInferenceActions,
  useInferenceData,
  useInferenceFilters,
} from '@/components/inference/InferenceContext';
import { MeasuredMetricControls } from '@/components/inference/ui/MeasuredMetricControls';
import WorkflowInfoDisplay from '@/components/inference/ui/WorkflowInfoDisplay';
import { powerCompareAvailable } from '@/components/inference/utils/power-compare';
import { Card } from '@/components/ui/card';
import { SEGMENTED_CONTAINER_STYLE } from '@/components/ui/control-styles';
import { DashboardSectionHeader } from '@/components/ui/dashboard-section-header';
import { ModelLogo } from '@/components/ui/model-logo';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { type SegmentedToggleOption, SegmentedToggle } from '@/components/ui/segmented-toggle';
import { ShareButton } from '@/components/ui/share-button';
import { track } from '@/lib/analytics/analytics';
import {
  getModelCategory,
  getModelLabel,
  getPrecisionLabel,
  getSequenceLabel,
  groupByCategory,
  type Model,
  type Precision,
  type Sequence,
} from '@/lib/catalog/data-mappings';
import { useLocale } from '@/lib/i18n/use-locale';
import {
  gpusPerMegawatt,
  IT_NOT_MODELED_NOTE,
  modeledFacilityWattsPerGpu,
  modeledItWattsPerGpu,
  POWER_BASIS_TAG_TITLES,
  POWER_BASIS_TAGS,
  POWER_COUNT_LABELS,
} from '@/lib/power/power-basis';
import { getHardwareConfig } from '@/lib/catalog/constants';
import { Switch } from '@/components/ui/switch';
import type { InferenceData } from '@/components/inference/types';
import {
  usePowerXActivePoint,
  usePowerXIncludeFacility,
  useSetPowerXIncludeFacility,
} from '@/components/inference/ui/powerx-surface';

import { PowerBasisPill } from './PowerBasisPill';
import { replaceRouterPathname } from '@/lib/routing/client-navigation';
import { inferenceModelRouteForSelection } from '@/lib/routing/inference-model-slug';
import { cn, getDisplayLabel } from '@/lib/shared/utils';

import {
  ENERGY_PER_METRIC,
  energyPerFor,
  POWERX_VIEWS,
  powerXCountFor,
  powerXMetricFields,
  powerXProvenanceText,
  powerXShowAsFor,
  powerXViewFor,
  selectPowerXCount,
  selectPowerXPer,
  selectPowerXShowAs,
  selectPowerXView,
  VIEW_METRICS,
  type EnergyPer,
  type PowerXCount,
  type PowerXProvenanceInput,
  type PowerXSelection,
  type PowerXShowAs,
  type PowerXView,
} from './powerx-views';

const STRINGS = {
  en: {
    title: 'PowerX',
    description: 'Measured chip power and energy per token for every benchmark point.',
    viewsLabel: 'PowerX view',
    views: {
      energy: 'Energy per token',
      draw: 'Power draw',
      where: 'Where the power goes',
      time: 'Over time',
    } satisfies Record<PowerXView, string>,
    hints: {
      energy: 'Joules per token or Wh per query vs interactivity',
      draw: 'Watts per chip vs interactivity',
      where: 'GPU, server and facility at one interactivity',
      time: 'Power trace through a run',
    } satisfies Record<PowerXView, string>,
    viewMode: 'View mode',
    chart: 'Chart',
    table: 'Table',
    model: 'Model',
    scenario: 'Scenario',
    precision: 'Precision',
    count: 'Count',
    itHelp: 'GPU measured; CPU, server parts, fans/PSU and network share modeled. No PUE.',
    systemHelp: 'IT × PUE: GPU measured, rest of server and the facility overhead modeled',
    both: 'All',
    bothHelp: 'GPU only, IT and facility on one chart',
    systemOutputOnly: 'IT and facility are modeled per output token only',
    whatIs: 'What is PowerX?',
    whatIsBody:
      'Measured GPU power from InferenceX benchmark runs, plus a modeled IT and facility breakdown. Not the energy team’s grid power model.',
    readout: {
      it: 'IT',
      wPerGpu: 'W/GPU',
      gpusPerMw: 'GPUs per MW (IT)',
      facility: 'Facility',
      atPue: (pue: string) => `W/GPU at PUE ${pue}`,
      gpu: 'GPU',
      measured: 'W measured',
      noModel: 'No IT model for this setup yet',
      pinned: 'Pinned point',
      hovered: 'Hovered point',
      nearest: (x: string) => `Near ${x} tok/s/user · hover a point to change`,
      at: (conc: number, x: string) => `c${conc} · ${x} tok/s/user`,
    },
    includeFacility: (pue: string) => `Include facility (PUE ${pue})`,
    includeFacilityHelp: 'Appends the PUE overhead after the IT stack; off by default on PowerX.',
    basisKey: 'Every power number carries one of three tags:',
    utilization:
      'Utilization means three different things, and PowerX reports only the third: serving efficiency (how busy the deployment is while it serves), demand (what share of capacity customers use over a day), and power draw vs TDP (measured watts as a share of the chip’s rated power).',
    per: 'Per',
    perOptions: {
      output: 'Output token',
      input: 'Input',
      total: 'All',
      query: 'Query',
    } satisfies Record<EnergyPer, string>,
    showAs: 'Show as',
    watts: 'W per chip',
    tdp: '% of TDP',
    tdpSystemHelp: 'TDP bounds GPU power only',
    moreViews: 'More views',
    moreViewsHint: 'prefill vs decode · P75/P90 · rated boundaries · power over time',
    compareBoundaries: 'Compare boundaries',
    compareOff: 'Off',
    compareAll: 'All five',
    compareAllHelp: 'Adds the rated GPU TDP and all-in provisioned boundaries',
    compareUnavailable: 'Available for average W per chip and J per output token',
    splitBy: 'Split by',
    boundaries: 'Boundary',
    roles: 'Prefill vs decode',
    rolesUnavailable: 'Needs disaggregated prefill/decode results',
    rolesNoData: 'No validated prefill/decode telemetry for this model and scenario',
    openTimeline: 'Open power over time',
    curve: 'Compare on the curve',
    curveHint: 'GPU only (solid) vs IT and facility (dashed) across interactivity',
    howWeMeasure: 'How we measure',
    legendMobile: 'Chips & options',
  },
  zh: {
    title: 'PowerX 功耗',
    description: '每个基准测试点的实测芯片功耗与每 Token 能耗。',
    viewsLabel: 'PowerX 视图',
    views: {
      energy: '每 Token 能耗',
      draw: '功耗',
      where: '功耗去向',
      time: '随时间变化',
    } satisfies Record<PowerXView, string>,
    hints: {
      energy: '每 Token 焦耳数或每次查询 Wh vs 交互性',
      draw: '每芯片瓦数 vs 交互性',
      where: '同一交互性下的 GPU、服务器与数据中心功耗',
      time: '运行期间的功耗曲线',
    } satisfies Record<PowerXView, string>,
    viewMode: '视图模式',
    chart: '图表',
    table: '表格',
    model: '模型',
    scenario: '场景',
    precision: '精度',
    count: '统计范围',
    itHelp: 'GPU 为实测；CPU、服务器部件、风扇/电源与网络分摊为模型估算。不含 PUE。',
    systemHelp: 'IT × PUE：GPU 为实测，服务器其他组件与数据中心开销为模型估算',
    both: '全部',
    bothHelp: '在同一图中对比仅 GPU、IT 与数据中心',
    systemOutputOnly: 'IT 与数据中心仅按输出 Token 建模',
    whatIs: '什么是 PowerX？',
    whatIsBody:
      '来自 InferenceX 基准测试运行的实测 GPU 功耗，加上模型估算的 IT 与数据中心功耗构成。它不是能源团队的电网功耗模型。',
    readout: {
      it: 'IT',
      wPerGpu: 'W/GPU',
      gpusPerMw: '每 MW 可支持的 GPU 数（IT）',
      facility: '数据中心',
      atPue: (pue: string) => `W/GPU（PUE ${pue}）`,
      gpu: 'GPU',
      measured: 'W 实测',
      noModel: '该配置暂无 IT 功耗模型',
      pinned: '已固定的数据点',
      hovered: '悬停的数据点',
      nearest: (x: string) => `接近 ${x} tok/s/user · 悬停数据点可切换`,
      at: (conc: number, x: string) => `c${conc} · ${x} tok/s/user`,
    },
    includeFacility: (pue: string) => `计入数据中心开销（PUE ${pue}）`,
    includeFacilityHelp: '在 IT 堆叠之后追加 PUE 开销；PowerX 默认关闭。',
    basisKey: '每个功耗数值都带有以下三种标签之一：',
    utilization:
      '“利用率”有三种不同含义，PowerX 只报告第三种：服务效率（部署在服务期间的繁忙程度）、需求（客户一天内使用的容量占比），以及功耗占 TDP 的比例（实测瓦数占芯片额定功耗的份额）。',
    per: '计量单位',
    perOptions: {
      output: '输出 Token',
      input: '输入',
      total: '全部',
      query: '每次查询',
    } satisfies Record<EnergyPer, string>,
    showAs: '显示为',
    watts: '每芯片 W',
    tdp: 'TDP 占比',
    tdpSystemHelp: 'TDP 仅限定 GPU 功耗',
    moreViews: '更多视图',
    moreViewsHint: '预填充 vs 解码 · P75/P90 · 额定边界 · 功耗随时间变化',
    compareBoundaries: '对比功耗边界',
    compareOff: '关闭',
    compareAll: '全部五个',
    compareAllHelp: '加入额定 GPU TDP 与整体预配两个边界',
    compareUnavailable: '仅支持平均每芯片 W 与每输出 token 能耗',
    splitBy: '拆分方式',
    boundaries: '功耗边界',
    roles: '预填充 vs 解码',
    rolesUnavailable: '需要预填充/解码分离部署的结果',
    rolesNoData: '该模型与场景暂无经过验证的预填充/解码遥测数据',
    openTimeline: '打开功耗随时间变化',
    curve: '在曲线上对比',
    curveHint: '仅 GPU（实线）与 IT、数据中心（虚线）随交互性的变化',
    howWeMeasure: '测量方法',
    legendMobile: '芯片与选项',
  },
} as const;

export function usePowerXStrings() {
  return STRINGS[useLocale()];
}

type ViewMode = 'chart' | 'table';

/** The compact view-tab strip: four views as tabs, the Chart/Table toggle on the right. */
export function PowerXViewTabs({
  selection,
  onSelectionChange,
  viewMode,
  onViewModeChange,
  toolbar,
}: {
  selection: PowerXSelection;
  onSelectionChange: (next: PowerXSelection) => void;
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  /** Export buttons and other per-chart actions. */
  toolbar?: ReactNode;
}) {
  const t = usePowerXStrings();
  const view = powerXViewFor(selection.metric, selection.compare);
  const viewModeOptions: SegmentedToggleOption<ViewMode>[] = [
    {
      value: 'chart',
      label: t.chart,
      icon: <BarChart3 className="size-3.5" />,
      testId: 'inference-chart-view-btn',
    },
    {
      value: 'table',
      label: t.table,
      icon: <Table2 className="size-3.5" />,
      testId: 'inference-table-view-btn',
    },
  ];
  return (
    <div className="flex min-w-0 flex-wrap items-end justify-between gap-x-4 gap-y-2 border-b border-border/60">
      <div
        role="tablist"
        aria-label={t.viewsLabel}
        data-testid="powerx-tabs"
        className="-mb-px flex min-w-0 max-w-full gap-1 overflow-x-auto"
      >
        {POWERX_VIEWS.map((value) => {
          const selected = value === view;
          return (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={selected}
              title={t.hints[value]}
              data-testid={`powerx-tab-${value}`}
              onClick={() => {
                if (selected) return;
                track('inference_powerx_tab_selected', { tab: value });
                onSelectionChange(selectPowerXView(value, selection));
              }}
              className={cn(
                'inline-flex min-h-11 shrink-0 items-center gap-1.5 border-b-2 border-transparent px-3 text-sm font-semibold whitespace-nowrap text-muted-foreground transition-colors hover:border-muted-foreground/30 md:min-h-9',
                selected && 'border-secondary text-secondary dark:border-primary dark:text-primary',
              )}
            >
              {t.views[value]}
            </button>
          );
        })}
      </div>
      <div className="mb-1.5 flex min-w-0 flex-wrap items-center gap-2">
        <SegmentedToggle
          value={viewMode}
          options={viewModeOptions}
          onValueChange={onViewModeChange}
          ariaLabel={t.viewMode}
          testId="inference-view-toggle-0"
        />
        {toolbar}
      </div>
    </div>
  );
}

/** Model (dropdown), scenario and precision (segmented, only with a choice) and the run chip. */
export function PowerXCaptionRow() {
  const locale = useLocale();
  const t = STRINGS[locale];
  const { availableModels, availableSequences, availablePrecisions } = useInferenceData();
  const { selectedModel, selectedSequence, selectedPrecisions } = useInferenceFilters();
  const { setSelectedModel, setSelectedSequence, setSelectedPrecisions } = useInferenceActions();
  const [modelOpen, setModelOpen] = useState(false);
  const groups = groupByCategory(availableModels, (m) => getModelCategory(m as Model));
  const modelOptions = [
    ...groups.default,
    ...groups.experimental,
    ...groups.maintenance,
    ...groups.deprecated,
  ];

  const selectModel = (value: Model) => {
    setModelOpen(false);
    if (value === selectedModel) return;
    setSelectedModel(value);
    const target = inferenceModelRouteForSelection(window.location.pathname, value);
    if (target !== null) replaceRouterPathname(target, ['g_model']);
    track('inference_model_selected', { model: value });
  };

  return (
    <div
      className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2"
      data-testid="powerx-caption"
    >
      <Popover open={modelOpen} onOpenChange={setModelOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label={t.model}
            data-testid="powerx-model-trigger"
            className="inline-flex min-h-11 min-w-0 max-w-full items-center gap-2 rounded-md px-1 text-base font-semibold text-foreground hover:bg-muted/40 md:min-h-9"
          >
            <ModelLogo model={selectedModel as Model} className="size-6 shrink-0" />
            <span className="truncate">{getModelLabel(selectedModel as Model)}</span>
            <ChevronDown className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className="max-h-[60vh] w-80 overflow-y-auto p-1">
          <ul role="listbox" aria-label={t.model} data-testid="powerx-model-menu">
            {modelOptions.map((model) => (
              <li key={model}>
                <button
                  type="button"
                  role="option"
                  aria-selected={model === selectedModel}
                  onClick={() => selectModel(model as Model)}
                  className={cn(
                    'flex min-h-11 w-full items-center gap-2 rounded-md px-2 text-left text-sm hover:bg-accent md:min-h-8',
                    model === selectedModel && 'bg-muted/60 font-medium',
                  )}
                >
                  <ModelLogo model={model as Model} className="size-4 shrink-0" />
                  <span className="truncate">{getModelLabel(model as Model)}</span>
                </button>
              </li>
            ))}
          </ul>
        </PopoverContent>
      </Popover>

      {availableSequences.length > 1 && (
        <SegmentedToggle<string>
          value={selectedSequence}
          ariaLabel={t.scenario}
          role="group"
          testId="powerx-scenario"
          buttonClassName="whitespace-nowrap"
          onValueChange={(value) => {
            setSelectedSequence(value as Sequence);
            track('inference_sequence_selected', { sequence: value });
          }}
          options={availableSequences.map((seq) => ({
            value: seq,
            label: getSequenceLabel(seq as Sequence, locale),
          }))}
        />
      )}

      {availablePrecisions.length > 1 && (
        <div
          role="group"
          aria-label={t.precision}
          data-testid="powerx-precision"
          className={SEGMENTED_CONTAINER_STYLE}
        >
          {availablePrecisions.map((precision) => {
            const pressed = selectedPrecisions.includes(precision);
            return (
              <button
                key={precision}
                type="button"
                aria-pressed={pressed}
                disabled={pressed && selectedPrecisions.length === 1}
                onClick={() => {
                  const next = pressed
                    ? selectedPrecisions.filter((p) => p !== precision)
                    : [...selectedPrecisions, precision];
                  setSelectedPrecisions(next);
                  track('inference_precision_selected', { precision: next.join(',') });
                }}
                className={cn(
                  'inline-flex min-h-11 items-center rounded-[max(0px,calc(var(--radius)-var(--segmented-inset)))] px-2 py-1 text-sm font-medium transition-colors md:min-h-6 md:py-0.5',
                  pressed
                    ? 'bg-muted text-foreground'
                    : 'text-muted-foreground hover:text-foreground',
                  pressed && selectedPrecisions.length === 1 && 'cursor-default',
                )}
              >
                {getPrecisionLabel(precision as Precision)}
              </button>
            );
          })}
        </div>
      )}

      <div className="ml-auto min-w-0">
        <WorkflowInfoDisplay compact />
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="mt-2 flex min-w-0 flex-col items-start gap-1">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}

/**
 * The PowerX toggles that live in the legend rail: Count, Per and Show as per
 * view. Rendered between the series list and the chart switches.
 */
export function PowerXLegendControls({
  selection,
  onSelectionChange,
}: {
  selection: PowerXSelection;
  onSelectionChange: (next: PowerXSelection) => void;
}) {
  const locale = useLocale();
  const t = STRINGS[locale];
  const view = powerXViewFor(selection.metric, selection.compare);
  if (view !== 'energy' && view !== 'draw') return null;
  const energyPer = energyPerFor(selection.metric);
  const count = powerXCountFor(selection.metric, selection.compare);
  const boundary = count === 'both' ? 'gpu' : count;
  return (
    <div className="no-export" data-testid="powerx-legend-controls">
      <Field label={t.count}>
        <SegmentedToggle<PowerXCount>
          value={view === 'energy' ? count : boundary}
          ariaLabel={t.count}
          role="group"
          testId="powerx-boundary"
          onValueChange={(next) => {
            track('inference_powerx_boundary_selected', { boundary: next });
            onSelectionChange(selectPowerXCount(next, selection));
          }}
          options={[
            { value: 'gpu', label: POWER_COUNT_LABELS['gpu-measured'][locale] },
            {
              value: 'it',
              label: POWER_COUNT_LABELS['it-modeled'][locale],
              title: view === 'energy' && energyPer !== 'output' ? t.systemOutputOnly : t.itHelp,
              disabled: view === 'energy' && energyPer !== 'output',
            },
            {
              value: 'system',
              label: POWER_COUNT_LABELS['utility-modeled'][locale],
              title:
                view === 'energy' && energyPer !== 'output' ? t.systemOutputOnly : t.systemHelp,
              disabled: view === 'energy' && energyPer !== 'output',
            },
            ...(view === 'energy'
              ? [
                  {
                    value: 'both' as const,
                    label: t.both,
                    title: energyPer === 'output' ? t.bothHelp : t.systemOutputOnly,
                    disabled: energyPer !== 'output',
                  },
                ]
              : []),
          ]}
        />
      </Field>
      {view === 'energy' && (
        <Field label={t.per}>
          <SegmentedToggle<EnergyPer>
            value={energyPer}
            ariaLabel={t.per}
            role="group"
            testId="powerx-energy-per"
            buttonClassName="whitespace-nowrap"
            onValueChange={(next) => {
              track('inference_powerx_energy_per_selected', { per: next });
              onSelectionChange(selectPowerXPer(next, selection));
            }}
            options={(['output', 'input', 'total', 'query'] as const).map((value) => ({
              value,
              label: t.perOptions[value],
            }))}
          />
        </Field>
      )}
      {view === 'draw' && (
        <Field label={t.showAs}>
          <SegmentedToggle<PowerXShowAs>
            value={powerXShowAsFor(selection.metric)}
            ariaLabel={t.showAs}
            role="group"
            testId="powerx-unit"
            onValueChange={(next) =>
              onSelectionChange({ metric: selectPowerXShowAs(next), compare: 'none' })
            }
            options={[
              { value: 'watts', label: t.watts },
              // % TDP is a GPU-only reading; TDP does not bound IT or facility power.
              {
                value: 'tdp',
                label: t.tdp,
                disabled: boundary !== 'gpu',
                title: boundary === 'gpu' ? undefined : t.tdpSystemHelp,
              },
            ]}
          />
        </Field>
      )}
    </div>
  );
}

/** Split by (Boundary | Prefill vs decode) with the reason when roles are unavailable. */
export function PowerXSplitBy({
  selection,
  onSelectionChange,
  rolesHaveData,
}: {
  selection: PowerXSelection;
  onSelectionChange: (next: PowerXSelection) => void;
  /** False when the loaded results carry no prefill/decode telemetry; undefined while unknown. */
  rolesHaveData?: boolean;
}) {
  const t = usePowerXStrings();
  const rolesSupported = powerCompareAvailable(VIEW_METRICS.where.gpu, 'roles');
  const rolesAvailable = rolesSupported && rolesHaveData !== false;
  const rolesReason = rolesSupported ? t.rolesNoData : t.rolesUnavailable;
  return (
    <Field label={t.splitBy}>
      <SegmentedToggle<'boundaries' | 'roles'>
        value={selection.compare === 'roles' ? 'roles' : 'boundaries'}
        ariaLabel={t.splitBy}
        role="group"
        testId="powerx-split"
        onValueChange={(value) =>
          onSelectionChange({ metric: VIEW_METRICS.where.gpu, compare: value })
        }
        options={[
          { value: 'boundaries', label: t.boundaries },
          {
            value: 'roles',
            label: t.roles,
            disabled: !rolesAvailable,
            title: rolesAvailable ? undefined : rolesReason,
          },
        ]}
      />
      {!rolesAvailable && (
        <span className="text-xs text-muted-foreground" data-testid="powerx-roles-unavailable">
          {t.roles}: {rolesReason}
        </span>
      )}
    </Field>
  );
}

/**
 * "More views" at the bottom of the legend rail: everything the first prototype
 * showed as separate tabs or an Advanced drawer, one expander away.
 */
export function PowerXMoreViews({
  selection,
  onSelectionChange,
  rolesHaveData,
}: {
  selection: PowerXSelection;
  onSelectionChange: (next: PowerXSelection) => void;
  rolesHaveData?: boolean;
}) {
  const t = usePowerXStrings();
  const [open, setOpen] = useState(false);
  const bodyId = useId();
  const view = powerXViewFor(selection.metric, selection.compare);
  const fields = powerXMetricFields(selection.metric, selection.compare);
  const compareAllAvailable = powerCompareAvailable(selection.metric, 'all');
  const compareMode: 'none' | 'all' =
    selection.compare === 'all' || selection.compare === 'boundaries' ? 'all' : 'none';
  return (
    <div className="no-export mt-3 border-t border-border/60 pt-2" data-testid="powerx-more-views">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={bodyId}
        data-testid="powerx-more-views-toggle"
        onClick={() => {
          setOpen((current) => !current);
          track('inference_powerx_more_views_toggled', { expanded: !open });
        }}
        className="flex min-h-11 w-full flex-col items-start justify-center gap-0.5 rounded-md text-left hover:bg-muted/40 md:min-h-8"
      >
        <span className="flex items-center gap-1 text-xs font-medium text-foreground">
          {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          {t.moreViews}
        </span>
        <span className="pl-[18px] text-2xs leading-tight text-muted-foreground">
          {t.moreViewsHint}
        </span>
      </button>
      {open && (
        <div id={bodyId} className="ml-1 border-l border-border pl-3">
          {fields.length > 0 && (
            <MeasuredMetricControls
              metric={selection.metric}
              onChange={(metric) => onSelectionChange({ metric, compare: selection.compare })}
              fields={fields}
              className="mt-2 grid-cols-1 gap-2"
            />
          )}
          <Field label={t.compareBoundaries}>
            <SegmentedToggle<'none' | 'all'>
              value={compareMode}
              ariaLabel={t.compareBoundaries}
              role="group"
              testId="powerx-compare-boundaries"
              onValueChange={(mode) => {
                track('inference_power_compare_changed', { mode, family: 'powerx' });
                onSelectionChange({
                  metric:
                    mode === 'all' && view === 'energy'
                      ? ENERGY_PER_METRIC.output
                      : selection.metric,
                  compare: mode,
                });
              }}
              options={[
                { value: 'none', label: t.compareOff },
                {
                  value: 'all',
                  label: t.compareAll,
                  disabled: !compareAllAvailable,
                  title: compareAllAvailable ? t.compareAllHelp : t.compareUnavailable,
                },
              ]}
            />
          </Field>
          <PowerXSplitBy
            selection={selection}
            onSelectionChange={onSelectionChange}
            rolesHaveData={rolesHaveData}
          />
          {view !== 'time' && (
            <button
              type="button"
              data-testid="powerx-open-timeline"
              onClick={() => {
                track('inference_powerx_tab_selected', { tab: 'time', source: 'more_views' });
                onSelectionChange(selectPowerXView('time', selection));
              }}
              className="mt-3 min-h-11 rounded-md border border-border/60 px-3 text-xs font-medium text-foreground hover:bg-muted md:min-h-8"
            >
              {t.openTimeline} →
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/** The boundary line chart under the Where view, collapsed by default. */
export function PowerXCurveSection({
  children,
  defaultOpen = false,
}: {
  children: ReactNode;
  defaultOpen?: boolean;
}) {
  const t = usePowerXStrings();
  const [open, setOpen] = useState(defaultOpen);
  const bodyId = useId();
  return (
    <section className="mt-2" data-testid="powerx-curve">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={bodyId}
        data-testid="powerx-curve-toggle"
        onClick={() => {
          setOpen((current) => !current);
          track('inference_powerx_curve_toggled', { expanded: !open });
        }}
        className="flex min-h-11 w-full items-center gap-2 rounded-md text-left hover:bg-muted/40 md:min-h-8"
      >
        {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        <span className="text-sm font-semibold">{t.curve}</span>
        <span className="min-w-0 truncate text-xs text-muted-foreground">{t.curveHint}</span>
      </button>
      {open && (
        <div id={bodyId} className="mt-2">
          {children}
        </div>
      )}
    </section>
  );
}

/** One muted provenance line; it is the summary of the "How we measure" details. */
export function PowerXProvenance({
  provenance,
  summary,
  children,
}: {
  provenance: PowerXProvenanceInput;
  /** The one-sentence method line that heads the details body. */
  summary: string;
  children: ReactNode;
}) {
  const locale = useLocale();
  const t = STRINGS[locale];
  return (
    <details className="mt-3 text-xs text-muted-foreground" data-testid="powerx-method">
      <summary className="min-h-11 cursor-pointer select-none leading-snug md:min-h-0">
        <span data-testid="powerx-provenance">{powerXProvenanceText(provenance, locale)}</span>{' '}
        <span className="underline underline-offset-2">{t.howWeMeasure}</span>
      </summary>
      <p className="mt-1">
        {summary} {children}
      </p>
      <p className="mt-2">{t.basisKey}</p>
      <dl
        className="mt-1 grid grid-cols-[auto_minmax(0,1fr)] gap-x-2 gap-y-1"
        data-testid="powerx-basis-key"
      >
        {POWER_BASIS_TAGS.map((tag) => (
          <div key={tag} className="contents">
            <dt>
              <PowerBasisPill tag={tag} className="ml-0" />
            </dt>
            <dd>{POWER_BASIS_TAG_TITLES[tag][locale]}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-2" data-testid="powerx-utilization-note">
        {t.utilization}
      </p>
    </details>
  );
}

/** The one-line "What is PowerX?" disclosure under the page description. */
export function PowerXWhatIs() {
  const t = usePowerXStrings();
  return (
    <details className="-mt-2 text-xs text-muted-foreground" data-testid="powerx-what-is">
      <summary className="inline-flex min-h-11 cursor-pointer items-center gap-1 select-none md:min-h-0">
        <ChevronRight size={12} className="shrink-0 [details[open]_&]:rotate-90" aria-hidden />
        <span className="underline underline-offset-2">{t.whatIs}</span>
      </summary>
      <p className="mt-1 max-w-prose">{t.whatIsBody}</p>
    </details>
  );
}

const rate = (value: number) =>
  value >= 100 ? Math.round(value).toLocaleString('en-US') : value.toFixed(1);
const watts = (value: number) => Math.round(value).toLocaleString('en-US');
/** Where the readout lands before anyone hovers: a mid-range interactivity. */
export const READOUT_INTERACTIVITY = 80;

/** The chart point the readout describes when nothing is hovered or pinned. */
export function defaultReadoutPoint(points: readonly InferenceData[]): InferenceData | null {
  const candidates = points.filter((point) => !point.powerVariant);
  const modeled = candidates.filter(
    (point) => point.itModeledWatts !== undefined || modeledItWattsPerGpu(point) !== null,
  );
  const pool = modeled.length > 0 ? modeled : candidates;
  let best: InferenceData | null = null;
  let distance = Infinity;
  for (const point of pool) {
    if (!(point.x > 0)) continue;
    const d = Math.abs(Math.log(point.x / READOUT_INTERACTIVITY));
    if (d < distance) {
      distance = d;
      best = point;
    }
  }
  return best;
}

/**
 * The readout row under the caption: IT W per GPU, GPUs per MW and the facility
 * figure for the hovered or pinned point (or the point nearest 80 tok/s/user).
 */
export function PowerXReadout({ points }: { points: readonly InferenceData[] }) {
  const locale = useLocale();
  const t = STRINGS[locale].readout;
  const active = usePowerXActivePoint();
  const point = active?.point ?? defaultReadoutPoint(points);
  if (!point) return null;
  const it = point.itModeledWatts?.y ?? modeledItWattsPerGpu(point);
  const facility = point.utilityModeledWatts?.y ?? modeledFacilityWattsPerGpu(point);
  const pue =
    point.modeledSystemPower?.status === 'supported' ? point.modeledSystemPower.pue : null;
  const gpu = point.measuredAvgPower?.y ?? null;
  const perMw = gpusPerMegawatt(it);
  const source =
    active?.source === 'pinned'
      ? t.pinned
      : active?.source === 'hover'
        ? t.hovered
        : t.nearest(String(READOUT_INTERACTIVITY));
  const label = getDisplayLabel(getHardwareConfig(point.hwKey, point.model));
  return (
    <div
      className="flex min-w-0 flex-wrap items-baseline gap-x-4 gap-y-1 rounded-md border border-border/60 px-3 py-1.5 text-xs text-muted-foreground"
      data-testid="powerx-readout"
      aria-live="polite"
    >
      <span className="min-w-0 truncate font-medium text-foreground">
        {label}{' '}
        <span className="font-normal text-muted-foreground">{t.at(point.conc, rate(point.x))}</span>
      </span>
      {it === null ? (
        <span data-testid="powerx-readout-no-model">{t.noModel}</span>
      ) : (
        <>
          <span className="whitespace-nowrap" data-testid="powerx-readout-it">
            {t.it} <b className="text-foreground tabular-nums">{watts(it)}</b> {t.wPerGpu}
            <PowerBasisPill tag="it" />
          </span>
          {perMw !== null && (
            <span className="whitespace-nowrap" data-testid="powerx-readout-gpus-per-mw">
              <b className="text-foreground tabular-nums">{watts(perMw)}</b> {t.gpusPerMw}
              <PowerBasisPill tag="it" />
            </span>
          )}
          {facility !== null && pue !== null && (
            <span className="whitespace-nowrap" data-testid="powerx-readout-facility">
              {t.facility} <b className="text-foreground tabular-nums">{watts(facility)}</b>{' '}
              {t.atPue(String(pue))}
              <PowerBasisPill tag="facility" />
            </span>
          )}
        </>
      )}
      {gpu !== null && (
        <span className="whitespace-nowrap" data-testid="powerx-readout-gpu">
          {t.gpu} <b className="text-foreground tabular-nums">{watts(gpu)}</b> {t.measured}
          <PowerBasisPill tag="gpu" />
        </span>
      )}
      <span className="ml-auto text-2xs" data-testid="powerx-readout-source">
        {source}
      </span>
    </div>
  );
}

/** The Where view's Include facility switch; the stack is IT-only until it is on. */
export function PowerXFacilitySwitch({ pue }: { pue: number | null }) {
  const locale = useLocale();
  const t = STRINGS[locale];
  const includeFacility = usePowerXIncludeFacility();
  const setIncludeFacility = useSetPowerXIncludeFacility();
  const id = useId();
  if (!setIncludeFacility) return null;
  return (
    <div className="mt-2 flex min-w-0 flex-col gap-1" data-testid="powerx-facility-switch">
      <label htmlFor={id} className="flex min-h-11 items-center gap-2 text-xs md:min-h-8">
        <Switch
          id={id}
          checked={includeFacility}
          onCheckedChange={(checked) => {
            setIncludeFacility(checked);
            track('inference_powerx_facility_toggled', { enabled: checked });
          }}
          title={t.includeFacilityHelp}
        />
        <span className="font-medium text-foreground">
          {t.includeFacility(pue === null ? '—' : String(pue))}
        </span>
      </label>
      <span className="text-xs text-muted-foreground" data-testid="powerx-not-modeled-note">
        {IT_NOT_MODELED_NOTE[locale]}
      </span>
    </div>
  );
}

/**
 * The PowerX page frame: header, the view tabs, the caption row, then the chart
 * and whatever follows it. Nothing sits between the header and the plot except
 * the caption row; the toggles live in the legend rail.
 */
export function PowerXFrame({
  selection,
  onSelectionChange,
  viewMode,
  onViewModeChange,
  toolbar,
  children,
}: {
  selection: PowerXSelection;
  onSelectionChange: (next: PowerXSelection) => void;
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  toolbar?: ReactNode;
  children: ReactNode;
}) {
  const t = usePowerXStrings();
  return (
    <Card data-testid="powerx-frame" data-coach-mark-root="">
      <div className="flex min-w-0 flex-col gap-3">
        <DashboardSectionHeader
          title={t.title}
          description={t.description}
          actions={<ShareButton />}
        />
        <PowerXWhatIs />
        <PowerXViewTabs
          selection={selection}
          onSelectionChange={onSelectionChange}
          viewMode={viewMode}
          onViewModeChange={onViewModeChange}
          toolbar={toolbar}
        />
        <PowerXCaptionRow />
        {children}
      </div>
    </Card>
  );
}
