'use client';

import { useCallback, useMemo, useState } from 'react';
import { BarChart3, Table2 } from 'lucide-react';

import { track } from '@/lib/analytics';
import { useEvaluation } from '@/components/evaluation/EvaluationContext';
import EvaluationTable from '@/components/evaluation/ui/EvaluationTable';
import { Card } from '@/components/ui/card';
import { ChartShareActions } from '@/components/ui/chart-display-helpers';
import { ChartSection } from '@/components/ui/chart-section';
import { UnofficialDomainNotice } from '@/components/ui/unofficial-domain-notice';
import { type SegmentedToggleOption, SegmentedToggle } from '@/components/ui/segmented-toggle';
import { useUnofficialRun } from '@/components/unofficial-run-provider';
import {
  type Model,
  type Precision,
  getPrecisionLabel,
  isModelExperimental,
} from '@/lib/data-mappings';
import { exportToCsv } from '@/lib/csv-export';
import { evaluationChartToCsv } from '@/lib/csv-export-helpers';

import EvaluationChartControls from './ChartControls';
import EvalBarChartD3 from './BarChartD3';

type EvalViewMode = 'chart' | 'table';

const VIEW_MODE_OPTIONS: SegmentedToggleOption<EvalViewMode>[] = [
  {
    value: 'chart',
    label: 'Chart',
    icon: <BarChart3 className="size-3.5" />,
    testId: 'evaluation-chart-view-btn',
  },
  {
    value: 'table',
    label: 'Table',
    icon: <Table2 className="size-3.5" />,
    testId: 'evaluation-table-view-btn',
  },
];

export default function EvaluationChartDisplay() {
  const CHART_ID = 'evaluation-chart';
  const {
    selectedModel,
    selectedRunDate,
    selectedBenchmark,
    setIsLegendExpanded,
    chartData,
    unofficialChartData,
    selectedPrecisions,
  } = useEvaluation();
  const { isUnofficialRun } = useUnofficialRun();
  // In unofficial-run mode the bar chart already shows both, but the table only
  // takes one input. Merge the unofficial rows in so users can drill into samples
  // for unofficial configs via the live-fetch path.
  const tableData = useMemo(
    () => (isUnofficialRun ? [...chartData, ...unofficialChartData] : chartData),
    [isUnofficialRun, chartData, unofficialChartData],
  );

  const [viewMode, setViewMode] = useState<EvalViewMode>('table');
  const handleViewModeChange = (value: EvalViewMode) => {
    setViewMode(value);
    track('evaluation_view_changed', { view: value });
  };

  const handleExportCsv = useCallback(() => {
    const { headers, rows } = evaluationChartToCsv(chartData);
    exportToCsv(`InferenceX_evaluation_${selectedModel}_${selectedBenchmark}`, headers, rows);
  }, [chartData]);

  const caption = (
    <>
      <h3 className="text-lg font-semibold">Evaluation Score by Hardware Configuration</h3>
      <p className="text-sm text-muted-foreground mb-2">
        {selectedModel} •{' '}
        {selectedPrecisions.map((p) => getPrecisionLabel(p as Precision)).join(', ')} •{' '}
        {selectedBenchmark} •{' '}
        {isUnofficialRun ? 'Source: UNOFFICIAL' : 'Source: SemiAnalysis InferenceX™'}
        {selectedRunDate && (
          <>
            {' '}
            • Updated:{' '}
            {new Date(`${selectedRunDate}T00:00:00Z`).toLocaleDateString('en-US', {
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
          <strong>Note:</strong> We at SemiAnalysis InferenceX™ are still in very early stages of
          adding support for this model. Please keep that in mind that these InferenceX numbers are
          experimental.
        </p>
      </div>
      <UnofficialDomainNotice />
    </>
  );

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
              <ChartShareActions />
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
        hideImageExport={viewMode === 'table'}
        leadingControls={
          <SegmentedToggle
            value={viewMode}
            options={VIEW_MODE_OPTIONS}
            onValueChange={handleViewModeChange}
            ariaLabel="View mode"
            testId="evaluation-view-toggle"
          />
        }
      >
        {viewMode === 'table' ? (
          <>
            {caption}
            <EvaluationTable data={tableData} />
          </>
        ) : (
          <EvalBarChartD3 caption={caption} />
        )}
      </ChartSection>
    </div>
  );
}
