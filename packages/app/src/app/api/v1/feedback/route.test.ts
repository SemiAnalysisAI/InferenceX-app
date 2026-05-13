import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { mockGetWriteDb, sqlCalls } = vi.hoisted(() => {
  const calls: { text: string; values: unknown[] }[] = [];
  let rateLimitCount = 0;
  let rateLimitOverride: number | null = null;
  let insertShouldThrow = false;
  let rateLimitShouldThrow = false;
  const sql = ((strings: TemplateStringsArray, ...values: unknown[]) => {
    const text = strings.join('?');
    calls.push({ text, values });
    if (text.includes('feedback_rate_limits')) {
      if (rateLimitShouldThrow) return Promise.reject(new Error('boom'));
      rateLimitCount += 1;
      return Promise.resolve([{ count: rateLimitOverride ?? rateLimitCount }]);
    }
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
        rateLimitCount = 0;
        rateLimitOverride = null;
        insertShouldThrow = false;
        rateLimitShouldThrow = false;
      },
      forceRateLimit(n: number) {
        rateLimitOverride = n;
      },
      throwOnInsert() {
        insertShouldThrow = true;
      },
      throwOnRateLimit() {
        rateLimitShouldThrow = true;
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
    'x-vercel-forwarded-for': '203.0.113.5',
    ...headers,
  });
  return new Request('http://localhost/api/v1/feedback', { method: 'POST', body: raw, headers: h });
}

beforeEach(() => {
  sqlCalls.reset();
  vi.stubEnv('FEEDBACK_ENCRYPTION_KEY', KEY_B64);
  // The handler-internal getTrustedIp dev fallback uses NODE_ENV.
  vi.stubEnv('NODE_ENV', 'production');
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('POST /api/v1/feedback', () => {
  it('inserts a row with every user-supplied column encrypted and returns 204', async () => {
    const res = await POST(
      buildReq(
        { doingWell: 'love it', pagePath: '/inference', visitCount: 4 },
        { 'user-agent': 'Mozilla/5.0 (Test)' },
      ),
    );
    expect(res.status).toBe(204);
    const insertCall = sqlCalls.calls.find((c) => c.text.includes('insert into user_feedback'));
    expect(insertCall).toBeDefined();
    const [doingWellCt, doingPoorlyCt, wantToSeeCt, userAgentCt, pagePathCt, visitCountCt] =
      insertCall!.values;
    expect(typeof doingWellCt).toBe('string'); // base64 ciphertext, not plaintext
    expect(doingWellCt).not.toContain('love it');
    expect(doingPoorlyCt).toBeNull();
    expect(wantToSeeCt).toBeNull();
    // Metadata is encrypted too — no cleartext UA / path / count in the row.
    expect(typeof userAgentCt).toBe('string');
    expect(userAgentCt).not.toContain('Mozilla');
    expect(typeof pagePathCt).toBe('string');
    expect(pagePathCt).not.toContain('/inference');
    expect(typeof visitCountCt).toBe('string');
    // Ciphertext is base64 — strictly longer than the cleartext "4" and base64-shaped.
    expect((visitCountCt as string).length).toBeGreaterThan(20);
    expect(visitCountCt).toMatch(/^[A-Za-z0-9+/]+={0,2}$/u);
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
    // Lie about content-length so the precheck doesn't catch it; post-buffer check should.
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

  it('returns 400 when no forwarded-for header in production', async () => {
    const req = new Request('http://localhost/api/v1/feedback', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ doingWell: 'x' }),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'forwarded-for required' });
  });

  it('falls back to a local-dev bucket when NODE_ENV is not production and no XFF', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    const req = new Request('http://localhost/api/v1/feedback', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ doingWell: 'x' }),
    });
    const res = await POST(req);
    expect(res.status).toBe(204);
  });

  it('returns 429 when the rate limiter reports over-cap', async () => {
    sqlCalls.forceRateLimit(99);
    const res = await POST(buildReq({ doingWell: 'x' }));
    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.error).toBe('rate limit');
  });

  it('returns 500 with code E_CRYPTO when the encryption key is missing', async () => {
    vi.stubEnv('FEEDBACK_ENCRYPTION_KEY', '');
    const res = await POST(buildReq({ doingWell: 'x' }));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'storage error', code: 'E_CRYPTO' });
  });

  it('returns 500 with code E_RATELIMIT when the limiter query throws', async () => {
    sqlCalls.throwOnRateLimit();
    const res = await POST(buildReq({ doingWell: 'x' }));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'storage error', code: 'E_RATELIMIT' });
  });

  it('returns 500 with code E_INSERT when the insert query throws', async () => {
    sqlCalls.throwOnInsert();
    const res = await POST(buildReq({ doingWell: 'x' }));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'storage error', code: 'E_INSERT' });
  });
});
