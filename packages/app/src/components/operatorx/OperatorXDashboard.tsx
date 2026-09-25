'use client';

import { ExternalLink, Loader2 } from 'lucide-react';
import { useMemo, useState } from 'react';

import { Card } from '@/components/ui/card';
import { Heading } from '@/components/ui/heading';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SearchableSelect, type SearchableSelectGroup } from '@/components/ui/searchable-select';
import { useOperatorXDataset, useOperatorXRuns } from '@/hooks/api/use-operatorx';
import { useClientSearch } from '@/hooks/useClientSearch';
import { replaceClientSearch } from '@/lib/client-navigation';
import { useLocale } from '@/lib/use-locale';
import type { OperatorXRunRef } from '@semianalysisai/inferencex-db/operatorx/bundle';
import type {
  OperatorXDataset,
  OperatorXResult,
  OperatorXStatus,
} from '@semianalysisai/inferencex-db/operatorx/normalize';

import { formatDate, GITHUB_REPO_URL, STATUS_CLASS, STATUS_ORDER } from './format';
import { ResultDetail } from './ResultDetail';
import { ResultsTable } from './ResultsTable';
import { STRINGS, statusLabel, type OperatorXStrings } from './strings';

const ALL = 'all';

function Field({ id, label, children }: { id: string; label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0 space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
    </div>
  );
}

function Select({
  id,
  value,
  options,
  onChange,
  allLabel,
}: {
  id: string;
  value: string;
  options: string[];
  onChange: (v: string) => void;
  allLabel: string;
}) {
  const groups: SearchableSelectGroup[] = [
    {
      label: '',
      options: [{ value: ALL, label: allLabel }, ...options.map((o) => ({ value: o, label: o }))],
    },
  ];
  return (
    <SearchableSelect
      triggerId={id}
      groups={groups}
      value={value}
      onValueChange={onChange}
      size="sm"
      searchable={options.length > 8}
    />
  );
}

function selectRun(id: string) {
  const params = new URLSearchParams(window.location.search);
  params.set('run', id);
  replaceClientSearch(params);
}

function runLabel(run: OperatorXRunRef, t: OperatorXStrings): string {
  const plan = run.plan;
  const parts = [
    `#${run.run_id}`,
    plan ? `${plan.pool} · ${plan.mode === 'counters' ? t.counters : t.timing}` : null,
    plan ? plan.testlists.join(', ') : null,
    run.source_branch,
  ];
  return parts.filter(Boolean).join(' · ') + (run.unavailable ? ` (${t.unavailable})` : '');
}

/** Default run: newest available timing run, else newest available run. */
function defaultRun(runs: OperatorXRunRef[]): string | null {
  const available = runs.filter((r) => !r.unavailable && r.plan);
  return (
    (available.find((r) => r.plan?.mode === 'timing') ?? available[0] ?? runs[0])?.run_id ?? null
  );
}

function RunOverview({ data, t }: { data: OperatorXDataset; t: OperatorXStrings }) {
  const { run } = data;
  const image =
    typeof run.environment?.container_image === 'string' ? run.environment.container_image : null;
  const meta: [string, React.ReactNode][] = [
    [t.pool, run.plan?.pool ?? '—'],
    [t.cluster, run.clusters.join(', ') || '—'],
    [t.testlist, run.testlists.join(', ') || '—'],
    [t.branch, run.sourceBranch ?? '—'],
    [
      t.commit,
      <a
        key="c"
        className="font-mono underline-offset-2 hover:underline"
        href={`${GITHUB_REPO_URL}/commit/${run.sourceSha}`}
        target="_blank"
        rel="noreferrer"
      >
        {run.sourceSha.slice(0, 9)}
      </a>,
    ],
    [t.created, formatDate(run.generatedAt)],
  ];
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <span className="rounded-md border border-border/60 px-2.5 py-1 text-sm tabular-nums">
          {t.requested} <b className="font-semibold">{run.counts.requested.toLocaleString()}</b>
        </span>
        {STATUS_ORDER.map((s) => (
          <span
            key={s}
            className={`rounded-md border px-2.5 py-1 text-sm tabular-nums ${STATUS_CLASS[s]}`}
          >
            {statusLabel(t, s)} <b className="font-semibold">{run.counts[s].toLocaleString()}</b>
          </span>
        ))}
      </div>
      <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-3 lg:grid-cols-6">
        {meta.map(([k, v]) => (
          <div key={k} className="min-w-0">
            <dt className="text-xs text-muted-foreground">{k}</dt>
            <dd className="truncate">{v}</dd>
          </div>
        ))}
      </dl>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
        {image && (
          <span className="font-mono break-all">
            {t.image}: {image}
          </span>
        )}
        <a
          className="inline-flex items-center gap-1 hover:text-foreground"
          href={`${GITHUB_REPO_URL}/actions/runs/${run.runId}`}
          target="_blank"
          rel="noreferrer"
        >
          {t.actionsRun} <ExternalLink className="size-3" />
        </a>
      </div>
      {run.plan?.mode === 'counters' && (
        <p className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-sm">
          {t.countersNote}
        </p>
      )}
    </div>
  );
}

function RunResults({ runId, t }: { runId: string; t: OperatorXStrings }) {
  const query = useOperatorXDataset(runId);
  const [opType, setOpType] = useState(ALL);
  const [testlist, setTestlist] = useState(ALL);
  const [backend, setBackend] = useState(ALL);
  const [status, setStatus] = useState(ALL);
  const [text, setText] = useState('');
  const [selected, setSelected] = useState<number | null>(null);

  const results = query.data?.results;
  const filtered = useMemo(() => {
    const needle = text.trim().toLowerCase();
    return (results ?? []).filter(
      (r) =>
        (opType === ALL || r.opType === opType) &&
        (testlist === ALL || r.testlist === testlist) &&
        (backend === ALL || r.backend === backend) &&
        (status === ALL || r.status === status) &&
        (!needle ||
          [r.shape, r.precision, r.kernel, r.name, r.message].some((f) =>
            f?.toLowerCase().includes(needle),
          )),
    );
  }, [results, opType, testlist, backend, status, text]);

  if (query.isLoading)
    return (
      <Card className="min-h-60 items-center justify-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
        <p className="mt-3 text-sm text-muted-foreground">{t.loadingRun}</p>
      </Card>
    );
  if (query.error || !query.data)
    return (
      <Card className="border-destructive">
        <p className="text-sm">{t.runError}</p>
        <p className="mt-1 text-xs text-destructive">{query.error?.message}</p>
      </Card>
    );

  const run = query.data.run;
  const detail: OperatorXResult | undefined =
    selected === null ? undefined : query.data.results[selected];
  return (
    <>
      <Card>
        <RunOverview data={query.data} t={t} />
      </Card>
      <Card className="space-y-4">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          <Field id="opx-op" label={t.operator}>
            <Select
              id="opx-op"
              value={opType}
              options={run.opTypes}
              onChange={setOpType}
              allLabel={t.all}
            />
          </Field>
          <Field id="opx-testlist" label={t.testlist}>
            <Select
              id="opx-testlist"
              value={testlist}
              options={run.testlists}
              onChange={setTestlist}
              allLabel={t.all}
            />
          </Field>
          <Field id="opx-backend" label={t.backend}>
            <Select
              id="opx-backend"
              value={backend}
              options={run.backends}
              onChange={setBackend}
              allLabel={t.all}
            />
          </Field>
          <Field id="opx-status" label={t.status}>
            <SearchableSelect
              triggerId="opx-status"
              size="sm"
              value={status}
              onValueChange={setStatus}
              groups={[
                {
                  label: '',
                  options: [
                    { value: ALL, label: t.all },
                    ...STATUS_ORDER.map((s: OperatorXStatus) => ({
                      value: s,
                      label: statusLabel(t, s),
                    })),
                  ],
                },
              ]}
            />
          </Field>
          <Field id="opx-search" label={t.search}>
            <Input
              id="opx-search"
              value={text}
              onChange={(e) => setText(e.target.value)}
              className="h-8"
            />
          </Field>
        </div>
        <ResultsTable results={filtered} t={t} selected={selected} onSelect={setSelected} />
      </Card>
      {detail && (
        <ResultDetail runId={runId} result={detail} t={t} onClose={() => setSelected(null)} />
      )}
    </>
  );
}

export default function OperatorXDashboard() {
  const t = STRINGS[useLocale()];
  const runsQuery = useOperatorXRuns();
  const search = useClientSearch();
  const [pool, setPool] = useState(ALL);
  const [mode, setMode] = useState(ALL);

  const runs = runsQuery.data?.runs ?? [];
  const pools = useMemo(
    () => [...new Set(runs.map((r) => r.plan?.pool).filter((p): p is string => Boolean(p)))].sort(),
    [runs],
  );
  const visible = runs.filter(
    (r) => (pool === ALL || r.plan?.pool === pool) && (mode === ALL || r.plan?.mode === mode),
  );
  const requested = new URLSearchParams(search).get('run');
  const runId =
    requested && runs.some((r) => r.run_id === requested)
      ? requested
      : defaultRun(visible.length > 0 ? visible : runs);

  const runGroups: SearchableSelectGroup[] = useMemo(() => {
    const byDay = new Map<string, OperatorXRunRef[]>();
    for (const r of visible) {
      const day = r.generated_at.slice(0, 10);
      byDay.set(day, [...(byDay.get(day) ?? []), r]);
    }
    return [...byDay].map(([day, list]) => ({
      label: day,
      options: list.map((r) => ({ value: r.run_id, label: runLabel(r, t) })),
    }));
  }, [visible, t]);

  return (
    <div className="space-y-4" data-testid="operatorx-dashboard">
      <Card className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="max-w-3xl space-y-1">
            <Heading as="h1" level="section">
              {t.title}
            </Heading>
            <p className="text-sm text-muted-foreground">{t.description}</p>
          </div>
          {runsQuery.data && (
            <span className="rounded-md border border-border/60 px-2 py-1 font-mono text-xs text-muted-foreground">
              {t.source}: {runsQuery.data.source}
            </span>
          )}
        </div>
        {runsQuery.isLoading ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> {t.loadingRuns}
          </p>
        ) : runsQuery.error ? (
          <p className="text-sm text-destructive">
            {t.runsError} {runsQuery.error.message}
          </p>
        ) : runs.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t.noRuns}</p>
        ) : (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,1fr)_12rem_10rem]">
            <Field id="opx-run" label={t.run}>
              <SearchableSelect
                triggerId="opx-run"
                size="sm"
                groups={runGroups}
                value={runId ?? ''}
                onValueChange={selectRun}
                searchable
              />
            </Field>
            <Field id="opx-pool" label={t.pool}>
              <Select
                id="opx-pool"
                value={pool}
                options={pools}
                onChange={setPool}
                allLabel={t.allPools}
              />
            </Field>
            <Field id="opx-mode" label={t.mode}>
              <SearchableSelect
                triggerId="opx-mode"
                size="sm"
                value={mode}
                onValueChange={setMode}
                groups={[
                  {
                    label: '',
                    options: [
                      { value: ALL, label: t.allModes },
                      { value: 'timing', label: t.timing },
                      { value: 'counters', label: t.counters },
                    ],
                  },
                ]}
              />
            </Field>
          </div>
        )}
      </Card>
      {runId && <RunResults key={runId} runId={runId} t={t} />}
    </div>
  );
}
