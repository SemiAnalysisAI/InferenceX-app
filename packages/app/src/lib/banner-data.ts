/**
 * Announcement banner helpers.
 *
 * Two banner sources, checked in order (first non-dismissed match wins):
 *
 * 1. **Hardcoded announcements** — `ANNOUNCEMENTS` array below. Add entries via PR.
 *    Shown when `new Date()` falls within [startDate, endDate].
 *    Omit `endDate` to show until dismissed. Omit `startDate` to show immediately.
 *
 * 2. **Automated changelog** — fetched from the workflow-info API at runtime.
 *    Shows the most recent benchmark submission automatically.
 *
 * @example
 * ```ts
 * // Hardcoded announcement (add to ANNOUNCEMENTS, newest first):
 * {
 *   id: 'clustermax-launch-2026-04',
 *   message: 'ClusterMax is now live — compare inference API providers!',
 *   linkHref: 'https://www.clustermax.ai/',
 *   startDate: '2026-04-01',
 *   endDate: '2026-04-30',
 * }
 * ```
 */

import { DB_MODEL_TO_DISPLAY } from '@semianalysisai/inferencex-constants';

import type { ChangelogRow, WorkflowInfoResponse } from '@/lib/api';
import { type Precision, MODEL_PREFIX_MAPPING, getPrecisionLabel } from '@/lib/data-mappings';
import { getFrameworkLabel } from '@/lib/utils';

// ─── Hardcoded Announcements ────────────────────────────────────────────────
// Add new announcements here, newest first. These take priority over automated
// changelog banners. Only the first active, non-dismissed entry is shown.

interface Announcement {
  /** Unique identifier — used as localStorage key for dismissal state. */
  id: string;
  /** Banner text. */
  message: string;
  /** Optional link href (internal path or external URL). */
  linkHref?: string;
  /** ISO date string (YYYY-MM-DD). Hidden before this date. */
  startDate?: string;
  /** ISO date string (YYYY-MM-DD). Hidden after this date. */
  endDate?: string;
}

export const ANNOUNCEMENTS: Announcement[] = [
  // Example:
  // {
  //   id: 'clustermax-launch-2026-04',
  //   message: 'ClusterMax is now live — compare inference API providers!',
  //   linkHref: 'https://www.clustermax.ai/',
  //   startDate: '2026-04-01',
  //   endDate: '2026-04-30',
  // },
];

/** Get the first active hardcoded announcement (within date range, not dismissed). */
export function getHardcodedBanner(
  now = new Date(),
  announcements: Announcement[] = ANNOUNCEMENTS,
): BannerInfo | null {
  const today = now.toISOString().slice(0, 10);
  for (const a of announcements) {
    if (a.startDate && today < a.startDate) continue;
    if (a.endDate && today > a.endDate) continue;
    if (isDismissed(a.id)) continue;
    return {
      id: a.id,
      message: a.message,
      date: '',
      linkHref: a.linkHref ?? '',
    };
  }
  return null;
}

const DISMISS_KEY_PREFIX = 'banner-dismissed-';

/** Check if a banner has been dismissed by the user. */
export function isDismissed(id: string): boolean {
  if (typeof window === 'undefined') return false;
  return localStorage.getItem(`${DISMISS_KEY_PREFIX}${id}`) === '1';
}

/** Mark a banner as dismissed. */
export function dismiss(id: string): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(`${DISMISS_KEY_PREFIX}${id}`, '1');
}

export interface BannerInfo {
  /** Dismiss key — e.g. "changelog-12345" (workflow run ID) */
  id: string;
  /** Human-readable summary, e.g. "New data: Kimi-K2.5 FP4 GB200 (Dynamo vLLM)" */
  message: string;
  /** Display date, e.g. "Apr 7, 2026" */
  date: string;
  /** Deep-link to the inference tab with the relevant model/precision pre-selected. */
  linkHref: string;
}

/**
 * Extract a banner from a workflow-info response.
 * Takes the most recent changelog entry and builds a human-readable message.
 */
export function buildBannerFromWorkflowInfo(
  date: string,
  data: WorkflowInfoResponse,
): BannerInfo | null {
  if (!data.changelogs || data.changelogs.length === 0) return null;

  // Take the most recent entry (last in the array)
  const entry: ChangelogRow = data.changelogs.at(-1)!;
  const configKey = entry.config_keys[0];
  if (!configKey) return null;

  // Parse config key: model-precision-gpu-framework[-variant]
  const parts = configKey.split('-');
  const modelPrefix = parts[0] ?? '';
  const precision = parts[1] ?? '';
  const gpu = parts[2] ?? '';
  const framework = parts.slice(3).join('-');
  const displayModel = DB_MODEL_TO_DISPLAY[modelPrefix];

  // Build human-readable label: Model | Precision | GPU | Framework
  const model = MODEL_PREFIX_MAPPING[modelPrefix] ?? modelPrefix;
  const precLabel = getPrecisionLabel(precision as Precision);
  const isMtp = framework.endsWith('-mtp');
  const baseFramework = isMtp ? framework.slice(0, -4) : framework;
  const fwLabel = isMtp
    ? `${getFrameworkLabel(baseFramework)}, MTP`
    : getFrameworkLabel(baseFramework);
  const label = `${model} ${precLabel} ${gpu.toUpperCase()} (${fwLabel})`;
  const extra = data.changelogs.length > 1 ? ` (+${data.changelogs.length - 1} more)` : '';

  // Detect eval-only changelogs by description text
  const isEval = entry.description.toLowerCase().includes('eval');
  const tab = isEval ? 'evaluation' : 'inference';

  const linkParams = new URLSearchParams();
  if (displayModel) linkParams.set('g_model', displayModel);
  linkParams.set('g_rundate', date);
  if (!isEval && precision) linkParams.set('i_prec', precision);
  const search = linkParams.toString();

  // Format date as "Apr 7, 2026"
  const displayDate = new Date(`${date}T00:00:00`).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  return {
    id: `changelog-${entry.workflow_run_id}`,
    message: `New data: ${label}${extra}`,
    date: displayDate,
    linkHref: `/${tab}?${search}`,
  };
}
