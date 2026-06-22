'use client';

import { Fragment } from 'react';

import { HW_REGISTRY } from '@semianalysisai/inferencex-constants';

import { track } from '@/lib/analytics';

const NVIDIA_COLOR = '#76b900';
const AMD_COLOR = '#ed1c24';

const NVIDIA_BG = 'rgba(118, 185, 0, 0.10)';
const NVIDIA_BG_STRONG = 'rgba(118, 185, 0, 0.18)';
const NVIDIA_BORDER = 'rgba(118, 185, 0, 0.40)';
const AMD_BG = 'rgba(237, 28, 36, 0.10)';
const AMD_BG_STRONG = 'rgba(237, 28, 36, 0.18)';
const AMD_BORDER = 'rgba(237, 28, 36, 0.40)';

type VendorKey = 'nvidia' | 'amd' | 'unknown';

interface MatrixEntry {
  a: string;
  b: string;
  slug: string;
  label: string;
}

interface ComparePairMatrixProps {
  pairs: MatrixEntry[];
  hrefPrefix: '/compare' | '/compare-per-dollar';
}

function vendorOf(gpu: string): VendorKey {
  const v = HW_REGISTRY[gpu]?.vendor;
  if (v === 'NVIDIA') return 'nvidia';
  if (v === 'AMD') return 'amd';
  return 'unknown';
}

function vendorRank(vendor: VendorKey): number {
  if (vendor === 'nvidia') return 0;
  if (vendor === 'amd') return 1;
  return 2;
}

function compareGpus(a: string, b: string): number {
  const va = vendorRank(vendorOf(a));
  const vb = vendorRank(vendorOf(b));
  if (va !== vb) return va - vb;
  const sa = HW_REGISTRY[a]?.sort ?? 999;
  const sb = HW_REGISTRY[b]?.sort ?? 999;
  return sa - sb;
}

function pairKey(a: string, b: string): string {
  return [a, b].toSorted().join('|');
}

/** Drop trailing "NVL72" so labels fit inside narrow cells without wrapping. */
function shortHwLabel(gpu: string): string {
  const label = HW_REGISTRY[gpu]?.label ?? gpu.toUpperCase();
  return label.replace(/\s+NVL72$/u, '');
}

function vendorTextColor(vendor: VendorKey): string {
  if (vendor === 'nvidia') return NVIDIA_COLOR;
  if (vendor === 'amd') return AMD_COLOR;
  return 'currentColor';
}

export function ComparePairMatrix({ pairs, hrefPrefix }: ComparePairMatrixProps) {
  const gpus = [...new Set(pairs.flatMap((p) => [p.a, p.b]))].toSorted(compareGpus);
  const pairByKey = new Map(pairs.map((p) => [pairKey(p.a, p.b), p]));

  return (
    <div className="-mx-2 overflow-x-auto px-2 pb-1">
      <div
        className="grid w-fit gap-1.5"
        style={{
          gridTemplateColumns: `minmax(0, max-content) repeat(${gpus.length}, minmax(72px, 1fr))`,
        }}
      >
        <div aria-hidden />
        {gpus.map((g) => (
          <HeaderChip key={`top-${g}`} gpu={g} axis="col" />
        ))}
        {gpus.map((rowGpu) => (
          <Fragment key={`row-${rowGpu}`}>
            <HeaderChip gpu={rowGpu} axis="row" />
            {gpus.map((colGpu) => {
              if (rowGpu === colGpu) {
                return <DiagonalCell key={`cell-${rowGpu}-${colGpu}`} gpu={rowGpu} />;
              }
              const entry = pairByKey.get(pairKey(rowGpu, colGpu));
              if (!entry) return <EmptyCell key={`cell-${rowGpu}-${colGpu}`} />;
              return (
                <PairCell
                  key={`cell-${rowGpu}-${colGpu}`}
                  rowGpu={rowGpu}
                  colGpu={colGpu}
                  href={`${hrefPrefix}/${entry.slug}`}
                  slug={entry.slug}
                  label={entry.label}
                />
              );
            })}
          </Fragment>
        ))}
      </div>
    </div>
  );
}

function HeaderChip({ gpu, axis }: { gpu: string; axis: 'row' | 'col' }) {
  const vendor = vendorOf(gpu);
  const label = HW_REGISTRY[gpu]?.label ?? gpu.toUpperCase();
  const arch = HW_REGISTRY[gpu]?.arch;
  const style =
    vendor === 'nvidia'
      ? { background: NVIDIA_BG_STRONG, color: NVIDIA_COLOR, borderColor: NVIDIA_BORDER }
      : vendor === 'amd'
        ? { background: AMD_BG_STRONG, color: AMD_COLOR, borderColor: AMD_BORDER }
        : undefined;
  return (
    <div
      className={
        axis === 'col'
          ? 'flex min-h-[48px] items-center justify-center rounded-md border px-2 py-1 text-center text-xs font-semibold leading-tight whitespace-nowrap'
          : 'flex min-h-[48px] items-center justify-end rounded-md border px-3 py-1 text-right text-xs font-semibold leading-tight whitespace-nowrap'
      }
      style={style}
      title={arch ? `${label} · ${arch}` : label}
    >
      {label}
    </div>
  );
}

function DiagonalCell({ gpu }: { gpu: string }) {
  return (
    <div
      className="flex min-h-[48px] items-center justify-center rounded-md border border-dashed border-border/40 bg-muted/20 text-[10px] text-muted-foreground/60"
      aria-hidden
      title={`${HW_REGISTRY[gpu]?.label ?? gpu.toUpperCase()} (same SKU)`}
    >
      —
    </div>
  );
}

function EmptyCell() {
  return <div className="min-h-[48px] rounded-md border border-border/20 bg-background/5" />;
}

function PairCell({
  rowGpu,
  colGpu,
  href,
  slug,
  label,
}: {
  rowGpu: string;
  colGpu: string;
  href: string;
  slug: string;
  label: string;
}) {
  const vRow = vendorOf(rowGpu);
  const vCol = vendorOf(colGpu);
  const sameVendor = vRow === vCol && vRow !== 'unknown';

  let cellStyle: { background: string; borderColor: string };
  if (sameVendor && vRow === 'nvidia') {
    cellStyle = { background: NVIDIA_BG, borderColor: NVIDIA_BORDER };
  } else if (sameVendor && vRow === 'amd') {
    cellStyle = { background: AMD_BG, borderColor: AMD_BORDER };
  } else {
    // Cross-vendor: 45° split, row vendor on top-left, col vendor on bottom-right.
    const rowColor = vRow === 'amd' ? AMD_BG_STRONG : NVIDIA_BG_STRONG;
    const colColor = vCol === 'amd' ? AMD_BG_STRONG : NVIDIA_BG_STRONG;
    cellStyle = {
      background: `linear-gradient(135deg, ${rowColor} 0%, ${rowColor} 50%, ${colColor} 50%, ${colColor} 100%)`,
      borderColor: 'rgba(160, 160, 160, 0.35)',
    };
  }

  return (
    <a
      href={href}
      title={label}
      aria-label={label}
      onClick={(e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
        e.preventDefault();
        track('compare_index_matrix_clicked', { slug, label });
        window.location.href = href;
      }}
      className="group relative flex min-h-[48px] flex-col items-center justify-center gap-0 rounded-md border px-1.5 py-1 text-center leading-tight transition-all hover:scale-[1.04] hover:shadow-md hover:shadow-brand/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/60"
      style={cellStyle}
    >
      <span
        className="text-[11px] font-semibold whitespace-nowrap"
        style={{ color: vendorTextColor(vRow) }}
      >
        {shortHwLabel(rowGpu)}
      </span>
      <span className="text-[8px] font-medium uppercase tracking-wider text-foreground/45">vs</span>
      <span
        className="text-[11px] font-semibold whitespace-nowrap"
        style={{ color: vendorTextColor(vCol) }}
      >
        {shortHwLabel(colGpu)}
      </span>
      <span className="absolute right-1 top-1 text-[10px] text-foreground/40 opacity-0 transition-opacity group-hover:opacity-80">
        ↗
      </span>
    </a>
  );
}

export function CompareMatrixLegend() {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
      <LegendSwatch
        style={{ background: NVIDIA_BG_STRONG, borderColor: NVIDIA_BORDER }}
        label="NVIDIA × NVIDIA"
      />
      <LegendSwatch
        style={{ background: AMD_BG_STRONG, borderColor: AMD_BORDER }}
        label="AMD × AMD"
      />
      <LegendSwatch
        style={{
          background: `linear-gradient(135deg, ${AMD_BG_STRONG} 0%, ${AMD_BG_STRONG} 50%, ${NVIDIA_BG_STRONG} 50%, ${NVIDIA_BG_STRONG} 100%)`,
          borderColor: 'rgba(160, 160, 160, 0.35)',
        }}
        label="Cross-vendor"
      />
    </div>
  );
}

function LegendSwatch({ style, label }: { style: React.CSSProperties; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="h-3.5 w-7 rounded border" style={style} />
      {label}
    </span>
  );
}
