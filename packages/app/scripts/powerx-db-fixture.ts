/** Disposable localhost-only browser fixture. Telemetry always goes through production ingest. */
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createAdminSql } from '@semianalysisai/inferencex-db/etl/db-utils';

import { ingestGpuMetricsArtifact } from '@semianalysisai/inferencex-db/etl/gpu-metrics-ingest';
import { runMigrations } from '@semianalysisai/inferencex-db/lib/migration-runner';

const url = new URL(process.env.POWERX_ACCEPTANCE_DATABASE_URL ?? '');
if (url.hostname !== '127.0.0.1' || url.pathname !== '/powerx_acceptance') {
  throw new Error('This fixture only writes the disposable loopback powerx_acceptance database');
}
const sql = createAdminSql({ url: url.toString(), noSsl: true, max: 1, onnotice: () => {} });
const output = process.env.POWERX_ACCEPTANCE_OUTPUT!;
const artifactsDir = path.join(output, 'artifacts');
const runId = 34716669498;
const start = Date.UTC(2026, 8, 1, 20) / 1000;
const suffixes = [
  'dsv4_8k1k_fp4_sglang_tp2_conc16_b200-local_0',
  'dsv4_8k1k_fp4_sglang_tp1_conc32_mi355x-local_0',
  'dsv4_8k1k_fp4_sglang_tp4_conc64_b200-multinode_0',
];
const retainedName = 'gpu_metrics_qwen3.5_8k1k_fp8_sglang_conc1_b200-retained_0';

function write(name: string, file: string, contents: string) {
  const target = path.join(artifactsDir, name, file);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, contents);
}

function ingest(index: number) {
  const artifactName = `${index === 2 ? 'power_audit_' : 'gpu_metrics_'}${suffixes[index]}`;
  return ingestGpuMetricsArtifact(sql, {
    workflowRunId: 1,
    artifact: { artifactName, artifactDir: path.join(artifactsDir, artifactName) },
    benchmarkResultIds: [206885 + index],
  });
}

async function ingestRetained(repaired: boolean) {
  // CSV bytes are retained; sidecars deliberately inject a repair scenario.
  write(
    retainedName,
    'gpu_metrics_context.json',
    JSON.stringify({
      timestamp_timezone: repaired ? '+02:00' : 'UTC',
      producer: repaired ? 'retained-after-repair' : 'retained-before-repair',
    }),
  );
  write(
    retainedName,
    'gpu_metrics_identity.csv',
    [
      'index,uuid,name',
      ...Array.from(
        { length: 8 },
        (_, gpu) => `${gpu},GPU-fixture-${repaired ? 'corrected' : 'original'}-${gpu},NVIDIA B200`,
      ),
    ].join('\n'),
  );
  const result = await ingestGpuMetricsArtifact(sql, {
    workflowRunId: 2,
    artifact: { artifactName: retainedName, artifactDir: path.join(artifactsDir, retainedName) },
    benchmarkResultIds: [206888, 206889],
  });
  return result;
}

async function seed() {
  const fixtureDir = path.resolve(import.meta.dirname, '../../../docs/fixtures/powerx-reingest');
  const retainedCsv = fs.readFileSync(path.join(fixtureDir, 'nvidia.csv'));
  const retainedSha256 = createHash('sha256').update(retainedCsv).digest('hex');
  const provenance = JSON.parse(fs.readFileSync(path.join(fixtureDir, 'provenance.json'), 'utf8'));
  if (retainedSha256 !== provenance.fixture.sha256) throw new Error('Retained CSV hash mismatch');
  await runMigrations(sql, path.resolve(import.meta.dirname, '../../db/migrations'));
  await sql`INSERT INTO workflow_runs
    (id, github_run_id, run_attempt, name, status, conclusion, head_branch, head_sha, html_url, created_at, run_started_at, date)
    VALUES (1, ${runId}, 1, 'PowerX local acceptance', 'completed', 'success', 'main', 'local-fixture',
      ${`https://github.com/SemiAnalysisAI/InferenceX/actions/runs/${runId}`},
      '2026-09-01T20:00:00Z', '2026-09-01T20:00:00Z', '2026-09-01')`;
  for (let i = 0; i < 3; i++) {
    const gpuCount = [2, 1, 4][i];
    await sql`INSERT INTO configs
      (id, model, hardware, framework, precision, spec_method, disagg, is_multinode,
       prefill_tp, decode_tp, num_prefill_gpu, num_decode_gpu)
      VALUES (${i + 1}, 'dsv4', ${i === 1 ? 'mi355x' : 'b200'}, 'sglang', 'fp4', 'none', false,
        ${i === 2}, ${gpuCount}, ${gpuCount}, ${gpuCount}, ${gpuCount})`;
    await sql`INSERT INTO benchmark_results
      (id, workflow_run_id, config_id, benchmark_type, date, isl, osl, conc, image, metrics, power_audit)
      VALUES (${206885 + i}, 1, ${i + 1}, 'single_turn', '2026-09-01', 8192, 1024, ${16 * 2 ** i},
        'sglang:local-fixture', ${sql.json({
          median_intvty: 90 - i * 20,
          median_itl: 1 / (90 - i * 20),
          median_e2el: 20,
          median_ttft: 0.5,
          tput_per_gpu: 1800,
          output_tput_per_gpu: 200,
          input_tput_per_gpu: 1600,
          power_valid: 1,
          power_metric_schema_version: 2,
          avg_power_w: [185, 470, 595][i],
          avg_total_gpu_power_w: [370, 470, 2380][i],
          joules_per_output_token: [0.925, 2.35, 2.975][i],
        })}, ${sql.json({
          source: `power_validation_${suffixes[i]}.json`,
          sample_count: gpuCount * 4,
          window_start_unix: start + 2,
          window_end_unix: start + 5,
          observed_gpu_ids: Array.from({ length: gpuCount }, (_, gpu) => String(gpu)),
        })})`;
  }
  const nvidia = `gpu_metrics_${suffixes[0]}`;
  const nvidiaRows = Array.from({ length: 8 }, (_, sample) =>
    [0, 1].map(
      (gpu) =>
        `2026/09/01 20:00:0${sample}, ${gpu}, ${100 + gpu * 100 + sample * 10} W, ${40 + sample}, 1500 MHz, 3996 MHz, ${sample * 10} %, 0 %`,
    ),
  ).flat();
  write(
    nvidia,
    'gpu_metrics.csv',
    [
      'timestamp, index, power.draw [W], temperature.gpu, clocks.current.sm [MHz], clocks.current.memory [MHz], utilization.gpu [%], utilization.memory [%]',
      ...nvidiaRows,
      nvidiaRows.at(-1),
    ].join('\n'),
  );
  write(
    nvidia,
    'gpu_metrics_context.json',
    JSON.stringify({ timestamp_timezone: 'UTC', producer: 'collector-before-repair' }),
  );
  write(
    nvidia,
    'gpu_metrics_identity.csv',
    'index,uuid,name\n0,GPU-n0,NVIDIA B200\n1,GPU-n1,NVIDIA B200\n',
  );
  const amd = `gpu_metrics_${suffixes[1]}`;
  write(
    amd,
    'gpu_metrics.csv',
    [
      'timestamp,gpu,gfx_activity,umc_activity,mm_activity,socket_power,gfx_voltage,soc_voltage,mem_voltage,gfx_0_clk,mem_0_clk,fclk_0_clk,socclk_0_clk,edge,hotspot,mem',
      ...Array.from(
        { length: 8 },
        (_, sample) =>
          `${start + sample},0,90,80,N/A,${400 + sample * 20},${sample < 2 ? 'N/A' : 850},900,1250,2402,2000,1250,39,55,78,60`,
      ),
    ].join('\n'),
  );
  const multi = `power_audit_${suffixes[2]}`;
  write(
    multi,
    'LOGS/power/samples.csv',
    [
      'schema_version,timestamp_unix,scrape_seq,hostname,gpu_index,gpu_uuid,power_w',
      ...Array.from({ length: 8 }, (_, sample) =>
        ['host-a', 'host-b'].flatMap((host, h) =>
          [0, 1].map(
            (gpu) =>
              `1,${start + sample},${sample},${host},${gpu},GPU-${host}-${gpu},${500 + h * 100 + gpu * 20 + sample * 10}`,
          ),
        ),
      ).flat(),
    ].join('\n'),
  );
  write(
    multi,
    'LOGS/power/manifest.json',
    JSON.stringify({
      producer: 'srt-slurm.dcgm-power',
      expected_devices: ['host-a', 'host-b'].flatMap((hostname) =>
        [0, 1].map((gpu_index) => ({ hostname, gpu_index })),
      ),
    }),
  );
  write(
    multi,
    `power_validation_${suffixes[2]}.json`,
    JSON.stringify({
      selected_window: { start_time_unix: start + 2, end_time_unix: start + 5 },
    }),
  );
  const results = [];
  for (let i = 0; i < 3; i++) results.push(await ingest(i));
  // Benchmark rows are local linkage fixtures, not republished benchmark measurements.
  await sql`INSERT INTO workflow_runs
    (id, github_run_id, run_attempt, name, status, conclusion, created_at, date)
    VALUES (2, 34175132645, 1, 'Retained telemetry recovery fixture', 'completed', 'success',
      '2026-09-08T07:20:19Z', '2026-09-08')`;
  await sql`INSERT INTO configs
    (id, model, hardware, framework, precision, spec_method, disagg,
     prefill_tp, decode_tp, num_prefill_gpu, num_decode_gpu)
    VALUES (4, 'qwen3.5', 'b200', 'sglang', 'fp8', 'none', false, 8, 8, 8, 8)`;
  await sql`INSERT INTO benchmark_results
    (id, workflow_run_id, config_id, benchmark_type, date, isl, osl, conc, metrics)
    VALUES (206888, 2, 4, 'single_turn', '2026-09-08', 8192, 1024, 1, '{}'),
           (206889, 2, 4, 'single_turn', '2026-09-08', 8192, 1024, 2, '{}')`;
  write(retainedName, 'gpu_metrics.csv', retainedCsv.toString());
  const retained = await ingestRetained(false);
  await sql`REFRESH MATERIALIZED VIEW latest_benchmarks`;
  fs.writeFileSync(
    path.join(output, 'seed-receipt.json'),
    JSON.stringify(
      {
        runId,
        pointIds: [206885, 206886, 206887],
        results,
        retained: {
          runId: 34175132645,
          pointIds: [206888, 206889],
          sha256: retainedSha256,
          result: retained,
        },
      },
      null,
      2,
    ),
  );
}

try {
  if (process.argv[2] === 'seed') await seed();
  else if (process.argv[2] === 'repair') {
    write(
      `gpu_metrics_${suffixes[0]}`,
      'gpu_metrics_context.json',
      JSON.stringify({
        timestamp_timezone: '+02:00',
        producer: 'collector-after-repair',
      }),
    );
    const result = await ingest(0);
    fs.writeFileSync(path.join(output, 'repair-receipt.json'), JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result));
  } else if (process.argv[2] === 'retained-repair' || process.argv[2] === 'retained-reset') {
    const result = await ingestRetained(process.argv[2] === 'retained-repair');
    fs.writeFileSync(
      path.join(output, `${process.argv[2]}-receipt.json`),
      JSON.stringify(result, null, 2),
    );
    console.log(JSON.stringify(result));
  } else if (process.argv[2] === 'unlink-retained-point') {
    await sql`DELETE FROM benchmark_result_gpu_metrics WHERE benchmark_result_id = 206889`;
  } else if (process.argv[2] === 'unavailable') {
    await sql`ALTER TABLE gpu_metric_series RENAME TO gpu_metric_series_unavailable`;
  } else if (process.argv[2] === 'restore') {
    await sql`ALTER TABLE IF EXISTS gpu_metric_series_unavailable RENAME TO gpu_metric_series`;
  } else
    throw new Error(
      'Expected seed, repair, retained-repair, retained-reset, unlink-retained-point, unavailable, or restore',
    );
} finally {
  await sql.end();
}
