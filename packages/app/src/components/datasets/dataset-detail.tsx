'use client';

import { useState } from 'react';
import Link from 'next/link';

import { Card } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { DistributionCard } from '@/components/datasets/distribution-card';
import {
  useDataset,
  useDatasetConversations,
  type ConversationSort,
} from '@/hooks/api/use-datasets';
import { track } from '@/lib/analytics';
import { compact, formatPct, formatShare, perConversation } from './format';
import { Stat } from './stat';

const PAGE = 50;

const SORTS: { value: ConversationSort; label: string }[] = [
  { value: 'tokens', label: 'Total input ↓' },
  { value: 'turns', label: 'Turns ↓' },
  { value: 'subagents', label: 'Subagent groups ↓' },
  { value: 'id', label: 'Conversation ID' },
];

export function DatasetDetail({ slug }: { slug: string }) {
  const { data: dataset, isLoading, isError } = useDataset(slug);
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<ConversationSort>('tokens');
  const [page, setPage] = useState(0);

  const { data: convs, isFetching } = useDatasetConversations({
    slug,
    search,
    sort,
    limit: PAGE,
    offset: page * PAGE,
  });

  if (isLoading) {
    return <div className="py-12 text-center text-sm text-muted-foreground">Loading dataset…</div>;
  }
  if (isError || !dataset) {
    return (
      <div className="py-12 text-center text-sm text-destructive">
        Dataset not found.{' '}
        <Link href="/datasets" className="text-primary underline">
          Back to datasets
        </Link>
      </div>
    );
  }

  const s = dataset.summary ?? {};
  const cd = dataset.chart_data ?? {};
  const total = convs?.total ?? 0;
  const pageCount = Math.ceil(total / PAGE);

  return (
    <div className="flex flex-col gap-6">
      {/* header */}
      <div>
        <div className="mb-1 flex items-center gap-2">
          <Link href="/datasets" className="text-xs text-muted-foreground hover:text-foreground">
            ← Datasets
          </Link>
        </div>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h1 className="text-2xl font-semibold text-foreground">{dataset.label}</h1>
          <div className="flex items-center gap-2 text-xs">
            <span className="rounded-full border border-border/50 px-2 py-0.5 uppercase tracking-wide text-muted-foreground">
              {dataset.variant}
            </span>
            {dataset.hf_url && (
              <a
                href={dataset.hf_url}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => track('datasets_hf_link_clicked', { slug })}
                className="text-primary hover:underline"
              >
                View on HuggingFace ↗
              </a>
            )}
          </div>
        </div>
        {dataset.description && (
          <p className="mt-2 max-w-3xl text-sm text-muted-foreground">{dataset.description}</p>
        )}
      </div>

      {/* summary stats */}
      <Card className="p-4">
        <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-8">
          <Stat label="Conversations" value={dataset.conversation_count.toLocaleString()} />
          <Stat
            label="Median requests / convo"
            value={perConversation(s.medianRequestsPerConversation)}
          />
          <Stat
            label="Mean requests / convo"
            value={perConversation(s.meanRequestsPerConversation)}
          />
          <Stat label="Main turns" value={compact(s.mainTurns ?? 0)} />
          <Stat
            label="Median subagents / trace"
            value={perConversation(s.medianSubagentsPerTrace)}
          />
          <Stat label="Mean subagents / trace" value={perConversation(s.meanSubagentsPerTrace)} />
          <Stat label="Cached input" value={formatPct(s.cachedPct)} />
          <Stat label="Total tokens" value={compact((s.totalIn ?? 0) + (s.totalOut ?? 0))} />
        </dl>
        {s.modelMix && Object.keys(s.modelMix).length > 0 && (
          <div className="mt-4 border-t border-border/40 pt-3">
            <div className="mb-1.5 text-xs font-medium text-muted-foreground">
              Model mix (turns)
            </div>
            <div className="flex flex-wrap gap-2">
              {Object.entries(s.modelMix)
                .toSorted((a, b) => b[1] - a[1])
                .map(([model, count]) => (
                  <span
                    key={model}
                    className="rounded-md border border-border/40 px-2 py-0.5 text-xs text-foreground"
                  >
                    {model} <span className="text-muted-foreground">{compact(count)}</span>
                  </span>
                ))}
            </div>
          </div>
        )}
      </Card>

      {/* distribution cards */}
      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold text-foreground">Distributions</h2>
        <div className="grid gap-4 lg:grid-cols-2">
          <DistributionCard
            title="Input tokens per turn"
            unit="tokens"
            scale="log"
            distribution={cd.inputTokensPerTurn}
          />
          <DistributionCard
            title="Output tokens per turn"
            unit="tokens"
            scale="log"
            distribution={cd.outputTokensPerTurn}
          />
          <DistributionCard
            title="Uncached input tokens per request"
            unit="tokens"
            scale="log"
            distribution={cd.uncachedInputTokensPerTurn}
          />
          <DistributionCard
            title="Turns per conversation"
            unit="turns"
            distribution={cd.turnsPerConversation}
          />
          <DistributionCard
            title="Subagent request ISL"
            subtitle="Inner subagent requests only"
            unit="tokens"
            scale="log"
            distribution={cd.subagentInputTokensPerRequest}
          />
          <DistributionCard
            title="Subagent request OSL"
            subtitle="Inner subagent requests only"
            unit="tokens"
            scale="log"
            distribution={cd.subagentOutputTokensPerRequest}
          />
          <DistributionCard
            title="Cached fraction per turn"
            unit=""
            distribution={cd.cachedFractionPerTurn}
            formatValue={formatPct}
          />
        </div>
      </section>

      {/* conversation list */}
      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-foreground">
            Conversations{' '}
            <span className="text-sm font-normal text-muted-foreground">({total})</span>
          </h2>
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(0);
              }}
              placeholder="Search by ID…"
              className="h-8 w-40 rounded-md border border-border/40 bg-background px-2 text-xs outline-none focus:border-primary"
            />
            <Select
              value={sort}
              onValueChange={(v) => {
                setSort(v as ConversationSort);
                setPage(0);
                track('datasets_conversations_sorted', { mode: v });
              }}
            >
              <SelectTrigger className="h-8 w-[12rem] text-xs" aria-label="Sort conversations">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SORTS.map((o) => (
                  <SelectItem key={o.value} value={o.value} className="text-xs">
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <Card className="overflow-hidden p-0">
          <table className="w-full text-sm">
            <thead className="border-b border-border/40 bg-muted/30 text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Conversation</th>
                <th className="px-3 py-2 text-right font-medium">Turns</th>
                <th className="px-3 py-2 text-right font-medium">Subagents</th>
                <th className="px-3 py-2 text-right font-medium">Input</th>
                <th className="px-3 py-2 text-right font-medium">Output</th>
                <th className="px-3 py-2 text-right font-medium">Cached</th>
              </tr>
            </thead>
            <tbody>
              {(convs?.items ?? []).map((c) => {
                const cachedPct = formatShare(c.total_cached, c.total_in);
                return (
                  <tr
                    key={c.conv_id}
                    className="border-b border-border/20 last:border-0 hover:bg-accent/40"
                  >
                    <td className="px-3 py-2">
                      <Link
                        href={`/datasets/${slug}/conversations/${encodeURIComponent(c.conv_id)}`}
                        onClick={() => track('datasets_conversation_clicked', { slug })}
                        className="font-mono text-xs text-primary hover:underline"
                      >
                        {c.conv_id.slice(0, 20)}…
                      </Link>
                      {c.models.length > 0 && (
                        <span className="ml-2 text-[11px] text-muted-foreground">
                          {c.models.length} model{c.models.length === 1 ? '' : 's'}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{c.num_turns}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{c.num_subagent_groups}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{compact(c.total_in)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{compact(c.total_out)}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                      {cachedPct}
                    </td>
                  </tr>
                );
              })}
              {!isFetching && (convs?.items.length ?? 0) === 0 && (
                <tr>
                  <td colSpan={6} className="px-3 py-8 text-center text-xs text-muted-foreground">
                    No conversations match.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </Card>

        {pageCount > 1 && (
          <div className="flex items-center justify-center gap-3 text-xs">
            <button
              type="button"
              disabled={page === 0}
              onClick={() => {
                const next = Math.max(0, page - 1);
                track('datasets_conversations_page_changed', { direction: 'prev', page: next });
                setPage(next);
              }}
              className="rounded-md border border-border/40 px-2 py-1 hover:bg-accent disabled:opacity-30"
            >
              ← Prev
            </button>
            <span className="text-muted-foreground">
              Page {page + 1} of {pageCount}
            </span>
            <button
              type="button"
              disabled={page >= pageCount - 1}
              onClick={() => {
                const next = Math.min(pageCount - 1, page + 1);
                track('datasets_conversations_page_changed', { direction: 'next', page: next });
                setPage(next);
              }}
              className="rounded-md border border-border/40 px-2 py-1 hover:bg-accent disabled:opacity-30"
            >
              Next →
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
