import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import {
  DB_MODEL_TO_DISPLAY,
  FRAMEWORK_KEYS,
  GPU_KEYS,
  PRECISION_KEYS,
  SPEC_METHOD_KEYS,
} from '@semianalysisai/inferencex-constants';
import { getDb } from '@semianalysisai/inferencex-db/connection';
import { z } from 'zod';

const MAX_ROWS = 5_000;

/**
 * Defense-in-depth query filter. The readonly DB role enforces permissions,
 * but we also reject obviously bad queries before they hit the wire.
 */
const BLOCKED_PATTERN =
  /\b(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|TRUNCATE|GRANT|REVOKE|COPY|EXEC|SET|RESET|PREPARE|EXECUTE|DO)\b/i;

/** Max execution time for query_sql calls (ms). */
const QUERY_TIMEOUT_MS = 5_000;

// ── Enum arrays for JSON Schema constraints ──────────────────────────────
const HW_ENUM = [...GPU_KEYS].sort() as [string, ...string[]];
const MODEL_ENUM = Object.keys(DB_MODEL_TO_DISPLAY).sort() as [string, ...string[]];
const FW_ENUM = [...FRAMEWORK_KEYS].sort() as [string, ...string[]];
const PREC_ENUM = [...PRECISION_KEYS].sort() as [string, ...string[]];
const SPEC_ENUM = [...SPEC_METHOD_KEYS].sort() as [string, ...string[]];

const modelMapping = Object.entries(DB_MODEL_TO_DISPLAY)
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([k, v]) => `${k}=${v}`)
  .join(', ');

/**
 * Server instructions — compact (<2KB) so Claude Code doesn't truncate.
 * Contains only what agents need to pick the right tool on the first call.
 */
const SERVER_INSTRUCTIONS = `InferenceX: ML inference benchmark database. Query GPU performance across hardware and frameworks.
Models: ${modelMapping}.
Key tool: get_latest_benchmarks — filters by hardware, model, framework, precision, spec_method, disagg, isl, osl, conc. Returns metrics JSONB with keys: median_ttft, p99_ttft, median_tpot, p99_tpot, tput_per_gpu, output_tput_per_gpu, median_itl, median_e2el (all in seconds; throughput in tok/s/GPU).
For aggregations or custom queries use query_sql against the latest_benchmarks view joined to configs.`;

/**
 * Full overview returned by get_overview tool — no length constraint.
 */
const DOMAIN_OVERVIEW = `InferenceX benchmark database — ML inference performance data across GPU hardware and serving frameworks.

## Tables
- **configs** — Serving configs: (hardware, framework, model, precision, spec_method, disagg) + parallelism (TP/EP/DP per prefill/decode).
- **benchmark_results** — Perf metrics per config/concurrency/sequence-length/date. \`metrics\` JSONB holds all numbers.
- **availability** — Denormalized date×config availability.
- **eval_results** — Eval accuracy (e.g. gsm8k). Joined to configs via config_id.
- **workflow_runs** — GitHub Actions run metadata.
- **run_stats** — Per-hardware reliability (n_success/total).

## Key Views
- **latest_benchmarks** (materialized) — Latest successful benchmark per (config, conc, isl, osl). Use this for current data.

## Column Names
- **configs**: id, hardware, framework, model, precision, spec_method, disagg, is_multinode, prefill_tp, prefill_ep, prefill_dp_attention, prefill_num_workers, decode_tp, decode_ep, decode_dp_attention, decode_num_workers, num_prefill_gpu, num_decode_gpu
- **benchmark_results**: id, workflow_run_id (FK), config_id (FK), benchmark_type, date, isl, osl, conc, image, metrics (JSONB), error, server_log_id (FK)
- **latest_benchmarks** (materialized view): config_id, date, isl, osl, conc, image, metrics (JSONB) — latest per (config, conc, isl, osl) where error IS NULL
- **latest_workflow_runs** (view): id, github_run_id, run_attempt, name, status, conclusion, head_sha, head_branch, html_url, created_at, run_started_at, date
- **workflow_runs**: id, github_run_id, run_attempt, name, status, conclusion, head_sha, head_branch, html_url, created_at, run_started_at, date
- **eval_results**: id, workflow_run_id (FK), config_id (FK), task, date, isl, osl, conc, lm_eval_version, metrics (JSONB)
- **run_stats**: id, workflow_run_id (FK), date, hardware, n_success, total
- **availability**: model, isl, osl, precision, hardware, framework, spec_method, disagg, date (PK is all columns)
- **changelog_entries**: id, workflow_run_id (FK), date, base_ref, head_ref, config_keys (text[]), description, pr_link
- **server_logs**: id, server_log (text)

## Enum Values
- **hardware**: ${HW_ENUM.join(', ')}
- **model**: ${modelMapping}
- **framework**: ${FW_ENUM.join(', ')}
- **precision**: ${PREC_ENUM.join(', ')}
- **spec_method**: ${SPEC_ENUM.join(', ')}

## Metrics JSONB Keys (seconds; throughput in tok/s/GPU)
- **Throughput**: tput_per_gpu, output_tput_per_gpu, input_tput_per_gpu
- **TTFT**: median_ttft, mean_ttft, p99_ttft, std_ttft
- **TPOT**: median_tpot, mean_tpot, p99_tpot, std_tpot
- **ITL**: median_itl, mean_itl, p99_itl, std_itl
- **E2EL**: median_e2el, mean_e2el, p99_e2el, std_e2el
- **Interactivity**: median_intvty, mean_intvty, p99_intvty, std_intvty

## Common SQL
\`\`\`sql
SELECT c.hardware, (lb.metrics->>'median_ttft')::numeric AS ttft
FROM latest_benchmarks lb JOIN configs c ON c.id = lb.config_id
WHERE c.model = 'dsr1' AND lb.conc = 64
\`\`\``;

export function createServer(): McpServer {
  const server = new McpServer(
    { name: 'InferenceX', version: '1.0.0' },
    { instructions: SERVER_INSTRUCTIONS },
  );

  // ── Domain overview ──────────────────────────────────────────────────

  server.registerTool(
    'get_overview',
    {
      title: 'Get Overview',
      description:
        'Get full schema overview: tables, column names, enum values, metric keys, and example SQL. Call this if you need details beyond what the server instructions provide.',
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
      description: 'List all GPU hardware types with benchmark data.',
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
      description: 'List all models with benchmark data.',
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
        'List distinct (hardware, framework, model, precision, spec_method, disagg) config combos. Use to see what configurations exist before querying benchmarks.',
      inputSchema: {
        hardware: z.enum(HW_ENUM).optional().describe('Filter by GPU'),
        model: z.enum(MODEL_ENUM).optional().describe('Filter by model'),
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
        content: [{ type: 'text' as const, text: JSON.stringify(rows) }],
      };
    },
  );

  server.registerTool(
    'get_latest_benchmarks',
    {
      title: 'Get Latest Benchmarks',
      description:
        'Get latest benchmark results with config details and metrics JSONB. This is the primary query tool — use it before falling back to query_sql. All filters are optional; combine any subset. Use sort_by with limit to get top-N results by a metric.',
      inputSchema: {
        hardware: z.enum(HW_ENUM).optional().describe('GPU type'),
        model: z.enum(MODEL_ENUM).optional().describe('Model key'),
        framework: z.enum(FW_ENUM).optional().describe('Serving framework'),
        precision: z.enum(PREC_ENUM).optional().describe('Quantization precision'),
        spec_method: z.enum(SPEC_ENUM).optional().describe('Speculative decoding method'),
        disagg: z.boolean().optional().describe('Disaggregated prefill/decode'),
        isl: z.number().optional().describe('Input sequence length (e.g. 1024, 8192)'),
        osl: z.number().optional().describe('Output sequence length (e.g. 1024, 8192)'),
        conc: z.number().optional().describe('Concurrency level'),
        sort_by: z
          .enum([
            'median_ttft',
            'p99_ttft',
            'median_tpot',
            'p99_tpot',
            'tput_per_gpu',
            'output_tput_per_gpu',
            'median_itl',
            'median_e2el',
          ] as [string, ...string[]])
          .optional()
          .describe('Sort results by this metric key'),
        sort_order: z
          .enum(['asc', 'desc'] as [string, ...string[]])
          .optional()
          .describe('Sort direction (default: asc for latency, desc for throughput)'),
        metrics: z
          .array(z.string())
          .optional()
          .describe(
            'Metric keys to include. Defaults to [median_tpot, median_ttft, p99_tpot, p99_ttft, tput_per_gpu, output_tput_per_gpu, median_itl, median_e2el]. Pass ["all"] for full JSONB.',
          ),
        limit: z.number().optional().describe('Max rows (default 200, max 5000)'),
      },
      annotations: { readOnlyHint: true },
    },
    async ({
      hardware,
      model,
      framework,
      precision,
      spec_method,
      disagg,
      isl,
      osl,
      conc,
      sort_by,
      sort_order,
      metrics: requestedMetrics,
      limit,
    }) => {
      const db = getDb();
      const rowLimit = Math.min(limit ?? 200, MAX_ROWS);
      // Allowlisted sort keys to prevent SQL injection via JSONB key
      const SORT_KEYS = new Set([
        'median_ttft',
        'p99_ttft',
        'median_tpot',
        'p99_tpot',
        'tput_per_gpu',
        'output_tput_per_gpu',
        'median_itl',
        'median_e2el',
      ]);
      const safeSortKey = sort_by && SORT_KEYS.has(sort_by) ? sort_by : null;
      const throughputKeys = new Set(['tput_per_gpu', 'output_tput_per_gpu']);
      const dir = sort_order ?? (safeSortKey && throughputKeys.has(safeSortKey) ? 'desc' : 'asc');
      const orderClause = safeSortKey
        ? `(lb.metrics->>'${safeSortKey}')::numeric ${dir === 'desc' ? 'DESC' : 'ASC'} NULLS LAST, c.model, c.hardware`
        : 'c.model, c.hardware, c.framework, lb.conc';
      const rows = (await db`
        SELECT
          c.hardware, c.framework, c.model, c.precision, c.spec_method, c.disagg,
          lb.date, lb.isl, lb.osl, lb.conc, lb.metrics
        FROM latest_benchmarks lb
        JOIN configs c ON c.id = lb.config_id
        WHERE (${hardware ?? null}::text IS NULL OR c.hardware = ${hardware ?? null})
          AND (${model ?? null}::text IS NULL OR c.model = ${model ?? null})
          AND (${framework ?? null}::text IS NULL OR c.framework = ${framework ?? null})
          AND (${precision ?? null}::text IS NULL OR c.precision = ${precision ?? null})
          AND (${spec_method ?? null}::text IS NULL OR c.spec_method = ${spec_method ?? null})
          AND (${disagg ?? null}::bool IS NULL OR c.disagg = ${disagg ?? null})
          AND (${isl ?? null}::int IS NULL OR lb.isl = ${isl ?? null})
          AND (${osl ?? null}::int IS NULL OR lb.osl = ${osl ?? null})
          AND (${conc ?? null}::int IS NULL OR lb.conc = ${conc ?? null})
        ORDER BY ${db.unsafe(orderClause)}
        LIMIT ${rowLimit}
      `) as Record<string, unknown>[];

      // Default metrics to extract when no specific metrics requested.
      const DEFAULT_METRICS = [
        'median_tpot',
        'median_ttft',
        'p99_tpot',
        'p99_ttft',
        'tput_per_gpu',
        'output_tput_per_gpu',
        'median_itl',
        'median_e2el',
      ];
      const wantFull = requestedMetrics?.includes('all');
      const extractKeys = wantFull
        ? null
        : requestedMetrics?.length
          ? requestedMetrics
          : DEFAULT_METRICS;

      // Build filter set for stripping redundant fields
      const appliedFilters: Record<string, unknown> = {};
      if (hardware) appliedFilters.hardware = hardware;
      if (model) appliedFilters.model = model;
      if (framework) appliedFilters.framework = framework;
      if (precision) appliedFilters.precision = precision;
      if (spec_method) appliedFilters.spec_method = spec_method;
      if (disagg !== undefined) appliedFilters.disagg = disagg;
      if (isl) appliedFilters.isl = isl;
      if (osl) appliedFilters.osl = osl;
      if (conc) appliedFilters.conc = conc;

      const round = (v: unknown) => (typeof v === 'number' ? Math.round(v * 10000) / 10000 : v);

      const processedRows = rows.map((row) => {
        const m = row.metrics as Record<string, number> | null;
        const extracted: Record<string, unknown> = {};
        if (extractKeys) {
          for (const key of extractKeys) extracted[key] = round(m?.[key] ?? null);
        }
        const out: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(row)) {
          if (k === 'metrics') {
            if (wantFull) out.metrics = v;
            continue;
          }
          if (k in appliedFilters) continue;
          out[k] = v;
        }
        return { ...out, ...extracted };
      });

      const truncated = processedRows.length >= rowLimit;
      const hint = truncated ? 'Results truncated. Add more filters or increase limit.' : undefined;
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              ...(Object.keys(appliedFilters).length ? { filters: appliedFilters } : {}),
              rows: processedRows,
              count: processedRows.length,
              truncated,
              ...(hint ? { hint } : {}),
            }),
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
        'Run a read-only SQL SELECT. Do NOT use for simple benchmark lookups — use get_latest_benchmarks instead. Use this only for aggregations, GROUP BY, custom joins, or queries the other tools cannot handle.',
      inputSchema: {
        sql: z
          .string()
          .describe(
            "SQL SELECT query. Key tables: latest_benchmarks (join to configs via config_id). Columns: isl, osl, conc, metrics (JSONB). Extract metrics: (metrics->>'median_ttft')::numeric",
          ),
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
        const ac = new AbortController();
        const timer = setTimeout(() => ac.abort(), QUERY_TIMEOUT_MS);
        let rows: Record<string, unknown>[];
        try {
          rows = (await db.query(query, [], {
            fetchOptions: { signal: ac.signal },
          })) as Record<string, unknown>[];
        } finally {
          clearTimeout(timer);
        }
        const truncated = rows.length > MAX_ROWS;
        const result = truncated ? rows.slice(0, MAX_ROWS) : rows;
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({ rows: result, count: result.length, truncated }),
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

  return server;
}
