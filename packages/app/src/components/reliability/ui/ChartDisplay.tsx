'use client';

import { useCallback } from 'react';

import { useReliabilityContext } from '@/components/reliability/ReliabilityContext';
import { Card } from '@/components/ui/card';
import { ChartShareActions } from '@/components/ui/chart-display-helpers';
import { ChartSection } from '@/components/ui/chart-section';
import { DashboardSectionHeader } from '@/components/ui/dashboard-section-header';
import { Heading } from '@/components/ui/heading';
import { exportToCsv } from '@/lib/export/csv-export';
import { reliabilityChartToCsv } from '@/lib/export/csv-export-helpers';
import { useLocale } from '@/lib/i18n/use-locale';

import ReliabilityBarChartD3 from './BarChartD3';
import ReliabilityChartControls from './ChartControls';

const STRINGS = {
  en: {
    heading: 'Chip reliability',
    description:
      'Success rate percentages for inference runs across chip models, showing hardware reliability for inference runs over time',
    captionHeading: 'Success rate by chip model',
    captionSource: 'Source: SemiAnalysis InferenceX™',
  },
  zh: {
    heading: '芯片可靠性',
    description: '汇总所选时间范围内各芯片型号的推理运行成功率，用于比较硬件可靠性',
    captionHeading: '各芯片型号成功率',
    captionSource: '数据来源：SemiAnalysis InferenceX™',
  },
} as const;

export default function ReliabilityChartDisplay() {
  const CHART_ID = 'reliability-chart';
  const { setIsLegendExpanded, chartData, enabledModels } = useReliabilityContext();
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
            <ReliabilityChartControls />
          </div>
        </Card>
      </section>

      <ChartSection
        chartId={CHART_ID}
        analyticsPrefix="reliability"
        analyticsContext={{ gpu_count: enabledModels.size }}
        zoomResetEvent={`d3chart_zoom_reset_${CHART_ID}`}
        setIsLegendExpanded={setIsLegendExpanded}
        onExportCsv={handleExportCsv}
        exportFileName="InferenceX_reliability"
      >
        <ReliabilityBarChartD3
          caption={
            <>
              <div className="md:pr-24">
                <Heading as="h3" level="card">
                  {t.captionHeading}
                </Heading>
                <p className="text-sm text-muted-foreground">{t.captionSource}</p>
              </div>
            </>
          }
        />
      </ChartSection>
    </div>
  );
}
