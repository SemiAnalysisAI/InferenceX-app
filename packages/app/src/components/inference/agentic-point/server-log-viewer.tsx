'use client';

import { Check, ChevronDown, Copy, LoaderCircle, Terminal } from 'lucide-react';
import { useMemo, useState } from 'react';

import { SERVER_LOG_CHUNK_SIZE, useServerLog } from '@/hooks/api/use-server-log';
import { track } from '@/lib/analytics';
import { useLocale } from '@/lib/use-locale';

import { readableLogText } from './log-text';

const STRINGS = {
  en: {
    title: 'Server log',
    artifact: 'server.log',
    description: 'Raw server output captured for this benchmark point.',
    storageNote:
      'The database currently stores the server.log artifact as one stream. Router and worker log files are not persisted separately yet.',
    loading: 'Loading the first log chunk…',
    error: 'The server log could not be loaded. Try again in a moment.',
    missing: 'No server log is stored for this benchmark point.',
    copy: 'Copy loaded logs',
    copied: 'Copied',
    loadMore: 'Load next 64 KiB',
    loadingMore: 'Loading…',
    loadedCharacters: 'characters loaded',
    endOfLog: 'End of stored log',
  },
  zh: {
    title: '服务器日志',
    artifact: 'server.log',
    description: '该基准测试数据点采集的原始服务器输出。',
    storageNote:
      '数据库目前将 server.log 产物存储为单一日志流，尚未分别持久化 router 和 worker 日志文件。',
    loading: '正在加载首个日志分块……',
    error: '无法加载服务器日志，请稍后重试。',
    missing: '该基准测试数据点没有已存储的服务器日志。',
    copy: '复制已加载日志',
    copied: '已复制',
    loadMore: '继续加载 64 KiB',
    loadingMore: '正在加载……',
    loadedCharacters: '个字符已加载',
    endOfLog: '已到达日志末尾',
  },
} as const;

interface Props {
  id: number;
  enabled: boolean;
}

export function ServerLogViewer({ id, enabled }: Props) {
  const locale = useLocale();
  const t = STRINGS[locale];
  const query = useServerLog(id, enabled);
  const [copied, setCopied] = useState(false);
  const rawLog = useMemo(
    () => query.data?.pages.map((page) => page?.serverLog ?? '').join('') ?? '',
    [query.data],
  );
  const log = useMemo(() => readableLogText(rawLog), [rawLog]);
  const hasLog = query.data?.pages[0] !== null;
  const formatter = useMemo(
    () => new Intl.NumberFormat(locale === 'zh' ? 'zh-CN' : 'en-US'),
    [locale],
  );

  const copyLoadedLog = async () => {
    await navigator.clipboard.writeText(log);
    setCopied(true);
    track('inference_agentic_logs_copied', { id, loadedCharacters: log.length });
    window.setTimeout(() => setCopied(false), 1500);
  };

  const loadMore = () => {
    track('inference_agentic_log_chunk_loaded', {
      id,
      offset: query.data?.pages.at(-1)?.nextOffset ?? 0,
      chunkSize: SERVER_LOG_CHUNK_SIZE,
    });
    void query.fetchNextPage();
  };

  if (query.isLoading) {
    return (
      <div className="rounded-lg border border-border/40 bg-card/40 p-4 text-sm text-muted-foreground">
        {t.loading}
      </div>
    );
  }
  if (query.isError) {
    return (
      <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
        {t.error}
      </div>
    );
  }
  if (!hasLog) {
    return (
      <div className="rounded-lg border border-border/40 bg-card/40 p-4 text-sm text-muted-foreground">
        {t.missing}
      </div>
    );
  }

  return (
    <section
      className="overflow-hidden rounded-lg border border-border/60 bg-card/40"
      data-testid="agentic-server-log-viewer"
    >
      <header className="flex flex-col gap-3 border-b border-border/60 bg-muted/20 px-4 py-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex gap-3">
          <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md border border-border/60 bg-background text-muted-foreground">
            <Terminal className="size-4" aria-hidden="true" />
          </span>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-semibold text-foreground">{t.title}</h2>
              <code className="rounded border border-border/60 bg-background px-1.5 py-0.5 text-[11px] text-muted-foreground">
                {t.artifact}
              </code>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">{t.description}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => void copyLoadedLog()}
          disabled={log.length === 0}
          className="inline-flex h-8 items-center justify-center gap-1.5 rounded-md border border-border bg-background px-3 text-xs font-medium text-foreground transition-colors hover:bg-accent disabled:pointer-events-none disabled:opacity-50"
          data-testid="copy-loaded-server-log"
        >
          {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
          {copied ? t.copied : t.copy}
        </button>
      </header>

      <p className="border-b border-border/60 bg-amber-500/5 px-4 py-2 text-xs text-muted-foreground">
        {t.storageNote}
      </p>

      <pre
        className="max-h-[70vh] min-h-[28rem] overflow-auto bg-zinc-950 p-4 font-mono text-xs leading-5 text-zinc-100 selection:bg-sky-400/30"
        data-testid="server-log-content"
        tabIndex={0}
      >
        {log}
      </pre>

      <footer className="flex flex-col gap-2 border-t border-border/60 bg-muted/20 px-4 py-3 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
        <span>
          {formatter.format(log.length)} {t.loadedCharacters}
        </span>
        {query.hasNextPage ? (
          <button
            type="button"
            onClick={loadMore}
            disabled={query.isFetchingNextPage}
            className="inline-flex h-8 items-center justify-center gap-1.5 rounded-md border border-border bg-background px-3 font-medium text-foreground transition-colors hover:bg-accent disabled:pointer-events-none disabled:opacity-50"
            data-testid="load-more-server-log"
          >
            {query.isFetchingNextPage ? (
              <LoaderCircle className="size-3.5 animate-spin" />
            ) : (
              <ChevronDown className="size-3.5" />
            )}
            {query.isFetchingNextPage ? t.loadingMore : t.loadMore}
          </button>
        ) : (
          <span>{t.endOfLog}</span>
        )}
      </footer>
    </section>
  );
}
