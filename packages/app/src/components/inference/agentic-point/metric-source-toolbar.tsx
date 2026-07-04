'use client';

import type { MetricSource, MetricSourceSeries } from '@/hooks/api/use-trace-server-metrics';
import { SegmentedToggle, type SegmentedToggleOption } from '@/components/ui/segmented-toggle';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { track } from '@/lib/analytics';

import type { StagePhase } from './phase-slice';

const SOURCE_ROLE_LABEL: Record<MetricSource['role'], string> = {
  router: 'Router',
  prefill: 'Prefill',
  decode: 'Decode',
  combined: 'Combined',
  unknown: 'Unknown',
};

/** "Role · instance" label for one server-metrics endpoint. */
export function metricSourceLabel(source: MetricSource): string {
  const instance =
    source.workerId ??
    (source.dpRank ? `DP ${source.dpRank}` : null) ??
    source.endpointUrl ??
    (source.engine ? `engine ${source.engine}` : null);
  return instance
    ? `${SOURCE_ROLE_LABEL[source.role]} · ${instance}`
    : SOURCE_ROLE_LABEL[source.role];
}

// Warmup vs profiling stage selector. Drives the server-metric charts AND the
// request-derived charts (ISL/OSL, latency-over-time, in-flight). Only shown
// when the point actually has a warmup phase.
const STAGE_PHASE_OPTIONS: SegmentedToggleOption<StagePhase>[] = [
  { value: 'profiling', label: 'Profiling', testId: 'stage-phase-profiling' },
  { value: 'warmup', label: 'Warmup', testId: 'stage-phase-warmup' },
];

/**
 * Sticky per-point toolbar: warmup/profiling stage toggle (when the point has
 * a warmup phase) and the server-metrics endpoint selector (when the point has
 * more than one source). The parent decides when to render it at all.
 */
export function MetricSourceToolbar({
  hasWarmup,
  phase,
  onPhaseChange,
  metricSources,
  selectedSource,
  onSourceChange,
  fallbackAdapter,
}: {
  hasWarmup: boolean;
  phase: StagePhase;
  onPhaseChange: (phase: StagePhase) => void;
  metricSources: MetricSourceSeries[];
  selectedSource: MetricSourceSeries | undefined;
  onSourceChange: (id: string) => void;
  /** Adapter reported in analytics when the selected source lookup misses. */
  fallbackAdapter: string | undefined;
}) {
  return (
    <div
      className="sticky top-16 z-40 flex items-center justify-between gap-2 rounded-lg border border-border/40 bg-background/90 px-3 py-2 shadow-sm backdrop-blur"
      data-testid="metric-source-toolbar"
    >
      {hasWarmup ? (
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Stage</span>
          <SegmentedToggle
            value={phase}
            options={STAGE_PHASE_OPTIONS}
            onValueChange={(value) => {
              onPhaseChange(value);
              track('inference_agentic_phase_changed', { phase: value });
            }}
            ariaLabel="Stage phase"
            testId="stage-phase-toggle"
            buttonClassName="px-2.5 py-1 text-xs"
          />
        </div>
      ) : (
        <span />
      )}
      {metricSources.length > 1 ? (
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Server metrics</span>
          <Select
            value={selectedSource?.source.id ?? 'all'}
            onValueChange={(value) => {
              onSourceChange(value);
              const source = metricSources.find((entry) => entry.source.id === value)?.source;
              track('inference_agentic_metric_source_changed', {
                source: value,
                role: source?.role ?? 'all',
                adapter: source?.adapter ?? fallbackAdapter ?? 'unknown',
              });
            }}
          >
            <SelectTrigger
              size="sm"
              className="max-w-72"
              aria-label="Server metrics source"
              data-testid="metric-source-select"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All endpoints</SelectItem>
              {metricSources.map(({ source }) => (
                <SelectItem
                  key={source.id}
                  value={source.id}
                  title={source.endpointUrl ?? undefined}
                >
                  {metricSourceLabel(source)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : null}
    </div>
  );
}
