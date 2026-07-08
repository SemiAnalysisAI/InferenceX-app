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
import { toModel, toSequence } from '@/lib/compare-enum-coerce';

interface SsrTableData {
  defaultTargets: number[];
  ssrRows: { target: number; a: InterpolatedResult | null; b: InterpolatedResult | null }[];
  interactivityRange: { min: number; max: number };
}

const STRINGS = {
  en: {
    eyebrowSuffix: 'Precision Comparison',
    h1Prefix: 'Precision Comparison',
    mainChartLinkText: 'the main inference chart',
    allComparisonsLinkText: 'All precision comparisons →',
    dashboardLinkText: 'Open the full dashboard →',
    caveatSeqFallback: 'sequence',
    emptyState:
      'No interpolated comparison data available for this precision pair. Use the chart controls below to select a different sequence with benchmark data for both precisions.',
  },
  zh: {
    eyebrowSuffix: '精度对比',
    h1Prefix: '精度对比',
    mainChartLinkText: '主推理图表',
    allComparisonsLinkText: '所有精度对比 →',
    dashboardLinkText: '打开完整仪表板 →',
    caveatSeqFallback: '序列',
    emptyState:
      '当前精度组合没有可用的插值对比数据。请使用下方图表控件选择一个两种精度均有基准测试数据的序列。',
  },
} as const;

interface ComparePrecisionPageClientProps {
  gpu: string;
  slug: string;
  modelLabel: string;
  defaultModel: string;
  defaultSequence: string | null;
  precA: string;
  precB: string;
  ssrTableData: SsrTableData;
  narrative: string[];
  gpuLabel: string;
  gpuVendor: string;
  gpuArch: string;
  aLabel: string;
  bLabel: string;
  heroImageSrc: string;
  locale?: 'en' | 'zh';
}

export default function ComparePrecisionPageClient({
  gpu,
  slug,
  modelLabel,
  defaultModel,
  defaultSequence,
  precA,
  precB,
  ssrTableData,
  narrative,
  gpuLabel,
  gpuVendor,
  gpuArch,
  aLabel,
  bLabel,
  heroImageSrc,
  locale = 'en',
}: ComparePrecisionPageClientProps) {
  useEffect(() => {
    track('compare_precision_page_view', {
      slug,
      gpu,
      prec_a: precA,
      prec_b: precB,
    });
  }, [slug, gpu, precA, precB]);

  const initialModel = toModel(defaultModel);
  const initialSequence = toSequence(defaultSequence);
  // Seed GlobalFilterProvider with both precisions so the chart renders data
  // for both quantization levels on load.
  const initialPrecisions = useMemo(() => [precA, precB], [precA, precB]);
  const t = STRINGS[locale];
  const isZh = locale === 'zh';

  return (
    <GlobalFilterProvider
      initialModel={initialModel}
      initialSequence={initialSequence}
      initialPrecisions={initialPrecisions}
    >
      <InferenceProvider activeTab="compare" initialActiveHwTypes={[gpu]}>
        <div className="flex flex-col gap-4">
          <Card className="flex w-full min-w-0 flex-col gap-3">
            <header>
              <div className="text-xs uppercase tracking-wider text-muted-foreground">
                {modelLabel} · {gpuLabel} · {t.eyebrowSuffix}
              </div>
              <h1 className="text-2xl lg:text-3xl font-bold tracking-tight mt-1">
                {gpuLabel}: {aLabel} vs {bLabel} {t.h1Prefix}
              </h1>
              {isZh ? (
                <p className="mt-2 text-sm text-muted-foreground max-w-3xl">
                  在 <strong>{gpuLabel}</strong>（{gpuVendor} {gpuArch}）上对比{' '}
                  <strong>{aLabel}</strong> 与 <strong>{bLabel}</strong> 精度对{' '}
                  <strong>{modelLabel}</strong> 推理的影响。涵盖各类 LLM
                  工作负载的吞吐量、延迟与成本。使用下方图表控件切换序列和指标——交互方式与
                  <Link href="/zh" className="underline hover:text-primary">
                    {t.mainChartLinkText}
                  </Link>
                  相同。
                </p>
              ) : (
                <p className="mt-2 text-sm text-muted-foreground max-w-3xl">
                  How <strong>{aLabel}</strong> and <strong>{bLabel}</strong> precision affect{' '}
                  <strong>{modelLabel}</strong> inference on <strong>{gpuLabel}</strong> (
                  {gpuVendor} {gpuArch}). Throughput, latency, and cost across LLM workloads. Use
                  the chart controls below to switch sequences and metrics — same interactions as{' '}
                  <Link href="/" className="underline hover:text-primary">
                    {t.mainChartLinkText}
                  </Link>
                  .
                </p>
              )}
              {narrative.length > 0 && (
                <div
                  className="mt-3 flex flex-col gap-2 max-w-3xl"
                  data-testid="compare-precision-narrative"
                >
                  {narrative.map((para, i) => (
                    <p key={i} className="text-sm text-foreground/80">
                      {para}
                      {i === narrative.length - 1 && (
                        <>
                          {' '}
                          <span className="text-muted-foreground italic">
                            {isZh
                              ? `（数据反映此 URL 的默认 ${defaultSequence ?? t.caveatSeqFallback} 选择——如果您在控件中更改序列或模型，下方表格和图表会自动更新。每一侧取该精度下的最优可用推理配置，可能包含投机解码（如 MTP）——与其他对比页面的口径一致。）`
                              : `(Numbers reflect the default ${defaultSequence ?? t.caveatSeqFallback} selection for this URL — table and chart below update if you change sequence or model in the controls. Each side uses the best available serving configuration for that precision, which may include speculative decoding such as MTP where recipes exist — the same convention as the other comparison pages.)`}
                          </span>
                        </>
                      )}
                    </p>
                  ))}
                </div>
              )}
              <div className="mt-2 flex flex-wrap gap-4 text-sm">
                <Link
                  href={isZh ? '/zh/compare-precision' : '/compare-precision'}
                  className="underline hover:text-primary text-muted-foreground"
                  onClick={() => track('compare_precision_cross_link_index', { slug })}
                >
                  {t.allComparisonsLinkText}
                </Link>
                <Link
                  href={isZh ? '/zh' : '/'}
                  className="underline hover:text-primary text-muted-foreground"
                  onClick={() => track('compare_precision_cross_link_dashboard', { slug })}
                >
                  {t.dashboardLinkText}
                </Link>
              </div>
            </header>
            <figure
              className="mt-2 flex flex-col gap-2"
              data-testid="compare-precision-indexed-image"
            >
              <img
                src={heroImageSrc}
                alt={
                  isZh
                    ? `${modelLabel}：${gpuLabel} 上 ${aLabel} 与 ${bLabel} 在相同交互性水平下的吞吐量与成本`
                    : `${modelLabel}: ${aLabel} versus ${bLabel} throughput and cost at matched interactivity levels on ${gpuLabel}`
                }
                width={1200}
                height={675}
                loading="eager"
                fetchPriority="high"
                className="w-full rounded-lg border border-border/50"
              />
              <figcaption className="text-xs text-muted-foreground">
                {isZh
                  ? `${gpuLabel} 上 ${aLabel} 与 ${bLabel} 在此对比默认工作负载下的吞吐量与每百万 token 成本。`
                  : `${aLabel} versus ${bLabel} throughput and cost per million tokens on ${gpuLabel} for this comparison's canonical default workload.`}
              </figcaption>
            </figure>
            <CompareTableSection
              gpu={gpu}
              precA={precA}
              precB={precB}
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
  gpu,
  precA,
  precB,
  aLabel,
  bLabel,
  ssrTableData,
  emptyStateText,
}: {
  gpu: string;
  precA: string;
  precB: string;
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

  // Partition client-side points by precision. Both sides share the same GPU,
  // so we match on the GPUDataPoint.precision field rather than hw key prefix.
  const { pointsA, pointsB } = useMemo(() => {
    const pA: GPUDataPoint[] = [];
    const pB: GPUDataPoint[] = [];
    for (const [groupKey, points] of Object.entries(gpuDataByGroupKey)) {
      // Only consider groups matching this GPU.
      const hwKey = groupKey.split('__')[0];
      if (hwKey !== gpu && !hwKey.startsWith(`${gpu}_`)) continue;
      for (const point of points) {
        if (point.precision === precA) pA.push(point);
        else if (point.precision === precB) pB.push(point);
      }
    }
    return { pointsA: pA, pointsB: pB };
  }, [gpuDataByGroupKey, gpu, precA, precB]);

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
    />
  );
}
