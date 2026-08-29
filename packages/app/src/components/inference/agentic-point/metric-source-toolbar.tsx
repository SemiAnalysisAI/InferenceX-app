'use client';

import type { MetricSource, MetricSourceDescriptor } from '@/hooks/api/use-trace-server-metrics';
import { SegmentedToggle, type SegmentedToggleOption } from '@/components/ui/segmented-toggle';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { track } from '@/lib/analytics';
import { useLocale } from '@/lib/use-locale';
import type { Locale } from '@/lib/i18n';

import type { StagePhase } from './phase-slice';

const SOURCE_ROLE_LABEL: Record<Locale, Record<MetricSource['role'], string>> = {
  en: {
    router: 'Router',
    prefill: 'Prefill',
    decode: 'Decode',
    combined: 'Combined',
    unknown: 'Unknown',
  },
  zh: { router: '路由', prefill: '预填充', decode: '解码', combined: '合并', unknown: '未知' },
};

/** "Role · instance" label for one server-metrics endpoint. */
export function metricSourceLabel(source: MetricSource, locale: Locale = 'en'): string {
  const engineLabel = (engine: string) => (locale === 'zh' ? `引擎 ${engine}` : `engine ${engine}`);
  const instance =
    source.workerId ??
    (source.dpRank ? `DP ${source.dpRank}` : null) ??
    source.endpointUrl ??
    (source.engine ? engineLabel(source.engine) : null);
  return instance
    ? `${SOURCE_ROLE_LABEL[locale][source.role]} · ${instance}`
    : SOURCE_ROLE_LABEL[locale][source.role];
}

// Warmup vs profiling stage selector. Drives the server-metric charts AND the
// request-derived charts (ISL/OSL, latency-over-time, in-flight). Only shown
// when the point actually has a warmup phase.
const TOOLBAR_STRINGS = {
  en: {
    stage: 'Stage',
    profiling: 'Profiling',
    warmup: 'Warmup',
    stageAria: 'Stage phase',
    metrics: 'Server metrics',
    sourceAria: 'Server metrics source',
    all: 'All endpoints',
  },
  zh: {
    stage: '阶段',
    profiling: 'profiling',
    warmup: 'warmup',
    stageAria: '运行阶段',
    metrics: '服务器指标',
    sourceAria: '服务器指标来源',
    all: '所有端点',
  },
} as const;

export function stagePhaseLabels(locale: Locale): { profiling: string; warmup: string } {
  const t = TOOLBAR_STRINGS[locale];
  return { profiling: t.profiling, warmup: t.warmup };
}

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
  metricSources: MetricSourceDescriptor[];
  selectedSource: MetricSourceDescriptor | undefined;
  onSourceChange: (id: string) => void;
  /** Adapter reported in analytics when the selected source lookup misses. */
  fallbackAdapter: string | undefined;
}) {
  const locale = useLocale();
  const t = TOOLBAR_STRINGS[locale];
  const phaseLabels = stagePhaseLabels(locale);
  const stageOptions: SegmentedToggleOption<StagePhase>[] = [
    { value: 'profiling', label: phaseLabels.profiling, testId: 'stage-phase-profiling' },
    { value: 'warmup', label: phaseLabels.warmup, testId: 'stage-phase-warmup' },
  ];
  return (
    <div
      className="sticky top-16 z-40 flex items-center justify-between gap-2 rounded-lg border border-border/40 bg-background/90 px-3 py-2 shadow-sm backdrop-blur"
      data-testid="metric-source-toolbar"
    >
      {hasWarmup ? (
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">{t.stage}</span>
          <SegmentedToggle
            value={phase}
            options={stageOptions}
            onValueChange={(value) => {
              onPhaseChange(value);
              track('inference_agentic_phase_changed', { phase: value });
            }}
            ariaLabel={t.stageAria}
            testId="stage-phase-toggle"
            buttonClassName="px-2.5 py-1 text-xs"
          />
        </div>
      ) : (
        <span />
      )}
      {metricSources.length > 1 ? (
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">{t.metrics}</span>
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
              aria-label={t.sourceAria}
              data-testid="metric-source-select"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t.all}</SelectItem>
              {metricSources.map(({ source }) => (
                <SelectItem
                  key={source.id}
                  value={source.id}
                  title={source.endpointUrl ?? undefined}
                >
                  {metricSourceLabel(source, locale)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : null}
    </div>
  );
}
