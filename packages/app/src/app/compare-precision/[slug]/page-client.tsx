'use client';

import { IntentPrefetchLink } from '@/components/ui/intent-prefetch-link';
import { useEffect, useMemo } from 'react';

import type { GPUDataPoint } from '@/components/calculator/types';
import { useThroughputData } from '@/components/calculator/useThroughputData';
import { CompareTableRenderer } from '@/components/compare/compare-table-renderer';
import { LazyCompareInferenceChart } from '@/components/compare/lazy-compare-inference-chart';
import {
  GlobalFilterProvider,
  useGlobalFilterAvailability,
  useGlobalFilterRun,
  useGlobalFilterSelection,
} from '@/providers/GlobalFilterContext';
import { Card } from '@/components/ui/card';
import { track, trackOncePerPageview } from '@/lib/analytics/analytics';
import { toModel, toScenario } from '@/lib/compare/compare-enum-coerce';
import type { AgenticScenarioIntro } from '@/lib/compare/compare-ssr';
import type { CompareTableData } from '@/lib/compare/compare-table-view';

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
      '这组精度暂时没有可用于插值对比的数据。请在下方图表控件中选择一个两种精度都有基准测试数据的序列长度。',
  },
} as const;

interface ComparePrecisionPageClientProps {
  gpu: string;
  slug: string;
  modelLabel: string;
  defaultModel: string;
  defaultScenario: string | null;
  precA: string;
  precB: string;
  ssrTableData: CompareTableData;
  narrative: string[];
  agenticIntro?: AgenticScenarioIntro | null;
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
  defaultScenario,
  precA,
  precB,
  ssrTableData,
  narrative,
  agenticIntro = null,
  gpuLabel,
  gpuVendor,
  gpuArch,
  aLabel,
  bLabel,
  heroImageSrc,
  locale = 'en',
}: ComparePrecisionPageClientProps) {
  useEffect(() => {
    trackOncePerPageview(
      'compare_precision_page_view',
      { slug, gpu, model: defaultModel, precisions: [precA, precB] },
      slug,
    );
  }, [slug, gpu, defaultModel, precA, precB]);

  const initialModel = toModel(defaultModel);
  const initialScenario = toScenario(defaultScenario);
  const initialPrecisions = useMemo(() => [precA, precB], [precA, precB]);
  const t = STRINGS[locale];
  const isZh = locale === 'zh';

  return (
    <GlobalFilterProvider
      initialModel={initialModel}
      initialScenario={initialScenario}
      initialPrecisions={initialPrecisions}
    >
      <div className="flex flex-col gap-4">
        <Card className="flex w-full min-w-0 flex-col gap-3">
          <header>
            <p className="text-sm text-muted-foreground">
              {modelLabel} · {gpuLabel} · {t.eyebrowSuffix}
            </p>
            <h1 className="mt-1 text-2xl font-semibold text-balance lg:text-3xl">
              {isZh
                ? `${gpuLabel}：${aLabel} 与 ${bLabel} ${t.h1Prefix}`
                : `${gpuLabel}: ${aLabel} vs ${bLabel} ${t.h1Prefix}`}
            </h1>
            {isZh ? (
              <p className="mt-2 text-sm text-muted-foreground max-w-3xl">
                在 <strong>{gpuLabel}</strong>（{gpuVendor} {gpuArch}）上，比较{' '}
                <strong>{aLabel}</strong> 与 <strong>{bLabel}</strong> 两种量化精度对{' '}
                <strong>{modelLabel}</strong> 推理的影响，涵盖不同 LLM
                工作负载下的吞吐量、延迟和成本。可通过下方图表控件切换序列长度和指标，操作方式与
                <IntentPrefetchLink href="/zh" className="underline hover:text-primary">
                  {t.mainChartLinkText}
                </IntentPrefetchLink>
                相同。
              </p>
            ) : (
              <p className="mt-2 text-sm text-muted-foreground max-w-3xl">
                How <strong>{aLabel}</strong> and <strong>{bLabel}</strong> precision affect{' '}
                <strong>{modelLabel}</strong> inference on <strong>{gpuLabel}</strong> ({gpuVendor}{' '}
                {gpuArch}). Throughput, latency, and cost across LLM workloads. Use the chart
                controls below to switch sequences and metrics — same interactions as{' '}
                <IntentPrefetchLink href="/" className="underline hover:text-primary">
                  {t.mainChartLinkText}
                </IntentPrefetchLink>
                .
              </p>
            )}
            {agenticIntro && (
              <p
                className="mt-3 max-w-3xl text-sm text-foreground"
                data-testid="compare-agentic-intro"
              >
                {agenticIntro.paragraph}{' '}
                <IntentPrefetchLink
                  href={agenticIntro.href}
                  data-testid="compare-agentic-intro-link"
                  className="font-medium text-brand underline underline-offset-4 hover:no-underline"
                >
                  {agenticIntro.linkLabel} →
                </IntentPrefetchLink>
              </p>
            )}
            {narrative.length > 0 && (
              <div
                className="mt-3 flex flex-col gap-2 max-w-3xl"
                data-testid="compare-precision-narrative"
              >
                {narrative.map((para, i) => (
                  <p key={i} className="text-sm text-foreground">
                    {para}
                    {i === narrative.length - 1 && (
                      <>
                        {' '}
                        <span className="text-muted-foreground">
                          {isZh
                            ? `（以上数据基于此 URL 对应的默认 ${defaultScenario ?? t.caveatSeqFallback} 配置；在控件中切换序列长度或模型后，下方表格和图表会同步更新。两侧均采用各自精度下可用的最优推理配置；只有存在相应测试配置时，才可能纳入 MTP 等投机解码方法。该口径与其他对比页面一致。）`
                            : `(Numbers reflect the default ${defaultScenario ?? t.caveatSeqFallback} selection for this URL — table and chart below update if you change sequence or model in the controls. Each side uses the best available serving configuration for that precision, which may include speculative decoding such as MTP where recipes exist — the same convention as the other comparison pages.)`}
                        </span>
                      </>
                    )}
                  </p>
                ))}
              </div>
            )}
            <div className="mt-2 flex flex-wrap gap-4 text-sm">
              <IntentPrefetchLink
                href={isZh ? '/zh/compare-precision' : '/compare-precision'}
                className="text-muted-foreground underline hover:text-foreground"
                onClick={() => track('compare_precision_cross_link_index', { slug })}
              >
                {t.allComparisonsLinkText}
              </IntentPrefetchLink>
              <IntentPrefetchLink
                href={isZh ? '/zh' : '/'}
                className="text-muted-foreground underline hover:text-foreground"
                onClick={() => track('compare_precision_cross_link_dashboard', { slug })}
              >
                {t.dashboardLinkText}
              </IntentPrefetchLink>
            </div>
          </header>
          <CompareTableSection
            gpu={gpu}
            precA={precA}
            precB={precB}
            aLabel={aLabel}
            bLabel={bLabel}
            ssrTableData={ssrTableData}
            ssrScenario={defaultScenario}
            ssrModel={initialModel}
            ssrPrecisions={initialPrecisions}
            emptyStateText={t.emptyState}
          />
          <figure
            className="mt-2 flex max-w-sm flex-col gap-2"
            data-testid="compare-precision-indexed-image"
          >
            <a href={heroImageSrc} target="_blank" rel="noopener noreferrer">
              <img
                src={heroImageSrc}
                alt={
                  isZh
                    ? `${modelLabel}：${gpuLabel} 上 ${aLabel} 与 ${bLabel} 在相同交互性水平下的吞吐量与成本`
                    : `${modelLabel}: ${aLabel} versus ${bLabel} throughput and cost at matched interactivity levels on ${gpuLabel}`
                }
                width={1200}
                height={675}
                loading="lazy"
                className="w-full rounded-lg"
              />
            </a>
            <figcaption className="text-xs text-muted-foreground">
              {isZh
                ? `${gpuLabel} 上 ${aLabel} 与 ${bLabel} 在此对比默认工作负载下的吞吐量与每百万 token 成本`
                : `${aLabel} versus ${bLabel} throughput and cost per million tokens on ${gpuLabel} for this comparison's canonical default workload`}
            </figcaption>
            <a
              href={heroImageSrc}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-foreground underline underline-offset-2"
            >
              {isZh ? '查看大图 ↗' : 'Open full-size image ↗'}
            </a>
          </figure>
        </Card>
        <LazyCompareInferenceChart activeTab="compare" initialActiveHwTypes={[gpu]} />
      </div>
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
  ssrScenario,
  ssrModel,
  ssrPrecisions,
  emptyStateText,
}: {
  gpu: string;
  precA: string;
  precB: string;
  aLabel: string;
  bLabel: string;
  ssrTableData: CompareTableData;
  ssrScenario: string | null;
  ssrModel: ReturnType<typeof toModel>;
  ssrPrecisions: string[];
  emptyStateText: string;
}) {
  const {
    selectedScenario,
    effectiveScenario,
    effectivePrecisions,
    selectedModel,
    selectedPrecisions,
    scenarioResolved,
  } = useGlobalFilterSelection();
  const { selectedRunDate } = useGlobalFilterRun();
  const { availableDates } = useGlobalFilterAvailability();

  const { gpuDataByGroupKey, ranges, hasData, loading, error } = useThroughputData(
    selectedModel,
    effectiveScenario,
    effectivePrecisions,
    selectedRunDate,
  );

  const { pointsA, pointsB } = useMemo(() => {
    const pA: GPUDataPoint[] = [];
    const pB: GPUDataPoint[] = [];
    for (const [groupKey, points] of Object.entries(gpuDataByGroupKey)) {
      const hwKey = groupKey.split('__')[0];
      if (hwKey !== gpu && !hwKey.startsWith(`${gpu}_`)) continue;
      for (const point of points) {
        if (point.precision === precA) pA.push(point);
        else if (point.precision === precB) pB.push(point);
      }
    }
    return { pointsA: pA, pointsB: pB };
  }, [gpuDataByGroupKey, gpu, precA, precB]);

  return (
    <CompareTableRenderer
      aLabel={aLabel}
      bLabel={bLabel}
      ssrTableData={ssrTableData}
      ssrScenario={ssrScenario}
      ssrModel={ssrModel}
      ssrPrecisions={ssrPrecisions}
      selectedScenario={selectedScenario}
      effectiveScenario={effectiveScenario}
      scenarioResolved={scenarioResolved}
      selectedModel={selectedModel}
      selectedPrecisions={selectedPrecisions}
      effectivePrecisions={effectivePrecisions}
      latestRun={!selectedRunDate || selectedRunDate === availableDates.at(-1)}
      pointsA={pointsA}
      pointsB={pointsB}
      clientInteractivityRange={hasData ? ranges.interactivity : null}
      loading={loading}
      error={error}
      emptyStateText={emptyStateText}
    />
  );
}
