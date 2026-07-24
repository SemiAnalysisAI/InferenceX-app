import { describe, expect, it, vi } from 'vitest';
import { ingestChangelogEntries } from './changelog-ingest';

describe('ingestChangelogEntries', () => {
  it('updates existing metadata for the same workflow and git refs', async () => {
    const queries: string[] = [];
    const sqlMock = Object.assign(
      vi.fn((strings: TemplateStringsArray) => {
        queries.push(strings.join('?'));
        return Promise.resolve([{ id: 123 }]);
      }),
      { array: vi.fn((values: string[]) => values) },
    );

    const written = await ingestChangelogEntries(
      sqlMock as unknown as Parameters<typeof ingestChangelogEntries>[0],
      42,
      '2026-07-13',
      'main',
      'feature-sha',
      [
        {
          configKeys: ['dsr1-fp8-h100-vllm'],
          description: 'Updated benchmark description',
          prLink: 'https://github.com/SemiAnalysisAI/InferenceX/pull/2174',
          evalsOnly: false,
        },
      ],
    );

    expect(written).toBe(1);
    expect(queries).toHaveLength(1);
    expect(queries[0].replaceAll(/\s+/gu, ' ')).toContain(
      'on conflict (workflow_run_id, base_ref, head_ref) do update set date = excluded.date, config_keys = excluded.config_keys, description = excluded.description, pr_link = excluded.pr_link',
    );
  });
});
