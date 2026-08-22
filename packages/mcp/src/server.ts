import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import {
  DB_MODEL_TO_DISPLAY,
  FRAMEWORK_KEYS,
  GPU_KEYS,
  PRECISION_KEYS,
  SPEC_METHOD_KEYS,
} from '@semianalysisai/inferencex-constants';
import { resolveDatabaseConnection } from '@semianalysisai/inferencex-db/connection';
import postgres from 'postgres';
import { z } from 'zod';

const connection = resolveDatabaseConnection({
  envVar: 'DATABASE_READONLY_URL',
  driver: 'postgres',
  ssl: process.env.DATABASE_SSL,
});
const db = postgres(connection.url, { max: 5, ssl: connection.ssl });
const MAX_ROWS = 5_000;

const roundMetric = (v: unknown) => (typeof v === 'number' ? Math.round(v * 10000) / 10000 : v);

/**
 * Defense-in-depth query filter. The readonly DB role enforces permissions,
 * but we also reject obviously bad queries before they hit the wire.
 */
const BLOCKED_PATTERN =
  /\b(?:INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|TRUNCATE|GRANT|REVOKE|COPY|EXEC|SET|RESET|PREPARE|EXECUTE|DO)\b/iu;

/** Max execution time for query_sql calls (ms). */
const QUERY_TIMEOUT_MS = 5_000;

// ── Enum arrays for JSON Schema constraints ──────────────────────────────
const HW_ENUM = [...GPU_KEYS].toSorted() as [string, ...string[]];
const MODEL_ENUM = Object.keys(DB_MODEL_TO_DISPLAY).toSorted() as [string, ...string[]];
const FW_ENUM = [...FRAMEWORK_KEYS].toSorted() as [string, ...string[]];
const PREC_ENUM = [...PRECISION_KEYS].toSorted() as [string, ...string[]];
const SPEC_ENUM = [...SPEC_METHOD_KEYS].toSorted() as [string, ...string[]];

const modelMapping = Object.entries(DB_MODEL_TO_DISPLAY)
  .toSorted(([a], [b]) => a.localeCompare(b))
  .map(([k, v]) => `${k}=${v}`)
  .join(', ');

/**
 * Server instructions — compact (<2KB) so Claude Code doesn't truncate.
 * Contains only what agents need to pick the right tool on the first call.
 */
const SERVER_INSTRUCTIONS = `InferenceX: ML inference benchmark database. Query GPU performance across hardware and frameworks.
Models: ${modelMapping}.
Key tool: get_latest_benchmarks filters by hardware, model, framework, precision, spec_method, disagg, num_gpu, isl, osl, and conc. It returns config details (including num_prefill_gpu and num_decode_gpu) plus selected metric keys. Pass metrics=["all"] for the complete metrics JSONB object. Common keys include median_ttft, p99_ttft, median_tpot, p99_tpot, tput_per_gpu, output_tput_per_gpu, median_itl, and median_e2el.
For aggregations or custom queries use query_sql against the latest_benchmarks view joined to configs.`;

/**
 * Full overview returned by get_overview tool — no length constraint.
 */
const DOMAIN_OVERVIEW = `InferenceX benchmark database. It contains ML inference performance data across GPU hardware and serving frameworks.

## Tables
- **configs** stores serving identity and prefill/decode topology.
- **benchmark_results** stores one scenario point per workflow, config, recipe, sequence, offload mode, and concurrency. Measurements stay in \`metrics\` JSONB. Per-worker power data stays in \`workers\` JSONB.
- **workflow_runs**, **changelog_entries**, and **run_stats** store GitHub run metadata, reviewed changelog metadata, and hardware reliability counts.
- **availability** is the denormalized model/config/scenario/date index used by selectors.
- **eval_results** and **eval_samples** store aggregate and per-prompt evaluation results.
- **agentic_trace_replay** stores compressed trace exports and precomputed aggregate, chart, and request-timeline JSONB.
- **datasets**, **dataset_conversations**, and **run_datasets** store agentic dataset metadata, conversation structures, and workflow-to-dataset links.
- **server_logs** stores benchmark server logs. **user_feedback** stores encrypted feedback fields.

## Key Views
- **latest_workflow_runs** keeps the highest attempt for each GitHub run.
- **latest_benchmarks** is a materialized view of the newest successful logical curve for each config, benchmark type, sequence, offload mode, recipe fingerprint, and concurrency. It can carry points from same-image append-only history. Producer identity remains in \`workflow_run_id\`; logical snapshot identity is in \`snapshot_workflow_run_id\`.

## Column Names
- **configs**: id, hardware, framework, model, precision, spec_method, disagg, is_multinode, prefill_tp, prefill_ep, prefill_dp_attention, prefill_num_workers, decode_tp, decode_ep, decode_dp_attention, decode_num_workers, num_prefill_gpu, num_decode_gpu
- **benchmark_results**: id, workflow_run_id (FK), config_id (FK), benchmark_type, date, isl, osl, conc, image, metrics (JSONB), error, server_log_id (FK), workers (JSONB), offload_mode, trace_replay_id (FK), recipe_fingerprint
- **latest_benchmarks**: all benchmark_results columns plus snapshot_date and snapshot_workflow_run_id
- **workflow_runs** and **latest_workflow_runs**: id, github_run_id, run_attempt, name, status, conclusion, head_sha, head_branch, html_url, created_at, run_started_at, date, append_only
- **changelog_entries**: id, workflow_run_id (FK), date, base_ref, head_ref, config_keys (text[]), description, pr_link, append_only
- **run_stats**: id, workflow_run_id (FK), date, hardware, n_success, total
- **availability**: model, isl, osl, precision, hardware, framework, spec_method, disagg, date, benchmark_type (unique natural key, NULLS NOT DISTINCT)
- **eval_results**: id, workflow_run_id (FK), config_id (FK), task, date, isl, osl, conc, lm_eval_version, metrics (JSONB)
- **eval_samples**: id, eval_result_id (FK), doc_id, prompt, target, response, passed, score, metrics (JSONB), data (JSONB)
- **agentic_trace_replay**: id, profile_export_jsonl_gz, profile_export_uncompressed_size, server_metrics_csv, server_metrics_csv_size, created_at, server_metrics_json_gz, server_metrics_json_uncompressed_size, aggregate_stats (JSONB), chart_series (JSONB), request_timeline (JSONB)
- **datasets**: id, slug, label, variant, description, hf_url, license, conversation_count, summary (JSONB), chart_data (JSONB), dataset_version, ingested_at
- **dataset_conversations**: id, dataset_id (FK), conv_id, models (text[]), num_turns, num_subagent_groups, total_in, total_out, total_cached, structure (JSONB)
- **run_datasets**: workflow_run_id (FK), dataset_slug, created_at
- **server_logs**: id, server_log
- **user_feedback**: id, created_at, doing_well_ciphertext, doing_poorly_ciphertext, want_to_see_ciphertext, user_agent_ciphertext, page_path_ciphertext

## Enum Values
- **hardware**: ${HW_ENUM.join(', ')}
- **model**: ${modelMapping}
- **framework**: ${FW_ENUM.join(', ')}
- **precision**: ${PREC_ENUM.join(', ')}
- **spec_method**: ${SPEC_ENUM.join(', ')}

## Metrics JSONB
Metrics are artifact-dependent and remain in JSONB. There are no metric-specific columns on benchmark_results or latest_benchmarks.
- **Throughput**: tput_per_gpu, output_tput_per_gpu, input_tput_per_gpu (tokens/s/GPU); total_tput_tps, output_tput_tps, input_tput_tps (tokens/s)
- **Latency distributions in seconds**: *_ttft, *_tpot, *_itl, *_e2el, and *_full_response_itl. Available prefixes can include median, mean, std, p75, p90, p95, p99, and p99.9.
- **Interactivity in tokens/s/user**: *_intvty and *_full_response_intvty
- **Agentic scalars** can include duration_seconds, *_qps, token-count distributions, cache-hit rates, KV-cache usage, and total request/token counters.
- Some agentic rows also retain categorical metadata such as offload_mode and cache backend in metrics. Do not assume every JSONB value is numeric or every row contains every key.

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
    () =>
      Promise.resolve({
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
        'Get latest benchmark results with config details and selected metric keys. This is the primary query tool to use before query_sql. All filters are optional and can be combined. Pass metrics=["all"] for the complete metrics JSONB object. Use sort_by with limit for top-N results.',
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
        num_gpu: z
          .number()
          .optional()
          .describe(
            'Total GPU count. Filters configs where num_prefill_gpu + num_decode_gpu = value (disagg) or num_decode_gpu = value (non-disagg).',
          ),
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
      num_gpu,
      sort_by,
      sort_order,
      metrics: requestedMetrics,
      limit,
    }) => {
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
          c.num_prefill_gpu, c.num_decode_gpu,
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
          AND (${num_gpu ?? null}::int IS NULL OR
            CASE WHEN c.disagg THEN c.num_prefill_gpu + c.num_decode_gpu
                 ELSE c.num_decode_gpu END = ${num_gpu ?? null})
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

      const processedRows = rows.map((row) => {
        const m = row.metrics as Record<string, number> | null;
        const extracted: Record<string, unknown> = {};
        if (extractKeys) {
          for (const key of extractKeys) extracted[key] = roundMetric(m?.[key] ?? null);
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
              ...(Object.keys(appliedFilters).length > 0 ? { filters: appliedFilters } : {}),
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

      try {
        const rows = (await Promise.race([
          db.unsafe(query),
          new Promise<never>((_, reject) => {
            setTimeout(() => {
              reject(new Error('Query timed out'));
            }, QUERY_TIMEOUT_MS);
          }),
        ])) as Record<string, unknown>[];
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
      } catch (error) {
        return {
          content: [
            {
              type: 'text' as const,
              text: `SQL error: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
          isError: true,
        };
      }
    },
  );

  return server;
}
