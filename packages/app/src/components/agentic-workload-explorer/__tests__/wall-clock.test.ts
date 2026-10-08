import { describe, it, expect } from 'vitest';
import {
  Kysely,
  PostgresAdapter,
  PostgresIntrospector,
  PostgresQueryCompiler,
  type CompiledQuery,
  type DatabaseConnection,
  type Driver,
  type QueryResult,
} from 'kysely';
import type { Database } from '@semianalysisai/inferencex-db/proxytrace/types';
import { getWallClockBreakdown } from '@semianalysisai/inferencex-db/proxytrace/operations';
import {
  IDLE_GAP_CUTOFF_MS,
  WALL_CLOCK_DAILY_DAYS,
} from '@semianalysisai/inferencex-db/proxytrace/shared/wall-clock';

const noop = () => Promise.resolve();

function capturingDb(sink: CompiledQuery[], rows: unknown[] = []): Kysely<Database> {
  const connection: DatabaseConnection = {
    executeQuery: <R>(cq: CompiledQuery): Promise<QueryResult<R>> => {
      sink.push(cq);
      return Promise.resolve({ rows: rows as R[] });
    },
    // eslint-disable-next-line require-yield, require-await
    async *streamQuery() {
      throw new Error('not used');
    },
  };
  const driver: Driver = {
    init: noop,
    acquireConnection: () => Promise.resolve(connection),
    beginTransaction: noop,
    commitTransaction: noop,
    rollbackTransaction: noop,
    releaseConnection: noop,
    destroy: noop,
  };
  return new Kysely<Database>({
    dialect: {
      createAdapter: () => new PostgresAdapter(),
      createDriver: () => driver,
      createIntrospector: (db) => new PostgresIntrospector(db),
      createQueryCompiler: () => new PostgresQueryCompiler(),
    },
  });
}

describe('getWallClockBreakdown SQL shape', () => {
  it('orders lanes by (session, subagent) so subagent turns never inflate a gap', async () => {
    const sink: CompiledQuery[] = [];
    await getWallClockBreakdown(null, null, null, capturingDb(sink));
    const sql = sink[0].sql.toLowerCase().replaceAll(/\s+/gu, ' ');
    expect(sql).toContain('partition by session_id, lane');
    expect(sql).toContain('lead(ts) over w');
  });

  it('LEFT JOINs request_stats so a request with no stats row still orders the lane', async () => {
    const sink: CompiledQuery[] = [];
    await getWallClockBreakdown(null, null, null, capturingDb(sink));
    const sql = sink[0].sql.toLowerCase().replaceAll(/\s+/gu, ' ');
    expect(sql).toContain('left join request_stats');
    // ...but such a row can never be read as "the assistant stopped".
    expect(sql).toContain('has_stats and n_tools = 0');
  });

  it('applies the model filter when classifying turns, NOT when building the lane', async () => {
    const sink: CompiledQuery[] = [];
    await getWallClockBreakdown(null, 'claude-opus-5', null, capturingDb(sink));
    const sql = sink[0].sql.replaceAll(/\s+/gu, ' ');
    // The model predicate is projected as model_ok and consumed after lead().
    expect(sql).toMatch(/requests\.model = \$\d+\) AS model_ok/u);
    expect(sql).toContain('WHERE model_ok AND duration_ms IS NOT NULL');
    expect(sink[0].parameters).toContain('claude-opus-5');
  });

  it('parameterizes the idle cutoff and daily window from the shared constants', async () => {
    const sink: CompiledQuery[] = [];
    await getWallClockBreakdown(null, null, null, capturingDb(sink));
    expect(sink[0].parameters).toContain(IDLE_GAP_CUTOFF_MS);
    expect(sink[0].parameters).toContain(WALL_CLOCK_DAILY_DAYS - 1);
  });

  it('groups daily composition into Claude and Codex agent families', async () => {
    const sink: CompiledQuery[] = [];
    await getWallClockBreakdown(null, null, null, capturingDb(sink));
    const sql = sink[0].sql.toLowerCase().replaceAll(/\s+/gu, ' ');
    expect(sql).toContain("when 'codex' then 'codex' when 'openai' then 'openai'");
    expect(sql).toContain('group by day, agent');
  });

  it('degrades to an empty breakdown instead of throwing when no row comes back', async () => {
    const sink: CompiledQuery[] = [];
    const result = await getWallClockBreakdown(null, null, null, capturingDb(sink));
    expect(result).toEqual({ idle_gaps_ms: [], walked_away: 0, daily: [] });
  });

  it('coerces the row payload to numbers', async () => {
    const sink: CompiledQuery[] = [];
    const db = capturingDb(sink, [
      {
        idle_gaps_ms: ['90000', 23_000],
        walked_away: '1',
        daily: [
          {
            day: '2026-08-19',
            agent: 'codex',
            llm_ms: '26500',
            tool_ms: 15_000,
            idle_ms: '113000',
            requests: '8',
          },
        ],
      },
    ]);
    const result = await getWallClockBreakdown(null, null, null, db);
    expect(result).toEqual({
      idle_gaps_ms: [90_000, 23_000],
      walked_away: 1,
      daily: [
        {
          day: '2026-08-19',
          agent: 'codex',
          llm_ms: 26_500,
          tool_ms: 15_000,
          idle_ms: 113_000,
          requests: 8,
        },
      ],
    });
  });
});
