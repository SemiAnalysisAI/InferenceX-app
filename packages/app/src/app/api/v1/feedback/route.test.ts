import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { mockGetWriteDb, sqlCalls } = vi.hoisted(() => {
  const calls: { text: string; values: unknown[] }[] = [];
  let insertShouldThrow = false;
  const sql = ((strings: TemplateStringsArray, ...values: unknown[]) => {
    const text = strings.join('?');
    calls.push({ text, values });
    if (text.includes('user_feedback')) {
      if (insertShouldThrow) return Promise.reject(new Error('boom'));
      return Promise.resolve([]);
    }
    return Promise.resolve([]);
  }) as unknown as ReturnType<() => unknown>;
  return {
    mockGetWriteDb: vi.fn(() => sql),
    sqlCalls: {
      calls,
      reset() {
        calls.length = 0;
        insertShouldThrow = false;
      },
      throwOnInsert() {
        insertShouldThrow = true;
      },
    },
  };
});

vi.mock('@semianalysisai/inferencex-db/connection', () => ({
  getWriteDb: mockGetWriteDb,
}));

import { POST } from './route';

const KEY_B64 = Buffer.from(new Uint8Array(32).fill(7)).toString('base64');

function buildReq(body: unknown, headers: Record<string, string> = {}) {
  const raw = typeof body === 'string' ? body : JSON.stringify(body);
  const h = new Headers({
    'content-type': 'application/json',
    'content-length': String(Buffer.byteLength(raw, 'utf8')),
    ...headers,
  });
  return new Request('http://localhost/api/v1/feedback', { method: 'POST', body: raw, headers: h });
}

beforeEach(() => {
  sqlCalls.reset();
  vi.stubEnv('FEEDBACK_SECRET', KEY_B64);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('POST /api/v1/feedback', () => {
  it('inserts a row with every user-supplied column encrypted and returns 204', async () => {
    const res = await POST(
      buildReq(
        { doingWell: 'love it', pagePath: '/inference' },
        { 'user-agent': 'Mozilla/5.0 (Test)' },
      ),
    );
    expect(res.status).toBe(204);
    const insertCall = sqlCalls.calls.find((c) => c.text.includes('insert into user_feedback'));
    expect(insertCall).toBeDefined();
    const [doingWellCt, doingPoorlyCt, wantToSeeCt, userAgentCt, pagePathCt] = insertCall!.values;
    expect(typeof doingWellCt).toBe('string');
    expect(doingWellCt).not.toContain('love it');
    expect(doingPoorlyCt).toBeNull();
    expect(wantToSeeCt).toBeNull();
    expect(typeof userAgentCt).toBe('string');
    expect(userAgentCt).not.toContain('Mozilla');
    expect(typeof pagePathCt).toBe('string');
    expect(pagePathCt).not.toContain('/inference');
  });

  it('returns 204 silently for honeypot-tripped submissions and does not insert', async () => {
    const res = await POST(buildReq({ doingWell: 'x', honeypot: 'bot' }));
    expect(res.status).toBe(204);
    const inserted = sqlCalls.calls.find((c) => c.text.includes('insert into user_feedback'));
    expect(inserted).toBeUndefined();
  });

  it('rejects 400 when content-length header exceeds the cap (early reject)', async () => {
    const huge = 'x'.repeat(6 * 1024);
    const res = await POST(
      buildReq({ doingWell: huge }, { 'content-length': String(6 * 1024 + 100) }),
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'payload too large' });
  });

  it('rejects 400 when body bytes exceed the cap (post-buffer)', async () => {
    const huge = 'x'.repeat(6 * 1024);
    const res = await POST(buildReq({ doingWell: huge }, { 'content-length': '10' }));
    expect(res.status).toBe(400);
  });

  it('rejects 400 invalid json', async () => {
    const res = await POST(buildReq('{not json'));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'invalid json' });
  });

  it('rejects 400 all-empty', async () => {
    const res = await POST(buildReq({ doingWell: '   ' }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('all fields empty');
  });

  it('returns 500 with code E_CRYPTO when the encryption key is missing', async () => {
    vi.stubEnv('FEEDBACK_SECRET', '');
    const res = await POST(buildReq({ doingWell: 'x' }));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'storage error', code: 'E_CRYPTO' });
  });

  it('returns 500 with code E_INSERT when the insert query throws', async () => {
    sqlCalls.throwOnInsert();
    const res = await POST(buildReq({ doingWell: 'x' }));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'storage error', code: 'E_INSERT' });
  });
});
