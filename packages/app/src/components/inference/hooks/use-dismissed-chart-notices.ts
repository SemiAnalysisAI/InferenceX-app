import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';

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

/** How long a closed notice keeps its slot: long enough to absorb a second click on its ×. */
export const CLOSED_NOTICE_SLOT_MS = 2000;

/**
 * Notices closed on this chart, valid only while the chart keeps drawing the stack they were
 * closed in. Any change of stack ends them, even if the stack later changes back.
 */
interface ClosedSlots {
  stackVersion: number;
  keys: ReadonlySet<string>;
}

const NO_CLOSED_SLOTS: ClosedSlots = { stackVersion: -1, keys: EMPTY };

/** Chart notices (official-preview and known-issue boxes) the reader has dismissed, shared across charts and tabs. */
export function useDismissedChartNotices() {
  const dismissed = useSyncExternalStore(subscribe, readDismissed, () => EMPTY);
  const [closedHere, setClosedHere] = useState<ClosedSlots>(NO_CLOSED_SLOTS);
  // The notice stack the chart last drew and a version bumped whenever it changes, so a close can
  // record which stack its slot belongs to.
  const stackRef = useRef({ stack: '', version: 0 });
  const timersRef = useRef(new Set<ReturnType<typeof setTimeout>>());
  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      for (const timer of timers) clearTimeout(timer);
    };
  }, []);
  const dismiss = useCallback((annotation: KnownIssueAnnotation) => {
    const key = chartNoticeKey(annotation);
    const stackVersion = stackRef.current.version;
    setClosedHere((current) => ({
      stackVersion,
      keys: new Set([...(current.stackVersion === stackVersion ? current.keys : []), key]),
    }));
    dismissChartNotice(key);
    const timer = setTimeout(() => {
      timersRef.current.delete(timer);
      setClosedHere((current) => {
        if (!current.keys.has(key)) return current;
        const keys = new Set(current.keys);
        keys.delete(key);
        return { stackVersion: current.stackVersion, keys };
      });
    }, CLOSED_NOTICE_SLOT_MS);
    timersRef.current.add(timer);
  }, []);
  /**
   * The notices to draw. Ones dismissed earlier are dropped. One just closed on this chart stays
   * an empty slot for a moment, so the next notice does not slide under the pointer that clicked
   * ×; the slot goes once that moment passes or the chart's set of notices changes.
   */
  const visibleNotices = useCallback(
    (annotations: KnownIssueAnnotation[]): KnownIssueAnnotation[] => {
      const stack = annotations.map(chartNoticeKey).join('|');
      if (stack !== stackRef.current.stack) {
        stackRef.current = { stack, version: stackRef.current.version + 1 };
      }
      const slots = closedHere.stackVersion === stackRef.current.version ? closedHere.keys : EMPTY;
      return annotations.flatMap((annotation) => {
        const key = chartNoticeKey(annotation);
        if (!dismissed.has(key)) return [annotation];
        return slots.has(key) ? [{ ...annotation, dismissed: true }] : [];
      });
    },
    [dismissed, closedHere],
  );
  return { dismissed, dismiss, visibleNotices };
}
