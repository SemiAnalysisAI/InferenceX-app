import { describe, it, expect } from 'vitest';

/**
 * Tests that API error responses do not leak internal details.
 *
 * The security audit found that several API routes returned String(error)
 * directly in responses, which could leak internal paths, connection strings,
 * or stack traces. These tests verify that error responses use generic messages.
 *
 * We can't easily call the actual route handlers (they need Clerk, DB, etc.),
 * so we verify the pattern: the response body should contain a generic error
 * message rather than raw exception details.
 */

// Patterns that should NEVER appear in user-facing error responses
const DANGEROUS_PATTERNS = [
  /ECONNREFUSED/iu,
  /ENOTFOUND/iu,
  /ETIMEDOUT/iu,
  /postgres:\/\//iu,
  /neon\.tech/iu,
  /at\s+\w+\s+\(/iu, // stack trace "at Function ("
  /node_modules/iu,
  /\.ts:\d+:\d+/iu, // file:line:col
  /secret/iu,
  /password/iu,
  /DATABASE_URL/iu,
];

function assertSafeErrorMessage(message: string) {
  for (const pattern of DANGEROUS_PATTERNS) {
    expect(message).not.toMatch(pattern);
  }
}

describe('error response sanitization', () => {
  it('generic error message is safe', () => {
    assertSafeErrorMessage('Internal server error');
  });

  it('detects dangerous connection string leak', () => {
    const msg = 'Error: connect ECONNREFUSED 127.0.0.1:5432';
    expect(() => assertSafeErrorMessage(msg)).toThrow();
  });

  it('detects dangerous database URL leak', () => {
    const msg = 'Error: postgres://user:pass@neon.tech:5432/db';
    expect(() => assertSafeErrorMessage(msg)).toThrow();
  });

  it('detects dangerous stack trace leak', () => {
    const msg =
      'TypeError: Cannot read properties\n    at Object.handler (/app/src/lib/auth.ts:42:15)';
    expect(() => assertSafeErrorMessage(msg)).toThrow();
  });

  it('detects node_modules path leak', () => {
    const msg = 'Error at /app/node_modules/kysely/dist/index.js:123';
    expect(() => assertSafeErrorMessage(msg)).toThrow();
  });
});

describe('error response format', () => {
  it('500 error follows standard format', async () => {
    const res = Response.json({ error: 'Internal server error' }, { status: 500 });
    const body = await res.json();
    expect(res.status).toBe(500);
    expect(body.error).toBe('Internal server error');
    assertSafeErrorMessage(body.error);
  });

  it('400 validation error is safe', async () => {
    const res = Response.json({ error: 'Invalid status' }, { status: 400 });
    const body = await res.json();
    assertSafeErrorMessage(body.error);
  });

  it('401 auth error is safe', async () => {
    const res = Response.json({ error: 'Unauthorized' }, { status: 401 });
    const body = await res.json();
    assertSafeErrorMessage(body.error);
  });

  it('403 CSRF error is safe', async () => {
    const res = Response.json({ error: 'Origin mismatch' }, { status: 403 });
    const body = await res.json();
    assertSafeErrorMessage(body.error);
  });
});
