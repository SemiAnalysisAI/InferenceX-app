'use client';

import { useCallback } from 'react';

import { useReliabilityContext } from '@/components/reliability/ReliabilityContext';
import { Card } from '@/components/ui/card';
import { ChartShareActions } from '@/components/ui/chart-display-helpers';
import { ChartSection } from '@/components/ui/chart-section';
import { DashboardSectionHeader } from '@/components/ui/dashboard-section-header';
import { Heading } from '@/components/ui/heading';
import { UnofficialDomainNotice } from '@/components/ui/unofficial-domain-notice';
import { exportToCsv } from '@/lib/csv-export';
import { reliabilityChartToCsv } from '@/lib/csv-export-helpers';
import { useLocale } from '@/lib/use-locale';

import ReliabilityBarChartD3 from './BarChartD3';
import ReliabilityChartControls from './ChartControls';

const STRINGS = {
  en: {
    heading: 'Chip Reliability',
    description:
      'Success rate percentages for inference runs across chip models, showing hardware reliability for inference runs over time.',
    captionHeading: 'Success Rate by Chip Model',
    captionSource: 'Source: SemiAnalysis InferenceX™',
    filterLabel: 'Chart filters',
    filterHint: 'Choose a time window to recalculate the success-rate summary below.',
  },
  zh: {
    heading: '芯片可靠性',
    description: '汇总所选时间范围内各芯片型号的推理运行成功率，用于比较硬件可靠性。',
    captionHeading: '各芯片型号成功率',
    captionSource: '数据来源：SemiAnalysis InferenceX™',
    filterLabel: '图表筛选',
    filterHint: '选择时间范围后，下面的成功率汇总会按该范围重新计算。',
  },
} as const;

export default function ReliabilityChartDisplay() {
  const CHART_ID = 'reliability-chart';
  const { setIsLegendExpanded, chartData } = useReliabilityContext();
  const t = STRINGS[useLocale()];

  const handleExportCsv = useCallback(() => {
    const { headers, rows } = reliabilityChartToCsv(chartData);
    exportToCsv('InferenceX_reliability', headers, rows);
  }, [chartData]);

  return (
    <div data-testid="reliability-chart-display" className="flex flex-col gap-4">
      <section>
        <Card>
          <div className="flex flex-col gap-4">
            <DashboardSectionHeader
              title={t.heading}
              description={t.description}
              actions={<ChartShareActions />}
            />
            <div className="border-t border-border/60 pt-4">
              <div className="mb-3">
                <h3 className="text-sm font-semibold">{t.filterLabel}</h3>
                <p className="text-xs text-muted-foreground">{t.filterHint}</p>
              </div>
              <ReliabilityChartControls />
            </div>
          </div>
        </Card>
      </section>

      <ChartSection
        chartId={CHART_ID}
        analyticsPrefix="reliability"
        zoomResetEvent={`d3chart_zoom_reset_${CHART_ID}`}
        setIsLegendExpanded={setIsLegendExpanded}
        onExportCsv={handleExportCsv}
        exportFileName="InferenceX_reliability"
      >
        <ReliabilityBarChartD3
          caption={
            <>
              <Heading as="h3" level="card">
                {t.captionHeading}
              </Heading>
              <p className="text-sm text-muted-foreground">{t.captionSource}</p>
              <UnofficialDomainNotice />
            </>
          }
        />
      </ChartSection>
    </div>
  );
}
