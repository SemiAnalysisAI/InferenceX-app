'use client';

import { useCallback, useMemo, useState } from 'react';
import { BarChart3, Table2 } from 'lucide-react';

import { track } from '@/lib/analytics';
import { useLocale } from '@/lib/use-locale';
import { useEvaluation } from '@/components/evaluation/EvaluationContext';
import EvaluationTable from '@/components/evaluation/ui/EvaluationTable';
import { Card } from '@/components/ui/card';
import { ChartShareActions } from '@/components/ui/chart-display-helpers';
import { ChartSection } from '@/components/ui/chart-section';
import { DashboardSectionHeader } from '@/components/ui/dashboard-section-header';
import { Heading } from '@/components/ui/heading';
import { UnofficialDomainNotice } from '@/components/ui/unofficial-domain-notice';
import { ResultContext } from '@/components/ui/result-context';
import { type SegmentedToggleOption, SegmentedToggle } from '@/components/ui/segmented-toggle';
import { RetryableQueryError } from '@/components/ui/retryable-query-error';
import { Skeleton } from '@/components/ui/skeleton';
import { useUnofficialRun } from '@/components/unofficial-run-provider';
import { type Precision, getPrecisionLabel } from '@/lib/data-mappings';
import { exportToCsv } from '@/lib/csv-export';
import { evaluationChartToCsv } from '@/lib/csv-export-helpers';
import type { Locale } from '@/lib/i18n';

import EvaluationChartControls from './ChartControls';
import EvalBarChartD3, { formatEvaluationDate } from './BarChartD3';

type EvalViewMode = 'chart' | 'table';

export function evaluationCaptionDate(date: string, locale: Locale): string {
  if (locale === 'zh') return formatEvaluationDate(date, locale);
  return new Date(`${date}T00:00:00Z`).toLocaleDateString('en-US', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone: 'UTC',
  });
}

export const EVALUATION_DISPLAY_STRINGS = {
  en: {
    chartView: 'Chart',
    tableView: 'Table',
    viewModeAria: 'View mode',
    heading: 'Accuracy Evals',
    description:
      'Benchmark results showing model quality versus throughput trade-offs across different chips, quantization levels, and inference configurations.',
    captionHeading: 'Evaluation Score by Hardware Configuration',
    scoreMetric: 'Score',
    sourceUnofficial: 'Source: UNOFFICIAL',
    sourceOfficial: 'Source: SemiAnalysis InferenceX™',
    updated: 'Updated:',
    queryError: 'Failed to load evaluation data.',
    availabilityError: 'Failed to load filter availability data.',
    combinedError: 'Failed to load evaluation and filter availability data.',
    tableLoading: 'Loading evaluation data…',
  },
  zh: {
    chartView: '图表',
    tableView: '表格',
    viewModeAria: '视图模式',
    heading: '准确率评估',
    description: '基准测试结果展示不同芯片、量化精度和推理配置下，模型质量与吞吐量之间的权衡。',
    captionHeading: '各硬件配置的评估得分',
    scoreMetric: '得分',
    sourceUnofficial: '来源：非官方',
    sourceOfficial: '来源：SemiAnalysis InferenceX™',
    updated: '更新时间：',
    queryError: '评估数据加载失败。',
    availabilityError: '筛选项可用性数据加载失败。',
    combinedError: '评估数据与筛选项可用性数据均加载失败。',
    tableLoading: '正在加载评估数据……',
  },
};

export function evaluationTableDisplayState({
  isEvaluationDataSettled,
  isEvaluationDataError,
  hasDisplayData,
}: {
  isEvaluationDataSettled: boolean;
  isEvaluationDataError: boolean;
  hasDisplayData: boolean;
}): 'loading' | 'ready' | 'error' {
  if (hasDisplayData) return 'ready';
  if (isEvaluationDataError) return 'error';
  return isEvaluationDataSettled ? 'ready' : 'loading';
}

export default function EvaluationChartDisplay() {
  const locale = useLocale();
  const t = EVALUATION_DISPLAY_STRINGS[locale];
  const CHART_ID = 'evaluation-chart';
  const {
    selectedModel,
    selectedRunDate,
    selectedBenchmark,
    setIsLegendExpanded,
    chartData,
    unofficialChartData,
    selectedPrecisions,
    isError,
    isAvailabilityError,
    isEvaluationDataError,
    isEvaluationDataSettled,
    retry,
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
  const tableDisplayState = evaluationTableDisplayState({
    isEvaluationDataSettled,
    isEvaluationDataError,
    hasDisplayData: tableData.length > 0,
  });
  const handleViewModeChange = (value: EvalViewMode) => {
    setViewMode(value);
    track('evaluation_view_changed', { view: value });
  };

  const viewModeOptions = useMemo(
    (): SegmentedToggleOption<EvalViewMode>[] => [
      {
        value: 'chart',
        label: t.chartView,
        icon: <BarChart3 className="size-3.5" />,
        testId: 'evaluation-chart-view-btn',
      },
      {
        value: 'table',
        label: t.tableView,
        icon: <Table2 className="size-3.5" />,
        testId: 'evaluation-table-view-btn',
      },
    ],
    [t],
  );

  const handleExportCsv = useCallback(() => {
    const { headers, rows } = evaluationChartToCsv(chartData);
    exportToCsv(`InferenceX_evaluation_${selectedModel}_${selectedBenchmark}`, headers, rows);
  }, [chartData]);

  const caption = (
    <>
      <Heading as="h3" level="card">
        {t.captionHeading}
      </Heading>
      <ResultContext
        locale={locale}
        model={selectedModel ?? '—'}
        workload={selectedBenchmark?.toUpperCase() ?? '—'}
        precision={selectedPrecisions.map((p) => getPrecisionLabel(p as Precision)).join(', ')}
        metric={t.scoreMetric}
        date={selectedRunDate ? evaluationCaptionDate(selectedRunDate, locale) : undefined}
        source={
          isUnofficialRun
            ? locale === 'zh'
              ? 'SemiAnalysis InferenceX™ + 非官方 overlays'
              : 'SemiAnalysis InferenceX™ + UNOFFICIAL overlays'
            : 'SemiAnalysis InferenceX™'
        }
      />
      <UnofficialDomainNotice />
    </>
  );

  return (
    <div data-testid="evaluation-chart-display" className="flex flex-col gap-4">
      <section className="relative z-10">
        <Card>
          <div className="flex flex-col gap-4">
            <DashboardSectionHeader
              title={t.heading}
              description={t.description}
              actions={<ChartShareActions />}
            />
            <EvaluationChartControls />
          </div>
        </Card>
      </section>

      <ChartSection
        chartId={CHART_ID}
        mobileActions
        analyticsPrefix="evaluation"
        setIsLegendExpanded={setIsLegendExpanded}
        onExportCsv={handleExportCsv}
        exportFileName={`InferenceX_evaluation_${selectedModel}_${selectedBenchmark}`}
        hideImageExport={viewMode === 'table'}
        leadingControls={
          <SegmentedToggle
            value={viewMode}
            options={viewModeOptions}
            onValueChange={handleViewModeChange}
            ariaLabel={t.viewModeAria}
            testId="evaluation-view-toggle"
          />
        }
      >
        <>
          {isError && (
            <RetryableQueryError
              message={
                isAvailabilityError && isEvaluationDataError
                  ? t.combinedError
                  : isEvaluationDataError
                    ? t.queryError
                    : t.availabilityError
              }
              analyticsEvent="evaluation_data_retry_clicked"
              onRetry={retry}
              testId="evaluation-query-error"
            />
          )}
          {tableDisplayState !== 'error' &&
            (viewMode === 'table' ? (
              tableDisplayState === 'loading' ? (
                <div
                  role="status"
                  aria-live="polite"
                  data-testid="evaluation-table-loading"
                  className="space-y-3 py-3"
                >
                  <p className="text-sm text-muted-foreground">{t.tableLoading}</p>
                  <Skeleton className="h-8 w-1/3" />
                  <Skeleton className="h-64 w-full" />
                </div>
              ) : (
                <>
                  {caption}
                  <EvaluationTable data={tableData} />
                </>
              )
            ) : (
              <EvalBarChartD3 caption={caption} />
            ))}
        </>
      </ChartSection>
    </div>
  );
}
