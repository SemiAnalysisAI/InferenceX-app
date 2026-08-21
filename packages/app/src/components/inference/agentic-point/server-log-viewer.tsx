'use client';

import {
  ArrowDownToLine,
  Check,
  ChevronDown,
  Copy,
  Download,
  LoaderCircle,
  Search,
  Terminal,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useServerLogFiles } from '@/hooks/api/use-server-log-files';
import { useServerLogSearch } from '@/hooks/api/use-server-log-search';
import { SERVER_LOG_CHUNK_SIZE, useServerLog } from '@/hooks/api/use-server-log';
import { track } from '@/lib/analytics';
import { useLocale } from '@/lib/use-locale';

import { readableLogText } from './log-text';

const STRINGS = {
  en: {
    title: 'Log files',
    description: 'Raw .log and .out files captured for this benchmark point.',
    fileLabel: 'Log file',
    searchLabel: 'Search all log files',
    searchPlaceholder: 'Search full log contents…',
    searchHint: 'Searches every stored file, including content not loaded below.',
    searching: 'Searching…',
    searchError: 'The logs could not be searched. Try again in a moment.',
    noMatches: 'No matches found.',
    match: 'match',
    matches: 'matches',
    firstMatches: 'Showing the first',
    character: 'character',
    goToMatch: 'Go to in logs',
    loading: 'Loading log files…',
    error: 'The log files could not be loaded. Try again in a moment.',
    missing: 'No log files are stored for this benchmark point.',
    copy: 'Copy loaded logs',
    copied: 'Copied',
    download: 'Download selected log',
    loadMore: 'Load next 64 KiB',
    loadingMore: 'Loading…',
    loadMoreError: 'The next chunk could not be loaded. The loaded text is still available.',
    loadedCharacters: 'characters loaded',
    endOfLog: 'End of stored log',
  },
  zh: {
    title: '日志文件',
    description: '该基准测试数据点采集的原始 .log 和 .out 文件。',
    fileLabel: '日志文件',
    searchLabel: '搜索所有日志文件',
    searchPlaceholder: '搜索完整日志内容……',
    searchHint: '搜索所有已存储文件，包括下方尚未加载的内容。',
    searching: '正在搜索……',
    searchError: '无法搜索日志，请稍后重试。',
    noMatches: '未找到匹配内容。',
    match: '处匹配',
    matches: '处匹配',
    firstMatches: '显示前',
    character: '字符',
    goToMatch: '在日志中定位',
    loading: '正在加载日志文件……',
    error: '无法加载日志文件，请稍后重试。',
    missing: '该基准测试数据点没有已存储的日志文件。',
    copy: '复制已加载日志',
    copied: '已复制',
    download: '下载当前日志',
    loadMore: '继续加载 64 KiB',
    loadingMore: '正在加载……',
    loadMoreError: '无法加载下一段内容，已加载的文本仍可查看。',
    loadedCharacters: '个字符已加载',
    endOfLog: '已到达日志末尾',
  },
} as const;

interface Props {
  id: number;
  enabled: boolean;
  analyticsContext?: 'agentic' | 'fixed-sequence';
}

interface LogJumpTarget {
  fileName: string;
  offset: number;
  match: string;
  requestId: number;
}

interface LogSelection {
  pointId: number;
  fileName: string;
  initialOffset: number;
  jumpTarget: LogJumpTarget | null;
}

const SEARCH_JUMP_CONTEXT_SIZE = 16 * 1024;

export function ServerLogViewer({ id, enabled, analyticsContext = 'agentic' }: Props) {
  const locale = useLocale();
  const t = STRINGS[locale];
  const filesQuery = useServerLogFiles(id, enabled);
  const files = filesQuery.data ?? [];
  const [selection, setSelection] = useState<LogSelection | null>(null);
  const [searchInput, setSearchInput] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const activeSelection = selection?.pointId === id ? selection : null;
  const requestedFile = activeSelection?.fileName ?? null;
  const initialOffset = activeSelection?.initialOffset ?? 0;
  const jumpTarget = activeSelection?.jumpTarget ?? null;
  const selectedFile =
    requestedFile && files.includes(requestedFile) ? requestedFile : (files[0] ?? null);

  const query = useServerLog(id, selectedFile, enabled && selectedFile !== null, initialOffset);
  const searchQuery = useServerLogSearch(id, searchTerm, enabled);
  const [copied, setCopied] = useState(false);
  const rawLog = useMemo(
    () => query.data?.pages.map((page) => page?.serverLog ?? '').join('') ?? '',
    [query.data],
  );
  const log = useMemo(() => readableLogText(rawLog), [rawLog]);
  const formatter = useMemo(
    () => new Intl.NumberFormat(locale === 'zh' ? 'zh-CN' : 'en-US'),
    [locale],
  );
  const logViewportRef = useRef<HTMLPreElement>(null);
  const jumpHighlightRef = useRef<HTMLElement>(null);
  const jumpRequestIdRef = useRef(0);
  const scrolledJumpRequestIdRef = useRef(0);
  const loadMoreTriggerRef = useRef<HTMLSpanElement>(null);
  const nextOffset = query.data?.pages.at(-1)?.nextOffset ?? 0;
  const loadedOffset = query.data?.pages[0]?.offset ?? initialOffset;
  const analyticsPrefix =
    analyticsContext === 'agentic' ? 'inference_agentic' : 'inference_fixed_seq';

  const highlightedLog = useMemo(() => {
    if (!jumpTarget || jumpTarget.fileName !== selectedFile) return null;
    const relativeOffset = jumpTarget.offset - loadedOffset;
    if (relativeOffset < 0 || relativeOffset + jumpTarget.match.length > rawLog.length) return null;
    return {
      before: readableLogText(rawLog.slice(0, relativeOffset)),
      match: readableLogText(
        rawLog.slice(relativeOffset, relativeOffset + jumpTarget.match.length),
      ),
      after: readableLogText(rawLog.slice(relativeOffset + jumpTarget.match.length)),
    };
  }, [jumpTarget, loadedOffset, rawLog, selectedFile]);

  const downloadUrl = useMemo(() => {
    if (!selectedFile) return '#';
    return `/api/v1/server-log?${new URLSearchParams({
      id: String(id),
      file: selectedFile,
      download: '1',
    })}`;
  }, [id, selectedFile]);

  useEffect(() => {
    const timeout = window.setTimeout(() => setSearchTerm(searchInput.trim()), 300);
    return () => window.clearTimeout(timeout);
  }, [searchInput]);

  useEffect(() => {
    if (!searchTerm) return;
    track(`${analyticsPrefix}_logs_searched`, { id, queryLength: searchTerm.length });
  }, [analyticsPrefix, id, searchTerm]);

  useEffect(() => {
    if (
      !highlightedLog ||
      !jumpTarget ||
      !jumpHighlightRef.current ||
      scrolledJumpRequestIdRef.current === jumpTarget.requestId
    ) {
      return;
    }
    scrolledJumpRequestIdRef.current = jumpTarget.requestId;
    jumpHighlightRef.current.scrollIntoView({ block: 'center' });
    jumpHighlightRef.current.focus({ preventScroll: true });
  }, [highlightedLog, jumpTarget]);

  const copyLoadedLog = async () => {
    await navigator.clipboard.writeText(log);
    setCopied(true);
    track(`${analyticsPrefix}_logs_copied`, {
      id,
      fileName: selectedFile,
      loadedCharacters: log.length,
    });
    window.setTimeout(() => setCopied(false), 1500);
  };

  const selectFile = (fileName: string) => {
    setSelection({ pointId: id, fileName, initialOffset: 0, jumpTarget: null });
    setCopied(false);
    track(`${analyticsPrefix}_log_file_selected`, { id, fileName });
  };

  const goToSearchMatch = (result: Omit<LogJumpTarget, 'requestId'>) => {
    const startOffset = Math.max(0, result.offset - SEARCH_JUMP_CONTEXT_SIZE);
    jumpRequestIdRef.current += 1;
    setSelection({
      pointId: id,
      fileName: result.fileName,
      initialOffset: startOffset,
      jumpTarget: { ...result, requestId: jumpRequestIdRef.current },
    });
    setCopied(false);
    track(`${analyticsPrefix}_log_search_match_opened`, {
      id,
      fileName: result.fileName,
      offset: result.offset,
      queryLength: searchTerm.length,
    });
  };

  const loadMore = useCallback(
    (trigger: 'button' | 'scroll') => {
      track(`${analyticsPrefix}_log_chunk_loaded`, {
        id,
        fileName: selectedFile,
        offset: nextOffset,
        chunkSize: SERVER_LOG_CHUNK_SIZE,
        trigger,
      });
      void query.fetchNextPage();
    },
    [analyticsPrefix, id, nextOffset, query.fetchNextPage, selectedFile],
  );

  useEffect(() => {
    const root = logViewportRef.current;
    const target = loadMoreTriggerRef.current;
    if (
      !root ||
      !target ||
      !query.hasNextPage ||
      query.isFetchingNextPage ||
      query.isFetchNextPageError
    ) {
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) loadMore('scroll');
      },
      { root, rootMargin: '0px 0px 160px 0px' },
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [loadMore, query.hasNextPage, query.isFetchNextPageError, query.isFetchingNextPage]);

  const hasLoadedLog = query.data?.pages[0] !== undefined && query.data.pages[0] !== null;

  if (filesQuery.isLoading || (!hasLoadedLog && selectedFile !== null && query.isLoading)) {
    return (
      <div className="rounded-lg border border-border/40 bg-card/40 p-4 text-sm text-muted-foreground">
        {t.loading}
      </div>
    );
  }
  if (filesQuery.isError || (query.isError && !hasLoadedLog)) {
    return (
      <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
        {t.error}
      </div>
    );
  }
  if (files.length === 0 || selectedFile === null || query.data?.pages[0] === null) {
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
      data-log-context={analyticsContext}
    >
      <header className="grid min-w-0 gap-3 border-b border-border/60 bg-muted/20 px-4 py-3">
        <div className="flex min-w-0 gap-3">
          <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md border border-border/60 bg-background text-muted-foreground">
            <Terminal className="size-4" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h2 className="font-semibold text-foreground">{t.title}</h2>
            <p className="mt-1 text-xs text-muted-foreground">{t.description}</p>
          </div>
        </div>
        <div className="grid min-w-0 gap-1">
          <label className="text-xs font-medium text-muted-foreground" htmlFor="agentic-log-file">
            {t.fileLabel}
          </label>
          <Select value={selectedFile} onValueChange={selectFile}>
            <SelectTrigger
              id="agentic-log-file"
              className="w-full min-w-0 overflow-hidden font-mono text-xs *:data-[slot=select-value]:min-w-0 *:data-[slot=select-value]:truncate"
              title={selectedFile}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="max-w-[calc(100vw-2rem)]">
              {files.map((fileName) => (
                <SelectItem
                  key={fileName}
                  value={fileName}
                  className="max-w-full font-mono text-xs whitespace-normal break-all"
                  title={fileName}
                >
                  {fileName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </header>

      <div className="grid gap-2 border-b border-border/60 bg-background/20 px-4 py-3">
        <label className="text-xs font-medium text-muted-foreground" htmlFor="agentic-log-search">
          {t.searchLabel}
        </label>
        <div className="relative">
          <Search
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            id="agentic-log-search"
            type="search"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder={t.searchPlaceholder}
            className="pr-9 pl-9 font-mono text-xs"
            data-testid="server-log-search"
          />
          {searchQuery.isFetching ? (
            <LoaderCircle
              className="absolute top-1/2 right-3 size-4 -translate-y-1/2 animate-spin text-muted-foreground"
              aria-label={t.searching}
            />
          ) : null}
        </div>
        <p className="text-xs text-muted-foreground">{t.searchHint}</p>

        {searchTerm && searchQuery.isError ? (
          <p className="text-xs text-destructive" role="alert">
            {t.searchError}
          </p>
        ) : null}
        {searchTerm && searchQuery.data ? (
          <div className="grid gap-2" data-testid="server-log-search-results">
            <p className="text-xs font-medium text-muted-foreground" aria-live="polite">
              {searchQuery.data.truncated ? `${t.firstMatches} ` : ''}
              {formatter.format(searchQuery.data.matches.length)}{' '}
              {searchQuery.data.matches.length === 1 ? t.match : t.matches}
            </p>
            {searchQuery.data.matches.length === 0 ? (
              <p className="rounded-md border border-border/60 bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
                {t.noMatches}
              </p>
            ) : (
              <div className="max-h-72 divide-y divide-border/60 overflow-auto rounded-md border border-border/60 bg-zinc-950">
                {searchQuery.data.matches.map((result) => (
                  <article
                    key={`${result.fileName}:${result.offset}`}
                    className="grid gap-1 px-3 py-2"
                  >
                    <div className="flex min-w-0 items-center justify-between gap-3 font-mono text-[11px] text-zinc-400">
                      <span className="min-w-0 truncate" title={result.fileName}>
                        {result.fileName}
                      </span>
                      <span className="shrink-0">
                        {t.character} {formatter.format(result.offset + 1)}
                      </span>
                    </div>
                    <pre className="max-h-20 overflow-hidden font-mono text-xs leading-5 whitespace-pre-wrap break-all text-zinc-200">
                      {readableLogText(result.before)}
                      <mark className="rounded-sm bg-amber-300 px-0.5 text-zinc-950">
                        {readableLogText(result.match)}
                      </mark>
                      {readableLogText(result.after)}
                    </pre>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 justify-self-end px-2 text-[11px] text-amber-200 hover:bg-amber-300/10 hover:text-amber-100"
                      onClick={() => goToSearchMatch(result)}
                      data-testid="go-to-server-log-match"
                    >
                      <ArrowDownToLine className="size-3.5" />
                      {t.goToMatch}
                    </Button>
                  </article>
                ))}
              </div>
            )}
          </div>
        ) : null}
      </div>

      <div className="flex flex-wrap justify-end gap-2 border-b border-border/60 bg-background/40 px-4 py-2">
        <Button asChild variant="outline" size="sm" className="text-xs">
          <a
            href={downloadUrl}
            download
            onClick={() =>
              track(`${analyticsPrefix}_log_downloaded`, { id, fileName: selectedFile })
            }
            data-testid="download-selected-server-log"
          >
            <Download className="size-3.5" />
            {t.download}
          </a>
        </Button>
        <Button
          type="button"
          onClick={() => void copyLoadedLog()}
          disabled={log.length === 0}
          variant="outline"
          size="sm"
          className="text-xs"
          data-testid="copy-loaded-server-log"
        >
          {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
          {copied ? t.copied : t.copy}
        </Button>
      </div>

      <pre
        ref={logViewportRef}
        className="max-h-[70vh] min-h-[28rem] overflow-auto bg-zinc-950 p-4 font-mono text-xs leading-5 text-zinc-100 selection:bg-sky-400/30"
        data-testid="server-log-content"
        tabIndex={0}
      >
        {highlightedLog ? (
          <>
            {highlightedLog.before}
            <mark
              ref={jumpHighlightRef}
              className="rounded-sm bg-amber-300 px-0.5 text-zinc-950 outline-none ring-2 ring-amber-300/30 ring-offset-2 ring-offset-zinc-950"
              data-testid="server-log-jump-highlight"
              tabIndex={-1}
            >
              {highlightedLog.match}
            </mark>
            {highlightedLog.after}
          </>
        ) : (
          log
        )}
        <span
          ref={loadMoreTriggerRef}
          className="block h-px w-full"
          data-testid="server-log-load-more-trigger"
          aria-hidden="true"
        />
      </pre>

      <footer className="flex flex-col gap-2 border-t border-border/60 bg-muted/20 px-4 py-3 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
        <span>
          {formatter.format(log.length)} {t.loadedCharacters}
        </span>
        <div className="flex flex-col items-start gap-2 sm:items-end">
          {query.isFetchNextPageError ? (
            <span className="text-destructive" role="alert">
              {t.loadMoreError}
            </span>
          ) : null}
          {query.hasNextPage ? (
            <button
              type="button"
              onClick={() => loadMore('button')}
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
        </div>
      </footer>
    </section>
  );
}
