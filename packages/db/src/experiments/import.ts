import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  readFile,
  writeFile,
  mkdir,
  realpath,
  mkdtemp,
  rm,
  stat,
  lstat,
  statfs,
} from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import os from 'node:os';
import path from 'node:path';
import { gunzipSync, gzipSync } from 'node:zlib';
import type postgres from 'postgres';
import { mapBenchmarkRow } from '../etl/benchmark-mapper.js';
import { createSkipTracker } from '../etl/skip-tracker.js';
import { prepareTraceReplay } from '../etl/trace-replay-ingest.js';

export const sha = (value: Buffer | string): string =>
  createHash('sha256').update(value).digest('hex');
export interface SourceFile {
  path: string;
  sha256: string;
  bytes: number;
  /** Selected regular-file member of a hash-bound immutable tar.gz archive. */
  archive_member?: string;
  archive_sha256?: string;
  archive_bytes?: number;
}
export interface InputRun {
  run_id: string;
  series: 'weka' | 'native' | 'recovered-c150';
  concurrency: number;
  replicate: number | null;
  clean_backend_qualified: boolean;
  frontier_eligible: boolean;
  plot_metrics: Record<string, unknown>;
  configuration: Record<string, unknown>;
  health: Record<string, unknown>;
  cache_evidence: Record<string, unknown>;
  provenance: Record<string, unknown>;
  files: Record<
    'aggregate' | 'profile' | 'server_metrics' | 'server_log' | 'run_config',
    SourceFile
  >;
}
export interface InputManifest {
  version: number;
  slug: string;
  title: string;
  description: string;
  reference_points: Record<string, unknown>[];
  comparison_notes: unknown;
  runs: InputRun[];
}
export interface Payload {
  kind: string;
  file: string;
  sha256: string;
  compressed_bytes: number;
  uncompressed_bytes: number;
  parts: number;
}
export interface PreparedRun {
  row: Omit<InputRun, 'files'> & { metrics: Record<string, number> };
  aggregate_stats: unknown;
  chart_series: unknown;
  request_timeline: unknown;
  payload_inventory: Payload[];
  record_sha256: string;
}
export interface TargetReceipt {
  purpose: string;
  project_id: string;
  parent_branch_id: string;
  child_branch_id: string;
  endpoint_host: string;
  database: string;
  expires_at: null;
}
const host = (s: string) => s.replace('-pooler.', '.');

export function assertChildTarget(url: string, receipt: TargetReceipt): void {
  const u = new URL(url);
  assert.equal(receipt.purpose, 'weka-amg-kimi-k3-isolated-import');
  assert.equal(receipt.project_id, 'silent-pond-29172997');
  assert.equal(receipt.parent_branch_id, 'br-restless-voice-ai2vkru2');
  assert.equal(receipt.child_branch_id, 'br-odd-math-aif8e7ha');
  assert.equal(host(receipt.endpoint_host), 'ep-empty-dream-aio1rvub.c-4.us-east-1.aws.neon.tech');
  assert.notEqual(receipt.child_branch_id, receipt.parent_branch_id);
  assert.equal(receipt.expires_at, null);
  assert.equal(host(u.hostname), host(receipt.endpoint_host));
  assert.equal(decodeURIComponent(u.pathname.slice(1)), receipt.database);
  assert.ok(u.hostname.endsWith('.neon.tech'));
}
export function validateManifest(m: InputManifest): void {
  assert.equal(m.version, 1);
  assert.ok(['weka-amg-kimi-k3', 'weka-amg-kimi-k3-latest-3h'].includes(m.slug));
  if (m.slug === 'weka-amg-kimi-k3-latest-3h') {
    validateLatestManifest(m);
    return;
  }
  assert.equal(m.runs.length, 16);
  assert.equal(new Set(m.runs.map((r) => r.run_id)).size, 16);
  assert.equal(m.reference_points.length, 11);
  assert.equal(m.runs.filter((r) => r.series === 'weka').length, 10);
  assert.deepEqual(
    m.runs
      .filter((r) => r.series !== 'weka')
      .map((r) => r.concurrency)
      .sort((a, b) => a - b),
    [56, 70, 96, 128, 140, 150],
  );
  for (const r of m.runs) {
    assert.match(r.run_id, /^[a-z0-9][a-z0-9-]+$/);
    assert.equal(r.plot_metrics.concurrency, r.concurrency);
    assert.equal(r.clean_backend_qualified, r.series !== 'recovered-c150');
    assert.equal(r.frontier_eligible, r.clean_backend_qualified);
    if (r.series === 'recovered-c150') assert.equal(r.concurrency, 150);
    const p = r.plot_metrics;
    assert.ok(
      Math.abs(
        Number(p.uncached_tps_gpu) -
          (Number(p.total_tps_gpu) - Number(p.input_tps_gpu) * Number(p.theoretical_hit_rate)),
      ) < 1e-7,
    );
  }
}
function validateLatestManifest(m: InputManifest): void {
  assert.equal(m.runs.length, 22);
  assert.equal(new Set(m.runs.map((r) => r.run_id)).size, 22);
  assert.equal(
    m.reference_points.length,
    0,
    'Three-hour campaign cannot include one-hour references',
  );
  for (const [series, expected] of [
    ['weka', [32, 40, 48, 56, 70, 96, 128, 140, 150, 180, 200, 220, 250]],
    ['native', [32, 40, 48, 56, 70, 96, 128, 140, 150]],
  ] as const) {
    assert.deepEqual(
      m.runs
        .filter((r) => r.series === series)
        .map((r) => r.concurrency)
        .sort((a, b) => a - b),
      [...expected],
    );
  }
  for (const r of m.runs) {
    assert.match(r.run_id, /^[a-z0-9][a-z0-9-]+$/);
    assert.equal(r.plot_metrics.concurrency, r.concurrency);
    assert.equal(r.configuration.benchmark_duration_seconds, 10800);
    assert.equal(r.configuration.trace_idle_gap_cap_seconds, 1200);
    assert.equal(r.configuration.gpu_count, 8);
    assert.equal(r.configuration.spec_method, 'none');
    assert.equal(r.health.measurement_complete, true);
    const flagged = r.series === 'weka' && [128, 140, 180].includes(r.concurrency);
    assert.equal(r.clean_backend_qualified, !flagged);
    assert.equal(r.frontier_eligible, !flagged);
    assert.equal(
      r.health.qualification_code,
      flagged ? (r.concurrency === 128 ? 'metric-integrity' : 'dram-recovery') : 'clean',
    );
    const p = r.plot_metrics;
    for (const key of [
      'total_tps_gpu',
      'input_tps_gpu',
      'output_tps_gpu',
      'theoretical_hit_rate',
      'uncached_tps_gpu',
      'p90_interactivity',
      'p90_ttft',
    ])
      assert.ok(Number.isFinite(p[key]) && Number(p[key]) >= 0, `${r.run_id}: invalid ${key}`);
    assert.ok(
      Math.abs(
        Number(p.uncached_tps_gpu) -
          (Number(p.total_tps_gpu) - Number(p.input_tps_gpu) * Number(p.theoretical_hit_rate)),
      ) < 1e-7,
    );
  }
}

const runCommand = promisify(execFile);
async function hashFile(p: string): Promise<string> {
  const digest = createHash('sha256');
  for await (const chunk of createReadStream(p)) digest.update(chunk);
  return digest.digest('hex');
}
async function extractSources(
  run: InputRun,
  root: string,
  temporary: string,
): Promise<Record<string, string>> {
  const archives = new Map<string, SourceFile[]>();
  for (const f of Object.values(run.files))
    if (f.archive_member) {
      assert.ok(!path.isAbsolute(f.path) && !f.path.split('/').includes('..'));
      assert.ok(!path.isAbsolute(f.archive_member) && !f.archive_member.split('/').includes('..'));
      assert.ok(
        [
          'results/server.log',
          'results/aiperf_artifacts/profile_export.jsonl',
          'results/aiperf_artifacts/server_metrics_export.json',
        ].includes(f.archive_member),
      );
      archives.set(f.path, [...(archives.get(f.path) ?? []), f]);
    }
  const extracted: Record<string, string> = {};
  let i = 0;
  for (const [archive, files] of archives) {
    const base = await realpath(root),
      full = await realpath(path.join(root, archive));
    assert.ok(full.startsWith(base + path.sep));
    for (const f of files) {
      assert.equal(f.archive_sha256, files[0].archive_sha256);
      assert.equal(f.archive_bytes, files[0].archive_bytes);
    }
    const archiveStat = await stat(full);
    assert.equal(archiveStat.size, files[0].archive_bytes);
    assert.equal(await hashFile(full), files[0].archive_sha256, `Archive changed: ${archive}`);
    const target = path.join(temporary, String(i++));
    await mkdir(target);
    const dir = await realpath(target);
    await runCommand(
      'tar',
      ['-xzf', full, '-C', dir, '--', ...files.map((f) => f.archive_member!)],
      { maxBuffer: 1048576 },
    );
    for (const f of files) {
      const memberStat = await lstat(path.join(dir, f.archive_member!));
      assert.ok(memberStat.isFile());
      const p = await realpath(path.join(dir, f.archive_member!));
      assert.ok(p.startsWith(dir + path.sep));
      const sourceStat = await stat(p);
      assert.equal(sourceStat.size, f.bytes);
      assert.equal(await hashFile(p), f.sha256, `Source changed: ${f.archive_member}`);
      extracted[`${f.path}::${f.archive_member}`] = p;
    }
  }
  return extracted;
}
async function verifiedPath(root: string, f: SourceFile): Promise<string> {
  assert.ok(!path.isAbsolute(f.path) && !f.path.split('/').includes('..'));
  const base = await realpath(root),
    p = await realpath(path.join(root, f.path));
  assert.ok(p.startsWith(base + path.sep));
  const bytes = await readFile(p);
  assert.equal(bytes.length, f.bytes);
  assert.equal(sha(bytes), f.sha256, `Source changed: ${f.path}`);
  return p;
}
export async function prepareRun(
  run: InputRun,
  root: string,
  directory: string,
): Promise<PreparedRun> {
  const filesystem = await statfs(os.tmpdir());
  const extractedBytes = Object.values(run.files)
    .filter((f) => f.archive_member)
    .reduce((sum, f) => sum + f.bytes, 0);
  assert.ok(
    filesystem.bavail * filesystem.bsize > extractedBytes + 2 * 1024 ** 3,
    'Insufficient free space for selected raw artifacts plus 2 GiB reserve',
  );
  const temporary = await mkdtemp(path.join(os.tmpdir(), 'weka-experiment-'));
  try {
    const extracted = await extractSources(run, root, temporary);
    const paths = {} as Record<keyof InputRun['files'], string>;
    for (const key of Object.keys(run.files) as (keyof InputRun['files'])[])
      paths[key] = run.files[key].archive_member
        ? extracted[`${run.files[key].path}::${run.files[key].archive_member}`]
        : await verifiedPath(root, run.files[key]);
    const raw = JSON.parse(await readFile(paths.aggregate, 'utf8'));
    const tracker = createSkipTracker();
    const mapped = mapBenchmarkRow(raw, tracker);
    assert.ok(mapped, `Unmapped aggregate ${run.run_id}`);
    assert.equal(mapped.config.hardware, 'b300');
    assert.equal(mapped.conc, run.concurrency);
    assert.equal(mapped.benchmarkType, 'agentic_traces');
    for (const [name, value] of [
      ['tput_per_gpu', 'total_tps_gpu'],
      ['input_tput_per_gpu', 'input_tps_gpu'],
      ['output_tput_per_gpu', 'output_tps_gpu'],
    ] as const)
      assert.ok(
        Math.abs(mapped.metrics[name] - Number(run.plot_metrics[value])) < 0.00001,
        `${run.run_id}: ${name}`,
      );
    const trace = await prepareTraceReplay(paths.profile, null, paths.server_metrics, {
      framework: 'vllm',
      disagg: false,
    });
    assert.ok(
      trace.aggregateStatsJson &&
        trace.chartSeriesJson &&
        trace.requestTimelineGz &&
        trace.profileGz &&
        trace.serverMetricsJsonGz,
    );
    assert.ok(trace.timelineRequests > 0 && trace.chartWindows > 0);
    await mkdir(directory, { recursive: true });
    const payload_inventory: Payload[] = [];
    for (const [kind, data, size] of [
      ['profile', trace.profileGz, trace.profileSize],
      ['server_metrics', trace.serverMetricsJsonGz, trace.serverMetricsJsonSize],
      ['server_log', gzipSync(await readFile(paths.server_log)), run.files.server_log.bytes],
    ] as const) {
      assert.ok(data && size);
      const file = `${kind}.gz`;
      await writeFile(path.join(directory, file), data);
      payload_inventory.push({
        kind,
        file,
        sha256: sha(data),
        compressed_bytes: data.length,
        uncompressed_bytes: size,
        parts: Math.ceil(data.length / 1048576),
      });
    }
    const { files, ...input } = run;
    const row = {
      ...input,
      metrics: mapped.metrics,
      configuration: {
        ...mapped.config,
        ...run.configuration,
        model: mapped.config.model,
        date: new Date(
          Number(
            (run.cache_evidence.phase_time_ranges as { profiling: { start_ns: number } }).profiling
              .start_ns,
          ) / 1e6,
        )
          .toISOString()
          .slice(0, 10),
        spec_method: mapped.config.specMethod,
        tp: mapped.config.prefillTp,
        dcp: 8,
        precision: mapped.config.precision,
        recipe_fingerprint: mapped.recipeFingerprint,
        offload_mode: mapped.offloadMode,
        benchmark_type: mapped.benchmarkType,
        isl: mapped.isl,
        osl: mapped.osl,
        model_identifier: run.configuration.model,
      },
      provenance: {
        ...run.provenance,
        files: Object.fromEntries(
          Object.entries(files).map(([kind, f]) => [
            kind,
            {
              artifact_path: f.path,
              sha256: f.sha256,
              bytes: f.bytes,
              ...(f.archive_member
                ? {
                    archive_member: f.archive_member,
                    archive_sha256: f.archive_sha256,
                    archive_bytes: f.archive_bytes,
                  }
                : {}),
            },
          ]),
        ),
      },
    };
    const data = {
      row,
      aggregate_stats: JSON.parse(trace.aggregateStatsJson.toString()),
      chart_series: JSON.parse(trace.chartSeriesJson.toString()),
      request_timeline: JSON.parse(gunzipSync(trace.requestTimelineGz).toString()),
      payload_inventory,
    };
    const prepared = { ...data, record_sha256: sha(JSON.stringify(data)) };
    await writeFile(path.join(directory, 'run.json'), `${JSON.stringify(prepared)}\n`);
    return prepared;
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}
export async function insertPreparedRun(
  sql: ReturnType<typeof postgres>,
  slug: string,
  prepared: PreparedRun,
  directory: string,
): Promise<'inserted' | 'unchanged'> {
  const { record_sha256, ...content } = prepared;
  assert.equal(sha(JSON.stringify(content)), record_sha256);
  const buffers = new Map<string, Buffer>();
  for (const p of prepared.payload_inventory) {
    const b = await readFile(path.join(directory, p.file));
    assert.equal(sha(b), p.sha256);
    assert.equal(b.length, p.compressed_bytes);
    buffers.set(p.kind, b);
  }
  return await sql.begin(async (tx) => {
    await tx`select pg_advisory_xact_lock(hashtextextended(${`${slug}:${prepared.row.run_id}`},0))`;
    const old =
      await tx`select record_sha256 from experiment_runs where campaign_slug=${slug} and run_id=${prepared.row.run_id}`;
    if (old.length > 0) {
      assert.equal(
        old[0].record_sha256,
        record_sha256,
        'Existing run differs; immutable imports cannot overwrite measurements',
      );
      return 'unchanged' as const;
    }
    const r = prepared.row;
    await tx`insert into experiment_runs(campaign_slug,run_id,series,concurrency,replicate,metrics,plot_metrics,configuration,provenance,health,cache_evidence,clean_backend_qualified,frontier_eligible,record_sha256,aggregate_stats,chart_series,request_timeline,payload_inventory) values (${slug},${r.run_id},${r.series},${r.concurrency},${r.replicate},${tx.json(r.metrics)},${tx.json(r.plot_metrics as never)},${tx.json(r.configuration as never)},${tx.json(r.provenance as never)},${tx.json(r.health as never)},${tx.json(r.cache_evidence as never)},${r.clean_backend_qualified},${r.frontier_eligible},${record_sha256},${tx.json(prepared.aggregate_stats as never)},${tx.json(prepared.chart_series as never)},${tx.json(prepared.request_timeline as never)},${tx.json(prepared.payload_inventory as never)})`;
    for (const p of prepared.payload_inventory) {
      const bytes = buffers.get(p.kind)!;
      for (let part = 0; part < p.parts; part++) {
        const data = bytes.subarray(part * 1048576, (part + 1) * 1048576);
        await tx`insert into experiment_payload_chunks(campaign_slug,run_id,kind,part,data,sha256) values (${slug},${r.run_id},${p.kind},${part},${data},${sha(data)})`;
      }
    }
    return 'inserted' as const;
  });
}
