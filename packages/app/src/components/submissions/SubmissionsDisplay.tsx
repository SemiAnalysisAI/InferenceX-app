'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

import { track, trackOncePerPageview } from '@/lib/analytics/analytics';
import { Card } from '@/components/ui/card';
import { ChartSection } from '@/components/ui/chart-section';
import { ChartShareActions } from '@/components/ui/chart-display-helpers';
import { DashboardSectionHeader } from '@/components/ui/dashboard-section-header';
import { EmptyState } from '@/components/ui/empty-state';
import { Heading, HeadingQualifier } from '@/components/ui/heading';
import { ResultContext } from '@/components/ui/result-context';
import { RetryableQueryError } from '@/components/ui/retryable-query-error';
import { SegmentedToggle, type SegmentedToggleOption } from '@/components/ui/segmented-toggle';
import { Stat } from '@/components/ui/stat';
import { exportToCsv } from '@/lib/export/csv-export';
import { submissionsVolumeToCsv } from '@/lib/export/csv-export-helpers';
import { useSubmissions } from '@/hooks/api/use-submissions';
import { useLocale } from '@/lib/i18n/use-locale';

import SubmissionsChart, { type ChartMode } from './SubmissionsChart';
import SubmissionsTable from './SubmissionsTable';
import { computeTotalStats } from './submissions-utils';

const CHART_ID = 'submissions-chart';

const STRINGS = {
  en: {
    heading: 'Benchmark submissions',
    description:
      'All benchmark configurations submitted to InferenceX, with submission history, activity trends and datapoint volumes',
    modeWeekly: 'Weekly',
    modeCumulative: 'Cumulative',
    loadingChart: 'Loading chart data…',
    loadingTable: 'Loading submissions…',
    errorText: 'Failed to load submission data',
    noChartData: 'No submission activity data is available',
    noTableData: 'No submission records are available',
    chartModeAria: 'Chart mode',
    chartCaption: 'Submission activity',
    qualifierWeekly: 'Weekly datapoints by vendor',
    qualifierCumulative: 'Cumulative datapoints by vendor',
    chartSource: 'SemiAnalysis InferenceX™',
    statDatapoints: 'Datapoints generated',
    statConfigs: 'Distinct configurations',
    statModels: 'Unique models',
    statHardware: 'Unique hardware',
    subtitleResults: 'results',
    subtitleTested: 'tested',
    subtitleLLMs: 'LLMs',
    subtitleSKUs: 'SKUs',
    tableCaption: 'Submission records',
    tableHint: 'Search, sort, or expand a row to inspect the exact benchmark configuration',
  },
  zh: {
    heading: '基准测试提交',
    description: '所有提交至 InferenceX 的基准测试配置，包括提交历史、活动趋势和数据点数量',
    modeWeekly: '按周',
    modeCumulative: '累计',
    loadingChart: '正在加载图表数据……',
    loadingTable: '正在加载提交记录……',
    errorText: '加载提交数据失败',
    noChartData: '暂无提交活动数据',
    noTableData: '暂无提交记录',
    chartModeAria: '图表模式',
    chartCaption: '提交活动',
    qualifierWeekly: '按厂商统计的每周数据点',
    qualifierCumulative: '按厂商统计的累计数据点',
    chartSource: 'SemiAnalysis InferenceX™',
    statDatapoints: '已生成数据点',
    statConfigs: '不同配置数',
    statModels: '模型数',
    statHardware: '硬件类型',
    subtitleResults: '条结果',
    subtitleTested: '个配置',
    subtitleLLMs: '个 LLM',
    subtitleSKUs: '种 SKU',
    tableCaption: '提交记录',
    tableHint: '可搜索、排序，或展开行查看完整的基准测试配置',
  },
} as const;

export default function SubmissionsDisplay() {
  const { data, isLoading, error, refetch } = useSubmissions();
  const locale = useLocale();
  const t = STRINGS[locale];
  const numberLocale = locale === 'zh' ? 'zh-CN' : undefined;
  const [chartMode, setChartMode] = useState<ChartMode>('weekly');

  const chartModeOptions = useMemo<SegmentedToggleOption<ChartMode>[]>(
    () => [
      { value: 'weekly', label: t.modeWeekly, testId: 'submissions-weekly-btn' },
      { value: 'cumulative', label: t.modeCumulative, testId: 'submissions-cumulative-btn' },
    ],
    [t],
  );

  useEffect(() => {
    trackOncePerPageview('submissions_page_viewed');
  }, []);

  const handleModeChange = useCallback((mode: ChartMode) => {
    setChartMode(mode);
    track('submissions_chart_toggled', { mode });
  }, []);

  const handleExportCsv = useCallback(() => {
    if (!data?.volume) return;
    const { headers, rows } = submissionsVolumeToCsv(data.volume);
    exportToCsv('InferenceX_submissions', headers, rows);
  }, [data?.volume]);

  const stats = useMemo(() => {
    if (!data?.summary) return null;
    return computeTotalStats(data.summary);
  }, [data?.summary]);

  const latestDate = useMemo(
    () =>
      data?.volume.reduce<string | undefined>(
        (latest, row) => (!latest || row.date > latest ? row.date : latest),
        undefined,
      ),
    [data?.volume],
  );

  if (error) {
    return (
      <RetryableQueryError
        message={t.errorText}
        analyticsEvent="submissions_retry_clicked"
        onRetry={refetch}
        testId="submissions-error"
      />
    );
  }

  return (
    <div data-testid="submissions-display" className="flex flex-col gap-4">
      <section>
        <Card>
          <DashboardSectionHeader
            title={t.heading}
            description={t.description}
            actions={<ChartShareActions />}
          />
          {stats && (
            <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-4 border-t border-border/30 pt-4 md:grid-cols-4">
              {[
                {
                  label: t.statDatapoints,
                  value: stats.totalDatapoints,
                  subtitle: t.subtitleResults,
                },
                { label: t.statConfigs, value: stats.totalConfigs, subtitle: t.subtitleTested },
                { label: t.statModels, value: stats.uniqueModels, subtitle: t.subtitleLLMs },
                { label: t.statHardware, value: stats.uniqueGpus, subtitle: t.subtitleSKUs },
              ]
                .toSorted((a, b) => b.value - a.value)
                .map((s) => (
                  <Stat
                    key={s.label}
                    size="lg"
                    label={s.label}
                    value={s.value.toLocaleString(numberLocale)}
                    detail={s.subtitle}
                  />
                ))}
            </dl>
          )}
        </Card>
      </section>

      <ChartSection
        chartId={CHART_ID}
        analyticsPrefix="submissions"
        zoomResetEvent={`d3chart_zoom_reset_${CHART_ID}`}
        onExportCsv={handleExportCsv}
        exportFileName="InferenceX_submissions"
        leadingControls={
          <SegmentedToggle
            value={chartMode}
            options={chartModeOptions}
            onValueChange={handleModeChange}
            ariaLabel={t.chartModeAria}
            testId="submissions-mode-toggle"
            className="shrink-0"
          />
        }
      >
        {isLoading ? (
          <EmptyState bare role="status" className="h-150">
            {t.loadingChart}
          </EmptyState>
        ) : data?.volume && data.volume.length > 0 ? (
          <SubmissionsChart
            volume={data.volume}
            mode={chartMode}
            caption={
              <div className="md:pr-72">
                <Heading as="h3" level="card">
                  {t.chartCaption}
                  <HeadingQualifier>
                    {chartMode === 'weekly' ? t.qualifierWeekly : t.qualifierCumulative}
                  </HeadingQualifier>
                </Heading>
              </div>
            }
            footer={
              <ResultContext
                locale={locale}
                layout="footer"
                date={latestDate}
                source={t.chartSource}
              />
            }
          />
        ) : (
          <EmptyState bare className="h-150">
            {t.noChartData}
          </EmptyState>
        )}
      </ChartSection>

      <section>
        <Card>
          <div className="mb-4">
            <Heading as="h2" level="card">
              {t.tableCaption}
            </Heading>
            <p className="mt-1 text-sm text-muted-foreground">{t.tableHint}</p>
          </div>
          {isLoading ? (
            <EmptyState bare role="status" className="h-32">
              {t.loadingTable}
            </EmptyState>
          ) : data?.summary && data.summary.length > 0 ? (
            <SubmissionsTable data={data.summary} />
          ) : (
            <EmptyState bare className="h-32">
              {t.noTableData}
            </EmptyState>
          )}
        </Card>
      </section>
    </div>
  );
}
