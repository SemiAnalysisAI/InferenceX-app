'use client';

import { ChevronLeft, ChevronRight, Search } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

import type { EvaluationChartData } from '@/components/evaluation/types';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { useEvalSamples } from '@/hooks/api/use-eval-samples';
import { track } from '@/lib/analytics';
import type { EvalSamplesFilter, EvalSamplesLiveContext } from '@/lib/api';

const PAGE_SIZE = 50;

interface EvalSamplesDrawerProps {
  /** The selected row from the EvaluationTable, or null when closed. */
  row: EvaluationChartData | null;
  onClose: () => void;
}

/**
 * Drawer (dialog rendered as a right-side panel) that lists every prompt the
 * model saw in this eval run, with the model's response, the gold target, and
 * a passed/failed badge derived from the canonical metric (strict-match for
 * lm-eval tasks, score>=0.5 otherwise).
 *
 * Inspired by the vLLM eval dashboard PoC
 * (credit: @khluu, @simon-mo, @robertgshaw2-redhat).
 */
export default function EvalSamplesDrawer({ row, onClose }: EvalSamplesDrawerProps) {
  const open = row !== null;
  const [filter, setFilter] = useState<EvalSamplesFilter>('all');
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  // Reset transient state whenever a new row is opened.
  useEffect(() => {
    if (!open) return;
    setFilter('all');
    setPage(0);
    setSearch('');
    setExpanded(new Set());
  }, [row?.evalResultId, open]);

  // Build a live-fetch context for unofficial runs from the row's identifying
  // fields. The hook ignores this when `evalResultId > 0` (DB-backed path).
  const liveContext = useMemo<EvalSamplesLiveContext | null>(() => {
    if (!row || row.evalResultId > 0) return null;
    const runId = extractRunIdFromUrl(row.runUrl);
    if (!runId) return null;
    return {
      runId,
      task: row.benchmark,
      model: row.model,
      framework: row.framework,
      hardware: row.hardware,
      precision: row.precision,
      specMethod: row.specDecode,
      disagg: row.disagg,
      conc: row.conc,
    };
  }, [row]);

  const { data, isLoading, isError, error } = useEvalSamples({
    evalResultId: row?.evalResultId ?? null,
    liveContext,
    filter,
    offset: page * PAGE_SIZE,
    limit: PAGE_SIZE,
  });

  // Client-side substring filter on the page slice — server-side full-text
  // search is overkill at PAGE_SIZE rows.
  const filteredSamples = useMemo(() => {
    if (!data) return [];
    const q = search.trim().toLowerCase();
    if (!q) return data.samples;
    return data.samples.filter(
      (s) =>
        (s.prompt && s.prompt.toLowerCase().includes(q)) ||
        (s.response && s.response.toLowerCase().includes(q)) ||
        (s.target && s.target.toLowerCase().includes(q)),
    );
  }, [data, search]);

  const total = data?.total ?? 0;
  const passedTotal = data?.passedTotal ?? 0;
  const failedTotal = data?.failedTotal ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const safePage = Math.min(page, totalPages - 1);

  const handleFilterChange = (next: EvalSamplesFilter) => {
    setFilter(next);
    setPage(0);
    track('evaluation_samples_filter_changed', { filter: next });
  };

  const handleToggleExpand = (docId: number) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(docId)) next.delete(docId);
      else next.add(docId);
      return next;
    });
    track('evaluation_samples_expanded', { doc_id: docId });
  };

  const handlePageChange = (delta: 1 | -1) => {
    setPage((p) => Math.max(0, Math.min(totalPages - 1, p + delta)));
    track('evaluation_samples_paged', { direction: delta > 0 ? 'next' : 'prev' });
  };

  const isUnofficial = row !== null && row.evalResultId <= 0;
  // Unofficial runs are renderable as long as we resolved a runId from the row's url.
  // If we couldn't (no run_url, malformed url, etc.), fall back to the empty-state copy below.
  const liveUnavailable = isUnofficial && liveContext === null;

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <DialogContent
        className="
          inset-x-0 bottom-0 top-auto left-auto translate-x-0 translate-y-0
          w-auto max-w-none h-auto max-h-[85vh]
          rounded-none rounded-t-lg border-t border-l-0 p-0
          grid-rows-[auto_auto_1fr_auto] gap-0
          data-[state=open]:zoom-in-100! data-[state=closed]:zoom-out-100!
          data-[state=open]:slide-in-from-left-0! data-[state=open]:slide-in-from-bottom!
          data-[state=closed]:slide-out-to-left-0! data-[state=closed]:slide-out-to-bottom!
          sm:inset-x-auto sm:right-0 sm:top-0 sm:bottom-auto sm:left-auto
          sm:w-[90vw] sm:max-w-none sm:h-screen sm:max-h-screen
          sm:rounded-none sm:border-l sm:border-t-0
          sm:data-[state=open]:slide-in-from-bottom-0! sm:data-[state=open]:slide-in-from-right!
          sm:data-[state=closed]:slide-out-to-bottom-0! sm:data-[state=closed]:slide-out-to-right!
        "
        aria-describedby={undefined}
      >
        {/* Header — `DialogContent` renders its own absolute-positioned close
            button in the top-right, so we leave room with `pr-10`. */}
        <div className="flex items-start gap-3 border-b border-border px-4 py-3 pr-10">
          <div className="min-w-0 flex-1">
            <DialogTitle className="text-sm font-semibold">
              {row ? (
                <span className="font-mono">{row.configLabel.replaceAll('\n', ' ')}</span>
              ) : (
                ''
              )}
            </DialogTitle>
            {row && (
              <div className="mt-1 text-xs text-muted-foreground">
                <span className="uppercase">{row.benchmark}</span>
                {' · '}
                <span>score {(row.score * 100).toFixed(1)}%</span>
                {' · '}
                <span>{row.date}</span>
              </div>
            )}
          </div>
        </div>

        {/* Filter chips + search */}
        <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-2">
          <FilterChip
            label="All"
            count={passedTotal + failedTotal}
            active={filter === 'all'}
            onClick={() => handleFilterChange('all')}
          />
          <FilterChip
            label="Passed"
            count={passedTotal}
            active={filter === 'passed'}
            onClick={() => handleFilterChange('passed')}
            tone="passed"
          />
          <FilterChip
            label="Failed"
            count={failedTotal}
            active={filter === 'failed'}
            onClick={() => handleFilterChange('failed')}
            tone="failed"
          />
          <div className="relative ml-auto max-w-xs flex-1">
            <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search prompt / response..."
              className="h-7 w-full rounded-md border border-border bg-transparent pl-8 pr-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
              aria-label="Search samples on this page"
            />
          </div>
        </div>

        {/* Body */}
        <div className="overflow-auto px-4 py-3">
          {liveUnavailable && (
            <p className="rounded-md border border-amber-500/40 bg-amber-500/5 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
              Per-sample data isn&apos;t available for this unofficial run — the workflow URL is
              missing or malformed.
            </p>
          )}
          {!liveUnavailable && isUnofficial && (
            <p className="mb-2 rounded-md border border-primary/40 bg-primary/5 px-3 py-1.5 text-[11px] text-primary">
              Unofficial run — samples are streamed live from the workflow artifact. Loads may take
              a few seconds.
            </p>
          )}
          {!liveUnavailable && isLoading && (
            <p className="py-8 text-center text-sm text-muted-foreground">Loading samples…</p>
          )}
          {!liveUnavailable && isError && (
            <p className="py-8 text-center text-sm text-destructive">
              Failed to load samples: {String(error)}
            </p>
          )}
          {!liveUnavailable && !isLoading && !isError && total === 0 && (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No per-sample data available for this run yet. (Older runs may not have been
              re-ingested with samples enabled.)
            </p>
          )}
          {!liveUnavailable &&
            !isLoading &&
            !isError &&
            filteredSamples.length === 0 &&
            total > 0 && (
              <p className="py-8 text-center text-sm text-muted-foreground">
                No samples on this page match &ldquo;{search}&rdquo;.
              </p>
            )}
          <ul className="space-y-2">
            {filteredSamples.map((s) => (
              <li
                key={s.docId}
                className="rounded-md border border-border/70 bg-card/30 transition-colors hover:bg-card/50"
              >
                <button
                  type="button"
                  onClick={() => handleToggleExpand(s.docId)}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left"
                  aria-expanded={expanded.has(s.docId)}
                >
                  <PassFailBadge passed={s.passed} />
                  <span className="font-mono text-[10px] text-muted-foreground tabular-nums">
                    #{s.docId}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-xs">
                    {s.prompt ?? '(no prompt)'}
                  </span>
                </button>
                {expanded.has(s.docId) && (
                  <div className="space-y-2 border-t border-border/50 px-3 py-3 text-xs">
                    <FewShotBlock demonstrations={s.demonstrations} />
                    <Block label="Prompt" value={s.prompt} />
                    {s.rawResponse !== null && s.rawResponse !== s.response ? (
                      <>
                        <Block label="Full model output" value={s.rawResponse} />
                        <Block label="Target" value={s.target} />
                        <Block label="Extracted answer" value={s.response} />
                      </>
                    ) : (
                      <>
                        <Block label="Target" value={s.target} />
                        <Block label="Model response" value={s.response} />
                      </>
                    )}
                    {Object.keys(s.metrics).length > 0 && (
                      <Block
                        label="Metrics"
                        value={Object.entries(s.metrics)
                          .map(([k, v]) => `${k} = ${v}`)
                          .join('\n')}
                      />
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>

        {/* Footer pagination */}
        <div className="flex items-center justify-between border-t border-border px-4 py-2 text-xs text-muted-foreground">
          <span>
            {total === 0
              ? '0'
              : `${safePage * PAGE_SIZE + 1}–${Math.min((safePage + 1) * PAGE_SIZE, total)}`}{' '}
            of {total}
          </span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => handlePageChange(-1)}
              disabled={safePage === 0}
              className="rounded p-1 hover:bg-muted disabled:cursor-not-allowed disabled:opacity-30"
              aria-label="Previous page"
            >
              <ChevronLeft className="size-4" />
            </button>
            <span>
              {safePage + 1} / {totalPages}
            </span>
            <button
              type="button"
              onClick={() => handlePageChange(1)}
              disabled={safePage >= totalPages - 1}
              className="rounded p-1 hover:bg-muted disabled:cursor-not-allowed disabled:opacity-30"
              aria-label="Next page"
            >
              <ChevronRight className="size-4" />
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

interface FilterChipProps {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
  tone?: 'passed' | 'failed';
}

/**
 * Pull the numeric run id out of a GitHub Actions URL.
 * Accepts both `https://github.com/owner/repo/actions/runs/12345` and
 * trailing-slash / fragment variants. Returns null on any malformed input —
 * the caller falls back to a "live unavailable" empty state when null.
 */
function extractRunIdFromUrl(url: string | undefined): string | null {
  if (!url) return null;
  const m = url.match(/\/actions\/runs\/(\d+)/);
  return m ? m[1] : null;
}

function FilterChip({ label, count, active, onClick, tone }: FilterChipProps) {
  const toneClass =
    tone === 'passed'
      ? active
        ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-700 dark:text-emerald-400'
        : 'hover:border-emerald-500/40 hover:text-emerald-700 dark:hover:text-emerald-400'
      : tone === 'failed'
        ? active
          ? 'bg-rose-500/15 border-rose-500/40 text-rose-700 dark:text-rose-400'
          : 'hover:border-rose-500/40 hover:text-rose-700 dark:hover:text-rose-400'
        : active
          ? 'bg-muted border-foreground/30 text-foreground'
          : 'hover:bg-muted/60';
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border border-border px-2.5 py-1 text-xs transition-colors ${toneClass}`}
      aria-pressed={active}
    >
      {label}
      <span className="ml-1.5 text-[10px] tabular-nums opacity-70">{count}</span>
    </button>
  );
}

function PassFailBadge({ passed }: { passed: boolean | null }) {
  if (passed === null) {
    return (
      <span className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-muted-foreground/30 text-[10px] text-muted-foreground">
        ?
      </span>
    );
  }
  return (
    <span
      className={`inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full border text-[10px] font-bold ${
        passed
          ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
          : 'border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-400'
      }`}
    >
      {passed ? '✓' : '✗'}
    </span>
  );
}

/**
 * Render the few-shot demonstration prefix.
 *
 * Demonstrations are parsed server-side from lm-eval's `arguments` JSONB; the
 * route handles both multi-turn chat-array shape and the pre-concatenated
 * single-message shape. Returns null when there are no demonstrations.
 *
 * Default-expanded so the demos are visible immediately — they're the whole
 * point of clicking a sample on a 5-shot eval.
 */
function FewShotBlock({
  demonstrations,
}: {
  demonstrations: { question: string; answer: string }[] | null;
}) {
  const [open, setOpen] = useState(true);
  if (!demonstrations || demonstrations.length === 0) return null;
  const demos = demonstrations;
  return (
    <div className="rounded-md border border-primary/40 bg-primary/5 p-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-primary hover:opacity-80"
        aria-expanded={open}
      >
        <ChevronRight
          className={`size-3.5 transition-transform ${open ? 'rotate-90' : ''}`}
          aria-hidden="true"
        />
        Few-shot examples ({demos.length})
      </button>
      {open && (
        <div className="mt-2 space-y-2">
          {demos.map((d, i) => (
            <div
              // eslint-disable-next-line react/no-array-index-key -- demo order is the only stable identifier
              key={i}
              className="rounded border border-border/40 bg-muted/30 p-2"
            >
              <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Example {i + 1} · Question
              </div>
              <pre className="mb-2 whitespace-pre-wrap font-mono text-[11px] leading-snug wrap-break-word">
                {d.question}
              </pre>
              <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Example {i + 1} · Answer
              </div>
              <pre className="whitespace-pre-wrap font-mono text-[11px] leading-snug wrap-break-word">
                {d.answer}
              </pre>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Block({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <pre className="max-h-72 overflow-auto whitespace-pre-wrap rounded border border-border/40 bg-muted/30 p-2 font-mono text-[11px] leading-snug wrap-break-word">
        {value ?? <span className="italic text-muted-foreground">(empty)</span>}
      </pre>
    </div>
  );
}
