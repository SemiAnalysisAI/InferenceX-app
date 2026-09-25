'use client';

import { ArrowDown, ArrowUp } from 'lucide-react';
import { useMemo, useState } from 'react';

import { Button } from '@/components/ui/button';
import type { OperatorXResult } from '@semianalysisai/inferencex-db/operatorx/normalize';

import { formatTflops, formatUs, shortKernel, STATUS_CLASS, STATUS_ORDER } from './format';
import { statusLabel, type OperatorXStrings } from './strings';

const PAGE_SIZE = 100;

type SortKey =
  | 'status'
  | 'opType'
  | 'shape'
  | 'precision'
  | 'backend'
  | 'kernel'
  | 'latencyUs'
  | 'tflops';

function compare(a: OperatorXResult, b: OperatorXResult, key: SortKey): number {
  if (key === 'status') return STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status);
  if (key === 'latencyUs' || key === 'tflops') {
    const [x, y] = [a[key], b[key]];
    if (x === null) return y === null ? 0 : 1; // nulls last in either direction
    if (y === null) return -1;
    return x - y;
  }
  return String(a[key] ?? '').localeCompare(String(b[key] ?? ''), undefined, { numeric: true });
}

export function ResultsTable({
  results,
  t,
  selected,
  onSelect,
}: {
  results: OperatorXResult[];
  t: OperatorXStrings;
  selected: number | null;
  onSelect: (index: number) => void;
}) {
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({ key: 'status', desc: false });
  const [page, setPage] = useState(0);
  const sorted = useMemo(() => {
    const rows = [...results].sort((a, b) => compare(a, b, sort.key));
    if (sort.desc) rows.reverse();
    return rows;
  }, [results, sort]);
  const pages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const current = Math.min(page, pages - 1);
  const rows = sorted.slice(current * PAGE_SIZE, (current + 1) * PAGE_SIZE);

  const header = (key: SortKey, label: string, align: 'left' | 'right' = 'left') => (
    <th className={`px-2 py-2 font-medium ${align === 'right' ? 'text-right' : 'text-left'}`}>
      <button
        type="button"
        className="inline-flex items-center gap-1 hover:text-foreground"
        onClick={() => {
          setSort((s) => ({
            key,
            desc: s.key === key ? !s.desc : key === 'latencyUs' || key === 'tflops',
          }));
          setPage(0);
        }}
      >
        {label}
        {sort.key === key &&
          (sort.desc ? <ArrowDown className="size-3" /> : <ArrowUp className="size-3" />)}
      </button>
    </th>
  );

  if (results.length === 0)
    return <p className="py-8 text-center text-sm text-muted-foreground">{t.noResults}</p>;

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto rounded-lg border border-border/50">
        <table className="w-full text-xs">
          <thead className="bg-muted/40 text-muted-foreground">
            <tr>
              {header('status', t.status)}
              {header('opType', t.operator)}
              {header('shape', t.shape)}
              {header('precision', t.precision)}
              {header('backend', t.backend)}
              {header('kernel', t.kernel)}
              {header('latencyUs', t.latency, 'right')}
              {header('tflops', t.tflops, 'right')}
              <th className="px-2 py-2 text-left font-medium">{t.graph}</th>
              <th className="px-2 py-2 text-right font-medium">{t.streams}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr
                key={r.index}
                tabIndex={0}
                onClick={() => onSelect(r.index)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onSelect(r.index);
                  }
                }}
                className={`cursor-pointer border-t border-border/40 outline-none hover:bg-muted/40 focus-visible:bg-muted/60 ${
                  selected === r.index ? 'bg-muted/60' : ''
                }`}
              >
                <td className="px-2 py-1.5">
                  <span
                    className={`rounded border px-1.5 py-0.5 text-2xs whitespace-nowrap ${STATUS_CLASS[r.status]}`}
                  >
                    {statusLabel(t, r.status)}
                  </span>
                </td>
                <td className="px-2 py-1.5 font-mono whitespace-nowrap">{r.opType}</td>
                <td className="px-2 py-1.5 font-mono whitespace-nowrap" title={r.name ?? undefined}>
                  {r.shape}
                </td>
                <td className="max-w-[340px] truncate px-2 py-1.5" title={r.precision}>
                  {r.precision}
                </td>
                <td className="px-2 py-1.5 whitespace-nowrap">{r.backend}</td>
                <td
                  className="max-w-[220px] truncate px-2 py-1.5 font-mono"
                  title={r.kernel ?? r.message ?? undefined}
                >
                  {r.kernel ? shortKernel(r.kernel) : r.status === 'ok' ? '—' : (r.message ?? '—')}
                </td>
                <td className="px-2 py-1.5 text-right font-mono whitespace-nowrap tabular-nums">
                  {formatUs(r.latencyUs)}
                </td>
                <td className="px-2 py-1.5 text-right font-mono tabular-nums">
                  {formatTflops(r.tflops)}
                </td>
                <td className="px-2 py-1.5">
                  {r.cudaGraph === null ? '—' : r.cudaGraph ? 'yes' : 'no'}
                </td>
                <td className="px-2 py-1.5 text-right font-mono tabular-nums">
                  {r.timing?.streams ?? '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <span className="tabular-nums">
          {sorted.length.toLocaleString()} {t.results}
        </span>
        {pages > 1 && (
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={current === 0}
              onClick={() => setPage(current - 1)}
            >
              {t.previous}
            </Button>
            <span className="tabular-nums">
              {current + 1} / {pages}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={current >= pages - 1}
              onClick={() => setPage(current + 1)}
            >
              {t.next}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
