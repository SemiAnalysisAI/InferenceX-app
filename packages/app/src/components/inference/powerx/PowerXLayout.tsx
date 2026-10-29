'use client';

import { ChevronDown } from 'lucide-react';
import { type ReactNode, useId, useState } from 'react';

import { MeasuredMetricControls } from '@/components/inference/ui/MeasuredMetricControls';
import { powerCompareAvailable } from '@/components/inference/utils/power-compare';
import { Badge } from '@/components/ui/badge';
import { LabelWithTooltip } from '@/components/ui/label-with-tooltip';
import { SegmentedToggle } from '@/components/ui/segmented-toggle';
import { useIsCoarsePointer, useIsMobileViewport } from '@/hooks/useMediaQuery';
import { useInferenceAnalyticsContext } from '@/components/inference/InferenceContext';
import { track } from '@/lib/analytics/analytics';
import { useLocale } from '@/lib/i18n/use-locale';
import {
  gpusPerMegawatt,
  modeledFacilityWattsPerGpu,
  modeledItWattsPerGpu,
  POWER_COUNT_LABELS,
} from '@/lib/power/power-basis';
import { FACILITY_PUE_NOTE } from '@/lib/power/system-power-model';
import { getHardwareConfig } from '@/lib/catalog/constants';
import { Switch } from '@/components/ui/switch';
import type { InferenceData } from '@/components/inference/types';
import {
  usePowerXActivePoint,
  usePowerXIncludeFacility,
  useSetPowerXIncludeFacility,
} from '@/components/inference/ui/powerx-surface';

import { PowerBasisPill } from './PowerBasisPill';
import { cn, getDisplayLabel } from '@/lib/shared/utils';

import {
  energyPerFor,
  energyPerHasBoundaries,
  POWERX_VIEWS,
  powerXCountFor,
  powerXMetricFields,
  powerXRatedAvailable,
  powerXRatedOn,
  powerXSecondaryChangedCount,
  powerXShowAsFor,
  powerXViewFor,
  selectPowerXCount,
  selectPowerXPer,
  selectPowerXRated,
  selectPowerXShowAs,
  selectPowerXView,
  VIEW_METRICS,
  WHERE_COMPARE,
  type EnergyPer,
  type PowerXCount,
  type PowerXSelection,
  type PowerXShowAs,
  type PowerXView,
} from './powerx-views';

const STRINGS = {
  en: {
    title: 'PowerX',
    description:
      'Measured GPU power and energy per token for every benchmark point, with a modeled IT and facility breakdown.',
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
    count: 'Count',
    countHelp:
      'GPU only is measured board power. IT adds the modeled CPU, server parts, fans/PSU and network share, with no PUE. Facility is IT × PUE. All draws the three boundaries per chip on one chart.',
    itHelp: 'GPU measured; CPU, server parts, fans/PSU and network share modeled. No PUE.',
    systemHelp: 'IT × PUE: GPU measured, rest of server and the facility overhead modeled',
    both: 'All',
    bothHelp: 'GPU only (solid), IT (dashed) and Facility (dash-dot) per chip on one chart',
    systemTokensOnly: 'IT and facility are available for All tokens and Output only',
    readout: {
      it: 'IT',
      wPerGpu: 'W/GPU',
      gpusPerMw: 'GPUs/MW',
      facility: 'Facility',
      atPue: (pue: string) => `W/GPU at PUE ${pue}`,
      gpu: 'GPU',
      measured: 'W',
      noModel: 'No IT model for this setup yet',
      pinned: 'Pinned point',
      hovered: 'Hovered point',
      scrubbed: 'Point under your finger · tap it for details',
      nearest: (x: string) => `Near ${x} tok/s/user · hover a point to change`,
      nearestTouch: (x: string) => `Near ${x} tok/s/user · drag across the chart to change`,
      at: (conc: number, x: string) => `c${conc} · ${x} tok/s/user`,
    },
    includeFacility: (pue: string) => `Include facility (PUE ${pue})`,
    includeFacilityHelp: 'Appends the PUE overhead after the IT stack; off by default on PowerX.',
    per: 'Per',
    perHelp:
      'What one unit of energy is charged to: every token including the prompt (the default), an output token, an input token, or one successful query in watt-hours. Aggregated serving runs prefill and decode on the same GPUs, so per output token also bills the prompt to the output.',
    perOptions: {
      total: 'All tokens',
      output: 'Output',
      input: 'Input',
      query: 'Query',
    } satisfies Record<EnergyPer, string>,
    showAs: 'Show as',
    showAsHelp:
      'Watts per chip, or the average as a percentage of the rated GPU TDP. Percent of TDP is a GPU-only reading.',
    watts: 'W per chip',
    tdp: '% of TDP',
    tdpSystemHelp: 'TDP bounds GPU power only',
    compareBoundaries: 'Rated boundaries',
    compareOff: 'Off',
    compareAll: 'All-in provisioned',
    compareAllHelp:
      'Draws two lines per chip: measured GPU power (solid) and the all-in provisioned bound (dashed), nothing else.',
    splitBy: 'Split by',
    splitByHelp:
      'Stack the GPU, IT and facility boundaries, or split measured GPU power between prefill and decode GPUs on disaggregated deployments.',
    boundaries: 'Boundary',
    roles: 'Prefill vs decode',
    rolesUnavailable: 'Needs disaggregated prefill/decode results',
    rolesNoData: 'No validated prefill/decode telemetry for this model and scenario',
    more: 'More',
    moreChanged: (count: number) => `More · ${count} changed`,
  },
  zh: {
    title: 'PowerX 功耗',
    description:
      '每个基准测试点的实测 GPU 功耗与每 Token 能耗，并附模型估算的 IT 与数据中心功耗构成。',
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
    count: '统计口径',
    countHelp:
      '仅 GPU 为实测板卡功耗；IT 在此基础上加入模型估算的 CPU、服务器部件、风扇/电源与网络分摊，不含 PUE；数据中心为 IT × PUE；全部则在同一图中按芯片绘制三个边界。',
    itHelp: 'GPU 为实测；CPU、服务器部件、风扇/电源与网络分摊为模型估算。不含 PUE。',
    systemHelp: 'IT × PUE：GPU 为实测，服务器其他组件与数据中心开销为模型估算',
    both: '全部',
    bothHelp: '在同一图中按芯片对比仅 GPU（实线）、IT（虚线）与数据中心（点划线）',
    systemTokensOnly: 'IT 与数据中心能耗仅支持“全部 Token”和“输出”两种计量单位',
    readout: {
      it: 'IT',
      wPerGpu: 'W/GPU',
      gpusPerMw: 'GPU/MW',
      facility: '数据中心',
      atPue: (pue: string) => `W/GPU（PUE ${pue}）`,
      gpu: 'GPU',
      measured: 'W',
      noModel: '该配置暂无 IT 功耗模型',
      pinned: '已固定的数据点',
      hovered: '悬停的数据点',
      scrubbed: '手指所在的数据点 · 点按可查看详情',
      nearest: (x: string) => `接近 ${x} tok/s/user · 悬停数据点可切换`,
      nearestTouch: (x: string) => `接近 ${x} tok/s/user · 在图上拖动可切换`,
      at: (conc: number, x: string) => `c${conc} · ${x} tok/s/user`,
    },
    includeFacility: (pue: string) => `计入数据中心开销（PUE ${pue}）`,
    includeFacilityHelp: '在 IT 堆叠之后追加 PUE 开销；PowerX 默认关闭。',
    per: '计量单位',
    perHelp:
      '能耗的计量单位：含提示词的全部 Token（默认）、每输出 Token、每输入 Token，或每次成功查询（以 Wh 计）。聚合式部署中预填充与解码共用同一批 GPU，按输出 Token 计量会把提示词的能耗也算到输出上。',
    perOptions: {
      total: '全部 Token',
      output: '输出',
      input: '输入',
      query: '每次查询',
    } satisfies Record<EnergyPer, string>,
    showAs: '显示为',
    showAsHelp: '每芯片瓦数，或平均功耗占 GPU 额定 TDP 的百分比；TDP 占比仅针对 GPU。',
    watts: '每芯片 W',
    tdp: 'TDP 占比',
    tdpSystemHelp: 'TDP 仅限定 GPU 功耗',
    compareBoundaries: '额定边界',
    compareOff: '关闭',
    compareAll: '整体预配',
    compareAllHelp: '每芯片仅绘制两条线：GPU 实测功耗（实线）与整体预配功耗（虚线）。',
    splitBy: '拆分方式',
    splitByHelp:
      '按 GPU、IT 与数据中心边界堆叠，或在预填充/解码分离部署中将实测 GPU 功耗拆分为预填充与解码两部分。',
    boundaries: '功耗边界',
    roles: '预填充 vs 解码',
    rolesUnavailable: '需要预填充/解码分离部署的结果',
    rolesNoData: '该模型与场景暂无经过验证的预填充/解码遥测数据',
    more: '更多',
    moreChanged: (count: number) => `更多 · 已更改 ${count} 项`,
  },
} as const;

export function usePowerXStrings() {
  return STRINGS[useLocale()];
}

/**
 * The four views as a tab strip under the section header, where /inference has no
 * equivalent. Under md the strip is a 2×2 grid of 48 px buttons, so Over time is
 * on screen without a sideways scroll; from md up it is the underlined row.
 */
export function PowerXViewTabs({
  selection,
  onSelectionChange,
}: {
  selection: PowerXSelection;
  onSelectionChange: (next: PowerXSelection) => void;
}) {
  const t = usePowerXStrings();
  const analyticsContext = useInferenceAnalyticsContext();
  const view = powerXViewFor(selection.metric, selection.compare);
  return (
    <div
      role="tablist"
      aria-label={t.viewsLabel}
      data-testid="powerx-tabs"
      className="-mt-1 flex min-w-0 max-w-full gap-1 overflow-x-auto border-b border-border/60 max-md:grid max-md:grid-cols-2 max-md:gap-1.5 max-md:border-b-0 max-md:pb-1"
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
              track('inference_powerx_tab_selected', { ...analyticsContext, tab: value });
              onSelectionChange(selectPowerXView(value, selection));
            }}
            className={cn(
              '-mb-px inline-flex min-h-11 shrink-0 items-center gap-1.5 border-b-2 border-transparent px-3 text-sm font-semibold whitespace-nowrap text-muted-foreground transition-colors hover:border-muted-foreground/30 md:min-h-9',
              'max-md:mb-0 max-md:min-h-12 max-md:justify-center max-md:rounded-md max-md:border max-md:bg-muted/30 max-md:px-2',
              selected &&
                'border-secondary text-secondary max-md:bg-secondary/10 dark:border-primary dark:text-primary dark:max-md:bg-primary/10',
            )}
          >
            {t.views[value]}
          </button>
        );
      })}
    </div>
  );
}

/**
 * One Chart Config cell: the same wrapper, label and (i) help as the X-Axis
 * Metric select, so the PowerX controls sit in the /inference grid as peers.
 */
function Field({
  label,
  tooltip,
  children,
  className,
}: {
  label: string;
  tooltip: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex min-w-0 flex-col space-y-1.5', className)}>
      <LabelWithTooltip label={label} tooltip={tooltip} />
      {children}
    </div>
  );
}

/** A segmented toggle that fills its Chart Config cell with equal segments and wraps rather than overflows. */
const CELL_TOGGLE_CLASS = 'w-full';
const CELL_SEGMENT_CLASS = 'min-w-max flex-1 justify-center whitespace-nowrap';

/** Count, Per and Show as for the Energy and Power draw views. */
export function PowerXCountControls({
  selection,
  onSelectionChange,
}: {
  selection: PowerXSelection;
  onSelectionChange: (next: PowerXSelection) => void;
}) {
  const locale = useLocale();
  const t = STRINGS[locale];
  const analyticsContext = useInferenceAnalyticsContext();
  // Phones get one native select per group, with each segment's hint in its option.
  const variant = useIsMobileViewport() ? 'select' : 'segments';
  const view = powerXViewFor(selection.metric, selection.compare);
  if (view !== 'energy' && view !== 'draw') return null;
  const energyPer = energyPerFor(selection.metric);
  const count = powerXCountFor(selection.metric, selection.compare);
  // Input-token and per-query energy are GPU-only; W per chip has every boundary.
  const modeledDisabled = view === 'energy' && !energyPerHasBoundaries(energyPer);
  return (
    <>
      {/* Four segments: two cells wide from the sm grid up; one per row on phones. */}
      <Field label={t.count} tooltip={t.countHelp} className="sm:col-span-2">
        <SegmentedToggle<PowerXCount>
          value={count}
          ariaLabel={t.count}
          role="group"
          testId="powerx-boundary"
          size="default"
          variant={variant}
          className={CELL_TOGGLE_CLASS}
          buttonClassName={CELL_SEGMENT_CLASS}
          onValueChange={(next) => {
            track('inference_powerx_boundary_selected', { ...analyticsContext, boundary: next });
            onSelectionChange(selectPowerXCount(next, selection));
          }}
          options={[
            { value: 'gpu', label: POWER_COUNT_LABELS['gpu-measured'][locale] },
            {
              value: 'it',
              label: POWER_COUNT_LABELS['it-modeled'][locale],
              title: modeledDisabled ? t.systemTokensOnly : t.itHelp,
              disabled: modeledDisabled,
            },
            {
              value: 'system',
              label: POWER_COUNT_LABELS['utility-modeled'][locale],
              title: modeledDisabled ? t.systemTokensOnly : t.systemHelp,
              disabled: modeledDisabled,
            },
            {
              value: 'both',
              label: t.both,
              title: modeledDisabled ? t.systemTokensOnly : t.bothHelp,
              disabled: modeledDisabled,
            },
          ]}
        />
      </Field>
      {view === 'energy' && (
        <Field label={t.per} tooltip={t.perHelp}>
          <SegmentedToggle<EnergyPer>
            value={energyPer}
            ariaLabel={t.per}
            role="group"
            testId="powerx-energy-per"
            size="default"
            variant={variant}
            className={CELL_TOGGLE_CLASS}
            buttonClassName={CELL_SEGMENT_CLASS}
            onValueChange={(next) => {
              track('inference_powerx_energy_per_selected', { ...analyticsContext, per: next });
              onSelectionChange(selectPowerXPer(next, selection));
            }}
            options={(['total', 'output', 'input', 'query'] as const).map((value) => ({
              value,
              label: t.perOptions[value],
            }))}
          />
        </Field>
      )}
      {view === 'draw' && (
        <Field label={t.showAs} tooltip={t.showAsHelp}>
          <SegmentedToggle<PowerXShowAs>
            value={powerXShowAsFor(selection.metric)}
            ariaLabel={t.showAs}
            role="group"
            testId="powerx-unit"
            size="default"
            variant={variant}
            className={CELL_TOGGLE_CLASS}
            buttonClassName={CELL_SEGMENT_CLASS}
            onValueChange={(next) =>
              onSelectionChange({ metric: selectPowerXShowAs(next), compare: 'none' })
            }
            options={[
              { value: 'watts', label: t.watts },
              // % TDP is a GPU-only reading; TDP does not bound IT or facility power.
              {
                value: 'tdp',
                label: t.tdp,
                disabled: count !== 'gpu',
                title: count === 'gpu' ? undefined : t.tdpSystemHelp,
              },
            ]}
          />
        </Field>
      )}
    </>
  );
}

/** The X-Axis Metric cell ChartControls hands PowerX, with whether it is off its default. */
export interface PowerXChartConfigSlots {
  xAxisSelector: ReactNode;
  xAxisChanged: boolean;
}

/**
 * The PowerX part of the Chart Config fieldset. It renders as `contents`, so
 * every control is a cell of the same grid /inference lays its Chart Config
 * out in (X-Axis Metric first; see ChartControls): row one is X-Axis Metric
 * and Count, row two Per or Show as, then Scope, Power statistic and Rated
 * boundaries on the views they apply to, flowing left to right with no gaps.
 * Split by lives in the Where the power goes card.
 *
 * Under md, Count and Per (or Show as) stay in front and everything else (the
 * X-Axis Metric, Scope, Power statistic, Rated boundaries) sits behind one
 * 44 px "More" row that names how many of them are off their default.
 */
export function PowerXChartConfig({
  selection,
  onSelectionChange,
  slots,
}: {
  selection: PowerXSelection;
  onSelectionChange: (next: PowerXSelection) => void;
  slots?: PowerXChartConfigSlots;
}) {
  const t = usePowerXStrings();
  const analyticsContext = useInferenceAnalyticsContext();
  const phone = useIsMobileViewport();
  const [moreOpen, setMoreOpen] = useState(false);
  const moreId = useId();
  const fields = powerXMetricFields(selection.metric, selection.compare);
  const ratedAvailable = powerXRatedAvailable(selection.metric);
  // On: measured GPU power against the all-in provisioned bound, two lines per chip.
  const ratedMode: 'none' | 'provisioned' = powerXRatedOn(selection.compare)
    ? 'provisioned'
    : 'none';
  const measuredControls = fields.length > 0 && (
    <MeasuredMetricControls
      metric={selection.metric}
      onChange={(metric) => {
        track('inference_powerx_measured_metric_selected', {
          ...analyticsContext,
          metric,
          previous_metric: selection.metric,
        });
        onSelectionChange({ metric, compare: selection.compare });
      }}
      fields={fields}
      className="contents"
    />
  );
  const ratedControl = ratedAvailable && (
    <Field label={t.compareBoundaries} tooltip={t.compareAllHelp}>
      <SegmentedToggle<'none' | 'provisioned'>
        value={ratedMode}
        ariaLabel={t.compareBoundaries}
        role="group"
        testId="powerx-compare-boundaries"
        size="default"
        className={CELL_TOGGLE_CLASS}
        buttonClassName={CELL_SEGMENT_CLASS}
        onValueChange={(mode) => {
          track('inference_power_compare_changed', { mode, family: 'powerx' });
          onSelectionChange(selectPowerXRated(mode === 'provisioned', selection));
        }}
        options={[
          { value: 'none', label: t.compareOff },
          { value: 'provisioned', label: t.compareAll, title: t.compareAllHelp },
        ]}
      />
    </Field>
  );
  if (!phone) {
    return (
      <div className="contents" data-testid="powerx-chart-config">
        {slots?.xAxisSelector}
        <PowerXCountControls selection={selection} onSelectionChange={onSelectionChange} />
        {measuredControls}
        {ratedControl}
      </div>
    );
  }
  const secondary = Boolean(slots?.xAxisSelector) || fields.length > 0 || ratedAvailable;
  const changed = powerXSecondaryChangedCount(selection) + (slots?.xAxisChanged ? 1 : 0);
  return (
    <div className="contents" data-testid="powerx-chart-config">
      <PowerXCountControls selection={selection} onSelectionChange={onSelectionChange} />
      {secondary && (
        <button
          type="button"
          aria-expanded={moreOpen}
          aria-controls={moreId}
          data-testid="powerx-more"
          onClick={() => {
            setMoreOpen((open) => !open);
            track('powerx_more_toggled', { enabled: !moreOpen, changed });
          }}
          className="col-span-full flex min-h-11 w-full cursor-pointer items-center justify-between gap-3 rounded-md border border-border/70 bg-muted/10 px-3 text-left text-sm font-medium text-foreground"
        >
          <span>{changed > 0 ? t.moreChanged(changed) : t.more}</span>
          <ChevronDown
            aria-hidden="true"
            className={cn('size-4 shrink-0 transition-transform', moreOpen && 'rotate-180')}
          />
        </button>
      )}
      {secondary && moreOpen && (
        <div id={moreId} className="contents" data-testid="powerx-more-content">
          {slots?.xAxisSelector}
          {measuredControls}
          {ratedControl}
        </div>
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
    <Field label={t.splitBy} tooltip={t.splitByHelp}>
      <SegmentedToggle<'boundaries' | 'roles'>
        value={selection.compare === 'roles' ? 'roles' : 'boundaries'}
        ariaLabel={t.splitBy}
        role="group"
        testId="powerx-split"
        size="default"
        buttonClassName="whitespace-nowrap"
        onValueChange={(value) =>
          onSelectionChange({
            metric: VIEW_METRICS.where.gpu,
            compare: value === 'roles' ? 'roles' : WHERE_COMPARE,
          })
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

const rate = (value: number) =>
  value >= 100 ? Math.round(value).toLocaleString('en-US') : value.toFixed(1);
const watts = (value: number) => Math.round(value).toLocaleString('en-US');
/** Where the readout lands before anyone hovers: a mid-range interactivity. */
const READOUT_INTERACTIVITY = 80;

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

function ReadoutBadge({ children, testId }: { children: ReactNode; testId: string }) {
  return (
    <Badge variant="outline" data-testid={testId} className="gap-1 py-0 text-muted-foreground">
      {children}
    </Badge>
  );
}

/** The chart's y metric, so the touch readout can state the value a tooltip would. */
export interface PowerXReadoutMetric {
  label: string;
  value: (point: InferenceData) => string;
}

/**
 * The readout row under the chart caption, in the TCO badge row's style: IT W
 * per GPU, GPUs per MW and the facility figure for the hovered or pinned point
 * (or the point nearest 80 tok/s/user). On a coarse pointer the chart has no
 * hover tooltip: a finger dragged across it scrubs the nearest point into this
 * row, which then leads with the chart's own y value.
 */
export function PowerXReadout({
  points,
  yMetric,
}: {
  points: readonly InferenceData[];
  yMetric?: PowerXReadoutMetric;
}) {
  const locale = useLocale();
  const t = STRINGS[locale].readout;
  const active = usePowerXActivePoint();
  const touch = useIsCoarsePointer();
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
      : active?.source === 'scrub'
        ? t.scrubbed
        : active?.source === 'hover'
          ? t.hovered
          : touch
            ? t.nearestTouch(String(READOUT_INTERACTIVITY))
            : t.nearest(String(READOUT_INTERACTIVITY));
  const label = getDisplayLabel(getHardwareConfig(point.hwKey, point.model));
  return (
    <p
      className="mb-2 flex min-w-0 flex-wrap items-center gap-2 text-xs text-muted-foreground"
      data-testid="powerx-readout"
      data-source={active?.source ?? 'nearest'}
      aria-live="polite"
    >
      <span className="min-w-0 truncate font-medium text-foreground">
        {label}{' '}
        <span className="font-normal text-muted-foreground">{t.at(point.conc, rate(point.x))}</span>
      </span>
      {touch && yMetric && (
        <ReadoutBadge testId="powerx-readout-y">
          {yMetric.label}:{' '}
          <span className="font-medium text-foreground tabular-nums">{yMetric.value(point)}</span>
        </ReadoutBadge>
      )}
      {it === null ? (
        <span data-testid="powerx-readout-no-model">{t.noModel}</span>
      ) : (
        <>
          <ReadoutBadge testId="powerx-readout-it">
            {t.it}: <span className="font-medium text-foreground tabular-nums">{watts(it)}</span>{' '}
            {t.wPerGpu}
            <PowerBasisPill tag="it" className="ml-0" />
          </ReadoutBadge>
          {perMw !== null && (
            <ReadoutBadge testId="powerx-readout-gpus-per-mw">
              <span className="font-medium text-foreground tabular-nums">{watts(perMw)}</span>{' '}
              {t.gpusPerMw}
              <PowerBasisPill tag="it" className="ml-0" />
            </ReadoutBadge>
          )}
          {facility !== null && pue !== null && (
            <ReadoutBadge testId="powerx-readout-facility">
              {t.facility}:{' '}
              <span className="font-medium text-foreground tabular-nums">{watts(facility)}</span>{' '}
              {t.atPue(String(pue))}
              <PowerBasisPill tag="facility" className="ml-0" />
            </ReadoutBadge>
          )}
        </>
      )}
      {gpu !== null && (
        <ReadoutBadge testId="powerx-readout-gpu">
          {t.gpu}: <span className="font-medium text-foreground tabular-nums">{watts(gpu)}</span>{' '}
          {t.measured}
          <PowerBasisPill tag="gpu" className="ml-0" />
        </ReadoutBadge>
      )}
      <span className="text-2xs" data-testid="powerx-readout-source">
        {source}
      </span>
    </p>
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
    <div className="flex min-w-0 flex-col gap-1" data-testid="powerx-facility-switch">
      <label htmlFor={id} className="flex min-h-11 items-center gap-2 text-xs md:min-h-9">
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
      <span className="text-xs text-muted-foreground" data-testid="powerx-facility-note">
        {FACILITY_PUE_NOTE[locale]}
      </span>
    </div>
  );
}
