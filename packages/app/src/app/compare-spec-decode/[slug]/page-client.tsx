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
import { toModel, toPrecisions, toSequence } from '@/lib/compare-enum-coerce';
import { SPEC_METHODS_ACTIVE } from '@/lib/compare-variant-slug';

interface SsrTableData {
  defaultTargets: number[];
  ssrRows: { target: number; a: InterpolatedResult | null; b: InterpolatedResult | null }[];
  interactivityRange: { min: number; max: number };
}

const STRINGS = {
  en: {
    eyebrowSuffix: 'Speculative Decoding',
    h1Suffix: 'Speculative Decoding',
    mainChartLinkText: 'the main inference chart',
    indexLinkText: 'View all speculative decoding comparisons',
    dashboardLinkText: 'View on dashboard',
    caveatSeqFallback: 'sequence',
    caveatPrecFallback: 'precision',
    emptyState:
      'No interpolated data available for the default workload on this configuration. Use the chart controls below to select a sequence and precision with benchmark data for both configurations.',
    mtpCaveatTitle: 'MTP acceptance-rate comparability',
    mtpCaveat:
      'MTP acceptance-rate implementations differ across inference engines. Points from different engines are not directly comparable on the same curve — throughput and cost at matched interactivity may reflect engine-level differences rather than pure speculative decoding gains. Interpret cross-engine comparisons with caution.',
  },
  zh: {
    eyebrowSuffix: '投机解码',
    h1Suffix: '投机解码',
    mainChartLinkText: '主推理图表',
    indexLinkText: '查看所有投机解码对比',
    dashboardLinkText: '在仪表板查看',
    caveatSeqFallback: '序列',
    caveatPrecFallback: '精度',
    emptyState:
      '当前默认工作负载在此配置上没有可用的插值数据。请使用下方图表控件选择一个两种配置均有基准测试数据的序列和精度。',
    mtpCaveatTitle: 'MTP 接受率可比性',
    mtpCaveat:
      'MTP 接受率实现在不同推理引擎间存在差异。不同引擎的数据点在同一曲线上不可直接比较——在相同交互性水平下的吞吐量和成本差异可能反映的是引擎层面的差异，而非纯投机解码收益。请谨慎解读跨引擎对比。',
  },
} as const;

/** y_costh = Cost per Million Total Tokens (Owning - Hyperscaler). */
const DEFAULT_Y_AXIS = 'y_costh';

interface CompareSpecDecodePageClientProps {
  gpu: string;
  method: string;
  slug: string;
  modelLabel: string;
  modelDisplayName: string;
  defaultSequence: string | null;
  defaultPrecision: string | null;
  ssrTableData: SsrTableData;
  narrative: string[];
  gpuLabel: string;
  precisionLabel: string;
  gpuArch: string;
  gpuVendor: string;
  aLabel: string;
  bLabel: string;
  heroImageSrc: string;
  locale?: 'en' | 'zh';
}

export default function CompareSpecDecodePageClient({
  gpu,
  method,
  slug,
  modelLabel,
  modelDisplayName,
  defaultSequence,
  defaultPrecision,
  ssrTableData,
  narrative,
  gpuLabel,
  precisionLabel,
  gpuArch,
  gpuVendor,
  aLabel,
  bLabel,
  heroImageSrc,
  locale = 'en',
}: CompareSpecDecodePageClientProps) {
  const isZh = locale === 'zh';
  const t = STRINGS[locale];

  useEffect(() => {
    track('compare_spec_decode_page_view', { slug, gpu, method });
  }, [slug, gpu, method]);

  const initialModel = toModel(modelDisplayName);
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
        initialActiveHwTypes={[gpu]}
        compareGpuPair={[gpu, gpu]}
        initialYAxisMetric={DEFAULT_Y_AXIS}
      >
        <div className="flex flex-col gap-4">
          <Card className="flex w-full min-w-0 flex-col gap-3">
            <header>
              <div className="text-xs uppercase tracking-wider text-muted-foreground">
                {modelLabel} · {t.eyebrowSuffix}
              </div>
              <h1 className="text-2xl lg:text-3xl font-bold tracking-tight mt-1">
                {gpuLabel} {precisionLabel}: {aLabel} vs {bLabel} {t.h1Suffix}
              </h1>
              {isZh ? (
                <p className="mt-2 text-sm text-muted-foreground">
                  <strong>{aLabel}</strong> 与 <strong>{bLabel}</strong> 在{' '}
                  <strong>{gpuLabel}</strong> {precisionLabel}（{gpuVendor} {gpuArch}）上运行{' '}
                  <strong>{modelLabel}</strong> 的投机解码对比。在各类 LLM
                  工作负载下的吞吐量、成本和交互性差异。使用下方图表控件切换序列和指标——交互方式与
                  <Link href="/zh" className="underline hover:text-primary">
                    {t.mainChartLinkText}
                  </Link>
                  相同。
                </p>
              ) : (
                <p className="mt-2 text-sm text-muted-foreground">
                  Speculative decoding comparison of <strong>{aLabel}</strong> versus{' '}
                  <strong>{bLabel}</strong> on <strong>{gpuLabel}</strong> {precisionLabel} (
                  {gpuVendor} {gpuArch}) running <strong>{modelLabel}</strong>. Throughput, cost,
                  and interactivity differences across LLM workloads. Use the chart controls below
                  to switch sequences and metrics — same interactions as{' '}
                  <Link href="/" className="underline hover:text-primary">
                    {t.mainChartLinkText}
                  </Link>
                  .
                </p>
              )}
              {/* MTP engine caveat disclaimer */}
              <div
                className="mt-3 flex items-start gap-2 rounded-md border-l-2 border-amber-500 bg-amber-500/5 px-3 py-2"
                data-testid="compare-spec-decode-mtp-caveat"
              >
                <div className="flex flex-col gap-1">
                  <span className="text-xs font-semibold text-amber-600 dark:text-amber-400">
                    {isZh ? t.mtpCaveatTitle : STRINGS.en.mtpCaveatTitle}
                  </span>
                  <p className="text-xs text-muted-foreground">
                    {isZh ? t.mtpCaveat : STRINGS.en.mtpCaveat}
                  </p>
                </div>
              </div>
              {narrative.length > 0 && (
                <div
                  className="mt-3 flex flex-col gap-2"
                  data-testid="compare-spec-decode-narrative"
                >
                  {narrative.map((para, i) => (
                    <p key={i} className="text-sm text-foreground/80">
                      {para}
                      {i === narrative.length - 1 && (
                        <>
                          {' '}
                          <span className="text-muted-foreground italic">
                            {isZh
                              ? `（数据反映此 URL 固定的 ${defaultSequence ?? t.caveatSeqFallback} · ${defaultPrecision ?? t.caveatPrecFallback} 工作负载——更改序列或模型时表格和图表都会更新；本页表格始终锁定该精度，图表中的精度切换仅影响图表。）`
                              : `(Numbers reflect this URL's pinned ${defaultSequence ?? t.caveatSeqFallback} · ${defaultPrecision ?? t.caveatPrecFallback} workload — changing sequence or model updates both the table and chart; the table stays pinned to this page's precision, so precision toggles in the controls affect the chart only.)`}
                          </span>
                        </>
                      )}
                    </p>
                  ))}
                </div>
              )}
              <div className="mt-2 flex flex-wrap gap-4 text-sm">
                <Link
                  href={isZh ? '/zh/compare-spec-decode' : '/compare-spec-decode'}
                  className="underline hover:text-primary text-muted-foreground"
                  onClick={() => track('compare_spec_decode_cross_link_to_index', { slug })}
                >
                  {t.indexLinkText} →
                </Link>
                <Link
                  href={isZh ? '/zh' : '/'}
                  className="underline hover:text-primary text-muted-foreground"
                  onClick={() => track('compare_spec_decode_cross_link_to_dashboard', { slug })}
                >
                  {t.dashboardLinkText} →
                </Link>
              </div>
            </header>
            <figure
              className="mt-2 flex flex-col gap-2"
              data-testid="compare-spec-decode-indexed-image"
            >
              <img
                src={heroImageSrc}
                alt={
                  isZh
                    ? `${modelLabel}：${gpuLabel} ${precisionLabel} 上 ${aLabel} 与 ${bLabel} 在相同交互性水平下的投机解码对比`
                    : `${modelLabel}: ${gpuLabel} ${precisionLabel} ${aLabel} versus ${bLabel} speculative decoding comparison at matched interactivity levels`
                }
                width={1200}
                height={675}
                loading="eager"
                fetchPriority="high"
                className="w-full rounded-lg border border-border/50"
              />
              <figcaption className="text-xs text-muted-foreground">
                {isZh
                  ? `${gpuLabel} ${precisionLabel} 上 ${aLabel} 与 ${bLabel} 的投机解码对比（默认工作负载）。`
                  : `${gpuLabel} ${precisionLabel} ${aLabel} versus ${bLabel} speculative decoding comparison for this page's canonical default workload.`}
              </figcaption>
            </figure>
            <CompareTableSection
              gpu={gpu}
              method={method}
              precision={defaultPrecision}
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
  method,
  precision,
  aLabel,
  bLabel,
  ssrTableData,
  emptyStateText,
}: {
  gpu: string;
  method: string;
  precision: string | null;
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

  // Partition client-side data points by speculative decoding:
  // Side A = hw keys carrying the method suffix (e.g. _mtp)
  // Side B = hw keys for the base GPU without any spec-decode suffix
  const { pointsA, pointsB } = useMemo(() => {
    const pA: GPUDataPoint[] = [];
    const pB: GPUDataPoint[] = [];
    const methodSuffix = `_${method}`;
    for (const [groupKey, points] of Object.entries(gpuDataByGroupKey)) {
      const hwKey = groupKey.split('__')[0];
      // Must belong to this GPU. Keys are framework-qualified (h200_sglang).
      if (hwKey !== gpu && !hwKey.startsWith(`${gpu}_`)) continue;
      // getHardwareKey appends the spec-decode suffix LAST (h200_sglang_mtp),
      // so side membership is decided by the key's ending.
      const isSideA = hwKey.endsWith(methodSuffix);
      const isSideB = !isSideA && ![...SPEC_METHODS_ACTIVE].some((m) => hwKey.endsWith(`_${m}`));
      if (!isSideA && !isSideB) continue;
      for (const point of points) {
        // The slug pins one precision — ignore points from other precisions
        // the user may enable in the chart controls.
        if (precision !== null && point.precision !== precision) continue;
        (isSideA ? pA : pB).push(point);
      }
    }
    return { pointsA: pA, pointsB: pB };
  }, [gpuDataByGroupKey, gpu, method, precision]);

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
