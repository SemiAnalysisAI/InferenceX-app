'use client';

import { Download, FileSpreadsheet, Image, Lock, RotateCcw } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { track } from '@/lib/analytics';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ShareButton } from '@/components/ui/share-button';
import { ShareTwitterButton, ShareLinkedInButton } from '@/components/share-buttons';
import { useChartExport } from '@/hooks/useChartExport';
import { exportToCsv } from '@/lib/csv-export';
import { submissionsVolumeToCsv } from '@/lib/csv-export-helpers';
import { useSubmissions } from '@/hooks/api/use-submissions';

import SubmissionsChart, { type ChartMode } from './SubmissionsChart';
import SubmissionsTable from './SubmissionsTable';
import { computeTotalStats } from './submissions-utils';

const CHART_ID = 'submissions-chart';

function SubmissionsChartButtons({
  chartMode,
  onModeChange,
  onExportCsv,
}: {
  chartMode: ChartMode;
  onModeChange: (mode: ChartMode) => void;
  onExportCsv: () => void;
}) {
  const { isExporting, exportToImage } = useChartExport({
    chartId: CHART_ID,
    exportFileName: 'InferenceX_submissions',
  });
  const [exportPopoverOpen, setExportPopoverOpen] = useState(false);

  const handleExportPng = () => {
    setExportPopoverOpen(false);
    track('submissions_chart_exported');
    exportToImage();
  };

  const handleExportCsv = () => {
    setExportPopoverOpen(false);
    track('submissions_csv_exported');
    onExportCsv();
    window.dispatchEvent(new CustomEvent('inferencex:action'));
  };

  return (
    <div className="hidden md:flex absolute top-6 right-6 md:top-8 md:right-8 no-export export-buttons gap-1 z-10">
      <div
        className="inline-flex items-center rounded-lg border border-border p-0.5 gap-0.5 shrink-0"
        role="tablist"
        aria-label="Chart mode"
        data-testid="submissions-mode-toggle"
      >
        <button
          type="button"
          role="tab"
          aria-selected={chartMode === 'weekly'}
          className={`inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium transition-colors ${
            chartMode === 'weekly'
              ? 'bg-muted text-foreground'
              : 'text-muted-foreground hover:text-foreground'
          }`}
          onClick={() => onModeChange('weekly')}
          data-testid="submissions-weekly-btn"
        >
          Weekly
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={chartMode === 'cumulative'}
          className={`inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium transition-colors ${
            chartMode === 'cumulative'
              ? 'bg-muted text-foreground'
              : 'text-muted-foreground hover:text-foreground'
          }`}
          onClick={() => onModeChange('cumulative')}
          data-testid="submissions-cumulative-btn"
        >
          Cumulative
        </button>
      </div>
      <Popover open={exportPopoverOpen} onOpenChange={setExportPopoverOpen}>
        <PopoverTrigger asChild>
          <Button
            data-testid="export-button"
            variant="outline"
            size={isExporting ? 'default' : 'icon'}
            className={`h-7 shrink-0 ${isExporting ? '' : 'w-7'}`}
            disabled={isExporting}
          >
            <Download className={isExporting ? 'mr-2' : ''} size={16} />
            {isExporting && 'Exporting...'}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-44 p-1">
          <button
            data-testid="export-png-button"
            className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground cursor-pointer"
            onClick={handleExportPng}
          >
            <Image size={14} />
            Download PNG
          </button>
          <button
            data-testid="export-csv-button"
            className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground cursor-pointer"
            onClick={handleExportCsv}
          >
            <FileSpreadsheet size={14} />
            Download CSV
          </button>
        </PopoverContent>
      </Popover>
      <Button
        data-testid="zoom-reset-button"
        variant="outline"
        size="icon"
        className="h-7 w-7"
        onClick={() => {
          track('submissions_zoom_reset_button');
          window.dispatchEvent(new CustomEvent(`d3chart_zoom_reset_${CHART_ID}`));
        }}
      >
        <RotateCcw size={16} />
      </Button>
    </div>
  );
}

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
          <SubmissionsChartButtons
            chartMode={chartMode}
            onModeChange={handleModeChange}
            onExportCsv={handleExportCsv}
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
