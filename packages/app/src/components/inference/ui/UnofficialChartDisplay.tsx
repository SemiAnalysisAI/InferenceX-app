'use client';

import { useEffect, useMemo } from 'react';

import chartDefinitions from '@/components/inference/inference-chart-config.json';
import { useInference } from '@/components/inference/InferenceContext';
import {
  ChartDefinition,
  HardwareConfig,
  InferenceData,
  RenderableGraph,
  YAxisMetricKey,
} from '@/components/inference/types';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useUnofficialRun } from '@/components/unofficial-run-provider';
import { HARDWARE_CONFIG } from '@/lib/constants';

import ScatterGraph from './ScatterGraph';

export function UnofficialChartDisplay() {
  const { unofficialChartData, unofficialRunInfo, loading, error, availableModelsAndSequences } =
    useUnofficialRun();
  const {
    selectedModel,
    selectedSequence,
    selectedPrecisions,
    selectedYAxisMetric,
    setSelectedModel,
    setSelectedSequence,
  } = useInference();

  // Auto-select a model/sequence that has data when unofficial run loads
  useEffect(() => {
    if (availableModelsAndSequences.length > 0 && unofficialChartData) {
      // Check if current selection has data
      const currentHasData = availableModelsAndSequences.some(
        (item) => item.model === selectedModel && item.sequence === selectedSequence,
      );

      if (!currentHasData) {
        // Find the first available combination
        const first = availableModelsAndSequences[0];
        setSelectedModel(first.model);
        setSelectedSequence(first.sequence);
      }
    }
  }, [
    availableModelsAndSequences,
    unofficialChartData,
    selectedModel,
    selectedSequence,
    setSelectedModel,
    setSelectedSequence,
  ]);

  // Generate the key to look up unofficial data
  const dataKey = useMemo(() => {
    // Model and Sequence enum values are the strings used as API response keys directly
    return `${selectedModel}_${selectedSequence}`;
  }, [selectedModel, selectedSequence]);

  // Create graphs with hardware config for unofficial data
  interface UnofficialGraph extends RenderableGraph {
    hardwareConfig: HardwareConfig;
  }

  const graphs: UnofficialGraph[] = useMemo(() => {
    if (!unofficialChartData || !unofficialChartData[dataKey]) {
      return [];
    }

    const chartData = unofficialChartData[dataKey];

    return (chartDefinitions as ChartDefinition[]).map((chartDef) => {
      const dataForChart = chartDef.chartType === 'e2e' ? chartData.e2e : chartData.interactivity;

      const metricKey = selectedYAxisMetric.replace('y_', '') as YAxisMetricKey;

      const processedData =
        dataForChart.data.length > 0 && metricKey in dataForChart.data[0]
          ? dataForChart.data.map((d: InferenceData) => {
              const yValue = (d[metricKey] as { y: number })?.y || d.y;
              const roof = (d[metricKey] as { roof: boolean })?.roof ?? false;

              return {
                ...d,
                y: yValue,
                roof,
              };
            })
          : [];

      const yLabelKey = `${selectedYAxisMetric}_label` as keyof ChartDefinition;
      const dynamicYLabel = chartDef[yLabelKey];

      return {
        model: selectedModel,
        sequence: selectedSequence,
        chartDefinition: {
          ...chartDef,
          y_label: dynamicYLabel === null ? undefined : String(dynamicYLabel),
        },
        data: processedData,
        hardwareConfig: Object.fromEntries(
          Object.entries(dataForChart.gpus || {}).map(([k, v]) => [
            k,
            { ...v, ...HARDWARE_CONFIG[k] },
          ]),
        ),
      };
    });
  }, [unofficialChartData, dataKey, selectedYAxisMetric, selectedModel, selectedSequence]);

  if (loading) {
    return (
      <section>
        <Card>
          <div className="flex items-center gap-2 mb-4">
            <Skeleton className="h-6 w-32" />
            <Skeleton className="h-6 w-48" />
          </div>
          <Skeleton className="h-[400px] w-full" />
        </Card>
      </section>
    );
  }

  if (error) {
    return (
      <section>
        <Card>
          <div className="text-red-600 p-4">
            <h3 className="font-semibold">Error loading unofficial run data</h3>
            <p className="text-sm">{error}</p>
          </div>
        </Card>
      </section>
    );
  }

  if (!unofficialChartData || graphs.every((g) => g.data.length === 0)) {
    return (
      <section>
        <Card>
          <div className="text-muted-foreground p-4">
            <h3 className="font-semibold">No data available</h3>
            <p className="text-sm">
              No benchmark data found for the selected model ({selectedModel}) and sequence (
              {selectedSequence}) in this unofficial run.
            </p>
            <p className="text-sm mt-2">
              Available data keys: {Object.keys(unofficialChartData || {}).join(', ') || 'none'}
            </p>
          </div>
        </Card>
      </section>
    );
  }

  return (
    <>
      {graphs.map((graph, graphIndex) => (
        <section key={graphIndex}>
          <figure>
            <Card>
              <ScatterGraph
                chartId={`unofficial-chart-${graphIndex}`}
                modelLabel={graph.model}
                data={graph.data}
                xLabel={graph.chartDefinition.x_label}
                yLabel={`${
                  graph.chartDefinition[
                    `${selectedYAxisMetric}_label` as keyof typeof graph.chartDefinition
                  ]
                }`}
                chartDefinition={graph.chartDefinition}
                showAllHardwareTypes={true}
                hardwareConfigOverride={graph.hardwareConfig}
                caption={
                  <>
                    <div className="flex items-center gap-2 mb-2">
                      <Badge variant="destructive" className="text-lg px-3 py-1">
                        NON-OFFICIAL
                      </Badge>
                      <span className="text-sm text-muted-foreground">
                        Branch: {unofficialRunInfo?.branch}
                      </span>
                    </div>
                    <h2 className="text-lg font-semibold">
                      {
                        graph.chartDefinition[
                          `${selectedYAxisMetric}_title` as keyof typeof graph.chartDefinition
                        ]
                      }{' '}
                      {graph.chartDefinition[
                        `${selectedYAxisMetric}_heading` as keyof typeof graph.chartDefinition
                      ] || graph.chartDefinition.heading}
                    </h2>
                    <p className="text-sm text-muted-foreground mb-2">
                      {graph.model} • {selectedPrecisions.join(', ')} • {graph.sequence}
                    </p>
                  </>
                }
              />
            </Card>
          </figure>
        </section>
      ))}
    </>
  );
}
