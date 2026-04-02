/**
 * Verify database contents after ingest:
 *   - Row counts for all tables
 *   - Distinct enum values for key text columns
 *   - Date ranges and coverage
 *   - Metrics completeness (null rates)
 *   - Sample rows
 *
 * Usage:
 *   pnpm admin:db:verify
 */

import { TABLE_NAMES } from '@semianalysisai/inferencex-constants';

import { hasNoSslFlag } from './cli-utils';
import { createAdminSql } from './etl/db-utils';

const sql = createAdminSql({
  noSsl: hasNoSslFlag(),
  max: 1,
  onnotice: () => {},
});

function fmtDate(d: Date | null | undefined): string {
  if (!d) return 'N/A';
  return d instanceof Date ? d.toISOString().slice(0, 10) : String(d).slice(0, 10);
}

function section(title: string) {
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`  ${title}`);
  console.log('═'.repeat(60));
}

function sub(title: string) {
  console.log(`\n── ${title} ──`);
}

async function verify(): Promise<void> {
  console.log('=== db:verify ===');

  // ── Row counts ──────────────────────────────────────────────────────────────
  section('Row Counts');
  const tables = [
    TABLE_NAMES.schemaMigrations,
    TABLE_NAMES.configs,
    TABLE_NAMES.workflowRuns,
    TABLE_NAMES.benchmarkResults,
    TABLE_NAMES.runStats,
    TABLE_NAMES.evalResults,
    TABLE_NAMES.changelogEntries,
  ];
  for (const t of tables) {
    const [{ n }] = await sql`select count(*)::int as n from ${sql(t)}`;
    console.log(`  ${t.padEnd(24)} ${String(n).padStart(8)}`);
  }

  // ── Configs: distinct enum values ───────────────────────────────────────────
  section('Configs — Distinct Values');

  sub('hardware');
  const hardwares = await sql`
    select c.hardware,
           count(distinct c.id)::int as configs,
           count(br.id)::int as bmk_rows,
           count(er.id)::int as eval_rows
    from configs c
    left join benchmark_results br on br.config_id = c.id
    left join eval_results er on er.config_id = c.id
    group by c.hardware order by c.hardware
  `;
  console.log(
    `  ${'HARDWARE'.padEnd(16)} ${'configs'.padStart(8)} ${'bmk_rows'.padStart(10)} ${'eval_rows'.padStart(10)}`,
  );
  hardwares.forEach((r) =>
    console.log(
      `  ${r.hardware.padEnd(16)} ${String(r.configs).padStart(8)} ${String(r.bmk_rows).padStart(10)} ${String(r.eval_rows).padStart(10)}`,
    ),
  );

  sub('framework');
  const frameworks = await sql`
    select c.framework,
           count(distinct c.id)::int as configs,
           count(br.id)::int as bmk_rows,
           count(er.id)::int as eval_rows
    from configs c
    left join benchmark_results br on br.config_id = c.id
    left join eval_results er on er.config_id = c.id
    group by c.framework order by c.framework
  `;
  console.log(
    `  ${'FRAMEWORK'.padEnd(20)} ${'configs'.padStart(8)} ${'bmk_rows'.padStart(10)} ${'eval_rows'.padStart(10)}`,
  );
  frameworks.forEach((r) =>
    console.log(
      `  ${r.framework.padEnd(20)} ${String(r.configs).padStart(8)} ${String(r.bmk_rows).padStart(10)} ${String(r.eval_rows).padStart(10)}`,
    ),
  );

  sub('model');
  const models = await sql`
    select c.model,
           count(distinct c.id)::int as configs,
           count(br.id)::int as bmk_rows,
           count(er.id)::int as eval_rows
    from configs c
    left join benchmark_results br on br.config_id = c.id
    left join eval_results er on er.config_id = c.id
    group by c.model order by c.model
  `;
  console.log(
    `  ${'MODEL'.padEnd(20)} ${'configs'.padStart(8)} ${'bmk_rows'.padStart(10)} ${'eval_rows'.padStart(10)}`,
  );
  models.forEach((r) =>
    console.log(
      `  ${r.model.padEnd(20)} ${String(r.configs).padStart(8)} ${String(r.bmk_rows).padStart(10)} ${String(r.eval_rows).padStart(10)}`,
    ),
  );

  sub('precision');
  const precisions = await sql`
    select c.precision,
           count(distinct c.id)::int as configs,
           count(br.id)::int as bmk_rows,
           count(er.id)::int as eval_rows
    from configs c
    left join benchmark_results br on br.config_id = c.id
    left join eval_results er on er.config_id = c.id
    group by c.precision order by c.precision
  `;
  console.log(
    `  ${'PRECISION'.padEnd(10)} ${'configs'.padStart(8)} ${'bmk_rows'.padStart(10)} ${'eval_rows'.padStart(10)}`,
  );
  precisions.forEach((r) =>
    console.log(
      `  ${r.precision.padEnd(10)} ${String(r.configs).padStart(8)} ${String(r.bmk_rows).padStart(10)} ${String(r.eval_rows).padStart(10)}`,
    ),
  );

  sub('spec_method');
  const specs = await sql`
    select c.spec_method,
           count(distinct c.id)::int as configs,
           count(br.id)::int as bmk_rows
    from configs c
    left join benchmark_results br on br.config_id = c.id
    group by c.spec_method order by c.spec_method
  `;
  console.log(`  ${'SPEC_METHOD'.padEnd(10)} ${'configs'.padStart(8)} ${'bmk_rows'.padStart(10)}`);
  specs.forEach((r) =>
    console.log(
      `  ${r.spec_method.padEnd(10)} ${String(r.configs).padStart(8)} ${String(r.bmk_rows).padStart(10)}`,
    ),
  );

  sub('disagg / is_multinode');
  const flags = await sql`
    select c.disagg, c.is_multinode,
           count(distinct c.id)::int as configs,
           count(br.id)::int as bmk_rows
    from configs c
    left join benchmark_results br on br.config_id = c.id
    group by c.disagg, c.is_multinode order by c.disagg, c.is_multinode
  `;
  flags.forEach((r) =>
    console.log(
      `  disagg=${String(r.disagg).padEnd(5)} multinode=${String(r.is_multinode).padEnd(5)} → ${r.configs} configs, ${r.bmk_rows} bmk rows`,
    ),
  );

  // ── Benchmark results ────────────────────────────────────────────────────────
  section('Benchmark Results');

  const [bmkStats] = await sql`
    select
      count(*)::int                                    as total,
      count(*) filter (where error is null)::int       as successes,
      count(*) filter (where error is not null)::int   as errors,
      count(*) filter (where image is not null)::int   as with_image,
      min(date)                                        as earliest,
      max(date)                                        as latest
    from benchmark_results
  `;
  const bmkRange = bmkStats.earliest
    ? `${fmtDate(bmkStats.earliest)} → ${fmtDate(bmkStats.latest)}`
    : 'no data';
  console.log(`  Total:      ${bmkStats.total}`);
  console.log(`  Successes:  ${bmkStats.successes}`);
  console.log(`  Errors:     ${bmkStats.errors}`);
  console.log(`  With image: ${bmkStats.with_image}`);
  console.log(`  Date range: ${bmkRange}`);

  sub('ISL/OSL combinations');
  const islOsl = await sql`
    select isl, osl, count(*)::int as n
    from benchmark_results group by isl, osl order by isl, osl
  `;
  islOsl.forEach((r) =>
    console.log(`  isl=${String(r.isl).padStart(5)} osl=${String(r.osl).padStart(5)}  → ${r.n}`),
  );

  sub('Metrics coverage (on successes)');
  const [nullRates] = await sql`
    select
      count(*)::int as total,
      count(*) filter (where (metrics->>'tput_per_gpu') is not null)::int         as has_tput,
      count(*) filter (where (metrics->>'output_tput_per_gpu') is not null)::int  as has_output_tput,
      count(*) filter (where (metrics->>'input_tput_per_gpu') is not null)::int   as has_input_tput,
      count(*) filter (where (metrics->>'median_ttft') is not null)::int          as has_median_ttft,
      count(*) filter (where (metrics->>'p99_ttft') is not null)::int             as has_p99_ttft,
      count(*) filter (where (metrics->>'median_e2el') is not null)::int          as has_median_e2el,
      count(*) filter (where (metrics->>'median_intvty') is not null)::int as has_median_intvty
    from benchmark_results
    where error is null
  `;
  const total = nullRates.total;
  const pct = (n: number) => (total > 0 ? `${((n / total) * 100).toFixed(1)}%` : 'n/a');
  console.log(
    `  tput_per_gpu          ${nullRates.has_tput}/${total} (${pct(nullRates.has_tput)})`,
  );
  console.log(
    `  output_tput_per_gpu   ${nullRates.has_output_tput}/${total} (${pct(nullRates.has_output_tput)})`,
  );
  console.log(
    `  input_tput_per_gpu    ${nullRates.has_input_tput}/${total} (${pct(nullRates.has_input_tput)})`,
  );
  console.log(
    `  median_ttft           ${nullRates.has_median_ttft}/${total} (${pct(nullRates.has_median_ttft)})`,
  );
  console.log(
    `  p99_ttft              ${nullRates.has_p99_ttft}/${total} (${pct(nullRates.has_p99_ttft)})`,
  );
  console.log(
    `  median_e2el           ${nullRates.has_median_e2el}/${total} (${pct(nullRates.has_median_e2el)})`,
  );
  console.log(
    `  median_intvty         ${nullRates.has_median_intvty}/${total} (${pct(nullRates.has_median_intvty)})`,
  );

  // ── Run stats ────────────────────────────────────────────────────────────────
  section('Run Stats (Reliability)');

  const [statsInfo] = await sql`
    select count(*)::int as total, min(date) as earliest, max(date) as latest from run_stats
  `;
  const statsRange = statsInfo.earliest
    ? `${fmtDate(statsInfo.earliest)} → ${fmtDate(statsInfo.latest)}`
    : 'no data';
  console.log(`  Total rows: ${statsInfo.total}`);
  console.log(`  Date range: ${statsRange}`);

  sub('Hardware coverage');
  const statsByHw = await sql`
    select hardware, count(*)::int as days,
           round(avg(case when total > 0 then n_success::numeric / total * 100 else null end), 1) as avg_success_pct
    from run_stats group by hardware order by hardware
  `;
  statsByHw.forEach((r) =>
    console.log(
      `  ${r.hardware.padEnd(10)} ${String(r.days).padStart(4)} days  avg ${r.avg_success_pct}% success`,
    ),
  );

  // ── Workflow runs ────────────────────────────────────────────────────────────
  section('Workflow Runs');

  const [wrInfo] = await sql`
    select
      count(*)::int as total,
      min(date) as earliest,
      max(date) as latest
    from workflow_runs
  `;
  const wrRange = wrInfo.earliest
    ? `${fmtDate(wrInfo.earliest)} → ${fmtDate(wrInfo.latest)}`
    : 'no data';
  console.log(`  Total:       ${wrInfo.total}`);
  console.log(`  Date range:  ${wrRange}`);

  sub('Enrichment coverage (GitHub API fields)');
  const [enrichStats] = await sql`
    select
      count(*) filter (where html_url       is not null)::int as with_url,
      count(*) filter (where run_started_at is not null)::int as with_started_at,
      count(*) filter (where conclusion      is not null)::int as with_conclusion
    from workflow_runs
  `;
  const wrTotal = wrInfo.total;
  const ep2 = (n: number) => (wrTotal > 0 ? `${Math.floor((n / wrTotal) * 100)}%` : 'n/a');
  console.log(
    `  html_url:        ${enrichStats.with_url}/${wrTotal} (${ep2(enrichStats.with_url)})`,
  );
  console.log(
    `  run_started_at:  ${enrichStats.with_started_at}/${wrTotal} (${ep2(enrichStats.with_started_at)})`,
  );
  console.log(
    `  conclusion:      ${enrichStats.with_conclusion}/${wrTotal} (${ep2(enrichStats.with_conclusion)})`,
  );

  sub('Sample workflow_runs (5 most recent)');
  const sampleRuns = await sql`
    select github_run_id, name, conclusion, html_url,
           run_started_at::text, head_branch, date::text
    from workflow_runs order by id desc limit 5
  `;
  sampleRuns.forEach((r) =>
    console.log(
      `  run=${r.github_run_id} date=${r.date} branch=${r.head_branch ?? 'null'} conclusion=${r.conclusion ?? 'null'} url=${r.html_url ? 'yes' : 'no'}`,
    ),
  );

  // ── Sample rows ──────────────────────────────────────────────────────────────
  section('Sample Rows');

  sub('configs (5 most recent)');
  const sampleConfigs = await sql`
    select id, hardware, framework, model, precision, spec_method, disagg,
           prefill_tp, prefill_ep, num_prefill_gpu, decode_tp, decode_ep, num_decode_gpu
    from configs order by id desc limit 5
  `;
  sampleConfigs.forEach((r) =>
    console.log(
      `  [${r.id}] ${r.hardware} ${r.framework} ${r.model} ${r.precision} ${r.spec_method} disagg=${r.disagg} tp=${r.prefill_tp}/${r.decode_tp}`,
    ),
  );

  sub('benchmark_results (5 most recent successes)');
  const sampleResults = await sql`
    select br.id, br.date, br.isl, br.osl, br.conc,
           c.hardware, c.framework, c.model,
           (br.metrics->>'tput_per_gpu')::numeric as tput
    from benchmark_results br
    join configs c on c.id = br.config_id
    where br.error is null
    order by br.date desc, br.id desc limit 5
  `;
  sampleResults.forEach((r) =>
    console.log(
      `  [${r.id}] ${fmtDate(r.date)} ${r.hardware} ${r.framework} ${r.model} isl=${r.isl} osl=${r.osl} conc=${r.conc} tput=${Number(r.tput).toFixed(0)}`,
    ),
  );

  console.log('\n=== db:verify complete ===');
}

verify()
  .catch((err) => {
    console.error('db:verify failed:', err);
    process.exitCode = 1;
  })
  .finally(() => sql.end());
