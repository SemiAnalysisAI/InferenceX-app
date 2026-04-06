'use client';

import { Lock } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { track } from '@/lib/analytics';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ChartButtons } from '@/components/ui/chart-buttons';
import { SegmentedToggle, type SegmentedToggleOption } from '@/components/ui/segmented-toggle';
import { ShareButton } from '@/components/ui/share-button';
import { ShareTwitterButton, ShareLinkedInButton } from '@/components/share-buttons';
import { exportToCsv } from '@/lib/csv-export';
import { submissionsVolumeToCsv } from '@/lib/csv-export-helpers';
import { useSubmissions } from '@/hooks/api/use-submissions';

import SubmissionsChart, { type ChartMode } from './SubmissionsChart';
import SubmissionsTable from './SubmissionsTable';
import { computeTotalStats } from './submissions-utils';

const CHART_ID = 'submissions-chart';

const SUBMISSIONS_CHART_MODE_OPTIONS: SegmentedToggleOption<ChartMode>[] = [
  { value: 'weekly', label: 'Weekly', testId: 'submissions-weekly-btn' },
  { value: 'cumulative', label: 'Cumulative', testId: 'submissions-cumulative-btn' },
];

const FEATURE_GATE_KEY = 'inferencex-feature-gate';

export default function SubmissionsDisplay() {
  const router = useRouter();
  const { data, isLoading, error } = useSubmissions();
  const [chartMode, setChartMode] = useState<ChartMode>('weekly');

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
        <p className="text-destructive text-sm">Failed to load submission data.</p>
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
              <h2 className="text-lg font-semibold mb-2">Benchmark Submissions</h2>
              <p className="text-muted-foreground text-sm">
                All benchmark configurations submitted to InferenceX. View submission history,
                activity trends, and datapoint volumes.
              </p>
            </div>
            <div className="flex items-center gap-1.5">
              <Button
                variant="ghost"
                size="sm"
                className="h-7 gap-1.5 text-xs text-muted-foreground"
                onClick={() => {
                  localStorage.removeItem(FEATURE_GATE_KEY);
                  window.dispatchEvent(new Event('inferencex:powerx:locked'));
                  track('submissions_relocked');
                  router.push('/inference');
                }}
                title="Re-lock feature gate"
              >
                <Lock className="h-3 w-3" />
                Re-lock feature gate
              </Button>
              <ShareButton />
              <div className="hidden sm:flex items-center gap-1.5">
                <ShareTwitterButton />
                <ShareLinkedInButton />
              </div>
            </div>
          </div>
        </Card>
      </section>

      {/* Stats summary */}
      {stats && (
        <section>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: 'Datapoints Generated', value: stats.totalDatapoints, subtitle: 'results' },
              { label: 'Distinct Configurations', value: stats.totalConfigs, subtitle: 'tested' },
              { label: 'Unique Models', value: stats.uniqueModels, subtitle: 'LLMs' },
              { label: 'Unique Hardware', value: stats.uniqueGpus, subtitle: 'SKUs' },
            ]
              .sort((a, b) => b.value - a.value)
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
                options={SUBMISSIONS_CHART_MODE_OPTIONS}
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
                Loading chart data...
              </div>
            ) : data?.volume ? (
              <SubmissionsChart
                volume={data.volume}
                mode={chartMode}
                caption={
                  <>
                    <h3 className="text-lg font-semibold">Submission Activity</h3>
                    <p className="text-sm text-muted-foreground">
                      Source: SemiAnalysis InferenceX&trade;
                    </p>
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
              Loading submissions...
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
