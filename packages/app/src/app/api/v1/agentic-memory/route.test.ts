import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { getAgenticMemory } from '@semianalysisai/inferencex-db/queries/agentic-memory';
import { GET } from './route';
vi.mock('@semianalysisai/inferencex-db/connection', () => ({ getDb: () => ({}) }));
vi.mock('@semianalysisai/inferencex-db/queries/agentic-memory', () => ({
  getAgenticMemory: vi.fn(),
}));
vi.mock('@/lib/api-cache', () => ({
  cachedQuery: (fn: unknown) => fn,
  cachedJson: (x: unknown) => Response.json(x),
}));
beforeEach(() => vi.clearAllMocks());
const req = (q: string) => new NextRequest(`http://localhost/api/v1/agentic-memory${q}`);
describe('memory endpoint', () => {
  it.each(['', '?id=-1', '?id=1.5', '?id=1&id=2', '?id=1&model=x', '?id=9007199254740992'])(
    'rejects invalid or unknown parameters: %s',
    async (q) => {
      const response = await GET(req(q));
      expect(response.status).toBe(400);
      expect(getAgenticMemory).not.toHaveBeenCalled();
    },
  );
  it('returns parsed values unchanged so UI and API share accounting', async () => {
    const result = { id: 42, ranks: [{ gib: { weights: 205.08 }, percent: { weights: 76.61 } }] };
    vi.mocked(getAgenticMemory).mockResolvedValue(result as never);
    const response = await GET(req('?id=42'));
    expect(await response.json()).toEqual(result);
  });
  it('distinguishes missing point and failed source', async () => {
    vi.mocked(getAgenticMemory).mockResolvedValue(null);
    const missing = await GET(req('?id=42'));
    expect(missing.status).toBe(404);
    vi.mocked(getAgenticMemory).mockRejectedValue(new Error('db down'));
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const failed = await GET(req('?id=42'));
    expect(failed.status).toBe(500);
    spy.mockRestore();
  });
});
