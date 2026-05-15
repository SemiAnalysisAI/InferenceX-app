import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { mockGetDb, sqlControl } = vi.hoisted(() => {
  let response: unknown[] = [];
  let shouldThrow = false;
  const sql = ((_strings: TemplateStringsArray, ..._values: unknown[]) => {
    if (shouldThrow) return Promise.reject(new Error('boom'));
    return Promise.resolve(response);
  }) as unknown as ReturnType<() => unknown>;
  return {
    mockGetDb: vi.fn(() => sql),
    sqlControl: {
      setResponse(rows: unknown[]) {
        response = rows;
      },
      throwOnNext() {
        shouldThrow = true;
      },
      reset() {
        response = [];
        shouldThrow = false;
      },
    },
  };
});

vi.mock('@semianalysisai/inferencex-db/connection', () => ({
  getDb: mockGetDb,
}));

import { GET } from './route';

beforeEach(() => {
  sqlControl.reset();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('GET /api/v1/feedback/list', () => {
  it('returns rows with the expected ciphertext-only shape', async () => {
    sqlControl.setResponse([
      {
        id: '42',
        created_at: '2026-05-12T10:00:00Z',
        doing_well_ciphertext: 'AAAA',
        doing_poorly_ciphertext: null,
        want_to_see_ciphertext: 'BBBB',
        user_agent_ciphertext: 'CCCC',
        page_path_ciphertext: 'DDDD',
      },
    ]);
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.rows).toHaveLength(1);
    const r = body.rows[0];
    expect(r.id).toBe('42');
    expect(r.created_at).toBe('2026-05-12T10:00:00Z');
    expect(r.doing_well_ciphertext).toBe('AAAA');
    expect(r.user_agent_ciphertext).toBe('CCCC');
    expect(r.page_path_ciphertext).toBe('DDDD');
    expect(r.user_agent).toBeUndefined();
    expect(r.page_path).toBeUndefined();
  });

  it('returns an empty array when the table is empty', async () => {
    sqlControl.setResponse([]);
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.rows).toEqual([]);
  });

  it('returns 500 when the query throws', async () => {
    sqlControl.throwOnNext();
    const res = await GET();
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe('storage error');
  });
});
