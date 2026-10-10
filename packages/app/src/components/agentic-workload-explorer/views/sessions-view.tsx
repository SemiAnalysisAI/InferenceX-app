'use client';

import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Skeleton } from '@/components/ui/skeleton';
import {
  formatNumber,
  truncateHash,
  truncateSessionId,
} from '@/lib/agentic-workload-explorer/format';
import { formatCost } from '@/components/agentic-workload-explorer/session-dag';
import { parseUserAgent } from '@/lib/agentic-workload-explorer/user-agent';
import { useInfiniteList } from '@/hooks/agentic-workload-explorer/use-infinite-scroll';
import { Loader2, Search, X } from 'lucide-react';
import {
  HARNESS_LABELS,
  HARNESSES,
  harnessFromUserAgent,
  isHarness,
  type Harness,
} from '@semianalysisai/inferencex-db/proxytrace/shared/harness';
import { CURRENT_TRACE_VERSION } from '@semianalysisai/inferencex-db/proxytrace/shared/trace';
import type {
  Session,
  SessionHashStats,
  SessionStats,
} from '@/lib/agentic-workload-explorer/api-types';
import { createTaskLimiter } from '@/lib/agentic-workload-explorer/task-limiter';
import { formatSnapshotTime } from '@/lib/agentic-workload-explorer/snapshot';
import { useExplorerHref } from '@/hooks/agentic-workload-explorer/use-explorer-href';
import { useLocale } from '@/lib/use-locale';
import { track } from '@/lib/analytics';

// ── i18n ────────────────────────────────────────────────────────

const STRINGS = {
  en: {
    sessions: 'Sessions',
    total: 'total',
    searchPlaceholder: 'Search sessions...',
    minReqs: { '20': '> 20 Reqs', '100': '> 100 Reqs', '0': 'All' } as Record<string, string>,
    allVersions: 'All Versions',
    allHarnesses: 'All Harnesses',
    noMatch: 'No sessions match these filters',
    colSession: 'Session',
    colUser: 'User',
    colReqs: 'Reqs',
    colCost: 'Cost',
    colApiHit: 'API Hit',
    colHashUpper: 'Hash Upper Bound',
    colStarted: 'Started',
    colActive: 'Active',
    apiHitTitle:
      'API Cache Hit Rate — cache_read / (cache_read + cache_write + input) across every request in the session.',
    hashUpperTitle:
      'Theoretical Upper Bound Cache Hit Rate — Assuming Infinite Cache TTL & Infinitely Large Cache. Walks a chain-hash trie over every request to find the longest prefix match against any prior chain in the session.',
    computeHashTitle: 'Compute the exact theoretical hash-cache upper bound for this session.',
    hashLoad: 'Load',
    hashRetry: 'Retry',
    hashNoData: 'No hash data — session has no recorded prompt blocks.',
    colVersion: 'Version',
    resetSort: 'Reset sort',
    openSession: (id: string) => `Open session ${id}`,
  },
  zh: {
    sessions: '会话列表',
    total: '总计',
    searchPlaceholder: '搜索会话...',
    minReqs: { '20': '> 20 请求', '100': '> 100 请求', '0': '全部' } as Record<string, string>,
    allVersions: '所有版本',
    allHarnesses: '全部 harness',
    noMatch: '没有符合条件的会话',
    colSession: '会话',
    colUser: '用户',
    colReqs: '请求',
    colCost: '成本',
    colApiHit: 'API 命中',
    colHashUpper: 'Hash 上界',
    colStarted: '开始',
    colActive: '活跃',
    apiHitTitle:
      'API 缓存命中率 — 会话内所有请求的 cache_read / (cache_read + cache_write + input)',
    hashUpperTitle:
      '理论缓存命中上界 — 假设无限 Cache TTL 与无限大缓存。对每个请求遍历 chain-hash trie，查找与此前任意链的最长前缀匹配。',
    computeHashTitle: '计算此会话的精确理论 hash-cache 命中上界',
    hashLoad: '加载',
    hashRetry: '重试',
    hashNoData: '无 hash 数据 — 此会话没有记录 prompt 块',
    colVersion: '版本',
    resetSort: '重置排序',
    openSession: (id: string) => `打开会话 ${id}`,
  },
} as const;

/**
 * API Cache Hit Rate as displayed in the list — `cache_read / (cache_read +
 * cache_write + input)` summed across every request in the session. Returns
 * null when the session has zero prompt tokens (mostly clients that only sent
 * empty bodies — show '—' instead of '0.0%' so it reads as "no signal").
 *
 * `bigint` SQL columns arrive as strings over the wire; `Number()` each one
 * before adding so `+` doesn't concatenate `"12345" + "67890"` into the giant
 * string `"1234567890"` and silently zero out the ratio. (Division coerces
 * strings to numbers, so the existing read/output ratios kept working —
 * addition doesn't.)
 */
function apiCacheHitRate(session: Session): number | null {
  const read = Number(session.totalCacheRead);
  const write = Number(session.totalCacheWrite);
  const input = Number(session.totalInput);
  const denom = read + write + input;
  if (denom <= 0) return null;
  return (read / denom) * 100;
}

/** Loading / loaded / error state for a single row's lazy upper-bound fetch. */
type HashStatsState =
  | { status: 'pending' }
  | { status: 'loading' }
  | { status: 'loaded'; data: SessionHashStats }
  | { status: 'error' };

const runHashStatsRequest = createTaskLimiter(4);

type SortKey = 'active' | 'started' | 'requests' | 'cost' | 'session' | 'version' | 'user';
type SortDir = 'asc' | 'desc';

function SortButton({
  col,
  children,
  align,
  sortKey,
  sortDir,
  onSort,
}: {
  col: SortKey;
  children: React.ReactNode;
  align?: 'right';
  sortKey: SortKey;
  sortDir: SortDir;
  onSort: (key: SortKey) => void;
}) {
  const active = sortKey === col;
  return (
    <button
      type="button"
      onClick={() => onSort(col)}
      // Hug the label: a stretched grid item made the click target run well
      // past the text into the next column's space.
      className={`flex w-fit items-center gap-1 transition-colors ${
        align === 'right' ? 'justify-self-end' : 'justify-self-start'
      } ${active ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
    >
      {children}
      {active && <span className="text-3xs opacity-60">{sortDir === 'desc' ? '▼' : '▲'}</span>}
    </button>
  );
}
type MinReqsFilter = '20' | '100' | '0';
type HarnessFilter = 'all' | Harness;
type VersionFilter = 'all' | string;

const PAGE_SIZE = 50;

const MIN_REQS_FILTERS: { value: MinReqsFilter; label: string }[] = [
  { value: '20', label: '> 20 Reqs' },
  { value: '100', label: '> 100 Reqs' },
  { value: '0', label: 'All' },
];

const HARNESS_FILTERS: { value: HarnessFilter; label: string }[] = [
  { value: 'all', label: 'All Harnesses' },
  ...HARNESSES.map((h) => ({ value: h, label: HARNESS_LABELS[h] })),
];

const HARNESS_BADGE_CLASSES: Record<Harness, string> = {
  'claude-code': 'border-orange-500/30 bg-orange-500/8 text-orange-500',
  codex: 'border-violet-500/30 bg-violet-500/8 text-violet-500',
  pi: 'border-emerald-500/30 bg-emerald-500/8 text-emerald-500',
  omp: 'border-sky-500/30 bg-sky-500/8 text-sky-500',
  other: 'border-border bg-surface-hover text-muted-foreground',
};

// Harnesses whose sessions carry a version (see `parseUserAgent`). Pi sends
// none and "Other" mixes unrelated products, so neither sorts by version.
const VERSIONED_HARNESSES: readonly HarnessFilter[] = ['claude-code', 'codex', 'omp'];

// The read-only snapshot only contains the current trace version.
const VERSION_FILTERS: { value: VersionFilter; label: string }[] = [
  { value: 'all', label: 'All Versions' },
  { value: String(CURRENT_TRACE_VERSION), label: `v${CURRENT_TRACE_VERSION}` },
];

function isMinReqsFilter(v: string | null): v is MinReqsFilter {
  return v === '20' || v === '100' || v === '0';
}

function parseHarnessFilter(v: string | null): HarnessFilter {
  return isHarness(v) ? v : 'all';
}

// Default to the snapshot's trace version (the only one it contains); "All
// Versions" is persisted in the URL because it isn't the default.
function parseVersionFilter(v: string | null): VersionFilter {
  return v === 'all' ? 'all' : String(CURRENT_TRACE_VERSION);
}

/**
 * Resolve the cliVersion / os / arch shown in the row. Prefers values the
 * proxy already wrote to metadata (Stainless-SDK clients), then falls back to
 * parsing `metadata.userAgent` (Codex CLI / Desktop don't send stainless
 * headers, so their os/arch live in the UA suffix).
 */
function sessionUaInfo(session: Session): {
  cliVersion: string | null;
  os: string | null;
} {
  const m = session.metadata;
  const parsed = parseUserAgent(typeof m?.userAgent === 'string' ? m.userAgent : null);
  return {
    cliVersion:
      (typeof m?.cliVersion === 'string' ? m.cliVersion : null) ?? parsed.cliVersion ?? null,
    os: (typeof m?.os === 'string' ? m.os : null) ?? parsed.os ?? null,
  };
}

export default function SessionsPage() {
  return (
    <Suspense>
      <SessionsPageContent />
    </Suspense>
  );
}

function SessionsPageContent() {
  const t = STRINGS[useLocale()];
  const explorerHref = useExplorerHref();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [stats, setStats] = useState<SessionStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [statsRefreshing, setStatsRefreshing] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>('active');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [searchQuery, setSearchQuery] = useState('');
  const [activeSearch, setActiveSearch] = useState('');
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const minReqsFilter: MinReqsFilter = isMinReqsFilter(searchParams.get('minReqs'))
    ? (searchParams.get('minReqs') as MinReqsFilter)
    : '20';
  const harnessFilter = parseHarnessFilter(searchParams.get('harness'));
  const versionFilter = parseVersionFilter(searchParams.get('version'));
  const versionSortable = VERSIONED_HARNESSES.includes(harnessFilter);
  if (sortKey === 'version' && !versionSortable) {
    setSortKey('active');
    setSortDir('desc');
  }

  function setFilter(key: 'minReqs' | 'harness' | 'version', value: string) {
    const params = new URLSearchParams(searchParams.toString());
    // Defaults are stripped from the URL. `version` defaults to the latest
    // trace version (`CURRENT_TRACE_VERSION`); everything else defaults to a
    // wide-open filter.
    const defaultValue =
      key === 'minReqs' ? '20' : key === 'version' ? String(CURRENT_TRACE_VERSION) : 'all';
    if (value === defaultValue) {
      params.delete(key);
    } else {
      params.set(key, value);
    }
    const qs = params.toString();
    router.replace(explorerHref(`/sessions${qs ? `?${qs}` : ''}`), { scroll: false });
    track('agentic_workload_sessions_filter_changed', { key, value });
  }

  const activeSearchRef = useRef(activeSearch);
  activeSearchRef.current = activeSearch;
  const versionFilterRef = useRef(versionFilter);
  versionFilterRef.current = versionFilter;
  const harnessFilterRef = useRef(harnessFilter);
  harnessFilterRef.current = harnessFilter;
  const minReqsFilterRef = useRef(minReqsFilter);
  minReqsFilterRef.current = minReqsFilter;
  const sortRef = useRef({ sortKey, sortDir });
  sortRef.current = { sortKey, sortDir };

  const {
    items: sessions,
    reset: resetSessions,
    loadingMore,
    hasMore,
    sentinelRef,
  } = useInfiniteList<Session>({
    fetchMore: async (offset) => {
      const params = new URLSearchParams({
        limit: String(PAGE_SIZE),
        offset: String(offset),
      });
      if (activeSearchRef.current) params.set('search', activeSearchRef.current);
      if (versionFilterRef.current !== 'all') params.set('version', versionFilterRef.current);
      if (harnessFilterRef.current !== 'all') params.set('harness', harnessFilterRef.current);
      if (minReqsFilterRef.current !== '0') params.set('minReqs', minReqsFilterRef.current);
      params.set('sort', sortRef.current.sortKey);
      params.set('dir', sortRef.current.sortDir);
      const res = await fetch(`/api/v1/agentic-workload-explorer/sessions?${params}`);
      const data: { sessions: Session[] } = await res.json();
      return { items: data.sessions, hasMore: data.sessions.length >= PAGE_SIZE };
    },
    getKey: (s) => s.id,
  });

  const fetchSessions = useCallback(async () => {
    setStatsRefreshing(true);
    const params = new URLSearchParams({ limit: String(PAGE_SIZE), offset: '0' });
    if (activeSearch) params.set('search', activeSearch);
    if (versionFilter !== 'all') params.set('version', versionFilter);
    if (harnessFilter !== 'all') params.set('harness', harnessFilter);
    if (minReqsFilter !== '0') params.set('minReqs', minReqsFilter);
    // Sorting runs on the server over every matching session, not just the
    // pages loaded so far.
    params.set('sort', sortKey);
    params.set('dir', sortDir);
    const r = await fetch(`/api/v1/agentic-workload-explorer/sessions?${params}`);
    const data: { sessions: Session[]; stats: SessionStats } = await r.json();
    resetSessions(data.sessions, data.sessions.length >= PAGE_SIZE);
    setStats(data.stats);
  }, [activeSearch, versionFilter, harnessFilter, minReqsFilter, sortKey, sortDir]);

  const initialLoad = useRef(true);

  useEffect(() => {
    if (initialLoad.current) setLoading(true);
    fetchSessions()
      .catch(console.error)
      .finally(() => {
        setLoading(false);
        setStatsRefreshing(false);
        initialLoad.current = false;
      });
  }, [fetchSessions]);

  const sortChanged = sortKey !== 'active' || sortDir !== 'desc';
  function resetSort() {
    setSortKey('active');
    setSortDir('desc');
  }

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'));
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
    track('agentic_workload_sessions_sort_changed', { sortKey: key, sortDir });
  }

  return (
    <div className="space-y-5">
      {/* Stats */}
      <div className="flex items-center gap-2 mb-2">
        <span className="text-3xs font-mono font-bold uppercase tracking-eyebrow-wide text-muted-foreground">
          {t.sessions}
        </span>
        <span className="flex-1 h-px bg-border" />
        {statsRefreshing && <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />}
        {loading || !stats ? (
          <Skeleton className="h-3 w-10" />
        ) : (
          <span className="text-3xs font-mono text-subtle tabular-nums">
            {formatNumber(stats.total)} {t.total}
          </span>
        )}
      </div>

      {/* Search + Filter */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => {
              const value = e.target.value;
              setSearchQuery(value);
              clearTimeout(searchDebounceRef.current);
              searchDebounceRef.current = setTimeout(() => {
                setActiveSearch(value.trim());
                track('agentic_workload_sessions_search', { query: value.trim() });
              }, 300);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                setSearchQuery('');
                setActiveSearch('');
              }
            }}
            placeholder={t.searchPlaceholder}
            className="h-7 pl-8 pr-7 w-56 rounded-md border border-border bg-background text-2xs font-mono text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-border"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => {
                setSearchQuery('');
                setActiveSearch('');
                track('agentic_workload_sessions_search_clear');
              }}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>
        <div className="flex items-center gap-1">
          {MIN_REQS_FILTERS.map((f) => (
            <button
              key={f.value}
              type="button"
              onClick={() => setFilter('minReqs', f.value)}
              className={`px-2.5 py-1 text-3xs font-mono uppercase tracking-wider rounded-md transition-colors ${
                minReqsFilter === f.value
                  ? 'bg-foreground text-background'
                  : 'text-muted-foreground hover:text-foreground hover:bg-surface-hover'
              }`}
            >
              {t.minReqs[f.value] ?? f.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1">
          {VERSION_FILTERS.map((f) => (
            <button
              key={f.value}
              type="button"
              onClick={() => setFilter('version', f.value)}
              className={`px-2.5 py-1 text-3xs font-mono uppercase tracking-wider rounded-md transition-colors ${
                versionFilter === f.value
                  ? 'bg-foreground text-background'
                  : 'text-muted-foreground hover:text-foreground hover:bg-surface-hover'
              }`}
            >
              {f.value === 'all' ? t.allVersions : f.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1">
          {HARNESS_FILTERS.map((f) => (
            <button
              key={f.value}
              type="button"
              onClick={() => setFilter('harness', f.value)}
              className={`px-2.5 py-1 text-3xs font-mono uppercase tracking-wider rounded-md transition-colors ${
                harnessFilter === f.value
                  ? 'bg-foreground text-background'
                  : 'text-muted-foreground hover:text-foreground hover:bg-surface-hover'
              }`}
            >
              {f.value === 'all' ? t.allHarnesses : f.label}
            </button>
          ))}
        </div>
        {sortChanged && (
          <button
            type="button"
            onClick={resetSort}
            className="ml-auto px-2.5 py-1 text-3xs font-mono uppercase tracking-wider rounded-md border border-border text-muted-foreground hover:text-foreground hover:bg-surface-hover transition-colors"
          >
            {t.resetSort}
          </button>
        )}
      </div>

      {/* Table */}
      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full rounded-lg" />
          ))}
        </div>
      ) : sessions.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-sm text-muted-foreground">{t.noMatch}</p>
        </div>
      ) : (
        <div className="rounded-lg border border-border overflow-x-auto">
          {/* Header */}
          <div className="grid min-w-[1160px] gap-4 px-4 py-2.5 bg-surface text-3xs font-mono uppercase tracking-wider text-muted-foreground border-b border-border grid-cols-[1fr_80px_140px_72px_80px_88px_112px_80px_80px]">
            <SortButton col="session" sortKey={sortKey} sortDir={sortDir} onSort={handleSort}>
              {t.colSession}
            </SortButton>
            {versionSortable ? (
              <SortButton col="version" sortKey={sortKey} sortDir={sortDir} onSort={handleSort}>
                {t.colVersion}
              </SortButton>
            ) : (
              <span className="normal-case">{t.colVersion}</span>
            )}
            <SortButton col="user" sortKey={sortKey} sortDir={sortDir} onSort={handleSort}>
              {t.colUser}
            </SortButton>
            <SortButton
              col="requests"
              align="right"
              sortKey={sortKey}
              sortDir={sortDir}
              onSort={handleSort}
            >
              {t.colReqs}
            </SortButton>
            <SortButton
              col="cost"
              align="right"
              sortKey={sortKey}
              sortDir={sortDir}
              onSort={handleSort}
            >
              {t.colCost}
            </SortButton>
            <span className="text-right" title={t.apiHitTitle}>
              {t.colApiHit}
            </span>
            <span className="text-right" title={t.hashUpperTitle}>
              {t.colHashUpper}
            </span>
            <SortButton
              col="started"
              align="right"
              sortKey={sortKey}
              sortDir={sortDir}
              onSort={handleSort}
            >
              {t.colStarted}
            </SortButton>
            <SortButton
              col="active"
              align="right"
              sortKey={sortKey}
              sortDir={sortDir}
              onSort={handleSort}
            >
              {t.colActive}
            </SortButton>
          </div>

          {/* Rows */}
          <div className="min-w-[1160px] divide-y divide-border">
            {sessions.map((session) => (
              <SessionRow key={session.id} session={session} />
            ))}
          </div>
        </div>
      )}

      {/* Infinite scroll sentinel + spinner */}
      {!loading && hasMore && (
        <div ref={sentinelRef} className="flex justify-center py-6">
          {loadingMore && <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />}
        </div>
      )}
    </div>
  );
}

function SessionRow({ session }: { session: Session }) {
  const t = STRINGS[useLocale()];
  const explorerHref = useExplorerHref();
  const [hashState, setHashState] = useState<HashStatsState>({ status: 'pending' });

  const loadHashStats = (): void => {
    if (hashState.status === 'loading' || hashState.status === 'loaded') return;
    setHashState({ status: 'loading' });
    track('agentic_workload_sessions_hash_stats_load', { sessionId: session.id });
    void runHashStatsRequest(async () => {
      const response = await fetch(
        `/api/v1/agentic-workload-explorer/sessions/${session.id}/hash-stats`,
      );
      if (!response.ok) throw new Error(`hash-stats ${response.status}`);
      return (await response.json()) as SessionHashStats;
    })
      .then((data) => setHashState({ status: 'loaded', data }))
      .catch(() => setHashState({ status: 'error' }));
  };

  const apiHit = apiCacheHitRate(session);
  const { cliVersion, os } = sessionUaInfo(session);

  return (
    <div className="relative grid gap-4 px-4 py-3 cursor-pointer hover:bg-surface-hover transition-colors items-center grid-cols-[1fr_80px_140px_72px_80px_88px_112px_80px_80px]">
      <Link
        href={explorerHref(`/sessions/${session.id}`)}
        aria-label={t.openSession(session.id)}
        className="absolute inset-0 z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
      />
      {/* Session info */}
      <div className="min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <span className="font-mono text-sm font-medium truncate block">
            {truncateSessionId(session.id)}
          </span>
          {(() => {
            const harness = harnessFromUserAgent(session.metadata?.userAgent);
            return (
              <span
                className={`shrink-0 px-1.5 py-0.5 rounded-sm text-3xs font-mono uppercase tracking-eyebrow border ${HARNESS_BADGE_CLASSES[harness]}`}
              >
                {HARNESS_LABELS[harness]}
              </span>
            );
          })()}
        </div>
        <div className="flex items-center gap-2 text-3xs font-mono text-muted-foreground">
          {os && (
            <>
              <span className="text-border">·</span>
              <span>{os}</span>
            </>
          )}
          {session.totalOutput > 0 && (
            <>
              <span className="text-border">·</span>
              <span className="text-subtle">
                {(session.totalCacheRead / session.totalOutput).toFixed(1)}:
                {(session.totalCacheWrite / session.totalOutput).toFixed(1)}:1
              </span>
            </>
          )}
        </div>
      </div>

      {/* Harness version */}
      <span className="font-mono text-2xs truncate" title={cliVersion ?? undefined}>
        {cliVersion ? (
          <span className="text-muted-foreground">v{cliVersion}</span>
        ) : (
          <span className="text-subtle">—</span>
        )}
      </span>

      {/* User */}
      <span className="font-mono text-2xs truncate">
        <span className="text-muted-foreground">{truncateHash(session.clientApiKeyHash)}</span>
      </span>

      {/* Requests */}
      <span className="text-right font-mono text-sm tabular-nums">{session.requestCount}</span>

      {/* Total cost (estimated, frozen at insert time) */}
      <span className="text-right font-mono text-2xs tabular-nums">
        {Number(session.totalCost) > 0 ? (
          <span className="text-foreground">{formatCost(Number(session.totalCost))}</span>
        ) : (
          <span className="text-subtle">—</span>
        )}
      </span>

      {/* API Cache Hit Rate */}
      <span className="text-right font-mono text-2xs tabular-nums">
        {apiHit === null ? (
          <span className="text-subtle">—</span>
        ) : (
          <span className="text-foreground">{apiHit.toFixed(1)}%</span>
        )}
      </span>

      {/* Exact hash-trie upper bound — loaded only on explicit request. */}
      <button
        type="button"
        className="relative z-20 text-right font-mono text-2xs tabular-nums hover:text-foreground"
        title={t.computeHashTitle}
        onClick={loadHashStats}
      >
        <HashHitRateCell state={hashState} />
      </button>

      {/* Started */}
      <span className="text-right text-3xs font-mono text-muted-foreground">
        {formatSnapshotTime(session.startedAt)}
      </span>

      {/* Active */}
      <span className="text-right text-3xs font-mono text-muted-foreground">
        {formatSnapshotTime(session.lastActiveAt)}
      </span>
    </div>
  );
}

function HashHitRateCell({ state }: { state: HashStatsState }) {
  const t = STRINGS[useLocale()];
  if (state.status === 'pending') return <span className="text-subtle">{t.hashLoad}</span>;
  if (state.status === 'loading') return <span className="text-subtle">···</span>;
  if (state.status === 'error') {
    return <span className="text-subtle">{t.hashRetry}</span>;
  }
  if (state.data.hashTotal === 0) {
    return (
      <span className="text-subtle" title={t.hashNoData}>
        —
      </span>
    );
  }
  return <span className="text-foreground">{state.data.hitRate.toFixed(1)}%</span>;
}
