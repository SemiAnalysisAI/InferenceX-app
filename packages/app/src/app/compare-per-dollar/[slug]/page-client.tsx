'use client';

import Link from 'next/link';
import { useEffect, useMemo } from 'react';

import type { GPUDataPoint, InterpolatedResult } from '@/components/calculator/types';
import { useThroughputData } from '@/components/calculator/useThroughputData';
import { CompareInterpolatedTable } from '@/components/compare/compare-interpolated-table';
import { useGlobalFilters, GlobalFilterProvider } from '@/components/GlobalFilterContext';
import { InferenceProvider } from '@/components/inference/InferenceContext';
import InferenceChartDisplay from '@/components/inference/ui/ChartDisplay';
import { Card } from '@/components/ui/card';
import { track } from '@/lib/analytics';
import { Model, Precision, Sequence } from '@/lib/data-mappings';

interface SsrTableData {
  defaultTargets: number[];
  ssrRows: { target: number; a: InterpolatedResult | null; b: InterpolatedResult | null }[];
  interactivityRange: { min: number; max: number };
}

/** Only show Cost + Concurrency in the interpolated table — the rest of the
 *  metric rows (Throughput, tok/s/MW) live on the sibling /compare page. */
const PER_DOLLAR_TABLE_METRICS = ['Cost ($/M tok)', 'Concurrency'];

/** Rename "Cost ($/M tok)" to the full-English "Dollar per Million Tokens"
 *  in the per-dollar table so the cell reads in line with the page's
 *  "Performance per Dollar" framing and surfaces the SEO term verbatim. */
const PER_DOLLAR_LABEL_OVERRIDES = {
  'Cost ($/M tok)': 'Dollar per Million Tokens',
};

/** y_costh = Cost per Million Total Tokens (Owning - Hyperscaler). Defined in
 *  packages/app/src/components/inference/inference-chart-config.json. */
const PER_DOLLAR_DEFAULT_Y_AXIS = 'y_costh';

const STRINGS = {
  en: {
    eyebrowSuffix: 'Performance per Dollar',
    h1Suffix: 'Performance per Dollar',
    mainChartLinkText: 'the main inference chart',
    fullComparisonLinkText: 'View full latency + throughput comparison →',
    caveatSeqFallback: 'sequence',
    caveatPrecFallback: 'precision',
    pricingLabel: 'GPU pricing (owning hyperscaler):',
    pricingSource: 'Source:',
    emptyState:
      'No interpolated cost-per-token data available for the default model on this GPU pair. Use the chart controls below to select a model and precision with benchmark data for both GPUs.',
  },
  zh: {
    eyebrowSuffix: '每美元性能',
    h1Suffix: '每美元性能',
    mainChartLinkText: '主推理图表',
    fullComparisonLinkText: '查看完整延迟与吞吐量对比 →',
    caveatSeqFallback: '序列',
    caveatPrecFallback: '精度',
    pricingLabel: 'GPU 定价（所属云服务商）：',
    pricingSource: '来源：',
    emptyState:
      '当前默认模型在此 GPU 组合上没有可用的插值每 token 成本数据。请使用下方图表控件选择一个两款 GPU 均有基准测试数据的模型和精度。',
  },
} as const;

interface ComparePerDollarPageClientProps {
  a: string;
  b: string;
  /** Canonical compare slug (e.g. `deepseek-r1-h100-vs-h200`). Used for the
   *  cross-link to the sibling `/compare/<same-slug>` route. */
  slug: string;
  label: string;
  modelLabel: string;
  defaultModel: string;
  defaultSequence: string | null;
  defaultPrecision: string | null;
  ssrTableData: SsrTableData;
  /** One SSR-rendered prose paragraph per interpolated-table row (default
   *  interactivity target). Each paragraph picks a template variant
   *  deterministically from the slug so prose stays stable across renders
   *  but varies across pages in the catalog. Empty array when there's no
   *  comparable data. */
  narrative: string[];
  aLabel: string;
  bLabel: string;
  aVendor: string;
  bVendor: string;
  aArch: string;
  bArch: string;
  /** Owning-hyperscaler $/GPU/hr for each GPU — sourced from HW_REGISTRY.costh
   *  (the same input the per-dollar cost-per-token math uses). Rendered in the
   *  header so readers can audit the pricing assumptions. */
  aCostPerGpuHr: number;
  bCostPerGpuHr: number;
  /** Crawlable data graphic generated for the canonical default comparison. */
  heroImageSrc: string;
  locale?: 'en' | 'zh';
}

function toModel(value: string): Model | undefined {
  return Object.values(Model).includes(value as Model) ? (value as Model) : undefined;
}

function toSequence(value: string | null): Sequence | undefined {
  if (!value) return undefined;
  return Object.values(Sequence).includes(value as Sequence) ? (value as Sequence) : undefined;
}

function toPrecisions(value: string | null): string[] | undefined {
  if (!value) return undefined;
  return Object.values(Precision).includes(value as Precision) ? [value] : undefined;
}

export default function ComparePerDollarPageClient({
  a,
  b,
  slug,
  label,
  modelLabel,
  defaultModel,
  defaultSequence,
  defaultPrecision,
  ssrTableData,
  narrative,
  aLabel,
  bLabel,
  aVendor,
  bVendor,
  aArch,
  bArch,
  aCostPerGpuHr,
  bCostPerGpuHr,
  heroImageSrc,
  locale = 'en',
}: ComparePerDollarPageClientProps) {
  useEffect(() => {
    track('compare_per_dollar_page_view', { gpu_a: a, gpu_b: b, default_model: defaultModel });
  }, [a, b, defaultModel]);

  const compareGpuPair = useMemo(() => [a, b] as const, [a, b]);
  const initialModel = toModel(defaultModel);
  const initialSequence = toSequence(defaultSequence);
  const initialPrecisions = toPrecisions(defaultPrecision);
  const t = STRINGS[locale];
  const isZh = locale === 'zh';

  return (
    <GlobalFilterProvider
      initialModel={initialModel}
      initialSequence={initialSequence}
      initialPrecisions={initialPrecisions}
    >
      <InferenceProvider
        activeTab="compare"
        initialActiveHwTypes={[a, b]}
        compareGpuPair={compareGpuPair}
        initialYAxisMetric={PER_DOLLAR_DEFAULT_Y_AXIS}
      >
        <div className="flex flex-col gap-4">
          <Card className="flex w-full min-w-0 flex-col gap-3">
            <header>
              <div className="text-xs uppercase tracking-wider text-muted-foreground">
                {modelLabel} · {t.eyebrowSuffix}
              </div>
              <h1 className="text-2xl lg:text-3xl font-bold tracking-tight mt-1">
                {label} {t.h1Suffix}
              </h1>
              {isZh ? (
                <p className="mt-2 text-sm text-muted-foreground">
                  <strong>{aLabel}</strong>（{aVendor} {aArch}）与 <strong>{bLabel}</strong>（
                  {bVendor} {bArch}）在 <strong>{modelLabel}</strong> 上的每百万 token
                  成本。基于所属云服务商 TCO 归一化的输出 token 性能——在各类 LLM
                  工作负载下的每美元性能。在每个目标交互性水平下选出更经济的
                  SKU。使用下方图表控件切换序列、精度和指标——交互方式与
                  <Link href="/zh" className="underline hover:text-primary">
                    {t.mainChartLinkText}
                  </Link>
                  相同。
                </p>
              ) : (
                <p className="mt-2 text-sm text-muted-foreground">
                  Cost per million tokens of <strong>{aLabel}</strong> ({aVendor} {aArch}) versus{' '}
                  <strong>{bLabel}</strong> ({bVendor} {bArch}) on <strong>{modelLabel}</strong>.
                  Owning-hyperscaler TCO normalized by output tokens — performance per dollar across
                  LLM workloads. Pick the more cost-efficient SKU at every target interactivity
                  level. Use the chart controls below to switch sequences, precisions, and metrics —
                  same interactions as{' '}
                  <Link href="/" className="underline hover:text-primary">
                    {t.mainChartLinkText}
                  </Link>
                  .
                </p>
              )}
              {narrative.length > 0 && (
                <div
                  className="mt-3 flex flex-col gap-2"
                  data-testid="compare-per-dollar-narrative"
                >
                  {narrative.map((para, i) => (
                    <p key={i} className="text-sm text-foreground/80">
                      {para}
                      {i === narrative.length - 1 && (
                        <>
                          {' '}
                          <span className="text-muted-foreground italic">
                            {isZh
                              ? `（数据反映此 URL 的默认 ${defaultSequence ?? t.caveatSeqFallback} · ${defaultPrecision ?? t.caveatPrecFallback} 选择——如果您在控件中更改序列、精度或模型，下方表格和图表会自动更新。）`
                              : `(Numbers reflect the default ${defaultSequence ?? t.caveatSeqFallback} · ${defaultPrecision ?? t.caveatPrecFallback} selection for this URL — table and chart below update if you change sequence, precision, or model in the controls.)`}
                          </span>
                        </>
                      )}
                    </p>
                  ))}
                </div>
              )}
              {(aCostPerGpuHr > 0 || bCostPerGpuHr > 0) && (
                <p
                  className="mt-2 text-xs text-muted-foreground"
                  data-testid="compare-per-dollar-pricing"
                >
                  {t.pricingLabel} <strong>{aLabel}</strong>{' '}
                  {aCostPerGpuHr > 0 ? `$${aCostPerGpuHr.toFixed(2)}/GPU/hr` : '—'} ·{' '}
                  <strong>{bLabel}</strong>{' '}
                  {bCostPerGpuHr > 0 ? `$${bCostPerGpuHr.toFixed(2)}/GPU/hr` : '—'}.{' '}
                  {t.pricingSource}{' '}
                  <a
                    href="https://semianalysis.com/ai-cloud-tco-model/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline hover:text-primary"
                    onClick={() => track('compare_per_dollar_tco_source_clicked', { slug })}
                  >
                    SemiAnalysis Market August 2025 Pricing Surveys &amp; AI Cloud TCO Model
                  </a>
                  .
                </p>
              )}
              <p className="mt-2 text-sm">
                <Link
                  href={isZh ? `/zh/compare/${slug}` : `/compare/${slug}`}
                  className="underline hover:text-primary text-muted-foreground"
                  onClick={() => track('compare_per_dollar_cross_link_to_full', { slug })}
                >
                  {t.fullComparisonLinkText}
                </Link>
              </p>
            </header>
            <figure
              className="mt-2 flex flex-col gap-2"
              data-testid="compare-per-dollar-indexed-image"
            >
              <img
                src={heroImageSrc}
                alt={
                  isZh
                    ? `${modelLabel}：${aLabel} 与 ${bLabel} 在相同交互性水平下的每百万 token 成本`
                    : `${modelLabel}: ${aLabel} versus ${bLabel} cost per million tokens at matched interactivity levels`
                }
                width={1200}
                height={675}
                loading="eager"
                fetchPriority="high"
                className="w-full rounded-lg border border-border/50"
              />
              <figcaption className="text-xs text-muted-foreground">
                {isZh
                  ? `${aLabel} 与 ${bLabel} 在此对比默认工作负载下的每百万 token 成本。成本越低表示每美元性能越高。`
                  : `${aLabel} versus ${bLabel} cost per million tokens for this comparison's canonical default workload. Lower cost indicates better performance per dollar.`}
              </figcaption>
            </figure>
            <CompareTableSection
              a={a}
              b={b}
              aLabel={aLabel}
              bLabel={bLabel}
              ssrTableData={ssrTableData}
              emptyStateText={t.emptyState}
            />
          </Card>
          <InferenceChartDisplay />
        </div>
      </InferenceProvider>
    </GlobalFilterProvider>
  );
}

function CompareTableSection({
  a,
  b,
  aLabel,
  bLabel,
  ssrTableData,
  emptyStateText,
}: {
  a: string;
  b: string;
  aLabel: string;
  bLabel: string;
  ssrTableData: SsrTableData;
  emptyStateText: string;
}) {
  const { effectiveSequence, effectivePrecisions, selectedRunDate, selectedModel } =
    useGlobalFilters();

  const { gpuDataByGroupKey, ranges, hasData } = useThroughputData(
    selectedModel,
    effectiveSequence,
    effectivePrecisions,
    selectedRunDate,
  );

  const { pointsA, pointsB } = useMemo(() => {
    const pA: GPUDataPoint[] = [];
    const pB: GPUDataPoint[] = [];
    for (const [groupKey, points] of Object.entries(gpuDataByGroupKey)) {
      const hwKey = groupKey.split('__')[0];
      if (hwKey === a || hwKey.startsWith(`${a}_`)) pA.push(...points);
      else if (hwKey === b || hwKey.startsWith(`${b}_`)) pB.push(...points);
    }
    return { pointsA: pA, pointsB: pB };
  }, [gpuDataByGroupKey, a, b]);

  const clientRange = hasData ? ranges.interactivity : ssrTableData.interactivityRange;

  if (ssrTableData.defaultTargets.length === 0) {
    return (
      <div className="border border-border/50 rounded-md px-4 py-3 text-sm text-muted-foreground bg-muted/30">
        {emptyStateText}
      </div>
    );
  }

  return (
    <CompareInterpolatedTable
      aLabel={aLabel}
      bLabel={bLabel}
      ssrRows={ssrTableData.ssrRows}
      defaultTargets={ssrTableData.defaultTargets}
      interactivityRange={clientRange}
      gpuDataPointsA={pointsA}
      gpuDataPointsB={pointsB}
      visibleMetricLabels={PER_DOLLAR_TABLE_METRICS}
      metricLabelOverrides={PER_DOLLAR_LABEL_OVERRIDES}
    />
  );
}
