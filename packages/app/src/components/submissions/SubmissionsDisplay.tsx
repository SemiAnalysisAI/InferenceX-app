'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

import { track } from '@/lib/analytics';
import { Card } from '@/components/ui/card';
import { ChartButtons } from '@/components/ui/chart-buttons';
import { ChartShareActions } from '@/components/ui/chart-display-helpers';
import { SegmentedToggle, type SegmentedToggleOption } from '@/components/ui/segmented-toggle';
import { exportToCsv } from '@/lib/csv-export';
import { submissionsVolumeToCsv } from '@/lib/csv-export-helpers';
import { useSubmissions } from '@/hooks/api/use-submissions';
import { useLocale } from '@/lib/use-locale';

import SubmissionsChart, { type ChartMode } from './SubmissionsChart';
import SubmissionsTable from './SubmissionsTable';
import { computeTotalStats } from './submissions-utils';

const CHART_ID = 'submissions-chart';

const STRINGS = {
  en: {
    heading: 'Benchmark Submissions',
    description:
      'All benchmark configurations submitted to InferenceX. View submission history, activity trends, and datapoint volumes.',
    modeWeekly: 'Weekly',
    modeCumulative: 'Cumulative',
    loadingChart: 'Loading chart data...',
    loadingTable: 'Loading submissions...',
    errorText: 'Failed to load submission data.',
    chartCaption: 'Submission Activity',
    chartSource: 'Source: SemiAnalysis InferenceX™',
    statDatapoints: 'Datapoints Generated',
    statConfigs: 'Distinct Configurations',
    statModels: 'Unique Models',
    statHardware: 'Unique Hardware',
    subtitleResults: 'results',
    subtitleTested: 'tested',
    subtitleLLMs: 'LLMs',
    subtitleSKUs: 'SKUs',
  },
  zh: {
    heading: '基准测试提交',
    description: '所有提交至 InferenceX 的基准测试配置。查看提交历史、活动趋势和数据点数量。',
    modeWeekly: '按周',
    modeCumulative: '累计',
    loadingChart: '正在加载图表数据...',
    loadingTable: '正在加载提交记录...',
    errorText: '加载提交数据失败。',
    chartCaption: '提交活动',
    chartSource: '数据来源：SemiAnalysis InferenceX™',
    statDatapoints: '已生成数据点',
    statConfigs: '不同配置数',
    statModels: '模型数',
    statHardware: '硬件类型',
    subtitleResults: '条结果',
    subtitleTested: '已测试',
    subtitleLLMs: '个 LLM',
    subtitleSKUs: '种 SKU',
  },
} as const;

export default function SubmissionsDisplay() {
  const { data, isLoading, error } = useSubmissions();
  const t = STRINGS[useLocale()];
  const [chartMode, setChartMode] = useState<ChartMode>('weekly');

  const chartModeOptions = useMemo<SegmentedToggleOption<ChartMode>[]>(
    () => [
      { value: 'weekly', label: t.modeWeekly, testId: 'submissions-weekly-btn' },
      { value: 'cumulative', label: t.modeCumulative, testId: 'submissions-cumulative-btn' },
    ],
    [t],
  );

  useEffect(() => {
    track('submissions_page_viewed');
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

  if (error) {
    return (
      <Card>
        <p className="text-destructive text-sm">{t.errorText}</p>
      </Card>
    );
  }

  return (
    <div data-testid="submissions-display" className="flex flex-col gap-4">
      {/* Header */}
      <section>
        <Card>
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-lg font-semibold mb-2">{t.heading}</h2>
              <p className="text-muted-foreground text-sm">{t.description}</p>
            </div>
            <div className="flex items-center gap-1.5">
              <ChartShareActions />
            </div>
          </div>
        </Card>
      </section>

      {/* Stats summary */}
      {stats && (
        <section>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
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
                <StatCard
                  key={s.label}
                  label={s.label}
                  value={s.value.toLocaleString()}
                  subtitle={s.subtitle}
                />
              ))}
          </div>
        </section>
      )}

      {/* Activity chart */}
      <section>
        <figure className="relative rounded-lg">
          <ChartButtons
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
                ariaLabel="Chart mode"
                testId="submissions-mode-toggle"
                className="shrink-0"
              />
            }
          />
          <Card>
            {isLoading ? (
              <div className="h-[600px] flex items-center justify-center text-muted-foreground text-sm">
                {t.loadingChart}
              </div>
            ) : data?.volume ? (
              <SubmissionsChart
                volume={data.volume}
                mode={chartMode}
                caption={
                  <>
                    <h3 className="text-lg font-semibold">{t.chartCaption}</h3>
                    <p className="text-sm text-muted-foreground">{t.chartSource}</p>
                  </>
                }
              />
            ) : null}
          </Card>
        </figure>
      </section>

      {/* Submissions table */}
      <section>
        <Card>
          {isLoading ? (
            <div className="h-32 flex items-center justify-center text-muted-foreground text-sm">
              {t.loadingTable}
            </div>
          ) : data?.summary ? (
            <SubmissionsTable data={data.summary} />
          ) : null}
        </Card>
      </section>
    </div>
  );
}

function StatCard({ label, value, subtitle }: { label: string; value: string; subtitle?: string }) {
  return (
    <Card className="p-4">
      <p className="text-sm font-medium text-muted-foreground">{label}</p>
      <p className="text-2xl font-bold tabular-nums">
        {value}{' '}
        {subtitle && <span className="text-sm font-normal text-muted-foreground">{subtitle}</span>}
      </p>
    </Card>
  );
}
