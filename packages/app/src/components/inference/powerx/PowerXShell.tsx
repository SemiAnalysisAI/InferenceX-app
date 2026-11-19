'use client';

import { Check, ChevronDown, Lock, SlidersHorizontal } from 'lucide-react';
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
import {
  type Model,
  type Sequence,
  getModelLabel,
  getSequenceLabel,
} from '@/lib/catalog/data-mappings';
import { useLocale } from '@/lib/i18n/use-locale';
import { cn } from '@/lib/shared/utils';

import {
  POWERX_COMPARE_AT_MAX,
  POWERX_COMPARE_AT_MIN,
  POWERX_COMPARE_AT_PRESETS,
  POWERX_COMPARE_AT_DEFAULT,
} from './powerx-compare-at';
import { POWERX_ROLES, type PowerXRole } from './powerx-role';
import { POWERX_VOCAB } from './powerx-strings';
import {
  POWERX_VIEW_ANALYTICS_ID,
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

// A space only after a Latin ending: 已按解码 GPU 固定, 已按预填充 vs 解码固定.
const zhSetBy = (by: string) => `已按${by}${/[A-Za-z0-9]$/u.test(by) ? ' ' : ''}固定`;

const STRINGS = {
  en: {
    title: 'PowerX',
    subtitle: 'Measured GPU power and energy for every benchmark point',
    context: 'Benchmark context',
    role: POWERX_VOCAB.en.role,
    roles: POWERX_VOCAB.en.roles,
    rolesShort: POWERX_VOCAB.en.rolesShort,
    roleHints: {
      all: 'Every GPU in the deployment',
      prefill: 'GPUs that process prompts',
      decode: 'GPUs that generate tokens',
      split: 'Both pools, side by side',
    } satisfies Record<PowerXRole, string>,
    roleNoData: 'no P/D data for this model',
    model: 'Model',
    scenario: 'Scenario',
    precision: 'Precision',
    precisionNote: 'the only precision with power data',
    compareAtAxis: 'tok/s/user · P90 interactivity',
    compareAt: POWERX_VOCAB.en.compareAt,
    compareAtHelp:
      'The interactivity every tab reads at: the ranking, the Breakdown bars and the Over time trace use the point nearest it.',
    tokPerUser: 'tok/s/user',
    tokShort: 'tok/s',
    presets: 'Presets',
    custom: 'Custom',
    run: 'Run',
    latest: 'Latest',
    history: 'History',
    compareHistory: 'Compare across dates',
    views: 'PowerX views',
    tabs: POWERX_VOCAB.en.tabs,
    tabsShort: POWERX_VOCAB.en.tabsShort,
    tabHints: {
      energy: 'Joules per token or Wh per query vs interactivity',
      power: 'Watts per GPU vs interactivity',
      breakdown: 'GPU, server and facility at Compare at',
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
    pinned: (by: string, what: string) => `Set by ${by}: ${what}.`,
    picksReturn: 'Your picks return on All GPUs.',
  },
  zh: {
    title: 'PowerX 功耗',
    subtitle: '每个基准测试点的实测 GPU 功耗与能耗',
    context: '基准测试上下文',
    role: POWERX_VOCAB.zh.role,
    roles: POWERX_VOCAB.zh.roles,
    rolesShort: POWERX_VOCAB.zh.rolesShort,
    roleHints: {
      all: '部署中的全部 GPU',
      prefill: '处理提示词的 GPU',
      decode: '生成 token 的 GPU',
      split: '两个池并排对比',
    } satisfies Record<PowerXRole, string>,
    roleNoData: '该模型没有预填充/解码数据',
    model: '模型',
    scenario: '场景',
    precision: '精度',
    precisionNote: '唯一有功耗数据的精度',
    compareAtAxis: 'tok/s/user · P90 交互性',
    compareAt: POWERX_VOCAB.zh.compareAt,
    compareAtHelp:
      '所有标签页读取的交互性：排名、功耗构成条形图与随时间变化曲线都取最接近该值的数据点。',
    tokPerUser: 'tok/s/user',
    tokShort: 'tok/s',
    presets: '预设',
    custom: '自定义',
    run: '运行',
    latest: '最新',
    history: '历史',
    compareHistory: '跨日期对比',
    views: 'PowerX 视图',
    tabs: POWERX_VOCAB.zh.tabs,
    tabsShort: POWERX_VOCAB.zh.tabsShort,
    tabHints: {
      energy: '每 Token 焦耳数或每次查询 Wh vs 交互性',
      power: '每 GPU 瓦数 vs 交互性',
      breakdown: '对比点处的 GPU、服务器与数据中心功耗',
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
    setBy: zhSetBy,
    pinned: (by: string, what: string) => `${zhSetBy(by)}：${what}。`,
    picksReturn: '切回“全部 GPU”后恢复你的选择。',
  },
} as const;

export function usePowerXShellStrings() {
  return STRINGS[useLocale()];
}

/** A bottom sheet on phones: the shared dialog pinned to the bottom edge. */
export const POWERX_SHEET_CLASS =
  'top-auto bottom-0 left-0 flex max-h-[85dvh] max-w-none translate-x-0 translate-y-0 flex-col gap-0 overflow-hidden rounded-b-none rounded-t-xl p-0 data-[state=closed]:slide-out-to-left-0 data-[state=closed]:slide-out-to-top-0 data-[state=open]:slide-in-from-left-0 data-[state=open]:slide-in-from-top-0 data-[state=closed]:zoom-out-100 data-[state=open]:zoom-in-100';

/**
 * One phone bottom sheet: a grab bar, a title that stays put (with the dialog's close
 * button beside it) and a body that scrolls under it. Settings and More share it.
 */
export function PowerXSheet({
  open,
  onOpenChange,
  title,
  testId,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  testId: string;
  children: ReactNode;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={POWERX_SHEET_CLASS} data-testid={testId}>
        <span aria-hidden className="mx-auto mt-2 h-1 w-9 shrink-0 rounded-full bg-border" />
        <DialogTitle className="shrink-0 border-b border-border/60 px-4 pt-2 pb-3 pr-14 text-base">
          {title}
        </DialogTitle>
        <div
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))]"
          data-testid={`${testId}-body`}
        >
          {children}
        </div>
      </DialogContent>
    </Dialog>
  );
}

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
  const sheet = source === 'sheet';
  return (
    <div className="flex flex-col gap-3" data-testid="powerx-compare-at-picker">
      {sheet && (
        <p className="flex items-baseline gap-2" data-testid="powerx-compare-at-value">
          <span className="text-xl font-semibold tabular-nums">{value}</span>
          <span className="text-xs text-muted-foreground">{t.compareAtAxis}</span>
        </p>
      )}
      <div
        className={cn(sheet ? 'grid grid-cols-4 gap-1' : 'flex flex-wrap gap-1')}
        role="group"
        aria-label={t.presets}
      >
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
        {!sheet && (
          <span className="w-24 shrink-0 text-right tabular-nums">
            {value} {t.tokShort}
          </span>
        )}
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
      {runContext}
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
// Phone settings sheet

/** A labelled group of the settings sheet, ruled off from the one above. */
function SheetGroup({
  label,
  children,
  testId,
}: {
  /** Omitted when the group's content carries its own legend. */
  label?: string;
  children: ReactNode;
  testId?: string;
}) {
  return (
    <section
      className="flex flex-col gap-1 border-b border-border/60 py-3 first:pt-0 last:border-b-0"
      data-testid={testId}
    >
      {label && <h3 className="text-xs text-muted-foreground">{label}</h3>}
      {children}
    </section>
  );
}

/** One radio row of the sheet: a check column, the label (and a hint), then a trailing badge. */
function SheetRadio({
  checked,
  onSelect,
  children,
  hint,
  icon,
  trailing,
  testId,
}: {
  checked: boolean;
  onSelect: () => void;
  children: ReactNode;
  hint?: ReactNode;
  icon?: ReactNode;
  trailing?: ReactNode;
  testId?: string;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={checked}
      data-testid={testId}
      onClick={() => {
        if (!checked) onSelect();
      }}
      className="flex min-h-9 w-full cursor-pointer items-center gap-2 rounded-sm px-1 py-1 text-left text-sm transition-colors hover:bg-muted"
    >
      <span className="inline-flex w-4 shrink-0 justify-center text-brand">
        {checked && <Check aria-hidden className="size-4" />}
      </span>
      {icon}
      <span className="flex min-w-0 flex-1 flex-col">
        <span className={cn('truncate', checked && 'font-semibold')}>{children}</span>
        {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
      </span>
      {trailing}
    </button>
  );
}

/** The line style a role draws with: solid for all GPUs, dashed prefill, dotted decode. */
function RoleGlyph({ role }: { role: PowerXRole }) {
  if (role === 'split') {
    return (
      <span aria-hidden className="inline-flex w-5 shrink-0 items-center gap-0.5">
        <span className="h-2 w-2 rounded-xs bg-powerx-prefill" />
        <span className="h-2 w-2 rounded-xs bg-powerx-decode" />
      </span>
    );
  }
  return (
    <span aria-hidden className="inline-flex w-5 shrink-0 items-center">
      <span
        className={cn(
          'w-full border-t-2 border-foreground',
          role === 'prefill' && 'border-dashed',
          role === 'decode' && 'border-dotted',
        )}
      />
    </span>
  );
}

/**
 * The phone "View settings" sheet: model, scenario, precision, GPU role, Compare at, run
 * and the page actions. Every pick applies at once and the sheet stays open, so the reader
 * can change several things and watch the summary line follow.
 */
function PowerXSettingsSheetBody({
  parts,
  role,
  onRoleChange,
  runContext,
  sheetActions,
  scenarioLabel,
  compareAtRange,
}: {
  parts: PowerXStripParts;
  role: PowerXRole;
  onRoleChange: (role: PowerXRole) => void;
  runContext?: ReactNode;
  sheetActions?: ReactNode;
  scenarioLabel: string;
  compareAtRange?: readonly [number, number];
}) {
  const t = usePowerXShellStrings();
  const locale = useLocale();
  const analyticsContext = useInferenceAnalyticsContext();
  const hasRoleData = parts.modelBadges?.has(parts.selectedModel) ?? true;
  return (
    <div className="flex flex-col" data-testid="powerx-settings-sheet-content">
      <SheetGroup label={t.model} testId="powerx-sheet-models">
        <div role="radiogroup" aria-label={t.model} className="flex flex-col">
          {parts.models.map((model) => (
            <SheetRadio
              key={model}
              checked={model === parts.selectedModel}
              onSelect={() => parts.onModelChange(model as Model)}
              trailing={parts.modelBadges?.get(model)}
              testId={`powerx-sheet-model-${model}`}
            >
              {getModelLabel(model as Model)}
            </SheetRadio>
          ))}
        </div>
      </SheetGroup>
      <SheetGroup label={t.scenario}>
        {parts.scenarios.length > 1 ? (
          <PowerXSeg<string>
            value={parts.selectedScenario}
            ariaLabel={t.scenario}
            testId="powerx-sheet-scenario"
            className="flex-wrap"
            onValueChange={(next) => parts.onScenarioChange(next as Sequence)}
            options={parts.scenarios.map((scenario) => ({
              value: scenario,
              label: getSequenceLabel(scenario as Sequence, locale),
            }))}
          />
        ) : (
          <p className="py-1 text-sm">{scenarioLabel}</p>
        )}
      </SheetGroup>
      {parts.precision && (
        <SheetGroup label={t.precision}>
          <p className="py-1 text-sm" data-testid="powerx-precision">
            {parts.precision}
            {!parts.precision.includes(',') && (
              <span className="text-xs text-muted-foreground"> · {t.precisionNote}</span>
            )}
          </p>
        </SheetGroup>
      )}
      <SheetGroup label={t.role}>
        <div
          role="radiogroup"
          aria-label={t.role}
          className="flex flex-col"
          data-testid="powerx-role-toggle"
        >
          {POWERX_ROLES.map((value) => (
            <SheetRadio
              key={value}
              checked={value === role}
              icon={<RoleGlyph role={value} />}
              hint={
                value !== 'all' && !hasRoleData
                  ? `${t.roleHints[value]} · ${t.roleNoData}`
                  : t.roleHints[value]
              }
              testId={`powerx-role-${value}`}
              onSelect={() => {
                track('powerx_role_changed', {
                  ...analyticsContext,
                  role: value,
                  previous_role: role,
                  source: 'sheet',
                });
                onRoleChange(value);
              }}
            >
              {t.roles[value]}
            </SheetRadio>
          ))}
        </div>
      </SheetGroup>
      <SheetGroup label={t.compareAt}>
        <PowerXCompareAtPicker range={compareAtRange} source="sheet" />
      </SheetGroup>
      <SheetGroup label={runContext ? undefined : t.run}>
        <RunPanel runContext={runContext} parts={parts} />
      </SheetGroup>
      {sheetActions && (
        <div className="flex items-center justify-between gap-2 pt-3">{sheetActions}</div>
      )}
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
          aria-expanded={sheetOpen}
          aria-label={t.openSettings}
          data-testid="powerx-context-summary"
          onClick={() => {
            setSheetOpen(true);
            track('powerx_settings_sheet_opened', { role });
          }}
          className="flex h-12 w-full cursor-pointer items-center gap-1.5 text-left text-sm"
        >
          <span className="min-w-0 flex-1 truncate">
            <span className="font-semibold">{modelLabel}</span>
            {' · '}
            {scenarioLabel}
            {parts.precision && ` · ${parts.precision}`}
            {' · '}
            {t.rolesShort[role]}
          </span>
          <span aria-hidden className="shrink-0 text-muted-foreground">
            ·
          </span>
          <CompareAtMark />
          <span className="shrink-0 tabular-nums">
            {at} {t.tokShort}
          </span>
          <ChevronDown aria-hidden className="size-4 shrink-0 text-muted-foreground" />
        </button>
        <PowerXSheet
          open={sheetOpen}
          onOpenChange={setSheetOpen}
          title={t.settings}
          testId="powerx-settings-sheet"
        >
          <PowerXSettingsSheetBody
            parts={parts}
            role={role}
            onRoleChange={onRoleChange}
            runContext={runContext}
            sheetActions={sheetActions}
            scenarioLabel={scenarioLabel}
            compareAtRange={compareAtRange}
          />
        </PowerXSheet>
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
              track('inference_powerx_tab_selected', {
                ...analyticsContext,
                tab: POWERX_VIEW_ANALYTICS_ID[value],
              });
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
    if (next) track('powerx_more_opened', { tab: POWERX_VIEW_ANALYTICS_ID[tab], changed });
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
      {/* Below md the toolbar has no room for the word: the icon stays, the name is read out. */}
      <span className="max-md:sr-only">{t.more}</span>
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
            track('powerx_more_reset', { tab: POWERX_VIEW_ANALYTICS_ID[tab], changed });
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
        <PowerXSheet
          open={open}
          onOpenChange={onOpenChange}
          title={t.moreTitle(t.tabs[tab])}
          testId="powerx-more-sheet"
        >
          {body}
        </PowerXSheet>
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
      <div
        className="flex min-w-0 flex-1 items-center gap-6 overflow-x-auto [scrollbar-width:none] max-md:gap-1"
        data-testid="powerx-toolbar-options"
      >
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
        {t.pinned(pin.by, pin.what)} <span className="text-muted-foreground">{t.picksReturn}</span>
      </span>
      <span className="whitespace-nowrap max-[430px]:sr-only md:hidden">{t.setBy(pin.by)}</span>
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
      <div className="flex min-w-0 flex-1 items-center gap-4 overflow-hidden">
        {typeof title === 'string' ? (
          <span className="min-w-0 truncate" title={title}>
            {title}
          </span>
        ) : (
          title
        )}
      </div>
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
