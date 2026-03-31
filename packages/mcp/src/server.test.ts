import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createServer } from './server.js';

// ── Mock DB ────────────────────────────────────────────────────────────
// returns a postgres tagged-template function. We mock it as a
// callable that captures the query and returns canned rows.

const { mockState, mockDb } = vi.hoisted(() => {
  const mockState = {
    dbRows: [] as Record<string, unknown>[],
    queryError: null as Error | null,
  };
  const mockDb = Object.assign(
    // Tagged template call: db`SELECT ...`
    async () => mockState.dbRows,
    {
      unsafe: async () => {
        if (mockState.queryError) throw mockState.queryError;
        return mockState.dbRows;
      },
    },
  );
  return { mockState, mockDb };
});

vi.mock('@semianalysisai/inferencex-db/etl/db-utils', () => ({
  createAdminSql: () => mockDb,
}));

// ── Helpers ────────────────────────────────────────────────────────────

let client: Client;
let closeServer: () => Promise<void>;

async function setup() {
  const server = createServer();
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  client = new Client({ name: 'test', version: '0.1' });
  await client.connect(clientTransport);
  closeServer = async () => {
    await client.close();
    await server.close();
  };
}

function callTool(name: string, args: Record<string, unknown> = {}) {
  return client.callTool({ name, arguments: args });
}

function parseText(result: Awaited<ReturnType<typeof callTool>>): unknown {
  const content = result.content as { type: string; text: string }[];
  return JSON.parse(content[0].text);
}

beforeEach(async () => {
  mockState.dbRows = [];
  mockState.queryError = null;
  await setup();
});

afterEach(async () => {
  await closeServer();
});

// ── Tests ──────────────────────────────────────────────────────────────

describe('tool listing', () => {
  it('registers all expected tools', async () => {
    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name).sort();
    expect(names).toEqual([
      'get_latest_benchmarks',
      'get_overview',
      'list_configs',
      'list_hardware',
      'list_models',
      'query_sql',
    ]);
  });

  it('all tools are marked readOnlyHint', async () => {
    const { tools } = await client.listTools();
    for (const tool of tools) {
      expect(tool.annotations?.readOnlyHint).toBe(true);
    }
  });
});

describe('get_overview', () => {
  it('returns domain overview text', async () => {
    const result = await callTool('get_overview');
    const content = result.content as { type: string; text: string }[];
    expect(content[0].text).toContain('InferenceX benchmark database');
    expect(content[0].text).toContain('latest_benchmarks');
  });
});

describe('list_hardware', () => {
  it('returns hardware list from DB', async () => {
    mockState.dbRows = [{ hardware: 'h100' }, { hardware: 'b200' }];
    const result = parseText(await callTool('list_hardware'));
    expect(result).toEqual(['h100', 'b200']);
  });
});

describe('list_models', () => {
  it('returns model list from DB', async () => {
    mockState.dbRows = [{ model: 'dsr1' }, { model: 'llama70b' }];
    const result = parseText(await callTool('list_models'));
    expect(result).toEqual(['dsr1', 'llama70b']);
  });
});

describe('list_configs', () => {
  it('returns config combos', async () => {
    mockState.dbRows = [
      {
        hardware: 'h100',
        framework: 'vllm',
        model: 'dsr1',
        precision: 'fp8',
        spec_method: 'none',
        disagg: false,
      },
    ];
    const result = parseText(await callTool('list_configs'));
    expect(result).toEqual(mockState.dbRows);
  });
});

describe('get_latest_benchmarks', () => {
  const baseRow = {
    hardware: 'h100',
    framework: 'vllm',
    model: 'dsr1',
    precision: 'fp8',
    spec_method: 'none',
    disagg: false,
    num_prefill_gpu: 8,
    num_decode_gpu: 8,
    date: '2026-03-25',
    isl: 1024,
    osl: 1024,
    conc: 64,
    metrics: {
      median_ttft: 0.123456789,
      median_tpot: 0.0045,
      p99_ttft: 0.25,
      p99_tpot: 0.008,
      tput_per_gpu: 500.123,
      output_tput_per_gpu: 300.999,
      median_itl: 0.006,
      median_e2el: 1.5,
      extra_metric: 42,
    },
  };

  it('extracts default metrics and rounds to 4 decimal places', async () => {
    mockState.dbRows = [baseRow];
    const result = parseText(await callTool('get_latest_benchmarks')) as Record<string, unknown>;
    const row = (result.rows as Record<string, unknown>[])[0];

    expect(row.median_ttft).toBe(0.1235); // rounded from 0.123456789
    expect(row.median_tpot).toBe(0.0045);
    expect(row.tput_per_gpu).toBe(500.123);
    expect(row.output_tput_per_gpu).toBe(300.999);
    // extra_metric should NOT appear (not in default set)
    expect(row).not.toHaveProperty('extra_metric');
    // raw metrics blob should NOT appear
    expect(row).not.toHaveProperty('metrics');
  });

  it('strips filtered fields from rows', async () => {
    mockState.dbRows = [baseRow];
    const result = parseText(
      await callTool('get_latest_benchmarks', { hardware: 'h100', model: 'dsr1' }),
    ) as Record<string, unknown>;
    const row = (result.rows as Record<string, unknown>[])[0];

    // Filtered fields should be in filters, not in each row
    expect(result.filters).toEqual({ hardware: 'h100', model: 'dsr1' });
    expect(row).not.toHaveProperty('hardware');
    expect(row).not.toHaveProperty('model');
    // Non-filtered fields still present
    expect(row).toHaveProperty('framework');
    expect(row).toHaveProperty('precision');
  });

  it('includes num_prefill_gpu and num_decode_gpu in output', async () => {
    mockState.dbRows = [baseRow];
    const result = parseText(await callTool('get_latest_benchmarks')) as Record<string, unknown>;
    const row = (result.rows as Record<string, unknown>[])[0];
    expect(row.num_prefill_gpu).toBe(8);
    expect(row.num_decode_gpu).toBe(8);
  });

  it('returns full metrics blob when metrics=["all"]', async () => {
    mockState.dbRows = [baseRow];
    const result = parseText(
      await callTool('get_latest_benchmarks', { metrics: ['all'] }),
    ) as Record<string, unknown>;
    const row = (result.rows as Record<string, unknown>[])[0];

    expect(row.metrics).toEqual(baseRow.metrics);
    // Should NOT have extracted individual keys alongside the blob
    expect(row).not.toHaveProperty('median_ttft');
  });

  it('extracts only requested metrics', async () => {
    mockState.dbRows = [baseRow];
    const result = parseText(
      await callTool('get_latest_benchmarks', { metrics: ['median_ttft', 'tput_per_gpu'] }),
    ) as Record<string, unknown>;
    const row = (result.rows as Record<string, unknown>[])[0];

    expect(row).toHaveProperty('median_ttft');
    expect(row).toHaveProperty('tput_per_gpu');
    expect(row).not.toHaveProperty('median_tpot');
    expect(row).not.toHaveProperty('p99_ttft');
  });

  it('returns null for missing metric keys', async () => {
    mockState.dbRows = [{ ...baseRow, metrics: { median_ttft: 0.1 } }];
    const result = parseText(await callTool('get_latest_benchmarks')) as Record<string, unknown>;
    const row = (result.rows as Record<string, unknown>[])[0];

    expect(row.median_ttft).toBe(0.1);
    expect(row.median_tpot).toBeNull();
    expect(row.tput_per_gpu).toBeNull();
  });

  it('handles null metrics gracefully', async () => {
    mockState.dbRows = [{ ...baseRow, metrics: null }];
    const result = parseText(await callTool('get_latest_benchmarks')) as Record<string, unknown>;
    const row = (result.rows as Record<string, unknown>[])[0];

    expect(row.median_ttft).toBeNull();
    expect(row.median_tpot).toBeNull();
  });

  it('reports truncated when rows hit limit', async () => {
    mockState.dbRows = Array.from({ length: 3 }, (_, i) => ({
      ...baseRow,
      conc: i + 1,
    }));
    const result = parseText(await callTool('get_latest_benchmarks', { limit: 3 })) as Record<
      string,
      unknown
    >;
    expect(result.count).toBe(3);
    expect(result.truncated).toBe(true);
    expect(result.hint).toContain('truncated');
  });

  it('reports not truncated when under limit', async () => {
    mockState.dbRows = [baseRow];
    const result = parseText(await callTool('get_latest_benchmarks')) as Record<string, unknown>;
    expect(result.truncated).toBe(false);
    expect(result).not.toHaveProperty('hint');
  });

  it('omits filters key when no filters applied', async () => {
    mockState.dbRows = [baseRow];
    const result = parseText(await callTool('get_latest_benchmarks')) as Record<string, unknown>;
    expect(result).not.toHaveProperty('filters');
  });
});

describe('query_sql', () => {
  it('returns rows from valid SELECT', async () => {
    mockState.dbRows = [{ hardware: 'h100', ttft: 0.1 }];
    const result = parseText(
      await callTool('query_sql', { sql: 'SELECT hardware FROM configs' }),
    ) as Record<string, unknown>;
    expect(result.rows).toEqual(mockState.dbRows);
    expect(result.count).toBe(1);
    expect(result.truncated).toBe(false);
  });

  it('blocks INSERT statements', async () => {
    const result = await callTool('query_sql', {
      sql: "INSERT INTO configs (hardware) VALUES ('h100')",
    });
    expect(result.isError).toBe(true);
    const content = result.content as { type: string; text: string }[];
    expect(content[0].text).toBe('Only SELECT queries are allowed.');
  });

  it.each(['DELETE', 'UPDATE', 'DROP', 'ALTER', 'CREATE', 'TRUNCATE'])(
    'blocks %s statements',
    async (keyword) => {
      const result = await callTool('query_sql', {
        sql: `${keyword} FROM configs`,
      });
      expect(result.isError).toBe(true);
    },
  );

  it('returns SQL error as isError result', async () => {
    mockState.queryError = new Error('relation "foo" does not exist');
    const result = await callTool('query_sql', { sql: 'SELECT * FROM foo' });
    expect(result.isError).toBe(true);
    const content = result.content as { type: string; text: string }[];
    expect(content[0].text).toContain('relation "foo" does not exist');
  });
});
