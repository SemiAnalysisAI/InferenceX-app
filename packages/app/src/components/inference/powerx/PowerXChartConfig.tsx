'use client';

import { ChevronDown, Lock } from 'lucide-react';
import { useState, type ReactNode } from 'react';

import { useInferenceAnalyticsContext } from '@/components/inference/InferenceContext';
import {
  changeMeasuredMetricConfig,
  getMeasuredMetricConfig,
} from '@/components/inference/measured-metric-config';
import type { PowerBreakdownView } from '@/components/inference/ui/PowerBreakdownPanel';
import {
  usePowerXCompareTarget,
  useSetPowerXCompareTarget,
} from '@/components/inference/ui/powerx-surface';
import { powerVariantDash } from '@/components/inference/utils/power-compare';
import { Button } from '@/components/ui/button';
import { LabelWithTooltip } from '@/components/ui/label-with-tooltip';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { RangeField } from '@/components/ui/range-field';
import { SegmentedToggle } from '@/components/ui/segmented-toggle';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useIsMobileViewport } from '@/hooks/useMediaQuery';
import { track } from '@/lib/analytics/analytics';
import { useLocale } from '@/lib/i18n/use-locale';
import { FACILITY_PUE_NOTE } from '@/lib/power/facility-pue';
import { cn } from '@/lib/shared/utils';

import {
  POWERX_COMPARE_AT_DEFAULT,
  POWERX_COMPARE_AT_MAX,
  POWERX_COMPARE_AT_MIN,
  POWERX_COMPARE_AT_PRESETS,
} from './powerx-compare-at';
import { PowerXFacilitySwitch } from './PowerXLayout';
import {
  POWERX_ROLES,
  powerXPinnedControls,
  powerXRoleEnergyPers,
  resolvePowerXRole,
  type PowerXPinnedControl,
  type PowerXRole,
} from './powerx-role';
import { POWERX_VOCAB } from './powerx-strings';
import {
  energyPerFor,
  energyPerHasBoundaries,
  POWERX_VIEW_ANALYTICS_ID,
  POWERX_VIEWS,
  powerXCountFor,
  powerXMetricFields,
  powerXRatedAvailable,
  powerXRatedOn,
  powerXShowAsFor,
  powerXViewFor,
  selectPowerXCount,
  selectPowerXPer,
  selectPowerXRated,
  selectPowerXShowAs,
  selectPowerXView,
  type EnergyPer,
  type PowerXCount,
  type PowerXSelection,
  type PowerXShowAs,
  type PowerXView,
} from './powerx-views';

type Statistic = 'average' | 'p75' | 'p90';

/** The default drill-down chart style on Breakdown (`i_pbview`). */
export const POWERX_BREAKDOWN_VIEW_DEFAULT: PowerBreakdownView = 'area';

// A space only after a Latin ending: 已按解码 GPU 固定, 已按预填充 vs 解码固定.
const zhSetBy = (by: string) => `已按${by}${/[A-Za-z0-9]$/u.test(by) ? ' ' : ''}固定`;

const STRINGS = {
  en: {
    views: 'PowerX views',
    tabs: POWERX_VOCAB.en.tabs,
    tabsShort: { energy: 'Energy', power: 'Power', breakdown: 'Breakdown', time: 'Over time' },
    tabHints: {
      energy: 'Joules per token or Wh per query vs interactivity',
      power: 'Watts per GPU vs interactivity',
      breakdown: 'GPU, server and facility at Compare at',
      time: 'Power trace through a run',
    } satisfies Record<PowerXView, string>,
    role: POWERX_VOCAB.en.role,
    roleHelp:
      'Which GPUs of a disaggregated deployment the charts read: all of them, only the prefill pool, only the decode pool, or both pools side by side. Aggregated runs cannot split: every GPU does both.',
    roles: POWERX_VOCAB.en.roles,
    roleHints: {
      all: 'Every GPU in the deployment',
      prefill: 'GPUs that process prompts',
      decode: 'GPUs that generate tokens',
      split: 'Both pools, side by side',
    } satisfies Record<PowerXRole, string>,
    boundary: POWERX_VOCAB.en.boundary,
    boundaryHelp:
      'GPU is measured board power. IT adds the modeled CPU, server parts, fans/PSU and network share, with no PUE. Facility is IT × PUE. All draws the three boundaries per GPU on one chart.',
    boundaries: POWERX_VOCAB.en.boundaries,
    boundaryHints: {
      gpu: 'Measured GPU board power',
      it: 'GPU measured; CPU, server parts, fans/PSU and network share modeled. No PUE.',
      system: 'IT × PUE: GPU measured, rest of server and the facility overhead modeled',
      both: 'GPU (solid), IT (dashed) and Facility (dash-dot) per GPU on one chart',
    } satisfies Record<PowerXCount, string>,
    systemTokensOnly: 'IT and Facility are available for All tokens and Output only',
    energyPer: POWERX_VOCAB.en.energyPer,
    energyPerHelp:
      'What one unit of energy is charged to: every token including the prompt (the default), an output token, an input token, or one successful query in watt-hours.',
    pers: POWERX_VOCAB.en.pers,
    showAs: 'Show as',
    showAsHelp:
      'Watts per GPU, or the average as a percentage of the rated GPU TDP. Percent of TDP is a GPU-only reading.',
    showAsOptions: { watts: POWERX_VOCAB.en.wPerGpu, tdp: '% of TDP' } satisfies Record<
      PowerXShowAs,
      string
    >,
    tdpGpuOnly: 'TDP bounds GPU power only',
    statistic: 'Statistic',
    statisticHelp:
      'The average draw over the serving window, or its time-weighted P75 or P90 across the fleet.',
    statistics: { average: 'Avg', p75: 'P75', p90: 'P90' } satisfies Record<Statistic, string>,
    provisioned: POWERX_VOCAB.en.provisioned,
    provisionedHelp:
      'Draws two lines per GPU: measured GPU power (solid) and the all-in provisioned bound (dashed), nothing else.',
    provisionedOff: 'Off',
    provisionedOn: 'All-in provisioned',
    compareAt: POWERX_VOCAB.en.compareAt,
    compareAtHelp:
      'The interactivity Breakdown reads at: each GPU’s bar uses its point nearest this value.',
    tokPerUser: 'tok/s/user',
    presets: 'Presets',
    facility: POWERX_VOCAB.en.boundaries.system,
    chartStyle: 'Chart style',
    chartStyleHelp: 'How the drill-down under the compared GPU draws its parts across load.',
    chartStyles: { bars: 'Stacked bars', area: 'Stacked area' } satisfies Record<
      PowerBreakdownView,
      string
    >,
    roleBy: {
      prefill: 'Prefill GPUs',
      decode: 'Decode GPUs',
      split: 'Prefill vs decode',
    } satisfies Record<Exclude<PowerXRole, 'all'>, string>,
    reasons: {
      count:
        'Boundary is GPU: IT and facility are modeled for the whole deployment, not per GPU pool.',
      per: 'Energy per is Output: it is the one denominator prefill and decode share.',
      perPrefill:
        'Prefill GPUs: Output is reconstructed so it adds up with decode; Input is role-local.',
      rated: 'Provisioned bound is off: the all-in provisioned bound is per deployment.',
      statistic:
        'Statistic is Avg: P75 and P90 are time-weighted percentiles of the whole fleet, so they need All GPUs.',
      headroom:
        '% of TDP per pool is the pool’s average draw over its rated TDP. Headroom shading is off: it needs a P90 per GPU pool, which runs do not publish yet.',
    } satisfies Record<PowerXPinnedControl | 'perPrefill', string>,
    pinnedWhat: {
      count: `${POWERX_VOCAB.en.boundary} ${POWERX_VOCAB.en.boundaries.gpu}`,
      per: `${POWERX_VOCAB.en.energyPer} ${POWERX_VOCAB.en.pers.output}`,
      perPrefill: `${POWERX_VOCAB.en.energyPer} ${POWERX_VOCAB.en.pers.output} or ${POWERX_VOCAB.en.pers.input}`,
      statistic: 'Statistic Avg',
    },
    why: 'Why?',
    whyTitle: 'Why is this pinned?',
    setBy: (by: string) => `Set by ${by}`,
    pinned: (by: string, what: string) => `Set by ${by}: ${what}.`,
    picksReturn: 'Your picks return on All GPUs.',
  },
  zh: {
    views: 'PowerX 视图',
    tabs: POWERX_VOCAB.zh.tabs,
    tabsShort: { energy: '能耗', power: '功耗', breakdown: '功耗构成', time: '随时间变化' },
    tabHints: {
      energy: '每 Token 焦耳数或每次查询 Wh vs 交互性',
      power: '每 GPU 瓦数 vs 交互性',
      breakdown: '对比点处的 GPU、服务器与数据中心功耗',
      time: '运行期间的功耗曲线',
    } satisfies Record<PowerXView, string>,
    role: POWERX_VOCAB.zh.role,
    roleHelp:
      '图表读取分离式部署中的哪些 GPU：全部 GPU、仅预填充池、仅解码池，或并排对比两个池。聚合式部署无法拆分：每块 GPU 同时承担两者。',
    roles: POWERX_VOCAB.zh.roles,
    roleHints: {
      all: '部署中的全部 GPU',
      prefill: '处理提示词的 GPU',
      decode: '生成 token 的 GPU',
      split: '两个池并排对比',
    } satisfies Record<PowerXRole, string>,
    boundary: POWERX_VOCAB.zh.boundary,
    boundaryHelp:
      'GPU 为实测板卡功耗；IT 在此基础上加入模型估算的 CPU、服务器部件、风扇/电源与网络分摊，不含 PUE；数据中心为 IT × PUE；全部则在同一图中按 GPU 绘制三个边界。',
    boundaries: POWERX_VOCAB.zh.boundaries,
    boundaryHints: {
      gpu: '实测 GPU 板卡功耗',
      it: 'GPU 为实测；CPU、服务器部件、风扇/电源与网络分摊为模型估算。不含 PUE。',
      system: 'IT × PUE：GPU 为实测，服务器其他组件与数据中心开销为模型估算',
      both: '在同一图中按 GPU 对比 GPU（实线）、IT（虚线）与数据中心（点划线）',
    } satisfies Record<PowerXCount, string>,
    systemTokensOnly: 'IT 与数据中心能耗仅支持“全部 Token”和“输出”',
    energyPer: POWERX_VOCAB.zh.energyPer,
    energyPerHelp:
      '能耗的计量单位：含提示词的全部 Token（默认）、每输出 Token、每输入 Token，或每次成功查询（以 Wh 计）。',
    pers: POWERX_VOCAB.zh.pers,
    showAs: '显示为',
    showAsHelp: '每 GPU 瓦数，或平均功耗占 GPU 额定 TDP 的百分比；TDP 占比仅针对 GPU。',
    showAsOptions: { watts: POWERX_VOCAB.zh.wPerGpu, tdp: 'TDP 占比' } satisfies Record<
      PowerXShowAs,
      string
    >,
    tdpGpuOnly: 'TDP 仅限定 GPU 功耗',
    statistic: '统计量',
    statisticHelp: '服务窗口内的平均功耗，或整个集群按时间加权的 P75 / P90。',
    statistics: { average: '平均', p75: 'P75', p90: 'P90' } satisfies Record<Statistic, string>,
    provisioned: POWERX_VOCAB.zh.provisioned,
    provisionedHelp: '每块 GPU 仅绘制两条线：GPU 实测功耗（实线）与整体预配上限（虚线）。',
    provisionedOff: '关闭',
    provisionedOn: '整体预配',
    compareAt: POWERX_VOCAB.zh.compareAt,
    compareAtHelp: '功耗构成读取的交互性：每块 GPU 的条形取最接近该值的数据点。',
    tokPerUser: 'tok/s/user',
    presets: '预设',
    facility: POWERX_VOCAB.zh.boundaries.system,
    chartStyle: '图表样式',
    chartStyleHelp: '所对比 GPU 下方的下钻图如何绘制各部件随负载的变化。',
    chartStyles: { bars: '堆叠柱状图', area: '堆叠面积图' } satisfies Record<
      PowerBreakdownView,
      string
    >,
    roleBy: {
      prefill: '预填充 GPU',
      decode: '解码 GPU',
      split: '预填充 vs 解码',
    } satisfies Record<Exclude<PowerXRole, 'all'>, string>,
    reasons: {
      count: '功耗边界为 GPU：IT 与数据中心功耗按整个部署建模，无法按 GPU 池拆分。',
      per: '能耗计量为输出：这是预填充与解码共用的唯一分母。',
      perPrefill: '预填充 GPU：输出按重构值计算，可与解码相加；输入仅统计本角色。',
      rated: '预配上限已关闭：整体预配上限按整个部署计算。',
      statistic: '统计量为平均：P75 与 P90 是整个集群按时间加权的百分位，需选择“全部 GPU”。',
      headroom:
        '按池计算的 TDP 占比为该池平均功耗相对额定 TDP 的比例。不显示余量阴影：它需要按 GPU 池统计的 P90，目前运行结果尚未提供。',
    } satisfies Record<PowerXPinnedControl | 'perPrefill', string>,
    pinnedWhat: {
      count: `${POWERX_VOCAB.zh.boundary}为 ${POWERX_VOCAB.zh.boundaries.gpu}`,
      per: `${POWERX_VOCAB.zh.energyPer}为${POWERX_VOCAB.zh.pers.output}`,
      perPrefill: `${POWERX_VOCAB.zh.energyPer}为${POWERX_VOCAB.zh.pers.output}或${POWERX_VOCAB.zh.pers.input}`,
      statistic: '统计量为平均',
    },
    why: '原因',
    whyTitle: '为什么被固定？',
    setBy: zhSetBy,
    pinned: (by: string, what: string) => `${zhSetBy(by)}：${what}。`,
    picksReturn: '切回“全部 GPU”后恢复你的选择。',
  },
} as const;

/** What a GPU role pins on a tab: who set it, what it set, and why. */
export interface PowerXPin {
  /** Who set it, e.g. "Decode GPUs". */
  by: string;
  /** What it set, e.g. "Boundary GPU, Energy per Output". */
  what: string;
  /** The reasons "Why?" reveals. */
  reasons: readonly string[];
}

/** The pin for a tab under a GPU role: who set what, and why (behind "Why?"). */
export function powerXPinFor(
  selection: PowerXSelection,
  role: PowerXRole,
  locale: 'en' | 'zh',
): PowerXPin | null {
  if (role === 'all') return null;
  const t = STRINGS[locale];
  const view = powerXViewFor(selection.metric, selection.compare);
  const pinned = powerXPinnedControls(view, role);
  if (pinned.length === 0) return null;
  const what: string[] = [];
  const reasons: string[] = [];
  if (pinned.includes('count')) {
    what.push(t.pinnedWhat.count);
    reasons.push(t.reasons.count);
  }
  if (view === 'energy') {
    if (pinned.includes('per')) {
      what.push(t.pinnedWhat.per);
      reasons.push(t.reasons.per);
    } else if (role === 'prefill') {
      what.push(t.pinnedWhat.perPrefill);
      reasons.push(t.reasons.perPrefill);
    }
  }
  if (pinned.includes('statistic')) {
    what.push(t.pinnedWhat.statistic);
    reasons.push(t.reasons.statistic);
  }
  if (pinned.includes('rated')) reasons.push(t.reasons.rated);
  if (pinned.includes('headroom') && powerXShowAsFor(selection.metric) === 'tdp')
    reasons.push(t.reasons.headroom);
  return { by: t.roleBy[role], what: what.join(locale === 'zh' ? '，' : ', '), reasons };
}

/**
 * The four views as the underlined tab row under the section header. Under md each tab
 * takes a quarter of the row and shows its short name, so all four fit 390 px without a
 * sideways scroll.
 */
export function PowerXViewTabs({
  selection,
  onSelectionChange,
}: {
  selection: PowerXSelection;
  onSelectionChange: (next: PowerXSelection) => void;
}) {
  const t = STRINGS[useLocale()];
  const analyticsContext = useInferenceAnalyticsContext();
  const view = powerXViewFor(selection.metric, selection.compare);
  return (
    <Tabs
      value={view ?? ''}
      // Manual: arrow keys move focus, Enter or Space switches, so each key press does not redraw.
      activationMode="manual"
      onValueChange={(next) => {
        const value = next as PowerXView;
        if (value === view) return;
        track('inference_powerx_tab_selected', {
          ...analyticsContext,
          tab: POWERX_VIEW_ANALYTICS_ID[value],
        });
        onSelectionChange(selectPowerXView(value, selection));
      }}
      className="-mt-1 min-w-0 max-w-full gap-0"
    >
      <TabsList
        aria-label={t.views}
        data-testid="powerx-tabs"
        className="flex min-w-0 max-w-full flex-nowrap items-stretch overflow-x-auto border-b border-border/60 max-md:gap-0"
      >
        {POWERX_VIEWS.map((value) => (
          <TabsTrigger
            key={value}
            value={value}
            title={t.tabHints[value]}
            data-testid={`powerx-tab-${value}`}
            className="-mb-px min-h-11 shrink-0 cursor-pointer px-3 py-0 md:min-h-9 max-md:flex-1 max-md:px-1.5"
          >
            <span className="md:hidden">{t.tabsShort[value]}</span>
            <span className="max-md:hidden">{t.tabs[value]}</span>
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}

/**
 * One Chart Config cell: the same wrapper, label and (i) help as the X-Axis Metric
 * select, so the PowerX controls sit in Chart Config as its peers.
 */
function Field({
  label,
  tooltip,
  aside,
  children,
  className,
  testId,
  locked,
}: {
  label: string;
  tooltip: string;
  /** Beside the label; it never widens the cell, so it can come and go. */
  aside?: ReactNode;
  children: ReactNode;
  className?: string;
  testId?: string;
  locked?: boolean;
}) {
  return (
    <div
      className={cn('flex min-w-0 flex-col space-y-1.5 sm:max-w-full', className)}
      data-testid={testId}
      data-locked={locked ? '' : undefined}
    >
      <div className="flex h-5 min-w-0 items-center gap-2 sm:w-0 sm:min-w-full">
        <LabelWithTooltip label={label} tooltip={tooltip} />
        {aside}
      </div>
      {children}
    </div>
  );
}

/** A segmented toggle at its natural width inside a Chart Config cell. */
const CELL_TOGGLE_CLASS = 'self-start max-sm:w-full';
const CELL_SEGMENT_CLASS = 'whitespace-nowrap';

/** A line-style swatch for each GPU role, matching the chart: solid, dashed, dotted, both. */
function swatchLine(dash: string, y: number) {
  return (
    <line
      x1="1"
      x2="17"
      y1={y}
      y2={y}
      stroke="currentColor"
      strokeWidth="1.75"
      strokeDasharray={dash || undefined}
    />
  );
}

function RoleSwatch({ role }: { role: PowerXRole }) {
  return (
    <svg width="18" height="10" viewBox="0 0 18 10" aria-hidden="true" className="shrink-0">
      {role === 'all' && swatchLine('', 5)}
      {role === 'prefill' && swatchLine(powerVariantDash({ kind: 'role', id: 'prefill' }), 5)}
      {role === 'decode' && swatchLine(powerVariantDash({ kind: 'role', id: 'decode' }), 5)}
      {role === 'split' && (
        <>
          {swatchLine(powerVariantDash({ kind: 'role', id: 'prefill' }), 2.5)}
          {swatchLine(powerVariantDash({ kind: 'role', id: 'decode' }), 7.5)}
        </>
      )}
    </svg>
  );
}

/** "Set by Decode GPUs · Why?" beside the GPU role label; Why? lists the reasons. */
function PowerXPinLine({ pin }: { pin: PowerXPin }) {
  const t = STRINGS[useLocale()];
  return (
    <span
      className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground"
      data-testid="powerx-pin-line"
      title={t.pinned(pin.by, pin.what)}
    >
      <Lock aria-hidden className="size-3.5 shrink-0" />
      <span className="min-w-0 truncate">{t.setBy(pin.by)}</span>
      <Popover>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="link"
            size="2xs"
            className="h-auto px-0 underline decoration-border underline-offset-2 hover:decoration-current"
            data-testid="powerx-pin-why"
            onClick={() => track('powerx_pin_why_opened', { by: pin.by })}
          >
            {t.why}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-80 text-sm" data-testid="powerx-pin-reasons">
          <h3 className="mb-2 font-semibold">{t.whyTitle}</h3>
          {pin.what && <p className="mb-2">{t.pinned(pin.by, pin.what)}</p>}
          <ul className="flex list-disc flex-col gap-1.5 pl-4 text-muted-foreground">
            {pin.reasons.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-muted-foreground">{t.picksReturn}</p>
        </PopoverContent>
      </Popover>
    </span>
  );
}

/** Presets and a slider for Compare at. */
export function PowerXCompareAtPicker({ range }: { range?: readonly [number, number] }) {
  const t = STRINGS[useLocale()];
  const analyticsContext = useInferenceAnalyticsContext();
  const value = usePowerXCompareTarget() ?? POWERX_COMPARE_AT_DEFAULT;
  const setValue = useSetPowerXCompareTarget();
  const lo = Math.max(1, Math.floor(range?.[0] ?? POWERX_COMPARE_AT_MIN));
  const hi = Math.max(lo + 1, Math.ceil(range?.[1] ?? POWERX_COMPARE_AT_MAX));
  const [draft, setDraft] = useState<string | null>(null);
  const trackChange = (at: number, how: 'preset' | 'slider' | 'input') =>
    track('powerx_compare_at_changed', { ...analyticsContext, at, how, source: 'config' });
  const change = (next: number, how: 'preset' | 'input') => {
    setValue?.(next);
    trackChange(next, how);
  };
  const commitDraft = () => {
    if (draft === null) return;
    setDraft(null);
    const parsed = Math.round(Number(draft));
    if (draft.trim() === '' || !Number.isFinite(parsed)) return;
    const next = Math.min(hi, Math.max(lo, parsed));
    if (next !== value) change(next, 'input');
  };
  const preset = POWERX_COMPARE_AT_PRESETS.find((option) => option === value);
  return (
    <div className="flex flex-col gap-3" data-testid="powerx-compare-at-picker">
      <SegmentedToggle<string>
        value={preset === undefined ? '' : String(preset)}
        ariaLabel={t.presets}
        role="group"
        size="default"
        testId="powerx-compare-at-presets"
        className="self-start"
        buttonClassName="tabular-nums"
        onValueChange={(next) => change(Number(next), 'preset')}
        options={POWERX_COMPARE_AT_PRESETS.map((option) => ({
          value: String(option),
          label: String(option),
          testId: `powerx-compare-at-preset-${option}`,
        }))}
      />
      <RangeField
        label={`${t.compareAt} (${t.tokPerUser})`}
        min={lo}
        max={hi}
        value={Math.min(hi, Math.max(lo, value))}
        onSliderChange={(next) => setValue?.(next)}
        // One event per drag, as the other RangeField callers do.
        onSliderCommit={() => trackChange(value, 'slider')}
        sliderTestId="powerx-compare-at-slider"
        compact
        input={{
          value: draft ?? String(value),
          min: lo,
          max: hi,
          onChange: (event) => setDraft(event.target.value),
          onBlur: commitDraft,
          onKeyDown: (event) => {
            if (event.key === 'Enter') commitDraft();
          },
          className: 'tabular-nums',
          'data-testid': 'powerx-compare-at-input',
        }}
      />
      <p className="text-xs text-muted-foreground">{t.compareAtHelp}</p>
    </div>
  );
}

/** The X-Axis Metric cell ChartControls hands PowerX, with whether it is off its default. */
export interface PowerXChartConfigSlots {
  xAxisSelector: ReactNode;
  xAxisChanged: boolean;
}

interface PowerXChartConfigProps {
  selection: PowerXSelection;
  onSelectionChange: (next: PowerXSelection) => void;
  role: PowerXRole;
  onRoleChange: (role: PowerXRole) => void;
  slots?: PowerXChartConfigSlots;
  /** Breakdown's own cells: the drill-down style and the PUEs its facility switch names. */
  breakdown?: {
    view: PowerBreakdownView;
    onViewChange: (next: PowerBreakdownView) => void;
    pues: readonly number[];
    /** The interactivity the visible GPUs cover; the Compare at slider spans it. */
    range?: readonly [number, number] | null;
  };
}

/**
 * The PowerX cells of the shared Chart Config fieldset: X-Axis Metric (Energy and Power),
 * GPU role on every tab, then the tab's options. Under a GPU role the pinned values show,
 * the options the role rules out are disabled (so no cell changes width) and the role
 * cell says who set them. Picking an option a role allows still writes the stored choice.
 */
export function PowerXChartConfig({
  selection,
  onSelectionChange,
  role,
  onRoleChange,
  slots,
  breakdown,
}: PowerXChartConfigProps) {
  const locale = useLocale();
  const t = STRINGS[locale];
  const analyticsContext = useInferenceAnalyticsContext();
  // Phones get one full-width native select per group, as on other pages; each option
  // carries the segment's hint, which touch never shows.
  const variant: 'select' | 'segments' = useIsMobileViewport() ? 'select' : 'segments';
  const view = powerXViewFor(selection.metric, selection.compare);
  const pin = powerXPinFor(selection, role, locale);
  const toggle = {
    role: 'group' as const,
    size: 'default' as const,
    variant,
    className: CELL_TOGGLE_CLASS,
    buttonClassName: CELL_SEGMENT_CLASS,
  };

  const roleCell = (
    <Field
      label={t.role}
      tooltip={t.roleHelp}
      aside={pin && <PowerXPinLine pin={pin} />}
      testId="powerx-role"
    >
      <SegmentedToggle<PowerXRole>
        {...toggle}
        value={role}
        ariaLabel={t.role}
        testId="powerx-role-toggle"
        onValueChange={(next) => {
          if (next === role) return;
          track('powerx_role_changed', { ...analyticsContext, role: next, previous_role: role });
          onRoleChange(next);
        }}
        options={POWERX_ROLES.map((value) => ({
          value,
          label: t.roles[value],
          title: t.roleHints[value],
          icon: <RoleSwatch role={value} />,
          testId: `powerx-role-${value}`,
        }))}
      />
    </Field>
  );

  const cells: ReactNode[] = [];
  if (view === 'energy' || view === 'power') {
    const pinned = powerXPinnedControls(view, role);
    const effective = resolvePowerXRole(selection, role);
    const countLocked = pinned.includes('count');
    const count: PowerXCount = countLocked
      ? 'gpu'
      : powerXCountFor(selection.metric, selection.compare);
    const energyPer = energyPerFor(effective.metric);
    const modeledDisabled = view === 'energy' && !energyPerHasBoundaries(energyPer);
    cells.push(
      <Field key="boundary" label={t.boundary} tooltip={t.boundaryHelp} locked={countLocked}>
        <SegmentedToggle<PowerXCount>
          {...toggle}
          value={count}
          ariaLabel={t.boundary}
          testId="powerx-boundary"
          onValueChange={(next) => {
            // Under a role GPU is the one boundary; re-picking it keeps the stored choice.
            if (countLocked) return;
            track('inference_powerx_boundary_selected', { ...analyticsContext, boundary: next });
            onSelectionChange(selectPowerXCount(next, selection));
          }}
          options={(['gpu', 'it', 'system', 'both'] as const).map((value) => {
            const off = value !== 'gpu' && (countLocked || modeledDisabled);
            return {
              value,
              label: t.boundaries[value],
              title: off
                ? countLocked
                  ? t.reasons.count
                  : t.systemTokensOnly
                : t.boundaryHints[value],
              disabled: off,
              testId: `powerx-boundary-${value}`,
            };
          })}
        />
      </Field>,
    );
    if (view === 'energy') {
      const rolePers = powerXRoleEnergyPers(role);
      const perLocked = pinned.includes('per');
      cells.push(
        <Field key="per" label={t.energyPer} tooltip={t.energyPerHelp} locked={perLocked}>
          <SegmentedToggle<EnergyPer>
            {...toggle}
            value={energyPer}
            ariaLabel={t.energyPer}
            testId="powerx-energy-per"
            onValueChange={(next) => {
              // Under a role the drawn unit may differ from the stored one; re-picking it
              // must not overwrite the choice All GPUs brings back.
              if (role !== 'all' && next === energyPer) return;
              track('inference_powerx_energy_per_selected', { ...analyticsContext, per: next });
              onSelectionChange(selectPowerXPer(next, selection));
            }}
            options={(['total', 'output', 'input', 'query'] as const).map((value) => {
              const off = role !== 'all' && !rolePers.includes(value as 'output' | 'input');
              return {
                value,
                label: t.pers[value],
                title: off ? (perLocked ? t.reasons.per : t.reasons.perPrefill) : undefined,
                disabled: off,
                testId: `powerx-energy-per-${value}`,
              };
            })}
          />
        </Field>,
      );
      if (powerXRatedAvailable(selection.metric)) {
        const ratedPinned = pinned.includes('rated');
        const ratedOn = !ratedPinned && powerXRatedOn(selection.compare);
        cells.push(
          <Field
            key="provisioned"
            label={t.provisioned}
            tooltip={t.provisionedHelp}
            locked={ratedPinned}
          >
            <SegmentedToggle<'none' | 'provisioned'>
              {...toggle}
              value={ratedOn ? 'provisioned' : 'none'}
              ariaLabel={t.provisioned}
              testId="powerx-compare-boundaries"
              onValueChange={(mode) => {
                if (mode === (ratedOn ? 'provisioned' : 'none')) return;
                track('inference_power_compare_changed', { mode, family: 'powerx' });
                onSelectionChange(selectPowerXRated(mode === 'provisioned', selection));
              }}
              options={[
                { value: 'none', label: t.provisionedOff, testId: 'powerx-compare-boundaries-off' },
                {
                  value: 'provisioned',
                  label: t.provisionedOn,
                  title: ratedPinned ? t.reasons.rated : t.provisionedHelp,
                  disabled: ratedPinned,
                  testId: 'powerx-compare-boundaries-provisioned',
                },
              ]}
            />
          </Field>,
        );
      }
    } else {
      const showAs = powerXShowAsFor(effective.metric);
      cells.push(
        <Field key="show-as" label={t.showAs} tooltip={t.showAsHelp}>
          <SegmentedToggle<PowerXShowAs>
            {...toggle}
            value={showAs}
            ariaLabel={t.showAs}
            testId="powerx-unit"
            onValueChange={(next) => {
              if (next === showAs) return;
              onSelectionChange({ metric: selectPowerXShowAs(next), compare: 'none' });
            }}
            options={(['watts', 'tdp'] as const).map((value) => ({
              value,
              label: t.showAsOptions[value],
              // % TDP is a GPU-only reading; TDP does not bound IT or facility power.
              title: value === 'tdp' && count !== 'gpu' ? t.tdpGpuOnly : undefined,
              disabled: value === 'tdp' && count !== 'gpu',
              testId: `powerx-unit-${value}`,
            }))}
          />
        </Field>,
      );
      const config = getMeasuredMetricConfig(effective.metric);
      const statisticLocked = pinned.includes('statistic');
      const statistic: Statistic =
        statisticLocked || config?.family !== 'power'
          ? 'average'
          : ((config.statistic as Statistic | undefined) ?? 'average');
      if (
        statisticLocked ||
        powerXMetricFields(selection.metric, selection.compare).includes('statistic')
      ) {
        cells.push(
          <Field
            key="statistic"
            label={t.statistic}
            tooltip={t.statisticHelp}
            locked={statisticLocked}
          >
            <SegmentedToggle<Statistic>
              {...toggle}
              value={statistic}
              ariaLabel={t.statistic}
              testId="powerx-statistic"
              onValueChange={(next) => {
                if (statisticLocked || next === statistic) return;
                const metric = changeMeasuredMetricConfig(selection.metric, { statistic: next });
                track('inference_powerx_measured_metric_selected', {
                  ...analyticsContext,
                  metric,
                  previous_metric: selection.metric,
                });
                onSelectionChange({ metric, compare: selection.compare });
              }}
              options={(['average', 'p75', 'p90'] as const).map((value) => ({
                value,
                label: t.statistics[value],
                title: statisticLocked && value !== 'average' ? t.reasons.statistic : undefined,
                disabled: statisticLocked && value !== 'average',
                testId: `measured-power-statistic-${value}`,
              }))}
            />
          </Field>,
        );
      }
    }
  }
  if (view === 'breakdown' && breakdown) {
    cells.push(
      <PowerXCompareAtCell key="compare-at" range={breakdown.range ?? undefined} />,
      <Field
        key="facility"
        label={t.facility}
        tooltip={FACILITY_PUE_NOTE[locale]}
        testId="powerx-where-controls"
      >
        <PowerXFacilitySwitch pues={breakdown.pues} compact />
      </Field>,
      <Field key="chart-style" label={t.chartStyle} tooltip={t.chartStyleHelp}>
        <SegmentedToggle<PowerBreakdownView>
          {...toggle}
          value={breakdown.view}
          ariaLabel={t.chartStyle}
          testId="power-breakdown-view"
          onValueChange={(next) => {
            if (next === breakdown.view) return;
            breakdown.onViewChange(next);
            track('powerx_breakdown_view_changed', { view: next });
          }}
          options={(['bars', 'area'] as const).map((value) => ({
            value,
            label: t.chartStyles[value],
            testId: `power-breakdown-view-${value}`,
          }))}
        />
      </Field>,
    );
  }

  return (
    <div className="contents" data-testid="powerx-chart-config">
      {(view === 'energy' || view === 'power') && slots?.xAxisSelector && (
        <div className="min-w-0 sm:w-56">{slots.xAxisSelector}</div>
      )}
      {roleCell}
      {cells}
    </div>
  );
}

/** Compare at as a Chart Config cell: a select-styled trigger that opens the picker. */
function PowerXCompareAtCell({ range }: { range?: readonly [number, number] }) {
  const t = STRINGS[useLocale()];
  const value = usePowerXCompareTarget() ?? POWERX_COMPARE_AT_DEFAULT;
  return (
    <Field label={t.compareAt} tooltip={t.compareAtHelp}>
      <Popover>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            className="justify-between px-3 font-normal tabular-nums sm:w-44 has-[>svg]:px-3"
            data-testid="powerx-compare-at"
          >
            <span className="flex min-w-0 items-center gap-2">
              <span aria-hidden className="h-3.5 w-0.5 shrink-0 rounded-full bg-powerx-at" />
              {value} {t.tokPerUser}
            </span>
            <ChevronDown aria-hidden className="size-4 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-[22rem] max-w-[calc(100vw-2rem)]">
          <PowerXCompareAtPicker range={range} />
        </PopoverContent>
      </Popover>
    </Field>
  );
}
