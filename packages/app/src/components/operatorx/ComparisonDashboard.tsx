'use client';

import { Loader2 } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { useTheme } from 'next-themes';
import { useMemo, useState } from 'react';

import type { ComparisonOp } from '@semianalysisai/inferencex-db/operatorx/compare';
import { Card } from '@/components/ui/card';
import { Heading } from '@/components/ui/heading';
import { Label } from '@/components/ui/label';
import { MultiSelect } from '@/components/ui/multi-select';
import { RetryableQueryError } from '@/components/ui/retryable-query-error';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { prefetchOperatorXTimelines, useOperatorXComparison } from '@/hooks/api/use-operatorx';
import { useClientSearch } from '@/hooks/useClientSearch';
import { replaceClientSearch } from '@/lib/client-navigation';
import { generateVendorColors } from '@/lib/dynamic-colors';

import { CaseDetail } from './CaseDetail';
import { CoverageStrip } from './CoverageStrip';
import { hardwareLabel, sortHardware } from './compare/hardware';
import { METRICS, metricById } from './compare/metrics';
import { buildModel, caseRefs, type ComparisonModel } from './compare/model';
import { VISUALIZATIONS } from './viz';
import type { VizDefinition } from './viz/types';

/** Baseline select value for "no baseline". */
const NO_BASELINE = 'none';

/** Visible cards with their width: a half card left alone in its row takes the whole row. */
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

function VizCard({
  model,
  viz,
  wide,
}: {
  model: ComparisonModel;
  viz: VizDefinition;
  wide: boolean;
}) {
  return (
    <Card
      data-testid={`operatorx-viz-${viz.id}`}
      className={`min-w-0 ${wide ? 'lg:col-span-2' : ''}`}
    >
      <Heading as="h2" level="card" className="mb-4">
        {viz.title}
      </Heading>
      <viz.Component model={model} />
    </Card>
  );
}

/** Cross-hardware comparison of one op: workload, metric and GPU controls over the visualizations. */
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
  const theme = useTheme().resolvedTheme === 'dark' ? 'dark' : 'light';
  const [picked, setPicked] = useState<string[] | null>(null);
  const [pickedBaseline, setBaseline] = useState<string | null>(null);
  const [inspected, setInspected] = useState<number | null>(null);
  const queryClient = useQueryClient();

  const workload = view?.workloads.find((w) => w.id === view.workload);
  const available = useMemo(() => sortHardware(workload?.hardware ?? []), [workload]);
  const colors = useMemo(
    () => generateVendorColors(view?.hardware.map((h) => h.id) ?? [], theme),
    [view, theme],
  );
  const hardware = useMemo(
    () => (picked ? available.filter((h) => picked.includes(h)) : available),
    [picked, available],
  );
  const baseline =
    pickedBaseline === NO_BASELINE
      ? null
      : pickedBaseline && hardware.includes(pickedBaseline)
        ? pickedBaseline
        : (hardware.find((h) => h === 'h200') ?? hardware[0] ?? null);
  const model = useMemo(() => {
    if (!view) return null;
    const toggle = (hw: string) => {
      const next = hardware.includes(hw) ? hardware.filter((h) => h !== hw) : [...hardware, hw];
      if (next.length > 0) setPicked(next);
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
      <Card data-testid="operatorx-loading" className="min-h-80 items-center justify-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
        <p className="mt-3 text-sm text-muted-foreground">Loading results…</p>
      </Card>
    );
  // While another workload loads, the previous one stays on screen, dimmed.
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
        <div
          className={`mt-4 border-t border-border/60 pt-3 transition-opacity ${switching ? 'opacity-40' : ''}`}
        >
          <CoverageStrip model={model} />
        </div>
      </Card>
      {switching && (
        <div
          role="status"
          data-testid="operatorx-switching"
          className="sticky top-16 z-20 -mb-4 flex h-0 justify-center overflow-visible"
        >
          <span className="flex h-9 items-center gap-2 rounded-full border border-border bg-background px-4 text-sm text-muted-foreground shadow-md">
            <Loader2 className="size-4 animate-spin" />
            Loading {pending?.label ?? 'workload'}…
          </span>
        </div>
      )}
      <div
        aria-busy={switching}
        className={`grid gap-4 transition-opacity lg:grid-cols-2 ${switching ? 'pointer-events-none opacity-40' : ''}`}
      >
        {layout(
          VISUALIZATIONS.filter((v) => v.ops.includes(op) && (baseline || !v.needsBaseline)),
        ).map(({ viz, wide }) => (
          <VizCard key={viz.id} model={model} viz={viz} wide={wide} />
        ))}
      </div>
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
