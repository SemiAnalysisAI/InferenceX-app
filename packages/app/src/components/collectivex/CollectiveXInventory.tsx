'use client';

import { useEffect, useMemo, useState } from 'react';
import { ChevronRight, RotateCcw } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { type DataTableColumn, DataTable } from '@/components/ui/data-table';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

import { collectiveXTopologyLabel } from './data';
import type {
  CollectiveXAttempt,
  CollectiveXCommunicationAxis,
  CollectiveXComponent,
  CollectiveXCoverage,
  CollectiveXCoveragePoint,
  CollectiveXDataset,
  CollectiveXPoint,
  CollectiveXSeries,
  CollectiveXTerminalStatus,
} from './types';

type FilterKey =
  | 'sku'
  | 'backend'
  | 'ep'
  | 'mode'
  | 'phase'
  | 'routing'
  | 'topology'
  | 'dispatchPrecision'
  | 'combinePrecision'
  | 'terminal';

type Filters = Record<FilterKey, string>;

const EMPTY_FILTERS: Filters = {
  sku: 'all',
  backend: 'all',
  ep: 'all',
  mode: 'all',
  phase: 'all',
  routing: 'all',
  topology: 'all',
  dispatchPrecision: 'all',
  combinePrecision: 'all',
  terminal: 'all',
};

const TERMINAL_ORDER: CollectiveXTerminalStatus[] = [
  'measured',
  'unsupported',
  'failed',
  'invalid',
  'diagnostic',
  'pending',
];

const STATUS_CLASS: Record<CollectiveXTerminalStatus, string> = {
  measured: 'border-emerald-600/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  unsupported: 'border-zinc-500/40 bg-zinc-500/10 text-zinc-700 dark:text-zinc-300',
  failed: 'border-red-600/40 bg-red-500/10 text-red-700 dark:text-red-300',
  invalid: 'border-red-600/40 bg-red-500/10 text-red-700 dark:text-red-300',
  diagnostic: 'border-amber-600/40 bg-amber-500/10 text-amber-700 dark:text-amber-300',
  pending: 'border-zinc-500/40 bg-zinc-500/5 text-muted-foreground',
};

function axisKey(axis: CollectiveXCommunicationAxis | null): string {
  return axis ? JSON.stringify(axis) : 'none';
}

function axisLabel(axis: CollectiveXCommunicationAxis | null): string {
  if (!axis) return 'n/a';
  return `${axis.communication_format} · ${axis.quant_mode} · ${axis.semantics}`;
}

function backendKey(item: CollectiveXCoverage): string {
  return `${item.backend}\0${item.backend_generation ?? ''}`;
}

function backendLabel(item: CollectiveXCoverage): string {
  return item.backend_generation ? `${item.backend} · ${item.backend_generation}` : item.backend;
}

function routingKey(item: CollectiveXCoverage): string {
  return `${item.routing}${item.eplb ? '+eplb' : ''}`;
}

function topologyKey(item: CollectiveXCoverage): string {
  return `${item.topology.scope}\0${item.topology.topology_class}\0${item.topology.transport}`;
}

function terminalCounts(item: CollectiveXCoverage): Record<CollectiveXTerminalStatus, number> {
  return Object.fromEntries(
    TERMINAL_ORDER.map((status) => [
      status,
      item.points.filter((point) => point.terminal_status === status).length,
    ]),
  ) as Record<CollectiveXTerminalStatus, number>;
}

function terminalSummary(item: CollectiveXCoverage): string {
  const counts = terminalCounts(item);
  return TERMINAL_ORDER.filter((status) => counts[status] > 0)
    .map((status) => `${status} ${counts[status]}`)
    .join(' · ');
}

function uniqueOptions(
  coverage: CollectiveXCoverage[],
  value: (item: CollectiveXCoverage) => string,
  label: (item: CollectiveXCoverage) => string = value,
): { value: string; label: string }[] {
  return [
    ...new Map(
      coverage.map((item) => {
        const key = value(item);
        return [key, { value: key, label: label(item) }];
      }),
    ).values(),
  ].toSorted((left, right) => left.label.localeCompare(right.label));
}

function FilterSelect({
  label,
  testId,
  value,
  options,
  onChange,
}: {
  label: string;
  testId: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
}) {
  return (
    <div className="min-w-0 space-y-1.5">
      <Label className="text-[11px] uppercase text-muted-foreground">{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger data-testid={testId} className="min-w-0 w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All</SelectItem>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function TerminalBadges({ item }: { item: CollectiveXCoverage }) {
  const counts = terminalCounts(item);
  return (
    <div className="flex flex-wrap gap-1">
      {TERMINAL_ORDER.filter((status) => counts[status] > 0).map((status) => (
        <Badge key={status} variant="outline" className={STATUS_CLASS[status]}>
          {status} {counts[status]}
        </Badge>
      ))}
    </div>
  );
}

interface PointRow {
  catalog: CollectiveXCoveragePoint;
  series: CollectiveXSeries | null;
  point: CollectiveXPoint | null;
  attempts: CollectiveXAttempt[];
}

function componentSummary(component: CollectiveXComponent | null): React.ReactNode {
  if (component === null) return <span className="text-muted-foreground">Unavailable</span>;
  const bytes = component.byte_provenance;
  const activation = component.activation_data_rate_gbps_at_latency_percentile?.p99;
  const total = component.total_logical_data_rate_gbps_at_latency_percentile?.p99;
  return (
    <div className="min-w-44 space-y-0.5 text-xs tabular-nums">
      <p>
        p50 {component.latency_us.p50.toFixed(1)} · p99 {component.latency_us.p99.toFixed(1)} us
      </p>
      <p className="text-muted-foreground">
        {component.origin === 'measured'
          ? `${component.sample_count ?? '-'} samples`
          : 'Derived, no samples'}
      </p>
      {bytes ? (
        <p className="text-muted-foreground">
          bytes {bytes.activation_data_bytes.toLocaleString()} +{' '}
          {bytes.scale_bytes.toLocaleString()} = {bytes.total_logical_bytes.toLocaleString()}
        </p>
      ) : (
        <p className="text-muted-foreground">no byte accounting</p>
      )}
      <p className="text-muted-foreground">
        p99 A {activation?.toFixed(2) ?? '-'} · total {total?.toFixed(2) ?? '-'} GB/s
      </p>
    </div>
  );
}

function pointAnomalies(row: PointRow): string {
  if (!row.point) return '-';
  const routing = row.point.routing;
  const anomalies = row.point.anomalies.join(', ');
  return `expert CV ${routing.expert_load_cv.toFixed(3)} · rank CV ${routing.payload_rank_cv.toFixed(3)} · hotspot ${routing.hotspot_ratio.toFixed(2)}x · empty ${routing.empty_expert_count}/${routing.empty_rank_count}${anomalies ? ` · ${anomalies}` : ' · none declared'}`;
}

function correctnessSummary(row: PointRow): React.ReactNode {
  if (!row.point) return '-';
  const correctness = row.point.correctness;
  return (
    <div className="min-w-52 text-xs">
      <p>
        Correctness {correctness.passed ? 'pass' : 'fail'} · max rel err{' '}
        {correctness.max_relative_error.toExponential(1)}
      </p>
      <p className="text-muted-foreground">
        {correctness.contract} · {correctness.scope}
      </p>
    </div>
  );
}

function DetailValue({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] uppercase text-muted-foreground">{label}</dt>
      <dd className={`mt-1 break-words ${mono ? 'font-mono text-xs' : ''}`}>{value}</dd>
    </div>
  );
}

function CaseDetail({ dataset, item }: { dataset: CollectiveXDataset; item: CollectiveXCoverage }) {
  const seriesById = useMemo(
    () => new Map(dataset.series.map((series) => [series.series_id, series])),
    [dataset.series],
  );
  const rows = useMemo<PointRow[]>(
    () =>
      item.points.map((catalog) => {
        const series = catalog.series_id ? (seriesById.get(catalog.series_id) ?? null) : null;
        const point =
          catalog.point_id && series
            ? (series.points.find((candidate) => candidate.point_id === catalog.point_id) ?? null)
            : null;
        const attempts = dataset.attempts.filter(
          (attempt) =>
            attempt.case_id === item.case_id &&
            (!catalog.point_id ||
              attempt.evidence.some((evidence) => evidence.point_id === catalog.point_id)),
        );
        return { catalog, series, point, attempts };
      }),
    [dataset.attempts, item, seriesById],
  );
  const columns = useMemo<DataTableColumn<PointRow>[]>(
    () => [
      {
        header: 'Terminal status',
        cell: (row) => (
          <div className="min-w-28">
            <Badge variant="outline" className={STATUS_CLASS[row.catalog.terminal_status]}>
              {row.catalog.terminal_status}
            </Badge>
            {row.catalog.reason && (
              <p className="mt-1 text-xs text-muted-foreground">{row.catalog.reason}</p>
            )}
          </div>
        ),
        sortValue: (row) => `${row.catalog.terminal_status} ${row.catalog.reason ?? ''}`,
      },
      {
        header: 'Tokens / rank',
        align: 'right',
        cell: (row) => row.catalog.tokens_per_rank.toLocaleString(),
        sortValue: (row) => row.catalog.tokens_per_rank,
      },
      {
        header: 'Global tokens',
        align: 'right',
        cell: (row) => row.catalog.global_tokens.toLocaleString(),
        sortValue: (row) => row.catalog.global_tokens,
      },
      {
        header: 'Correctness',
        cell: correctnessSummary,
        sortValue: (row) =>
          row.point
            ? `${row.point.correctness.passed} ${row.point.correctness.max_relative_error}`
            : '',
      },
      {
        header: 'Evidence',
        cell: (row) => (
          <div className="min-w-32 text-xs">
            <p>
              {row.attempts.length} attempt{row.attempts.length === 1 ? '' : 's'}
            </p>
            <p className="text-muted-foreground">
              {row.attempts.some((attempt) => attempt.selected) ? 'selected' : '—'} ·{' '}
              {row.point?.evidence_ids.length ?? 0} evidence IDs
            </p>
          </div>
        ),
        sortValue: (row) => row.attempts.length,
      },
      {
        header: 'Anomalies',
        cell: (row) => <span className="block min-w-64 text-xs">{pointAnomalies(row)}</span>,
        sortValue: pointAnomalies,
      },
      {
        header: 'Dispatch',
        cell: (row) => componentSummary(row.point?.components.dispatch ?? null),
      },
      {
        header: 'Stage',
        cell: (row) => componentSummary(row.point?.components.stage ?? null),
      },
      {
        header: 'Combine',
        cell: (row) => componentSummary(row.point?.components.combine ?? null),
      },
      {
        header: 'Round trip',
        cell: (row) => componentSummary(row.point?.components.roundtrip ?? null),
      },
      {
        header: 'Isolated sum',
        cell: (row) => componentSummary(row.point?.components.isolated_sum ?? null),
      },
    ],
    [],
  );

  return (
    <Card
      data-testid="collectivex-case-detail"
      className="min-w-0 w-full max-w-full overflow-hidden"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium text-muted-foreground">Selected matrix case</p>
          <h2 className="mt-1 text-lg font-semibold">{item.label}</h2>
          <p className="mt-1 font-mono text-xs text-muted-foreground">{item.case_id}</p>
        </div>
        <TerminalBadges item={item} />
      </div>
      <dl className="mt-4 grid gap-4 border-y py-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
        <DetailValue
          label="Resource"
          value={`${item.resource.profile ?? 'unconfigured'} · ${item.resource.configured_units ?? '-'} ${item.resource.comm_units_kind ?? 'units'}`}
        />
        <DetailValue
          label="Topology"
          value={`EP${item.topology.ep_size} · ${collectiveXTopologyLabel(item.topology)}`}
        />
        <DetailValue label="Dispatch precision" value={axisLabel(item.dispatch_precision)} />
        <DetailValue label="Combine precision" value={axisLabel(item.combine_precision)} />
        <DetailValue label="Precision profile" value={item.precision_profile ?? 'n/a'} mono />
        <DetailValue label="Routing" value={routingKey(item)} />
        <DetailValue label="Backend" value={backendLabel(item)} />
      </dl>
      <h3 className="mt-5 font-semibold">Point terminal evidence</h3>
      <DataTable
        data={rows}
        columns={columns}
        testId="collectivex-case-points-table"
        analyticsPrefix="collectivex_case_points"
        watermark={false}
      />
    </Card>
  );
}

export function CollectiveXInventory({ dataset }: { dataset: CollectiveXDataset }) {
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [selectedCaseId, setSelectedCaseId] = useState(dataset.coverage[0]?.case_id ?? '');
  const setFilter = (key: FilterKey, value: string) =>
    setFilters((previous) => ({ ...previous, [key]: value }));
  const options = useMemo(
    () => ({
      sku: uniqueOptions(
        dataset.coverage,
        (item) => item.sku,
        (item) => item.sku.toUpperCase(),
      ),
      backend: uniqueOptions(dataset.coverage, backendKey, backendLabel),
      ep: uniqueOptions(
        dataset.coverage,
        (item) => String(item.topology.ep_size),
        (item) => `EP${item.topology.ep_size}`,
      ),
      mode: uniqueOptions(dataset.coverage, (item) => item.mode),
      phase: uniqueOptions(dataset.coverage, (item) => item.phase),
      routing: uniqueOptions(dataset.coverage, routingKey),
      topology: uniqueOptions(
        dataset.coverage,
        topologyKey,
        (item) => `${item.topology.scope} · ${item.topology.topology_class}`,
      ),
      dispatchPrecision: uniqueOptions(
        dataset.coverage,
        (item) => axisKey(item.dispatch_precision),
        (item) => axisLabel(item.dispatch_precision),
      ),
      combinePrecision: uniqueOptions(
        dataset.coverage,
        (item) => axisKey(item.combine_precision),
        (item) => axisLabel(item.combine_precision),
      ),
      terminal: TERMINAL_ORDER.map((status) => ({ value: status, label: status })),
    }),
    [dataset.coverage],
  );
  const filtered = useMemo(
    () =>
      dataset.coverage.filter(
        (item) =>
          (filters.sku === 'all' || item.sku === filters.sku) &&
          (filters.backend === 'all' || backendKey(item) === filters.backend) &&
          (filters.ep === 'all' || String(item.topology.ep_size) === filters.ep) &&
          (filters.mode === 'all' || item.mode === filters.mode) &&
          (filters.phase === 'all' || item.phase === filters.phase) &&
          (filters.routing === 'all' || routingKey(item) === filters.routing) &&
          (filters.topology === 'all' || topologyKey(item) === filters.topology) &&
          (filters.dispatchPrecision === 'all' ||
            axisKey(item.dispatch_precision) === filters.dispatchPrecision) &&
          (filters.combinePrecision === 'all' ||
            axisKey(item.combine_precision) === filters.combinePrecision) &&
          (filters.terminal === 'all' ||
            item.points.some((point) => point.terminal_status === filters.terminal)),
      ),
    [dataset.coverage, filters],
  );
  useEffect(() => {
    if (!filtered.some((item) => item.case_id === selectedCaseId)) {
      setSelectedCaseId(filtered[0]?.case_id ?? '');
    }
  }, [filtered, selectedCaseId]);
  const selected = filtered.find((item) => item.case_id === selectedCaseId) ?? null;
  const columns = useMemo<DataTableColumn<CollectiveXCoverage>[]>(
    () => [
      {
        header: 'Case',
        cell: (row) => (
          <button
            type="button"
            onClick={() => setSelectedCaseId(row.case_id)}
            className="flex min-w-56 items-center gap-2 text-left font-medium hover:underline"
            aria-label={`Inspect ${row.label}`}
          >
            <ChevronRight className="size-4 shrink-0" />
            <span>
              {row.label}
              <span className="mt-0.5 block font-mono text-[11px] font-normal text-muted-foreground">
                {row.case_id.slice(-12)}
              </span>
            </span>
          </button>
        ),
        sortValue: (row) => `${row.label} ${row.case_id}`,
      },
      { header: 'SKU', cell: (row) => row.sku.toUpperCase(), sortValue: (row) => row.sku },
      {
        header: 'Backend / generation',
        cell: backendLabel,
        sortValue: backendLabel,
        className: 'whitespace-nowrap',
      },
      {
        header: 'EP',
        cell: (row) => `EP${row.topology.ep_size}`,
        sortValue: (row) => row.topology.ep_size,
      },
      {
        header: 'Mode / phase',
        cell: (row) => `${row.mode} · ${row.phase}`,
        sortValue: (row) => `${row.mode} ${row.phase}`,
        className: 'whitespace-nowrap',
      },
      {
        header: 'Routing / EPLB',
        cell: routingKey,
        sortValue: routingKey,
        className: 'whitespace-nowrap',
      },
      {
        header: 'Topology',
        cell: (row) => `${row.topology.scope} · ${row.topology.topology_class}`,
        sortValue: topologyKey,
        className: 'whitespace-nowrap',
      },
      {
        header: 'Dispatch precision',
        cell: (row) => axisLabel(row.dispatch_precision),
        sortValue: (row) => axisLabel(row.dispatch_precision),
        className: 'min-w-52',
      },
      {
        header: 'Combine precision',
        cell: (row) => axisLabel(row.combine_precision),
        sortValue: (row) => axisLabel(row.combine_precision),
        className: 'min-w-52',
      },
      {
        header: 'Disposition',
        cell: (row) => `${row.disposition} · ${row.outcome}`,
        sortValue: (row) => `${row.disposition} ${row.outcome}`,
        className: 'whitespace-nowrap',
      },
      {
        header: 'Point terminal status',
        cell: (row) => <TerminalBadges item={row} />,
        sortValue: terminalSummary,
        className: 'min-w-44',
      },
    ],
    [],
  );
  const pointCounts = dataset.coverage.flatMap((item) => item.points);

  return (
    <>
      <Card
        data-testid="collectivex-inventory"
        className="min-w-0 w-full max-w-full overflow-hidden"
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">Matrix case inventory</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {filtered.length} of {dataset.coverage.length} cases · {dataset.run.measured_cases}{' '}
              measured cases · {dataset.run.unsupported_cases} unsupported cases ·{' '}
              {dataset.run.terminal_points}/{dataset.run.requested_points} terminal points ·{' '}
              {pointCounts.filter((point) => point.terminal_status === 'measured').length} measured
              points ·{' '}
              {pointCounts.filter((point) => point.terminal_status === 'unsupported').length}{' '}
              unsupported points
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setFilters(EMPTY_FILTERS)}
            disabled={Object.values(filters).every((value) => value === 'all')}
          >
            <RotateCcw className="size-4" />
            Reset filters
          </Button>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6">
          <FilterSelect
            label="SKU"
            testId="collectivex-inventory-sku"
            value={filters.sku}
            options={options.sku}
            onChange={(value) => setFilter('sku', value)}
          />
          <FilterSelect
            label="Backend / generation"
            testId="collectivex-inventory-backend"
            value={filters.backend}
            options={options.backend}
            onChange={(value) => setFilter('backend', value)}
          />
          <FilterSelect
            label="EP"
            testId="collectivex-inventory-ep"
            value={filters.ep}
            options={options.ep}
            onChange={(value) => setFilter('ep', value)}
          />
          <FilterSelect
            label="Mode"
            testId="collectivex-inventory-mode"
            value={filters.mode}
            options={options.mode}
            onChange={(value) => setFilter('mode', value)}
          />
          <FilterSelect
            label="Phase"
            testId="collectivex-inventory-phase"
            value={filters.phase}
            options={options.phase}
            onChange={(value) => setFilter('phase', value)}
          />
          <FilterSelect
            label="Routing / EPLB"
            testId="collectivex-inventory-routing"
            value={filters.routing}
            options={options.routing}
            onChange={(value) => setFilter('routing', value)}
          />
          <FilterSelect
            label="Topology"
            testId="collectivex-inventory-topology"
            value={filters.topology}
            options={options.topology}
            onChange={(value) => setFilter('topology', value)}
          />
          <FilterSelect
            label="Dispatch precision"
            testId="collectivex-inventory-dispatch-precision"
            value={filters.dispatchPrecision}
            options={options.dispatchPrecision}
            onChange={(value) => setFilter('dispatchPrecision', value)}
          />
          <FilterSelect
            label="Combine precision"
            testId="collectivex-inventory-combine-precision"
            value={filters.combinePrecision}
            options={options.combinePrecision}
            onChange={(value) => setFilter('combinePrecision', value)}
          />
          <FilterSelect
            label="Terminal disposition"
            testId="collectivex-inventory-terminal"
            value={filters.terminal}
            options={options.terminal}
            onChange={(value) => setFilter('terminal', value)}
          />
        </div>
        <DataTable
          data={filtered}
          columns={columns}
          testId="collectivex-inventory-table"
          analyticsPrefix="collectivex_inventory"
        />
      </Card>
      {selected && <CaseDetail dataset={dataset} item={selected} />}
    </>
  );
}
