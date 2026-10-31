/**
 * Links stored runs to InferenceX `collectivex/perf-changelog.yaml`: one entry per PR that changes
 * what CollectiveX measures, selecting the affected cases by pool and optional suite, backend, mode,
 * phase, EP size and precision. An upload names the merged PRs it publishes; their entries are
 * stored against the run with the before/after of every selected case it changed.
 */

import { resultIdentity, type ResultDoc } from './results-upload';

const REPO = 'SemiAnalysisAI/InferenceX';
const PR_LINK = /^https:\/\/github\.com\/SemiAnalysisAI\/InferenceX\/pull\/(?<pr>\d+)$/u;
const SELECTORS = {
  suites: 'suite',
  backends: 'backend',
  modes: 'mode',
  phases: 'phase',
  ep: 'ep',
  precisions: 'precision',
} as const;

export interface ChangelogEntry {
  index: number;
  date: string;
  prNumber: number;
  prLink: string;
  pools: string[];
  selectors: Record<string, (string | number)[]>;
  description: string;
}

interface RequestedCase {
  sku: string;
  disposition?: unknown;
  case: Record<string, unknown>;
}

export function parseChangelog(raw: unknown): ChangelogEntry[] {
  if (!Array.isArray(raw)) throw new Error('perf-changelog.yaml is not a list');
  return raw.map((entry: Record<string, unknown>, index) => {
    const pr = PR_LINK.exec(String(entry['pr-link']))?.groups?.pr;
    if (!pr || !Array.isArray(entry.pools) || !Array.isArray(entry.description)) {
      throw new Error(`perf-changelog.yaml entry ${index + 1} is malformed`);
    }
    return {
      index,
      date: entry.date instanceof Date ? entry.date.toISOString().slice(0, 10) : String(entry.date),
      prNumber: Number(pr),
      prLink: String(entry['pr-link']),
      pools: entry.pools as string[],
      selectors: Object.fromEntries(
        Object.keys(SELECTORS)
          .filter((key) => Array.isArray(entry[key]))
          .map((key) => [key, entry[key] as (string | number)[]]),
      ),
      description: (entry.description as string[]).join('\n'),
    };
  });
}

function selects(entry: ChangelogEntry, requested: RequestedCase): boolean {
  return (
    (requested.disposition ?? 'runnable') === 'runnable' &&
    entry.pools.includes(requested.sku) &&
    Object.entries(entry.selectors).every(([key, values]) =>
      values.includes(requested.case[SELECTORS[key as keyof typeof SELECTORS]] as string | number),
    )
  );
}

function requestedCases(matrix: unknown): RequestedCase[] {
  return (matrix as { requested_cases?: RequestedCase[] } | null)?.requested_cases ?? [];
}

/** The named PRs' entries from InferenceX main. */
export async function fetchEntries(
  prs: number[],
  parseYaml: (text: string) => unknown,
): Promise<ChangelogEntry[]> {
  const url = `https://raw.githubusercontent.com/${REPO}/main/collectivex/perf-changelog.yaml`;
  const response = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`perf-changelog.yaml returned HTTP ${response.status}`);
  const entries = parseChangelog(parseYaml(await response.text()));
  const missing = prs.filter((pr) => !entries.some((entry) => entry.prNumber === pr));
  if (missing.length > 0)
    throw new Error(`no perf-changelog.yaml entry on main for #${missing.join(', #')}`);
  return entries.filter((entry) => prs.includes(entry.prNumber));
}

/** Uploaded cases none of the entries select, as `<sku>/<case_id>`. */
export function uncoveredCases(
  entries: ChangelogEntry[],
  matrix: unknown,
  uploaded: { sku: string; caseId: string }[],
): string[] {
  const covered = new Set(
    requestedCases(matrix)
      .filter((requested) => entries.some((entry) => selects(entry, requested)))
      .map((requested) => `${requested.sku}/${String(requested.case.case_id)}`),
  );
  return uploaded.map((item) => `${item.sku}/${item.caseId}`).filter((key) => !covered.has(key));
}

async function github(path: string): Promise<unknown> {
  const headers: Record<string, string> = { Accept: 'application/vnd.github+json' };
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  const response = await fetch(`https://api.github.com/repos/${REPO}${path}`, {
    headers,
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`GitHub ${path} returned HTTP ${response.status}`);
  return response.json();
}

/** The results measure the PR: it is merged, and `sha` is one of its commits or contains its merge. */
export async function checkProvenance(pr: number, sha: string): Promise<void> {
  const pull = (await github(`/pulls/${pr}`)) as { merged_at?: string; merge_commit_sha?: string };
  const merge = pull.merge_commit_sha;
  if (!pull.merged_at || !merge) throw new Error(`#${pr} is not merged`);
  const commits = (await github(`/pulls/${pr}/commits?per_page=250`)) as { sha: string }[];
  if (commits.some((commit) => commit.sha === sha)) return;
  const { status } = (await github(`/compare/${merge}...${sha}`)) as { status?: string };
  if (status !== 'identical' && status !== 'ahead') {
    throw new Error(`${sha.slice(0, 12)} is neither a #${pr} commit nor contains its merge`);
  }
}

export interface CaseSummary {
  run_id: string;
  status: string | null;
  kernel_generation: string | null;
  library_version: string | null;
  /** [tokens per rank, pair period p50 µs] per EP row; empty for other suites. */
  pair_period_p50_us: [number, number][];
}

export interface CaseChange {
  sku: string;
  case_id: string;
  before: CaseSummary | null;
  after: CaseSummary;
}

interface SummaryDoc {
  outcome?: { status?: string };
  implementation?: { kernel_generation?: string; library_version?: string };
  measurement?: {
    rows?: {
      tokens_per_rank?: number;
      components?: { pair_period?: { percentiles_us?: { p50?: number } } };
    }[];
  };
}

function summarize(doc: unknown, runId: string): CaseSummary {
  const result = doc as SummaryDoc;
  return {
    run_id: runId,
    status: result.outcome?.status ?? null,
    kernel_generation: result.implementation?.kernel_generation ?? null,
    library_version: result.implementation?.library_version ?? null,
    pair_period_p50_us: (result.measurement?.rows ?? []).flatMap((row): [number, number][] => {
      const p50 = row.components?.pair_period?.percentiles_us?.p50;
      return typeof row.tokens_per_rank === 'number' && typeof p50 === 'number'
        ? [[row.tokens_per_rank, Math.round(p50 * 10) / 10]]
        : [];
    }),
  };
}

function byCase(docs: unknown[]): Map<string, unknown> {
  const map = new Map<string, unknown>();
  for (const doc of docs) {
    const identity = resultIdentity(doc as ResultDoc | null);
    if (identity) map.set(`${String(identity.sku)}/${String(identity.caseId)}`, doc);
  }
  return map;
}

/** One cx_changelog_entries row. */
export interface ChangelogLinkRow {
  run_id: string;
  entry_index: number;
  pr_number: number;
  pr_link: string;
  date: string;
  pools: string[];
  selectors: Record<string, (string | number)[]>;
  description: string;
  changes: CaseChange[];
}

/** Each entry linked to the run, with every selected case whose document differs from `before`. */
export function linkRows(
  entries: ChangelogEntry[],
  matrix: unknown,
  after: { runId: string; docs: unknown[] },
  before: { runId: string; docs: unknown[] } | null,
): ChangelogLinkRow[] {
  const afterDocs = byCase(after.docs);
  const beforeDocs = byCase(before?.docs ?? []);
  return entries.map((entry) => ({
    run_id: after.runId,
    entry_index: entry.index,
    pr_number: entry.prNumber,
    pr_link: entry.prLink,
    date: entry.date,
    pools: entry.pools,
    selectors: entry.selectors,
    description: entry.description,
    changes: requestedCases(matrix).flatMap((requested): CaseChange[] => {
      const key = `${requested.sku}/${String(requested.case.case_id)}`;
      const doc = afterDocs.get(key);
      const previous = beforeDocs.get(key);
      if (!selects(entry, requested) || doc === undefined) return [];
      if (previous !== undefined && JSON.stringify(previous) === JSON.stringify(doc)) return [];
      return [
        {
          sku: requested.sku,
          case_id: String(requested.case.case_id),
          before: previous === undefined ? null : summarize(previous, before!.runId),
          after: summarize(doc, after.runId),
        },
      ];
    }),
  }));
}
