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
}: ComparePerDollarPageClientProps) {
  useEffect(() => {
    track('compare_per_dollar_page_view', { gpu_a: a, gpu_b: b, default_model: defaultModel });
  }, [a, b, defaultModel]);

  const compareGpuPair = useMemo(() => [a, b] as const, [a, b]);
  const initialModel = toModel(defaultModel);
  const initialSequence = toSequence(defaultSequence);
  const initialPrecisions = toPrecisions(defaultPrecision);

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
          <Card className="flex flex-col gap-3">
            <header>
              <div className="text-xs uppercase tracking-wider text-muted-foreground">
                {modelLabel} · Performance per Dollar
              </div>
              <h1 className="text-2xl lg:text-3xl font-bold tracking-tight mt-1">
                {label} Performance per Dollar
              </h1>
              <p className="mt-2 text-sm text-muted-foreground max-w-3xl">
                Cost per million tokens of <strong>{aLabel}</strong> ({aVendor} {aArch}) versus{' '}
                <strong>{bLabel}</strong> ({bVendor} {bArch}) on <strong>{modelLabel}</strong>.
                Owning-hyperscaler TCO normalized by output tokens — performance per dollar across
                LLM workloads. Pick the more cost-efficient SKU at every target interactivity level.
                Use the chart controls below to switch sequences, precisions, and metrics — same
                interactions as{' '}
                <Link href="/" className="underline hover:text-primary">
                  the main inference chart
                </Link>
                .
              </p>
              {narrative.length > 0 && (
                <div
                  className="mt-3 flex flex-col gap-2 max-w-3xl"
                  data-testid="compare-per-dollar-narrative"
                >
                  {narrative.map((para, i) => (
                    <p key={i} className="text-sm text-foreground/80">
                      {para}
                      {i === narrative.length - 1 && (
                        <>
                          {' '}
                          <span className="text-muted-foreground italic">
                            (Numbers reflect the default {defaultSequence ?? 'sequence'} ·{' '}
                            {defaultPrecision ?? 'precision'} selection for this URL — table and
                            chart below update if you change sequence, precision, or model in the
                            controls.)
                          </span>
                        </>
                      )}
                    </p>
                  ))}
                </div>
              )}
              {(aCostPerGpuHr > 0 || bCostPerGpuHr > 0) && (
                <p
                  className="mt-2 text-xs text-muted-foreground max-w-3xl"
                  data-testid="compare-per-dollar-pricing"
                >
                  GPU pricing (owning hyperscaler): <strong>{aLabel}</strong>{' '}
                  {aCostPerGpuHr > 0 ? `$${aCostPerGpuHr.toFixed(2)}/GPU/hr` : '—'} ·{' '}
                  <strong>{bLabel}</strong>{' '}
                  {bCostPerGpuHr > 0 ? `$${bCostPerGpuHr.toFixed(2)}/GPU/hr` : '—'}. Source:{' '}
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
                  href={`/compare/${slug}`}
                  className="underline hover:text-primary text-muted-foreground"
                  onClick={() => track('compare_per_dollar_cross_link_to_full', { slug })}
                >
                  View full latency + throughput comparison →
                </Link>
              </p>
            </header>
            <CompareTableSection
              a={a}
              b={b}
              aLabel={aLabel}
              bLabel={bLabel}
              ssrTableData={ssrTableData}
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
}: {
  a: string;
  b: string;
  aLabel: string;
  bLabel: string;
  ssrTableData: SsrTableData;
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
        No interpolated cost-per-token data available for the default model on this GPU pair. Use
        the chart controls below to select a model and precision with benchmark data for both GPUs.
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
