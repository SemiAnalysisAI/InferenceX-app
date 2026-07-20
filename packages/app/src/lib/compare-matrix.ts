/**
 * Pure helpers for the GPU-pair selection matrices on the `/compare` and
 * `/compare-per-dollar` index pages (and their /zh siblings).
 *
 * The index used to render one card per comparable pair — ~36 cards per model
 * across 9+ model sections stopped scaling as a navigation surface. The matrix
 * replaces the card walls with one lower-triangle GPU×GPU grid per model:
 * every possible pair is a cell, cells with benchmark data on both sides are
 * links, cells without data render as ghosts so coverage gaps are visible.
 *
 * Axis ordering is derived from HW_REGISTRY rather than hardcoded:
 *
 *   - Vendors form contiguous blocks (NVIDIA, then AMD) so the three vendor
 *     regions of the old index — NVIDIA×NVIDIA, cross-vendor, AMD×AMD — appear
 *     as contiguous areas of the triangle instead of separate card groups.
 *     Block order is pinned by VENDOR_BLOCK_ORDER (NVIDIA first, the site-wide
 *     convention) rather than derived from registry sort: a future AMD flagship
 *     with a lower sort than GB300 would otherwise silently flip the whole axis
 *     to AMD-first. Any unlisted vendor sorts after the pinned blocks, ordered
 *     by its best (lowest) registry sort value.
 *   - Within a vendor, GPUs sort by registry `sort` DESCENDING. The registry
 *     sorts newest-first for chart legends, so descending here reads
 *     oldest→newest along the axis (H100 → H200 → B200 → B300 → GB200 → GB300),
 *     the natural left-to-right direction for a generational table.
 */
import { HW_REGISTRY } from '@semianalysisai/inferencex-constants';

import { canonicalCompareSlug, compareDisplayLabel, type ComparePair } from '@/lib/compare-slug';

export interface CompareMatrixGpu {
  key: string;
  /** Full display label for row headers, e.g. "GB200 NVL72". */
  label: string;
  /** Compact label for the vertical column headers, e.g. "GB200". */
  shortLabel: string;
  arch: string;
  vendor: string;
}

export interface CompareMatrixCell {
  /** Canonical compare slug (alphabetical GPU order), e.g. "deepseek-r1-b200-vs-h100". */
  slug: string;
  /** Canonical alphabetical pair label — matches the destination page title
   *  and the pre-matrix `compare_index_pair_clicked` analytics payload, e.g.
   *  "B200 vs H100" (not the display row-vs-column order). */
  label: string;
  /** True when both GPUs have benchmark data for the model — cell is a link. */
  available: boolean;
  /** True for NVIDIA×AMD pairs — the cross-vendor region gets the brand tint. */
  cross: boolean;
}

export interface CompareMatrix {
  /** Full GPU axis in display order — identical for every model so the nine
   *  matrices line up and coverage is comparable across sections. */
  gpus: CompareMatrixGpu[];
  /** cells[rowKey][colKey], defined only for column display-index < row
   *  display-index (lower triangle). */
  cells: Record<string, Record<string, CompareMatrixCell>>;
  availableCount: number;
}

/** Pinned vendor block order for the matrix axes — NVIDIA first per the
 *  site-wide convention. Vendors not listed here (a future third vendor)
 *  sort after the pinned blocks, ordered by their best registry sort, so
 *  new registry entries can never silently reorder the existing axes. */
const VENDOR_BLOCK_ORDER = ['NVIDIA', 'AMD'];

/** Shared axis order for every model's matrix. See module docblock. */
export function compareMatrixGpuOrder(): CompareMatrixGpu[] {
  const entries = Object.entries(HW_REGISTRY).map(([key, meta]) => ({
    key,
    label: meta.label,
    shortLabel: key.toUpperCase(),
    arch: meta.arch,
    vendor: meta.vendor,
    sort: meta.sort,
  }));

  const vendorRank = new Map<string, number>();
  for (const e of entries) {
    const best = vendorRank.get(e.vendor);
    if (best === undefined || e.sort < best) vendorRank.set(e.vendor, e.sort);
  }

  entries.sort((x, y) => {
    if (x.vendor !== y.vendor) {
      const ix = VENDOR_BLOCK_ORDER.indexOf(x.vendor);
      const iy = VENDOR_BLOCK_ORDER.indexOf(y.vendor);
      // Both pinned → pinned order. One pinned → it sorts first. Neither pinned
      // → best registry sort, so a future third vendor still orders
      // deterministically without disturbing the pinned NVIDIA→AMD blocks.
      if (ix !== -1 || iy !== -1) {
        if (ix === -1) return 1;
        if (iy === -1) return -1;
        return ix - iy;
      }
      return (vendorRank.get(x.vendor) ?? 0) - (vendorRank.get(y.vendor) ?? 0);
    }
    return y.sort - x.sort;
  });

  return entries.map(({ key, label, shortLabel, arch, vendor }) => ({
    key,
    label,
    shortLabel,
    arch,
    vendor,
  }));
}

/** Build one model's matrix from the pairs that actually have benchmark data
 *  on both sides (`getComparablePairsByModelSlug()` output — canonical
 *  alphabetical a < b). Fully serializable: built in the server page, rendered
 *  by the ComparePairMatrix client component. */
export function buildCompareMatrix(
  modelSlug: string,
  availablePairs: ComparePair[],
): CompareMatrix {
  const gpus = compareMatrixGpuOrder();
  const availableKeys = new Set(availablePairs.map((p) => `${p.a}__${p.b}`));

  const cells: Record<string, Record<string, CompareMatrixCell>> = {};
  let availableCount = 0;

  for (let j = 1; j < gpus.length; j++) {
    const row: Record<string, CompareMatrixCell> = {};
    for (let i = 0; i < j; i++) {
      const col = gpus[i];
      const rowGpu = gpus[j];
      const [first, second] = [col.key, rowGpu.key].toSorted();
      const available = availableKeys.has(`${first}__${second}`);
      if (available) availableCount++;
      row[col.key] = {
        slug: canonicalCompareSlug(modelSlug, col.key, rowGpu.key),
        label: compareDisplayLabel(first, second),
        available,
        cross: col.vendor !== rowGpu.vendor,
      };
    }
    cells[gpus[j].key] = row;
  }

  return { gpus, cells, availableCount };
}
