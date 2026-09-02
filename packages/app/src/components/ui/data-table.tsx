'use client';

import { useMemo, useRef, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  Search,
  X,
} from 'lucide-react';

import { useUnofficialDomain } from '@/hooks/useUnofficialDomain';
import { track } from '@/lib/analytics';
import { SegmentedToggle, type SegmentedToggleOption } from '@/components/ui/segmented-toggle';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useLocale } from '@/lib/use-locale';

export interface DataTableColumn<T> {
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
  /** Opt-in visibility preset membership; columns without this remain in All data only. */
  importance?: 'key' | 'secondary';
  /** Pin this explicit configuration identifier while the table scrolls horizontally. */
  pinned?: boolean;
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
  /**
   * Show the search box (default: true). Turn it off for a table whose rows are
   * few and already named elsewhere — one line per chip, say — where a search
   * field is a control the reader has no use for.
   */
  searchable?: boolean;
}

type TablePreset = 'key' | 'all';

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100, 250, 500] as const;

const ALIGN_CLASSES = {
  left: 'text-left',
  right: 'text-right',
  center: 'text-center',
} as const;

const SORT_ICON = {
  asc: <ArrowUp className="inline size-3" />,
  desc: <ArrowDown className="inline size-3" />,
  none: <ArrowUpDown className="inline size-3 opacity-30" />,
};

const STRINGS = {
  en: {
    noData: 'No data available for the current filters.',
    search: 'Search...',
    searchAria: 'Search table',
    clearSearch: 'Clear search',
    noResults: 'No results match',
    of: 'of',
    filteredFrom: 'filtered from',
    rowUnit: 'rows',
    rowsPerPage: 'Rows per page',
    perPage: 'per page',
    previousPage: 'Previous page',
    nextPage: 'Next page',
    preset: 'Columns',
    keyPreset: 'Key metrics',
    allPreset: 'All data',
  },
  zh: {
    noData: '当前筛选条件下没有可用数据。',
    search: '搜索…',
    searchAria: '搜索表格',
    clearSearch: '清除搜索',
    noResults: '没有结果匹配',
    of: '共',
    filteredFrom: '筛选自',
    rowUnit: '行',
    rowsPerPage: '每页行数',
    perPage: '每页',
    previousPage: '上一页',
    nextPage: '下一页',
    preset: '列显示',
    keyPreset: '关键指标',
    allPreset: '全部数据',
  },
} as const;

export function DataTable<T>({
  data,
  columns,
  testId = 'data-table',
  analyticsPrefix = 'table',
  watermark = true,
  searchable = true,
}: DataTableProps<T>) {
  const locale = useLocale();
  const t = STRINGS[locale];
  const isUnofficialDomain = useUnofficialDomain();
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState<number>(10);
  const [sort, setSort] = useState<SortState>({ columnIndex: -1, dir: null });
  const [search, setSearch] = useState('');
  const hasPresets =
    columns.some((column) => column.importance === 'secondary') &&
    columns.some((column) => column.importance === 'key');
  const [preset, setPreset] = useState<TablePreset>('key');
  const searchRef = useRef<HTMLInputElement>(null);
  const visibleColumns =
    hasPresets && preset === 'key'
      ? columns.filter((column) => column.importance === 'key')
      : columns;

  const clearSearch = () => {
    setSearch('');
    setPage(0);
    track(`${analyticsPrefix}_search_cleared`);
    searchRef.current?.focus();
  };

  const handleSort = (colIndex: number) => {
    const col = columns[colIndex];
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
    if (!searchable || !search.trim()) return data;
    const q = search.trim().toLowerCase();
    return data.filter((row) =>
      columns.some((col) => {
        if (!col.sortValue) return false;
        return String(col.sortValue(row)).toLowerCase().includes(q);
      }),
    );
  }, [data, search, columns, searchable]);

  const sorted = useMemo(() => {
    if (sort.dir === null || sort.columnIndex < 0) return filtered;
    const col = columns[sort.columnIndex];
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
  }, [filtered, sort, columns]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const safePage = Math.min(page, totalPages - 1);
  const pageData = sorted.slice(safePage * pageSize, (safePage + 1) * pageSize);

  if (data.length === 0) {
    return <p className="text-sm text-muted-foreground py-8 text-center">{t.noData}</p>;
  }

  return (
    <div data-testid={testId} className="mt-3 w-full min-w-0 max-w-full">
      {/* Search */}
      {searchable && (
        <div className="relative mb-3 w-full max-w-sm sm:max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
          <input
            ref={searchRef}
            type="text"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(0);
            }}
            placeholder={t.search}
            className="h-11 w-full rounded-md border border-border bg-transparent pl-8 pr-9 text-xs focus:outline-none md:h-8"
            aria-label={t.searchAria}
          />
          {search && (
            <button
              type="button"
              onClick={clearSearch}
              className="absolute right-0 top-1/2 inline-flex size-9 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground hover:text-foreground md:size-8"
              aria-label={t.clearSearch}
            >
              <X className="size-3" />
            </button>
          )}
        </div>
      )}

      {hasPresets && (
        <div className="mb-3 flex items-center gap-2">
          <span className="text-xs text-muted-foreground">{t.preset}</span>
          <SegmentedToggle<TablePreset>
            value={preset}
            options={
              [
                { value: 'key', label: t.keyPreset, testId: 'data-table-preset-key' },
                { value: 'all', label: t.allPreset, testId: 'data-table-preset-all' },
              ] satisfies SegmentedToggleOption<TablePreset>[]
            }
            onValueChange={(value) => {
              setPreset(value);
              track(`${analyticsPrefix}_preset_changed`, { preset: value });
            }}
            ariaLabel={t.preset}
            testId="data-table-preset"
            role="group"
          />
        </div>
      )}

      <div className="overflow-x-auto relative">
        {watermark && isUnofficialDomain === false && (
          <div
            className="absolute inset-0 pointer-events-none flex items-center justify-center"
            aria-hidden="true"
          >
            <img src="/brand/logo-color.webp" alt="" className="w-48 opacity-10" />
          </div>
        )}
        <table className="w-full text-sm relative">
          <thead className="sticky top-0 bg-background z-1">
            <tr className="border-b-2 border-border">
              {visibleColumns.map((col) => {
                const i = columns.indexOf(col);
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
                    className={`py-2 px-3 font-medium text-muted-foreground ${ALIGN_CLASSES[col.align ?? 'left']} ${col.className ?? ''} ${col.pinned ? 'sticky left-0 z-2 border-r border-border bg-background' : ''} ${sortable ? 'cursor-pointer select-none hover:text-foreground transition-colors' : ''}`}
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
                  <div className="flex flex-col items-center gap-2">
                    <span>
                      {t.noResults} &quot;{search}&quot;
                    </span>
                    <button
                      type="button"
                      onClick={clearSearch}
                      className="text-sm text-foreground underline underline-offset-4 hover:text-muted-foreground"
                      aria-label={t.clearSearch}
                      data-testid="data-table-empty-clear-search"
                    >
                      {t.clearSearch}
                    </button>
                  </div>
                </td>
              </tr>
            ) : (
              pageData.map((row, rowIndex) => (
                <tr key={rowIndex} className="border-b border-border/50 hover:bg-muted/30">
                  {visibleColumns.map((col) => (
                    <td
                      key={columns.indexOf(col)}
                      className={`px-3 py-2 ${ALIGN_CLASSES[col.align ?? 'left']} ${col.align === 'right' || col.align === 'center' ? 'tabular-nums' : ''} ${col.className ?? ''} ${col.pinned ? 'sticky left-0 z-1 border-r border-border/60 bg-background' : ''}`}
                    >
                      {col.pinned ? (
                        <div className="w-40 max-w-40 whitespace-normal [overflow-wrap:anywhere] sm:w-auto sm:max-w-none">
                          {col.cell(row, safePage * pageSize + rowIndex)}
                        </div>
                      ) : (
                        col.cell(row, safePage * pageSize + rowIndex)
                      )}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination controls */}
      <div className="mt-3 flex flex-col gap-2 border-t border-border/60 pt-3 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
          <span data-testid="data-table-pagination-summary">
            {locale === 'zh' ? (
              <>
                {sorted.length === 0
                  ? `共 0 ${t.rowUnit}`
                  : `第 ${safePage * pageSize + 1}–${Math.min((safePage + 1) * pageSize, sorted.length)} ${t.rowUnit}，共 ${sorted.length} ${t.rowUnit}`}
                {search && `（${t.filteredFrom} ${data.length} ${t.rowUnit}）`}
              </>
            ) : (
              <>
                {sorted.length === 0
                  ? '0'
                  : `${safePage * pageSize + 1}–${Math.min((safePage + 1) * pageSize, sorted.length)}`}{' '}
                {t.of} {sorted.length}
                {search && ` (${t.filteredFrom} ${data.length})`}
              </>
            )}
          </span>
          <div
            data-testid="data-table-page-size"
            className="flex shrink-0 items-center gap-1 whitespace-nowrap"
          >
            {locale === 'zh' && <span>{t.perPage}</span>}
            <Select
              value={String(pageSize)}
              onValueChange={(v) => {
                const size = Number(v);
                setPageSize(size);
                setPage(0);
                track(`${analyticsPrefix}_page_size_changed`, { size });
              }}
            >
              <SelectTrigger
                size="sm"
                className="min-w-14 w-auto gap-1 px-2 text-xs data-[size=sm]:h-11 md:data-[size=sm]:h-8"
                aria-label={t.rowsPerPage}
              >
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
            <span>{locale === 'zh' ? t.rowUnit : t.perPage}</span>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1 self-end sm:self-auto">
          <button
            type="button"
            onClick={() => {
              setPage((p) => Math.max(0, p - 1));
              track(`${analyticsPrefix}_page_changed`, { direction: 'prev' });
            }}
            disabled={safePage === 0}
            className="inline-flex size-11 items-center justify-center rounded-md hover:bg-muted disabled:cursor-not-allowed disabled:opacity-30 transition-colors md:size-8"
            aria-label={t.previousPage}
          >
            <ChevronLeft className="size-4" />
          </button>
          <span>
            {safePage + 1} / {totalPages}
          </span>
          <button
            type="button"
            onClick={() => {
              setPage((p) => Math.min(totalPages - 1, p + 1));
              track(`${analyticsPrefix}_page_changed`, { direction: 'next' });
            }}
            disabled={safePage >= totalPages - 1}
            className="inline-flex size-11 items-center justify-center rounded-md hover:bg-muted disabled:cursor-not-allowed disabled:opacity-30 transition-colors md:size-8"
            aria-label={t.nextPage}
          >
            <ChevronRight className="size-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
