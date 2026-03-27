import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import {
  DB_MODEL_TO_DISPLAY,
  FRAMEWORK_KEYS,
  GPU_KEYS,
  METRIC_KEYS,
  PRECISION_KEYS,
  SPEC_METHOD_KEYS,
} from '@semianalysisai/inferencex-constants';
import { getDb } from '@semianalysisai/inferencex-db/connection';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const MAX_ROWS = 5_000;
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 250;

/** Simple in-memory IP rate limiter. Resets on cold start. */
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return false;
  }
  entry.count++;
  return entry.count > RATE_LIMIT_MAX;
}

/** Block write statements. The DB should already be read-only replica. */
const BLOCKED_PATTERN =
  /\b(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|TRUNCATE|GRANT|REVOKE|COPY|EXEC)\b/i;

const sorted = (s: Set<string>) => [...s].sort().join(', ');
const modelEnums = Object.entries(DB_MODEL_TO_DISPLAY)
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([k, v]) => `${k} (${v})`)
  .join(', ');

const DOMAIN_OVERVIEW = `InferenceX benchmark database — ML inference performance data across GPU hardware and serving frameworks.

## Tables

- **configs** — Unique serving configurations. Each row is a (hardware, framework, model, precision, spec_method, disagg) combo with parallelism settings (TP/EP/DP per prefill/decode phase).
- **benchmark_results** — Performance metrics (TTFT, TPOT, throughput, latency percentiles) per config/concurrency/sequence-length/date. Joined to configs via config_id. The \`metrics\` JSONB column holds all perf numbers.
- **availability** — Denormalized date x config availability lookup. Use this to find which dates have data for a given model/hardware combo.
- **eval_results** — Model evaluation results (e.g. gsm8k accuracy). Joined to configs via config_id.
- **workflow_runs** — GitHub Actions workflow run metadata (one run = one benchmark suite execution).
- **run_stats** — Per-hardware reliability stats (n_success / total) per workflow run.
- **changelog_entries** — Configuration change descriptions tied to workflow runs.
- **server_logs** / **benchmark_server_logs** — Raw server output for debugging.

## Key Views

- **latest_benchmarks** (materialized) — Latest successful benchmark per (config, concurrency, ISL, OSL). This is the primary view for current performance data — prefer this over benchmark_results for most queries.
- **latest_workflow_runs** — Latest attempt per GitHub run ID.

## Enum Values

- **hardware**: ${sorted(GPU_KEYS)}
- **model**: ${modelEnums}
- **framework**: ${sorted(FRAMEWORK_KEYS)}
- **precision**: ${sorted(PRECISION_KEYS)}
- **spec_method**: ${sorted(SPEC_METHOD_KEYS)}

## Metrics JSONB Keys (benchmark_results.metrics)

All latency values are in seconds. Throughput values are tokens/sec/GPU.

- **Throughput**: tput_per_gpu, output_tput_per_gpu, input_tput_per_gpu
- **TTFT** (time to first token): median_ttft, mean_ttft, p99_ttft, std_ttft
- **TPOT** (time per output token): median_tpot, mean_tpot, p99_tpot, std_tpot
- **ITL** (inter-token latency): median_itl, mean_itl, p99_itl, std_itl
- **E2EL** (end-to-end latency): median_e2el, mean_e2el, p99_e2el, std_e2el
- **Interactivity**: median_intvty, mean_intvty, p99_intvty, std_intvty

Full set: ${sorted(METRIC_KEYS)}

## Common Patterns

- Join benchmark_results or latest_benchmarks to configs: \`JOIN configs c ON c.id = lb.config_id\`
- Filter by hardware: \`WHERE c.hardware = 'h100'\`
- Extract a metric: \`(lb.metrics->>'median_ttft')::numeric\``;

function createServer(): McpServer {
  const server = new McpServer({
    name: 'InferenceX',
    version: '1.0.0',
  });

  // ── Domain overview ──────────────────────────────────────────────────

  server.registerTool(
    'get_overview',
    {
      title: 'Get Overview',
      description:
        'Get a domain overview of the InferenceX database: table descriptions, relationships, enum values, and common query patterns. Call this first before writing any queries.',
      annotations: { readOnlyHint: true },
    },
    async () => ({
      content: [{ type: 'text' as const, text: DOMAIN_OVERVIEW }],
    }),
  );

  // ── High-level query tools ───────────────────────────────────────────

  server.registerTool(
    'list_hardware',
    {
      title: 'List Hardware',
      description: 'List all distinct GPU hardware types that have benchmark configs.',
      annotations: { readOnlyHint: true },
    },
    async () => {
      const db = getDb();
      const rows = (await db`SELECT DISTINCT hardware FROM configs ORDER BY hardware`) as {
        hardware: string;
      }[];
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(rows.map((r) => r.hardware)),
          },
        ],
      };
    },
  );

  server.registerTool(
    'list_models',
    {
      title: 'List Models',
      description: 'List all distinct models that have benchmark configs.',
      annotations: { readOnlyHint: true },
    },
    async () => {
      const db = getDb();
      const rows = (await db`SELECT DISTINCT model FROM configs ORDER BY model`) as {
        model: string;
      }[];
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(rows.map((r) => r.model)),
          },
        ],
      };
    },
  );

  server.registerTool(
    'list_configs',
    {
      title: 'List Configs',
      description:
        'List distinct (hardware, framework, model, precision) config combos. Optionally filter by hardware or model.',
      inputSchema: {
        hardware: z.string().optional().describe('Filter by hardware (e.g. "h100")'),
        model: z.string().optional().describe('Filter by model (e.g. "llama70b")'),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ hardware, model }) => {
      const db = getDb();
      const rows = (await db`
        SELECT DISTINCT hardware, framework, model, precision, spec_method, disagg
        FROM configs
        WHERE (${hardware ?? null}::text IS NULL OR hardware = ${hardware ?? null})
          AND (${model ?? null}::text IS NULL OR model = ${model ?? null})
        ORDER BY model, hardware, framework
      `) as Record<string, unknown>[];
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(rows, null, 2) }],
      };
    },
  );

  server.registerTool(
    'get_latest_benchmarks',
    {
      title: 'Get Latest Benchmarks',
      description:
        'Get the latest benchmark results joined with config details. Returns perf metrics (TTFT, TPOT, throughput, latency) for each config/concurrency/sequence-length combo. Filter by hardware, model, or both.',
      inputSchema: {
        hardware: z.string().optional().describe('Filter by hardware (e.g. "h100")'),
        model: z.string().optional().describe('Filter by model (e.g. "llama70b")'),
        isl: z.number().optional().describe('Filter by input sequence length'),
        osl: z.number().optional().describe('Filter by output sequence length'),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ hardware, model, isl, osl }) => {
      const db = getDb();
      const rows = (await db`
        SELECT
          c.hardware, c.framework, c.model, c.precision, c.spec_method, c.disagg,
          lb.date, lb.isl, lb.osl, lb.conc, lb.metrics
        FROM latest_benchmarks lb
        JOIN configs c ON c.id = lb.config_id
        WHERE (${hardware ?? null}::text IS NULL OR c.hardware = ${hardware ?? null})
          AND (${model ?? null}::text IS NULL OR c.model = ${model ?? null})
          AND (${isl ?? null}::int IS NULL OR lb.isl = ${isl ?? null})
          AND (${osl ?? null}::int IS NULL OR lb.osl = ${osl ?? null})
        ORDER BY c.model, c.hardware, c.framework, lb.conc
      `) as Record<string, unknown>[];
      const truncated = rows.length > MAX_ROWS;
      const result = truncated ? rows.slice(0, MAX_ROWS) : rows;
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({ rows: result, count: result.length, truncated }, null, 2),
          },
        ],
      };
    },
  );

  // ── Raw SQL escape hatch ─────────────────────────────────────────────

  server.registerTool(
    'query_sql',
    {
      title: 'Query SQL',
      description:
        'Run a read-only SQL query against the InferenceX benchmark database. Returns up to 5,000 rows as JSON. Only SELECT queries are allowed. Prefer the high-level tools (get_latest_benchmarks, list_configs, etc.) when possible — use this for custom joins, aggregations, or queries not covered by other tools.',
      inputSchema: {
        sql: z.string().describe('The SQL SELECT query to execute'),
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async ({ sql: query }) => {
      if (BLOCKED_PATTERN.test(query)) {
        return {
          content: [{ type: 'text' as const, text: 'Only SELECT queries are allowed.' }],
          isError: true,
        };
      }
      const db = getDb();
      try {
        const rows = (await db.query(query, [])) as Record<string, unknown>[];
        const truncated = rows.length > MAX_ROWS;
        const result = truncated ? rows.slice(0, MAX_ROWS) : rows;
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({ rows: result, count: result.length, truncated }, null, 2),
            },
          ],
        };
      } catch (err) {
        return {
          content: [
            {
              type: 'text' as const,
              text: `SQL error: ${err instanceof Error ? err.message : String(err)}`,
            },
          ],
          isError: true,
        };
      }
    },
  );

  // ── Schema introspection ─────────────────────────────────────────────

  server.registerTool(
    'get_schema',
    {
      title: 'Get Schema',
      description:
        'Get the full database schema grouped by table: columns, types, nullability, defaults, and descriptions. For a quicker orientation, use get_overview instead.',
      annotations: { readOnlyHint: true },
    },
    async () => {
      const db = getDb();
      const rows = (await db`
        SELECT
          t.table_name,
          c.column_name,
          c.data_type,
          c.is_nullable,
          c.column_default,
          pgd.description
        FROM information_schema.tables t
        JOIN information_schema.columns c
          ON c.table_schema = t.table_schema AND c.table_name = t.table_name
        LEFT JOIN pg_catalog.pg_statio_all_tables st
          ON st.schemaname = t.table_schema AND st.relname = t.table_name
        LEFT JOIN pg_catalog.pg_description pgd
          ON pgd.objoid = st.relid AND pgd.objsubid = c.ordinal_position
        WHERE t.table_schema = 'public'
        ORDER BY t.table_name, c.ordinal_position
      `) as Record<string, unknown>[];

      const grouped: Record<
        string,
        {
          columns: Record<
            string,
            { type: string; nullable: boolean; default?: string; description?: string }
          >;
        }
      > = {};
      for (const row of rows) {
        const r = row as {
          table_name: string;
          column_name: string;
          data_type: string;
          is_nullable: string;
          column_default: string | null;
          description: string | null;
        };
        const table = (grouped[r.table_name] ??= { columns: {} });
        table.columns[r.column_name] = {
          type: r.data_type,
          nullable: r.is_nullable === 'YES',
          ...(r.column_default ? { default: r.column_default } : {}),
          ...(r.description ? { description: r.description } : {}),
        };
      }

      return {
        content: [{ type: 'text' as const, text: JSON.stringify(grouped, null, 2) }],
      };
    },
  );

  server.registerTool(
    'list_views',
    {
      title: 'List Views',
      description: 'List all views and materialized views with their SQL definitions.',
      annotations: { readOnlyHint: true },
    },
    async () => {
      const db = getDb();
      const views = (await db`
        SELECT viewname AS name, 'view' AS type, definition
        FROM pg_views WHERE schemaname = 'public'
        UNION ALL
        SELECT matviewname AS name, 'materialized_view' AS type, definition
        FROM pg_matviews WHERE schemaname = 'public'
        ORDER BY name
      `) as Record<string, unknown>[];
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(views, null, 2) }],
      };
    },
  );

  return server;
}

function getClientIp(request: Request): string {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    request.headers.get('x-real-ip') ??
    'unknown'
  );
}

async function handleMcpRequest(request: Request): Promise<Response> {
  const ip = getClientIp(request);
  if (isRateLimited(ip)) {
    return new Response('Too Many Requests', {
      status: 429,
      headers: { 'Retry-After': '60' },
    });
  }

  const server = createServer();
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });

  await server.connect(transport);

  try {
    return await transport.handleRequest(request);
  } finally {
    await transport.close();
    await server.close();
  }
}

export async function POST(request: Request): Promise<Response> {
  return handleMcpRequest(request);
}

export async function GET(request: Request): Promise<Response> {
  const accept = request.headers.get('accept') ?? '';
  if (accept.includes('text/html') || !request.headers.get('content-type')) {
    const url = new URL('/api/mcp', request.url);
    return Response.json(
      {
        error: 'This is an MCP (Model Context Protocol) endpoint, not a REST API.',
        setup: {
          description:
            'Add this to your Claude Code settings (.claude/settings.json) or MCP client config:',
          mcpServers: {
            inferencex: { url: url.href },
          },
        },
      },
      { status: 400 },
    );
  }
  return handleMcpRequest(request);
}

export async function DELETE(request: Request): Promise<Response> {
  return handleMcpRequest(request);
}
