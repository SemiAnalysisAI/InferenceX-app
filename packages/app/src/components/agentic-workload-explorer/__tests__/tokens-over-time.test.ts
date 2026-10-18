import { describe, it, expect } from 'vitest';
import {
  MAIN_AGENT_KEY,
  buildAgentOptions,
  buildTokenPoints,
  buildContextTrajectories,
  computeCacheHitRates,
  computeSessionCacheHitRates,
  formatElapsedMMSS,
} from '@/lib/agentic-workload-explorer/tokens-over-time';
import { type SessionRequest } from '@/lib/agentic-workload-explorer/session-context';

function makeReq(overrides: Partial<SessionRequest> = {}): SessionRequest {
  return {
    id: 'req-1',
    timestamp: '2026-05-08T00:00:00.000Z',
    method: 'POST',
    endpoint: '/v1/messages',
    model: 'claude-opus-4-7',
    inputTokens: 100,
    outputTokens: 50,
    cacheReadInputTokens: 0,
    cacheWriteTokens: 0,
    durationMs: 1000,
    ttftMs: 100,
    tpotMs: 10,
    costUsd: 0.001,
    requestBody: null,
    responseBody: null,
    responseStatusCode: 200,
    isStreaming: true,
    isFastMode: false,
    hashIds: null,
    hashTokenCount: null,
    privacyMode: 'anon',
    subagentLabel: null,
    requestHeaders: null,
    error: null,
    metadata: null,
    ...overrides,
  };
}

describe('buildTokenPoints', () => {
  it('returns empty array for empty input', () => {
    expect(buildTokenPoints([])).toEqual([]);
  });

  it('produces a single point with elapsedMs=0 for one request', () => {
    const points = buildTokenPoints([
      makeReq({
        id: 'r1',
        inputTokens: 1000,
        cacheReadInputTokens: 5000,
        cacheWriteTokens: 200,
      }),
    ]);
    expect(points).toHaveLength(1);
    expect(points[0]).toMatchObject({
      requestId: 'r1',
      turn: 1,
      elapsedMs: 0,
      api: { cached: 5000, uncached: 1200, total: 6200 },
    });
  });

  it('sorts by timestamp and computes monotonic elapsedMs', () => {
    const points = buildTokenPoints([
      makeReq({ id: 'b', timestamp: '2026-05-08T00:00:30.000Z' }),
      makeReq({ id: 'a', timestamp: '2026-05-08T00:00:00.000Z' }),
      makeReq({ id: 'c', timestamp: '2026-05-08T00:01:30.000Z' }),
    ]);
    expect(points.map((p) => p.requestId)).toEqual(['a', 'b', 'c']);
    expect(points.map((p) => p.elapsedMs)).toEqual([0, 30_000, 90_000]);
    expect(points.map((p) => p.turn)).toEqual([1, 2, 3]);
  });

  it('drops subagent requests — only main-agent points', () => {
    const points = buildTokenPoints([
      makeReq({ id: 'main-1', subagentLabel: null }),
      makeReq({
        id: 'sub-1',
        timestamp: '2026-05-08T00:00:01.000Z',
        subagentLabel: 'Agent SDK',
      }),
      makeReq({
        id: 'sub-2',
        timestamp: '2026-05-08T00:00:02.000Z',
        subagentLabel: 'General Agent',
      }),
      makeReq({
        id: 'main-2',
        timestamp: '2026-05-08T00:00:03.000Z',
        subagentLabel: null,
      }),
    ]);
    expect(points.map((p) => p.requestId)).toEqual(['main-1', 'main-2']);
    // Turn numbering skips over the filtered subagent rows.
    expect(points.map((p) => p.turn)).toEqual([1, 2]);
  });

  it('returns empty array when every request is a subagent', () => {
    const points = buildTokenPoints([
      makeReq({ id: 'sub-1', subagentLabel: 'Agent SDK' }),
      makeReq({
        id: 'sub-2',
        timestamp: '2026-05-08T00:00:01.000Z',
        subagentLabel: 'Title Generation',
      }),
    ]);
    expect(points).toEqual([]);
  });

  it('measures elapsedMs from the first main-agent request, not the first overall request', () => {
    const points = buildTokenPoints([
      // A subagent fires at t=0…
      makeReq({
        id: 'sub-1',
        timestamp: '2026-05-08T00:00:00.000Z',
        subagentLabel: 'Title Generation',
      }),
      // …but the main agent's first turn lands at t=10s. elapsedMs[0] should be 0.
      makeReq({
        id: 'main-1',
        timestamp: '2026-05-08T00:00:10.000Z',
        subagentLabel: null,
      }),
      makeReq({
        id: 'main-2',
        timestamp: '2026-05-08T00:00:25.000Z',
        subagentLabel: null,
      }),
    ]);
    expect(points.map((p) => p.elapsedMs)).toEqual([0, 15_000]);
  });

  it('coerces null token fields to 0', () => {
    const points = buildTokenPoints([
      makeReq({
        id: 'r1',
        inputTokens: null,
        cacheReadInputTokens: null,
        cacheWriteTokens: null,
      }),
    ]);
    expect(points[0].api).toEqual({ cached: 0, uncached: 0, total: 0 });
  });

  it('splits cache_read into api.cached and (cache_write + input) into api.uncached', () => {
    const points = buildTokenPoints([
      makeReq({
        id: 'r1',
        cacheReadInputTokens: 12_000,
        cacheWriteTokens: 1500,
        inputTokens: 200,
      }),
    ]);
    expect(points[0].api).toEqual({ cached: 12_000, uncached: 1700, total: 13_700 });
  });

  it('emits a hash split derived from the session-wide hash trie', () => {
    // Two main requests sharing a 2-block prefix. The second request should see
    // 2 blocks of cached prefix and any new blocks as uncached suffix.
    const points = buildTokenPoints([
      makeReq({
        id: 'r1',
        timestamp: '2026-05-08T00:00:00.000Z',
        hashIds: ['A', 'B'],
        hashTokenCount: 128,
      }),
      makeReq({
        id: 'r2',
        timestamp: '2026-05-08T00:00:01.000Z',
        hashIds: ['A', 'B', 'C'],
        hashTokenCount: 192,
      }),
    ]);
    // First request has nothing to match against; entire chain is uncached.
    expect(points[0].hash.cached).toBe(0);
    expect(points[0].hash.uncached).toBe(128);
    // Second request shares blocks 0-1 with r1; block 2 is new.
    expect(points[1].hash.cached).toBe(128);
    expect(points[1].hash.uncached).toBe(64);
    expect(points[1].hash.total).toBe(192);
  });
});

describe('buildAgentOptions', () => {
  it('returns an empty list for empty input', () => {
    expect(buildAgentOptions([])).toEqual([]);
  });

  it('emits Main Agent first, then one entry per sub-agent run', () => {
    const opts = buildAgentOptions([
      makeReq({ id: 'm1', timestamp: '2026-05-08T00:00:00.000Z', subagentLabel: null }),
      makeReq({ id: 's1a', timestamp: '2026-05-08T00:00:01.000Z', subagentLabel: 'Agent SDK' }),
      makeReq({ id: 's1b', timestamp: '2026-05-08T00:00:02.000Z', subagentLabel: 'Agent SDK' }),
      makeReq({ id: 'm2', timestamp: '2026-05-08T00:00:03.000Z', subagentLabel: null }),
      makeReq({ id: 's2a', timestamp: '2026-05-08T00:00:04.000Z', subagentLabel: 'Explore Agent' }),
    ]);
    expect(opts[0]).toEqual({ key: MAIN_AGENT_KEY, label: 'Main Agent', requestCount: 2 });
    expect(opts).toHaveLength(3);
    expect(opts.slice(1).map((o) => o.label)).toEqual(['Agent SDK', 'Explore Agent']);
    expect(opts.slice(1).map((o) => o.requestCount)).toEqual([2, 1]);
  });

  it('omits the Main Agent option when no main-agent requests exist', () => {
    const opts = buildAgentOptions([makeReq({ id: 's1', subagentLabel: 'Title Generation' })]);
    expect(opts.every((o) => o.key !== MAIN_AGENT_KEY)).toBe(true);
  });
});

describe('buildTokenPoints with agentKey', () => {
  const session = (): SessionRequest[] => [
    makeReq({
      id: 'm1',
      timestamp: '2026-05-08T00:00:00.000Z',
      subagentLabel: null,
      cacheReadInputTokens: 100,
    }),
    makeReq({
      id: 's1a',
      timestamp: '2026-05-08T00:00:01.000Z',
      subagentLabel: 'Agent SDK',
      cacheReadInputTokens: 1000,
    }),
    makeReq({
      id: 's1b',
      timestamp: '2026-05-08T00:00:02.000Z',
      subagentLabel: 'Agent SDK',
      cacheReadInputTokens: 2000,
    }),
    makeReq({
      id: 'm2',
      timestamp: '2026-05-08T00:00:03.000Z',
      subagentLabel: null,
      cacheReadInputTokens: 200,
    }),
  ];

  it('defaults to the main agent', () => {
    const points = buildTokenPoints(session());
    expect(points.map((p) => p.requestId)).toEqual(['m1', 'm2']);
  });

  it('plots only the chosen sub-agent run when given its key', () => {
    const reqs = session();
    const subKey = buildAgentOptions(reqs).find((o) => o.label === 'Agent SDK')!.key;
    const points = buildTokenPoints(reqs, subKey);
    expect(points.map((p) => p.requestId)).toEqual(['s1a', 's1b']);
    // elapsedMs anchors on the first request of the selected agent — the
    // sub-agent starts at +00:00 in its own view.
    expect(points.map((p) => p.elapsedMs)).toEqual([0, 1_000]);
  });

  it('returns an empty list for an unknown agent key', () => {
    expect(buildTokenPoints(session(), 'no-such-agent')).toEqual([]);
  });
});

describe('buildContextTrajectories', () => {
  it('returns zeroed counts for empty input', () => {
    const t = buildContextTrajectories([]);
    expect(t.main).toEqual([]);
    expect(t.subagents).toEqual([]);
    expect(t.maxTotal).toBe(0);
    expect(t.counts).toEqual({ total: 0, main: 0, subagent: 0, invocations: 0 });
  });

  it('groups consecutive same-label sub-agent runs into separate trajectories', () => {
    const t = buildContextTrajectories([
      makeReq({ id: 'm1', timestamp: '2026-05-08T00:00:00.000Z', subagentLabel: null }),
      makeReq({ id: 's1a', timestamp: '2026-05-08T00:00:01.000Z', subagentLabel: 'Agent SDK' }),
      makeReq({ id: 's1b', timestamp: '2026-05-08T00:00:02.000Z', subagentLabel: 'Agent SDK' }),
      makeReq({ id: 'm2', timestamp: '2026-05-08T00:00:03.000Z', subagentLabel: null }),
      makeReq({ id: 's2a', timestamp: '2026-05-08T00:00:04.000Z', subagentLabel: 'Explore Agent' }),
      // Same label as the FIRST sub-run, but separated by a main turn → its own trajectory.
      makeReq({ id: 's3a', timestamp: '2026-05-08T00:00:05.000Z', subagentLabel: 'Agent SDK' }),
      makeReq({ id: 's3b', timestamp: '2026-05-08T00:00:06.000Z', subagentLabel: 'Agent SDK' }),
    ]);
    expect(t.main.map((p) => p.requestId)).toEqual(['m1', 'm2']);
    expect(t.subagents).toHaveLength(3);
    expect(t.subagents[0]).toMatchObject({ label: 'Agent SDK' });
    expect(t.subagents[0].points.map((p) => p.requestId)).toEqual(['s1a', 's1b']);
    expect(t.subagents[1]).toMatchObject({ label: 'Explore Agent' });
    expect(t.subagents[2].points.map((p) => p.requestId)).toEqual(['s3a', 's3b']);
    expect(t.counts).toEqual({ total: 7, main: 2, subagent: 5, invocations: 3 });
  });

  it('anchors elapsedMs on the earliest request regardless of agent type', () => {
    // A subagent fires before the first main turn; its elapsedMs is 0.
    const t = buildContextTrajectories([
      makeReq({
        id: 's1',
        timestamp: '2026-05-08T00:00:00.000Z',
        subagentLabel: 'Title Generation',
      }),
      makeReq({ id: 'm1', timestamp: '2026-05-08T00:00:30.000Z', subagentLabel: null }),
    ]);
    expect(t.subagents[0].points[0].elapsedMs).toBe(0);
    expect(t.main[0].elapsedMs).toBe(30_000);
  });

  it('computes total as cache_read + cache_write + input', () => {
    const t = buildContextTrajectories([
      makeReq({
        id: 'm1',
        cacheReadInputTokens: 12_000,
        cacheWriteTokens: 1_500,
        inputTokens: 200,
      }),
    ]);
    expect(t.main[0].total).toBe(13_700);
  });

  it('exposes maxTotal across both main and sub-agent points', () => {
    const t = buildContextTrajectories([
      makeReq({
        id: 'm1',
        timestamp: '2026-05-08T00:00:00.000Z',
        cacheReadInputTokens: 10_000,
        cacheWriteTokens: 0,
        inputTokens: 0,
        subagentLabel: null,
      }),
      makeReq({
        id: 's1',
        timestamp: '2026-05-08T00:00:01.000Z',
        cacheReadInputTokens: 50_000,
        cacheWriteTokens: 0,
        inputTokens: 0,
        subagentLabel: 'Agent SDK',
      }),
    ]);
    expect(t.maxTotal).toBe(50_000);
  });
});

describe('computeCacheHitRates', () => {
  it('returns 0/0 for empty input (no divide-by-zero)', () => {
    expect(computeCacheHitRates([])).toEqual({ api: 0, hash: 0 });
  });

  it('aggregates api cache hit rate across every visible point', () => {
    // Two points share a prefix; the second adds an uncached block.
    const points = buildTokenPoints([
      makeReq({
        id: 'r1',
        timestamp: '2026-05-08T00:00:00.000Z',
        cacheReadInputTokens: 0,
        cacheWriteTokens: 100,
        inputTokens: 0,
      }),
      makeReq({
        id: 'r2',
        timestamp: '2026-05-08T00:00:01.000Z',
        cacheReadInputTokens: 80,
        cacheWriteTokens: 0,
        inputTokens: 20,
      }),
    ]);
    const rates = computeCacheHitRates(points);
    // Sum cached = 0+80=80; sum total = 100+100 = 200 → 40%.
    expect(rates.api).toBeCloseTo(40, 5);
  });

  it('computes hash hit rate from session-wide hash trie', () => {
    const points = buildTokenPoints([
      makeReq({
        id: 'r1',
        timestamp: '2026-05-08T00:00:00.000Z',
        hashIds: ['A', 'B'],
        hashTokenCount: 128,
      }),
      makeReq({
        id: 'r2',
        timestamp: '2026-05-08T00:00:01.000Z',
        hashIds: ['A', 'B', 'C'],
        hashTokenCount: 192,
      }),
    ]);
    const rates = computeCacheHitRates(points);
    // Hash: r1 cached=0/total=128, r2 cached=128/total=192. Sum = 128/320 = 40%.
    expect(rates.hash).toBeCloseTo(40, 5);
  });

  it('returns 0 for a split when every point has zero total tokens', () => {
    const points = buildTokenPoints([
      makeReq({
        id: 'r1',
        cacheReadInputTokens: 0,
        cacheWriteTokens: 0,
        inputTokens: 0,
        hashIds: null,
        hashTokenCount: null,
      }),
    ]);
    const rates = computeCacheHitRates(points);
    expect(rates.api).toBe(0);
    expect(rates.hash).toBe(0);
  });

  it('reports 100% when every prompt token is a cache read', () => {
    const points = buildTokenPoints([
      makeReq({
        id: 'r1',
        cacheReadInputTokens: 5000,
        cacheWriteTokens: 0,
        inputTokens: 0,
      }),
    ]);
    expect(computeCacheHitRates(points).api).toBe(100);
  });
});

describe('computeSessionCacheHitRates', () => {
  it('returns 0/0 for empty input', () => {
    expect(computeSessionCacheHitRates([])).toEqual({ api: 0, hash: 0 });
  });

  it('includes sub-agent requests in the api aggregate (whole session, not just main)', () => {
    const rates = computeSessionCacheHitRates([
      makeReq({
        id: 'main',
        timestamp: '2026-05-08T00:00:00.000Z',
        subagentLabel: null,
        cacheReadInputTokens: 100,
        cacheWriteTokens: 0,
        inputTokens: 100,
      }),
      makeReq({
        id: 'sub',
        timestamp: '2026-05-08T00:00:01.000Z',
        subagentLabel: 'Agent SDK',
        cacheReadInputTokens: 300,
        cacheWriteTokens: 0,
        inputTokens: 100,
      }),
    ]);
    // (100 + 300) cached / (200 + 400) total = 66.67%. If sub-agents were
    // skipped (as buildTokenPoints does) the answer would be 50%.
    expect(rates.api).toBeCloseTo(66.67, 1);
  });

  it('hash trie is built across every request in the session, in chronological order', () => {
    // Two main requests sharing a 2-block prefix, with a sub-agent slotted
    // between them. The trie still serializes by timestamp so r3 can match
    // against r1's chain even though a sub-agent fired in between.
    const rates = computeSessionCacheHitRates([
      makeReq({
        id: 'r3',
        timestamp: '2026-05-08T00:00:02.000Z',
        hashIds: ['A', 'B', 'C'],
        hashTokenCount: 192,
      }),
      makeReq({
        id: 'r2',
        timestamp: '2026-05-08T00:00:01.000Z',
        subagentLabel: 'Agent SDK',
        hashIds: ['X'],
        hashTokenCount: 64,
      }),
      makeReq({
        id: 'r1',
        timestamp: '2026-05-08T00:00:00.000Z',
        hashIds: ['A', 'B'],
        hashTokenCount: 128,
      }),
    ]);
    // Per-request cached prefix: r1=0, r2=0 (no shared prefix), r3=128 (2 blocks
    // match r1). cached=128, total=128+64+192=384 → 33.33%.
    expect(rates.hash).toBeCloseTo(33.33, 1);
  });

  it('counts cache_write as miss-but-promoted (in denominator, not numerator)', () => {
    const rates = computeSessionCacheHitRates([
      makeReq({
        id: 'r1',
        cacheReadInputTokens: 0,
        cacheWriteTokens: 1000,
        inputTokens: 0,
      }),
    ]);
    // 0 / 1000 = 0% — a fresh cache write is a miss, even though it'll be
    // readable next time.
    expect(rates.api).toBe(0);
  });

  it('reports 100% when every prompt token is a cache read', () => {
    const rates = computeSessionCacheHitRates([
      makeReq({
        id: 'r1',
        cacheReadInputTokens: 5000,
        cacheWriteTokens: 0,
        inputTokens: 0,
      }),
    ]);
    expect(rates.api).toBe(100);
  });
});

describe('formatElapsedMMSS', () => {
  it('formats sub-minute durations with 0 minutes', () => {
    expect(formatElapsedMMSS(0)).toBe('+00:00');
    expect(formatElapsedMMSS(5_000)).toBe('+00:05');
    expect(formatElapsedMMSS(59_999)).toBe('+00:59');
  });

  it('formats minutes correctly', () => {
    expect(formatElapsedMMSS(60_000)).toBe('+01:00');
    expect(formatElapsedMMSS(8 * 60_000 + 21_000)).toBe('+08:21');
    expect(formatElapsedMMSS(33 * 60_000 + 24_000)).toBe('+33:24');
  });

  it('promotes to H:MM:SS for sessions over an hour', () => {
    expect(formatElapsedMMSS(3_600_000)).toBe('+1:00:00');
    expect(formatElapsedMMSS(3_600_000 + 5 * 60_000 + 7_000)).toBe('+1:05:07');
  });

  it('clamps negative inputs', () => {
    expect(formatElapsedMMSS(-1000)).toBe('+00:00');
  });
});
