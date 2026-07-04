import { describe, expect, it } from 'vitest';

import type { DbClient } from '../connection.js';
import { escapeLikePattern, getConversation, listConversations, listDatasets } from './datasets.js';

describe('escapeLikePattern', () => {
  it('leaves plain text unchanged', () => {
    expect(escapeLikePattern('agent')).toBe('agent');
  });

  it('escapes % so it is treated as a literal percent, not a wildcard', () => {
    expect(escapeLikePattern('%')).toBe(String.raw`\%`);
    expect(escapeLikePattern('50%off')).toBe(String.raw`50\%off`);
  });

  it('escapes _ so it is treated as a literal underscore, not a wildcard', () => {
    expect(escapeLikePattern('_')).toBe(String.raw`\_`);
    expect(escapeLikePattern('conv_id')).toBe(String.raw`conv\_id`);
  });

  it('escapes backslash first to avoid double-escaping', () => {
    expect(escapeLikePattern('\\')).toBe(String.raw`\\`);
    // A backslash followed by % must become \\\% in the escaped output.
    expect(escapeLikePattern(String.raw`\%`)).toBe(String.raw`\\\%`);
  });

  it('handles mixed metacharacters', () => {
    expect(escapeLikePattern('50%_off')).toBe(String.raw`50\%\_off`);
  });

  it('returns empty string unchanged', () => {
    expect(escapeLikePattern('')).toBe('');
  });
});

/**
 * Mock DbClient: returns canned result sets in call order. Each call to the
 * tagged-template `sql` shifts the next queued rows array. The query text is
 * ignored — these tests assert the JS-side shaping/coercion, not SQL.
 */
function mockSql(queue: unknown[][]): DbClient {
  const responses = [...queue];
  return (() => Promise.resolve(responses.shift() ?? [])) as unknown as DbClient;
}

describe('listDatasets', () => {
  it('coerces conversation_count to a number', async () => {
    const sql = mockSql([
      [
        {
          id: 'a/b',
          slug: 'b',
          label: 'B',
          variant: 'full',
          conversation_count: '393',
          summary: {},
        },
      ],
    ]);
    const out = await listDatasets(sql);
    expect(out).toHaveLength(1);
    expect(out[0].conversation_count).toBe(393);
    expect(typeof out[0].conversation_count).toBe('number');
  });
});

describe('listConversations', () => {
  it('returns null when the dataset slug is unknown', async () => {
    const sql = mockSql([[]]); // datasets lookup → no rows
    expect(await listConversations(sql, 'missing')).toBeNull();
  });

  it('returns total + numerically-coerced items', async () => {
    const sql = mockSql([
      [{ id: 'ds-id' }], // datasets lookup
      [{ n: 2 }], // count
      [
        {
          conv_id: 'c1',
          models: ['m'],
          num_turns: '5',
          num_subagent_groups: '1',
          total_in: '1000',
          total_out: '200',
          total_cached: '900',
        },
      ], // items
    ]);
    const out = await listConversations(sql, 'b', { sort: 'tokens' });
    expect(out).not.toBeNull();
    expect(out!.total).toBe(2);
    expect(out!.items[0]).toMatchObject({
      conv_id: 'c1',
      num_turns: 5,
      num_subagent_groups: 1,
      total_in: 1000,
      total_out: 200,
      total_cached: 900,
    });
    expect(typeof out!.items[0].total_in).toBe('number');
  });
});

describe('getConversation', () => {
  it('returns null when the conversation is missing', async () => {
    const sql = mockSql([[]]);
    expect(await getConversation(sql, 'b', 'nope')).toBeNull();
  });

  it('coerces counts and passes through the structure', async () => {
    const structure = { blockSize: 64, nodes: [], totals: {} };
    const sql = mockSql([
      [
        {
          conv_id: 'c1',
          models: ['m'],
          num_turns: '3',
          num_subagent_groups: '0',
          total_in: '500',
          total_out: '100',
          total_cached: '450',
          structure,
        },
      ],
    ]);
    const out = await getConversation(sql, 'b', 'c1');
    expect(out).not.toBeNull();
    expect(out!.num_turns).toBe(3);
    expect(out!.total_cached).toBe(450);
    expect(out!.structure).toBe(structure);
  });
});
