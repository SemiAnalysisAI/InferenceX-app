import { resolveFrameworkAliasesInString } from '@semianalysisai/inferencex-constants';
import type postgres from 'postgres';

type Sql = ReturnType<typeof postgres>;

export interface ChangelogEntry {
  configKeys: string[];
  description: string;
  prLink: string | null;
  evalsOnly: boolean;
  appendOnly: boolean;
}

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
    const prLink =
      (item['pr-link'] ? String(item['pr-link']) : null) ??
      description.match(/\bPR:\s*(?<url>https?:\/\/\S+)/u)?.[1] ??
      null;
    const evalsOnly = item['evals-only'] === true;
    const appendOnly = item['append-only'] === true;
    out.push({ configKeys, description, prLink, evalsOnly, appendOnly });
  }
  return out;
}

export function hasEvalsOnlyFlag(changelogs: { entries: ChangelogEntry[] }[]): boolean {
  return changelogs.some((c) => c.entries.some((e) => e.evalsOnly));
}

export function hasAppendOnlyFlag(changelogs: { entries: ChangelogEntry[] }[]): boolean {
  const entries = changelogs.flatMap((changelog) => changelog.entries);
  const appendOnlyEntries = entries.filter((entry) => entry.appendOnly);
  if (appendOnlyEntries.length > 0 && appendOnlyEntries.length !== entries.length) {
    throw new Error('append-only changelog entries cannot be mixed with regular entries');
  }
  return appendOnlyEntries.length > 0;
}

export async function ingestChangelogEntries(
  sql: Sql,
  workflowRunId: number,
  date: string,
  baseRef: string,
  headRef: string,
  entries: ChangelogEntry[],
): Promise<number> {
  let written = 0;
  for (const e of entries) {
    const [row] = await sql`
      insert into changelog_entries (
        workflow_run_id, date, base_ref, head_ref, config_keys, description, pr_link, append_only
      ) values (
        ${workflowRunId}, ${date}, ${baseRef}, ${headRef},
        ${sql.array(e.configKeys)}, ${e.description}, ${e.prLink}, ${e.appendOnly}
      )
      on conflict (workflow_run_id, base_ref, head_ref)
      do update set
        date = excluded.date,
        config_keys = excluded.config_keys,
        description = excluded.description,
        pr_link = excluded.pr_link,
        append_only = excluded.append_only
      returning id
    `;
    if (row) written++;
  }
  return written;
}
