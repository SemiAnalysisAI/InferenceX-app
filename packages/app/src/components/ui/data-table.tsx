'use client';

import { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight } from 'lucide-react';

import { track } from '@/lib/analytics';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

export interface DataTableColumn<T> {
  /** Column header text. */
  header: string;
  /** Right-align the column (default: false = left-aligned). */
  align?: 'left' | 'right' | 'center';
  /** Extract and format the cell value from a row. */
  cell: (row: T, index: number) => React.ReactNode;
  /** Extract a sortable value from a row. Omit to disable sorting for this column. */
  sortValue?: (row: T) => number | string;
  /** Additional className for header and body cells. */
  className?: string;
}

type SortDir = 'asc' | 'desc' | null;

interface SortState {
  columnIndex: number;
  dir: SortDir;
}

interface DataTableProps<T> {
  /** Row data to display. */
  data: T[];
  /** Column definitions. */
  columns: DataTableColumn<T>[];
  /** Unique test id for the table wrapper. */
  testId?: string;
  /** Analytics event prefix for pagination events. */
  analyticsPrefix?: string;
  /** Show watermark (default: true). */
  watermark?: boolean;
}

const PAGE_SIZE_OPTIONS = [25, 50, 100, 250, 500] as const;

const ALIGN_CLASSES = {
  left: 'text-left',
  right: 'text-right',
  center: 'text-center',
} as const;

const SORT_ICON = {
  asc: <ArrowUp className="inline h-3 w-3" />,
  desc: <ArrowDown className="inline h-3 w-3" />,
  none: <ArrowUpDown className="inline h-3 w-3 opacity-30" />,
};

export function DataTable<T>({
  data,
  columns,
  testId = 'data-table',
  analyticsPrefix = 'table',
  watermark = true,
}: DataTableProps<T>) {
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState<number>(25);
  const [sort, setSort] = useState<SortState>({ columnIndex: -1, dir: null });

  const handleSort = (colIndex: number) => {
    const col = columns[colIndex];
    if (!col.sortValue) return;
    setSort((prev) => {
      // Cycle: none → desc → asc → none
      let nextDir: SortDir;
      if (prev.columnIndex !== colIndex) {
        nextDir = 'desc';
      } else if (prev.dir === 'desc') {
        nextDir = 'asc';
      } else if (prev.dir === 'asc') {
        nextDir = null;
      } else {
        nextDir = 'desc';
      }
      track(`${analyticsPrefix}_sort_changed`, { column: col.header, dir: nextDir ?? 'none' });
      return { columnIndex: colIndex, dir: nextDir };
    });
    setPage(0);
  };

  const sorted = useMemo(() => {
    if (sort.dir === null || sort.columnIndex < 0) return data;
    const col = columns[sort.columnIndex];
    if (!col?.sortValue) return data;
    const extract = col.sortValue;
    const multiplier = sort.dir === 'asc' ? 1 : -1;
    return [...data].toSorted((a, b) => {
      const av = extract(a);
      const bv = extract(b);
      if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * multiplier;
      return String(av).localeCompare(String(bv)) * multiplier;
    });
  }, [data, sort, columns]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const safePage = Math.min(page, totalPages - 1);
  const pageData = sorted.slice(safePage * pageSize, (safePage + 1) * pageSize);

  if (data.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-8 text-center">
        No data available for the current filters.
      </p>
    );
  }

  return (
    <div data-testid={testId}>
      <div className="overflow-x-auto relative">
        {watermark && (
          <div
            className="absolute inset-0 pointer-events-none flex items-center justify-center"
            aria-hidden="true"
          >
            <img src="/brand/logo-color.webp" alt="" className="w-48 opacity-10" />
          </div>
        )}
        <table className="w-full text-sm relative">
          <thead>
            <tr className="border-b border-border">
              {columns.map((col, i) => {
                const sortable = Boolean(col.sortValue);
                const sortIcon =
                  sort.columnIndex === i && sort.dir
                    ? SORT_ICON[sort.dir]
                    : sortable
                      ? SORT_ICON.none
                      : null;
                return (
                  <th
                    key={i}
                    className={`py-2 px-3 font-medium text-muted-foreground ${ALIGN_CLASSES[col.align ?? 'left']} ${col.className ?? ''} ${sortable ? 'cursor-pointer select-none hover:text-foreground transition-colors' : ''}`}
                    onClick={sortable ? () => handleSort(i) : undefined}
                    aria-sort={
                      sort.columnIndex === i && sort.dir
                        ? sort.dir === 'asc'
                          ? 'ascending'
                          : 'descending'
                        : undefined
                    }
                  >
                    {col.header}
                    {sortIcon && <span className="ml-1">{sortIcon}</span>}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {pageData.map((row, rowIndex) => (
              <tr key={rowIndex} className="border-b border-border/50 hover:bg-muted/30">
                {columns.map((col, colIndex) => (
                  <td
                    key={colIndex}
                    className={`py-2 px-3 ${ALIGN_CLASSES[col.align ?? 'left']} ${col.className ?? ''}`}
                  >
                    {col.cell(row, safePage * pageSize + rowIndex)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination controls */}
      <div className="flex items-center justify-between mt-3 text-xs text-muted-foreground">
        <div className="flex items-center gap-2">
          <span>
            {safePage * pageSize + 1}–{Math.min((safePage + 1) * pageSize, sorted.length)} of{' '}
            {sorted.length}
          </span>
          <Select
            value={String(pageSize)}
            onValueChange={(v) => {
              const size = Number(v);
              setPageSize(size);
              setPage(0);
              track(`${analyticsPrefix}_page_size_changed`, { size });
            }}
          >
            <SelectTrigger className="h-6 w-auto gap-1 px-2 text-xs" aria-label="Rows per page">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PAGE_SIZE_OPTIONS.map((size) => (
                <SelectItem key={size} value={String(size)}>
                  {size}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span>per page</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => {
              setPage((p) => Math.max(0, p - 1));
              track(`${analyticsPrefix}_page_changed`, { direction: 'prev' });
            }}
            disabled={safePage === 0}
            className="p-1 rounded hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            aria-label="Previous page"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span>
            {safePage + 1} / {totalPages}
          </span>
          <button
            onClick={() => {
              setPage((p) => Math.min(totalPages - 1, p + 1));
              track(`${analyticsPrefix}_page_changed`, { direction: 'next' });
            }}
            disabled={safePage >= totalPages - 1}
            className="p-1 rounded hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            aria-label="Next page"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
