import { describe, expect, it, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const { mockCachedQuery, mockCachedJson } = vi.hoisted(() => ({
  mockCachedQuery: vi.fn((fn: (...args: unknown[]) => unknown) => fn),
  mockCachedJson: vi.fn((data: unknown) => Response.json(data)),
}));

vi.mock('@/lib/api-cache', () => ({
  cachedQuery: mockCachedQuery,
  cachedJson: mockCachedJson,
}));

import { createCachedRoute } from './create-cached-route';

function req(url: string): NextRequest {
  return new NextRequest(new URL(url, 'http://localhost'));
}

beforeEach(() => {
  vi.clearAllMocks();
  // Reset to default passthrough + json behavior
  mockCachedQuery.mockImplementation((fn: (...args: unknown[]) => unknown) => fn);
  mockCachedJson.mockImplementation((data: unknown) => Response.json(data));
});

// ── No-param overload (parseParams omitted) ────────────────────────────────

describe('createCachedRoute — no-param overload', () => {
  it('happy path: returns cachedJson result', async () => {
    const queryFn = vi.fn().mockResolvedValue({ foo: 'bar' });
    const GET = createCachedRoute(queryFn, 'test-key', { resource: 'test resource' });

    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ foo: 'bar' });
    expect(queryFn).toHaveBeenCalledOnce();
  });

  it('error path: returns 500 JSON on query throw', async () => {
    const queryFn = vi.fn().mockRejectedValue(new Error('db gone'));
    const GET = createCachedRoute(queryFn, 'test-key', { resource: 'test resource' });

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await GET();
    consoleSpy.mockRestore();

    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Internal server error' });
  });

  it('error message contains the resource name', async () => {
    const queryFn = vi.fn().mockRejectedValue(new Error('boom'));
    const GET = createCachedRoute(queryFn, 'test-key', { resource: 'my resource' });

    const errors: unknown[] = [];
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation((...args) => {
      errors.push(args[0]);
    });
    await GET();
    consoleSpy.mockRestore();

    expect(errors[0]).toBe('Error fetching my resource:');
  });

  it('passes keyPrefix and cacheOptions to cachedQuery', () => {
    const queryFn = vi.fn().mockResolvedValue([]);
    createCachedRoute(queryFn, 'my-prefix', {
      resource: 'test',
      cacheOptions: { blobOnly: true },
    });

    expect(mockCachedQuery).toHaveBeenCalledWith(queryFn, 'my-prefix', { blobOnly: true });
  });
});

// ── Param overload (parseParams provided) ─────────────────────────────────

describe('createCachedRoute — with parseParams', () => {
  it('happy path: parses params and passes args to query', async () => {
    const queryFn = vi.fn().mockResolvedValue([1, 2, 3]);
    const parseParams = vi.fn().mockReturnValue({ args: ['abc', 42] as [string, number] });

    const GET = createCachedRoute(queryFn, 'param-key', {
      resource: 'parameterized resource',
      parseParams,
    });

    const res = await GET(req('/api/test?x=abc&n=42'));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([1, 2, 3]);
    expect(queryFn).toHaveBeenCalledWith('abc', 42);
  });

  it('param-validation rejection: returns error response without calling query', async () => {
    const queryFn = vi.fn();
    const parseParams = vi.fn().mockReturnValue({
      error: 'id is required',
      status: 400,
    });

    const GET = createCachedRoute(queryFn, 'param-key', {
      resource: 'parameterized resource',
      parseParams,
    });

    const res = await GET(req('/api/test'));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'id is required' });
    expect(queryFn).not.toHaveBeenCalled();
  });

  it('error path: returns 500 JSON when query throws after valid params', async () => {
    const queryFn = vi.fn().mockRejectedValue(new Error('timeout'));
    const parseParams = vi.fn().mockReturnValue({ args: ['x'] as [string] });

    const GET = createCachedRoute(queryFn, 'param-key', {
      resource: 'my data',
      parseParams,
    });

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await GET(req('/api/test?x=1'));
    consoleSpy.mockRestore();

    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Internal server error' });
  });

  it('passes the request to parseParams', async () => {
    const queryFn = vi.fn().mockResolvedValue(null);
    const parseParams = vi.fn().mockReturnValue({ args: [] as [] });

    const GET = createCachedRoute(queryFn, 'k', {
      resource: 'r',
      parseParams,
    });

    const request = req('/api/test?foo=bar');
    await GET(request);
    expect(parseParams).toHaveBeenCalledWith(request);
  });

  it('status code from param error is forwarded correctly', async () => {
    const queryFn = vi.fn();
    const parseParams = vi.fn().mockReturnValue({ error: 'Not found', status: 404 });

    const GET = createCachedRoute(queryFn, 'k', {
      resource: 'r',
      parseParams,
    });

    const res = await GET(req('/api/test'));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe('Not found');
  });
});
