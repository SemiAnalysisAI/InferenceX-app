/**
 * Changelog entry parsing and insertion.
 */

import { resolveFrameworkAliasesInString } from '@semianalysisai/inferencex-constants';
import postgres from 'postgres';

type Sql = ReturnType<typeof postgres>;

export interface ChangelogEntry {
  configKeys: string[];
  description: string;
  prLink: string | null;
  evalsOnly: boolean;
}

/**
 * Parse a raw changelog JSON array (from `changelog_metadata.json`) into typed entries.
 * Each item is expected to have `config-keys` (array of strings) and `description` (string).
 * PR links are extracted from the description when present as `PR: https://...`.
 * Malformed or non-object items in the array are silently skipped.
 *
 * @param raw - The parsed JSON value from the changelog metadata file (expected to be an array).
 * @returns An array of `ChangelogEntry` objects; empty if `raw` is not an array.
 */
export function parseChangelogEntries(raw: unknown): ChangelogEntry[] {
  if (!Array.isArray(raw)) return [];
  const out: ChangelogEntry[] = [];
  for (const item of raw) {
    if (typeof item !== 'object' || item === null) continue;
    const configKeys: string[] = Array.isArray(item['config-keys'])
      ? item['config-keys'].map((k: unknown) => resolveFrameworkAliasesInString(String(k)))
      : [];
    const rawDesc = item['description'];
    const description = Array.isArray(rawDesc) ? rawDesc.join('\n') : String(rawDesc ?? '');
    // PR link: prefer explicit pr-link field, fall back to inline "PR: https://..."
    const prLink =
      (item['pr-link'] ? String(item['pr-link']) : null) ??
      description.match(/\bPR:\s*(https?:\/\/\S+)/)?.[1] ??
      null;
    const evalsOnly = item['evals-only'] === true;
    out.push({ configKeys, description, prLink, evalsOnly });
  }
  return out;
}

/**
 * Returns true if any changelog entry in the given arrays is marked `evals-only: true`.
 * When a run is evals-only, its benchmark/perf data should be skipped during ingest.
 */
export function hasEvalsOnlyFlag(changelogs: Array<{ entries: ChangelogEntry[] }>): boolean {
  return changelogs.some((c) => c.entries.some((e) => e.evalsOnly));
}

/**
 * Insert changelog entries for a workflow run into the `changelog_entries` table.
 * Uses `ON CONFLICT DO NOTHING` on `(workflow_run_id, base_ref, head_ref)`, so
 * re-running the ingest for the same run is safe — existing entries are left unchanged.
 *
 * @param sql - Active `postgres` connection.
 * @param workflowRunId - DB id of the parent `workflow_runs` row.
 * @param date - ISO date string (`YYYY-MM-DD`) for the `date` column.
 * @param baseRef - The base git ref for this changelog (e.g. `"main"`).
 * @param headRef - The head git ref for this changelog (e.g. a branch or SHA).
 * @param entries - Parsed changelog entries to insert.
 * @returns The number of rows actually inserted (0 if all already existed).
 */
export async function ingestChangelogEntries(
  sql: Sql,
  workflowRunId: number,
  date: string,
  baseRef: string,
  headRef: string,
  entries: ChangelogEntry[],
): Promise<number> {
  let inserted = 0;
  for (const e of entries) {
    const [row] = await sql`
      insert into changelog_entries (
        workflow_run_id, date, base_ref, head_ref, config_keys, description, pr_link
      ) values (
        ${workflowRunId}, ${date}, ${baseRef}, ${headRef},
        ${sql.array(e.configKeys)}, ${e.description}, ${e.prLink}
      )
      on conflict (workflow_run_id, base_ref, head_ref) do nothing
      returning id
    `;
    if (row) inserted++;
  }
  return inserted;
}
