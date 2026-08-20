'use client';

import { Check, ChevronDown, Copy, LoaderCircle, Terminal } from 'lucide-react';
import { useMemo, useState } from 'react';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useServerLogFiles } from '@/hooks/api/use-server-log-files';
import { SERVER_LOG_CHUNK_SIZE, useServerLog } from '@/hooks/api/use-server-log';
import { track } from '@/lib/analytics';
import { useLocale } from '@/lib/use-locale';

import { readableLogText } from './log-text';

const STRINGS = {
  en: {
    title: 'Log files',
    description: 'Raw .log and .out files captured for this benchmark point.',
    fileLabel: 'Log file',
    loading: 'Loading log files…',
    error: 'The log files could not be loaded. Try again in a moment.',
    missing: 'No log files are stored for this benchmark point.',
    copy: 'Copy loaded logs',
    copied: 'Copied',
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
    loading: '正在加载日志文件……',
    error: '无法加载日志文件，请稍后重试。',
    missing: '该基准测试数据点没有已存储的日志文件。',
    copy: '复制已加载日志',
    copied: '已复制',
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
}

export function ServerLogViewer({ id, enabled }: Props) {
  const locale = useLocale();
  const t = STRINGS[locale];
  const filesQuery = useServerLogFiles(id, enabled);
  const files = filesQuery.data ?? [];
  const [requestedFile, setRequestedFile] = useState<string | null>(null);
  const selectedFile =
    requestedFile && files.includes(requestedFile) ? requestedFile : (files[0] ?? null);

  const query = useServerLog(id, selectedFile, enabled && selectedFile !== null);
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

  const copyLoadedLog = async () => {
    await navigator.clipboard.writeText(log);
    setCopied(true);
    track('inference_agentic_logs_copied', {
      id,
      fileName: selectedFile,
      loadedCharacters: log.length,
    });
    window.setTimeout(() => setCopied(false), 1500);
  };

  const selectFile = (fileName: string) => {
    setRequestedFile(fileName);
    setCopied(false);
    track('inference_agentic_log_file_selected', { id, fileName });
  };

  const loadMore = () => {
    track('inference_agentic_log_chunk_loaded', {
      id,
      fileName: selectedFile,
      offset: query.data?.pages.at(-1)?.nextOffset ?? 0,
      chunkSize: SERVER_LOG_CHUNK_SIZE,
    });
    void query.fetchNextPage();
  };

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
    >
      <header className="flex flex-col gap-3 border-b border-border/60 bg-muted/20 px-4 py-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex gap-3">
          <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md border border-border/60 bg-background text-muted-foreground">
            <Terminal className="size-4" aria-hidden="true" />
          </span>
          <div>
            <h2 className="font-semibold text-foreground">{t.title}</h2>
            <p className="mt-1 text-xs text-muted-foreground">{t.description}</p>
          </div>
        </div>
        <div className="grid min-w-0 gap-1 sm:w-80">
          <label className="text-xs font-medium text-muted-foreground" htmlFor="agentic-log-file">
            {t.fileLabel}
          </label>
          <Select value={selectedFile} onValueChange={selectFile}>
            <SelectTrigger id="agentic-log-file" className="w-full font-mono text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {files.map((fileName) => (
                <SelectItem key={fileName} value={fileName} className="font-mono text-xs">
                  {fileName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </header>

      <div className="flex justify-end border-b border-border/60 bg-background/40 px-4 py-2">
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
      </div>

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
        <div className="flex flex-col items-start gap-2 sm:items-end">
          {query.isFetchNextPageError ? (
            <span className="text-destructive" role="alert">
              {t.loadMoreError}
            </span>
          ) : null}
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
        </div>
      </footer>
    </section>
  );
}
