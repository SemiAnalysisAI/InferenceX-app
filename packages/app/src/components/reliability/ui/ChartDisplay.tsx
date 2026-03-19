'use client';

import { useCallback } from 'react';

import { useReliabilityContext } from '@/components/reliability/ReliabilityContext';
import { Card } from '@/components/ui/card';
import { ChartSection } from '@/components/ui/chart-section';
import { ShareButton } from '@/components/ui/share-button';
import { SocialShareButtons } from '@/components/social-share-buttons';
import { exportToCsv } from '@/lib/csv-export';
import { reliabilityChartToCsv } from '@/lib/csv-export-helpers';

import ReliabilityBarChartD3 from './BarChartD3';
import ReliabilityChartControls from './ChartControls';

export default function ReliabilityChartDisplay() {
  const CHART_ID = 'reliability-chart';
  const { setIsLegendExpanded, chartData } = useReliabilityContext();

  const handleExportCsv = useCallback(() => {
    const { headers, rows } = reliabilityChartToCsv(chartData);
    exportToCsv(`reliability-${Date.now()}`, headers, rows);
  }, [chartData]);

  return (
    <div data-testid="reliability-chart-display">
      <section>
        <Card>
          <div className="flex flex-col gap-4">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-lg font-semibold mb-2">GPU Reliability</h2>
                <p className="text-muted-foreground text-sm mb-4">
                  Success rate percentages for inference runs across GPU models, showing hardware
                  reliability for inference runs over time.
                </p>
              </div>
              <div className="flex items-center gap-1.5">
                <ShareButton />
                <SocialShareButtons compact className="hidden sm:flex" />
              </div>
            </div>
            <ReliabilityChartControls />
          </div>
        </Card>
      </section>

      <ChartSection
        chartId={CHART_ID}
        analyticsPrefix="reliability"
        setIsLegendExpanded={setIsLegendExpanded}
        onExportCsv={handleExportCsv}
      >
        <ReliabilityBarChartD3
          caption={
            <>
              <h3 className="text-lg font-semibold">Success Rate by GPU Model</h3>
              <p className="text-sm text-muted-foreground">Source: SemiAnalysis InferenceX™</p>
            </>
          }
        />
      </ChartSection>
    </div>
  );
}
