import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CURRENT_TRACE_VERSION } from '@semianalysisai/inferencex-db/proxytrace/shared/trace';

const mocks = vi.hoisted(() => ({ sessions: vi.fn(), stats: vi.fn() }));
vi.mock('@/lib/agentic-workload-explorer/api', () => ({
  withExplorerRoute:
    (handler: (ctx: { req: unknown; vis: string[] }) => Promise<unknown>) => (req: unknown) =>
      handler({ req, vis: [] }),
}));
vi.mock('@semianalysisai/inferencex-db/proxytrace/operations', () => ({
  getRecentSessions: mocks.sessions,
  getSessionStats: mocks.stats,
  SESSION_SORT_KEYS: ['active'],
}));
import { GET } from '@/app/api/v1/agentic-workload-explorer/sessions/route';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.sessions.mockResolvedValue([]);
  mocks.stats.mockResolvedValue({});
});

describe('sessions trace-version filtering', () => {
  it.each([
    ['', null],
    ['all', null],
    ['0', null],
    ['-1', null],
    ['1.5', null],
    ['garbage', null],
    [String(CURRENT_TRACE_VERSION + 1), null],
    ['1', 1],
    [String(CURRENT_TRACE_VERSION), CURRENT_TRACE_VERSION],
  ])('uses the shared parser for version=%s', async (raw, expected) => {
    const req = {
      nextUrl: new URL(`https://test/api/sessions?version=${raw}`),
    } as Parameters<typeof GET>[0];
    await GET(req);
    expect(mocks.sessions.mock.calls[0][4]).toBe(expected);
    expect(mocks.stats.mock.calls[0][1]).toBe(expected);
  });
});
