'use client';

import { ChevronDown, Lock } from 'lucide-react';

import {
  useInferenceActions,
  useInferenceAnalyticsContext,
  useInferenceDisplay,
} from '@/components/inference/InferenceContext';
import {
  changeMeasuredMetricConfig,
  getMeasuredMetricConfig,
} from '@/components/inference/measured-metric-config';
import { XAxisModeSelector } from '@/components/inference/ui/XAxisModeSelector';
import { Switch } from '@/components/ui/switch';
import { useIsMobileViewport } from '@/hooks/useMediaQuery';
import { track } from '@/lib/analytics/analytics';
import { useLocale } from '@/lib/i18n/use-locale';
import { cn } from '@/lib/shared/utils';

import {
  PowerXMore,
  PowerXMoreGroup,
  PowerXSeg,
  PowerXToolbarOption,
  type PowerXPin,
  type PowerXSegOption,
} from './PowerXShell';
import {
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
  type EnergyPer,
  type PowerXCount,
  type PowerXSelection,
  type PowerXShowAs,
} from './powerx-views';

type Statistic = 'average' | 'p75' | 'p90';

const STRINGS = {
  en: {
    boundary: POWERX_VOCAB.en.boundary,
    boundaries: POWERX_VOCAB.en.boundaries,
    boundaryHints: {
      gpu: 'Measured GPU board power',
      it: 'GPU measured; CPU, server parts, fans/PSU and network share modeled. No PUE.',
      system: 'IT × PUE: GPU measured, rest of server and the facility overhead modeled',
      both: 'GPU (solid), IT (dashed) and Facility (dash-dot) per GPU on one chart',
    } satisfies Record<PowerXCount, string>,
    systemTokensOnly: 'IT and Facility are available for All tokens and Output only',
    energyPer: POWERX_VOCAB.en.energyPer,
    pers: POWERX_VOCAB.en.pers,
    showAs: 'Show as',
    showAsOptions: { watts: POWERX_VOCAB.en.wPerGpu, tdp: '% of TDP' } satisfies Record<PowerXShowAs, string>,
    showAsShort: { watts: 'W/GPU', tdp: '% TDP' } satisfies Record<PowerXShowAs, string>,
    tdpGpuOnly: 'TDP bounds GPU power only',
    statistic: 'Statistic',
    statistics: { average: 'Avg', p75: 'P75', p90: 'P90' } satisfies Record<Statistic, string>,
    xAxis: 'X axis',
    chart: 'Chart',
    logScale: 'Log scale',
    parallelismLabels: 'Parallelism labels',
    gradientLabels: 'Gradient labels',
    provisioned: POWERX_VOCAB.en.provisioned,
    provisionedHelp: 'Adds a dashed all-in provisioned bound per GPU beside the measured GPU line.',
    provisionedPinned: 'Off under a GPU role: the all-in provisioned bound is per deployment.',
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
  },
  zh: {
    boundary: POWERX_VOCAB.zh.boundary,
    boundaries: POWERX_VOCAB.zh.boundaries,
    boundaryHints: {
      gpu: '实测 GPU 板卡功耗',
      it: 'GPU 为实测；CPU、服务器部件、风扇/电源与网络分摊为模型估算。不含 PUE。',
      system: 'IT × PUE：GPU 为实测，服务器其他组件与数据中心开销为模型估算',
      both: '在同一图中按 GPU 对比 GPU（实线）、IT（虚线）与数据中心（点划线）',
    } satisfies Record<PowerXCount, string>,
    systemTokensOnly: 'IT 与数据中心能耗仅支持“全部 Token”和“输出”',
    energyPer: POWERX_VOCAB.zh.energyPer,
    pers: POWERX_VOCAB.zh.pers,
    showAs: '显示为',
    showAsOptions: { watts: POWERX_VOCAB.zh.wPerGpu, tdp: 'TDP 占比' } satisfies Record<PowerXShowAs, string>,
    showAsShort: { watts: 'W/GPU', tdp: 'TDP %' } satisfies Record<PowerXShowAs, string>,
    tdpGpuOnly: 'TDP 仅限定 GPU 功耗',
    statistic: '统计量',
    statistics: { average: '平均', p75: 'P75', p90: 'P90' } satisfies Record<Statistic, string>,
    xAxis: 'X 轴',
    chart: '图表',
    logScale: '对数刻度',
    parallelismLabels: '并行策略标签',
    gradientLabels: '渐变标签',
    provisioned: POWERX_VOCAB.zh.provisioned,
    provisionedHelp: '在实测 GPU 曲线旁为每块 GPU 增加一条虚线表示的整体预配上限。',
    provisionedPinned: '选择 GPU 角色时关闭：整体预配上限按整个部署计算。',
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
      count: `${POWERX_VOCAB.zh.boundary} ${POWERX_VOCAB.zh.boundaries.gpu}`,
      per: `${POWERX_VOCAB.zh.energyPer} ${POWERX_VOCAB.zh.pers.output}`,
      perPrefill: `${POWERX_VOCAB.zh.energyPer} ${POWERX_VOCAB.zh.pers.output}或${POWERX_VOCAB.zh.pers.input}`,
      statistic: '统计量 平均',
    },
  },
} as const;

/** The pin line for a tab under a GPU role: who set what, and why (behind "Why?"). */
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

/** A quiet native select: the phone form of a toolbar option. */
function PhoneOption<T extends string>({
  value,
  options,
  onValueChange,
  ariaLabel,
  testId,
  locked,
}: {
  value: T;
  options: readonly PowerXSegOption<T>[];
  onValueChange: (value: T) => void;
  ariaLabel: string;
  testId?: string;
  locked?: boolean;
}) {
  const current = options.find((option) => option.value === value);
  return (
    <label
      className={cn(
        'relative inline-flex h-11 shrink-0 items-center gap-1 rounded-md px-2 text-sm whitespace-nowrap',
        locked ? 'outline-1 -outline-offset-1 outline-border outline-dashed' : 'hover:bg-muted',
      )}
      data-testid={testId}
      data-locked={locked ? '' : undefined}
    >
      {locked && <Lock aria-hidden className="size-3.5 text-muted-foreground" />}
      <span>{typeof current?.label === 'string' ? current.label : value}</span>
      <ChevronDown aria-hidden className="size-3.5 text-muted-foreground" />
      <select
        aria-label={ariaLabel}
        value={value}
        disabled={locked}
        onChange={(event) => onValueChange(event.target.value as T)}
        className="absolute inset-0 cursor-pointer opacity-0"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value} disabled={option.disabled}>
            {typeof option.label === 'string' ? option.label : option.value}
          </option>
        ))}
      </select>
    </label>
  );
}

function ToolbarSeg<T extends string>(props: {
  label: string;
  value: T;
  options: readonly PowerXSegOption<T>[];
  onValueChange: (value: T) => void;
  testId: string;
  locked?: boolean;
  lockTitle?: string;
  phoneOptions?: readonly PowerXSegOption<T>[];
}) {
  const phone = useIsMobileViewport();
  if (phone) {
    return (
      <PhoneOption
        value={props.value}
        options={props.phoneOptions ?? props.options}
        onValueChange={props.onValueChange}
        ariaLabel={props.label}
        testId={props.testId}
        locked={props.locked}
      />
    );
  }
  return (
    <PowerXToolbarOption label={props.label}>
      <PowerXSeg<T>
        value={props.value}
        options={props.options}
        onValueChange={props.onValueChange}
        ariaLabel={props.label}
        testId={props.testId}
        locked={props.locked}
        lockTitle={props.lockTitle}
      />
    </PowerXToolbarOption>
  );
}

/**
 * The Energy per token and Power draw options. `selection` is the stored choice; under a
 * GPU role the pinned values show (locked) and the pin line says why. Picking an option a
 * role allows still writes through to the stored choice.
 */
export function PowerXEnergyPowerOptions({
  selection,
  onSelectionChange,
  role,
}: {
  selection: PowerXSelection;
  onSelectionChange: (next: PowerXSelection) => void;
  role: PowerXRole;
}) {
  const locale = useLocale();
  const t = STRINGS[locale];
  const analyticsContext = useInferenceAnalyticsContext();
  const view = powerXViewFor(selection.metric, selection.compare);
  if (view !== 'energy' && view !== 'draw') return null;
  const pinned = powerXPinnedControls(view, role);
  const effective = resolvePowerXRole(selection, role);
  const countLocked = pinned.includes('count');
  const count: PowerXCount = countLocked
    ? 'gpu'
    : powerXCountFor(selection.metric, selection.compare);
  const energyPer = energyPerFor(effective.metric);
  const modeledDisabled = view === 'energy' && !energyPerHasBoundaries(energyPer);
  const boundaryOptions = (['gpu', 'it', 'system', 'both'] as const)
    .filter((value) => !countLocked || value === 'gpu')
    .map((value) => ({
      value,
      label: t.boundaries[value],
      title: value !== 'gpu' && modeledDisabled ? t.systemTokensOnly : t.boundaryHints[value],
      disabled: value !== 'gpu' && modeledDisabled,
      testId: `powerx-boundary-${value}`,
    }));
  const boundary = (
    <ToolbarSeg<PowerXCount>
      label={t.boundary}
      value={count}
      testId="powerx-boundary"
      locked={countLocked}
      lockTitle={t.reasons.count}
      options={boundaryOptions}
      onValueChange={(next) => {
        track('inference_powerx_boundary_selected', { ...analyticsContext, boundary: next });
        onSelectionChange(selectPowerXCount(next, selection));
      }}
    />
  );
  if (view === 'energy') {
    const rolePers = powerXRoleEnergyPers(role);
    const perLocked = pinned.includes('per');
    const perOptions = (['total', 'output', 'input', 'query'] as const)
      .filter((value) => role === 'all' || rolePers.includes(value as 'output' | 'input'))
      .map((value) => ({
        value,
        label: t.pers[value],
        testId: `powerx-energy-per-${value}`,
      }));
    return (
      <>
        {boundary}
        <ToolbarSeg<EnergyPer>
          label={t.energyPer}
          value={energyPer}
          testId="powerx-energy-per"
          locked={perLocked}
          lockTitle={t.reasons.per}
          options={perOptions}
          onValueChange={(next) => {
            track('inference_powerx_energy_per_selected', { ...analyticsContext, per: next });
            onSelectionChange(selectPowerXPer(next, selection));
          }}
        />
      </>
    );
  }
  const showAs = powerXShowAsFor(effective.metric);
  const config = getMeasuredMetricConfig(effective.metric);
  const statisticLocked = pinned.includes('statistic');
  const statistic: Statistic =
    statisticLocked || config?.family !== 'power'
      ? 'average'
      : ((config.statistic as Statistic | undefined) ?? 'average');
  const statisticAvailable =
    statisticLocked ||
    powerXMetricFields(selection.metric, selection.compare).includes('statistic');
  return (
    <>
      {boundary}
      <ToolbarSeg<PowerXShowAs>
        label={t.showAs}
        value={showAs}
        testId="powerx-unit"
        options={(['watts', 'tdp'] as const).map((value) => ({
          value,
          label: t.showAsOptions[value],
          title: value === 'tdp' && count !== 'gpu' ? t.tdpGpuOnly : undefined,
          disabled: value === 'tdp' && count !== 'gpu',
          testId: `powerx-unit-${value}`,
        }))}
        phoneOptions={(['watts', 'tdp'] as const).map((value) => ({
          value,
          label: t.showAsShort[value],
          disabled: value === 'tdp' && count !== 'gpu',
        }))}
        onValueChange={(next) =>
          onSelectionChange({ metric: selectPowerXShowAs(next), compare: 'none' })
        }
      />
      {statisticAvailable && (
        <ToolbarSeg<Statistic>
          label={t.statistic}
          value={statistic}
          testId="powerx-statistic"
          locked={statisticLocked}
          lockTitle={t.reasons.statistic}
          options={(['average', 'p75', 'p90'] as const)
            .filter((value) => !statisticLocked || value === 'average')
            .map((value) => ({
              value,
              label: t.statistics[value],
              testId: `measured-power-statistic-${value}`,
            }))}
          onValueChange={(next) => {
            const metric = changeMeasuredMetricConfig(selection.metric, { statistic: next });
            track('inference_powerx_measured_metric_selected', {
              ...analyticsContext,
              metric,
              previous_metric: selection.metric,
            });
            onSelectionChange({ metric, compare: selection.compare });
          }}
        />
      )}
    </>
  );
}

/** More on Energy per token and Power draw: X axis and, on Energy, the provisioned bound. */
export function PowerXEnergyPowerMore({
  selection,
  onSelectionChange,
  role,
}: {
  selection: PowerXSelection;
  onSelectionChange: (next: PowerXSelection) => void;
  role: PowerXRole;
}) {
  const locale = useLocale();
  const t = STRINGS[locale];
  const {
    selectedXAxisMode,
    defaultXAxisMode,
    selectedYAxisMetric,
    logScale,
    useAdvancedLabels,
    showGradientLabels,
  } = useInferenceDisplay();
  const { setSelectedXAxisMode, setLogScale, setUseAdvancedLabels, setShowGradientLabels } =
    useInferenceActions();
  const view = powerXViewFor(selection.metric, selection.compare);
  if (view !== 'energy' && view !== 'draw') return null;
  const ratedPinned = powerXPinnedControls(view, role).includes('rated');
  const ratedAvailable = view === 'energy' && powerXRatedAvailable(selection.metric);
  const ratedOn = !ratedPinned && powerXRatedOn(selection.compare);
  const xChanged = selectedXAxisMode !== defaultXAxisMode;
  // The old legend's chart switches (the ranking replaced the legend); all default off.
  const logAvailable = selectedYAxisMetric !== 'y_inputTputPerGpu';
  const chartSwitches = [
    ...(logAvailable
      ? [
          {
            id: 'powerx-log-scale',
            label: t.logScale,
            checked: logScale,
            set: setLogScale,
            event: 'powerx_log_scale_toggled',
          },
        ]
      : []),
    {
      id: 'powerx-parallelism-labels',
      label: t.parallelismLabels,
      checked: useAdvancedLabels,
      set: setUseAdvancedLabels,
      event: 'powerx_parallelism_labels_toggled',
    },
    {
      id: 'powerx-gradient-labels',
      label: t.gradientLabels,
      checked: showGradientLabels,
      set: setShowGradientLabels,
      event: 'powerx_gradient_labels_toggled',
    },
  ];
  const changed =
    (xChanged ? 1 : 0) +
    (ratedAvailable && ratedOn ? 1 : 0) +
    chartSwitches.filter((item) => item.checked).length;
  return (
    <PowerXMore
      tab={view}
      changed={changed}
      onReset={() => {
        if (xChanged) setSelectedXAxisMode(defaultXAxisMode);
        if (ratedOn) onSelectionChange(selectPowerXRated(false, selection));
        for (const item of chartSwitches) if (item.checked) item.set(false);
      }}
    >
      <PowerXMoreGroup label={t.xAxis}>
        <XAxisModeSelector />
      </PowerXMoreGroup>
      <PowerXMoreGroup label={t.chart}>
        {chartSwitches.map((item) => (
          <label key={item.id} className="flex items-center justify-between gap-3 text-sm">
            <span>{item.label}</span>
            <Switch
              checked={item.checked}
              data-testid={item.id}
              onCheckedChange={(on) => {
                item.set(on);
                track(item.event, { enabled: on });
              }}
            />
          </label>
        ))}
      </PowerXMoreGroup>
      {ratedAvailable && (
        <PowerXMoreGroup label={t.provisioned}>
          <label className="flex items-center justify-between gap-3 text-sm">
            <span className={cn(ratedPinned && 'text-muted-foreground')}>
              {ratedPinned ? t.provisionedPinned : t.provisionedHelp}
            </span>
            <Switch
              checked={ratedOn}
              disabled={ratedPinned}
              data-testid="powerx-compare-boundaries"
              onCheckedChange={(on) => {
                track('inference_power_compare_changed', {
                  mode: on ? 'provisioned' : 'none',
                  family: 'powerx',
                });
                onSelectionChange(selectPowerXRated(on, selection));
              }}
            />
          </label>
        </PowerXMoreGroup>
      )}
    </PowerXMore>
  );
}
