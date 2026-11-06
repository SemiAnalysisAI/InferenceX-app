'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, usePathname } from 'next/navigation';
import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { SegmentedToggle } from '@/components/ui/segmented-toggle';
import { SEGMENT_RADIUS_STYLE, SEGMENTED_CONTAINER_STYLE } from '@/components/ui/control-styles';
import { cn } from '@/lib/shared/utils';
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
import { useLocale } from '@/lib/i18n/use-locale';
import { track } from '@/lib/analytics/analytics';

const STRINGS = {
  en: {
    sessionInfo: 'Session info',
    client: 'Client',
    started: 'Started',
    lastActive: 'Last active',
    cliVersion: 'CLI version',
    platform: 'Platform',
    traceVersion: 'Trace version',
    traceMode: 'Trace mode',
    anonymized: 'Anonymized',
    full: 'Full',
    usage: 'Usage',
    requests: 'Requests',
    inputTokens: 'Input tokens',
    outputTokens: 'Output tokens',
    cacheCreated: 'Cache created',
    cacheRead: 'Cache read',
    estCost: 'Est. cost',
    readWriteOut: 'Read : write : out',
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
  const [withHashIds, setWithHashIds] = useState(() => !TABS_WITHOUT_HASH_IDS.has(tab));
  useEffect(() => {
    if (!TABS_WITHOUT_HASH_IDS.has(tab)) setWithHashIds(true);
  }, [tab]);

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
  const sessionPath = `/sessions/${id}`;

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
    href: explorerHref(`${sessionPath}/${key}`),
    label: EXPLORER_SESSION_TAB_META[key][locale],
    active:
      relativePath === `${sessionPath}/${key}` ||
      (key === 'conversation' && relativePath === sessionPath),
  }));

  return (
    <div className="space-y-5">
      <div className="space-y-1">
        <div className="flex items-center gap-1.5 text-xs font-mono">
          <Link
            href={explorerHref('/sessions')}
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            sessions
          </Link>
          <span className="text-muted-foreground">/</span>
          <span className="font-medium">{session.id}</span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        <Card>
          <div className="text-xs font-medium text-muted-foreground mb-2">{t.sessionInfo}</div>
          <div className="text-xs space-y-1.5">
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">{t.client}</span>
              <span className="font-mono text-foreground">
                {truncateHash(session.clientApiKeyHash)}
              </span>
            </div>
            <InfoRow label={t.started} value={formatTimestamp(session.startedAt, locale)} />
            <InfoRow
              label={t.lastActive}
              value={formatSnapshotTime(session.lastActiveAt, locale)}
            />
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
                  session.privacyMode === 'anon' ? 'text-foreground' : 'text-muted-foreground'
                }`}
              >
                {session.privacyMode === 'anon' ? t.anonymized : t.full}
              </span>
            </div>
          </div>
        </Card>

        <Card>
          <div className="text-xs font-medium text-muted-foreground mb-2">{t.usage}</div>
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
        </Card>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <span className="text-xs font-medium text-muted-foreground">{t.requestsHeading}</span>
          <span className="text-3xs font-mono text-muted-foreground">
            {requests.length} / {data.total}
          </span>
        </div>
        <div className="flex min-w-0 max-w-full items-center gap-2">
          <SegmentedToggle
            role="group"
            ariaLabel={t.requestsHeading}
            className="shrink-0"
            value={reversed ? 'newest' : 'oldest'}
            onValueChange={(next) => {
              const nextReversed = next === 'newest';
              track('agentic_workload_session_sort_changed', { reversed: nextReversed });
              selectReversed(nextReversed);
            }}
            options={[
              { value: 'oldest', label: t.oldest },
              { value: 'newest', label: t.newest },
            ]}
          />
          <nav className={cn(SEGMENTED_CONTAINER_STYLE, 'flex-nowrap overflow-x-auto')}>
            {navLinks.map((link) => {
              const isActive = link.active;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`inline-flex min-h-11 shrink-0 items-center whitespace-nowrap ${SEGMENT_RADIUS_STYLE} px-1.5 text-sm font-medium transition-colors md:min-h-6 ${
                    isActive
                      ? 'bg-muted text-foreground dark:bg-input'
                      : 'text-muted-foreground hover:text-foreground'
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
          <span className="text-2xs font-mono text-muted-foreground">
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
