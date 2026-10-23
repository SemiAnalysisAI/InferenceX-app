'use client';

import { useState } from 'react';

import { SegmentedToggle } from '@/components/ui/segmented-toggle';
import { track } from '@/lib/analytics/analytics';
import { useLocale } from '@/lib/i18n/use-locale';
import { getMeasuredMetricConfig } from '../measured-metric-config';
import type { PowerCompare } from '../types';
import { powerCompareAvailable } from '../utils/power-compare';
import { MeasuredMetricControls } from './MeasuredMetricControls';

/** The four questions PowerX answers; each maps onto existing metric + compare state. */
export type PowerXTab = 'draw' | 'energy' | 'time' | 'where';
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
    questions: {
      draw: 'How many watts does each chip draw at a given interactivity?',
      energy: 'How much energy does each token or query cost?',
      time: 'How does chip power move during a benchmark run?',
      where: 'How much do the GPU, the rest of the server and the facility each add?',
    },
    hints: {
      draw: 'Watts per chip vs interactivity',
      energy: 'Joules per token, Wh per query',
      time: 'Power trace through a run',
      where: 'GPU, server and facility',
    },
    boundaryLabel: 'Count',
    gpu: 'GPU only',
    system: 'Whole system',
    systemHelp: 'GPU measured, rest of server and PUE modeled',
    both: 'Both',
    bothHelp: 'GPU only and whole system on one chart',
    perLabel: 'Per',
    per: { output: 'Output token', input: 'Input token', total: 'All tokens', query: 'Query' },
    read: {
      draw: 'Each line is one chip. Right means faster for each user; lower means less power.',
      energy: 'Lower is better: less energy for the same work. Right means faster for each user.',
      time: 'One line per chip through a run at one concurrency. Pick a chip under Highlight to fade the others; the table below gives the validated averages.',
      where:
        'Pick an interactivity, compare the stacks, then click a chip to see it across load. Solid is measured, hatched is modeled.',
    },
    glossaryLabel: 'What do these terms mean?',
    glossary: [
      [
        'Interactivity',
        'Tokens per second each user sees. Higher feels faster; it drops as more users share the chips.',
      ],
      ['GPU only', 'Board power read from the GPU’s own telemetry during the benchmark. Measured.'],
      [
        'Whole system',
        'GPU power plus a modeled share of the rest of the server, fans and power-supply loss, the network and facility overhead (PUE). Shown as All in Measured.',
      ],
      ['TDP', 'The chip’s rated power limit. % of TDP shows how hard the chip is pushed.'],
      ['J per token', 'Energy divided by tokens served. Lower is more efficient.'],
      [
        'TP8 / DEP8',
        'How the model is split across the chips at that point (tensor or data + expert parallel).',
      ],
    ],
    systemOutputOnly: 'Whole system is modeled per output token only',
    unitLabel: 'Show as',
    watts: 'W per chip',
    tdp: '% of TDP',
    compareLabel: 'Split by',
    boundaries: 'Boundary',
    roles: 'Prefill vs decode',
    rolesUnavailable: 'Needs disaggregated prefill/decode results',
    advanced: 'Advanced settings',
  },
  zh: {
    tabsLabel: 'PowerX 问题',
    tabs: {
      draw: '功耗',
      energy: '每 Token 能耗',
      time: '随时间变化',
      where: '功耗去向',
    },
    questions: {
      draw: '在给定交互性下，每颗芯片消耗多少瓦？',
      energy: '每个 Token 或每次查询消耗多少能量？',
      time: '基准测试运行期间芯片功耗如何变化？',
      where: 'GPU、服务器其他组件和数据中心各自增加多少功耗？',
    },
    hints: {
      draw: '每芯片瓦数 vs 交互性',
      energy: '每 Token 焦耳数，每次查询 Wh',
      time: '运行期间的功耗曲线',
      where: 'GPU、服务器与数据中心',
    },
    boundaryLabel: '统计范围',
    gpu: '仅 GPU',
    system: '整体系统',
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
    read: {
      draw: '每条线代表一款芯片。越靠右，每个用户越快；越靠下，功耗越低。',
      energy: '越低越好：完成同样工作消耗的能量更少。越靠右，每个用户越快。',
      time: '每款芯片一条线，显示某个并发下整个运行期间的功耗。在“突出显示”中选择芯片可淡化其他曲线；下方表格给出验证窗口内的平均值。',
      where:
        '先选交互性，比较各芯片的堆叠，再点击某款芯片查看其随负载的变化。实心为实测，斜线为模型估算。',
    },
    glossaryLabel: '这些术语是什么意思？',
    glossary: [
      ['交互性', '每个用户看到的每秒 Token 数。越高越快；用户越多，交互性越低。'],
      ['仅 GPU', '基准测试期间从 GPU 自身遥测读取的板卡功耗，为实测值。'],
      [
        '整体系统',
        'GPU 功耗加上按模型估算的服务器其他组件、风扇与电源损耗、网络和数据中心开销（PUE）分摊，图中显示为「整体实测功耗」。',
      ],
      ['TDP', '芯片的额定功耗上限。TDP 占比表示芯片被压到多满。'],
      ['每 Token 焦耳数', '能耗除以服务的 Token 数，越低越高效。'],
      ['TP8 / DEP8', '该数据点上模型在芯片间的切分方式（张量并行，或数据加专家并行）。'],
    ],
    systemOutputOnly: '整体系统仅按输出 Token 建模',
    unitLabel: '显示为',
    watts: '每芯片 W',
    tdp: 'TDP 占比',
    compareLabel: '拆分方式',
    boundaries: '功耗边界',
    roles: '预填充 vs 解码',
    rolesUnavailable: '需要预填充/解码分离部署的结果',
    advanced: '高级设置',
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
  if (compare === 'boundaries' && config.family === 'energy') return 'energy';
  if (compare !== 'none') return 'where';
  if (config.family === 'energy') return 'energy';
  return config.display === 'timeline' ? 'time' : 'draw';
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
  layout = 'inline',
}: {
  metric: string;
  onChange: (metric: string) => void;
  compare: PowerCompare;
  onCompareChange: (mode: PowerCompare) => void;
  /** `page` renders the questions as the PowerX tab's primary sub-navigation. */
  layout?: 'inline' | 'page';
}) {
  const locale = useLocale();
  const t = STRINGS[locale];
  const config = getMeasuredMetricConfig(metric);
  const tab = powerXTabFor(metric, compare);
  const [advancedOpen, setAdvancedOpen] = useState(false);
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
  const count: EnergyCount = compare === 'boundaries' ? 'both' : boundary;
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
  const rolesAvailable = powerCompareAvailable('y_measuredAvgPower', 'roles');

  return (
    <div className="col-span-full flex min-w-0 flex-col gap-3" data-testid="powerx-tabs">
      {layout === 'page' ? (
        <div
          role="tablist"
          aria-label={t.tabsLabel}
          className="grid grid-cols-2 gap-2 sm:grid-cols-4"
        >
          {(['draw', 'energy', 'time', 'where'] as const).map((value) => {
            const active = value === tab;
            return (
              <button
                key={value}
                type="button"
                role="tab"
                aria-selected={active}
                data-testid={`powerx-tab-${value}`}
                onClick={() => selectTab(value)}
                className={`flex min-w-0 flex-col items-start gap-0.5 rounded-lg border px-3 py-2.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                  active
                    ? 'border-secondary bg-secondary/10 dark:border-primary dark:bg-primary/10'
                    : 'border-border hover:border-muted-foreground/40 hover:bg-muted/40'
                }`}
              >
                <span
                  className={`text-sm font-semibold ${active ? 'text-secondary dark:text-primary' : 'text-foreground'}`}
                >
                  {t.tabs[value]}
                </span>
                <span className="text-xs text-muted-foreground">{t.hints[value]}</span>
              </button>
            );
          })}
        </div>
      ) : (
        <SegmentedToggle<PowerXTab>
          value={tab}
          onValueChange={selectTab}
          ariaLabel={t.tabsLabel}
          size="default"
          className="w-full overflow-x-auto"
          buttonClassName="flex-1 justify-center whitespace-nowrap px-3"
          activeButtonClassName="bg-background text-foreground shadow-sm"
          options={(['draw', 'energy', 'time', 'where'] as const).map((value) => ({
            value,
            label: t.tabs[value],
            testId: `powerx-tab-${value}`,
          }))}
        />
      )}
      <div className="flex min-w-0 flex-col gap-1">
        <p className="text-sm font-medium text-foreground" data-testid="powerx-question">
          {t.questions[tab]}
        </p>
        <p className="text-xs text-muted-foreground" data-testid="powerx-read">
          {t.read[tab]}
        </p>
        <details className="group min-w-0 text-xs" data-testid="powerx-glossary">
          <summary className="w-fit cursor-pointer select-none text-muted-foreground underline decoration-dotted underline-offset-2 hover:text-foreground">
            {t.glossaryLabel}
          </summary>
          <dl className="mt-2 grid max-w-3xl grid-cols-1 gap-x-4 gap-y-1.5 sm:grid-cols-[max-content_1fr]">
            {t.glossary.map(([term, definition]) => (
              <div key={term} className="contents">
                <dt className="font-medium text-foreground">{term}</dt>
                <dd className="text-muted-foreground">{definition}</dd>
              </div>
            ))}
          </dl>
        </details>
      </div>

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
                { value: 'gpu', label: t.gpu },
                {
                  value: 'system',
                  label: t.system,
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
                title: rolesAvailable ? undefined : t.rolesUnavailable,
              },
            ]}
          />
          {!rolesAvailable && (
            <span className="text-xs text-muted-foreground" data-testid="powerx-roles-unavailable">
              {t.roles}: {t.rolesUnavailable}
            </span>
          )}
        </Field>
      )}

      <details
        className="group min-w-0"
        open={advancedOpen}
        onToggle={(event) => setAdvancedOpen(event.currentTarget.open)}
        data-testid="powerx-advanced"
      >
        <summary className="cursor-pointer select-none text-sm text-muted-foreground hover:text-foreground">
          {t.advanced}
        </summary>
        {advancedOpen && (
          <div className="mt-3">
            <MeasuredMetricControls
              metric={metric}
              onChange={onChange}
              compare={compare}
              onCompareChange={onCompareChange}
            />
          </div>
        )}
      </details>
    </div>
  );
}
