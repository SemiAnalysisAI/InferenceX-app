import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  cpSync,
  existsSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  truncateSync,
  writeFileSync,
} from 'node:fs';
import { basename, join } from 'node:path';
import process from 'node:process';
import { before, test } from 'node:test';
import { pathToFileURL } from 'node:url';

import { packageInfo, packedSkillSuite, succeeded } from './packed-skill.mjs';

const suite = packedSkillSuite();
const { environment, project, temporaryRoot } = suite;
const responsePreload = join(temporaryRoot, 'offline-verifier-responses.mjs');
const denyPreload = join(temporaryRoot, 'offline-verifier-deny-io.mjs');
const pauseReadPreload = join(temporaryRoot, 'offline-verifier-pause-read.mjs');
const growReadPreload = join(temporaryRoot, 'offline-verifier-grow-read.mjs');
const reportWritePreload = join(temporaryRoot, 'offline-verifier-report-write.mjs');
let verifier;
let powerxExporter;
let agentxExporter;

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

function powerxObservation(overrides = {}) {
  return {
    id: '900719925474099312345',
    hardware: 'h200_sxm',
    framework: 'vllm',
    model: 'glm5',
    precision: 'fp8',
    spec_method: 'none',
    disagg: false,
    is_multinode: false,
    prefill_tp: 8,
    prefill_ep: 1,
    prefill_dp_attention: false,
    prefill_num_workers: 1,
    decode_tp: 8,
    decode_ep: 1,
    decode_dp_attention: false,
    decode_num_workers: 1,
    num_prefill_gpu: 0,
    num_decode_gpu: 8,
    benchmark_type: 'single_turn',
    isl: 8192,
    osl: 1024,
    conc: 32,
    offload_mode: 'off',
    image: 'vllm/vllm-openai:v0.10.2',
    recipe_fingerprint: 'recipe-1',
    metrics: {
      power_valid: 1,
      power_metric_schema_version: 2,
      avg_power_w: 0,
      prefill_avg_power_w: null,
      joules_per_successful_query: 5427.2,
      joules_per_input_token: 0.5,
      joules_per_output_token: 5.3,
      joules_per_total_token: 2.65,
      prefill_joules_per_input_token: 0.2,
      decode_joules_per_output_token: 4.1,
    },
    date: '2026-09-01',
    run_started_at: null,
    run_url: 'https://github.com/SemiAnalysisAI/InferenceX/actions/runs/900719925474099312345',
    curve_date: '2026-09-04',
    curve_workflow_run_id: '900719925474099399999',
    curve_run_started_at: '2026-09-04T09:00:00Z',
    ...overrides,
  };
}

function agentxObservation(id, overrides = {}) {
  return {
    id,
    hardware: 'b300',
    framework: 'sglang',
    model: 'dsv4',
    precision: 'fp4',
    spec_method: 'mtp',
    disagg: false,
    is_multinode: false,
    prefill_tp: 8,
    prefill_ep: 1,
    prefill_dp_attention: false,
    prefill_num_workers: 0,
    decode_tp: 8,
    decode_ep: 1,
    decode_dp_attention: false,
    decode_num_workers: 0,
    num_prefill_gpu: 8,
    num_decode_gpu: 8,
    benchmark_type: 'agentic_traces',
    isl: null,
    osl: null,
    conc: 1,
    offload_mode: 'off',
    image: 'lmsysorg/sglang:nightly-dev-cu13',
    recipe_fingerprint: 'recipe-agentx',
    metrics: { mean_ttft: 0, output_tput_per_gpu: 14.5, optional: null, cached: false },
    workers: null,
    date: '2026-09-01',
    workflow_run_id: '2390',
    run_started_at: '2026-09-01 17:04:07+00',
    run_url: 'https://github.com/SemiAnalysisAI/InferenceX/actions/runs/33145139961',
    curve_date: '2026-09-02',
    curve_workflow_run_id: '2391',
    curve_run_started_at: null,
    ...overrides,
  };
}

function percentiles(value) {
  return { mean: value, p50: value, p75: value, p90: value, p95: value, p99: value, n: 1 };
}

function aggregate(id) {
  return {
    id,
    isl: percentiles(0),
    osl: null,
    kvCacheUtil: percentiles(1.25),
    prefixCacheHitRate: percentiles(0.5),
  };
}

function derived(id, value = 0) {
  return { id, p75_e2e_norm_intvty: value, p90_e2e_norm_intvty: null };
}

function mapBody(entries) {
  return JSON.stringify(Object.fromEntries(entries));
}

function chunks(values, size) {
  return Array.from({ length: Math.ceil(values.length / size) }, (_, index) =>
    values.slice(index * size, (index + 1) * size),
  );
}

function runExporter(script, args, routes, cwd = project()) {
  const fixture = join(project('offline verifier routes-'), 'responses.json');
  writeFileSync(fixture, JSON.stringify({ routes }));
  return {
    ...suite.node(['--import', pathToFileURL(responsePreload).href, script, ...args], {
      cwd,
      env: { ...environment, INFERENCEX_OFFLINE_RESPONSES: fixture },
      maxBuffer: 32 * 1024 * 1024,
    }),
    cwd,
  };
}

function powerxBundle(format = 'json', rows = [powerxObservation()]) {
  const cwd = project('offline PowerX 中文 bundle-');
  const evidence = join(cwd, 'saved evidence');
  const output = join(cwd, `power export.${format}`);
  succeeded(
    runExporter(
      powerxExporter,
      [
        '--model',
        'GLM-5',
        '--isl',
        '8192',
        '--osl',
        '1024',
        '--format',
        format,
        '--output',
        output,
        '--evidence-dir',
        evidence,
      ],
      { '/api/v1/benchmarks': [{ body: JSON.stringify(rows), status: 200 }] },
      cwd,
    ),
  );
  return { cwd, evidence, output };
}

function agentxRoutes(rows, ids) {
  return {
    '/api/v1/benchmarks': [{ body: JSON.stringify(rows), status: 200 }],
    '/api/v1/agentic-aggregates': chunks(ids, 200).map((group) => ({
      body: mapBody(group.filter((id) => id !== 2).map((id) => [id, aggregate(id)])),
      status: 200,
    })),
    '/api/v1/derived-agentic-metrics': chunks(ids, 200).map((group) => ({
      body: mapBody(group.map((id) => [id, derived(id)])),
      status: 200,
    })),
    '/api/v1/trace-availability': chunks(ids, 500).map((group) => ({
      body: mapBody(group.filter((id) => id !== 2).map((id) => [id, false])),
      status: 200,
    })),
  };
}

function agentxBundle(format = 'csv', rows = [agentxObservation(1), agentxObservation(2)]) {
  const cwd = project('offline AgentX 中文 bundle-');
  const evidence = join(cwd, 'saved evidence');
  const output = join(cwd, `agent export.${format}`);
  const ids = [
    ...new Set(rows.map((row) => row.id).filter((id) => Number.isSafeInteger(id) && id > 0)),
  ];
  succeeded(
    runExporter(
      agentxExporter,
      [
        '--model',
        'DeepSeek-V4-Pro',
        '--format',
        format,
        '--output',
        output,
        '--evidence-dir',
        evidence,
      ],
      agentxRoutes(rows, ids),
      cwd,
    ),
  );
  return { cwd, evidence, output };
}

function runVerifier(args, cwd = project()) {
  const violations = join(project('offline verifier violations-'), 'calls.txt');
  const result = suite.node(['--import', pathToFileURL(denyPreload).href, verifier, ...args], {
    cwd,
    env: { ...environment, INFERENCEX_OFFLINE_VIOLATIONS: violations },
    maxBuffer: 4 * 1024 * 1024,
  });
  assert.equal(existsSync(violations), false, 'offline verification attempted network/process I/O');
  return result;
}

function manifest(evidence) {
  return JSON.parse(readFileSync(join(evidence, 'manifest.json'), 'utf8'));
}

function saveManifest(evidence, value) {
  writeFileSync(join(evidence, 'manifest.json'), `${JSON.stringify(value, null, 2)}\n`);
}

function copyBundle(bundle) {
  const cwd = project('moved offline bundle-');
  const evidence = join(cwd, 'copied evidence');
  const output = join(cwd, `copied${bundle.output.endsWith('.csv') ? '.csv' : '.json'}`);
  cpSync(bundle.evidence, evidence, { recursive: true });
  cpSync(bundle.output, output);
  return { cwd, evidence, output };
}

function waitForFile(path, timeoutMs = 5_000) {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const poll = () => {
      if (existsSync(path)) resolve();
      else if (Date.now() - started >= timeoutMs)
        reject(new Error(`Timed out waiting for ${path}`));
      else setTimeout(poll, 10);
    };
    poll();
  });
}

before(() => {
  writeFileSync(
    responsePreload,
    `
      import { readFileSync } from 'node:fs';
      const fixture = JSON.parse(readFileSync(process.env.INFERENCEX_OFFLINE_RESPONSES, 'utf8'));
      const calls = {};
      globalThis.fetch = async (input, options) => {
        options.signal.throwIfAborted();
        const path = new URL(input.url ?? input).pathname;
        const index = calls[path] ?? 0;
        calls[path] = index + 1;
        const reply = fixture.routes[path]?.[index];
        if (!reply) return new Response('{"error":"unexpected request"}', { status: 599 });
        return new Response(reply.body, { status: reply.status });
      };
    `,
  );
  writeFileSync(
    denyPreload,
    `
      import childProcess from 'node:child_process';
      import { appendFileSync } from 'node:fs';
      import { syncBuiltinESMExports } from 'node:module';
      const denied = (name) => (..._args) => {
        appendFileSync(process.env.INFERENCEX_OFFLINE_VIOLATIONS, name + '\\n');
        throw new Error('offline verifier attempted ' + name);
      };
      globalThis.fetch = denied('fetch');
      for (const name of ['exec', 'execFile', 'fork', 'spawn', 'execSync', 'execFileSync', 'spawnSync']) {
        childProcess[name] = denied(name);
      }
      syncBuiltinESMExports();
    `,
  );
  writeFileSync(
    pauseReadPreload,
    `
      import fs from 'node:fs';
      import { resolve } from 'node:path';
      import { syncBuiltinESMExports } from 'node:module';
      const original = { openSync: fs.openSync, readSync: fs.readSync };
      const tracked = new Set();
      let paused = false;
      fs.openSync = function(path, ...rest) {
        const descriptor = original.openSync.call(this, path, ...rest);
        if (resolve(String(path)) === resolve(process.env.INFERENCEX_PAUSE_TARGET)) {
          tracked.add(descriptor);
        }
        return descriptor;
      };
      fs.readSync = function(descriptor, ...rest) {
        if (!paused && tracked.has(descriptor)) {
          paused = true;
          fs.writeFileSync(process.env.INFERENCEX_OFFLINE_READY, 'ready');
          const view = new Int32Array(new SharedArrayBuffer(4));
          while (!fs.existsSync(process.env.INFERENCEX_OFFLINE_RELEASE)) {
            Atomics.wait(view, 0, 0, 10);
          }
        }
        return original.readSync.call(this, descriptor, ...rest);
      };
      syncBuiltinESMExports();
    `,
  );
  writeFileSync(
    growReadPreload,
    `
      import fs from 'node:fs';
      import { resolve } from 'node:path';
      import { syncBuiltinESMExports } from 'node:module';
      const original = {
        appendFileSync: fs.appendFileSync,
        fstatSync: fs.fstatSync,
        openSync: fs.openSync,
        readFileSync: fs.readFileSync,
        readSync: fs.readSync,
        writeFileSync: fs.writeFileSync,
      };
      const tracked = new Set();
      let grew = false;
      let readBytes = 0;
      let largestRequest = 0;
      fs.openSync = function(path, ...rest) {
        const descriptor = original.openSync.call(this, path, ...rest);
        if (resolve(String(path)) === resolve(process.env.INFERENCEX_GROW_TARGET)) {
          tracked.add(descriptor);
        }
        return descriptor;
      };
      fs.fstatSync = function(descriptor, ...rest) {
        const result = original.fstatSync.call(this, descriptor, ...rest);
        if (tracked.has(descriptor) && !grew) {
          grew = true;
          original.appendFileSync(process.env.INFERENCEX_GROW_TARGET, Buffer.alloc(10 * 1024 * 1024));
        }
        return result;
      };
      fs.readFileSync = function(path, ...rest) {
        const result = original.readFileSync.call(this, path, ...rest);
        if (tracked.has(path)) readBytes += Buffer.byteLength(result);
        return result;
      };
      fs.readSync = function(descriptor, buffer, offset, length, ...rest) {
        if (tracked.has(descriptor)) largestRequest = Math.max(largestRequest, length);
        const count = original.readSync.call(this, descriptor, buffer, offset, length, ...rest);
        if (tracked.has(descriptor)) readBytes += count;
        return count;
      };
      process.on('exit', () => {
        original.writeFileSync(
          process.env.INFERENCEX_GROW_METRICS,
          JSON.stringify({ grew, read_bytes: readBytes, largest_request: largestRequest }),
        );
      });
      syncBuiltinESMExports();
    `,
  );
  writeFileSync(
    reportWritePreload,
    `
      import fs from 'node:fs';
      import { basename, dirname, resolve } from 'node:path';
      import { syncBuiltinESMExports } from 'node:module';
      const original = {
        closeSync: fs.closeSync,
        linkSync: fs.linkSync,
        openSync: fs.openSync,
        writeFileSync: fs.writeFileSync,
        writeSync: fs.writeSync,
      };
      const report = resolve(process.env.INFERENCEX_REPORT_PATH);
      const temporaryPrefix = '.' + basename(report) + '.';
      const tracked = new Set();
      const reportPath = (path) => {
        const resolved = resolve(String(path));
        return resolved === report ||
          (dirname(resolved) === dirname(report) && basename(resolved).startsWith(temporaryPrefix));
      };
      fs.openSync = function(path, ...rest) {
        const descriptor = original.openSync.call(this, path, ...rest);
        if (reportPath(path)) tracked.add(descriptor);
        return descriptor;
      };
      fs.writeFileSync = function(path, data, options) {
        if (process.env.INFERENCEX_REPORT_MODE === 'race' ||
            !(typeof path === 'number' ? tracked.has(path) : reportPath(path))) {
          return original.writeFileSync.call(this, path, data, options);
        }
        const bytes = Buffer.isBuffer(data) ? data : Buffer.from(data, options?.encoding);
        const descriptor = typeof path === 'number'
          ? path
          : original.openSync(path, options?.flag ?? 'w', options?.mode);
        const close = typeof path !== 'number';
        const prefix = Math.min(120, bytes.length);
        try {
          original.writeSync(descriptor, bytes, 0, prefix);
          if (process.env.INFERENCEX_REPORT_MODE === 'pause') {
            original.writeFileSync(process.env.INFERENCEX_OFFLINE_READY, 'ready');
            const view = new Int32Array(new SharedArrayBuffer(4));
            while (!fs.existsSync(process.env.INFERENCEX_OFFLINE_RELEASE)) {
              Atomics.wait(view, 0, 0, 10);
            }
            if (prefix < bytes.length) {
              original.writeSync(descriptor, bytes, prefix, bytes.length - prefix);
            }
            return;
          }
          const error = new Error(process.env.INFERENCEX_REPORT_MODE);
          error.code = process.env.INFERENCEX_REPORT_MODE;
          throw error;
        } finally {
          if (close) original.closeSync(descriptor);
        }
      };
      fs.linkSync = function(source, destination) {
        if (process.env.INFERENCEX_REPORT_MODE === 'race' && resolve(destination) === report) {
          original.writeFileSync(report, 'racing existing report', { flag: 'wx' });
        }
        return original.linkSync.call(this, source, destination);
      };
      syncBuiltinESMExports();
    `,
  );
  const installed = suite.install('codex');
  verifier = join(installed, 'scripts/verify-export.mjs');
  powerxExporter = join(installed, 'scripts/export-powerx.mjs');
  agentxExporter = join(installed, 'scripts/export-agentx.mjs');
});

test('the packed offline verifier exposes help and version without evidence', () => {
  assert.ok(existsSync(verifier));
  assert.ok(suite.packedFiles.includes('skills/inferencex-api/scripts/verify-export.mjs'));

  const help = suite.node([verifier, '--help']);
  assert.equal(help.status, 0, help.stderr);
  assert.match(help.stdout, /--evidence-dir/);
  assert.match(help.stdout, /--export/);
  assert.match(help.stdout, /--report/);

  const version = suite.node([verifier, '--version']);
  assert.equal(version.status, 0, version.stderr);
  assert.equal(version.stdout, '0.10.0\n');
});

test('PowerX verification is offline, source-qualified, and portable across moved roots', () => {
  const original = powerxBundle();
  const first = runVerifier(['--evidence-dir', original.evidence, '--export', original.output]);
  assert.equal(first.status, 0, first.stderr);
  assert.equal(first.stderr, 'Verified PowerX export against saved evidence.\n');
  assert.match(first.stdout, /^# Verified PowerX export$/mu);
  assert.match(first.stdout, /verified against saved evidence/);
  assert.match(first.stdout, /measured W per GPU/);
  assert.match(first.stdout, /whole-deployment accelerator J\/query/);
  assert.match(first.stdout, /no new benchmark was run/i);
  assert.equal(first.stdout.includes(original.cwd), false);

  const moved = copyBundle(original);
  rmSync(original.cwd, { recursive: true });
  const second = runVerifier(['--evidence-dir', moved.evidence, '--export', moved.output]);
  assert.equal(second.status, 0, second.stderr);
  assert.equal(second.stdout, first.stdout);
});

test('AgentX verification preserves missing entries, explicit false, zero, null, and duplicates', () => {
  const rows = [agentxObservation(1), agentxObservation(2), agentxObservation(1)];
  const bundle = agentxBundle('csv', rows);
  const result = runVerifier(['--evidence-dir', bundle.evidence, '--export', bundle.output]);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stderr, 'Verified AgentX export against saved evidence.\n');
  assert.match(result.stdout, /^# Verified AgentX export$/mu);
  assert.match(result.stdout, /Selected rows: 3/);
  assert.match(result.stdout, /Unique safe IDs: 2/);
  assert.match(result.stdout, /Missing enrichment entr(?:y|ies): 1/);
  assert.match(result.stdout, /Explicit false: 2/);
  assert.match(result.stdout, /Missing keys: 1/);
  assert.match(result.stdout, /ratio/);
  assert.doesNotMatch(result.stdout, /range-validated/);
});

test('empty PowerX and AgentX selections remain complete response-scoped verifications', () => {
  const power = powerxBundle('json', [powerxObservation({ isl: 16 })]);
  const powerResult = runVerifier(['--evidence-dir', power.evidence, '--export', power.output]);
  assert.equal(powerResult.status, 0, powerResult.stderr);
  assert.match(powerResult.stdout, /Selected strictV2 rows: 0/);
  assert.match(powerResult.stdout, /no eligible observations in this saved response/);

  const agent = agentxBundle('json', [powerxObservation()]);
  const agentResult = runVerifier(['--evidence-dir', agent.evidence, '--export', agent.output]);
  assert.equal(agentResult.status, 0, agentResult.stderr);
  assert.match(agentResult.stdout, /Outcome: `no_agentx_rows`/);
  assert.match(agentResult.stdout, /Selected rows: 0/);
  assert.match(agentResult.stdout, /Available AgentX filter values in the complete response/);
  assert.match(agentResult.stdout, /`hardware`: \(none\)/);
  assert.doesNotMatch(agentResult.stdout, /does not exist|has no benchmarks/iu);
});

test('a named report is create-new and preserves an existing report and all inputs', () => {
  const bundle = powerxBundle();
  const report = join(bundle.cwd, 'verified report.md');
  const first = runVerifier([
    '--evidence-dir',
    bundle.evidence,
    '--export',
    bundle.output,
    '--report',
    report,
  ]);
  assert.equal(first.status, 0, first.stderr);
  assert.equal(first.stdout, '');
  assert.match(readFileSync(report, 'utf8'), /^# Verified PowerX export$/mu);

  writeFileSync(report, 'keep prior report');
  const beforeManifest = readFileSync(join(bundle.evidence, 'manifest.json'));
  const beforeExport = readFileSync(bundle.output);
  const second = runVerifier([
    '--evidence-dir',
    bundle.evidence,
    '--export',
    bundle.output,
    '--report',
    report,
  ]);
  assert.equal(second.status, 2);
  assert.equal(second.stdout, '');
  assert.equal(readFileSync(report, 'utf8'), 'keep prior report');
  assert.deepEqual(readFileSync(join(bundle.evidence, 'manifest.json')), beforeManifest);
  assert.deepEqual(readFileSync(bundle.output), beforeExport);
});

test('failed staged writes leave no partial named report and preserve every input', () => {
  for (const code of ['ENOSPC', 'EIO']) {
    const bundle = powerxBundle();
    const report = join(bundle.cwd, `failed-${code}.md`);
    const manifestBytes = readFileSync(join(bundle.evidence, 'manifest.json'));
    const exportBytes = readFileSync(bundle.output);
    const result = suite.node(
      [
        '--import',
        pathToFileURL(reportWritePreload).href,
        verifier,
        '--evidence-dir',
        bundle.evidence,
        '--export',
        bundle.output,
        '--report',
        report,
        '--error-format',
        'json',
      ],
      {
        cwd: bundle.cwd,
        env: {
          ...environment,
          INFERENCEX_REPORT_PATH: report,
          INFERENCEX_REPORT_MODE: code,
        },
      },
    );
    assert.equal(result.status, 1, code);
    assert.equal(result.stdout, '');
    assert.equal(JSON.parse(result.stderr).error.code, 'OUTPUT_ERROR');
    assert.equal(existsSync(report), false);
    assert.equal(
      readdirSync(bundle.cwd).some((name) => name.startsWith(`.${basename(report)}.`)),
      false,
    );
    assert.deepEqual(readFileSync(join(bundle.evidence, 'manifest.json')), manifestBytes);
    assert.deepEqual(readFileSync(bundle.output), exportBytes);
  }
});

test('atomic create-new publication preserves a report created by a racing writer', () => {
  const bundle = powerxBundle();
  const report = join(bundle.cwd, 'racing report.md');
  const result = suite.node(
    [
      '--import',
      pathToFileURL(reportWritePreload).href,
      verifier,
      '--evidence-dir',
      bundle.evidence,
      '--export',
      bundle.output,
      '--report',
      report,
    ],
    {
      cwd: bundle.cwd,
      env: {
        ...environment,
        INFERENCEX_REPORT_PATH: report,
        INFERENCEX_REPORT_MODE: 'race',
      },
    },
  );
  assert.equal(result.status, 1);
  assert.equal(result.stdout, '');
  assert.equal(readFileSync(report, 'utf8'), 'racing existing report');
  assert.equal(
    readdirSync(bundle.cwd).some((name) => name.startsWith(`.${basename(report)}.`)),
    false,
  );
});

test('changed export and response bytes fail before any report is emitted', () => {
  for (const changed of ['export', 'response']) {
    const bundle = powerxBundle();
    if (changed === 'export') writeFileSync(bundle.output, `${readFileSync(bundle.output)} `);
    else writeFileSync(join(bundle.evidence, 'response.json'), '[]');
    const result = runVerifier(['--evidence-dir', bundle.evidence, '--export', bundle.output]);
    assert.equal(result.status, 1);
    assert.equal(result.stdout, '');
    assert.match(result.stderr, new RegExp(`${changed}.*SHA-256`, 'iu'));
  }
});

test('a rehashed source still fails when it no longer reconstructs the saved export', () => {
  const bundle = powerxBundle();
  const source = join(bundle.evidence, 'response.json');
  const rows = JSON.parse(readFileSync(source, 'utf8'));
  rows[0].metrics.avg_power_w = 999;
  const bytes = Buffer.from(JSON.stringify(rows));
  writeFileSync(source, bytes);
  const record = manifest(bundle.evidence);
  record.response.sha256 = sha256(bytes);
  saveManifest(bundle.evidence, record);

  const result = runVerifier(['--evidence-dir', bundle.evidence, '--export', bundle.output]);
  assert.equal(result.status, 1);
  assert.equal(result.stdout, '');
  assert.match(result.stderr, /reconstructed export bytes differ/i);
});

test('missing, extra, traversing, and symlinked evidence files fail closed', () => {
  for (const kind of ['missing', 'extra', 'traversal', 'symlink-body', 'symlink-export']) {
    const bundle = powerxBundle();
    if (kind === 'missing') rmSync(join(bundle.evidence, 'response.json'));
    if (kind === 'extra') writeFileSync(join(bundle.evidence, 'unexpected.json'), '{}');
    if (kind === 'traversal') {
      const record = manifest(bundle.evidence);
      record.response.body_file = '../response.json';
      saveManifest(bundle.evidence, record);
    }
    if (kind === 'symlink-body') {
      const body = readFileSync(join(bundle.evidence, 'response.json'));
      rmSync(join(bundle.evidence, 'response.json'));
      writeFileSync(join(bundle.cwd, 'outside.json'), body);
      symlinkSync(join(bundle.cwd, 'outside.json'), join(bundle.evidence, 'response.json'));
    }
    if (kind === 'symlink-export') {
      const bytes = readFileSync(bundle.output);
      rmSync(bundle.output);
      writeFileSync(join(bundle.cwd, 'outside export.json'), bytes);
      symlinkSync(join(bundle.cwd, 'outside export.json'), bundle.output);
    }
    const result = runVerifier(['--evidence-dir', bundle.evidence, '--export', bundle.output]);
    assert.equal(result.status, 1, kind);
    assert.equal(result.stdout, '');
    assert.match(result.stderr, /filename|missing|unexpected|regular file|symbolic link/i);
  }
});

test('manifest metadata, URLs, source coverage, and timestamp order are reconstructed', () => {
  for (const kind of ['metadata', 'url', 'sources', 'time', 'invalid-date', 'response-order']) {
    const bundle = agentxBundle('json');
    const record = manifest(bundle.evidence);
    if (kind === 'metadata') record.export.metadata.selected_rows++;
    if (kind === 'url') record.responses[1].url += '&ids=999';
    if (kind === 'sources') record.export.source_request_numbers.pop();
    if (kind === 'time') record.finished_at = '2020-01-01T00:00:00Z';
    if (kind === 'invalid-date') record.started_at = '2026-02-30T00:00:00.000Z';
    if (kind === 'response-order') {
      record.responses[1].retrieved_at = record.export.metadata.retrieved_at;
      record.responses[2].retrieved_at = record.started_at;
    }
    saveManifest(bundle.evidence, record);
    const result = runVerifier(['--evidence-dir', bundle.evidence, '--export', bundle.output]);
    assert.equal(result.status, 1, kind);
    assert.equal(result.stdout, '');
    assert.match(result.stderr, /metadata|URL|source request|time|timestamp|reversed|cover/iu);
  }
});

test('capture events emitted within the same millisecond retain equal timestamps', () => {
  const bundle = agentxBundle('json');
  const record = manifest(bundle.evidence);
  const instant = record.export.metadata.retrieved_at;
  record.started_at = instant;
  record.finished_at = instant;
  for (const response of record.responses) response.retrieved_at = instant;
  saveManifest(bundle.evidence, record);
  const result = runVerifier(['--evidence-dir', bundle.evidence, '--export', bundle.output]);
  assert.equal(result.status, 0, result.stderr);
});

test('a changed export cannot pass by changing its recorded hash too', () => {
  const bundle = powerxBundle('csv');
  const bytes = Buffer.concat([readFileSync(bundle.output), Buffer.from('altered')]);
  writeFileSync(bundle.output, bytes);
  const record = manifest(bundle.evidence);
  record.export.sha256 = sha256(bytes);
  saveManifest(bundle.evidence, record);
  const result = runVerifier(['--evidence-dir', bundle.evidence, '--export', bundle.output]);
  assert.equal(result.status, 1);
  assert.equal(result.stdout, '');
  assert.match(result.stderr, /reconstructed export bytes differ/i);
});

test('unsupported, incomplete, ambiguous, and future manifests fail explicitly', () => {
  for (const kind of ['pending', 'schema', 'producer', 'point', 'extra']) {
    const bundle = powerxBundle();
    const record = manifest(bundle.evidence);
    if (kind === 'pending') record.status = 'pending';
    if (kind === 'schema') record.schema_version = 2;
    if (kind === 'producer') record.package_version = '0.12.0';
    if (kind === 'point') record.selected_result_id = '1';
    if (kind === 'extra') record.unexpected = true;
    saveManifest(bundle.evidence, record);
    const result = runVerifier(['--evidence-dir', bundle.evidence, '--export', bundle.output]);
    assert.equal(result.status, 1, kind);
    assert.equal(result.stdout, '');
    assert.match(result.stderr, /complete|schema|producer|point|key|shape|unsupported/i);
  }
});

test('historical 0.9 PowerX and planned 0.11 AgentX producer contracts are explicit', () => {
  const power = powerxBundle('json');
  const powerManifest = manifest(power.evidence);
  const powerDocument = JSON.parse(readFileSync(power.output, 'utf8'));
  delete powerDocument.schema_version;
  powerDocument.metadata.package_version = '0.9.0';
  const powerBytes = Buffer.from(`${JSON.stringify(powerDocument, null, 2)}\n`);
  writeFileSync(power.output, powerBytes);
  powerManifest.package_version = '0.9.0';
  powerManifest.export.metadata.package_version = '0.9.0';
  powerManifest.export.sha256 = sha256(powerBytes);
  saveManifest(power.evidence, powerManifest);
  const oldResult = runVerifier(['--evidence-dir', power.evidence, '--export', power.output]);
  assert.equal(oldResult.status, 0, oldResult.stderr);

  const agent = agentxBundle('json');
  const agentManifest = manifest(agent.evidence);
  const agentDocument = JSON.parse(readFileSync(agent.output, 'utf8'));
  agentDocument.metadata.package_version = '0.11.0';
  const agentBytes = Buffer.from(`${JSON.stringify(agentDocument, null, 2)}\n`);
  writeFileSync(agent.output, agentBytes);
  agentManifest.package_version = '0.11.0';
  agentManifest.export.metadata.package_version = '0.11.0';
  agentManifest.export.sha256 = sha256(agentBytes);
  saveManifest(agent.evidence, agentManifest);
  const futureResult = runVerifier(['--evidence-dir', agent.evidence, '--export', agent.output]);
  assert.equal(futureResult.status, 0, futureResult.stderr);
});

test('AgentX validates the exact chunk ledger and permits omitted complete-response entries', () => {
  const rows = Array.from({ length: 501 }, (_, index) => agentxObservation(index + 1));
  rows.push(agentxObservation(1));
  const bundle = agentxBundle('json', rows);
  const record = manifest(bundle.evidence);
  assert.equal(record.responses.length, 9);
  assert.deepEqual(
    record.responses.map(({ operation, requested_chunk_ids: ids }) => [
      operation,
      ids?.length ?? null,
    ]),
    [
      ['benchmarks', null],
      ['agentic-aggregates', 200],
      ['agentic-aggregates', 200],
      ['agentic-aggregates', 101],
      ['derived-agentic-metrics', 200],
      ['derived-agentic-metrics', 200],
      ['derived-agentic-metrics', 101],
      ['trace-availability', 500],
      ['trace-availability', 1],
    ],
  );
  const valid = runVerifier(['--evidence-dir', bundle.evidence, '--export', bundle.output]);
  assert.equal(valid.status, 0, valid.stderr);
  assert.match(valid.stdout, /Selected rows: 502/);
  assert.match(valid.stdout, /Unique safe IDs: 501/);

  const altered = copyBundle(bundle);
  const changed = manifest(altered.evidence);
  [changed.responses[1], changed.responses[2]] = [changed.responses[2], changed.responses[1]];
  saveManifest(altered.evidence, changed);
  const invalid = runVerifier(['--evidence-dir', altered.evidence, '--export', altered.output]);
  assert.equal(invalid.status, 1);
  assert.match(invalid.stderr, /request|chunk|order|identity/i);
});

test('path aliases and prior reports are rejected without overwriting any input', () => {
  for (const mode of ['export', 'inside-evidence']) {
    const bundle = powerxBundle();
    const report = mode === 'export' ? bundle.output : join(bundle.evidence, 'report.md');
    const beforeExport = readFileSync(bundle.output);
    const result = runVerifier([
      '--evidence-dir',
      bundle.evidence,
      '--export',
      bundle.output,
      '--report',
      report,
    ]);
    assert.equal(result.status, 2);
    assert.equal(result.stdout, '');
    assert.match(result.stderr, /already exists|collides|inside|alias/i);
    assert.deepEqual(readFileSync(bundle.output), beforeExport);
    assert.equal(existsSync(join(bundle.evidence, 'report.md')), false);
  }
});

test('manifest, response, and export byte budgets fail without partial reports', () => {
  const exactBundle = powerxBundle();
  const exactManifest = join(exactBundle.evidence, 'manifest.json');
  const exactBytes = readFileSync(exactManifest);
  writeFileSync(
    exactManifest,
    Buffer.concat([exactBytes, Buffer.alloc(1024 * 1024 - exactBytes.length, 32)]),
  );
  const exactResult = runVerifier([
    '--evidence-dir',
    exactBundle.evidence,
    '--export',
    exactBundle.output,
  ]);
  assert.equal(exactResult.status, 0, exactResult.stderr);

  const zeroBundle = powerxBundle();
  writeFileSync(join(zeroBundle.evidence, 'manifest.json'), Buffer.alloc(0));
  const zeroResult = runVerifier([
    '--evidence-dir',
    zeroBundle.evidence,
    '--export',
    zeroBundle.output,
  ]);
  assert.equal(zeroResult.status, 1);
  assert.equal(zeroResult.stdout, '');
  assert.match(zeroResult.stderr, /manifest.*JSON/iu);

  const manifestBundle = powerxBundle();
  writeFileSync(join(manifestBundle.evidence, 'manifest.json'), Buffer.alloc(1024 * 1024 + 1, 32));
  const manifestResult = runVerifier([
    '--evidence-dir',
    manifestBundle.evidence,
    '--export',
    manifestBundle.output,
  ]);
  assert.equal(manifestResult.status, 1);
  assert.match(manifestResult.stderr, /manifest.*1 MiB/i);

  const responseBundle = powerxBundle();
  writeFileSync(
    join(responseBundle.evidence, 'response.json'),
    Buffer.alloc(32 * 1024 * 1024 + 1, 32),
  );
  const responseResult = runVerifier([
    '--evidence-dir',
    responseBundle.evidence,
    '--export',
    responseBundle.output,
  ]);
  assert.equal(responseResult.status, 1);
  assert.match(responseResult.stderr, /response.*32 MiB/i);

  const exportBundle = powerxBundle();
  truncateSync(exportBundle.output, 256 * 1024 * 1024 + 1);
  const exportResult = runVerifier([
    '--evidence-dir',
    exportBundle.evidence,
    '--export',
    exportBundle.output,
  ]);
  assert.equal(exportResult.status, 1);
  assert.match(exportResult.stderr, /export.*256 MiB/i);
});

test('a file that grows after fstat is rejected without reading beyond its accepted size', () => {
  const bundle = powerxBundle();
  const manifestPath = join(bundle.evidence, 'manifest.json');
  const acceptedSize = readFileSync(manifestPath).length;
  const metricsPath = join(bundle.cwd, 'read-metrics.json');
  const result = suite.node(
    [
      '--import',
      pathToFileURL(growReadPreload).href,
      '--import',
      pathToFileURL(denyPreload).href,
      verifier,
      '--evidence-dir',
      bundle.evidence,
      '--export',
      bundle.output,
    ],
    {
      cwd: bundle.cwd,
      env: {
        ...environment,
        INFERENCEX_GROW_TARGET: manifestPath,
        INFERENCEX_GROW_METRICS: metricsPath,
        INFERENCEX_OFFLINE_VIOLATIONS: join(bundle.cwd, 'offline-violations'),
      },
    },
  );
  assert.equal(result.status, 1);
  assert.equal(result.stdout, '');
  assert.match(result.stderr, /manifest.*changed|manifest.*limit/iu);
  const metrics = JSON.parse(readFileSync(metricsPath, 'utf8'));
  assert.equal(metrics.grew, true);
  assert.ok(metrics.read_bytes <= acceptedSize + 1, JSON.stringify(metrics));
});

test('the aggregate response and rendered-report byte budgets fail explicitly', () => {
  const rows = Array.from({ length: 201 }, (_, index) => agentxObservation(index + 1));
  const agent = agentxBundle('json', rows);
  const agentManifest = manifest(agent.evidence);
  for (const response of agentManifest.responses) {
    const path = join(agent.evidence, response.body_file);
    const padded = Buffer.concat([Buffer.alloc(22 * 1024 * 1024, 32), readFileSync(path)]);
    writeFileSync(path, padded);
    response.decoded_body_sha256 = sha256(padded);
  }
  saveManifest(agent.evidence, agentManifest);
  const total = runVerifier(['--evidence-dir', agent.evidence, '--export', agent.output]);
  assert.equal(total.status, 1);
  assert.equal(total.stdout, '');
  assert.match(total.stderr, /responses.*128 MiB.*total/i);

  const power = powerxBundle('json', [
    powerxObservation({ run_started_at: `unsafe-${'x'.repeat(1024 * 1024)}` }),
  ]);
  const report = runVerifier(['--evidence-dir', power.evidence, '--export', power.output]);
  assert.equal(report.status, 1);
  assert.equal(report.stdout, '');
  assert.match(report.stderr, /report.*1 MiB/i);
});

test('untrusted report values are escaped without changing Markdown structure', () => {
  const value = '2026-09-01` <script>alert(1)</script>\nnext | heading';
  const bundle = powerxBundle('json', [powerxObservation({ run_started_at: value })]);
  const result = runVerifier(['--evidence-dir', bundle.evidence, '--export', bundle.output]);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /``2026-09-01` <script>alert\(1\)<\/script>\\nnext \| heading``/u);
  assert.equal(result.stdout.includes('</script>\nnext'), false);
  assert.equal(result.stdout.match(/^## /gmu)?.length, 7);
});

test('leading and repeated backticks cannot escape the report code span or exhaust the stack', () => {
  const leading = powerxBundle('json', [
    powerxObservation({ run_started_at: '`<img src=x onerror=alert(1)>' }),
  ]);
  const leadingResult = runVerifier([
    '--evidence-dir',
    leading.evidence,
    '--export',
    leading.output,
  ]);
  assert.equal(leadingResult.status, 0, leadingResult.stderr);
  assert.match(
    leadingResult.stdout,
    /Producer run starts: `` `<img src=x onerror=alert\(1\)> `` \(1\)/u,
  );
  assert.doesNotMatch(leadingResult.stdout, /: ```<img/u);

  const repeated = powerxBundle('json', [
    powerxObservation({ run_started_at: '`x'.repeat(150_000) }),
  ]);
  const repeatedResult = runVerifier([
    '--evidence-dir',
    repeated.evidence,
    '--export',
    repeated.output,
  ]);
  assert.equal(repeatedResult.status, 0, repeatedResult.stderr);
  assert.doesNotMatch(repeatedResult.stderr, /INTERNAL_ERROR|call stack/iu);
});

test('SIGTERM during a staged report write cancels before atomic publication', async (context) => {
  const bundle = powerxBundle();
  const report = join(bundle.cwd, 'cancelled staged report.md');
  const ready = join(bundle.cwd, 'write-ready');
  const release = join(bundle.cwd, 'write-release');
  const child = spawn(
    process.execPath,
    [
      '--import',
      pathToFileURL(reportWritePreload).href,
      verifier,
      '--evidence-dir',
      bundle.evidence,
      '--export',
      bundle.output,
      '--report',
      report,
    ],
    {
      cwd: bundle.cwd,
      env: {
        ...environment,
        INFERENCEX_REPORT_PATH: report,
        INFERENCEX_REPORT_MODE: 'pause',
        INFERENCEX_OFFLINE_READY: ready,
        INFERENCEX_OFFLINE_RELEASE: release,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  context.after(() => {
    writeFileSync(release, 'release');
    child.kill('SIGKILL');
  });
  const stdout = [];
  const stderr = [];
  child.stdout.on('data', (chunk) => stdout.push(chunk));
  child.stderr.on('data', (chunk) => stderr.push(chunk));
  const exitPromise = new Promise((resolve) => {
    child.once('exit', (code, signal) => {
      resolve({ code, signal });
    });
  });
  await waitForFile(ready);
  assert.equal(child.kill('SIGTERM'), true);
  await new Promise((resolve) => {
    setTimeout(resolve, 50);
  });
  writeFileSync(release, 'release');
  const exit = await exitPromise;
  assert.deepEqual(exit, { code: 130, signal: null });
  assert.equal(Buffer.concat(stdout).toString(), '');
  assert.match(Buffer.concat(stderr).toString(), /Cancelled by SIGTERM/);
  assert.equal(existsSync(report), false);
  assert.equal(
    readdirSync(bundle.cwd).some((name) => name.startsWith(`.${basename(report)}.`)),
    false,
  );
});

test('SIGTERM queued during a synchronous input read cancels before report publication', async (context) => {
  const bundle = powerxBundle();
  const report = join(bundle.cwd, 'must not be published.md');
  const ready = join(bundle.cwd, 'read-ready');
  const release = join(bundle.cwd, 'read-release');
  const violations = join(bundle.cwd, 'offline-violations');
  const child = spawn(
    process.execPath,
    [
      '--import',
      pathToFileURL(pauseReadPreload).href,
      '--import',
      pathToFileURL(denyPreload).href,
      verifier,
      '--evidence-dir',
      bundle.evidence,
      '--export',
      bundle.output,
      '--report',
      report,
    ],
    {
      cwd: bundle.cwd,
      env: {
        ...environment,
        INFERENCEX_PAUSE_TARGET: join(bundle.evidence, 'manifest.json'),
        INFERENCEX_OFFLINE_READY: ready,
        INFERENCEX_OFFLINE_RELEASE: release,
        INFERENCEX_OFFLINE_VIOLATIONS: violations,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  context.after(() => {
    writeFileSync(release, 'release');
    child.kill('SIGKILL');
  });
  const stdout = [];
  const stderr = [];
  child.stdout.on('data', (chunk) => stdout.push(chunk));
  child.stderr.on('data', (chunk) => stderr.push(chunk));
  const exitPromise = new Promise((resolve) => {
    child.once('exit', (code, signal) => {
      resolve({ code, signal });
    });
  });
  await waitForFile(ready);
  assert.equal(child.kill('SIGTERM'), true);
  await new Promise((resolve) => {
    setTimeout(resolve, 50);
  });
  writeFileSync(release, 'release');
  const exit = await exitPromise;
  assert.deepEqual(exit, { code: 130, signal: null });
  assert.equal(Buffer.concat(stdout).toString(), '');
  assert.match(Buffer.concat(stderr).toString(), /Cancelled by SIGTERM/);
  assert.equal(existsSync(report), false);
  assert.equal(existsSync(violations), false);
});

test('JSON diagnostics preserve 0.10 exit semantics for invalid arguments', () => {
  const result = runVerifier(['--error-format', 'json', '--evidence-dir', 'missing-only']);
  assert.equal(result.status, 2);
  assert.equal(result.stdout, '');
  const diagnostic = JSON.parse(result.stderr);
  assert.equal(diagnostic.package_version, packageInfo.version);
  assert.equal(diagnostic.command, 'verify-export');
  assert.equal(diagnostic.error.code, 'INVALID_ARGUMENT');
  assert.match(diagnostic.error.message, /--export/);
});
