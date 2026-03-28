/**
 * Dump each database table to a separate JSON file using the postgres driver.
 * Uses cursors for large tables to avoid OOM.
 *
 * Usage:
 *   pnpm admin:db:dump [output-dir]
 */

import { createWriteStream, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import postgres from 'postgres';

import { TABLE_NAMES } from '@semianalysisai/inferencex-constants';

if (!process.env.DATABASE_READONLY_URL) {
  console.error('DATABASE_READONLY_URL is required');
  process.exit(1);
}

const sql = postgres(process.env.DATABASE_READONLY_URL, {
  ssl: 'require',
  max: 1,
});

const CURSOR_BATCH = 100;

const TABLES = [
  TABLE_NAMES.configs,
  TABLE_NAMES.workflowRuns,
  TABLE_NAMES.serverLogs,
  TABLE_NAMES.benchmarkResults,
  TABLE_NAMES.runStats,
  TABLE_NAMES.evalResults,
  TABLE_NAMES.availability,
  TABLE_NAMES.changelogEntries,
];

/** Stream a table to a JSON file using a cursor, writing row-by-row. */
async function streamTable(table: string, outPath: string): Promise<number> {
  const out = createWriteStream(outPath);
  out.write('[\n');

  let count = 0;
  const cursor = sql`SELECT * FROM ${sql(table)}`.cursor(CURSOR_BATCH);

  for await (const batch of cursor) {
    for (const row of batch) {
      if (count > 0) out.write(',\n');
      out.write(JSON.stringify(row));
      count++;
    }
  }

  out.write('\n]\n');
  await new Promise<void>((res, rej) => out.end(() => res()).on('error', rej));
  return count;
}

async function dump(): Promise<void> {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const outDir = resolve(process.argv[2] ?? `inferencex-dump-${timestamp}`);
  mkdirSync(outDir, { recursive: true });

  console.log('=== db:dump ===\n');
  console.log(`  Output: ${outDir}\n`);

  for (const table of TABLES) {
    process.stdout.write(`  ${table}...`);
    const outPath = resolve(outDir, `${table}.json`);
    const count = await streamTable(table, outPath);
    console.log(` ${count} rows`);
  }

  // Generate skills.md
  const skillsMd = generateSkills();
  writeFileSync(resolve(outDir, 'skills.md'), skillsMd);
  console.log('  skills.md');

  console.log('\n=== db:dump complete ===');
}

function generateSkills(): string {
  return `# InferenceX Database Dump

ML inference benchmark data exported from the InferenceX Neon PostgreSQL database.
Each \`.json\` file corresponds to one database table. All files are in this directory.

## Files

| File | Description |
|---|---|
| \`configs.json\` | Serving deployment configs: hardware + framework + model + precision + parallelism |
| \`workflow_runs.json\` | GitHub Actions workflow run metadata |
| \`server_logs.json\` | Raw benchmark server logs (large — ~140KB avg per row) |
| \`benchmark_results.json\` | Performance metrics per config/concurrency/sequence-length/date |
| \`run_stats.json\` | Per-hardware reliability stats (n_success / total) |
| \`eval_results.json\` | LM evaluation accuracy results (e.g. gsm8k) |
| \`availability.json\` | Denormalized date × config availability |
| \`changelog_entries.json\` | PR/change descriptions per workflow run |

## Relationships

- \`benchmark_results[].config_id\` → \`configs[].id\`
- \`benchmark_results[].workflow_run_id\` → \`workflow_runs[].id\`
- \`benchmark_results[].server_log_id\` → \`server_logs[].id\` (nullable)
- \`eval_results[].config_id\` → \`configs[].id\`
- \`eval_results[].workflow_run_id\` → \`workflow_runs[].id\`
- \`run_stats[].workflow_run_id\` → \`workflow_runs[].id\`
- \`changelog_entries[].workflow_run_id\` → \`workflow_runs[].id\`

## Config Fields

Each config is a unique serving deployment:

\`\`\`
id, hardware, framework, model, precision, spec_method, disagg, is_multinode,
prefill_tp, prefill_ep, prefill_dp_attention, prefill_num_workers,
decode_tp, decode_ep, decode_dp_attention, decode_num_workers,
num_prefill_gpu, num_decode_gpu
\`\`\`

Non-disagg runs: prefill and decode fields are identical.

## Benchmark Result Fields

\`\`\`
id, workflow_run_id, config_id, benchmark_type, date, isl, osl, conc,
image, metrics, error, server_log_id
\`\`\`

- \`isl\` / \`osl\`: input/output sequence length in tokens
- \`conc\`: concurrency level
- \`error\`: null means success
- \`metrics\`: object containing all performance measurements

## Metrics Keys

All latency values in seconds. Throughput values in tokens/sec/GPU.

**Throughput**: \`tput_per_gpu\`, \`output_tput_per_gpu\`, \`input_tput_per_gpu\`
**TTFT** (time to first token): \`median_ttft\`, \`mean_ttft\`, \`p99_ttft\`, \`std_ttft\`
**TPOT** (time per output token): \`median_tpot\`, \`mean_tpot\`, \`p99_tpot\`, \`std_tpot\`
**ITL** (inter-token latency): \`median_itl\`, \`mean_itl\`, \`p99_itl\`, \`std_itl\`
**E2EL** (end-to-end latency): \`median_e2el\`, \`mean_e2el\`, \`p99_e2el\`, \`std_e2el\`
**Interactivity**: \`median_intvty\`, \`mean_intvty\`, \`p99_intvty\`, \`std_intvty\`

## Enum Values

**hardware**: h100, h200, b200, b300, gb200, gb300, mi300x, mi325x, mi355x
**model**: dsr1=DeepSeek-R1-0528, gptoss120b=gpt-oss-120b, llama70b=Llama-3.3-70B-Instruct-FP8, qwen3.5=Qwen-3.5-397B-A17B, kimik2.5=Kimi-K2.5, minimaxm2.5=MiniMax-M2.5, glm5=GLM-5
**framework**: atom, dynamo-sglang, dynamo-trt, mori-sglang, sglang, trt, vllm
**precision**: bf16, fp4, fp8, int4
**spec_method**: mtp, none

## Common Queries (as JS pseudocode)

Get latest benchmark per config (equivalent to the \`latest_benchmarks\` materialized view):
\`\`\`js
// For each unique (config_id, conc, isl, osl), take the row with the latest date where error is null
const latest = benchmarkResults
  .filter(r => r.error === null)
  .sort((a, b) => b.date.localeCompare(a.date))
  .reduce((acc, r) => {
    const key = \`\${r.config_id}_\${r.conc}_\${r.isl}_\${r.osl}\`;
    if (!acc.has(key)) acc.set(key, r);
    return acc;
  }, new Map());
\`\`\`

Join benchmarks to configs:
\`\`\`js
const configMap = Object.fromEntries(configs.map(c => [c.id, c]));
const enriched = [...latest.values()].map(r => ({
  ...r,
  ...configMap[r.config_id],
}));
\`\`\`

Filter by hardware and model:
\`\`\`js
const h100Dsr1 = enriched.filter(r => r.hardware === 'h100' && r.model === 'dsr1');
\`\`\`

Compare throughput across GPUs for a model at a specific concurrency:
\`\`\`js
enriched
  .filter(r => r.model === 'dsr1' && r.conc === 64 && r.isl === 1024 && r.osl === 1024)
  .sort((a, b) => b.metrics.tput_per_gpu - a.metrics.tput_per_gpu)
  .map(r => ({ hardware: r.hardware, framework: r.framework, tput: r.metrics.tput_per_gpu }));
\`\`\`
`;
}

dump()
  .catch((err) => {
    console.error('db:dump failed:', err);
    process.exitCode = 1;
  })
  .finally(() => sql.end());
