/**
 * Links stored CollectiveX runs to the InferenceX changelog (`collectivex/perf-changelog.yaml`):
 * one entry per PR that changes what CollectiveX measures, selecting the cases it affects by pool
 * and optional suite, backend, mode, phase, EP size and precision. An upload names the merged PRs it
 * publishes; their entries are stored against the new run with the before and after summary of
 * every selected case the run changed, so each run records the changes it measures and each change
 * the runs that measured it.
 */

import { resultIdentity, type ResultDoc } from './results-upload';

export const CHANGELOG_REPO = 'SemiAnalysisAI/InferenceX';
export const CHANGELOG_PATH = 'collectivex/perf-changelog.yaml';
const PR_LINK = /^https:\/\/github\.com\/SemiAnalysisAI\/InferenceX\/pull\/(?<pr>[1-9]\d*)$/u;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/u;
// Changelog selector key -> the cases.json case field it matches.
const SELECTORS = {
  suites: 'suite',
  backends: 'backend',
  modes: 'mode',
  phases: 'phase',
  ep: 'ep',
  precisions: 'precision',
} as const;
type SelectorKey = keyof typeof SELECTORS;

/** The changelog, an entry, or an upload's claim to publish a PR is not valid. */
export class ChangelogError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ChangelogError';
  }
}

export interface ChangelogEntry {
  /** Position in the file, which only ever grows at the end. */
  index: number;
  date: string;
  prNumber: number;
  prLink: string;
  pools: string[];
  selectors: Partial<Record<SelectorKey, (string | number)[]>>;
  description: string;
  descriptionZh: string;
}

function stringList(value: unknown): string[] | null {
  return Array.isArray(value) && value.length > 0 && value.every((item) => typeof item === 'string')
    ? (value as string[])
    : null;
}

/** Validate the parsed YAML file; the benchmark repo's changelog.py enforces the same schema. */
export function parseChangelog(raw: unknown): ChangelogEntry[] {
  if (!Array.isArray(raw)) throw new ChangelogError(`${CHANGELOG_PATH} is not a list of entries`);
  return raw.map((item: unknown, index) => {
    const where = `${CHANGELOG_PATH} entry ${index + 1}`;
    const entry = item as Record<string, unknown> | null;
    if (typeof entry !== 'object' || entry === null)
      throw new ChangelogError(`${where} is not a mapping`);
    const rawDate = entry.date instanceof Date ? entry.date.toISOString().slice(0, 10) : entry.date;
    const prMatch = typeof entry['pr-link'] === 'string' ? PR_LINK.exec(entry['pr-link']) : null;
    const pools = stringList(entry.pools);
    const description = stringList(entry.description);
    const descriptionZh = stringList(entry['description-zh']);
    if (typeof rawDate !== 'string' || !ISO_DATE.test(rawDate) || !prMatch?.groups || !pools) {
      throw new ChangelogError(`${where} needs a YYYY-MM-DD date, a canonical pr-link and pools`);
    }
    if (!description || !descriptionZh) {
      throw new ChangelogError(`${where} needs description and description-zh lines`);
    }
    const selectors: ChangelogEntry['selectors'] = {};
    for (const key of Object.keys(SELECTORS) as SelectorKey[]) {
      if (entry[key] === undefined) continue;
      const values = entry[key];
      const kind = key === 'ep' ? 'number' : 'string';
      if (!Array.isArray(values) || values.length === 0 || values.some((v) => typeof v !== kind)) {
        throw new ChangelogError(`${where}: ${key} must be a non-empty list of ${kind}s`);
      }
      selectors[key] = values as (string | number)[];
    }
    return {
      index,
      date: rawDate,
      prNumber: Number(prMatch.groups.pr),
      prLink: entry['pr-link'] as string,
      pools,
      selectors,
      description: description.join('\n'),
      descriptionZh: descriptionZh.join('\n'),
    };
  });
}

/** One cases.json requested case. */
export interface RequestedCase {
  sku: string;
  disposition?: unknown;
  case: Record<string, unknown> & { case_id?: unknown };
}

export function requestedCases(matrix: unknown): RequestedCase[] {
  const cases = (matrix as { requested_cases?: unknown } | null)?.requested_cases;
  return Array.isArray(cases) ? (cases as RequestedCase[]) : [];
}

/** Whether the entry covers one runnable cases.json case (unsupported cases never run). */
export function entrySelects(entry: ChangelogEntry, requested: RequestedCase): boolean {
  if (
    (requested.disposition ?? 'runnable') !== 'runnable' ||
    !entry.pools.includes(requested.sku)
  ) {
    return false;
  }
  return (Object.keys(entry.selectors) as SelectorKey[]).every((key) =>
    entry.selectors[key]!.includes(requested.case[SELECTORS[key]] as string | number),
  );
}

function caseKey(sku: string, caseId: string): string {
  return JSON.stringify([sku, caseId]);
}

/** The entries of the named PRs; every PR must have at least one. */
export function entriesForPrs(entries: ChangelogEntry[], prs: number[]): ChangelogEntry[] {
  const missing = prs.filter((pr) => !entries.some((entry) => entry.prNumber === pr));
  if (missing.length > 0) {
    throw new ChangelogError(
      `no ${CHANGELOG_PATH} entry on main for ${missing.map((pr) => `#${pr}`).join(', ')}; ` +
        'the PR must be merged with its entry',
    );
  }
  return entries.filter((entry) => prs.includes(entry.prNumber));
}

/** Uploaded cases that none of the entries select, as `<sku>/<case_id>`. */
export function uncoveredCases(
  entries: ChangelogEntry[],
  matrix: unknown,
  uploaded: { sku: string; caseId: string }[],
): string[] {
  const covered = new Set(
    requestedCases(matrix)
      .filter((requested) => entries.some((entry) => entrySelects(entry, requested)))
      .map((requested) => caseKey(requested.sku, String(requested.case.case_id))),
  );
  return uploaded
    .filter((entry) => !covered.has(caseKey(entry.sku, entry.caseId)))
    .map((entry) => `${entry.sku}/${entry.caseId}`);
}

/** GET a GitHub REST path (e.g. `/repos/o/r/pulls/1`) and return its JSON. */
export type GitHubGet = (path: string) => Promise<unknown>;

export function gitHubGet(
  env: Record<string, string | undefined> = process.env,
  fetchImpl: typeof fetch = fetch,
): GitHubGet {
  return async (path) => {
    const headers: Record<string, string> = {
      Accept: 'application/vnd.github+json',
      'User-Agent': 'inferencex-app-collectivex-ingest',
    };
    if (env.GITHUB_TOKEN) headers.Authorization = `Bearer ${env.GITHUB_TOKEN}`;
    const response = await fetchImpl(`https://api.github.com${path}`, {
      headers,
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) throw new ChangelogError(`GitHub ${path} returned HTTP ${response.status}`);
    return response.json();
  };
}

/** The changelog on the repo's main branch and the commit it was read at. */
export async function fetchChangelog(
  github: GitHubGet,
  fetchText: (url: string) => Promise<string>,
  parseYaml: (text: string) => unknown,
): Promise<{ sha: string; entries: ChangelogEntry[] }> {
  const head = (await github(`/repos/${CHANGELOG_REPO}/commits/main`)) as { sha?: unknown };
  if (typeof head.sha !== 'string') throw new ChangelogError('could not resolve InferenceX main');
  const text = await fetchText(
    `https://raw.githubusercontent.com/${CHANGELOG_REPO}/${head.sha}/${CHANGELOG_PATH}`,
  );
  return { sha: head.sha, entries: parseChangelog(parseYaml(text)) };
}

/**
 * Results measure a PR only if they were measured from its code: the PR is merged, and the
 * results' commit is one of its commits (a pre-merge validation run) or contains its merge commit.
 */
export async function checkProvenance(
  github: GitHubGet,
  pr: number,
  sourceSha: string,
): Promise<void> {
  const pull = (await github(`/repos/${CHANGELOG_REPO}/pulls/${pr}`)) as {
    merged_at?: string | null;
    merge_commit_sha?: string | null;
    head?: { sha?: string };
  };
  if (!pull.merged_at || !pull.merge_commit_sha) {
    throw new ChangelogError(`#${pr} is not merged`);
  }
  if (pull.head?.sha === sourceSha) return;
  const commits = (await github(`/repos/${CHANGELOG_REPO}/pulls/${pr}/commits?per_page=250`)) as {
    sha?: string;
  }[];
  if (Array.isArray(commits) && commits.some((commit) => commit.sha === sourceSha)) return;
  const compare = (await github(
    `/repos/${CHANGELOG_REPO}/compare/${pull.merge_commit_sha}...${sourceSha}`,
  )) as { status?: string };
  if (compare.status === 'identical' || compare.status === 'ahead') return;
  throw new ChangelogError(
    `results measured at ${sourceSha.slice(0, 12)} are neither one of #${pr}'s commits ` +
      `nor contain its merge commit ${pull.merge_commit_sha.slice(0, 12)}`,
  );
}

/** What a case's result was in one run: enough to show a change without loading the document. */
export interface CaseSummary {
  run_id: string;
  status: string | null;
  kernel_generation: string | null;
  library_version: string | null;
  /** [tokens per rank, pair period p50 µs] for EP rows; empty for other suites. */
  pair_period_p50_us: [number, number][];
}

export interface CaseChange {
  sku: string;
  case_id: string;
  /** Null when the case had no result in the previous run. */
  before: CaseSummary | null;
  after: CaseSummary;
}

interface SummaryDoc extends ResultDoc {
  outcome?: { status?: unknown };
  implementation?: { kernel_generation?: unknown; library_version?: unknown };
  measurement?: { rows?: unknown };
}

function textOrNull(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

export function summarizeDoc(doc: unknown, runId: string): CaseSummary {
  const result = doc as SummaryDoc;
  const rows = Array.isArray(result.measurement?.rows) ? result.measurement.rows : [];
  const points: [number, number][] = [];
  for (const row of rows as {
    tokens_per_rank?: unknown;
    components?: { pair_period?: { percentiles_us?: { p50?: unknown } | null } | null };
  }[]) {
    const p50 = row?.components?.pair_period?.percentiles_us?.p50;
    if (typeof row?.tokens_per_rank === 'number' && typeof p50 === 'number') {
      points.push([row.tokens_per_rank, Math.round(p50 * 10) / 10]);
    }
  }
  return {
    run_id: runId,
    status: textOrNull(result.outcome?.status),
    kernel_generation: textOrNull(result.implementation?.kernel_generation),
    library_version: textOrNull(result.implementation?.library_version),
    pair_period_p50_us: points,
  };
}

function docsByCase(docs: unknown[]): Map<string, unknown> {
  const map = new Map<string, unknown>();
  for (const doc of docs) {
    const identity = resultIdentity(doc as ResultDoc | null);
    if (identity) map.set(caseKey(String(identity.sku), String(identity.caseId)), doc);
  }
  return map;
}

/**
 * The cases an entry selects whose document differs between the previous run and this one.
 * `before` is null when nothing was stored before (the first run, or a newly covered case).
 */
export function entryChanges(
  entry: ChangelogEntry,
  matrix: unknown,
  after: { runId: string; docs: unknown[] },
  before: { runId: string; docs: unknown[] } | null,
): CaseChange[] {
  const afterDocs = docsByCase(after.docs);
  const beforeDocs = before ? docsByCase(before.docs) : new Map<string, unknown>();
  const changes: CaseChange[] = [];
  for (const requested of requestedCases(matrix)) {
    if (!entrySelects(entry, requested)) continue;
    const caseId = String(requested.case.case_id);
    const key = caseKey(requested.sku, caseId);
    const doc = afterDocs.get(key);
    if (doc === undefined) continue;
    const previous = beforeDocs.get(key);
    if (previous !== undefined && JSON.stringify(previous) === JSON.stringify(doc)) continue;
    changes.push({
      sku: requested.sku,
      case_id: caseId,
      before: previous === undefined ? null : summarizeDoc(previous, before!.runId),
      after: summarizeDoc(doc, after.runId),
    });
  }
  return changes;
}

/** One cx_changelog_entries row. */
export interface ChangelogLinkRow {
  run_id: string;
  entry_index: number;
  pr_number: number;
  pr_link: string;
  date: string;
  pools: string[];
  selectors: ChangelogEntry['selectors'];
  description: string;
  description_zh: string;
  changelog_sha: string;
  changes: CaseChange[];
}

export function changelogLinkRows(
  entries: ChangelogEntry[],
  changelogSha: string,
  matrix: unknown,
  after: { runId: string; docs: unknown[] },
  before: { runId: string; docs: unknown[] } | null,
): ChangelogLinkRow[] {
  return entries.map((entry) => ({
    run_id: after.runId,
    entry_index: entry.index,
    pr_number: entry.prNumber,
    pr_link: entry.prLink,
    date: entry.date,
    pools: entry.pools,
    selectors: entry.selectors,
    description: entry.description,
    description_zh: entry.descriptionZh,
    changelog_sha: changelogSha,
    changes: entryChanges(entry, matrix, after, before),
  }));
}
