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

interface ComparePageClientProps {
  a: string;
  b: string;
  label: string;
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

export default function ComparePageClient({
  a,
  b,
  label,
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
}: ComparePageClientProps) {
  useEffect(() => {
    track('compare_page_view', { gpu_a: a, gpu_b: b, default_model: defaultModel });
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
      >
        <div className="flex flex-col gap-4">
          <Card className="flex flex-col gap-3">
            <header>
              <div className="text-xs uppercase tracking-wider text-muted-foreground">
                GPU comparison
              </div>
              <h1 className="text-2xl lg:text-3xl font-bold tracking-tight mt-1">{label}</h1>
              <p className="mt-2 text-sm text-muted-foreground max-w-3xl">
                Head-to-head AI inference benchmark comparison of <strong>{aLabel}</strong> (
                {aVendor} {aArch}) and <strong>{bLabel}</strong> ({bVendor} {bArch}). Latency,
                throughput, and cost across LLM workloads. Use the chart controls below to switch
                models, sequences, precisions, and metrics — same interactions as{' '}
                <Link href="/" className="underline hover:text-primary">
                  the main inference chart
                </Link>
                .
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

  // Extract GPUDataPoint arrays for just the two GPUs in the pair.
  // The group keys may be plain hwKeys or composite (hwKey__precision).
  // Match prefix since keys include framework (e.g., "h200_sglang", "h100_dynamo-trt").
  const { pointsA, pointsB } = useMemo(() => {
    const pA: GPUDataPoint[] = [];
    const pB: GPUDataPoint[] = [];
    for (const [groupKey, points] of Object.entries(gpuDataByGroupKey)) {
      // Match if groupKey starts with the base GPU key
      const hwKey = groupKey.split('__')[0]; // Remove precision suffix if present
      if (hwKey === a || hwKey.startsWith(`${a}_`)) pA.push(...points);
      else if (hwKey === b || hwKey.startsWith(`${b}_`)) pB.push(...points);
    }
    return { pointsA: pA, pointsB: pB };
  }, [gpuDataByGroupKey, a, b]);

  const clientRange = hasData ? ranges.interactivity : ssrTableData.interactivityRange;

  if (ssrTableData.defaultTargets.length === 0) {
    return (
      <div className="border border-border/50 rounded-md px-4 py-3 text-sm text-muted-foreground bg-muted/30">
        No interpolated comparison data available for the default model. Use the chart controls
        below to select a model with benchmark data for both GPUs.
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
    />
  );
}
