import { useCallback, useSyncExternalStore } from 'react';

import type { KnownIssueAnnotation } from '@/components/inference/utils/knownIssueAnnotations';

export const DISMISSED_CHART_NOTICES_KEY = 'inferencex-dismissed-chart-notices';
const DISMISSED_CHART_NOTICES_EVENT = 'inferencex:dismissed-chart-notices';

const EMPTY: ReadonlySet<string> = new Set();
let cachedRaw: string | null = null;
let cachedSet: ReadonlySet<string> = EMPTY;

/** Stable key for a chart notice. Known issues key on issue + hardware so new issues still show. */
export function chartNoticeKey(annotation: KnownIssueAnnotation): string {
  return annotation.issue === undefined
    ? `preview:${annotation.preview.id}`
    : `issue:${annotation.issue.issueRef}:${annotation.issue.hwKey}`;
}

function readDismissed(): ReadonlySet<string> {
  let raw: string | null;
  try {
    raw = localStorage.getItem(DISMISSED_CHART_NOTICES_KEY);
  } catch {
    return EMPTY;
  }
  if (raw === cachedRaw) return cachedSet;
  cachedRaw = raw;
  try {
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    cachedSet = Array.isArray(parsed)
      ? new Set(parsed.filter((v): v is string => typeof v === 'string'))
      : EMPTY;
  } catch {
    cachedSet = EMPTY;
  }
  return cachedSet;
}

export function dismissChartNotice(key: string): void {
  const next = new Set([...readDismissed(), key]);
  try {
    localStorage.setItem(DISMISSED_CHART_NOTICES_KEY, JSON.stringify([...next]));
  } catch {}
  window.dispatchEvent(new Event(DISMISSED_CHART_NOTICES_EVENT));
}

function subscribe(onChange: () => void): () => void {
  const onStorage = (event: StorageEvent) => {
    if (event.key === DISMISSED_CHART_NOTICES_KEY) onChange();
  };
  window.addEventListener(DISMISSED_CHART_NOTICES_EVENT, onChange);
  window.addEventListener('storage', onStorage);
  return () => {
    window.removeEventListener(DISMISSED_CHART_NOTICES_EVENT, onChange);
    window.removeEventListener('storage', onStorage);
  };
}

/** Chart notices (official-preview and known-issue boxes) the reader has dismissed, shared across charts and tabs. */
export function useDismissedChartNotices() {
  const dismissed = useSyncExternalStore(subscribe, readDismissed, () => EMPTY);
  const dismiss = useCallback((annotation: KnownIssueAnnotation) => {
    dismissChartNotice(chartNoticeKey(annotation));
  }, []);
  return { dismissed, dismiss };
}
