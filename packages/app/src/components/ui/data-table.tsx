'use client';

import { useMemo, useRef, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  Columns3,
  Search,
  X,
} from 'lucide-react';

import { track } from '@/lib/analytics';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

export interface DataTableColumn<T> {
  /** Unique key for the column (used for visibility state). Defaults to header text. */
  key?: string;
  /** Column header text. */
  header: string;
  /** Right-align the column (default: false = left-aligned). */
  align?: 'left' | 'right' | 'center';
  /** Extract and format the cell value from a row. */
  cell: (row: T, index: number) => React.ReactNode;
  /** Extract a sortable/searchable value from a row. Omit to disable sorting and search for this column. */
  sortValue?: (row: T) => number | string;
  /** Additional className for header and body cells. */
  className?: string;
  /** Whether this column is hidden by default (default: false). */
  defaultHidden?: boolean;
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

function colKey(col: { key?: string; header: string }): string {
  return col.key ?? col.header;
}

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
  const [search, setSearch] = useState('');
  const [hiddenColumns, setHiddenColumns] = useState<Set<string>>(
    () => new Set(columns.filter((c) => c.defaultHidden).map((c) => c.key ?? c.header)),
  );
  const searchRef = useRef<HTMLInputElement>(null);

  const visibleColumns = useMemo(
    () => columns.filter((c) => !hiddenColumns.has(colKey(c))),
    [columns, hiddenColumns],
  );

  const handleSort = (colIndex: number) => {
    const col = visibleColumns[colIndex];
    if (!col.sortValue) return;
    setSort((prev) => {
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

  // Search: match against all columns with sortValue
  const filtered = useMemo(() => {
    if (!search.trim()) return data;
    const q = search.trim().toLowerCase();
    return data.filter((row) =>
      columns.some((col) => {
        if (!col.sortValue) return false;
        return String(col.sortValue(row)).toLowerCase().includes(q);
      }),
    );
  }, [data, search, columns]);

  const sorted = useMemo(() => {
    if (sort.dir === null || sort.columnIndex < 0) return filtered;
    const col = visibleColumns[sort.columnIndex];
    if (!col?.sortValue) return filtered;
    const extract = col.sortValue;
    const multiplier = sort.dir === 'asc' ? 1 : -1;
    return [...filtered].toSorted((a, b) => {
      const av = extract(a);
      const bv = extract(b);
      if ((av === null || av === undefined) && (bv === null || bv === undefined)) return 0;
      if (av === null || av === undefined) return 1;
      if (bv === null || bv === undefined) return -1;
      if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * multiplier;
      return String(av).localeCompare(String(bv)) * multiplier;
    });
  }, [filtered, sort, visibleColumns]);

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

  const toggleColumn = (col: DataTableColumn<T>) => {
    const key = colKey(col);
    setHiddenColumns((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      track(`${analyticsPrefix}_column_toggled`, { column: col.header, visible: !next.has(key) });
      return next;
    });
  };

  return (
    <div data-testid={testId}>
      {/* Toolbar: search + column visibility */}
      <div className="flex items-center gap-2 mb-3">
        <div className="relative grow max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <input
            ref={searchRef}
            type="text"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(0);
            }}
            placeholder="Search..."
            className="w-full h-7 pl-8 pr-7 text-xs bg-transparent border border-border rounded-md focus:outline-none focus:ring-1 focus:ring-ring"
            aria-label="Search table"
          />
          {search && (
            <button
              onClick={() => {
                setSearch('');
                setPage(0);
                searchRef.current?.focus();
              }}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              aria-label="Clear search"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>
        <Popover>
          <PopoverTrigger asChild>
            <button
              className="inline-flex items-center gap-1.5 h-7 px-2 text-xs font-medium border border-border rounded-md text-muted-foreground hover:text-foreground transition-colors"
              aria-label="Toggle columns"
            >
              <Columns3 className="h-3.5 w-3.5" />
              Columns
            </button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-48 p-1">
            {columns.map((col) => {
              const key = colKey(col);
              const visible = !hiddenColumns.has(key);
              return (
                <button
                  key={key}
                  className={`flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground cursor-pointer ${visible ? '' : 'opacity-50'}`}
                  onClick={() => toggleColumn(col)}
                >
                  <span
                    className={`h-3.5 w-3.5 rounded-sm border ${visible ? 'bg-primary border-primary' : 'border-border'} flex items-center justify-center`}
                  >
                    {visible && <span className="text-primary-foreground text-[10px]">✓</span>}
                  </span>
                  {col.header}
                </button>
              );
            })}
          </PopoverContent>
        </Popover>
      </div>

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
          <thead className="sticky top-0 bg-background z-[1]">
            <tr className="border-b border-border">
              {visibleColumns.map((col, i) => {
                const sortable = Boolean(col.sortValue);
                const sortIcon =
                  sort.columnIndex === i && sort.dir
                    ? SORT_ICON[sort.dir]
                    : sortable
                      ? SORT_ICON.none
                      : null;
                return (
                  <th
                    key={colKey(col)}
                    className={`py-2 px-3 font-medium text-muted-foreground ${ALIGN_CLASSES[col.align ?? 'left']} ${col.className ?? ''} ${sortable ? 'cursor-pointer select-none hover:text-foreground transition-colors' : ''}`}
                    tabIndex={sortable ? 0 : undefined}
                    onClick={sortable ? () => handleSort(i) : undefined}
                    onKeyDown={
                      sortable
                        ? (e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              handleSort(i);
                            }
                          }
                        : undefined
                    }
                    aria-sort={
                      sort.columnIndex === i && sort.dir
                        ? sort.dir === 'asc'
                          ? 'ascending'
                          : 'descending'
                        : 'none'
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
            {pageData.length === 0 ? (
              <tr>
                <td
                  colSpan={visibleColumns.length}
                  className="py-8 text-center text-sm text-muted-foreground"
                >
                  No results match &quot;{search}&quot;
                </td>
              </tr>
            ) : (
              pageData.map((row, rowIndex) => (
                <tr key={rowIndex} className="border-b border-border/50 hover:bg-muted/30">
                  {visibleColumns.map((col) => (
                    <td
                      key={colKey(col)}
                      className={`py-2 px-3 ${ALIGN_CLASSES[col.align ?? 'left']} ${col.className ?? ''}`}
                    >
                      {col.cell(row, safePage * pageSize + rowIndex)}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination controls */}
      <div className="flex items-center justify-between mt-3 text-xs text-muted-foreground">
        <div className="flex items-center gap-2">
          <span>
            {sorted.length === 0
              ? '0'
              : `${safePage * pageSize + 1}–${Math.min((safePage + 1) * pageSize, sorted.length)}`}{' '}
            of {sorted.length}
            {search && ` (filtered from ${data.length})`}
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
