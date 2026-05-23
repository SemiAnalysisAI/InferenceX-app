'use client';

import { useCallback, useMemo } from 'react';

import { EmbedLegendWrapper } from '@/components/embed/embed-legend-wrapper';
import { useInference } from '@/components/inference/InferenceContext';
import type { InferenceData, OverlayData } from '@/components/inference/types';
import ScatterGraph from '@/components/inference/ui/ScatterGraph';
import { processOverlayChartData } from '@/components/inference/utils';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useUnofficialRun } from '@/components/unofficial-run-provider';
import { track } from '@/lib/analytics';
import {
  type Model,
  type Precision,
  type Sequence,
  getModelLabel,
  getPrecisionLabel,
  getSequenceLabel,
} from '@/lib/data-mappings';

interface Props {
  /** Which chart to render — `e2e` or `interactivity`. Defaults to `e2e`. */
  chartType: 'e2e' | 'interactivity';
  /** Canonical dashboard URL for the attribution link in the caption. */
  canonicalHref: string;
}

/**
 * Slim version of `ChartDisplay` for embeds: renders only the requested
 * scatter chart with its caption, no controls / share buttons / changelog.
 *
 * Reads from the same `InferenceContext` as the dashboard so chart behavior
 * (legend, zoom, overlay rendering) stays consistent.
 */
export default function EmbedScatterDisplay({ chartType, canonicalHref }: Props) {
  const {
    graphs,
    loading,
    selectedYAxisMetric,
    selectedXAxisMetric,
    selectedE2eXAxisMetric,
    selectedPrecisions,
    selectedModel,
    selectedSequence,
  } = useInference();

  const { unofficialRunInfo, unofficialRunInfos, runIndexByUrl, getOverlayData } =
    useUnofficialRun();

  const overlayDataByChartType = useMemo(() => {
    if (!unofficialRunInfo || !getOverlayData) {
      return { e2e: null, interactivity: null };
    }
    const e2eRaw = getOverlayData(selectedModel, selectedSequence, 'e2e');
    const interactivityRaw = getOverlayData(selectedModel, selectedSequence, 'interactivity');

    const getRunForRow = (row: InferenceData) => {
      const url = row.run_url ?? null;
      if (!url) return undefined;
      if (url in runIndexByUrl) {
        const info = unofficialRunInfos[runIndexByUrl[url]];
        return info ? { branch: info.branch, url: info.url } : undefined;
      }
      const idMatch = url.match(/\/runs\/(\d+)/u);
      if (idMatch && idMatch[1] in runIndexByUrl) {
        const info = unofficialRunInfos[runIndexByUrl[idMatch[1]]];
        return info ? { branch: info.branch, url: info.url } : undefined;
      }
      return undefined;
    };

    const processData = (
      rawData: { data: InferenceData[]; hardwareConfig: any } | null,
      ct: 'e2e' | 'interactivity',
    ): OverlayData | null => {
      if (!rawData || rawData.data.length === 0) return null;
      const effectiveXMetric = ct === 'e2e' ? selectedE2eXAxisMetric : selectedXAxisMetric;
      const processed = processOverlayChartData(
        rawData.data,
        ct,
        selectedYAxisMetric,
        effectiveXMetric,
      );
      if (processed.length === 0) return null;
      return {
        data: processed,
        hardwareConfig: rawData.hardwareConfig,
        label: unofficialRunInfo.branch,
        runUrl: unofficialRunInfo.url,
        getRunForRow,
      };
    };

    return {
      e2e: processData(e2eRaw, 'e2e'),
      interactivity: processData(interactivityRaw, 'interactivity'),
    };
  }, [
    unofficialRunInfo,
    unofficialRunInfos,
    runIndexByUrl,
    getOverlayData,
    selectedModel,
    selectedSequence,
    selectedYAxisMetric,
    selectedXAxisMetric,
    selectedE2eXAxisMetric,
  ]);

  const targetGraph = useMemo(
    () => graphs.find((g) => g.chartDefinition.chartType === chartType) ?? graphs[0],
    [graphs, chartType],
  );

  const wrapLegend = useCallback(
    (legend: React.ReactNode) => <EmbedLegendWrapper>{legend}</EmbedLegendWrapper>,
    [],
  );

  const isFirstLoad = loading && graphs.length === 0;

  if (isFirstLoad || !targetGraph) {
    return (
      <Card data-testid="embed-scatter-skeleton" className="border-0 p-2 md:p-3">
        <Skeleton className="h-7 w-2/4 mb-1" />
        <Skeleton className="h-5 w-3/4 mb-2" />
        <Skeleton className="h-[420px] w-full" />
      </Card>
    );
  }

  const yLabel =
    (targetGraph.chartDefinition[
      `${selectedYAxisMetric}_label` as keyof typeof targetGraph.chartDefinition
    ] as string) || '';
  const yTitle =
    (targetGraph.chartDefinition[
      `${selectedYAxisMetric}_title` as keyof typeof targetGraph.chartDefinition
    ] as string) || '';
  const heading =
    (targetGraph.chartDefinition[
      `${selectedYAxisMetric}_heading` as keyof typeof targetGraph.chartDefinition
    ] as string) || targetGraph.chartDefinition.heading;

  const caption = (
    <>
      <h2 className="text-lg font-semibold">
        {yTitle} {heading}
      </h2>
      <p className="text-sm text-muted-foreground mb-2">
        {getModelLabel(targetGraph.model as Model)} •{' '}
        {selectedPrecisions.map((prec) => getPrecisionLabel(prec as Precision)).join(', ')} •{' '}
        {getSequenceLabel(targetGraph.sequence as Sequence)} • Source:{' '}
        <a
          data-testid="embed-attribution"
          href={canonicalHref}
          target="_blank"
          rel="noopener"
          onClick={() => track('embed_attribution_clicked', { href: canonicalHref })}
          className="inline-flex items-center gap-1 text-foreground underline-offset-2 hover:underline"
        >
          SemiAnalysis InferenceX
          <span aria-hidden>→</span>
        </a>
      </p>
    </>
  );

  const overlay =
    targetGraph.chartDefinition.chartType === 'e2e'
      ? overlayDataByChartType.e2e
      : overlayDataByChartType.interactivity;

  return (
    <figure
      data-testid="embed-scatter-figure"
      className="relative flex h-full min-h-0 flex-col rounded-lg"
    >
      <Card className="flex h-full min-h-0 flex-col border-0 p-2 md:p-3">
        <ScatterGraph
          chartId="embed-chart"
          modelLabel={targetGraph.model}
          data={targetGraph.data}
          xLabel={targetGraph.chartDefinition.x_label}
          yLabel={yLabel}
          chartDefinition={targetGraph.chartDefinition}
          caption={caption}
          overlayData={overlay ?? undefined}
          legendWrapper={wrapLegend}
          instructions=""
          disableLegendExpand={true}
          compactLegend={true}
          fillHeight
        />
      </Card>
    </figure>
  );
}
