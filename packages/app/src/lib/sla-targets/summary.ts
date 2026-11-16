/**
 * What the SLA Targets page says before anyone opens a row: per setup, the
 * status, the highest load that meets the target and the cost; and one line
 * for the page. Nothing here evaluates anything: every value is read from the
 * view the page and the view API share.
 */

import type { SlaQualificationReason } from '@semianalysisai/inferencex-constants';

import type { SlaConfigView, SlaPointView, SlaRowStatus, SlaTargetsView } from './view';

/** Share of requests within target at one load, as shown under a status. */
export interface SlaRowShare {
  fraction: number;
  point: SlaPointView;
}

export interface SlaRowAnswer {
  status: SlaRowStatus;
  /** The highest tested load that meets the target; `null` when none does. */
  maxLoad: SlaPointView | null;
  /** Lowest estimated cost per 1,000 compliant requests among qualifying loads. */
  costUsd: number | null;
  /** The load behind `costUsd`, only when it is not `maxLoad`. */
  costAt: SlaPointView | null;
  /**
   * Why the status is what it is. A row that meets the target: the share at
   * `maxLoad`. A row that misses: its best measured share. Never set for a
   * row without a verdict, whose observed values cannot support one.
   */
  share: SlaRowShare | null;
  /** Why there is no share to show: no verdict, or a load that failed outright. */
  reason: SlaQualificationReason | null;
}

function shareAt(point: SlaPointView | null): SlaRowShare | null {
  const fraction = point?.result?.observed?.attainment ?? null;
  return point === null || fraction === null ? null : { fraction, point };
}

/** The reason a row without a verdict carries: an exploratory point's first, then any point's. */
export function slaRowReason(row: SlaConfigView): SlaQualificationReason | null {
  const qualifications = row.points.flatMap((point) => point.result?.qualification ?? []);
  return (
    qualifications.find((qualification) => qualification.exploratory)?.reason ??
    row.bestObserved?.result?.qualification.reason ??
    qualifications[0]?.reason ??
    null
  );
}

export function slaRowAnswer(row: SlaConfigView): SlaRowAnswer {
  const { highestPassingLoad, lowestCost } = row.selections;
  const base = { status: row.status, maxLoad: null, costUsd: null, costAt: null };
  if (row.status === 'loading') return { ...base, share: null, reason: null };
  if (row.status === 'insufficient_data') {
    return { ...base, share: null, reason: slaRowReason(row) };
  }
  if (row.status === 'misses') {
    const share = shareAt(row.bestObserved);
    return { ...base, share, reason: share === null ? slaRowReason(row) : null };
  }
  return {
    status: row.status,
    maxLoad: highestPassingLoad,
    costUsd: lowestCost?.result?.costPer1kCompliantUsd ?? null,
    costAt: lowestCost !== null && lowestCost !== highestPassingLoad ? lowestCost : null,
    share: shareAt(highestPassingLoad),
    reason: null,
  };
}

export type SlaPageSummary =
  | { kind: 'loading'; total: number }
  | {
      kind: 'meets';
      total: number;
      meeting: number;
      /** The cheapest setup that meets the target, when any has a price. */
      cheapest: { row: SlaConfigView; costUsd: number } | null;
    }
  | {
      kind: 'none';
      total: number;
      /** The setup that came closest: the highest measured share among those that miss. */
      closest: { row: SlaConfigView; share: SlaRowShare } | null;
    };

/**
 * The answer in one line. While any setup is still being evaluated the page
 * says so: a count taken from part of the rows would change under the reader.
 */
export function slaPageSummary(view: SlaTargetsView): SlaPageSummary {
  const total = view.rows.length;
  if (view.rows.some((row) => row.status === 'loading')) return { kind: 'loading', total };
  if (view.qualifying.length > 0) {
    // `qualifying` is ranked cheapest first, rows without a price last.
    const [first] = view.qualifying;
    const costUsd = first.selections.lowestCost?.result?.costPer1kCompliantUsd ?? null;
    return {
      kind: 'meets',
      total,
      meeting: view.qualifying.length,
      cheapest: costUsd === null ? null : { row: first, costUsd },
    };
  }
  let closest: { row: SlaConfigView; share: SlaRowShare } | null = null;
  for (const row of view.rows) {
    if (row.status !== 'misses') continue;
    const share = shareAt(row.bestObserved);
    if (share !== null && (closest === null || share.fraction > closest.share.fraction)) {
      closest = { row, share };
    }
  }
  return { kind: 'none', total, closest };
}
