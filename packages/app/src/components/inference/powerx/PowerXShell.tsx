'use client';

import { ChevronDown, Lock, SlidersHorizontal } from 'lucide-react';
import { type ReactNode, useState } from 'react';

import { useInferenceAnalyticsContext } from '@/components/inference/InferenceContext';
import {
  usePowerXCompareTarget,
  useSetPowerXCompareTarget,
  usePowerXActivePoint,
} from '@/components/inference/ui/powerx-surface';
import type { PowerXStripParts } from '@/components/inference/ui/ChartControls';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useIsMobileViewport } from '@/hooks/useMediaQuery';
import { track } from '@/lib/analytics/analytics';
import { useLocale } from '@/lib/i18n/use-locale';
import { cn } from '@/lib/shared/utils';

import {
  POWERX_COMPARE_AT_MAX,
  POWERX_COMPARE_AT_MIN,
  POWERX_COMPARE_AT_PRESETS,
  POWERX_COMPARE_AT_DEFAULT,
} from './powerx-compare-at';
import { POWERX_ROLES, type PowerXRole } from './powerx-role';
import {
  POWERX_VIEWS,
  powerXViewFor,
  selectPowerXView,
  type PowerXSelection,
  type PowerXView,
} from './powerx-views';

/**
 * The PowerX page shell: one flat surface. A title row, a quiet sticky context strip
 * (model, scenario, precision, GPU role, Compare at, run), the tabs directly under it,
 * then per tab one toolbar row, a y-title row with the pin line, the chart with the
 * ranking beside it, the pinned-point strip and whatever the tab shows below.
 *
 * Every row has a fixed height so the chart starts at the same place on every tab and
 * GPU role. Slots: `PowerXContextStrip`, `PowerXToolbar` (options + More + actions),
 * `PowerXYTitleRow` (y title + pin line), `PowerXChartFrame` (chart, ranking, pinned, below).
 */

const STRINGS = {
  en: {
    title: 'PowerX',
    subtitle: 'Measured GPU power and energy for every benchmark point',
    context: 'Benchmark context',
    role: 'GPU role',
    roles: {
      all: 'All GPUs',
      prefill: 'Prefill',
      decode: 'Decode',
      split: 'Prefill vs decode',
    } satisfies Record<PowerXRole, string>,
    rolesShort: {
      all: 'All GPUs',
      prefill: 'Prefill',
      decode: 'Decode',
      split: 'P vs D',
    } satisfies Record<PowerXRole, string>,
    roleHints: {
      all: 'Every GPU of the deployment',
      prefill: 'Only the GPUs that run prefill',
      decode: 'Only the GPUs that run decode',
      split: 'Prefill and decode pools side by side',
    } satisfies Record<PowerXRole, string>,
    compareAt: 'Compare at',
    compareAtHelp:
      'The interactivity every tab reads at: the ranking, the Breakdown bars and the Over time trace use the point nearest it.',
    tokPerUser: 'tok/s/user',
    tokShort: 'tok/s',
    presets: 'Presets',
    custom: 'Custom',
    run: 'Run',
    latest: 'Latest',
    history: 'History',
    runContext: 'Run context',
    compareHistory: 'Compare history',
    views: 'PowerX views',
    tabs: {
      energy: 'Energy per token',
      draw: 'Power draw',
      where: 'Breakdown',
      time: 'Over time',
    } satisfies Record<PowerXView, string>,
    tabsShort: {
      energy: 'Energy',
      draw: 'Power',
      where: 'Breakdown',
      time: 'Over time',
    } satisfies Record<PowerXView, string>,
    tabHints: {
      energy: 'Joules per token or Wh per query vs interactivity',
      draw: 'Watts per GPU vs interactivity',
      where: 'GPU, server and facility at Compare at',
      time: 'Power trace through a run',
    } satisfies Record<PowerXView, string>,
    more: 'More',
    moreTitle: (tab: string) => `More · ${tab}`,
    changed: (n: number) => `${n} changed from default`,
    reset: 'Reset',
    settings: 'View settings',
    openSettings: 'Change model, scenario, GPU role, Compare at or run',
    why: 'Why?',
    whyTitle: 'Why is this pinned?',
    setBy: (by: string) => `Set by ${by}`,
    picksReturn: 'Your picks return on All GPUs.',
  },
  zh: {
    title: 'PowerX 功耗',
    subtitle: '每个基准测试点的实测 GPU 功耗与能耗',
    context: '基准测试上下文',
    role: 'GPU 角色',
    roles: {
      all: '全部 GPU',
      prefill: '预填充',
      decode: '解码',
      split: '预填充 vs 解码',
    } satisfies Record<PowerXRole, string>,
    rolesShort: {
      all: '全部 GPU',
      prefill: '预填充',
      decode: '解码',
      split: '预填充 vs 解码',
    } satisfies Record<PowerXRole, string>,
    roleHints: {
      all: '部署中的每块 GPU',
      prefill: '仅承担预填充的 GPU',
      decode: '仅承担解码的 GPU',
      split: '并排对比预填充池与解码池',
    } satisfies Record<PowerXRole, string>,
    compareAt: '对比点',
    compareAtHelp:
      '所有标签页读取的交互性：排名、功耗构成条形图与随时间变化曲线都取最接近该值的数据点。',
    tokPerUser: 'tok/s/user',
    tokShort: 'tok/s',
    presets: '预设',
    custom: '自定义',
    run: '运行',
    latest: '最新',
    history: '历史',
    runContext: '运行信息',
    compareHistory: '对比历史趋势',
    views: 'PowerX 视图',
    tabs: {
      energy: '每 Token 能耗',
      draw: '功耗',
      where: '功耗构成',
      time: '随时间变化',
    } satisfies Record<PowerXView, string>,
    tabsShort: {
      energy: '能耗',
      draw: '功耗',
      where: '构成',
      time: '随时间',
    } satisfies Record<PowerXView, string>,
    tabHints: {
      energy: '每 Token 焦耳数或每次查询 Wh vs 交互性',
      draw: '每 GPU 瓦数 vs 交互性',
      where: '对比点处的 GPU、服务器与数据中心功耗',
      time: '运行期间的功耗曲线',
    } satisfies Record<PowerXView, string>,
    more: '更多',
    moreTitle: (tab: string) => `更多 · ${tab}`,
    changed: (n: number) => `已更改 ${n} 项默认设置`,
    reset: '重置',
    settings: '视图设置',
    openSettings: '更改模型、场景、GPU 角色、对比点或运行',
    why: '原因',
    whyTitle: '为什么被固定？',
    setBy: (by: string) => `由${by}设定`,
    picksReturn: '切回“全部 GPU”后恢复你的选择。',
  },
} as const;

export function usePowerXShellStrings() {
  return STRINGS[useLocale()];
}

/** A bottom sheet on phones: the shared dialog pinned to the bottom edge. */
export const POWERX_SHEET_CLASS =
  'top-auto bottom-0 left-0 max-h-[85dvh] max-w-none translate-x-0 translate-y-0 gap-3 overflow-y-auto rounded-b-none rounded-t-xl p-4 pb-[max(1rem,env(safe-area-inset-bottom))] data-[state=closed]:slide-out-to-left-0 data-[state=closed]:slide-out-to-top-0 data-[state=open]:slide-in-from-left-0 data-[state=open]:slide-in-from-top-0 data-[state=closed]:zoom-out-100 data-[state=open]:zoom-in-100';

/** The quiet text button of the strip and toolbar: no border, a fill on hover. */
export const POWERX_QUIET_BUTTON =
  'inline-flex h-8 shrink-0 cursor-pointer items-center gap-1.5 rounded-md px-2 text-sm whitespace-nowrap text-foreground transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none disabled:cursor-default';

// ---------------------------------------------------------------------------
// Segmented control

export interface PowerXSegOption<T extends string> {
  value: T;
  label: ReactNode;
  title?: string;
  disabled?: boolean;
  testId?: string;
}

/**
 * Segments with no track: the selection is a raised chip with a ring. `locked` (a GPU
 * role pins the control) draws a dashed outline and a lock glyph instead.
 */
export function PowerXSeg<T extends string>({
  value,
  options,
  onValueChange,
  ariaLabel,
  testId,
  locked = false,
  lockTitle,
  className,
}: {
  value: T;
  options: readonly PowerXSegOption<T>[];
  onValueChange: (value: T) => void;
  ariaLabel: string;
  testId?: string;
  locked?: boolean;
  lockTitle?: string;
  className?: string;
}) {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      data-testid={testId}
      data-locked={locked ? '' : undefined}
      className={cn('inline-flex shrink-0 items-center gap-0.5', className)}
    >
      {locked && (
        <span className="inline-flex px-1 text-muted-foreground" title={lockTitle}>
          <Lock aria-hidden className="size-3.5" />
        </span>
      )}
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={selected}
            title={option.title}
            disabled={option.disabled}
            data-testid={option.testId}
            onClick={() => {
              if (!selected) onValueChange(option.value);
            }}
            className={cn(
              'inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-md px-2.5 text-sm whitespace-nowrap transition-colors max-md:h-11',
              selected
                ? locked
                  ? 'font-semibold text-foreground outline-1 -outline-offset-1 outline-border outline-dashed'
                  : 'bg-background font-semibold text-foreground shadow-[0_0_0_1px_var(--border),0_1px_2px_rgb(0_0_0/0.08)] dark:bg-muted'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground',
              'disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent',
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Title row

export function PowerXTitleRow({ actions }: { actions: ReactNode }) {
  const t = usePowerXShellStrings();
  // Phones keep the heading for screen readers only; the actions move into the settings
  // sheet so the plot starts within the first screen.
  return (
    <div className="flex min-h-9 items-center gap-3 max-md:sr-only" data-testid="powerx-title-row">
      <h1 className="text-xl leading-7 font-semibold tracking-tight">{t.title}</h1>
      <span className="hidden min-w-0 truncate text-sm text-muted-foreground md:inline">
        {t.subtitle}
      </span>
      <div className="ml-auto flex shrink-0 items-center gap-1 max-md:hidden">{actions}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Compare at

function CompareAtMark() {
  return <span aria-hidden className="h-3.5 w-0.5 shrink-0 rounded-full bg-powerx-at" />;
}

/** Presets and a slider for Compare at; shared by the strip popover and the phone sheet. */
export function PowerXCompareAtPicker({
  range,
  source,
}: {
  range?: readonly [number, number];
  source: 'strip' | 'sheet';
}) {
  const t = usePowerXShellStrings();
  const analyticsContext = useInferenceAnalyticsContext();
  const value = usePowerXCompareTarget() ?? POWERX_COMPARE_AT_DEFAULT;
  const setValue = useSetPowerXCompareTarget();
  const lo = Math.max(1, Math.floor(range?.[0] ?? POWERX_COMPARE_AT_MIN));
  const hi = Math.max(lo + 1, Math.ceil(range?.[1] ?? POWERX_COMPARE_AT_MAX));
  const change = (next: number, how: 'preset' | 'slider') => {
    setValue?.(next);
    track('powerx_compare_at_changed', { ...analyticsContext, at: next, how, source });
  };
  return (
    <div className="flex flex-col gap-3" data-testid="powerx-compare-at-picker">
      <div className="flex flex-wrap gap-1" role="group" aria-label={t.presets}>
        {POWERX_COMPARE_AT_PRESETS.map((preset) => (
          <button
            key={preset}
            type="button"
            aria-pressed={value === preset}
            data-testid={`powerx-compare-at-preset-${preset}`}
            onClick={() => change(preset, 'preset')}
            className={cn(
              'inline-flex h-8 min-w-12 cursor-pointer items-center justify-center rounded-md px-2 text-sm tabular-nums transition-colors max-md:h-11',
              value === preset
                ? 'bg-background font-semibold shadow-[0_0_0_1px_var(--border),0_1px_2px_rgb(0_0_0/0.08)] dark:bg-muted'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground',
            )}
          >
            {preset}
          </button>
        ))}
      </div>
      <label className="flex items-center gap-3 text-sm">
        <span className="sr-only">{t.compareAt}</span>
        <input
          type="range"
          min={lo}
          max={hi}
          step={1}
          value={Math.min(hi, Math.max(lo, value))}
          onChange={(event) => change(Number(event.target.value), 'slider')}
          data-testid="powerx-compare-at-slider"
          className="h-11 min-w-0 flex-1 accent-powerx-at"
        />
        <span className="w-24 shrink-0 text-right tabular-nums">
          {value} {t.tokShort}
        </span>
      </label>
      <p className="text-xs text-muted-foreground">{t.compareAtHelp}</p>
    </div>
  );
}

function CompareAtControl({ range }: { range?: readonly [number, number] }) {
  const t = usePowerXShellStrings();
  const value = usePowerXCompareTarget() ?? POWERX_COMPARE_AT_DEFAULT;
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs whitespace-nowrap text-muted-foreground">{t.compareAt}</span>
      <Popover>
        <PopoverTrigger asChild>
          <button
            type="button"
            className={cn(POWERX_QUIET_BUTTON, 'tabular-nums')}
            data-testid="powerx-compare-at"
          >
            <CompareAtMark />
            {value} {t.tokPerUser}
            <ChevronDown aria-hidden className="size-3.5 text-muted-foreground" />
          </button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-80">
          <PowerXCompareAtPicker range={range} source="strip" />
        </PopoverContent>
      </Popover>
    </div>
  );
}

// ---------------------------------------------------------------------------
// GPU role

export function PowerXRoleSeg({
  role,
  onRoleChange,
  short = false,
}: {
  role: PowerXRole;
  onRoleChange: (role: PowerXRole) => void;
  short?: boolean;
}) {
  const t = usePowerXShellStrings();
  const analyticsContext = useInferenceAnalyticsContext();
  return (
    <PowerXSeg<PowerXRole>
      value={role}
      ariaLabel={t.role}
      testId="powerx-role-toggle"
      className="flex-wrap"
      onValueChange={(next) => {
        track('powerx_role_changed', { ...analyticsContext, role: next, previous_role: role });
        onRoleChange(next);
      }}
      options={POWERX_ROLES.map((value) => ({
        value,
        label: short ? t.rolesShort[value] : t.roles[value],
        title: t.roleHints[value],
        testId: `powerx-role-${value}`,
      }))}
    />
  );
}

// ---------------------------------------------------------------------------
// Run

function RunPanel({ runContext, parts }: { runContext?: ReactNode; parts: PowerXStripParts }) {
  const t = usePowerXShellStrings();
  return (
    <div className="flex flex-col gap-4" data-testid="powerx-run-panel">
      {runContext && (
        <section className="flex flex-col gap-2">
          <h3 className="text-xs font-semibold text-muted-foreground">{t.runContext}</h3>
          {runContext}
        </section>
      )}
      <section className="flex flex-col gap-2">
        <h3 className="text-xs font-semibold text-muted-foreground">{t.compareHistory}</h3>
        {parts.history}
      </section>
    </div>
  );
}

function RunControl({
  runLabel,
  runContext,
  parts,
}: {
  runLabel?: string;
  runContext?: ReactNode;
  parts: PowerXStripParts;
}) {
  const t = usePowerXShellStrings();
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-muted-foreground">{t.run}</span>
      <Popover>
        <PopoverTrigger asChild>
          <button
            type="button"
            className={cn(POWERX_QUIET_BUTTON, 'tabular-nums')}
            data-testid="powerx-run"
          >
            {parts.historyActive ? t.history : (runLabel ?? t.latest)}
            <ChevronDown aria-hidden className="size-3.5 text-muted-foreground" />
          </button>
        </PopoverTrigger>
        <PopoverContent
          align="end"
          className="max-h-[70vh] w-[min(36rem,calc(100vw-2rem))] overflow-y-auto"
        >
          <RunPanel runContext={runContext} parts={parts} />
        </PopoverContent>
      </Popover>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Context strip

/**
 * The sticky context strip. Desktop: one 48 px row. Phone: one tappable summary line
 * that opens a single settings sheet with the same controls.
 */
export function PowerXContextStrip({
  parts,
  role,
  onRoleChange,
  runContext,
  runLabel,
  sheetActions,
  modelLabel,
  scenarioLabel,
  compareAtRange,
}: {
  parts: PowerXStripParts;
  role: PowerXRole;
  onRoleChange: (role: PowerXRole) => void;
  runContext?: ReactNode;
  runLabel?: string;
  /** Phone only: the page actions (How we measure, Share) at the foot of the sheet. */
  sheetActions?: ReactNode;
  modelLabel: string;
  scenarioLabel: string;
  compareAtRange?: readonly [number, number];
}) {
  const t = usePowerXShellStrings();
  const phone = useIsMobileViewport();
  const at = usePowerXCompareTarget() ?? POWERX_COMPARE_AT_DEFAULT;
  const [sheetOpen, setSheetOpen] = useState(false);
  if (phone) {
    return (
      <div
        className="sticky top-14 z-30 -mx-4 border-b border-border/60 bg-background px-4"
        data-testid="powerx-context-strip"
      >
        <button
          type="button"
          aria-haspopup="dialog"
          aria-label={t.openSettings}
          data-testid="powerx-context-summary"
          onClick={() => {
            setSheetOpen(true);
            track('powerx_settings_sheet_opened', { role });
          }}
          className="flex h-11 w-full cursor-pointer items-center gap-1.5 text-left text-sm"
        >
          <span className="min-w-0 flex-1 truncate">
            <span className="font-semibold">{modelLabel}</span>
            {' · '}
            {scenarioLabel}
            {parts.precision && ` · ${parts.precision}`}
            {' · '}
            {t.rolesShort[role]}
            {' · '}
          </span>
          <CompareAtMark />
          <span className="shrink-0 tabular-nums">
            {at} {t.tokShort}
          </span>
          <ChevronDown aria-hidden className="size-4 shrink-0 text-muted-foreground" />
        </button>
        <Dialog open={sheetOpen} onOpenChange={setSheetOpen}>
          <DialogContent className={POWERX_SHEET_CLASS} data-testid="powerx-settings-sheet">
            <DialogTitle className="text-base">{t.settings}</DialogTitle>
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-1">
                  {parts.model}
                  {parts.modelBadge}
                </div>
                <div className="flex items-center gap-2">
                  {parts.scenario}
                  {parts.precision && <span className="px-2 text-sm">{parts.precision}</span>}
                </div>
              </div>
              <section className="flex flex-col gap-2">
                <h3 className="text-xs font-semibold text-muted-foreground">{t.role}</h3>
                <PowerXRoleSeg role={role} onRoleChange={onRoleChange} />
              </section>
              <section className="flex flex-col gap-2">
                <h3 className="text-xs font-semibold text-muted-foreground">{t.compareAt}</h3>
                <PowerXCompareAtPicker range={compareAtRange} source="sheet" />
              </section>
              <RunPanel runContext={runContext} parts={parts} />
              {sheetActions && (
                <div className="flex items-center justify-between gap-2 border-t border-border/60 pt-3">
                  {sheetActions}
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>
      </div>
    );
  }
  return (
    <div
      role="region"
      aria-label={t.context}
      className="sticky top-14 z-30 border-b border-border/60 bg-background"
      data-testid="powerx-context-strip"
    >
      <div className="flex min-h-12 flex-wrap items-center gap-x-4">
        <div className="-ml-2 flex h-12 min-w-0 items-center gap-1">
          {parts.model}
          {parts.modelBadge}
          {parts.scenario}
          {parts.precision && (
            <span className="px-1 text-sm" data-testid="powerx-precision">
              {parts.precision}
            </span>
          )}
        </div>
        <span aria-hidden className="h-5 w-px bg-border" />
        <div className="flex h-12 items-center gap-2" data-testid="powerx-role">
          <span className="text-xs whitespace-nowrap text-muted-foreground">{t.role}</span>
          <PowerXRoleSeg role={role} onRoleChange={onRoleChange} />
        </div>
        <div className="ml-auto flex h-12 items-center gap-4">
          <CompareAtControl range={compareAtRange} />
          <span aria-hidden className="h-5 w-px bg-border" />
          <RunControl runLabel={runLabel} runContext={runContext} parts={parts} />
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tabs

export function PowerXTabs({
  selection,
  onSelectionChange,
}: {
  selection: PowerXSelection;
  onSelectionChange: (next: PowerXSelection) => void;
}) {
  const t = usePowerXShellStrings();
  const analyticsContext = useInferenceAnalyticsContext();
  const view = powerXViewFor(selection.metric, selection.compare);
  return (
    <div
      role="tablist"
      aria-label={t.views}
      data-testid="powerx-tabs"
      className="flex h-12 min-w-0 items-stretch gap-6 border-b border-border/60 max-md:h-11 max-md:justify-between max-md:gap-2"
    >
      {POWERX_VIEWS.map((value) => {
        const selected = value === view;
        return (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={selected}
            title={t.tabHints[value]}
            data-testid={`powerx-tab-${value}`}
            onClick={() => {
              if (selected) return;
              track('inference_powerx_tab_selected', { ...analyticsContext, tab: value });
              onSelectionChange(selectPowerXView(value, selection));
            }}
            className={cn(
              '-mb-px inline-flex shrink-0 cursor-pointer items-center border-b-2 border-transparent text-sm whitespace-nowrap text-muted-foreground transition-colors hover:text-foreground',
              selected && 'border-brand font-semibold text-foreground',
            )}
          >
            <span className="max-md:hidden">{t.tabs[value]}</span>
            <span className="md:hidden">{t.tabsShort[value]}</span>
          </button>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Toolbar and More

export interface PowerXMoreProps {
  tab: PowerXView;
  changed: number;
  onReset: () => void;
  children: ReactNode;
}

/** One flat More: a popover on desktop, a bottom sheet on phones. */
export function PowerXMore({ tab, changed, onReset, children }: PowerXMoreProps) {
  const t = usePowerXShellStrings();
  const phone = useIsMobileViewport();
  const [open, setOpen] = useState(false);
  const onOpenChange = (next: boolean) => {
    setOpen(next);
    if (next) track('powerx_more_opened', { tab, changed });
  };
  const trigger = (
    <button
      type="button"
      className={cn(POWERX_QUIET_BUTTON, 'max-md:h-11')}
      data-testid="powerx-more"
      aria-haspopup="dialog"
      onClick={phone ? () => onOpenChange(true) : undefined}
    >
      <SlidersHorizontal aria-hidden className="size-4 text-muted-foreground" />
      {t.more}
      {changed > 0 && (
        <span
          className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-brand px-1 text-2xs font-semibold text-white tabular-nums"
          data-testid="powerx-more-count"
        >
          {changed}
        </span>
      )}
    </button>
  );
  const body = (
    <div className="flex flex-col gap-4" data-testid="powerx-more-content">
      {children}
      <div className="flex items-center justify-between gap-3 border-t border-border/60 pt-3 text-xs text-muted-foreground">
        <span data-testid="powerx-more-changed">{t.changed(changed)}</span>
        <button
          type="button"
          disabled={changed === 0}
          onClick={() => {
            onReset();
            track('powerx_more_reset', { tab, changed });
          }}
          className={cn(POWERX_QUIET_BUTTON, 'disabled:opacity-50')}
          data-testid="powerx-more-reset"
        >
          {t.reset}
        </button>
      </div>
    </div>
  );
  if (phone) {
    return (
      <>
        {trigger}
        <Dialog open={open} onOpenChange={onOpenChange}>
          <DialogContent className={POWERX_SHEET_CLASS} data-testid="powerx-more-sheet">
            <DialogTitle className="text-base">{t.moreTitle(t.tabs[tab])}</DialogTitle>
            {body}
          </DialogContent>
        </Dialog>
      </>
    );
  }
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent
        align="start"
        className="max-h-[70vh] w-[min(26rem,calc(100vw-2rem))] overflow-y-auto"
      >
        <h3 className="mb-3 text-sm font-semibold">{t.moreTitle(t.tabs[tab])}</h3>
        {body}
      </PopoverContent>
    </Popover>
  );
}

/** A labelled group inside More. */
export function PowerXMoreGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h4 className="text-xs font-semibold text-muted-foreground">{label}</h4>
      {children}
    </section>
  );
}

/** One option of the toolbar: a small label, then its control. */
export function PowerXToolbarOption({
  label,
  children,
  className,
}: {
  label?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex shrink-0 items-center gap-2', className)}>
      {label && <span className="text-xs whitespace-nowrap text-muted-foreground">{label}</span>}
      {children}
    </div>
  );
}

/**
 * The chart header: one 56 px row (48 px on phones) on every tab and role. At most three
 * options and More on the left; Chart | Table and Export on the right.
 */
export function PowerXToolbar({
  options,
  more,
  actions,
}: {
  options?: ReactNode;
  more?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div
      className="flex h-14 min-w-0 items-center gap-4 max-md:h-12 max-md:gap-1"
      data-testid="powerx-chart-header"
    >
      <div className="flex min-w-0 flex-1 items-center gap-6 overflow-x-auto [scrollbar-width:none] max-md:gap-1">
        {options}
        {more}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-1">{actions}</div>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Y-title row and pin line

export interface PowerXPin {
  /** Who set it, e.g. "Decode GPUs". */
  by: string;
  /** What it set, e.g. "Boundary GPU, Energy per Output". */
  what: string;
  /** The reasons "Why?" reveals. */
  reasons: readonly string[];
}

export function PowerXPinLine({ pin }: { pin: PowerXPin }) {
  const t = usePowerXShellStrings();
  return (
    <span
      className="ml-auto flex min-w-0 shrink items-center gap-1.5 text-xs text-foreground/80"
      data-testid="powerx-pin-line"
    >
      <Lock aria-hidden className="size-3.5 shrink-0" />
      <span className="min-w-0 truncate max-md:hidden">
        {t.setBy(pin.by)}: {pin.what}.{' '}
        <span className="text-muted-foreground">{t.picksReturn}</span>
      </span>
      <span className="md:hidden">{t.setBy(pin.by)}</span>
      <Popover>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="shrink-0 cursor-pointer underline decoration-border underline-offset-2 hover:decoration-current"
            data-testid="powerx-pin-why"
            onClick={() => track('powerx_pin_why_opened', { by: pin.by })}
          >
            {t.why}
          </button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-80 text-sm" data-testid="powerx-pin-reasons">
          <h3 className="mb-2 font-semibold">{t.whyTitle}</h3>
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

/** The 20 px row over the plot: the y title (and line keys) left, the pin line right. */
export function PowerXYTitleRow({ title, pin }: { title?: ReactNode; pin?: PowerXPin | null }) {
  return (
    <div
      className="mb-1.5 flex h-5 min-w-0 items-center gap-4 text-xs whitespace-nowrap text-muted-foreground max-md:mb-1"
      data-testid="powerx-y-title"
    >
      <div className="flex min-w-0 flex-1 items-center gap-4 overflow-hidden">{title}</div>
      {pin && <PowerXPinLine pin={pin} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Chart frame

/**
 * The tab body: toolbar, then the chart (with the y-title row) and the ranking beside it
 * (`1fr 280px` from lg; under it below lg), the pinned strip under the chart, and the
 * tab's detail (swing table, parts list) below everything.
 */
export function PowerXChartFrame({
  toolbar,
  yTitle,
  chart,
  ranking,
  pinned,
  below,
}: {
  toolbar: ReactNode;
  yTitle?: ReactNode;
  chart: ReactNode;
  ranking?: ReactNode;
  pinned?: ReactNode;
  below?: ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col" data-testid="powerx-chart-frame">
      {toolbar}
      <div
        className={cn(
          'grid min-w-0 gap-x-10 gap-y-4',
          ranking && 'lg:grid-cols-[minmax(0,1fr)_280px]',
        )}
      >
        <div className="relative min-w-0">
          {yTitle}
          {chart}
          {pinned}
        </div>
        {ranking && <div className="min-w-0">{ranking}</div>}
      </div>
      {below}
    </div>
  );
}

/** Renders the pinned-point strip only once a point is pinned (a click, not a hover). */
export function PowerXPinnedSlot({ children }: { children: ReactNode }) {
  const active = usePowerXActivePoint();
  if (active?.source !== 'pinned') return null;
  return <div data-testid="powerx-pinned-strip">{children}</div>;
}
