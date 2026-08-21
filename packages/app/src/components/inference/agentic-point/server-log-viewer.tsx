'use client';

import {
  ArrowDownToLine,
  Check,
  ChevronDown,
  Copy,
  Download,
  FileWarning,
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
import { useServerLogFiles } from '@/hooks/api/use-server-log-files';
import { useServerLogSearch } from '@/hooks/api/use-server-log-search';
import { SERVER_LOG_CHUNK_SIZE, useServerLog } from '@/hooks/api/use-server-log';
import { track } from '@/lib/analytics';
import { cn } from '@/lib/utils';
import { useLocale } from '@/lib/use-locale';

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
    description: 'Raw .log and .out files captured for this benchmark point.',
    fileLabel: 'Log file',
    fileOne: 'file',
    fileMany: 'files',
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
    fileOne: '个文件',
    fileMany: '个文件',
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

/** Console surface. Kept dark in every theme — these are raw terminal artifacts. */
const LOG_SURFACE = 'bg-[#0b0e13]';

/** Per-severity line tint. Error and warning rows also carry a left accent bar. */
const LINE_TONE: Record<LogSeverity, string> = {
  error: 'border-l-rose-400/80 bg-rose-500/8 text-rose-200',
  warn: 'border-l-amber-300/70 bg-amber-300/6 text-amber-100',
  debug: 'text-zinc-500',
  info: 'text-zinc-300',
};

/** Gutter cell. Empty on purpose — the number comes from a CSS counter, so it
    stays out of `textContent` and out of anything the reader copies. */
const GUTTER_CLASS = cn(
  'log-gutter sticky left-0 z-10 border-r border-white/8 px-3 text-right text-zinc-600 tabular-nums select-none',
  LOG_SURFACE,
);
const LINE_CLASS = 'border-l-2 border-transparent pr-4 pl-2.5';

/**
 * One plain log line, memoized on primitives. Loading a chunk rebuilds the whole
 * line array, so without this every already-rendered line would reconcile again;
 * a megabyte-scale log is ~10k lines and that dominates the load-more click.
 */
const LogRow = memo(({ text, severity }: { text: string; severity: LogSeverity }) => (
  <>
    <span aria-hidden="true" className={GUTTER_CLASS} />
    <span className={cn(LINE_CLASS, LINE_TONE[severity])}>{text}</span>
  </>
));
LogRow.displayName = 'LogRow';

/** Split a path so the directory reads as context and the filename as the value. */
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

/** Full-width bordered notice used by the loading, error, and empty states. */
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
        'flex items-center gap-3 rounded-lg border px-4 py-6 text-sm',
        tone === 'destructive'
          ? 'border-destructive/40 bg-destructive/10 text-destructive'
          : 'border-border/40 bg-card/40 text-muted-foreground',
      )}
    >
      <span
        className={cn(
          'flex size-9 shrink-0 items-center justify-center rounded-md border',
          tone === 'destructive'
            ? 'border-destructive/30 bg-destructive/10'
            : 'border-border/50 bg-background',
        )}
      >
        {icon}
      </span>
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

  // Rendered lines carry the search highlight as a piece so a mid-line match
  // stays one `<mark>` on the line it starts on.
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
  // The jump target is the first highlighted run: it carries the scroll ref and
  // the test id, while any continuation runs on later lines render unmarked.
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
    suppressScrollLoadUntilRef.current = Date.now() + 500;
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
    suppressScrollLoadUntilRef.current = 0;
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
    return (
      <LogViewerNotice
        tone="destructive"
        icon={<FileWarning className="size-4" aria-hidden="true" />}
      >
        {t.error}
      </LogViewerNotice>
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
      className="overflow-hidden rounded-lg border border-border/60 bg-card/40 shadow-sm"
      data-testid="agentic-server-log-viewer"
      data-log-context={analyticsContext}
    >
      <header className="flex min-w-0 items-start gap-3 border-b border-border/60 bg-muted/20 px-4 py-3">
        <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md border border-border/60 bg-background text-muted-foreground">
          <Terminal className="size-4" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold text-foreground">{t.title}</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">{t.description}</p>
        </div>
        <span className="shrink-0 rounded-full border border-border/60 bg-background px-2.5 py-0.5 font-mono text-[11px] tabular-nums text-muted-foreground">
          {formatter.format(files.length)} {files.length === 1 ? t.fileOne : t.fileMany}
        </span>
      </header>

      <div className="grid min-w-0 gap-2 border-b border-border/60 bg-background/30 px-4 py-3">
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
              className="h-8 pr-9 pl-8.5 font-mono text-xs md:text-xs"
              data-testid="server-log-search"
            />
            {searchQuery.isFetching ? (
              <LoaderCircle
                className="absolute top-1/2 right-3 size-3.5 -translate-y-1/2 animate-spin text-muted-foreground"
                aria-label={t.searching}
              />
            ) : null}
          </div>

          {/* Wraps rather than clipping: the pair does not fit beside the search field
              on a phone, so the group breaks onto its own line(s). */}
          <div className="flex min-w-0 flex-wrap items-center gap-2">
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
              {copied ? (
                <Check className="size-3.5 text-emerald-500" />
              ) : (
                <Copy className="size-3.5" />
              )}
              {copied ? t.copied : t.copy}
            </Button>
          </div>
        </div>

        <p className="text-[11px] text-muted-foreground">{t.searchHint}</p>

        {searchTerm && searchQuery.isError ? (
          <p className="text-xs text-destructive" role="alert">
            {t.searchError}
          </p>
        ) : null}
        {searchTerm && searchQuery.data ? (
          <div className="grid gap-1.5 pt-1" data-testid="server-log-search-results">
            <p
              className="font-mono text-[10px] font-semibold tracking-[0.15em] text-muted-foreground uppercase"
              aria-live="polite"
            >
              {searchQuery.data.truncated ? `${t.firstMatches} ` : ''}
              {formatter.format(searchQuery.data.matches.length)}{' '}
              {searchQuery.data.matches.length === 1 ? t.match : t.matches}
            </p>
            {searchQuery.data.matches.length === 0 ? (
              <p className="rounded-md border border-border/60 bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
                {t.noMatches}
              </p>
            ) : (
              <div
                className={cn(
                  'max-h-72 divide-y divide-white/5 overflow-auto rounded-md border border-border/60',
                  LOG_SURFACE,
                )}
              >
                {searchQuery.data.matches.map((result) => (
                  <article key={`${result.fileName}:${result.offset}`} className="grid gap-1.5 p-3">
                    <div className="flex min-w-0 items-center gap-3 font-mono text-[11px]">
                      <span className="min-w-0 truncate text-zinc-300" title={result.fileName}>
                        <FilePath path={result.fileName} className="[&>span]:text-zinc-500" />
                      </span>
                      <span className="ml-auto shrink-0 text-zinc-500 tabular-nums">
                        {t.character} {formatter.format(result.offset + 1)}
                      </span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-6 shrink-0 gap-1 px-2 text-[11px] text-amber-200/90 hover:bg-amber-300/10 hover:text-amber-100"
                        onClick={() => goToSearchMatch(result)}
                        data-testid="go-to-server-log-match"
                      >
                        <ArrowDownToLine className="size-3" />
                        {t.goToMatch}
                      </Button>
                    </div>
                    <pre className="max-h-20 overflow-hidden border-l-2 border-white/10 pl-2.5 font-mono text-xs leading-5 break-all whitespace-pre-wrap text-zinc-400">
                      {readableLogText(result.before)}
                      <mark className="rounded-xs bg-amber-300 px-0.5 text-zinc-950">
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
          'max-h-[70vh] min-h-[28rem] overflow-auto font-mono text-xs leading-5 selection:bg-sky-400/30',
          LOG_SURFACE,
        )}
        data-testid="server-log-content"
        onScroll={handleLogScroll}
        tabIndex={0}
      >
        <code className="log-lines grid w-max min-w-full grid-cols-[auto_1fr] py-3">
          {logLines.map((line, lineIndex) =>
            // Only the few lines a search match spans need per-piece markup; the
            // rest go through the memoized row so appends stay cheap.
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
                        className="rounded-xs bg-amber-300 px-0.5 text-zinc-950 ring-2 ring-amber-300/30 ring-offset-2 ring-offset-[#0b0e13] outline-none"
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

      <footer className="flex flex-col gap-2 border-t border-border/60 bg-muted/20 px-4 py-2.5 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
        <span className="font-mono text-[11px] tabular-nums">
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
              size="sm"
              className="h-7 text-xs"
              data-testid="load-more-server-log"
            >
              {query.isFetchingNextPage ? (
                <LoaderCircle className="size-3.5 animate-spin" />
              ) : (
                <ChevronDown className="size-3.5" />
              )}
              {query.isFetchingNextPage ? t.loadingMore : t.loadMore}
            </Button>
          ) : (
            <span className="inline-flex items-center gap-1.5 font-mono text-[11px]">
              <Check className="size-3.5 text-emerald-500" aria-hidden="true" />
              {t.endOfLog}
            </span>
          )}
        </div>
      </footer>
    </section>
  );
}
