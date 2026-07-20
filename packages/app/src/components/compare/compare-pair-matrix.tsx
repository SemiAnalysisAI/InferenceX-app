'use client';

import { useState } from 'react';

import { track } from '@/lib/analytics';
import type { CompareMatrix } from '@/lib/compare-matrix';
import { cn } from '@/lib/utils';

const STRINGS = {
  hint: 'Click a cell to open the comparison.',
  crossLegend: 'NVIDIA vs AMD',
  sameLegend: 'Same vendor',
  emptyLegend: 'No benchmark data yet',
  matrixAria: (model: string) => `${model} GPU comparison matrix`,
  cellAria: (model: string, pair: string) => `${model}: ${pair} benchmark comparison`,
  emptyTitle: (pair: string) => `${pair} — no benchmark data yet`,
} as const;

const VENDOR_HEADER_CLASS: Record<string, string> = {
  NVIDIA: 'border-emerald-500/60 text-emerald-700 dark:text-emerald-400',
  AMD: 'border-red-500/60 text-red-700 dark:text-red-400',
};

const VENDOR_DOT_CLASS: Record<string, string> = {
  NVIDIA: 'bg-emerald-500/80',
  AMD: 'bg-red-500/80',
};

interface ComparePairMatrixProps {
  matrix: CompareMatrix;
  /** Route prefix cells link under, e.g. "/compare" or "/zh/compare-per-dollar". */
  hrefPrefix: string;
  /** Model label for accessible names and the analytics payload context. */
  modelLabel: string;
}

/**
 * Upper-triangle GPU×GPU selection matrix for the compare index pages. Each
 * available pair is a real server-rendered `<a>` (SEO: all pair links stay in
 * the HTML with the pair name as sr-only anchor text); pairs without benchmark
 * data render as ghost cells so coverage gaps are visible at a glance. The
 * vendor blocks make the cross-vendor region a contiguous rectangle, which
 * gets the brand tint — same-vendor triangles stay neutral.
 */
export function ComparePairMatrix({ matrix, hrefPrefix, modelLabel }: ComparePairMatrixProps) {
  const t = STRINGS;
  const [hovered, setHovered] = useState<{ row: string; col: string; label: string } | null>(null);

  const { gpus, cells } = matrix;
  const rows = gpus.slice(0, -1);
  const cols = gpus.slice(1);

  // Consecutive same-vendor column runs → the colSpan group bars on top.
  const colGroups: { vendor: string; count: number }[] = [];
  for (const gpu of cols) {
    const last = colGroups.at(-1);
    if (last && last.vendor === gpu.vendor) last.count++;
    else colGroups.push({ vendor: gpu.vendor, count: 1 });
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="overflow-x-auto pb-1">
        <table
          data-testid="compare-pair-matrix"
          aria-label={t.matrixAria(modelLabel)}
          className="border-separate border-spacing-[3px]"
        >
          <thead>
            <tr>
              <th className="sticky left-0 z-10 bg-background p-0" aria-hidden="true" />
              {colGroups.map((group) => (
                <th key={group.vendor} colSpan={group.count} scope="colgroup" className="p-0 px-1">
                  <div
                    className={cn(
                      'border-b-2 pb-1 text-center text-[10px] font-semibold uppercase tracking-wider',
                      VENDOR_HEADER_CLASS[group.vendor] ?? 'border-border text-muted-foreground',
                    )}
                  >
                    {group.vendor}
                  </div>
                </th>
              ))}
            </tr>
            <tr>
              <th className="sticky left-0 z-10 bg-background p-0" aria-hidden="true" />
              {cols.map((gpu) => (
                <th key={gpu.key} scope="col" className="p-0 align-bottom">
                  <div className="flex h-14 items-end justify-center pb-1.5">
                    <span
                      title={`${gpu.label} (${gpu.arch})`}
                      className={cn(
                        'rotate-180 text-[10px] font-medium tracking-wide whitespace-nowrap transition-colors [writing-mode:vertical-rl]',
                        hovered?.col === gpu.key ? 'text-foreground' : 'text-muted-foreground',
                      )}
                    >
                      {gpu.shortLabel}
                    </span>
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((rowGpu, i) => (
              <tr key={rowGpu.key}>
                <th scope="row" className="sticky left-0 z-10 bg-background p-0 text-left">
                  <div
                    className={cn(
                      'flex h-8 flex-col justify-center rounded-md py-0.5 pr-3 pl-1 transition-colors lg:h-9',
                      hovered?.row === rowGpu.key && 'bg-foreground/5',
                    )}
                  >
                    <span className="flex items-center gap-1.5 text-xs leading-tight font-medium whitespace-nowrap">
                      <span
                        aria-hidden="true"
                        className={cn(
                          'size-1.5 shrink-0 rounded-full',
                          VENDOR_DOT_CLASS[rowGpu.vendor] ?? 'bg-muted-foreground',
                        )}
                      />
                      {rowGpu.label}
                    </span>
                    <span className="pl-3 text-[10px] leading-tight text-muted-foreground">
                      {rowGpu.arch}
                    </span>
                  </div>
                </th>
                {cols.map((colGpu, jIdx) => {
                  // cols is gpus[1..]; display index of this column is jIdx+1.
                  if (jIdx + 1 <= i) {
                    return <td key={colGpu.key} className="p-0" aria-hidden="true" />;
                  }
                  const cell = cells[rowGpu.key][colGpu.key];
                  if (!cell.available) {
                    return (
                      <td key={colGpu.key} className="p-0">
                        <div
                          data-testid="compare-matrix-empty-cell"
                          title={t.emptyTitle(cell.label)}
                          aria-hidden="true"
                          className="size-8 rounded-md border border-dashed border-border/50 lg:size-9"
                        />
                      </td>
                    );
                  }
                  const href = `${hrefPrefix}/${cell.slug}`;
                  return (
                    <td key={colGpu.key} className="p-0">
                      <a
                        href={href}
                        data-testid="compare-matrix-cell"
                        aria-label={t.cellAria(modelLabel, cell.label)}
                        title={cell.label}
                        onClick={(e) => {
                          if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) {
                            return;
                          }
                          e.preventDefault();
                          track('compare_index_pair_clicked', {
                            slug: cell.slug,
                            label: cell.label,
                          });
                          window.location.href = href;
                        }}
                        onMouseEnter={() =>
                          setHovered({ row: rowGpu.key, col: colGpu.key, label: cell.label })
                        }
                        onMouseLeave={() => setHovered(null)}
                        onFocus={() =>
                          setHovered({ row: rowGpu.key, col: colGpu.key, label: cell.label })
                        }
                        onBlur={() => setHovered(null)}
                        className={cn(
                          'block size-8 rounded-md transition-all duration-150 lg:size-9',
                          'hover:scale-110 focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none',
                          cell.cross
                            ? 'bg-brand/20 ring-1 ring-brand/40 ring-inset hover:bg-brand/45'
                            : 'bg-foreground/15 hover:bg-foreground/30',
                        )}
                      >
                        <span className="sr-only">{cell.label}</span>
                      </a>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px] text-muted-foreground">
        <span data-testid="compare-matrix-readout" className="min-w-40 font-medium">
          {hovered ? <span className="text-foreground">{hovered.label} →</span> : t.hint}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span
            aria-hidden="true"
            className="size-3 rounded-[4px] bg-brand/20 ring-1 ring-brand/40 ring-inset"
          />
          {t.crossLegend}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden="true" className="size-3 rounded-[4px] bg-foreground/15" />
          {t.sameLegend}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span
            aria-hidden="true"
            className="size-3 rounded-[4px] border border-dashed border-border/60"
          />
          {t.emptyLegend}
        </span>
      </div>
    </div>
  );
}
