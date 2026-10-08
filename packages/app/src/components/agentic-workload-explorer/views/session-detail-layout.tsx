'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, usePathname } from 'next/navigation';
import Link from 'next/link';
import { Skeleton } from '@/components/ui/skeleton';
import {
  formatNumber,
  formatTimestamp,
  truncateHash,
} from '@/lib/agentic-workload-explorer/format';
import { SessionProvider, type SessionData } from '@/lib/agentic-workload-explorer/session-context';
import { useInfiniteScroll } from '@/hooks/agentic-workload-explorer/use-infinite-scroll';
import { formatSnapshotTime } from '@/lib/agentic-workload-explorer/snapshot';
import { useExplorerHref } from '@/hooks/agentic-workload-explorer/use-explorer-href';
import { explorerRelativePath } from '@/lib/agentic-workload-explorer/paths';
import {
  EXPLORER_SESSION_TAB_META,
  type ExplorerSessionTab,
} from '@/lib/agentic-workload-explorer/page-meta';
import { useLocale } from '@/lib/use-locale';
import { track } from '@/lib/analytics';

const STRINGS = {
  en: {
    sessionInfo: 'Session Info',
    client: 'Client',
    started: 'Started',
    lastActive: 'Last Active',
    cliVersion: 'CLI Version',
    platform: 'Platform',
    traceVersion: 'Trace Version',
    traceMode: 'Trace Mode',
    anonymized: 'Anonymized',
    full: 'Full',
    usage: 'Usage',
    requests: 'Requests',
    inputTokens: 'Input Tokens',
    outputTokens: 'Output Tokens',
    cacheCreated: 'Cache Created',
    cacheRead: 'Cache Read',
    estCost: 'Est. Cost',
    readWriteOut: 'Read : Write : Out',
    requestsHeading: 'Requests',
    loading: (remaining: number) => `Loading... (${remaining} remaining)`,
    sessionNotFound: 'Session not found',
    oldest: 'Oldest',
    newest: 'Newest',
  },
  zh: {
    sessionInfo: '会话信息',
    client: '客户端',
    started: '开始时间',
    lastActive: '最后活跃',
    cliVersion: 'CLI 版本',
    platform: '平台',
    traceVersion: 'Trace 版本',
    traceMode: 'Trace 模式',
    anonymized: '匿名',
    full: '完整',
    usage: '用量',
    requests: '请求数',
    inputTokens: '输入 Token',
    outputTokens: '输出 Token',
    cacheCreated: '缓存写入',
    cacheRead: '缓存读取',
    estCost: '预估成本',
    readWriteOut: '读取 : 写入 : 输出',
    requestsHeading: '请求',
    loading: (remaining: number) => `加载中…（剩余 ${remaining}）`,
    sessionNotFound: '未找到会话',
    oldest: '最早',
    newest: '最新',
  },
};

interface SessionDetail {
  session: SessionData['session'];
  requests: SessionData['requests'];
  total: number;
  limit: number;
  offset: number;
}

const PAGE_SIZE = 100;
const MIN_PAGE_SIZE = 1;

// Tabs that only show hash block counts. They load requests without hash_ids
// (~90% of the payload); the conversation view fetches a request's list when
// it's expanded. Opening any other tab reloads the session with hash_ids.
const TABS_WITHOUT_HASH_IDS = new Set(['conversation', 'flow', 'timeline']);

export default function SessionLayout({ children }: { children: React.ReactNode }) {
  const locale = useLocale();
  const t = STRINGS[locale];
  const explorerHref = useExplorerHref();
  const params = useParams();
  const pathname = usePathname();
  const id = params.id as string;
  const [data, setData] = useState<SessionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [reversed, setReversed] = useState(false);
  const [loadDir, setLoadDir] = useState<'asc' | 'desc'>('asc');
  const chunkSizeRef = useRef(PAGE_SIZE);
  const hasMore = data ? data.requests.length < data.total : false;
  const relativePath = explorerRelativePath(pathname) ?? '';
  const tab = relativePath.slice(`/sessions/${id}/`.length).split('/')[0] ?? '';
  // Sticky: once a tab needed hash_ids, keep them so switching back doesn't refetch.
  const [withHashIds, setWithHashIds] = useState(() => !TABS_WITHOUT_HASH_IDS.has(tab));
  useEffect(() => {
    if (!TABS_WITHOUT_HASH_IDS.has(tab)) setWithHashIds(true);
  }, [tab]);

  // Fetch a page, retrying with halved chunk size on failure
  const fetchPage = useCallback(
    async (offset: number, limit: number): Promise<SessionDetail> => {
      const res = await fetch(
        `/api/v1/agentic-workload-explorer/sessions/${id}?limit=${limit}&offset=${offset}&sort=${loadDir}${withHashIds ? '' : '&hashes=0'}`,
      );
      if (!res.ok) {
        if (limit > MIN_PAGE_SIZE) {
          const smaller = Math.max(MIN_PAGE_SIZE, Math.floor(limit / 2));
          chunkSizeRef.current = smaller;
          return fetchPage(offset, smaller);
        }
        throw new Error(`${res.status}`);
      }
      return res.json();
    },
    [id, loadDir, withHashIds],
  );

  const mergeMore = useCallback((more: SessionDetail) => {
    setData((prev) =>
      prev
        ? {
            ...prev,
            requests: [...prev.requests, ...more.requests],
            total: more.total,
            offset: more.offset,
            limit: more.limit,
          }
        : more,
    );
  }, []);

  // Auto-load when sentinel becomes visible
  const loadMoreCb = useCallback(() => {
    if (!data || loadingMore) return;
    const nextOffset = data.requests.length;
    if (nextOffset >= data.total) return;
    setLoadingMore(true);
    fetchPage(nextOffset, chunkSizeRef.current)
      .then(mergeMore)
      .catch(console.error)
      .finally(() => setLoadingMore(false));
  }, [data, loadingMore, fetchPage, mergeMore]);

  const sentinelRef = useInfiniteScroll({
    hasMore,
    loading: loadingMore,
    onLoadMore: loadMoreCb,
  });

  // Initial fetch + refetch when load direction changes
  useEffect(() => {
    let stale = false;
    setLoading(true);
    setData(null);
    chunkSizeRef.current = PAGE_SIZE;
    fetchPage(0, PAGE_SIZE)
      .then((d) => {
        if (!stale) setData(d);
      })
      .catch(() => {
        if (!stale) setData(null);
      })
      .finally(() => {
        if (!stale) setLoading(false);
      });
    return () => {
      stale = true;
    };
  }, [fetchPage]);

  async function loadUntil(requestIndex: number) {
    if (!data) return;
    if (data.requests.length >= requestIndex) return;
    const nextOffset = data.requests.length;
    if (nextOffset >= data.total) return;
    const needed = requestIndex - data.requests.length;
    setLoadingMore(true);
    try {
      const more = await fetchPage(nextOffset, Math.min(needed, chunkSizeRef.current));
      mergeMore(more);
    } catch (error) {
      console.error(error);
    } finally {
      setLoadingMore(false);
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-32 w-full" />
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        {t.sessionNotFound}
      </div>
    );
  }
  const { session, requests } = data;
  const { usage } = session;
  const basePath = explorerHref(`/sessions/${id}`);

  function selectReversed(next: boolean) {
    setReversed(next);
    if (data && data.requests.length >= data.total) return;
    setData(null);
    setLoading(true);
    chunkSizeRef.current = PAGE_SIZE;
    setLoadDir(next ? 'desc' : 'asc');
  }

  const displayReversed = reversed !== (loadDir === 'desc');

  const tabKeys: ExplorerSessionTab[] = [
    'conversation',
    'raw',
    'statistics',
    'prefill-vs-decode',
    'flamegraph',
    'tokens-over-time',
    'timeline',
    'flow',
    'radix-tree',
  ];
  const navLinks = tabKeys.map((key) => ({
    href: `${basePath}/${key}`,
    label: EXPLORER_SESSION_TAB_META[key][locale],
  }));

  return (
    <div className="space-y-5">
      <div className="space-y-1">
        <div className="flex items-center gap-1.5 text-xs font-mono">
          <Link
            href={explorerHref('/sessions')}
            className="text-subtle hover:text-foreground transition-colors"
          >
            sessions
          </Link>
          <span className="text-subtle">/</span>
          <span className="font-medium">{session.id}</span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        <div className="rounded-md border border-border bg-surface p-3">
          <div className="text-3xs font-mono font-bold uppercase tracking-eyebrow-wide text-muted-foreground mb-2">
            {t.sessionInfo}
          </div>
          <div className="text-xs space-y-1.5">
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">{t.client}</span>
              <span className="font-mono text-foreground">
                {truncateHash(session.clientApiKeyHash)}
              </span>
            </div>
            <InfoRow label={t.started} value={formatTimestamp(session.startedAt)} />
            <InfoRow label={t.lastActive} value={formatSnapshotTime(session.lastActiveAt)} />
            {session.metadata?.cliVersion && (
              <InfoRow label={t.cliVersion} value={`v${session.metadata.cliVersion}`} />
            )}
            {session.metadata?.os && (
              <InfoRow
                label={t.platform}
                value={`${session.metadata.os} ${session.metadata.arch || ''}`}
              />
            )}
            {session.metadata?.nodeVersion && (
              <InfoRow label="Node.js" value={session.metadata.nodeVersion.replace(/^v*/u, 'v')} />
            )}
            {session.maxTraceVersion !== null && (
              <InfoRow
                label={t.traceVersion}
                value={
                  session.minTraceVersion === session.maxTraceVersion
                    ? `v${session.maxTraceVersion}`
                    : `v${session.minTraceVersion}–v${session.maxTraceVersion}`
                }
                mono
              />
            )}
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t.traceMode}</span>
              <span
                className={`font-mono ${
                  session.privacyMode === 'anon' ? 'text-emerald-500' : 'text-amber-500'
                }`}
              >
                {session.privacyMode === 'anon' ? t.anonymized : t.full}
              </span>
            </div>
          </div>
        </div>

        <div className="rounded-md border border-border bg-surface p-3">
          <div className="text-3xs font-mono font-bold uppercase tracking-eyebrow-wide text-muted-foreground mb-2">
            {t.usage}
          </div>
          <div className="text-xs space-y-1.5">
            <InfoRow label={t.requests} value={String(usage.requestCount)} />
            <InfoRow label={t.inputTokens} value={formatNumber(Number(usage.totalInputTokens))} />
            <InfoRow label={t.outputTokens} value={formatNumber(Number(usage.totalOutputTokens))} />
            {Number(usage.totalCacheCreation) > 0 && (
              <InfoRow
                label={t.cacheCreated}
                value={formatNumber(Number(usage.totalCacheCreation))}
              />
            )}
            {Number(usage.totalCacheRead) > 0 && (
              <InfoRow label={t.cacheRead} value={formatNumber(Number(usage.totalCacheRead))} />
            )}
            {Number(usage.totalCost) > 0 && (
              <InfoRow label={t.estCost} value={`$${Number(usage.totalCost).toFixed(2)}`} />
            )}
            {Number(usage.totalOutputTokens) > 0 && (
              <InfoRow
                label={t.readWriteOut}
                value={`${(Number(usage.totalCacheRead) / Number(usage.totalOutputTokens)).toFixed(1)} : ${(Number(usage.totalCacheCreation) / Number(usage.totalOutputTokens)).toFixed(1)} : 1`}
              />
            )}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <span className="text-3xs font-mono font-bold uppercase tracking-eyebrow-wide text-muted-foreground">
            {t.requestsHeading}
          </span>
          <span className="text-3xs font-mono text-subtle">
            {requests.length} / {data.total}
          </span>
        </div>
        <div className="flex min-w-0 max-w-full items-center gap-2">
          <div className="flex shrink-0 items-center gap-0.5 border border-border rounded-md p-0.5">
            <button
              onClick={() => {
                track('agentic_workload_session_sort_changed', { reversed: false });
                selectReversed(false);
              }}
              className={`px-2 py-1 text-2xs font-mono rounded transition-colors ${
                reversed ? 'text-subtle hover:text-foreground' : 'bg-surface-hover text-foreground'
              }`}
            >
              {t.oldest}
            </button>
            <button
              onClick={() => {
                track('agentic_workload_session_sort_changed', { reversed: true });
                selectReversed(true);
              }}
              className={`px-2 py-1 text-2xs font-mono rounded transition-colors ${
                reversed ? 'bg-surface-hover text-foreground' : 'text-subtle hover:text-foreground'
              }`}
            >
              {t.newest}
            </button>
          </div>
          {/* Scrolls on its own on narrow screens instead of widening the page. */}
          <nav className="flex min-w-0 items-center gap-0.5 overflow-x-auto border border-border rounded-md p-0.5">
            {navLinks.map((link) => {
              const isActive =
                pathname === link.href ||
                (link.href.endsWith('/conversation') && pathname === basePath);
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`shrink-0 whitespace-nowrap px-2.5 py-1 text-2xs font-mono rounded transition-colors ${
                    isActive
                      ? 'bg-surface-hover text-foreground'
                      : 'text-subtle hover:text-foreground'
                  }`}
                >
                  {link.label}
                </Link>
              );
            })}
          </nav>
        </div>
      </div>

      {requests.length < data.total && (
        <div ref={sentinelRef} className="flex items-center justify-center py-4 gap-2">
          <span className="h-4 w-4 border-2 border-foreground/20 border-t-foreground/60 rounded-full animate-spin" />
          <span className="text-2xs font-mono text-subtle">
            {t.loading(data.total - requests.length)}
          </span>
        </div>
      )}

      <SessionProvider
        value={{
          session,
          requests,
          total: data.total,
          loadUntil,
          reversed: displayReversed,
          setReversed: selectReversed,
        }}
      >
        {children}
      </SessionProvider>
    </div>
  );
}

function InfoRow({
  label,
  value,
  mono,
  href,
}: {
  label: string;
  value: string;
  mono?: boolean;
  href?: string;
}) {
  return (
    <div className="flex justify-between">
      <span className="text-muted-foreground">{label}</span>
      {href ? (
        <Link href={href} className={`${mono ? 'font-mono' : ''} hover:underline text-foreground`}>
          {value}
        </Link>
      ) : (
        <span className={mono ? 'font-mono' : ''}>{value}</span>
      )}
    </div>
  );
}
