'use client';

import { SegmentedToggle } from '@/components/ui/segmented-toggle';
import { track } from '@/lib/analytics/analytics';
import { useLocale } from '@/lib/i18n/use-locale';
import { POWER_COUNT_LABELS } from '@/lib/power/power-basis';
import { getMeasuredMetricConfig } from '../measured-metric-config';
import type { PowerCompare } from '../types';
import { powerCompareAvailable } from '../utils/power-compare';
import { MeasuredMetricControls, type MeasuredMetricField } from './MeasuredMetricControls';

/** The four questions PowerX answers; each maps onto existing metric + compare state. */
export type PowerXTab = 'draw' | 'energy' | 'time' | 'where';
const TABS = ['draw', 'energy', 'time', 'where'] as const satisfies readonly PowerXTab[];
type Boundary = 'gpu' | 'system';
type EnergyCount = Boundary | 'both';
/** What one unit of energy is charged to on the Energy tab. */
export type EnergyPer = 'output' | 'input' | 'total' | 'query';

/** GPU-measured metric behind each Energy-tab unit. Only output tokens have a whole-system basis. */
const ENERGY_PER_METRIC: Record<EnergyPer, string> = {
  output: 'y_measuredJPerOutputToken',
  input: 'y_measuredJPerInputToken',
  total: 'y_measuredJPerTotalToken',
  query: 'y_measuredWhPerSuccessfulQuery',
};

export function energyPerFor(metric: string): EnergyPer {
  if (metric.endsWith('JPerInputToken')) return 'input';
  if (metric.endsWith('JPerTotalToken')) return 'total';
  if (metric.endsWith('PerSuccessfulQuery')) return 'query';
  return 'output';
}

const STRINGS = {
  en: {
    tabsLabel: 'PowerX question',
    tabs: {
      draw: 'Power draw',
      energy: 'Energy per token',
      time: 'Over time',
      where: 'Where the power goes',
    },
    hints: {
      draw: 'Watts per chip vs interactivity',
      energy: 'Joules per token, Wh per query',
      time: 'Power trace through a run',
      where: 'GPU, server and facility',
    },
    boundaryLabel: 'Count',
    systemHelp: 'GPU measured, rest of server and PUE modeled',
    both: 'Both',
    bothHelp: 'GPU only and whole system on one chart',
    perLabel: 'Per',
    per: { output: 'Output token', input: 'Input token', total: 'All tokens', query: 'Query' },
    systemOutputOnly: 'Whole system is modeled per output token only',
    unitLabel: 'Show as',
    watts: 'W per chip',
    tdp: '% of TDP',
    compareLabel: 'Split by',
    boundaries: 'Boundary',
    roles: 'Prefill vs decode',
    rolesUnavailable: 'Needs disaggregated prefill/decode results',
    rolesNoData: 'No validated prefill/decode telemetry for this model and scenario',
  },
  zh: {
    tabsLabel: 'PowerX 问题',
    tabs: {
      draw: '功耗',
      energy: '每 Token 能耗',
      time: '随时间变化',
      where: '功耗去向',
    },
    hints: {
      draw: '每芯片瓦数 vs 交互性',
      energy: '每 Token 焦耳数，每次查询 Wh',
      time: '运行期间的功耗曲线',
      where: 'GPU、服务器与数据中心',
    },
    boundaryLabel: '统计范围',
    systemHelp: 'GPU 为实测，服务器其他组件与 PUE 为模型估算',
    both: '两者对比',
    bothHelp: '在同一图中对比仅 GPU 与整体系统',
    perLabel: '计量单位',
    per: {
      output: '输出 Token',
      input: '输入 Token',
      total: '全部 Token',
      query: '每次查询',
    },
    systemOutputOnly: '整体系统仅按输出 Token 建模',
    unitLabel: '显示为',
    watts: '每芯片 W',
    tdp: 'TDP 占比',
    compareLabel: '拆分方式',
    boundaries: '功耗边界',
    roles: '预填充 vs 解码',
    rolesUnavailable: '需要预填充/解码分离部署的结果',
    rolesNoData: '该模型与场景暂无经过验证的预填充/解码遥测数据',
  },
} as const;

/** Metric keys behind each tab/boundary pair. */
const TAB_METRICS: Record<Exclude<PowerXTab, 'time'>, Record<Boundary, string>> = {
  draw: { gpu: 'y_measuredAvgPower', system: 'y_utilityModeledWatts' },
  energy: { gpu: 'y_measuredJPerOutputToken', system: 'y_utilityModeledJPerOutputToken' },
  where: { gpu: 'y_measuredAvgPower', system: 'y_measuredAvgPower' },
};

export function powerXTabFor(metric: string, compare: PowerCompare): PowerXTab | null {
  const config = getMeasuredMetricConfig(metric);
  if (!config) return null;
  // Overlaying both boundaries of an energy metric stays on the Energy tab.
  if ((compare === 'boundaries' || compare === 'all') && config.family === 'energy')
    return 'energy';
  if (compare !== 'none') return 'where';
  if (config.family === 'energy') return 'energy';
  return config.display === 'timeline' ? 'time' : 'draw';
}

/**
 * Which of the legacy measured-metric controls still mean something on a tab:
 * Scope (All / Prefill / Decode GPUs) for GPU-only power and for per-token
 * energy, plus the Power statistic (Average / P75 / P90) for power. Timelines,
 * comparisons and the modeled whole system are defined for the all-GPU average only.
 */
export function powerXMetricFields(
  metric: string,
  compare: PowerCompare,
): readonly MeasuredMetricField[] {
  const config = getMeasuredMetricConfig(metric);
  const tab = powerXTabFor(metric, compare);
  if (!config || !tab || compare !== 'none' || config.basis !== 'gpu-measured') return [];
  if (tab === 'draw') return ['scope', 'statistic'];
  if (
    config.family === 'energy' &&
    tab === 'energy' &&
    (config.denominator === 'input' || config.denominator === 'output')
  )
    return ['scope'];
  return [];
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col items-start gap-1.5">
      <span className="text-sm font-medium text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}

export function PowerXTabs({
  metric,
  onChange,
  compare,
  onCompareChange,
  rolesHaveData,
}: {
  metric: string;
  onChange: (metric: string) => void;
  compare: PowerCompare;
  onCompareChange: (mode: PowerCompare) => void;
  /** False when the loaded results carry no prefill/decode telemetry; undefined while unknown. */
  rolesHaveData?: boolean;
}) {
  const locale = useLocale();
  const t = STRINGS[locale];
  const config = getMeasuredMetricConfig(metric);
  const tab = powerXTabFor(metric, compare);
  if (!config || !tab) return null;

  const boundary: Boundary = config.basis === 'gpu-measured' ? 'gpu' : 'system';
  const selectTab = (next: PowerXTab) => {
    if (next === tab) return;
    track('inference_powerx_tab_selected', { tab: next });
    if (next === 'time') {
      onCompareChange('none');
      onChange('y_measuredPowerTimeline');
      return;
    }
    onChange(TAB_METRICS[next][next === 'where' ? 'gpu' : boundary]);
    onCompareChange(next === 'where' ? 'boundaries' : 'none');
  };
  const energyPer = energyPerFor(metric);
  const count: EnergyCount = compare === 'boundaries' || compare === 'all' ? 'both' : boundary;
  const selectBoundary = (next: EnergyCount) => {
    track('inference_powerx_boundary_selected', { boundary: next });
    if (next === 'both') {
      if (metric !== ENERGY_PER_METRIC.output) onChange(ENERGY_PER_METRIC.output);
      onCompareChange('boundaries');
      return;
    }
    if (compare !== 'none') onCompareChange('none');
    if (tab === 'draw') onChange(TAB_METRICS.draw[next]);
    if (tab === 'energy')
      onChange(next === 'system' ? TAB_METRICS.energy.system : ENERGY_PER_METRIC[energyPer]);
  };
  const selectPer = (next: EnergyPer) => {
    track('inference_powerx_energy_per_selected', { per: next });
    if (next === energyPer) return;
    // Only output tokens have a modeled whole-system basis.
    if (next !== 'output' && compare !== 'none') onCompareChange('none');
    onChange(
      next === 'output' && boundary === 'system'
        ? TAB_METRICS.energy.system
        : ENERGY_PER_METRIC[next],
    );
  };
  const rolesSupported = powerCompareAvailable('y_measuredAvgPower', 'roles');
  const rolesAvailable = rolesSupported && rolesHaveData !== false;
  const rolesReason = rolesSupported ? t.rolesNoData : t.rolesUnavailable;
  const metricFields = powerXMetricFields(metric, compare);

  return (
    <div className="col-span-full flex min-w-0 flex-col gap-3" data-testid="powerx-tabs">
      <SegmentedToggle<PowerXTab>
        value={tab}
        onValueChange={selectTab}
        ariaLabel={t.tabsLabel}
        size="default"
        className="w-full"
        // Two per row on phones, one row from sm up; the hint lives in the title.
        buttonClassName="flex-1 basis-[calc(50%-0.125rem)] justify-center whitespace-nowrap px-3 sm:basis-auto"
        activeButtonClassName="bg-background text-foreground shadow-sm"
        options={TABS.map((value) => ({
          value,
          label: t.tabs[value],
          title: t.hints[value],
          testId: `powerx-tab-${value}`,
        }))}
      />

      {(tab === 'draw' || tab === 'energy') && (
        <div className="flex flex-wrap items-end gap-4">
          <Field label={t.boundaryLabel}>
            <SegmentedToggle<EnergyCount>
              value={tab === 'energy' ? count : boundary}
              onValueChange={selectBoundary}
              ariaLabel={t.boundaryLabel}
              role="group"
              testId="powerx-boundary"
              options={[
                { value: 'gpu', label: POWER_COUNT_LABELS['gpu-measured'][locale] },
                {
                  value: 'system',
                  label: POWER_COUNT_LABELS['utility-modeled'][locale],
                  title:
                    tab === 'energy' && energyPer !== 'output' ? t.systemOutputOnly : t.systemHelp,
                  disabled: tab === 'energy' && energyPer !== 'output',
                },
                ...(tab === 'energy'
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
          {tab === 'energy' && (
            <Field label={t.perLabel}>
              <SegmentedToggle<EnergyPer>
                value={energyPer}
                onValueChange={selectPer}
                ariaLabel={t.perLabel}
                role="group"
                testId="powerx-energy-per"
                className="max-w-full flex-nowrap overflow-x-auto"
                buttonClassName="whitespace-nowrap"
                options={(['output', 'input', 'total', 'query'] as const).map((value) => ({
                  value,
                  label: t.per[value],
                }))}
              />
            </Field>
          )}
          {tab === 'draw' && (
            <Field label={t.unitLabel}>
              <SegmentedToggle<'watts' | 'tdp'>
                value={config.family === 'power' && config.display === 'tdp' ? 'tdp' : 'watts'}
                onValueChange={(value) =>
                  onChange(value === 'tdp' ? 'y_measuredPowerPercentTdp' : TAB_METRICS.draw.gpu)
                }
                ariaLabel={t.unitLabel}
                role="group"
                testId="powerx-unit"
                options={[
                  { value: 'watts', label: t.watts },
                  // % TDP is a GPU-only reading; TDP does not bound whole-system power.
                  { value: 'tdp', label: t.tdp, disabled: boundary === 'system' },
                ]}
              />
            </Field>
          )}
        </div>
      )}

      {tab === 'where' && (
        <Field label={t.compareLabel}>
          <SegmentedToggle<'boundaries' | 'roles'>
            value={compare === 'roles' ? 'roles' : 'boundaries'}
            onValueChange={(value) => onCompareChange(value)}
            ariaLabel={t.compareLabel}
            role="group"
            testId="powerx-split"
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
      )}

      {metricFields.length > 0 && (
        <MeasuredMetricControls
          metric={metric}
          onChange={onChange}
          fields={metricFields}
          className={
            metricFields.length > 1
              ? 'max-w-xl grid-cols-[repeat(auto-fit,minmax(min(100%,10rem),1fr))]'
              : 'max-w-xs'
          }
        />
      )}
    </div>
  );
}
