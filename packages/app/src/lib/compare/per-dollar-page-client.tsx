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
import { type Lang, compareDict, compareSlugPath } from '@/lib/compare/i18n';
import { Model, Precision, Sequence } from '@/lib/data-mappings';

interface SsrTableData {
  defaultTargets: number[];
  ssrRows: { target: number; a: InterpolatedResult | null; b: InterpolatedResult | null }[];
  interactivityRange: { min: number; max: number };
}

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
  /** UI language. Defaults to English; `/zh/compare-per-dollar/*` passes 'zh'. */
  lang?: Lang;
}

/** Only show Cost + Concurrency in the interpolated table — the rest of the
 *  metric rows (Throughput, tok/s/MW) live on the sibling /compare page. */
const PER_DOLLAR_TABLE_METRICS = ['Cost ($/M tok)', 'Concurrency'];

/** y_costh = Cost per Million Total Tokens (Owning - Hyperscaler). Defined in
 *  packages/app/src/components/inference/inference-chart-config.json. */
const PER_DOLLAR_DEFAULT_Y_AXIS = 'y_costh';

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
  lang = 'en',
}: ComparePerDollarPageClientProps) {
  useEffect(() => {
    track('compare_per_dollar_page_view', { gpu_a: a, gpu_b: b, default_model: defaultModel });
  }, [a, b, defaultModel]);

  const compareGpuPair = useMemo(() => [a, b] as const, [a, b]);
  const initialModel = toModel(defaultModel);
  const initialSequence = toSequence(defaultSequence);
  const initialPrecisions = toPrecisions(defaultPrecision);

  const t = compareDict(lang).detail.perDollar;
  const seqLabel = defaultSequence ?? (lang === 'zh' ? '序列' : 'sequence');
  const precLabel = defaultPrecision ?? (lang === 'zh' ? '精度' : 'precision');

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
                {t.eyebrow(modelLabel)}
              </div>
              <h1 className="text-2xl lg:text-3xl font-bold tracking-tight mt-1">
                {label} {t.h1Suffix}
              </h1>
              {lang === 'zh' ? (
                <p className="mt-2 text-sm text-muted-foreground">
                  <strong>{aLabel}</strong>（{aVendor} {aArch}）与 <strong>{bLabel}</strong>（
                  {bVendor} {bArch}）在 <strong>{modelLabel}</strong> 上的每百万 token 成本。按输出
                  token 对自建超大规模数据中心 TCO 归一化——各类 LLM
                  工作负载下的每美元性能。在每个目标交互速率下挑选更具成本效益的
                  SKU。使用下方的图表控件即可切换序列、精度与指标——交互方式与{' '}
                  <Link href="/" className="underline hover:text-primary">
                    {t.mainChartLink}
                  </Link>{' '}
                  一致。
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
                    {t.mainChartLink}
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
                            {t.caveat(seqLabel, precLabel)}
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
                  {t.pricingPrefix} <strong>{aLabel}</strong>{' '}
                  {aCostPerGpuHr > 0 ? `$${aCostPerGpuHr.toFixed(2)}/GPU/hr` : '—'} ·{' '}
                  <strong>{bLabel}</strong>{' '}
                  {bCostPerGpuHr > 0 ? `$${bCostPerGpuHr.toFixed(2)}/GPU/hr` : '—'}
                  {lang === 'zh' ? '。' : '. '}
                  {t.pricingSource}{' '}
                  <a
                    href="https://semianalysis.com/ai-cloud-tco-model/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline hover:text-primary"
                    onClick={() => track('compare_per_dollar_tco_source_clicked', { slug })}
                  >
                    {t.tcoSourceName}
                  </a>
                  {lang === 'zh' ? '。' : '.'}
                </p>
              )}
              <p className="mt-2 text-sm">
                <Link
                  href={compareSlugPath(lang, 'full', slug)}
                  className="underline hover:text-primary text-muted-foreground"
                  onClick={() => track('compare_per_dollar_cross_link_to_full', { slug })}
                >
                  {t.crossLink}
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
                  lang === 'zh'
                    ? `${modelLabel}：${aLabel} 与 ${bLabel} 在相同交互速率下的每百万 token 成本`
                    : `${modelLabel}: ${aLabel} versus ${bLabel} cost per million tokens at matched interactivity levels`
                }
                width={1200}
                height={675}
                loading="eager"
                fetchPriority="high"
                className="w-full rounded-lg border border-border/50"
              />
              <figcaption className="text-xs text-muted-foreground">
                {t.figcaption(aLabel, bLabel)}
              </figcaption>
            </figure>
            <CompareTableSection
              a={a}
              b={b}
              aLabel={aLabel}
              bLabel={bLabel}
              ssrTableData={ssrTableData}
              lang={lang}
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
  lang,
}: {
  a: string;
  b: string;
  aLabel: string;
  bLabel: string;
  ssrTableData: SsrTableData;
  lang: Lang;
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
        {compareDict(lang).detail.perDollar.emptyState}
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
      // Localized display override for the cost row — "Dollar per Million Tokens"
      // (en) / "每百万 Token 美元成本" (zh). Keyed by the stable English label.
      metricLabelOverrides={{ 'Cost ($/M tok)': compareDict(lang).table.perDollarCostLabel }}
      lang={lang}
    />
  );
}
