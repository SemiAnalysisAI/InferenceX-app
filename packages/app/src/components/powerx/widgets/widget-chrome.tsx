'use client';

import { Check, Copy } from 'lucide-react';
import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';

import { track } from '@/lib/analytics/analytics';
import type { Locale } from '@/lib/i18n/i18n';
import { fetchView, type TutorialViewResponse } from '@/lib/powerx/views-api';
import { readWidgetHash, writeWidgetHash } from '@/lib/powerx/widget-hash';
import { cn } from '@/lib/shared/utils';

/** PowerX tutorial widget chrome: hash state, copy, legend, fetch. */

const CHROME_STRINGS = {
  en: {
    copy: 'Copy',
    copied: 'Copied',
    failed: 'Could not copy',
    measured: 'Measured',
    modeled: 'Modeled',
    rated: 'Rated or assumed',
    measuredTitle: 'Solid: telemetry sampled on the benchmark cluster',
    modeledTitle: 'Outlined: estimated by the open-source power model from the measured watts',
    ratedTitle: 'Dashed: vendor or site constants such as TDP, all-in provisioned power and PUE',
  },
  zh: {
    copy: '复制',
    copied: '已复制',
    failed: '复制失败',
    measured: '实测',
    modeled: '建模',
    rated: '标称或假设',
    measuredTitle: '实心：在基准测试集群上采样的遥测数据',
    modeledTitle: '空心：开源功耗模型根据实测瓦特数估算的值',
    ratedTitle: '虚线：TDP、全系统 provisioned 功率、PUE 等厂商或站点常量',
  },
} as const;

/** Reads `key` from the URL hash on mount and writes every change back with replaceState. */
export function useWidgetHash<T>(
  key: string,
  encode: (state: T) => string,
  decode: (raw: string | null) => T,
): [T, (next: T) => void] {
  const [state, setState] = useState<T>(() => decode(null));
  useEffect(() => {
    const raw = readWidgetHash(window.location.hash, key);
    if (raw !== null) setState(decode(raw));
    // Hydrate once from the URL; later changes flow through `set`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  const set = useCallback(
    (next: T) => {
      setState(next);
      const hash = writeWidgetHash(window.location.hash, key, encode(next));
      window.history.replaceState(window.history.state, '', `#${hash}`);
    },
    [key, encode],
  );
  return [state, set];
}

/**
 * A page-wide value shared by several widgets (the hero's chip drives the load strip and the
 * worked example). Persisted in the hash under `key` like a single widget's state.
 */
export function createSharedHashState<T>(
  key: string,
  encode: (state: T) => string,
  decode: (raw: string | null) => T,
) {
  let value = decode(null);
  let hydrated = false;
  const listeners = new Set<() => void>();
  const emit = () => listeners.forEach((listener) => listener());
  const hydrate = () => {
    if (hydrated || typeof window === 'undefined') return;
    hydrated = true;
    const raw = readWidgetHash(window.location.hash, key);
    if (raw !== null) {
      value = decode(raw);
      emit();
    }
  };
  const set = (next: T) => {
    value = next;
    const hash = writeWidgetHash(window.location.hash, key, encode(next));
    window.history.replaceState(window.history.state, '', `#${hash}`);
    emit();
  };
  const subscribe = (listener: () => void) => {
    listeners.add(listener);
    hydrate();
    return () => listeners.delete(listener);
  };
  const serverValue = decode(null);
  function use(): [T, (next: T) => void] {
    const current = useSyncExternalStore(
      subscribe,
      () => value,
      () => serverValue,
    );
    return [current, set];
  }
  return { use, set, subscribe, get: () => value };
}

export function CopyButton({
  text,
  label,
  locale,
  event,
}: {
  text: string;
  label?: string;
  locale: Locale;
  event: string;
}) {
  const t = CHROME_STRINGS[locale];
  const [status, setStatus] = useState<'idle' | 'copied' | 'failed'>('idle');
  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setStatus('copied');
      track(event);
    } catch {
      setStatus('failed');
    }
  }
  const caption =
    status === 'copied' ? t.copied : status === 'failed' ? t.failed : (label ?? t.copy);
  return (
    <button
      type="button"
      onClick={copy}
      aria-label={label ?? t.copy}
      className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-md px-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground motion-reduce:transition-none md:min-h-8"
    >
      {status === 'copied' ? (
        <Check aria-hidden="true" className="size-3.5" />
      ) : (
        <Copy aria-hidden="true" className="size-3.5" />
      )}
      <span aria-live="polite">{caption}</span>
    </button>
  );
}

export type Provenance = 'measured' | 'modeled' | 'rated';

/** The one visual grammar: solid = measured, outlined = modeled, dashed = rated or assumed. */
export function GrammarSwatch({ kind, color }: { kind: Provenance; color: string }) {
  return (
    <svg aria-hidden="true" width="14" height="14" viewBox="0 0 14 14" className="shrink-0">
      {kind === 'measured' && <rect x="1" y="1" width="12" height="12" rx="2" fill={color} />}
      {kind === 'modeled' && (
        <rect
          x="1.5"
          y="1.5"
          width="11"
          height="11"
          rx="2"
          fill={color}
          fillOpacity="0.14"
          stroke={color}
          strokeWidth="1.25"
        />
      )}
      {kind === 'rated' && (
        <line x1="1" y1="7" x2="13" y2="7" stroke={color} strokeWidth="1.5" strokeDasharray="3 2" />
      )}
    </svg>
  );
}

export function GrammarLegend({
  locale,
  color = 'var(--foreground)',
  kinds = ['measured', 'modeled', 'rated'],
  className,
}: {
  locale: Locale;
  color?: string;
  /** Only the fills the surface actually draws. */
  kinds?: readonly Provenance[];
  className?: string;
}) {
  const t = CHROME_STRINGS[locale];
  const all: [Provenance, string, string][] = [
    ['measured', t.measured, t.measuredTitle],
    ['modeled', t.modeled, t.modeledTitle],
    ['rated', t.rated, t.ratedTitle],
  ];
  const items = all.filter(([kind]) => kinds.includes(kind));
  return (
    <ul className={cn('flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground', className)}>
      {items.map(([kind, label, title]) => (
        <li key={kind} title={title} className="flex items-center gap-1.5">
          <GrammarSwatch kind={kind} color={kind === 'rated' ? 'var(--muted-foreground)' : color} />
          {label}
        </li>
      ))}
    </ul>
  );
}

export type Fetched =
  | { status: 'loading' }
  | { status: 'failed' }
  | { status: 'ok'; data: TutorialViewResponse };

/** Fetches a views-API URL once per page and exposes its lifecycle. */
export function useView(url: string | null): Fetched {
  const [state, setState] = useState<Fetched>({ status: 'loading' });
  useEffect(() => {
    if (url === null) return;
    let cancelled = false;
    setState({ status: 'loading' });
    fetchView(url)
      .then((data) => {
        if (!cancelled) setState({ status: 'ok', data });
      })
      .catch(() => {
        if (!cancelled) setState({ status: 'failed' });
      });
    return () => {
      cancelled = true;
    };
  }, [url]);
  return state;
}

const subscribeNoop = () => () => {};

/**
 * False during server render and hydration, true after. Chip colours depend on the resolved
 * theme, which the server cannot know, so colour-bearing SSR markup waits for this to avoid a
 * hydration mismatch in dark mode.
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    subscribeNoop,
    () => true,
    () => false,
  );
}

/** 1 234 → "1,234"; keeps watts readable in both locales. */
export const formatWatts = (watts: number): string => Math.round(watts).toLocaleString('en-US');
