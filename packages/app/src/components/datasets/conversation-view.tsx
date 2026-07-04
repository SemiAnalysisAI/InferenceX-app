'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';

import { Card } from '@/components/ui/card';
import { TraceFlamegraph } from '@/components/datasets/trace-flamegraph';
import { useDatasetConversation } from '@/hooks/api/use-datasets';
import { compact, formatShare } from './format';
import { Stat } from './stat';

export function ConversationView({ slug, convId }: { slug: string; convId: string }) {
  const { data, isLoading, isError } = useDatasetConversation(slug, convId);

  // Deep-link target from a request-timeline click: ?raw=<outerIdx> or ?turn=<ti>[&sa=<agentId>].
  // useSearchParams (not a one-shot window.location read) so the params are
  // present on the very first client-side navigation, not just after a reload.
  const params = useSearchParams();
  const turnRaw = params.get('turn');
  const sourceRaw = params.get('raw');
  const sourceInner = params.get('inner');
  const highlight = {
    turn: turnRaw !== null && /^\d+$/u.test(turnRaw) ? Number(turnRaw) : null,
    raw: sourceRaw !== null && /^\d+$/u.test(sourceRaw) ? Number(sourceRaw) : null,
    inner: sourceInner !== null && /^\d+$/u.test(sourceInner) ? Number(sourceInner) : null,
    agent: params.get('sa'),
  };

  if (isLoading) {
    return (
      <div className="py-12 text-center text-sm text-muted-foreground">Loading conversation…</div>
    );
  }
  if (isError || !data) {
    return (
      <div className="py-12 text-center text-sm text-destructive">
        Conversation not found.{' '}
        <Link href={`/datasets/${slug}`} className="text-primary underline">
          Back to dataset
        </Link>
      </div>
    );
  }

  const cachedPct = formatShare(data.total_cached, data.total_in);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <div className="mb-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <Link href="/datasets" className="hover:text-foreground">
            Datasets
          </Link>
          <span>/</span>
          <Link href={`/datasets/${slug}`} className="hover:text-foreground">
            {slug}
          </Link>
          <span>/</span>
          <span className="text-foreground">conversation</span>
        </div>
        <h1 className="break-all font-mono text-lg font-semibold text-foreground">
          {data.conv_id}
        </h1>
        {data.models.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-2">
            {data.models.map((m) => (
              <span
                key={m}
                className="rounded-md border border-border/40 px-2 py-0.5 text-xs text-foreground"
              >
                {m}
              </span>
            ))}
          </div>
        )}
      </div>

      <Card className="p-4">
        <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
          <Stat label="Main turns" value={String(data.num_turns)} />
          <Stat label="Subagent groups" value={String(data.num_subagent_groups)} />
          <Stat label="Input" value={`${compact(data.total_in)} tok`} />
          <Stat label="Output" value={`${compact(data.total_out)} tok`} />
          <Stat label="Cached" value={`${compact(data.total_cached)} tok`} />
          <Stat label="Cached %" value={cachedPct} />
        </dl>
      </Card>

      <Card className="p-4">
        <h2 className="mb-3 text-lg font-semibold text-foreground">Flamegraph</h2>
        <p className="mb-4 text-xs text-muted-foreground">
          One bar per turn, scaled to the largest turn. Subagent groups are collapsed by default —
          click a group to expand it. Each bar splits input into cached prefix and uncached suffix,
          plus generated output. Timestamps are elapsed from conversation start; subagent headers
          show their full active range. A colored bracket on the left groups requests in the same
          main-agent or subagent scope whose original execution intervals overlapped (ran in
          parallel).
        </p>
        <TraceFlamegraph
          structure={data.structure}
          highlightTurn={highlight.turn}
          highlightRawIndex={highlight.raw}
          highlightInnerIndex={highlight.inner}
          highlightAgentId={highlight.agent}
        />
      </Card>
    </div>
  );
}
