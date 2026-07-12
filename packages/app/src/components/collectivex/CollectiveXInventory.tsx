'use client';

import { useMemo } from 'react';

import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { type DataTableColumn, DataTable } from '@/components/ui/data-table';

import { collectiveXTopologyLabel } from './data';
import type { CollectiveXCoverage, CollectiveXDataset, CollectiveXTerminalStatus } from './types';

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

export function CollectiveXInventory({ dataset }: { dataset: CollectiveXDataset }) {
  const columns = useMemo<DataTableColumn<CollectiveXCoverage>[]>(
    () => [
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
  const points = dataset.coverage.flatMap((item) => item.points);
  const measured = points.filter((point) => point.terminal_status === 'measured').length;
  const unsupported = points.filter((point) => point.terminal_status === 'unsupported').length;

  return (
    <Card data-testid="collectivex-inventory" className="min-w-0 w-full max-w-full overflow-hidden">
      <h2 className="text-lg font-semibold">Matrix case inventory</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        {dataset.coverage.length} cases · {dataset.run.measured_cases} measured ·{' '}
        {dataset.run.unsupported_cases} unsupported · {dataset.run.terminal_points}/
        {dataset.run.requested_points} terminal points · {measured} measured · {unsupported}{' '}
        unsupported
      </p>
      <DataTable
        data={dataset.coverage}
        columns={columns}
        testId="collectivex-inventory-table"
        analyticsPrefix="collectivex_inventory"
      />
    </Card>
  );
}
