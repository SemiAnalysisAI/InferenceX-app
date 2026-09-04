'use client';

import Link from 'next/link';
import { useEffect, useMemo } from 'react';

import type { GPUDataPoint } from '@/components/calculator/types';
import { useThroughputData } from '@/components/calculator/useThroughputData';
import {
  CompareTableRenderer,
  type CompareTableData,
} from '@/components/compare/compare-table-renderer';
import {
  GlobalFilterProvider,
  useGlobalFilterAvailability,
  useGlobalFilterRun,
  useGlobalFilterSelection,
} from '@/components/GlobalFilterContext';
import { InferenceProvider } from '@/components/inference/InferenceContext';
import InferenceChartDisplay from '@/components/inference/ui/ChartDisplay';
import { Card } from '@/components/ui/card';
import { track } from '@/lib/analytics';
import type { BenchmarkRow } from '@/lib/api';
import { toCalculatorBenchmarkRows } from '@/lib/benchmark-api-view';
import { toModel, toPrecisions, toSequence } from '@/lib/compare-enum-coerce';
import type { AgenticScenarioIntro } from '@/lib/compare-ssr';

const STRINGS = {
  en: {
    eyebrowSuffix: 'Chip comparison',
    mainChartLinkText: 'the main inference chart',
    perDollarLinkText: 'View performance-per-dollar view →',
    caveatSeqFallback: 'sequence',
    caveatPrecFallback: 'precision',
    emptyState:
      'No interpolated comparison data available for the default model. Use the chart controls below to select a model with benchmark data for both chips.',
  },
  zh: {
    eyebrowSuffix: '芯片对比',
    mainChartLinkText: '主推理图表',
    perDollarLinkText: '查看每美元性能对比 →',
    caveatSeqFallback: '序列',
    caveatPrecFallback: '精度',
    emptyState:
      '默认模型暂时没有可用于插值对比的数据。请在下方图表控件中选择一个在两款芯片上都有基准测试数据的模型。',
  },
} as const;

interface ComparePageClientProps {
  a: string;
  b: string;
  /** Canonical compare slug (e.g. `deepseek-r1-h100-vs-h200`). Used for the
   *  cross-link to the sibling `/compare-per-dollar/<same-slug>` route. */
  slug: string;
  label: string;
  /** Human-readable model name from the slug — drives the eyebrow above the
   *  H1 so the URL-grouping ("Kimi K2.6", "GLM 5.1", etc.) is legible without
   *  scanning the URL bar. */
  modelLabel: string;
  defaultModel: string;
  defaultSequence: string | null;
  defaultPrecision: string | null;
  ssrTableData: CompareTableData;
  initialBenchmarkRows?: BenchmarkRow[];
  /** One SSR-rendered prose paragraph per interpolated-table row (default
   *  interactivity target). Each paragraph picks a template variant
   *  deterministically from the slug so prose stays stable across renders
   *  but varies across pages in the catalog. Empty array when there's no
   *  comparable data. */
  narrative: string[];
  /** Set only when the page is rendering the agentic workload. Explains what
   *  AgentX measures before the head-to-head numbers, since a reader who
   *  arrived from a GPU query has no reason to expect a replayed trace. */
  agenticIntro?: AgenticScenarioIntro | null;
  aLabel: string;
  bLabel: string;
  aVendor: string;
  bVendor: string;
  aArch: string;
  bArch: string;
  locale?: 'en' | 'zh';
}

export default function ComparePageClient({
  a,
  b,
  slug,
  label,
  modelLabel,
  defaultModel,
  defaultSequence,
  defaultPrecision,
  ssrTableData,
  initialBenchmarkRows,
  narrative,
  agenticIntro = null,
  aLabel,
  bLabel,
  aVendor,
  bVendor,
  aArch,
  bArch,
  locale = 'en',
}: ComparePageClientProps) {
  useEffect(() => {
    track('compare_page_view', { gpu_a: a, gpu_b: b, default_model: defaultModel });
  }, [a, b, defaultModel]);

  const compareGpuPair = useMemo(() => [a, b] as const, [a, b]);
  const initialModel = toModel(defaultModel);
  const initialSequence = toSequence(defaultSequence);
  const benchmarkQueryScope = `compare-pair:${a}:${b}`;
  const initialCalculatorRows = useMemo(
    () =>
      initialBenchmarkRows && defaultSequence
        ? toCalculatorBenchmarkRows(initialBenchmarkRows, defaultSequence)
        : undefined,
    [defaultSequence, initialBenchmarkRows],
  );
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
        benchmarkQueryScope={benchmarkQueryScope}
        initialBenchmarkModel={initialModel}
        initialBenchmarkRows={initialBenchmarkRows}
      >
        <div className="flex flex-col gap-4">
          <Card className="flex flex-col gap-3">
            <header>
              <div className="text-xs uppercase tracking-wider text-muted-foreground">
                {modelLabel} · {t.eyebrowSuffix}
              </div>
              {/* `vt-compare-title` pairs with the compare-catalog card the
                  visitor clicked for a cross-document shared-element morph
                  (see motion.css); inert without View Transitions support. */}
              <h1 className="vt-compare-title text-2xl lg:text-3xl font-bold tracking-tight mt-1">
                {label}
              </h1>
              {isZh ? (
                <p className="mt-2 text-sm text-muted-foreground max-w-3xl">
                  对比 <strong>{aLabel}</strong>（{aVendor} {aArch}）与 <strong>{bLabel}</strong>（
                  {bVendor} {bArch}）在 <strong>{modelLabel}</strong> 上的 AI
                  推理基准测试结果，涵盖不同 LLM
                  工作负载下的延迟、吞吐量和成本。可通过下方图表控件切换序列长度、精度和指标，操作方式与
                  <Link href="/zh" className="underline hover:text-primary">
                    {t.mainChartLinkText}
                  </Link>
                  相同。
                </p>
              ) : (
                <p className="mt-2 text-sm text-muted-foreground max-w-3xl">
                  Head-to-head AI inference benchmark comparison of <strong>{aLabel}</strong> (
                  {aVendor} {aArch}) and <strong>{bLabel}</strong> ({bVendor} {bArch}) on{' '}
                  <strong>{modelLabel}</strong>. Latency, throughput, and cost across LLM workloads.
                  Use the chart controls below to switch sequences, precisions, and metrics — same
                  interactions as{' '}
                  <Link href="/" className="underline hover:text-primary">
                    {t.mainChartLinkText}
                  </Link>
                  .
                </p>
              )}
              {agenticIntro && (
                <p
                  className="mt-3 max-w-3xl text-sm text-foreground/80"
                  data-testid="compare-agentic-intro"
                >
                  {agenticIntro.paragraph}{' '}
                  <Link
                    href={agenticIntro.href}
                    data-testid="compare-agentic-intro-link"
                    className="font-medium text-brand underline underline-offset-4 hover:no-underline"
                  >
                    {agenticIntro.linkLabel} →
                  </Link>
                </p>
              )}
              {narrative.length > 0 && (
                <div className="mt-3 flex flex-col gap-2 max-w-3xl" data-testid="compare-narrative">
                  {narrative.map((para, i) => (
                    <p key={i} className="text-sm text-foreground/80">
                      {para}
                      {i === narrative.length - 1 && (
                        <>
                          {' '}
                          <span className="text-muted-foreground italic">
                            {isZh
                              ? `（以上数据基于此 URL 对应的默认 ${defaultSequence ?? t.caveatSeqFallback} · ${defaultPrecision ?? t.caveatPrecFallback} 配置；在控件中切换序列长度、精度或模型后，下方表格和图表会同步更新。）`
                              : `(Numbers reflect the default ${defaultSequence ?? t.caveatSeqFallback} · ${defaultPrecision ?? t.caveatPrecFallback} selection for this URL — table and chart below update if you change sequence, precision, or model in the controls.)`}
                          </span>
                        </>
                      )}
                    </p>
                  ))}
                </div>
              )}
              <p className="mt-2 text-sm">
                <Link
                  href={isZh ? `/zh/compare-per-dollar/${slug}` : `/compare-per-dollar/${slug}`}
                  className="underline hover:text-primary text-muted-foreground"
                  onClick={() => track('compare_cross_link_to_per_dollar', { slug })}
                >
                  {t.perDollarLinkText}
                </Link>
              </p>
            </header>
            <CompareTableSection
              a={a}
              b={b}
              aLabel={aLabel}
              bLabel={bLabel}
              ssrTableData={ssrTableData}
              initialModel={initialModel}
              initialSequence={initialSequence}
              initialCalculatorRows={initialCalculatorRows}
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
  initialModel,
  initialSequence,
  initialCalculatorRows,
  emptyStateText,
}: {
  a: string;
  b: string;
  aLabel: string;
  bLabel: string;
  ssrTableData: CompareTableData;
  initialModel: ReturnType<typeof toModel>;
  initialSequence: ReturnType<typeof toSequence>;
  initialCalculatorRows?: BenchmarkRow[];
  emptyStateText: string;
}) {
  const { effectiveSequence, effectivePrecisions, selectedModel, sequenceResolved } =
    useGlobalFilterSelection();
  const { availableDates } = useGlobalFilterAvailability();
  const { selectedRunDate } = useGlobalFilterRun();
  const latestAvailableDate = availableDates.at(-1) ?? '';
  const calculatorRunDate =
    selectedRunDate && selectedRunDate === latestAvailableDate ? '' : selectedRunDate;
  const initialRows =
    initialCalculatorRows &&
    sequenceResolved &&
    selectedModel === initialModel &&
    effectiveSequence === initialSequence &&
    calculatorRunDate === ''
      ? initialCalculatorRows
      : undefined;

  const { gpuDataByGroupKey, ranges, hasData } = useThroughputData(
    selectedModel,
    effectiveSequence,
    effectivePrecisions,
    calculatorRunDate,
    undefined,
    undefined,
    initialRows,
    sequenceResolved,
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

  return (
    <CompareTableRenderer
      aLabel={aLabel}
      bLabel={bLabel}
      ssrTableData={ssrTableData}
      interactivityRange={clientRange}
      gpuDataPointsA={pointsA}
      gpuDataPointsB={pointsB}
      emptyStateText={emptyStateText}
    />
  );
}
