'use client';

import { ChevronDown, ChevronRight } from 'lucide-react';
import { type ReactNode, useId, useState } from 'react';

import { MeasuredMetricControls } from '@/components/inference/ui/MeasuredMetricControls';
import { powerCompareAvailable } from '@/components/inference/utils/power-compare';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { SegmentedToggle } from '@/components/ui/segmented-toggle';
import { track } from '@/lib/analytics/analytics';
import { useLocale } from '@/lib/i18n/use-locale';
import {
  gpusPerMegawatt,
  IT_NOT_MODELED_NOTE,
  modeledFacilityWattsPerGpu,
  modeledItWattsPerGpu,
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
    itHelp: 'GPU measured; CPU, server parts, fans/PSU and network share modeled. No PUE.',
    systemHelp: 'IT × PUE: GPU measured, rest of server and the facility overhead modeled',
    both: 'All',
    bothHelp: 'GPU only, IT and facility on one chart',
    systemOutputOnly: 'IT and facility are modeled per output token only',
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
      nearest: (x: string) => `Near ${x} tok/s/user · hover a point to change`,
      at: (conc: number, x: string) => `c${conc} · ${x} tok/s/user`,
    },
    includeFacility: (pue: string) => `Include facility (PUE ${pue})`,
    includeFacilityHelp: 'Appends the PUE overhead after the IT stack; off by default on PowerX.',
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
    method:
      'Each point is one benchmark configuration. GPU power is measured every second and averaged over the validated serving window; other components are modeled.',
    agentxMethod: 'AgentX estimates are not calibrated against measured system power.',
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
    count: '统计范围',
    itHelp: 'GPU 为实测；CPU、服务器部件、风扇/电源与网络分摊为模型估算。不含 PUE。',
    systemHelp: 'IT × PUE：GPU 为实测，服务器其他组件与数据中心开销为模型估算',
    both: '全部',
    bothHelp: '在同一图中对比仅 GPU、IT 与数据中心',
    systemOutputOnly: 'IT 与数据中心仅按输出 Token 建模',
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
      nearest: (x: string) => `接近 ${x} tok/s/user · 悬停数据点可切换`,
      at: (conc: number, x: string) => `c${conc} · ${x} tok/s/user`,
    },
    includeFacility: (pue: string) => `计入数据中心开销（PUE ${pue}）`,
    includeFacilityHelp: '在 IT 堆叠之后追加 PUE 开销；PowerX 默认关闭。',
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
    method:
      '每个数据点代表一个基准测试配置。GPU 功耗每秒实测一次，并在通过验证的服务窗口内取平均；其他组件为模型估算。',
    agentxMethod: 'AgentX 估算值尚未用实测的系统功耗校准。',
  },
} as const;

export function usePowerXStrings() {
  return STRINGS[useLocale()];
}

/** The four views as a tab strip under the section header, where /inference has no equivalent. */
export function PowerXViewTabs({
  selection,
  onSelectionChange,
}: {
  selection: PowerXSelection;
  onSelectionChange: (next: PowerXSelection) => void;
}) {
  const t = usePowerXStrings();
  const view = powerXViewFor(selection.metric, selection.compare);
  return (
    <div
      role="tablist"
      aria-label={t.viewsLabel}
      data-testid="powerx-tabs"
      className="-mt-1 flex min-w-0 max-w-full gap-1 overflow-x-auto border-b border-border/60"
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
              '-mb-px inline-flex min-h-11 shrink-0 items-center gap-1.5 border-b-2 border-transparent px-3 text-sm font-semibold whitespace-nowrap text-muted-foreground transition-colors hover:border-muted-foreground/30 md:min-h-9',
              selected && 'border-secondary text-secondary dark:border-primary dark:text-primary',
            )}
          >
            {t.views[value]}
          </button>
        );
      })}
    </div>
  );
}

/** One labelled control, the same label style as the Chart Config selects. */
function Field({
  label,
  children,
  className,
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex min-w-0 flex-col space-y-1.5', className)}>
      <Label>{label}</Label>
      {children}
    </div>
  );
}

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
  const view = powerXViewFor(selection.metric, selection.compare);
  if (view !== 'energy' && view !== 'draw') return null;
  const energyPer = energyPerFor(selection.metric);
  const count = powerXCountFor(selection.metric, selection.compare);
  const boundary = count === 'both' ? 'gpu' : count;
  return (
    <>
      <Field label={t.count}>
        <SegmentedToggle<PowerXCount>
          value={view === 'energy' ? count : boundary}
          ariaLabel={t.count}
          role="group"
          testId="powerx-boundary"
          size="default"
          buttonClassName="whitespace-nowrap"
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
            size="default"
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
            size="default"
            buttonClassName="whitespace-nowrap"
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
    </>
  );
}

/**
 * The PowerX part of the Chart Config fieldset: Count, Per or Show as beside the
 * X-axis pick, then the collapsed More views row underneath.
 */
export function PowerXChartConfig({
  selection,
  onSelectionChange,
  rolesHaveData,
}: {
  selection: PowerXSelection;
  onSelectionChange: (next: PowerXSelection) => void;
  rolesHaveData?: boolean;
}) {
  return (
    <>
      <div
        className="flex min-w-0 flex-wrap items-start gap-x-4 gap-y-3"
        data-testid="powerx-chart-config"
      >
        <PowerXCountControls selection={selection} onSelectionChange={onSelectionChange} />
      </div>
      <PowerXMoreViews
        selection={selection}
        onSelectionChange={onSelectionChange}
        rolesHaveData={rolesHaveData}
        className="sm:col-span-2"
      />
    </>
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
        size="default"
        buttonClassName="whitespace-nowrap"
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
 * "More views" under the Chart Config controls: everything the first prototype
 * showed as separate tabs or an Advanced drawer, one expander away.
 */
export function PowerXMoreViews({
  selection,
  onSelectionChange,
  rolesHaveData,
  className,
}: {
  selection: PowerXSelection;
  onSelectionChange: (next: PowerXSelection) => void;
  rolesHaveData?: boolean;
  className?: string;
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
    <div className={cn('no-export min-w-0', className)} data-testid="powerx-more-views">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={bodyId}
        data-testid="powerx-more-views-toggle"
        onClick={() => {
          setOpen((current) => !current);
          track('inference_powerx_more_views_toggled', { expanded: !open });
        }}
        className="flex min-h-11 w-full items-center gap-2 rounded-md text-left hover:bg-muted/40 md:min-h-8"
      >
        <span className="flex shrink-0 items-center gap-1 text-sm font-medium whitespace-nowrap text-foreground">
          {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          {t.moreViews}
        </span>
        <span className="min-w-0 truncate text-xs text-muted-foreground">{t.moreViewsHint}</span>
      </button>
      {open && (
        <div
          id={bodyId}
          className="mt-1 grid min-w-0 grid-cols-[repeat(auto-fit,minmax(min(100%,12rem),1fr))] gap-3 border-l border-border pl-3"
        >
          {fields.length > 0 && (
            <MeasuredMetricControls
              metric={selection.metric}
              onChange={(metric) => onSelectionChange({ metric, compare: selection.compare })}
              fields={fields}
              className="contents"
            />
          )}
          <Field label={t.compareBoundaries}>
            <SegmentedToggle<'none' | 'all'>
              value={compareMode}
              ariaLabel={t.compareBoundaries}
              role="group"
              testId="powerx-compare-boundaries"
              size="default"
              buttonClassName="whitespace-nowrap"
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
              className="min-h-11 self-end justify-self-start rounded-md border border-border/60 px-3 text-xs font-medium text-foreground hover:bg-muted md:min-h-9"
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

/**
 * The provenance strip in the chart footer: the one summary line, and the
 * three-sentence method behind "How we measure".
 */
export function PowerXProvenance({
  provenance,
  agentic = false,
}: {
  provenance: PowerXProvenanceInput;
  /** AgentX scenario: adds the calibration caveat. */
  agentic?: boolean;
}) {
  const locale = useLocale();
  const t = STRINGS[locale];
  return (
    <details className="text-xs text-muted-foreground" data-testid="powerx-method">
      <summary className="min-h-11 cursor-pointer select-none leading-snug md:min-h-0">
        <span data-testid="powerx-provenance">{powerXProvenanceText(provenance, locale)}</span>{' '}
        <span className="underline underline-offset-2">{t.howWeMeasure}</span>
      </summary>
      <p className="mt-1 max-w-prose">
        {t.method}
        {agentic && ` ${t.agentxMethod}`}
      </p>
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

function ReadoutBadge({ children, testId }: { children: ReactNode; testId: string }) {
  return (
    <Badge variant="outline" data-testid={testId} className="gap-1 py-0 text-muted-foreground">
      {children}
    </Badge>
  );
}

/**
 * The readout row under the chart caption, in the TCO badge row's style: IT W
 * per GPU, GPUs per MW and the facility figure for the hovered or pinned point
 * (or the point nearest 80 tok/s/user).
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
    <p
      className="mb-2 flex min-w-0 flex-wrap items-center gap-2 text-xs text-muted-foreground"
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
      <span className="text-xs text-muted-foreground" data-testid="powerx-not-modeled-note">
        {IT_NOT_MODELED_NOTE[locale]}
      </span>
    </div>
  );
}
