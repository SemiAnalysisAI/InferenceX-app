import type { PGlite } from '@electric-sql/pglite';
import type { TransactionSql } from 'postgres';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { decodeChartSeriesSummary, encodeChartSeriesSummary } from '../etl/chart-series-summary';
import type { ChartSeries } from '../etl/compute-chart-series';
import { writeTextAsBlocks } from '../etl/server-log-block-writer';
import { readServerLogBlocks } from '../server-log-blocks';
import { redactStoredChartSeries, redactStoredServerLogFile } from './stored-redaction';
import { migratedPglite, pgliteSql, type PgliteSql } from './test-pglite';

const KEY = Buffer.from('test-key');
const RAW =
  'peer 10.3.10.34:9405 ready\n' +
  'remote=[watchtower-navy-cn16.sub07252334101.gb200manual.oraclevcn.com]:29501\n';
const REDACTED =
  'peer ***REDACTED-51671e***:9405 ready\nremote=[watchtower-navy-cn16.***REDACTED***]:29501\n';

let db: PGlite;
let sql: PgliteSql;

beforeAll(async () => {
  db = await migratedPglite();
  sql = pgliteSql(db);
}, 30_000);

afterAll(async () => {
  await db?.close();
});

beforeEach(async () => {
  await db.exec('TRUNCATE server_logs, agentic_trace_replay RESTART IDENTITY CASCADE');
});

function redactFile(fileName: string, primary: boolean, write: boolean) {
  return sql.begin((tx) =>
    redactStoredServerLogFile(
      tx as unknown as TransactionSql,
      { logId: '1', fileName, primary },
      KEY,
      write,
    ),
  );
}

async function stored() {
  const [row] = await sql<{ chart_series: ChartSeries; summary: Uint8Array }[]>`
    select chart_series, chart_series_summary_gz as summary
    from agentic_trace_replay where id = 5
  `;
  return { series: row!.chart_series, summary: decodeChartSeriesSummary(row!.summary) };
}

async function storedLogs() {
  const [log] = await sql<{ server_log: string }[]>`select server_log from server_logs`;
  const [file] = await sql<{ log_text: string }[]>`select log_text from server_log_files`;
  return { primary: log!.server_log, child: file!.log_text };
}

describe('redactStoredServerLogFile', () => {
  beforeEach(async () => {
    await sql`
      insert into server_logs (server_log, file_name, files_complete)
      values (${RAW}, 'results/server.log', true)
    `;
    await sql`
      insert into server_log_files (server_log_id, file_name, log_text)
      values (1, 'results/router.log', ${RAW})
    `;
    await sql.begin((tx) =>
      writeTextAsBlocks(tx as unknown as TransactionSql, 1, 'results/router.log', RAW),
    );
  });

  it('reports a block-backed file in a dry run without writing', async () => {
    expect(await redactFile('results/router.log', false, false)).toEqual({
      changed: true,
      blockBacked: true,
    });
    expect(await storedLogs()).toEqual({ primary: RAW, child: RAW });
  });

  it('rewrites the text and rebuilds blocks that decode to it', async () => {
    expect(await redactFile('results/router.log', false, true)).toEqual({
      changed: true,
      blockBacked: true,
    });
    expect(await redactFile('results/server.log', true, true)).toEqual({
      changed: true,
      blockBacked: false,
    });

    expect(await storedLogs()).toEqual({ primary: REDACTED, child: REDACTED });
    const blocks = await sql<
      { char_offset: number; char_count: number; ascii: boolean; data: Uint8Array }[]
    >`
      select char_offset, char_count, ascii, data from server_log_blocks
      where server_log_id = 1 and file_name = 'results/router.log'
      order by block_index
    `;
    const decoded = readServerLogBlocks(
      blocks.map((block) => ({
        charOffset: block.char_offset,
        charCount: block.char_count,
        ascii: block.ascii,
        data: block.data,
      })),
      0,
      REDACTED.length,
    );
    expect(decoded).toBe(REDACTED);
    expect(await sql`select char_count, block_count from server_log_block_files`).toEqual([
      { char_count: REDACTED.length, block_count: 1 },
    ]);
    expect(await sql`select count(*)::int as n from server_log_blocks`).toEqual([{ n: 1 }]);
  });

  it('finds nothing left to change in redacted text', async () => {
    await redactFile('results/router.log', false, true);

    expect(await redactFile('results/router.log', false, true)).toEqual({
      changed: false,
      blockBacked: false,
    });
  });
});

function sourceIdentity(role: string, endpointUrl: string) {
  return {
    id: `trtllm|${role}|${endpointUrl}`,
    adapter: 'trtllm',
    role,
    endpointUrl,
    nativeRole: role,
    workerId: null,
    dpRank: null,
    engine: null,
  };
}

function chartSeries(prefillUrl: string, decodeUrl: string, labels: string[]): ChartSeries {
  const empty = {
    kvCacheUsage: [],
    prefixCacheHitRate: [],
    queueDepth: [],
    promptTokensBySource: {},
    prefixCacheHitsTps: [],
    hostKvCacheUsage: [],
    kvCacheUsageByEngine: [],
  };
  return {
    ...empty,
    version: 20,
    startNs: 0,
    endNs: 1e9,
    durationS: 1,
    timeslicesCount: 1,
    prefillTps: [],
    decodeTps: [],
    kvCacheUsageByEngine: labels.map((engineLabel) => ({ engineLabel, points: [] })),
    metricSources: [
      { ...empty, source: sourceIdentity('prefill', prefillUrl), promptTps: [], generationTps: [] },
      { ...empty, source: sourceIdentity('decode', decodeUrl), promptTps: [], generationTps: [] },
    ] as ChartSeries['metricSources'],
  };
}

describe('redactStoredChartSeries', () => {
  const raw = chartSeries('http://10.3.10.34:9405/metrics', 'http://10.3.10.35:9405/metrics', [
    '10.3.10.34:9405',
    '10.3.10.35:9405',
  ]);
  const expected = chartSeries(
    'http://***REDACTED-51671e***:9405/metrics',
    'http://***REDACTED-050a41***:9405/metrics',
    ['***REDACTED-51671e***:9405', '***REDACTED-050a41***:9405'],
  );

  beforeEach(async () => {
    const json = JSON.stringify(raw);
    await sql`
      insert into agentic_trace_replay (id, chart_series, chart_series_summary_gz)
      values (5, ${json}::jsonb, ${encodeChartSeriesSummary(json)})
    `;
  });

  it('leaves both columns alone in a dry run', async () => {
    expect(await redactStoredChartSeries(sql, 5, KEY, false)).toEqual({
      series: true,
      summary: true,
    });
    const { series } = await stored();
    expect(series).toEqual(raw);
  });

  it('redacts chart_series and its summary to the same tags, once', async () => {
    expect(await redactStoredChartSeries(sql, 5, KEY, true)).toEqual({
      series: true,
      summary: true,
    });

    const { series, summary } = await stored();
    expect(series).toEqual(expected);
    expect(summary.metricSources).toEqual(expected.metricSources.map(({ source }) => ({ source })));
    expect(summary.kvCacheUsageByEngine.map((engine) => engine.engineLabel)).toEqual([
      '***REDACTED-51671e***:9405',
      '***REDACTED-050a41***:9405',
    ]);
    expect(await redactStoredChartSeries(sql, 5, KEY, true)).toEqual({
      series: false,
      summary: false,
    });
  });
});
