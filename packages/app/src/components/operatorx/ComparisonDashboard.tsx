'use client';

import { Loader2 } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { useTheme } from 'next-themes';
import { isDarkTheme } from '@/lib/themes/themes';
import { memo, useEffect, useMemo, useRef, useState } from 'react';

import type { ComparisonOp } from '@semianalysisai/inferencex-db/operatorx/compare';
import { Skeleton } from '@/components/ui/skeleton';
import { Card } from '@/components/ui/card';
import { Heading } from '@/components/ui/heading';
import { Label } from '@/components/ui/label';
import { MultiSelect } from '@/components/ui/multi-select';
import { Pending } from '@/components/ui/pending';
import { RetryableQueryError } from '@/components/ui/retryable-query-error';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { prefetchOperatorXTimelines, useOperatorXComparison } from '@/hooks/api/use-operatorx';
import { useClientSearch } from '@/hooks/useClientSearch';
import { replaceClientSearch } from '@/lib/routing/client-navigation';

import { CaseDetail } from './CaseDetail';
import { CoverageStrip } from './CoverageStrip';
import {
  hardwareLabel,
  operatorXColors,
  sortHardware,
  toggleHardwareSelection,
} from './compare/hardware';
import { METRICS, metricById } from './compare/metrics';
import { buildModel, caseRefs, type ComparisonModel } from './compare/model';
import { VISUALIZATIONS } from './viz';
import type { VizDefinition } from './viz/types';

const NO_BASELINE = 'none';

function layout(visible: VizDefinition[]): { viz: VizDefinition; wide: boolean }[] {
  const out = visible.map((viz) => ({ viz, wide: Boolean(viz.wide) }));
  let run: typeof out = [];
  for (const card of [...out, null]) {
    if (card && !card.wide) {
      run.push(card);
      continue;
    }
    if (run.length % 2 === 1) run.at(-1)!.wide = true;
    run = [];
  }
  return out;
}

function setParam(key: string, value: string) {
  const params = new URLSearchParams(window.location.search);
  params.set(key, value);
  replaceClientSearch(params);
}

function ControlGroup({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-w-0 space-y-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
    </div>
  );
}

const VizCard = memo(
  ({
    model,
    viz,
    wide,
    eager,
  }: {
    model: ComparisonModel;
    viz: VizDefinition;
    wide: boolean;
    eager: boolean;
  }) => {
    const [mounted, setMounted] = useState(eager);
    const card = useRef<HTMLDivElement>(null);
    useEffect(() => {
      if (mounted) return;
      if (eager || typeof IntersectionObserver === 'undefined') {
        setMounted(true);
        return;
      }
      const observer = new IntersectionObserver(
        (entries) => {
          if (entries.some((entry) => entry.isIntersecting)) {
            setMounted(true);
          }
        },
        { rootMargin: '300px' },
      );
      if (card.current) observer.observe(card.current);
      return () => observer.disconnect();
    }, [eager, mounted]);
    return (
      <Card
        ref={card}
        data-testid={`operatorx-viz-${viz.id}`}
        aria-busy={!mounted}
        aria-labelledby={`operatorx-title-${viz.id}`}
        tabIndex={mounted ? undefined : 0}
        onFocus={() => setMounted(true)}
        className={`min-w-0 ${wide ? 'lg:col-span-2' : ''}`}
      >
        <Heading id={`operatorx-title-${viz.id}`} as="h2" level="card" className="mb-4">
          {viz.title}
        </Heading>
        {mounted ? (
          <viz.Component model={model} />
        ) : (
          <Skeleton
            aria-hidden="true"
            className={viz.id === 'roofline' ? 'h-[460px]' : 'h-[420px]'}
          />
        )}
      </Card>
    );
  },
);

export function ComparisonDashboard({ op }: { op: ComparisonOp }) {
  const search = new URLSearchParams(useClientSearch());
  const metric = metricById(search.get('metric'));
  const {
    data: view,
    error,
    isLoading,
    isPlaceholderData: switching,
    refetch,
  } = useOperatorXComparison(op, search.get('workload'));
  const theme = isDarkTheme(useTheme().resolvedTheme) ? 'dark' : 'light';
  const [picked, setPicked] = useState<string[] | null>(null);
  const [pickedBaseline, setBaseline] = useState<string | null>(null);
  const [inspected, setInspected] = useState<number | null>(null);
  const queryClient = useQueryClient();

  const workload = view?.workloads.find((w) => w.id === view.workload);
  const available = useMemo(() => sortHardware(workload?.hardware ?? []), [workload]);
  const colors = useMemo(
    () => operatorXColors(view?.hardware.map((h) => h.id) ?? [], theme),
    [view, theme],
  );
  const hardware = useMemo(
    () => (picked ? available.filter((h) => picked.includes(h)) : available),
    [picked, available],
  );
  const baseline = pickedBaseline && hardware.includes(pickedBaseline) ? pickedBaseline : null;
  // Charts, legend, GPU control and case detail all read this same live state.
  const model = useMemo(() => {
    if (!view) return null;
    const toggle = (hw: string) => {
      const next = toggleHardwareSelection(hardware, hw);
      if (next !== hardware) setPicked(next);
    };
    const preview = (i: number) =>
      prefetchOperatorXTimelines(
        queryClient,
        op,
        caseRefs(view, hardware, i).map((r) => r.ref),
      );
    return buildModel(view, metric, { hardware, available, toggle }, colors, baseline, {
      inspect: setInspected,
      preview,
    });
  }, [view, metric, hardware, available, colors, baseline, queryClient, op]);

  if (error)
    return (
      <RetryableQueryError
        message={error.message}
        analyticsEvent="operatorx_comparison_retry"
        onRetry={refetch}
        testId="operatorx-comparison-error"
      />
    );
  if (isLoading || !view || !model)
    return (
      <Card data-testid="operatorx-loading" className="min-h-svh items-center justify-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
        <p className="mt-3 text-sm text-muted-foreground">Loading results…</p>
      </Card>
    );
  const pending = switching
    ? view.workloads.find((w) => w.id === search.get('workload'))
    : undefined;
  if (view.workloads.length === 0)
    return (
      <Card className="py-6 text-center">
        <p className="text-sm text-muted-foreground">No results yet</p>
      </Card>
    );

  return (
    <div className="flex flex-col gap-4">
      <Card className="relative z-10 py-4 md:py-5" data-testid="operatorx-controls">
        <div className="grid gap-x-5 gap-y-3 sm:grid-cols-2 lg:grid-cols-4">
          <ControlGroup label="Workload" htmlFor="operatorx-workload">
            <SearchableSelect
              triggerId="operatorx-workload"
              value={pending?.id ?? view.workload ?? ''}
              onValueChange={(v) => setParam('workload', v)}
              groups={[
                {
                  label: '',
                  options: view.workloads.map((w) => ({
                    value: w.id,
                    label: w.label,
                  })),
                },
              ]}
            />
          </ControlGroup>
          <ControlGroup label="Metric" htmlFor="operatorx-metric">
            <SearchableSelect
              triggerId="operatorx-metric"
              value={metric.id}
              onValueChange={(v) => setParam('metric', v)}
              searchable={false}
              groups={[
                {
                  label: '',
                  options: METRICS.map((m) => ({ value: m.id, label: `${m.label} (${m.unit})` })),
                },
              ]}
            />
          </ControlGroup>
          <ControlGroup label="GPUs" htmlFor="operatorx-hardware">
            <MultiSelect
              triggerId="operatorx-hardware"
              options={available.map((h) => ({ value: h, label: hardwareLabel(h) }))}
              value={hardware}
              onChange={setPicked}
              minSelections={1}
            />
          </ControlGroup>
          <ControlGroup label="Baseline" htmlFor="operatorx-baseline">
            <SearchableSelect
              triggerId="operatorx-baseline"
              value={baseline ?? NO_BASELINE}
              onValueChange={setBaseline}
              searchable={false}
              groups={[
                {
                  label: '',
                  options: [
                    { value: NO_BASELINE, label: 'None' },
                    ...hardware.map((h) => ({ value: h, label: hardwareLabel(h) })),
                  ],
                },
              ]}
            />
          </ControlGroup>
        </div>
        <div className="mt-4 border-t border-border/60 pt-3">
          <CoverageStrip model={model} />
        </div>
      </Card>
      <Pending active={switching} label={`Loading ${pending?.label ?? 'workload'}…`}>
        <div className="grid gap-4 lg:grid-cols-2">
          {layout(
            VISUALIZATIONS.filter((v) => v.ops.includes(op) && (baseline || !v.needsBaseline)),
          ).map(({ viz, wide }, index) => (
            <VizCard key={viz.id} model={model} viz={viz} wide={wide} eager={index === 0} />
          ))}
        </div>
      </Pending>
      <CaseDetail
        op={op}
        view={view}
        hardware={hardware}
        colors={colors}
        caseIndex={inspected}
        onClose={() => setInspected(null)}
      />
    </div>
  );
}
