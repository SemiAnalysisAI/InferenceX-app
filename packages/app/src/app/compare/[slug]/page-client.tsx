'use client';

import Link from 'next/link';
import { useEffect } from 'react';

import { track } from '@/lib/analytics';
import { Card } from '@/components/ui/card';
import { GlobalFilterProvider } from '@/components/GlobalFilterContext';
import { InferenceProvider } from '@/components/inference/InferenceContext';
import InferenceChartDisplay from '@/components/inference/ui/ChartDisplay';
import { Model, Precision, Sequence } from '@/lib/data-mappings';

interface PairSummary {
  hardware: string;
  configCount: number;
  bestThroughputPerGpu: number | null;
  bestMedianTtft: number | null;
  bestMedianTpot: number | null;
}

interface ComparePageClientProps {
  a: string;
  b: string;
  label: string;
  defaultModel: string;
  defaultSequence: string | null;
  defaultPrecision: string | null;
  ssrSummary: Record<string, PairSummary>;
  aLabel: string;
  bLabel: string;
  aVendor: string;
  bVendor: string;
  aArch: string;
  bArch: string;
}

function fmtNum(value: number | null, decimals: number): string {
  if (value === null) return '—';
  return value.toFixed(decimals);
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
  ssrSummary,
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

  const summaryA = ssrSummary[a];
  const summaryB = ssrSummary[b];
  const initialModel = toModel(defaultModel);
  const initialSequence = toSequence(defaultSequence);
  const initialPrecisions = toPrecisions(defaultPrecision);

  return (
    <GlobalFilterProvider
      initialModel={initialModel}
      initialSequence={initialSequence}
      initialPrecisions={initialPrecisions}
    >
      <InferenceProvider activeTab="compare" initialActiveHwTypes={[a, b]}>
        <Card className="flex flex-col gap-3">
          <header>
            <div className="text-xs uppercase tracking-wider text-muted-foreground">
              GPU comparison
            </div>
            <h1 className="text-2xl lg:text-3xl font-bold tracking-tight mt-1">{label}</h1>
            <p className="mt-2 text-sm text-muted-foreground max-w-3xl">
              Head-to-head AI inference benchmark comparison of <strong>{aLabel}</strong> ({aVendor}{' '}
              {aArch}) and <strong>{bLabel}</strong> ({bVendor} {bArch}). Latency, throughput, and
              cost across LLM workloads. Use the controls below to switch models, sequences,
              precisions, and metrics — same interactions as{' '}
              <Link href="/" className="underline hover:text-primary">
                the main inference chart
              </Link>
              .
            </p>
          </header>
          <PairSummaryGrid
            a={a}
            b={b}
            aLabel={aLabel}
            bLabel={bLabel}
            summaryA={summaryA}
            summaryB={summaryB}
            defaultModel={defaultModel}
          />
        </Card>
        <InferenceChartDisplay />
      </InferenceProvider>
    </GlobalFilterProvider>
  );
}

function PairSummaryGrid({
  a,
  b,
  aLabel,
  bLabel,
  summaryA,
  summaryB,
  defaultModel,
}: {
  a: string;
  b: string;
  aLabel: string;
  bLabel: string;
  summaryA: PairSummary | undefined;
  summaryB: PairSummary | undefined;
  defaultModel: string;
}) {
  if (!summaryA || !summaryB) return null;

  const rows: { label: string; aVal: string; bVal: string }[] = [
    {
      label: 'Best throughput / GPU (tok/s)',
      aVal: fmtNum(summaryA.bestThroughputPerGpu, 1),
      bVal: fmtNum(summaryB.bestThroughputPerGpu, 1),
    },
    {
      label: 'Best median TTFT (s)',
      aVal: fmtNum(summaryA.bestMedianTtft, 3),
      bVal: fmtNum(summaryB.bestMedianTtft, 3),
    },
    {
      label: 'Best median TPOT (s)',
      aVal: fmtNum(summaryA.bestMedianTpot, 4),
      bVal: fmtNum(summaryB.bestMedianTpot, 4),
    },
    {
      label: 'Benchmark configurations',
      aVal: String(summaryA.configCount),
      bVal: String(summaryB.configCount),
    },
  ];

  return (
    <div className="mt-2 border border-border/50 rounded-md overflow-hidden">
      <div className="px-3 py-2 text-xs text-muted-foreground bg-muted/30 border-b border-border/50">
        Latest results for {defaultModel} (best across all configurations) — explore more in the
        chart below.
      </div>
      <div className="grid grid-cols-3 text-sm" data-testid={`compare-summary-${a}-${b}`}>
        <div className="px-3 py-2 font-medium text-muted-foreground border-r border-border/40">
          Metric
        </div>
        <div className="px-3 py-2 font-medium border-r border-border/40">{aLabel}</div>
        <div className="px-3 py-2 font-medium">{bLabel}</div>
        {rows.map((row) => (
          <div key={row.label} className="contents">
            <div className="px-3 py-2 text-muted-foreground border-t border-border/40 border-r">
              {row.label}
            </div>
            <div className="px-3 py-2 border-t border-border/40 border-r font-mono">{row.aVal}</div>
            <div className="px-3 py-2 border-t border-border/40 font-mono">{row.bVal}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
