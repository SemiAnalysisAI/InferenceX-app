'use client';

import { useCallback } from 'react';

import { useReliabilityContext } from '@/components/reliability/ReliabilityContext';
import { Card } from '@/components/ui/card';
import { ChartShareActions } from '@/components/ui/chart-display-helpers';
import { ChartSection } from '@/components/ui/chart-section';
import { UnofficialDomainNotice } from '@/components/ui/unofficial-domain-notice';
import { exportToCsv } from '@/lib/csv-export';
import { reliabilityChartToCsv } from '@/lib/csv-export-helpers';
import { useLocale } from '@/lib/use-locale';

import ReliabilityBarChartD3 from './BarChartD3';
import ReliabilityChartControls from './ChartControls';

const STRINGS = {
  en: {
    heading: 'GPU Reliability',
    description:
      'Success rate percentages for inference runs across GPU models, showing hardware reliability for inference runs over time.',
    captionHeading: 'Success Rate by GPU Model',
    captionSource: 'Source: SemiAnalysis InferenceX™',
  },
  zh: {
    heading: 'GPU 可靠性',
    description: '各 GPU 型号推理运行的成功率百分比，展示硬件在一段时间内的推理运行可靠性。',
    captionHeading: '各 GPU 型号成功率',
    captionSource: '数据来源：SemiAnalysis InferenceX™',
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
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-lg font-semibold mb-2">{t.heading}</h2>
                <p className="text-muted-foreground text-sm mb-4">{t.description}</p>
              </div>
              <ChartShareActions />
            </div>
            <ReliabilityChartControls />
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
              <h3 className="text-lg font-semibold">{t.captionHeading}</h3>
              <p className="text-sm text-muted-foreground">{t.captionSource}</p>
              <UnofficialDomainNotice />
            </>
          }
        />
      </ChartSection>
    </div>
  );
}
