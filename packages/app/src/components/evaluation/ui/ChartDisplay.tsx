'use client';

import { useCallback } from 'react';

import { useEvaluation } from '@/components/evaluation/EvaluationContext';
import { Card } from '@/components/ui/card';
import { ChartSection } from '@/components/ui/chart-section';
import { ShareButton } from '@/components/ui/share-button';
import { ShareTwitterButton, ShareLinkedInButton } from '@/components/share-buttons';
import { getPrecisionLabel, isModelExperimental, Model, Precision } from '@/lib/data-mappings';
import { exportToCsv } from '@/lib/csv-export';
import { evaluationChartToCsv } from '@/lib/csv-export-helpers';

import EvaluationChartControls from './ChartControls';
import EvalBarChartD3 from './BarChartD3';

export default function EvaluationChartDisplay() {
  const CHART_ID = 'evaluation-chart';
  const {
    selectedModel,
    selectedRunDate,
    selectedBenchmark,
    setIsLegendExpanded,
    chartData,
    selectedPrecisions,
  } = useEvaluation();

  const handleExportCsv = useCallback(() => {
    const { headers, rows } = evaluationChartToCsv(chartData);
    exportToCsv(`InferenceX_evaluation_${selectedModel}_${selectedBenchmark}`, headers, rows);
  }, [chartData]);

  return (
    <div data-testid="evaluation-chart-display" className="flex flex-col gap-4">
      <section className="relative z-10">
        <Card>
          <div className="flex flex-col gap-4">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-lg font-semibold mb-2">Accuracy Evals</h2>
                <p className="text-muted-foreground text-sm mb-4">
                  Benchmark results showing model quality versus throughput trade-offs across
                  different GPUs, quantization levels, and inference configurations.
                </p>
              </div>
              <div className="flex items-center gap-1.5">
                <ShareButton />
                <div className="hidden sm:flex items-center gap-1.5">
                  <ShareTwitterButton />
                  <ShareLinkedInButton />
                </div>
              </div>
            </div>
            <EvaluationChartControls />
          </div>
        </Card>
      </section>

      <ChartSection
        chartId={CHART_ID}
        analyticsPrefix="evaluation"
        setIsLegendExpanded={setIsLegendExpanded}
        onExportCsv={handleExportCsv}
        exportFileName={`InferenceX_evaluation_${selectedModel}_${selectedBenchmark}`}
      >
        <EvalBarChartD3
          caption={
            <>
              <h3 className="text-lg font-semibold">Evaluation Score by Hardware Configuration</h3>
              <p className="text-sm text-muted-foreground mb-2">
                {selectedModel} •{' '}
                {selectedPrecisions.map((p) => getPrecisionLabel(p as Precision)).join(', ')} •{' '}
                {selectedBenchmark} • Source: SemiAnalysis InferenceX™
                {selectedRunDate && (
                  <>
                    {' '}
                    • Updated:{' '}
                    {new Date(selectedRunDate + 'T00:00:00Z').toLocaleDateString('en-US', {
                      year: 'numeric',
                      month: '2-digit',
                      day: '2-digit',
                      timeZone: 'UTC',
                    })}
                  </>
                )}
              </p>
              <div
                className={`overflow-hidden transition-all duration-200 ease-in-out ${
                  selectedModel && isModelExperimental(selectedModel as Model)
                    ? 'max-h-20 opacity-100'
                    : 'max-h-0 opacity-0'
                }`}
              >
                <p className="text-muted-foreground text-xs mt-2 border-l-2 border-amber-500 pl-2 bg-amber-500/5 py-1">
                  <strong>Note:</strong> We at SemiAnalysis InferenceX™ are still in very early
                  stages of adding support for this model. Please keep that in mind that these
                  InferenceX numbers are experimental.
                </p>
              </div>
            </>
          }
        />
      </ChartSection>
    </div>
  );
}
