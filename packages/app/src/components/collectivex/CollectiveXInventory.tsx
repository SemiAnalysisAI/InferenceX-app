'use client';

import { useMemo } from 'react';

import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { type DataTableColumn, DataTable } from '@/components/ui/data-table';

import { collectiveXTopologyLabel } from './data';
import type { CollectiveXCoverage, CollectiveXDataset, CollectiveXTerminalStatus } from './types';

type CollectiveXRunCoverage = CollectiveXCoverage & { run_id: string };

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
  failed: 'border-red-700/50 bg-red-700/10 text-red-800 dark:text-red-300',
  invalid: 'border-red-600/40 bg-red-500/10 text-red-700 dark:text-red-300',
  diagnostic: 'border-amber-600/40 bg-amber-500/10 text-amber-700 dark:text-amber-300',
  pending: 'border-zinc-500/40 bg-zinc-500/5 text-muted-foreground',
};

function terminalCounts(item: CollectiveXCoverage): Record<CollectiveXTerminalStatus, number> {
  const counts = Object.fromEntries(TERMINAL_ORDER.map((status) => [status, 0])) as Record<
    CollectiveXTerminalStatus,
    number
  >;
  for (const point of item.points) counts[point.terminal_status] += 1;
  return counts;
}

function TerminalBadges({ item }: { item: CollectiveXCoverage }) {
  const counts = terminalCounts(item);
  const reasons = [...new Set(item.points.flatMap((point) => point.reason ?? []))];
  return (
    <div className="min-w-44">
      <div className="flex flex-wrap gap-1">
        {TERMINAL_ORDER.filter((status) => counts[status] > 0).map((status) => (
          <Badge key={status} variant="outline" className={STATUS_CLASS[status]}>
            {status} {counts[status]}
          </Badge>
        ))}
      </div>
      {reasons.length > 0 && (
        <p className="mt-1 text-xs text-muted-foreground">{reasons.join(', ')}</p>
      )}
    </div>
  );
}

export function CollectiveXInventory({ datasets }: { datasets: CollectiveXDataset[] }) {
  const rows = useMemo<CollectiveXRunCoverage[]>(
    () =>
      datasets.flatMap((dataset) =>
        dataset.coverage.map((item) => ({ ...item, run_id: dataset.run.run_id })),
      ),
    [datasets],
  );
  const columns = useMemo<DataTableColumn<CollectiveXRunCoverage>[]>(
    () => [
      {
        header: 'Run',
        cell: (row) => <span className="font-mono text-xs">#{row.run_id}</span>,
        sortValue: (row) => Number(row.run_id),
        className: 'whitespace-nowrap',
      },
      {
        header: 'Case',
        cell: (row) => (
          <div className="min-w-56">
            <p className="font-medium">{row.label}</p>
            <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">{row.case_id}</p>
          </div>
        ),
        sortValue: (row) => `${row.label} ${row.case_id}`,
      },
      { header: 'SKU', cell: (row) => row.sku.toUpperCase(), sortValue: (row) => row.sku },
      {
        header: 'Backend',
        cell: (row) => row.backend,
        sortValue: (row) => row.backend,
        className: 'whitespace-nowrap',
      },
      {
        header: 'EP',
        cell: (row) => `EP${row.topology.ep_size}`,
        sortValue: (row) => row.topology.ep_size,
      },
      {
        header: 'Phase',
        cell: (row) => row.phase,
        sortValue: (row) => row.phase,
      },
      {
        header: 'Mode',
        cell: (row) => row.mode,
        sortValue: (row) => row.mode,
      },
      {
        header: 'Precision',
        cell: (row) => row.precision,
        sortValue: (row) => row.precision,
      },
      {
        header: 'Topology',
        cell: (row) => collectiveXTopologyLabel(row.topology),
        sortValue: (row) => collectiveXTopologyLabel(row.topology),
        className: 'whitespace-nowrap',
      },
      {
        header: 'Disposition',
        cell: (row) => (
          <div className="min-w-48">
            <p>
              {row.disposition} · {row.outcome}
            </p>
            {(row.detail || row.reason) && (
              <p className="text-xs text-muted-foreground">{row.detail ?? row.reason}</p>
            )}
          </div>
        ),
        sortValue: (row) =>
          `${row.disposition} ${row.outcome} ${row.reason ?? ''} ${row.detail ?? ''}`,
      },
      {
        header: 'Point status',
        cell: (row) => <TerminalBadges item={row} />,
        sortValue: (row) =>
          `${TERMINAL_ORDER.map((status) => `${status}:${terminalCounts(row)[status]}`).join(' ')} ${row.points.map((point) => point.reason ?? '').join(' ')}`,
      },
    ],
    [],
  );
  const points = rows.flatMap((item) => item.points);
  const measured = points.filter((point) => point.terminal_status === 'measured').length;
  const unsupported = points.filter((point) => point.terminal_status === 'unsupported').length;
  // Counted from this table's own EP coverage rows: the run-level totals also
  // include kv-transfer cases, which live in their own card, not here.
  const measuredCases = rows.filter((row) => row.outcome === 'success').length;
  const unsupportedCases = rows.filter((row) => row.outcome === 'unsupported').length;
  const terminalPoints = datasets.reduce((sum, dataset) => sum + dataset.run.terminal_points, 0);
  const requestedPoints = datasets.reduce((sum, dataset) => sum + dataset.run.requested_points, 0);

  return (
    <Card data-testid="collectivex-inventory" className="min-w-0 w-full max-w-full overflow-hidden">
      <h2 className="text-lg font-semibold">Matrix case inventory</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        {datasets.length} runs · {rows.length} cases · {measuredCases} measured · {unsupportedCases}{' '}
        unsupported · {terminalPoints}/{requestedPoints} terminal points · {measured} measured ·{' '}
        {unsupported} unsupported
      </p>
      <DataTable
        data={rows}
        columns={columns}
        testId="collectivex-inventory-table"
        analyticsPrefix="collectivex_inventory"
      />
    </Card>
  );
}
