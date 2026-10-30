'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { usePathname, useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { track } from '@/lib/analytics/analytics';
import { analyticsPlacement } from '@/lib/analytics/placement';
import { getHardwareConfig } from '@/lib/catalog/constants';
import { Model, PRECISION_OPTIONS } from '@/lib/catalog/data-mappings';
import { overlayRunColor } from '@/lib/charts/overlay-run-style';
import { exportToCsv } from '@/lib/export/csv-export';
import { useLocale } from '@/lib/i18n/use-locale';
import { modelRoutesForTab } from '@/lib/routing/model-routes';
import { getDisplayLabel } from '@/lib/shared/utils';
import type { TokenRevenuePricing } from '@/components/inference/types';
import { profitModelDefaults } from './profit-estimator';
import type { RevenueCapacityOutput } from './revenue-capacity';

const STRINGS = {
  en: {
    title: 'Revenue → GPU capacity',
    intro:
      'Set a gross revenue target. Compare the GPU or accelerator count required by each benchmarked configuration.',
    revenueTarget: 'Revenue target (USD)',
    period: 'Revenue period',
    month: 'Per month',
    quarter: 'Per quarter',
    year: 'Per year',
    model: 'Model',
    target: 'P90 interactivity (tok/s/user)',
    utilization: 'Billable utilization (%)',
    cacheHitMode: 'Cache hit rates',
    theoretical: 'Theoretical roofline',
    actual: 'Actual measured',
    priceSource: 'Token price source',
    list: 'Model lab list price',
    openrouter: 'OpenRouter',
    custom: 'Custom',
    inputPrice: 'Input ($/M tok)',
    cachedInputPrice: 'Cached input ($/M tok)',
    outputPrice: 'Output ($/M tok)',
    advanced: 'Hardware, snapshot & unofficial runs',
    precisions: 'Precision',
    all: 'All precisions',
    gpus: 'Hardware keys (comma-separated; blank = all)',
    date: 'Snapshot date',
    runId: 'Exact run ID (overrides date)',
    unofficialrun: 'Unofficial run IDs (comma-separated)',
    apply: 'Calculate capacity',
    reset: 'Reset',
    csv: 'Export CSV',
    share: 'Copy link',
    copied: 'Link copied',
    copyFailed: 'Copy the page URL from your address bar.',
    loading: 'Calculating capacity…',
    error: 'Could not calculate capacity. Check the inputs and retry.',
    retry: 'Retry',
    empty: 'No configurations can meet this target with the selected assumptions.',
    chart: 'GPUs / accelerators required',
    fewer: 'Fewer chips at left; each row is an alternative fleet, not a fleet to add together.',
    config: 'Configuration',
    chips: 'Chips',
    block: 'Chips / deployment',
    realized: 'Revenue / chip-hour',
    projected: 'Projected period revenue',
    source: 'Source runs',
    unofficial: 'Unofficial',
    unknown: 'Capacity only',
    unavailable: 'Unavailable configurations',
    notes: 'Method & assumptions',
    methodology:
      'GPU equivalents = revenue target ÷ (gross revenue per chip-hour × utilization × period hours). A month is 730 hours, a quarter 2,190 hours, and a year 8,760 hours (365 days). These are annualized planning periods, not calendar dates.',
    rounding:
      'Counts round up to whole measured deployments only when the interpolation endpoints have a matching topology. Otherwise they round to whole chips and are marked “Capacity only”; they are not a deployment plan. Linear replication assumes enough demand and no additional fleet-scale bottlenecks or redundancy reserve.',
    economics:
      'Gross revenue is before compute expense and model-license fees. TCO, rental rates and power do not affect this target; use Profit Estimator for margin. Prices and utilization are assumptions, not guaranteed sales.',
    coverage:
      'All benchmarked configurations in the selected precision are compared. Hardware without this model’s AgentX measurements has no estimate. No extrapolation outside the measured interactivity range.',
    cacheNote:
      'Theoretical mode uses the trace’s infinite-cache reuse rate, falling back to measured cache when absent. Actual uses the estimator’s measured cache-rate path. Neither mode simulates a different throughput curve.',
    pending: 'Settings changed. Calculate to update the results.',
    basis: 'Applied target',
    reasons: {
      'outside-measured-range': 'Outside measured interactivity range',
      'no-token-mix': 'Missing token mix',
      'zero-revenue': 'Zero billable revenue',
      'unsafe-fleet-size': 'Fleet size exceeds numeric limits',
    },
  },
  zh: {
    title: '收入目标 → GPU 需求',
    intro: '输入总收入目标，对比各实测配置所需的 GPU 或加速器数量。',
    revenueTarget: '收入目标（USD）',
    period: '收入周期',
    month: '每月',
    quarter: '每季度',
    year: '每年',
    model: '模型',
    target: 'P90 交互性（tok/s/user）',
    utilization: '可计费利用率（%）',
    cacheHitMode: '缓存命中率',
    theoretical: '理论上限',
    actual: '实测值',
    priceSource: 'Token 定价来源',
    list: '模型厂商公开定价',
    openrouter: 'OpenRouter',
    custom: '自定义',
    inputPrice: '输入（$/M tok）',
    cachedInputPrice: '缓存输入（$/M tok）',
    outputPrice: '输出（$/M tok）',
    advanced: '硬件、快照与非官方运行',
    precisions: '精度',
    all: '全部精度',
    gpus: '硬件键（逗号分隔；留空选择全部）',
    date: '快照日期',
    runId: '指定运行 ID（优先于日期）',
    unofficialrun: '非官方运行 ID（逗号分隔）',
    apply: '计算芯片需求',
    reset: '重置',
    csv: '导出 CSV',
    share: '复制链接',
    copied: '链接已复制',
    copyFailed: '请从地址栏复制页面 URL。',
    loading: '正在计算芯片需求…',
    error: '无法计算芯片需求，请检查输入后重试。',
    retry: '重试',
    empty: '在当前假设下，没有可满足此目标的配置。',
    chart: '所需 GPU / 加速器数量',
    fewer: '芯片需求较少的配置排在前面。各行代表独立备选方案，不应相加。',
    config: '配置',
    chips: '芯片数',
    block: '每个部署的芯片数',
    realized: '每芯片小时收入',
    projected: '周期内预计收入',
    source: '来源运行',
    unofficial: '非官方',
    unknown: '仅估算容量',
    unavailable: '无法估算的配置',
    notes: '计算方法与假设',
    methodology:
      '等效芯片数 = 收入目标 ÷（每芯片小时总收入 × 利用率 × 周期小时数）。按每月 730 小时、每季度 2,190 小时、每年 8,760 小时（365 天）计算。这是年度均摊的规划周期，不对应具体自然月或季度。',
    rounding:
      '只有插值两端的部署拓扑一致时，才按完整实测部署向上取整。否则按整颗芯片向上取整，并标注“仅估算容量”，不能直接用作部署方案。线性扩容假设有足够需求，且没有额外的集群规模瓶颈，也未预留冗余容量。',
    economics:
      '总收入未扣除算力支出和模型许可费。TCO、租赁单价和功耗不影响此目标；利润率请查看利润估算器。定价和利用率均为假设，不代表销售承诺。',
    coverage:
      '对比所选精度下所有已有基准测试的配置。缺少该模型 AgentX 实测数据的硬件不作估算，交互性超出实测范围时不做外推。',
    cacheNote:
      '理论模式使用 trace 的无限缓存复用率；缺失时回退到实测缓存命中率。实测模式沿用利润估算器的实测缓存计算路径。两种模式均不模拟另一条吞吐量曲线。',
    pending: '设置已修改，点击计算以更新结果。',
    basis: '当前计算目标',
    reasons: {
      'outside-measured-range': '交互性超出实测范围',
      'no-token-mix': '缺少输入与输出 token 比例',
      'zero-revenue': '可计费收入为零',
      'unsafe-fleet-size': '集群规模超出数值范围',
    },
  },
};

interface CapacityResponse {
  params: {
    revenueTarget: number;
    period: 'month' | 'quarter' | 'year';
    hours: number;
    model: string;
    utilization: number;
    target: number;
    cacheHitMode: string;
    precisions: string[];
  };
  pricing: TokenRevenuePricing;
  data: RevenueCapacityOutput;
  overlays: RevenueCapacityOutput;
}

function defaults(model: Model = Model.Kimi_K3): Record<string, string> {
  const preset = profitModelDefaults(model);
  return {
    model,
    revenueTarget: '1000000',
    period: 'month',
    target: String(preset.interactivity),
    utilization: '60',
    cacheHitMode: 'theoretical',
    priceSource: preset.listPricing ? 'list' : 'openrouter',
    inputPrice: String(preset.listPricing?.inputPerMillion ?? 1),
    cachedInputPrice: String(preset.listPricing?.cachedInputPerMillion ?? 0.1),
    outputPrice: String(preset.listPricing?.outputPerMillion ?? 1),
    precisions: PRECISION_OPTIONS.join(','),
    gpus: '',
    date: '',
    runId: '',
    unofficialrun: '',
  };
}

function queryFor(values: Record<string, string>) {
  return new URLSearchParams(
    Object.entries(values).filter(
      ([key, value]) =>
        value !== '' &&
        (values.priceSource === 'custom' ||
          !['inputPrice', 'cachedInputPrice', 'outputPrice'].includes(key)),
    ),
  ).toString();
}

export default function RevenueCapacityDisplay({
  initial = {},
}: {
  initial?: Record<string, string>;
}) {
  const locale = useLocale();
  const t = STRINGS[locale];
  const router = useRouter();
  const pathname = usePathname();
  const [draft, setDraft] = useState(() => ({
    ...defaults(initial.model as Model | undefined),
    ...initial,
  }));
  const [active, setActive] = useState(draft);
  const [message, setMessage] = useState('');
  const query = queryFor(active);
  const pending = queryFor(draft) !== query;
  const result = useQuery<CapacityResponse>({
    queryKey: ['revenue-capacity', query],
    queryFn: async ({ signal }) => {
      const response = await fetch(`/api/v1/views/revenue-capacity?${query}`, { signal });
      if (!response.ok) throw new Error(String(response.status));
      return response.json();
    },
    retry: false,
  });
  const data = result.data;
  const rows = data
    ? [...data.data.rows, ...data.overlays.rows].sort(
        (a, b) => a.requiredGpus - b.requiredGpus || a.resultKey.localeCompare(b.resultKey),
      )
    : [];
  const skipped = data ? [...data.data.skipped, ...data.overlays.skipped] : [];
  const label = (key: string) => getDisplayLabel(getHardwareConfig(key, active.model));
  const maximum = Math.max(1, ...rows.map((row) => row.requiredGpus));
  const number = new Intl.NumberFormat(locale === 'zh' ? 'zh-CN' : 'en-US', {
    maximumFractionDigits: 0,
  });
  const money = new Intl.NumberFormat(locale === 'zh' ? 'zh-CN' : 'en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2,
  });

  function change(key: string, value: string) {
    track('revenue_capacity_input_changed', { control: key });
    setDraft((old) =>
      key === 'model'
        ? {
            ...old,
            ...defaults(value as Model),
            revenueTarget: old.revenueTarget,
            period: old.period,
            utilization: old.utilization,
          }
        : { ...old, [key]: value },
    );
  }
  function apply(values: Record<string, string>) {
    setActive(values);
    router.replace(`${pathname}?${queryFor(values)}`, { scroll: false });
    track('revenue_capacity_calculated', {
      model: values.model,
      period: values.period,
      revenue_target: Number(values.revenueTarget),
    });
  }
  function field(key: string, title: string, type = 'number') {
    return (
      <label className="flex min-w-0 flex-col gap-2 text-sm" key={key}>
        <span>{title}</span>
        <Input
          name={key}
          type={type}
          value={draft[key] ?? ''}
          onChange={(event) => change(key, event.target.value)}
          min={key === 'target' ? 0.001 : 0}
          max={key === 'utilization' ? 100 : undefined}
          step="any"
          required={type === 'number'}
        />
      </label>
    );
  }
  function select(key: string, title: string, options: { value: string; label: string }[]) {
    return (
      <label className="flex min-w-0 flex-col gap-2 text-sm" key={key}>
        <span>{title}</span>
        <select
          name={key}
          className="h-10 w-full min-w-0 rounded-md border border-input bg-background px-3 text-sm"
          value={draft[key]}
          onChange={(event) => change(key, event.target.value)}
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
    );
  }
  return (
    <section className="space-y-5" {...analyticsPlacement('revenue-capacity')}>
      <header className="space-y-2">
        <h1 className="text-xl font-semibold">{t.title}</h1>
        <p className="text-sm text-muted-foreground">{t.intro}</p>
      </header>
      <Card>
        <form
          className="space-y-5"
          onSubmit={(event) => {
            event.preventDefault();
            apply(draft);
          }}
        >
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {field('revenueTarget', t.revenueTarget)}
            {select(
              'period',
              t.period,
              ['month', 'quarter', 'year'].map((value) => ({ value, label: t[value as 'month'] })),
            )}
            {select(
              'model',
              t.model,
              modelRoutesForTab('profit-estimator').map((model) => ({
                value: model.model,
                label: model.label,
              })),
            )}
            {field('utilization', t.utilization)}
          </div>
          <div className="grid gap-4 border-t border-border pt-5 sm:grid-cols-3">
            {field('target', t.target)}
            {select('cacheHitMode', t.cacheHitMode, [
              { value: 'theoretical', label: t.theoretical },
              { value: 'actual', label: t.actual },
            ])}
            {select('priceSource', t.priceSource, [
              ...(profitModelDefaults(draft.model as Model).listPricing
                ? [{ value: 'list', label: t.list }]
                : []),
              { value: 'openrouter', label: t.openrouter },
              { value: 'custom', label: t.custom },
            ])}
          </div>
          {draft.priceSource === 'custom' && (
            <div className="grid gap-4 sm:grid-cols-3">
              {field('inputPrice', t.inputPrice)}
              {field('cachedInputPrice', t.cachedInputPrice)}
              {field('outputPrice', t.outputPrice)}
            </div>
          )}
          <details
            className="rounded-md border border-border p-3"
            onToggle={(event) =>
              track('revenue_capacity_advanced_toggled', { enabled: event.currentTarget.open })
            }
          >
            <summary className="cursor-pointer text-sm font-medium">{t.advanced}</summary>
            <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {select('precisions', t.precisions, [
                { value: PRECISION_OPTIONS.join(','), label: t.all },
                ...PRECISION_OPTIONS.map((value) => ({ value, label: value })),
              ])}
              {field('gpus', t.gpus, 'text')}
              {field('date', t.date, 'date')}
              {field('runId', t.runId, 'text')}
              {field('unofficialrun', t.unofficialrun, 'text')}
            </div>
          </details>
          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit">{t.apply}</Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                const next = defaults();
                setDraft(next);
                apply(next);
                track('revenue_capacity_reset');
              }}
            >
              {t.reset}
            </Button>
            <span className="text-sm text-muted-foreground" role="status">
              {pending ? t.pending : ''}
            </span>
          </div>
        </form>
      </Card>
      {result.isPending && (
        <Card>
          <p role="status">{t.loading}</p>
        </Card>
      )}
      {result.isError && (
        <Card>
          <p role="alert">{t.error}</p>
          <Button
            variant="outline"
            onClick={() => {
              void result.refetch();
              track('revenue_capacity_retry');
            }}
          >
            {t.retry}
          </Button>
        </Card>
      )}
      {data && (
        <Card>
          <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
            <div className="space-y-1">
              <h2 className="text-lg font-semibold">{t.chart}</h2>
              <p className="text-sm">
                {t.basis}: {money.format(data.params.revenueTarget)} · {t[data.params.period]} ·{' '}
                {data.params.model}
              </p>
              <p className="text-xs text-muted-foreground">
                {data.params.hours.toLocaleString()} h · {data.params.utilization}% · P90{' '}
                {data.params.target} tok/s/user ·{' '}
                {data.params.cacheHitMode === 'actual' ? t.actual : t.theoretical}
              </p>
              <p className="text-xs text-muted-foreground">
                {t.inputPrice}: {data.pricing.inputPerMillion} · {t.cachedInputPrice}:{' '}
                {data.pricing.cachedInputPerMillion} · {t.outputPrice}:{' '}
                {data.pricing.outputPerMillion}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                onClick={async () => {
                  track('revenue_capacity_share');
                  try {
                    const url = new URL(pathname, window.location.origin);
                    url.search = queryFor(active);
                    await navigator.clipboard.writeText(url.href);
                    setMessage(t.copied);
                  } catch {
                    setMessage(t.copyFailed);
                  }
                }}
              >
                {t.share}
              </Button>
              <Button
                variant="outline"
                disabled={rows.length === 0}
                onClick={() => {
                  track('revenue_capacity_csv_exported', { gpu_count: rows.length });
                  exportToCsv(
                    'revenue-capacity.csv',
                    [
                      t.config,
                      t.chips,
                      t.block,
                      t.realized,
                      t.projected,
                      t.source,
                      t.revenueTarget,
                      t.period,
                      t.utilization,
                      t.target,
                      t.cacheHitMode,
                      t.inputPrice,
                      t.cachedInputPrice,
                      t.outputPrice,
                    ],
                    rows.map((row) => [
                      row.resultKey,
                      row.requiredGpus,
                      row.deploymentGpus ?? '',
                      row.realizedRevenuePerGpuHour,
                      row.projectedRevenue,
                      row.sourceUrls.join(' '),
                      data.params.revenueTarget,
                      data.params.period,
                      data.params.utilization,
                      data.params.target,
                      data.params.cacheHitMode,
                      data.pricing.inputPerMillion,
                      data.pricing.cachedInputPerMillion ?? '',
                      data.pricing.outputPerMillion,
                    ]),
                  );
                }}
              >
                {t.csv}
              </Button>
            </div>
          </div>
          {message && (
            <p className="mb-3 text-sm" role="status">
              {message}
            </p>
          )}
          <p className="mb-4 text-xs text-muted-foreground">{t.fewer}</p>
          {rows.length === 0 && (
            <p className="py-10 text-center text-muted-foreground">{t.empty}</p>
          )}
          <div className="space-y-4" role="list" aria-label={t.chart} data-testid="capacity-bars">
            {rows.map((row) => (
              <div
                key={row.resultKey}
                role="listitem"
                className="grid min-w-0 gap-x-4 gap-y-1 sm:grid-cols-[minmax(180px,1fr)_3fr_100px]"
                data-testid="capacity-row"
              >
                <div className="break-words text-sm">
                  <span className="font-medium">{label(row.hwKey)}</span>{' '}
                  <span className="text-xs text-muted-foreground">{row.precision}</span>
                  {row.isOverlay && (
                    <div className="text-xs">
                      {t.unofficial}: {row.runLabel ?? row.runUrl}
                    </div>
                  )}
                </div>
                <div className="flex min-h-6 items-center" aria-hidden="true">
                  <div
                    className="h-6 rounded-r-sm bg-primary"
                    style={{
                      width: `${(row.requiredGpus / maximum) * 100}%`,
                      backgroundColor: row.isOverlay
                        ? overlayRunColor(row.runIndex ?? 0)
                        : undefined,
                    }}
                  />
                </div>
                <div
                  className="text-right font-mono text-sm font-semibold"
                  data-testid="capacity-count"
                >
                  {number.format(row.requiredGpus)}
                </div>
                <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground sm:col-span-3">
                  <span>
                    {t.realized}: {money.format(row.realizedRevenuePerGpuHour)}
                  </span>
                  <span>
                    {row.deploymentGpus
                      ? `${t.block}: ${number.format(row.deploymentGpus)}`
                      : t.unknown}
                  </span>
                  <span>
                    {t.projected}: {money.format(row.projectedRevenue)}
                  </span>
                  <span>{row.sourceDates.join(', ')}</span>
                  {row.sourceUrls.map((url, i) => (
                    <a
                      key={url}
                      href={url}
                      target="_blank"
                      rel="noreferrer"
                      className="underline"
                      onClick={() => track('revenue_capacity_source_opened', { gpu: row.hwKey })}
                    >
                      {t.source} {i + 1}
                    </a>
                  ))}
                </div>
              </div>
            ))}
          </div>
          {skipped.length > 0 && (
            <details
              className="mt-6 border-t border-border pt-4"
              onToggle={(event) =>
                track('revenue_capacity_unavailable_toggled', { enabled: event.currentTarget.open })
              }
            >
              <summary className="cursor-pointer text-sm">
                {t.unavailable} ({skipped.length})
              </summary>
              <ul className="mt-3 space-y-2 text-xs text-muted-foreground">
                {skipped.map((row) => (
                  <li key={row.resultKey}>
                    {row.hwKey} {row.precision}: {t.reasons[row.reason]}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </Card>
      )}
      <details
        open
        className="rounded-xl border border-border p-5"
        onToggle={(event) =>
          track('revenue_capacity_method_toggled', { enabled: event.currentTarget.open })
        }
      >
        <summary className="cursor-pointer text-sm font-semibold">{t.notes}</summary>
        <div className="mt-3 space-y-3 text-sm text-muted-foreground">
          <p>{t.methodology}</p>
          <p>{t.rounding}</p>
          <p>{t.economics}</p>
          <p>{t.coverage}</p>
          <p>{t.cacheNote}</p>
        </div>
      </details>
    </section>
  );
}
