import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/api-cache', () => ({
  cachedJson: (data: unknown) => Response.json(data),
}));

import { NextRequest, NextResponse } from 'next/server';

import { idQueryRoute, idsQueryRoute, parseIdsParam } from './id-routes';

function req(url: string): NextRequest {
  return new NextRequest(new URL(url, 'http://localhost'));
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('parseIdsParam', () => {
  it('parses, dedupes, and sorts ids ascending', () => {
    const result = parseIdsParam(req('/x?ids=3, 1,2,3'), 200);
    expect(result).toEqual([1, 2, 3]);
  });

  it('drops non-finite and non-positive ids', () => {
    const result = parseIdsParam(req('/x?ids=abc,-1,0,5'), 200);
    expect(result).toEqual([5]);
  });

  it('returns 400 when the param is missing', async () => {
    const result = parseIdsParam(req('/x'), 200);
    expect(result).toBeInstanceOf(NextResponse);
    const res = result as NextResponse;
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('ids query param is required');
  });

  it('returns 400 when no valid ids remain', async () => {
    const result = parseIdsParam(req('/x?ids=abc,-2'), 200);
    expect(result).toBeInstanceOf(NextResponse);
    const res = result as NextResponse;
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('no valid ids provided');
  });

  it('returns 400 when the id count exceeds maxIds', async () => {
    const result = parseIdsParam(req('/x?ids=1,2,3'), 2);
    expect(result).toBeInstanceOf(NextResponse);
    const res = result as NextResponse;
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('too many ids (max 2)');
  });
});

describe('idsQueryRoute', () => {
  it('fetches with sorted deduped ids and returns the payload', async () => {
    const fetch = vi.fn().mockResolvedValue({ 1: 'a', 2: 'b' });
    const GET = idsQueryRoute({ maxIds: 200, logLabel: 'things', fetch });

    const res = await GET(req('/x?ids=2,1,2'));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ 1: 'a', 2: 'b' });
    expect(fetch).toHaveBeenCalledWith([1, 2]);
  });

  it('returns 400 without calling fetch when ids are invalid', async () => {
    const fetch = vi.fn();
    const GET = idsQueryRoute({ maxIds: 200, logLabel: 'things', fetch });

    const res = await GET(req('/x'));
    expect(res.status).toBe(400);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('returns 500 and logs when the fetch throws', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const fetch = vi.fn().mockRejectedValue(new Error('boom'));
    const GET = idsQueryRoute({ maxIds: 200, logLabel: 'things', fetch });

    const res = await GET(req('/x?ids=1'));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe('Internal server error');
    expect(consoleSpy).toHaveBeenCalledWith('Error fetching things:', expect.any(Error));
    consoleSpy.mockRestore();
  });
});

describe('idQueryRoute', () => {
  it('fetches by id and returns the payload', async () => {
    const fetch = vi.fn().mockResolvedValue({ value: 42 });
    const GET = idQueryRoute({ logLabel: 'thing', fetch });

    const res = await GET(req('/x?id=7'));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ value: 42 });
    expect(fetch).toHaveBeenCalledWith(7);
  });

  it.each(['/x', '/x?id=abc', '/x?id=0'])('returns 400 for %s', async (url) => {
    const fetch = vi.fn();
    const GET = idQueryRoute({ logLabel: 'thing', fetch });

    const res = await GET(req(url));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('id is required (benchmark_result_id)');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('returns 404 when the fetch yields null', async () => {
    const fetch = vi.fn().mockResolvedValue(null);
    const GET = idQueryRoute({ logLabel: 'thing', fetch });

    const res = await GET(req('/x?id=7'));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe('Not found');
  });

  it('returns 500 and logs when the fetch throws', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const fetch = vi.fn().mockRejectedValue(new Error('boom'));
    const GET = idQueryRoute({ logLabel: 'thing', fetch });

    const res = await GET(req('/x?id=7'));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe('Internal server error');
    expect(consoleSpy).toHaveBeenCalledWith('Error fetching thing:', expect.any(Error));
    consoleSpy.mockRestore();
  });
});
