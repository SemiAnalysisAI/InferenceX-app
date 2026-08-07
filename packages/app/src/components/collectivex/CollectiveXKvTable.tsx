'use client';

import { useMemo } from 'react';

import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { type DataTableColumn, DataTable } from '@/components/ui/data-table';
import { useLocale } from '@/lib/use-locale';

import { collectiveXKvCell } from './data';
import type { CollectiveXDataset, CollectiveXKvCase, CollectiveXOutcome } from './types';

type CollectiveXRunKvCase = CollectiveXKvCase & { run_id: string };

const STRINGS = {
  en: {
    heading: 'KV-cache transfer',
    description:
      'Prefill-to-decode KV handoff (2 nodes x 1 GPU, DeepSeek-V4-Pro cache as vLLM allocates it). ' +
      'Paged rows move per-request layer-major descriptor lists over randomized block tables; ' +
      'bulk is the single-descriptor wire ceiling. GB/s is burst-aggregate pull at the largest ISL; ' +
      'b1/bmax are requests posted per burst.',
  },
  zh: {
    heading: 'KV 缓存传输',
    description:
      '预填充到解码的 KV 交接（2 节点 x 1 GPU，按 vLLM 为 DeepSeek-V4-Pro 分配的缓存布局）。' +
      '分页行按随机块表以逐层描述符列表搬运每个请求；bulk 为单描述符线速上限。' +
      'GB/s 为最大 ISL 处按突发聚合的 pull 带宽；b1/bmax 表示每次突发提交的请求数。',
  },
} as const;

const OUTCOME_CLASS: Record<CollectiveXOutcome, string> = {
  success: 'border-emerald-600/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  unsupported: 'border-zinc-500/40 bg-zinc-500/10 text-zinc-700 dark:text-zinc-300',
  failed: 'border-red-700/50 bg-red-700/10 text-red-800 dark:text-red-300',
  invalid: 'border-red-600/40 bg-red-500/10 text-red-700 dark:text-red-300',
  diagnostic: 'border-amber-600/40 bg-amber-500/10 text-amber-700 dark:text-amber-300',
  pending: 'border-zinc-500/40 bg-zinc-500/5 text-muted-foreground',
};

function formatGbps(value: number | null | undefined): string {
  return value === null || value === undefined ? '-' : value.toFixed(value >= 100 ? 0 : 2);
}

function cellsOf(row: CollectiveXRunKvCase) {
  return {
    p64b1: collectiveXKvCell(row.rows, 'paged', 64, 'min'),
    p64bmax: collectiveXKvCell(row.rows, 'paged', 64, 'max'),
    p16b1: collectiveXKvCell(row.rows, 'paged', 16, 'min'),
    bulk: collectiveXKvCell(row.rows, 'bulk', null, 'min'),
  };
}

export function CollectiveXKvTable({ datasets }: { datasets: CollectiveXDataset[] }) {
  const locale = useLocale();
  const strings = STRINGS[locale === 'zh' ? 'zh' : 'en'];
  const rows = useMemo<CollectiveXRunKvCase[]>(
    () =>
      datasets.flatMap((dataset) =>
        (dataset.kv ?? []).map((item) => ({ ...item, run_id: dataset.run.run_id })),
      ),
    [datasets],
  );
  const columns = useMemo<DataTableColumn<CollectiveXRunKvCase>[]>(
    () => [
      {
        header: 'Run',
        cell: (row) => <span className="font-mono text-xs">#{row.run_id}</span>,
        sortValue: (row) => Number(row.run_id),
        className: 'whitespace-nowrap',
      },
      { header: 'SKU', cell: (row) => row.sku.toUpperCase(), sortValue: (row) => row.sku },
      {
        header: 'Backend',
        cell: (row) => row.backend,
        sortValue: (row) => row.backend,
        className: 'whitespace-nowrap',
      },
      { header: 'Fabric', cell: (row) => row.fabric, sortValue: (row) => row.fabric },
      { header: 'Workload', cell: (row) => row.workload, sortValue: (row) => row.workload },
      { header: 'Precision', cell: (row) => row.precision, sortValue: (row) => row.precision },
      {
        header: 'Outcome',
        cell: (row) => (
          <div className="min-w-28">
            <Badge variant="outline" className={OUTCOME_CLASS[row.outcome]}>
              {row.outcome}
            </Badge>
            {(row.detail || row.reason) && (
              <p className="mt-1 text-xs text-muted-foreground">{row.detail ?? row.reason}</p>
            )}
          </div>
        ),
        sortValue: (row) => `${row.outcome} ${row.reason ?? ''}`,
      },
      {
        header: 'Bulk GB/s',
        cell: (row) => formatGbps(cellsOf(row).bulk?.gbps_p50),
        sortValue: (row) => cellsOf(row).bulk?.gbps_p50 ?? -1,
        className: 'text-right tabular-nums',
      },
      {
        header: 'p64 GB/s b1',
        cell: (row) => formatGbps(cellsOf(row).p64b1?.gbps_p50),
        sortValue: (row) => cellsOf(row).p64b1?.gbps_p50 ?? -1,
        className: 'text-right tabular-nums',
      },
      {
        header: 'p64 GB/s bmax',
        cell: (row) => {
          const cell = cellsOf(row).p64bmax;
          if (!cell) return '-';
          return `${formatGbps(cell.gbps_p50)} (b${cell.batch})`;
        },
        sortValue: (row) => cellsOf(row).p64bmax?.gbps_p50 ?? -1,
        className: 'text-right tabular-nums whitespace-nowrap',
      },
      {
        header: 'p16 GB/s b1',
        cell: (row) => formatGbps(cellsOf(row).p16b1?.gbps_p50),
        sortValue: (row) => cellsOf(row).p16b1?.gbps_p50 ?? -1,
        className: 'text-right tabular-nums',
      },
      {
        header: 'Handoff ms',
        cell: (row) => {
          const cell = cellsOf(row).p64b1;
          return cell ? cell.latency_ms.p50.toFixed(1) : '-';
        },
        sortValue: (row) => cellsOf(row).p64b1?.latency_ms.p50 ?? -1,
        className: 'text-right tabular-nums',
      },
    ],
    [],
  );
  if (rows.length === 0) return null;
  const measured = rows.filter((row) => row.outcome === 'success').length;
  return (
    <Card data-testid="collectivex-kv-table" className="min-w-0 w-full max-w-full overflow-hidden">
      <h2 className="text-lg font-semibold">{strings.heading}</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        {rows.length} cases · {measured} measured · {strings.description}
      </p>
      <DataTable
        data={rows}
        columns={columns}
        testId="collectivex-kv-table-table"
        analyticsPrefix="collectivex_kv"
      />
    </Card>
  );
}
