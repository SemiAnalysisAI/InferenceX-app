import { NextRequest } from 'next/server';
import { beforeEach, expect, it, vi } from 'vitest';

import { getTimelines } from '@/lib/operatorx/service';

import { GET } from './route';

vi.mock('@/lib/operatorx/service', () => ({
  getTimelines: vi.fn(),
}));

beforeEach(() => vi.mocked(getTimelines).mockReset());

it('does not cache a timeline reference whose stored result is gone', async () => {
  vi.mocked(getTimelines).mockResolvedValue({ timelines: { '123:0:1': null }, known: false });

  const response = await GET(
    new NextRequest('http://localhost/api/v1/operatorx/timelines?op=gemm&r=123:0:1'),
  );

  expect(response.status).toBe(200);
  expect(response.headers.get('Cache-Control')).toBe('no-store');
  expect(await response.json()).toEqual({ '123:0:1': null });
});

it('rejects an unversioned result reference before reading any run', async () => {
  const response = await GET(
    new NextRequest('http://localhost/api/v1/operatorx/timelines?op=gemm&r=123:0'),
  );

  expect(response.status).toBe(400);
  expect(vi.mocked(getTimelines)).not.toHaveBeenCalled();
});
