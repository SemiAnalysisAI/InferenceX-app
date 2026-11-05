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
import { Fragment, memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { RetryableQueryError } from '@/components/ui/retryable-query-error';
import { useServerLogFiles } from '@/hooks/api/use-server-log-files';
import { useServerLogSearch } from '@/hooks/api/use-server-log-search';
import { SERVER_LOG_CHUNK_SIZE, useServerLog } from '@/hooks/api/use-server-log';
import { track } from '@/lib/analytics/analytics';
import { cn } from '@/lib/shared/utils';
import { useLocale } from '@/lib/i18n/use-locale';

import {
  buildLogLines,
  isNearLogBottom,
  readableLogText,
  utf16IndexAtCodePointOffset,
  type LogSeverity,
} from './log-text';

const STRINGS = {
  en: {
    title: 'Log files',
    description: 'Raw .log and .out files captured for this benchmark point',
    fileLabel: 'Log file',
    fileOne: 'file',
    fileMany: 'files',
    searchLabel: 'Search all log files',
    searchPlaceholder: 'Search logs',
    searchHint: 'Searches every stored file, including content not loaded below',
    searching: 'Searching…',
    searchError: 'The logs could not be searched. Try again in a moment.',
    noMatches: 'No matches found',
    searchIncomplete:
      'Search stopped after the first 64 million characters; later content was not searched',
    match: 'match',
    matches: 'matches',
    firstMatches: 'Showing the first',
    character: 'character',
    goToMatch: 'Go to in logs',
    loading: 'Loading log files…',
    error: 'The log files could not be loaded. Try again in a moment.',
    missing: 'No log files are stored for this benchmark point',
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
    description: '该基准测试数据点采集的原始 .log 和 .out 文件',
    fileLabel: '日志文件',
    fileOne: '个文件',
    fileMany: '个文件',
    searchLabel: '搜索所有日志文件',
    searchPlaceholder: '搜索日志',
    searchHint: '搜索所有已存储文件，包括下方尚未加载的内容',
    searching: '正在搜索……',
    searchError: '无法搜索日志，请稍后重试。',
    noMatches: '未找到匹配内容',
    searchIncomplete: '搜索已在前 6,400 万个字符处停止，之后的内容未被搜索',
    match: '处匹配',
    matches: '处匹配',
    firstMatches: '显示前',
    character: '字符',
    goToMatch: '在日志中定位',
    loading: '正在加载日志文件……',
    error: '无法加载日志文件，请稍后重试。',
    missing: '该基准测试数据点没有已存储的日志文件',
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

export function retryInitialServerLogQuery(
  filesFailed: boolean,
  refetchFiles: () => unknown,
  refetchContent: () => unknown,
): void {
  if (filesFailed) void refetchFiles();
  else void refetchContent();
}

const LOG_SURFACE = 'bg-muted/30';

const LINE_TONE: Record<LogSeverity, string> = {
  error: 'border-l-destructive/70 text-destructive',
  warn: 'border-l-warning/70 text-warning',
  debug: 'text-muted-foreground',
  info: 'text-foreground/90',
};

const GUTTER_CLASS =
  'log-gutter sticky left-0 z-10 border-r border-border/30 bg-muted px-3 text-right text-muted-foreground/60 tabular-nums select-none';
const LINE_CLASS = 'border-l-2 border-transparent pr-4 pl-2.5';

const LogRow = memo(({ text, severity }: { text: string; severity: LogSeverity }) => (
  <>
    <span aria-hidden="true" className={GUTTER_CLASS} />
    <span className={cn(LINE_CLASS, LINE_TONE[severity])}>{text}</span>
  </>
));
LogRow.displayName = 'LogRow';

function FilePath({ path, className }: { path: string; className?: string }) {
  const separator = path.lastIndexOf('/');
  if (separator === -1) return <span className={className}>{path}</span>;
  return (
    <span className={className}>
      <span className="text-muted-foreground">{path.slice(0, separator + 1)}</span>
      {path.slice(separator + 1)}
    </span>
  );
}

function LogViewerNotice({
  icon,
  tone = 'muted',
  children,
}: {
  icon: React.ReactNode;
  tone?: 'muted' | 'destructive';
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        'flex items-center gap-3 rounded-xl border px-4 py-6 text-sm',
        tone === 'destructive'
          ? 'border-destructive/30 bg-destructive/10 text-destructive'
          : 'border-border/30 bg-card text-muted-foreground',
      )}
    >
      <span className="flex shrink-0 items-center">{icon}</span>
      <span className="min-w-0">{children}</span>
    </div>
  );
}

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
  const suppressScrollLoadUntilRef = useRef(0);
  const nextOffset = query.data?.pages.at(-1)?.nextOffset ?? 0;
  const loadedOffset = query.data?.pages[0]?.offset ?? initialOffset;
  const analyticsPrefix =
    analyticsContext === 'agentic' ? 'inference_agentic' : 'inference_fixed_seq';

  const highlightedLog = useMemo(() => {
    if (!jumpTarget || jumpTarget.fileName !== selectedFile) return null;
    const relativeOffset = jumpTarget.offset - loadedOffset;
    if (relativeOffset < 0) return null;
    const matchCodePointLength = [...jumpTarget.match].length;
    const matchStart = utf16IndexAtCodePointOffset(rawLog, relativeOffset);
    const matchEnd = utf16IndexAtCodePointOffset(rawLog, relativeOffset + matchCodePointLength);
    if (matchStart === null || matchEnd === null) return null;
    return {
      before: readableLogText(rawLog.slice(0, matchStart)),
      match: readableLogText(rawLog.slice(matchStart, matchEnd)),
      after: readableLogText(rawLog.slice(matchEnd)),
    };
  }, [jumpTarget, loadedOffset, rawLog, selectedFile]);

  const logLines = useMemo(
    () =>
      buildLogLines(
        highlightedLog
          ? [
              { text: highlightedLog.before, highlighted: false },
              { text: highlightedLog.match, highlighted: true },
              { text: highlightedLog.after, highlighted: false },
            ]
          : [{ text: log, highlighted: false }],
      ),
    [highlightedLog, log],
  );
  const jumpPiece = useMemo(() => {
    for (const [lineIndex, line] of logLines.entries()) {
      const pieceIndex = line.pieces.findIndex((piece) => piece.highlighted);
      if (pieceIndex !== -1) return { lineIndex, pieceIndex };
    }
    return null;
  }, [logLines]);

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
    track(`${analyticsPrefix}_logs_searched`, { id, query_length: searchTerm.length });
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
    suppressScrollLoadUntilRef.current = Date.now() + 500;
    jumpHighlightRef.current.scrollIntoView({ block: 'center' });
    jumpHighlightRef.current.focus({ preventScroll: true });
  }, [highlightedLog, jumpTarget]);

  const copyLoadedLog = async () => {
    await navigator.clipboard.writeText(log);
    setCopied(true);
    track(`${analyticsPrefix}_logs_copied`, {
      id,
      file_name: selectedFile,
      loaded_characters: log.length,
    });
    window.setTimeout(() => setCopied(false), 1500);
  };

  const selectFile = (fileName: string) => {
    suppressScrollLoadUntilRef.current = 0;
    setSelection({ pointId: id, fileName, initialOffset: 0, jumpTarget: null });
    setCopied(false);
    track(`${analyticsPrefix}_log_file_selected`, { id, file_name: fileName });
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
      file_name: result.fileName,
      offset: result.offset,
      query_length: searchTerm.length,
    });
  };

  const loadMore = useCallback(
    (trigger: 'button' | 'scroll') => {
      track(`${analyticsPrefix}_log_chunk_loaded`, {
        id,
        file_name: selectedFile,
        offset: nextOffset,
        chunk_size: SERVER_LOG_CHUNK_SIZE,
        trigger,
      });
      void query.fetchNextPage();
    },
    [analyticsPrefix, id, nextOffset, query.fetchNextPage, selectedFile],
  );

  const handleLogScroll = useCallback(
    (event: React.UIEvent<HTMLPreElement>) => {
      const viewport = event.currentTarget;
      if (
        Date.now() < suppressScrollLoadUntilRef.current ||
        !isNearLogBottom(viewport) ||
        !query.hasNextPage ||
        query.isFetchingNextPage ||
        query.isFetchNextPageError
      ) {
        return;
      }
      loadMore('scroll');
    },
    [loadMore, query.hasNextPage, query.isFetchNextPageError, query.isFetchingNextPage],
  );

  const hasLoadedLog = query.data?.pages[0] !== undefined && query.data.pages[0] !== null;

  if (filesQuery.isLoading || (!hasLoadedLog && selectedFile !== null && query.isLoading)) {
    return (
      <LogViewerNotice icon={<LoaderCircle className="size-4 animate-spin" aria-hidden="true" />}>
        {t.loading}
      </LogViewerNotice>
    );
  }
  if (filesQuery.isError || (query.isError && !hasLoadedLog)) {
    const filesFailed = filesQuery.isError;
    return (
      <RetryableQueryError
        message={t.error}
        analyticsEvent={`${analyticsPrefix}_${filesFailed ? 'log_files' : 'log_content'}_retry_clicked`}
        onRetry={() => retryInitialServerLogQuery(filesFailed, filesQuery.refetch, query.refetch)}
        testId={filesFailed ? 'server-log-files-query-error' : 'server-log-content-query-error'}
      />
    );
  }
  if (files.length === 0 || selectedFile === null || query.data?.pages[0] === null) {
    return (
      <LogViewerNotice icon={<Terminal className="size-4" aria-hidden="true" />}>
        {t.missing}
      </LogViewerNotice>
    );
  }

  return (
    <section
      className="overflow-hidden rounded-xl border border-border/30 bg-card"
      data-testid="agentic-server-log-viewer"
      data-log-context={analyticsContext}
    >
      <header className="flex min-w-0 items-baseline gap-3 border-b border-border/20 px-4 py-3">
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-medium text-foreground">{t.title}</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">{t.description}</p>
        </div>
        <span className="shrink-0 font-mono text-2xs tabular-nums text-muted-foreground">
          {formatter.format(files.length)} {files.length === 1 ? t.fileOne : t.fileMany}
        </span>
      </header>

      <div className="grid min-w-0 gap-2 border-b border-border/20 px-4 py-3">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <label className="sr-only" htmlFor="agentic-log-file">
            {t.fileLabel}
          </label>
          <Select value={selectedFile} onValueChange={selectFile}>
            <SelectTrigger
              id="agentic-log-file"
              size="sm"
              className="w-full min-w-0 shrink overflow-hidden font-mono text-xs sm:w-72 lg:w-96 *:data-[slot=select-value]:min-w-0 *:data-[slot=select-value]:truncate"
              title={selectedFile}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="max-w-[calc(100vw-2rem)]">
              {files.map((fileName) => (
                <SelectItem
                  key={fileName}
                  value={fileName}
                  textValue={fileName}
                  className="max-w-full font-mono text-xs whitespace-normal break-all"
                  title={fileName}
                >
                  <FilePath path={fileName} />
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <label className="sr-only" htmlFor="agentic-log-search">
            {t.searchLabel}
          </label>
          <div className="relative min-w-48 flex-1">
            <Search
              className="pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              id="agentic-log-search"
              type="search"
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder={t.searchPlaceholder}
              className="h-11 pr-9 pl-8.5 font-mono text-xs md:h-8 md:text-xs"
              data-testid="server-log-search"
            />
            {searchQuery.isFetching ? (
              <LoaderCircle
                className="absolute top-1/2 right-3 size-3.5 -translate-y-1/2 animate-spin text-muted-foreground"
                aria-label={t.searching}
              />
            ) : null}
          </div>

          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <Button asChild variant="outline" size="xs">
              <a
                href={downloadUrl}
                download
                onClick={() =>
                  track(`${analyticsPrefix}_log_downloaded`, { id, file_name: selectedFile })
                }
                data-testid="download-selected-server-log"
              >
                <Download />
                {t.download}
              </a>
            </Button>
            <Button
              type="button"
              onClick={() => void copyLoadedLog()}
              disabled={log.length === 0}
              variant="outline"
              size="xs"
              data-testid="copy-loaded-server-log"
            >
              {copied ? <Check className="text-success" /> : <Copy />}
              {copied ? t.copied : t.copy}
            </Button>
          </div>
        </div>

        <p className="text-2xs text-muted-foreground">{t.searchHint}</p>

        {searchTerm && searchQuery.isError ? (
          <RetryableQueryError
            message={t.searchError}
            analyticsEvent={`${analyticsPrefix}_log_search_retry_clicked`}
            onRetry={searchQuery.refetch}
            testId="server-log-search-query-error"
          />
        ) : null}
        {searchTerm && searchQuery.data ? (
          <div className="grid gap-1.5 pt-1" data-testid="server-log-search-results">
            <p className="text-xs font-medium text-muted-foreground" aria-live="polite">
              {searchQuery.data.truncated ? `${t.firstMatches} ` : ''}
              {formatter.format(searchQuery.data.matches.length)}{' '}
              {searchQuery.data.matches.length === 1 ? t.match : t.matches}
            </p>
            {searchQuery.data.incomplete ? (
              <p
                className="text-xs text-muted-foreground"
                data-testid="server-log-search-incomplete"
              >
                {t.searchIncomplete}
              </p>
            ) : null}
            {searchQuery.data.matches.length === 0 ? (
              <p className="text-xs text-muted-foreground">{t.noMatches}</p>
            ) : (
              <div
                className={cn(
                  'max-h-72 divide-y divide-border/20 overflow-auto rounded-md border border-border/30',
                  LOG_SURFACE,
                )}
              >
                {searchQuery.data.matches.map((result) => (
                  <article key={`${result.fileName}:${result.offset}`} className="grid gap-1.5 p-3">
                    <div className="flex min-w-0 items-center gap-3 font-mono text-2xs">
                      <span className="min-w-0 truncate text-foreground" title={result.fileName}>
                        <FilePath path={result.fileName} />
                      </span>
                      <span className="ml-auto shrink-0 text-muted-foreground tabular-nums">
                        {t.character} {formatter.format(result.offset + 1)}
                      </span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="2xs"
                        className="shrink-0"
                        onClick={() => goToSearchMatch(result)}
                        data-testid="go-to-server-log-match"
                      >
                        <ArrowDownToLine />
                        {t.goToMatch}
                      </Button>
                    </div>
                    <pre className="max-h-20 overflow-hidden border-l-2 border-border/40 pl-2.5 font-mono text-xs leading-5 break-all whitespace-pre-wrap text-muted-foreground">
                      {readableLogText(result.before)}
                      <mark className="rounded-xs bg-warning/25 px-0.5 text-foreground">
                        {readableLogText(result.match)}
                      </mark>
                      {readableLogText(result.after)}
                    </pre>
                  </article>
                ))}
              </div>
            )}
          </div>
        ) : null}
      </div>

      <pre
        ref={logViewportRef}
        className={cn(
          'max-h-[70vh] min-h-112 overflow-auto font-mono text-xs leading-5',
          LOG_SURFACE,
        )}
        data-testid="server-log-content"
        onScroll={handleLogScroll}
        tabIndex={0}
      >
        <code className="log-lines grid w-max min-w-full grid-cols-[auto_1fr] [&>:nth-child(-n+2)]:pt-3 [&>:nth-last-child(-n+2)]:pb-3">
          {logLines.map((line, lineIndex) =>
            line.pieces.some((piece) => piece.highlighted) ? (
              <Fragment key={lineIndex}>
                <span aria-hidden="true" className={GUTTER_CLASS} />
                <span className={cn(LINE_CLASS, LINE_TONE[line.severity])}>
                  {line.pieces.map((piece, pieceIndex) => {
                    if (!piece.highlighted)
                      return <Fragment key={pieceIndex}>{piece.text}</Fragment>;
                    const isJumpTarget =
                      jumpPiece?.lineIndex === lineIndex && jumpPiece.pieceIndex === pieceIndex;
                    return (
                      <mark
                        key={pieceIndex}
                        ref={isJumpTarget ? jumpHighlightRef : undefined}
                        className="rounded-xs bg-warning/25 px-0.5 text-foreground ring-1 ring-warning/60 outline-none"
                        data-testid={isJumpTarget ? 'server-log-jump-highlight' : undefined}
                        tabIndex={-1}
                      >
                        {piece.text}
                      </mark>
                    );
                  })}
                </span>
              </Fragment>
            ) : (
              <LogRow key={lineIndex} text={line.text} severity={line.severity} />
            ),
          )}
        </code>
      </pre>

      <footer className="flex flex-col gap-2 border-t border-border/20 px-4 py-2.5 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
        <span className="font-mono text-2xs tabular-nums">
          {formatter.format(log.length)} {t.loadedCharacters}
        </span>
        <div className="flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:justify-end">
          {query.isFetchNextPageError ? (
            <span className="text-destructive" role="alert">
              {t.loadMoreError}
            </span>
          ) : null}
          {query.hasNextPage ? (
            <Button
              type="button"
              onClick={() => loadMore('button')}
              disabled={query.isFetchingNextPage}
              variant="outline"
              size="xs"
              data-testid="load-more-server-log"
            >
              {query.isFetchingNextPage ? (
                <LoaderCircle className="animate-spin" />
              ) : (
                <ChevronDown />
              )}
              {query.isFetchingNextPage ? t.loadingMore : t.loadMore}
            </Button>
          ) : (
            <span className="inline-flex items-center gap-1.5 font-mono text-2xs">
              <Check className="size-3.5 text-success" aria-hidden="true" />
              {t.endOfLog}
            </span>
          )}
        </div>
      </footer>
    </section>
  );
}
