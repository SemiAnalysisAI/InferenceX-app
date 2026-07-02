'use client';

import Link from 'next/link';

import { Card } from '@/components/ui/card';
import { useDatasets, type DatasetRecord } from '@/hooks/api/use-datasets';
import { track } from '@/lib/analytics';
import { compact, formatPct, perConversation } from './format';

function DatasetCard({ d }: { d: DatasetRecord }) {
  const s = d.summary ?? {};
  const cachedPct = formatPct(s.cachedPct);
  return (
    <Link
      href={`/datasets/${d.slug}`}
      onClick={() => track('datasets_card_clicked', { slug: d.slug })}
      className="block transition-colors hover:[&_*]:border-primary/40"
    >
      <Card className="h-full p-4 transition-colors hover:border-primary/40">
        <div className="mb-1 flex items-baseline justify-between gap-2">
          <h3 className="text-base font-semibold text-foreground">{d.label}</h3>
          <span className="rounded-full border border-border/50 px-2 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
            {d.variant}
          </span>
        </div>
        {d.description && (
          <p className="mb-3 line-clamp-2 text-xs text-muted-foreground">{d.description}</p>
        )}
        <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
          <Stat label="Conversations" value={d.conversation_count.toLocaleString()} />
          <Stat
            label="Median requests / convo"
            value={perConversation(s.medianRequestsPerConversation)}
          />
          <Stat
            label="Mean requests / convo"
            value={perConversation(s.meanRequestsPerConversation)}
          />
          <Stat label="Main turns" value={compact(s.mainTurns ?? 0)} />
          <Stat label="Subagent groups" value={compact(s.subagentGroups ?? 0)} />
          <Stat label="Cached input" value={cachedPct} />
          <Stat label="Total input" value={`${compact(s.totalIn ?? 0)} tok`} />
          <Stat label="Total output" value={`${compact(s.totalOut ?? 0)} tok`} />
        </dl>
        <div className="mt-3 text-xs font-medium text-primary">View dataset →</div>
      </Card>
    </Link>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="tabular-nums font-medium text-foreground">{value}</dd>
    </div>
  );
}

export function DatasetList() {
  const { data, isLoading, isError } = useDatasets();

  if (isLoading) {
    return <div className="py-12 text-center text-sm text-muted-foreground">Loading datasets…</div>;
  }
  if (isError || !data) {
    return (
      <div className="py-12 text-center text-sm text-destructive">Failed to load datasets.</div>
    );
  }
  if (data.length === 0) {
    return (
      <div className="py-12 text-center text-sm text-muted-foreground">
        No datasets ingested yet.
      </div>
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {data.map((d) => (
        <DatasetCard key={d.id} d={d} />
      ))}
    </div>
  );
}
