import { describe, expect, it, vi } from 'vitest';

import { getChangelogDatesInRange } from './workflow-info';

const changelog = (date: string, id: number, description: string) => ({
  workflow_run_id: id,
  date,
  base_ref: 'main',
  head_ref: `h${id}`,
  config_keys: ['k'],
  description,
  pr_link: null,
  append_only: false,
});
const run = (date: string, id: number, created_at: string) => ({
  github_run_id: id,
  name: 'r',
  conclusion: 'success',
  run_attempt: 1,
  html_url: null,
  created_at,
  date,
});
const runConfig = (date: string, id: number, model: string) => ({
  date,
  github_run_id: id,
  run_started_at: null,
  html_url: null,
  head_sha: null,
  model,
  precision: 'fp8',
  hardware: 'h100',
  framework: 'sglang',
  spec_method: 'none',
  disagg: false,
});

function mockSql(results: { changelogs: unknown[]; runs: unknown[]; runConfigs: unknown[] }) {
  const texts: string[] = [];
  const values: unknown[][] = [];
  const sql = vi.fn((strings: TemplateStringsArray, ...vals: unknown[]) => {
    const text = strings.join('?').replaceAll(/\s+/gu, ' ').trim();
    if (!text.startsWith('SELECT')) return { fragment: text };
    texts.push(text);
    values.push(vals);
    if (text.includes('FROM changelog_entries')) return Promise.resolve(results.changelogs);
    if (text.includes('FROM benchmark_results')) return Promise.resolve(results.runConfigs);
    return Promise.resolve(results.runs);
  });
  return { sql: sql as unknown as Parameters<typeof getChangelogDatesInRange>[0], texts, values };
}

describe('getChangelogDatesInRange', () => {
  it('groups per date in order and drops dates without changelogs', async () => {
    const { sql, texts, values } = mockSql({
      changelogs: [
        changelog('2026-01-01', 1, 'a'),
        changelog('2026-01-01', 2, 'b'),
        changelog('2026-01-03', 3, 'c'),
      ],
      runs: [
        run('2026-01-01', 2, '2026-01-01T01:00:00Z'),
        run('2026-01-01', 1, '2026-01-01T02:00:00Z'),
        run('2026-01-03', 3, '2026-01-03T01:00:00Z'),
      ],
      runConfigs: [
        runConfig('2026-01-03', 3, 'm3'),
        runConfig('2026-01-01', 1, 'm1'),
        runConfig('2026-01-01', 2, 'm2'),
      ],
    });

    const result = await getChangelogDatesInRange(
      sql,
      '2026-01-01',
      '2026-01-04',
      'agentic_traces',
    );

    expect(result.map((d) => d.date)).toEqual(['2026-01-01', '2026-01-03']);
    expect(result[0]!.changelogs.map((c) => c.description)).toEqual(['a', 'b']);
    expect(result[0]!.runs.map((r) => r.github_run_id)).toEqual([2, 1]);
    expect(result[0]!.runConfigs.map((r) => r.model)).toEqual(['m1', 'm2']);
    expect(result[0]!.runConfigs[0]).not.toHaveProperty('date');
    expect(result[1]!.runs.map((r) => r.github_run_id)).toEqual([3]);
    expect(result[1]!.runConfigs.map((r) => r.model)).toEqual(['m3']);

    expect(texts[0]).toContain('cl.date BETWEEN ?::date AND ?::date');
    expect(values[0]).toEqual(['2026-01-01', '2026-01-04']);
    const runsText = texts.find((t) => t.includes('FROM latest_workflow_runs WHERE'))!;
    expect(runsText).toContain('ORDER BY date ASC, created_at ASC');
    expect(texts.filter((t) => t.includes('= ANY(?::date[])'))).toHaveLength(2);
    expect(values.slice(1)).toEqual(expect.arrayContaining([[['2026-01-01', '2026-01-03']]]));
  });

  it('skips the run queries when no date has changelogs', async () => {
    const { sql, texts } = mockSql({
      changelogs: [],
      runs: [run('2026-01-02', 9, 'x')],
      runConfigs: [],
    });
    expect(await getChangelogDatesInRange(sql, '2026-01-01', '2026-01-04')).toEqual([]);
    expect(texts).toHaveLength(1);
  });
});
