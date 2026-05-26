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
  aLabel: string;
  bLabel: string;
  aVendor: string;
  bVendor: string;
  aArch: string;
  bArch: string;
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
  aLabel,
  bLabel,
  aVendor,
  bVendor,
  aArch,
  bArch,
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
              <h1 className="text-2xl lg:text-3xl font-bold tracking-tight mt-1">{label}</h1>
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
    />
  );
}
