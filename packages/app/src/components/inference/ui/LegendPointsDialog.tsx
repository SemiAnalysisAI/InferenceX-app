'use client';

import { ArrowDown, ArrowUp, ExternalLink } from 'lucide-react';
import { useMemo, useState } from 'react';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

import {
  type LegendPointsSortKey,
  type LegendPointsTableRow,
  formatRowValue,
  sortLegendPointsRows,
} from '@/components/inference/utils/legend-points-table';

export interface LegendPointsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Series label, e.g. "B300 (vLLM)". */
  title: string;
  /** Context line, e.g. "DeepSeek V4 Pro · Agentic Traces". */
  subtitle: string;
  /** Legend swatch color for this series (overlayRunColor for overlay runs). */
  accentColor: string;
  /** Rows from buildLegendPointsRows — already default-sorted by concurrency. */
  rows: LegendPointsTableRow[];
  /** Unofficial-run overlay series: metrics only, no detail links. */
  isOverlay: boolean;
  onRowClick?: (row: LegendPointsTableRow) => void;
}

interface Column {
  key: LegendPointsSortKey;
  label: string;
  numeric: boolean;
}

const cellValue = (row: LegendPointsTableRow, col: Column): string => {
  if (col.key === 'conc') return String(row.conc);
  if (col.key === 'parallelism') return row.parallelism;
  if (col.key === 'offload') return row.offload ?? '—';
  return formatRowValue(row[col.key]);
};

/**
 * Per-series drill-down opened from the chart legend: every currently-visible
 * point of one hardware/framework series, with the same detail links the
 * scatter points offer on click.
 */
export default function LegendPointsDialog({
  open,
  onOpenChange,
  title,
  subtitle,
  accentColor,
  rows,
  isOverlay,
  onRowClick,
}: LegendPointsDialogProps) {
  const [sort, setSort] = useState<{ key: LegendPointsSortKey; dir: 'asc' | 'desc' } | null>(null);

  const hasOffload = rows.some((r) => r.offload !== null);
  const columns = useMemo(
    (): Column[] => [
      { key: 'conc', label: 'Conc', numeric: true },
      { key: 'parallelism', label: 'Parallelism', numeric: false },
      ...(hasOffload ? [{ key: 'offload', label: 'Offload', numeric: false } as Column] : []),
      { key: 'tputPerGpu', label: 'Tput/GPU', numeric: true },
      { key: 'p50Intvty', label: 'p50 Int', numeric: true },
      { key: 'p90Intvty', label: 'p90 Int', numeric: true },
      { key: 'p50Ttft', label: 'p50 TTFT', numeric: true },
      { key: 'p90Ttft', label: 'p90 TTFT', numeric: true },
    ],
    [hasOffload],
  );

  const sortedRows = useMemo(
    () => (sort ? sortLegendPointsRows(rows, sort.key, sort.dir) : rows),
    [rows, sort],
  );

  const toggleSort = (key: LegendPointsSortKey) => {
    setSort((prev) =>
      prev?.key === key ? (prev.dir === 'asc' ? { key, dir: 'desc' } : null) : { key, dir: 'asc' },
    );
  };

  // Trailing column reserves space for the detail-link icon.
  const gridTemplateColumns = `${columns.map(() => 'auto').join(' ')} min-content`;

  const renderCells = (row: LegendPointsTableRow) => (
    <>
      {columns.map((col) => (
        <span
          role="cell"
          key={col.key}
          className={cn('px-2 py-1', col.numeric ? 'text-right tabular-nums' : 'text-left')}
        >
          {cellValue(row, col)}
        </span>
      ))}
      <span role="cell" className="px-2 py-1 text-muted-foreground">
        {row.href &&
          (row.isExternal ? (
            <ExternalLink size={12} aria-hidden="true" />
          ) : (
            <span aria-hidden="true">&rarr;</span>
          ))}
      </span>
    </>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        data-testid="legend-points-dialog"
        className="sm:max-w-3xl max-h-[80vh] flex flex-col gap-3"
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <span
              className="size-3 shrink-0 rounded-full"
              style={{ backgroundColor: accentColor }}
              aria-hidden="true"
            />
            {title}
          </DialogTitle>
          <DialogDescription>{subtitle}</DialogDescription>
        </DialogHeader>

        {sortedRows.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4">
            No visible points for this series under the current filters.
          </p>
        ) : (
          // One grid owns the column tracks; every row is a subgrid so cells
          // align across ALL rows (per-row grids would auto-size independently
          // and produce ragged columns).
          <div
            role="table"
            className="grid content-start overflow-y-auto overflow-x-auto min-h-0 text-xs"
            style={{ gridTemplateColumns }}
          >
            <div
              role="row"
              className="col-span-full grid grid-cols-subgrid items-center border-b border-border sticky top-0 bg-background"
            >
              {columns.map((col) => {
                const active = sort?.key === col.key;
                return (
                  <button
                    role="columnheader"
                    aria-sort={active ? (sort!.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
                    type="button"
                    key={col.key}
                    onClick={() => toggleSort(col.key)}
                    className={cn(
                      'flex items-center gap-0.5 px-2 py-1.5 font-medium text-muted-foreground hover:text-foreground whitespace-nowrap',
                      col.numeric && 'justify-end',
                    )}
                  >
                    {col.label}
                    {active &&
                      (sort!.dir === 'asc' ? <ArrowUp size={11} /> : <ArrowDown size={11} />)}
                  </button>
                );
              })}
              <span role="columnheader" className="px-2" />
            </div>
            {sortedRows.map((row) =>
              row.href ? (
                <a
                  role="row"
                  data-testid="legend-points-row"
                  key={row.key}
                  href={row.href}
                  {...(row.isExternal ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
                  onClick={() => onRowClick?.(row)}
                  className="col-span-full grid grid-cols-subgrid items-center rounded-sm hover:bg-accent whitespace-nowrap"
                >
                  {renderCells(row)}
                </a>
              ) : (
                <div
                  role="row"
                  data-testid="legend-points-row"
                  key={row.key}
                  className="col-span-full grid grid-cols-subgrid items-center whitespace-nowrap"
                >
                  {renderCells(row)}
                </div>
              ),
            )}
          </div>
        )}

        <p className="text-[10px] text-muted-foreground/70 leading-tight">
          {isOverlay
            ? 'Unofficial overlay points have no stored benchmark records — metrics only, no detail links.'
            : 'Click a row for the point detail — agentic points open the trace detail page, fixed-seq points open the GitHub Actions run.'}{' '}
          Interactivity in tok/s/user · TTFT in s · throughput in tok/s/gpu.
        </p>
      </DialogContent>
    </Dialog>
  );
}
