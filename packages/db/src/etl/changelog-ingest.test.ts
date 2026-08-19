import { describe, expect, it, vi } from 'vitest';
import {
  hasAppendOnlyFlag,
  ingestChangelogEntries,
  parseChangelogEntries,
} from './changelog-ingest';

describe('append-only changelog metadata', () => {
  it('parses the marker and recognizes an all-append-only run', () => {
    const entries = parseChangelogEntries([
      {
        'config-keys': ['dsv4-fp4-b300-vllm-mtp'],
        description: ['Add concurrency 192'],
        'pr-link': 'https://github.com/SemiAnalysisAI/InferenceX/pull/2600',
        'append-only': true,
      },
    ]);

    expect(entries[0]).toMatchObject({ appendOnly: true, evalsOnly: false });
    expect(hasAppendOnlyFlag([{ entries }])).toBe(true);
  });

  it('rejects mixing append-only and regular entries in one run', () => {
    const entries = parseChangelogEntries([
      { 'config-keys': ['dsv4-fp4-b300-vllm-mtp'], 'append-only': true },
      { 'config-keys': ['dsv4-fp4-h200-vllm-mtp'] },
    ]);

    expect(() => hasAppendOnlyFlag([{ entries }])).toThrow(
      'append-only changelog entries cannot be mixed with regular entries',
    );
  });
});

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
          appendOnly: true,
        },
      ],
    );

    expect(written).toBe(1);
    expect(queries).toHaveLength(1);
    expect(queries[0].replaceAll(/\s+/gu, ' ')).toContain(
      'on conflict (workflow_run_id, base_ref, head_ref) do update set date = excluded.date, config_keys = excluded.config_keys, description = excluded.description, pr_link = excluded.pr_link, append_only = excluded.append_only',
    );
  });
});
