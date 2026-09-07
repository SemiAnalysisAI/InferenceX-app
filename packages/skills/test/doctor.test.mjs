import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import {
  lstatSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { pathToFileURL } from 'node:url';

import { packageInfo, packageRoot, packedSkillSuite, succeeded } from './packed-skill.mjs';

const suite = packedSkillSuite();

function doctor(args, cwd) {
  return suite.query(['doctor', ...args], cwd);
}

function installed(cwd = suite.project('doctor installation-')) {
  const skill = suite.install('codex', cwd);
  return { cwd, skill, skillsRoot: dirname(skill) };
}

function failure(result) {
  assert.equal(result.status, 1, `${result.stdout}\n${result.stderr}`);
  assert.equal(result.stdout, '');
  const diagnostic = JSON.parse(result.stderr);
  assert.equal(diagnostic.error.code, 'INSTALLATION_UNHEALTHY');
  assert.ok(diagnostic.error.details.failures.length > 0);
  return diagnostic.error.details;
}

function withNodeOptions(source, action) {
  const directory = suite.project('doctor preload-');
  const preload = join(directory, 'preload.mjs');
  writeFileSync(preload, source);
  const previous = suite.environment.NODE_OPTIONS;
  suite.environment.NODE_OPTIONS = `--import=${JSON.stringify(pathToFileURL(preload).href)}`;
  try {
    return action();
  } finally {
    if (previous === undefined) delete suite.environment.NODE_OPTIONS;
    else suite.environment.NODE_OPTIONS = previous;
  }
}

test('packed doctor is healthy and offline by default', () => {
  const cwd = suite.project('doctor offline-');
  const result = withNodeOptions(
    `globalThis.fetch = () => { throw new Error('doctor attempted an unrequested request'); };\n`,
    () => doctor([], cwd),
  );
  succeeded(result);
  assert.equal(result.stderr, '');
  const report = JSON.parse(result.stdout);
  assert.equal(report.schema_version, 1);
  assert.equal(report.healthy, true);
  assert.equal(report.executing_package.version, packageInfo.version);
  assert.equal(report.runtime.node, process.versions.node);
  assert.equal(report.runtime.platform, process.platform);
  assert.equal(report.runtime.architecture, process.arch);
  assert.equal(report.selected_installation.state, 'executing_package');
  assert.ok(report.checked_files > 20);
  assert.equal(report.api_check.status, 'not_requested');
  assert.deepEqual(report.failures, []);
  const manifest = JSON.parse(
    readFileSync(join(packageRoot, 'skills/inferencex-api/integrity.json'), 'utf8'),
  );
  const expected = suite.packedFiles
    .filter(
      (path) =>
        path.startsWith('skills/inferencex-api/') &&
        path !== 'skills/inferencex-api/integrity.json',
    )
    .map((path) => path.slice('skills/inferencex-api/'.length))
    .sort();
  assert.deepEqual(Object.keys(manifest.files), expected);
  assert.ok(expected.every((path) => !path.includes('\\')));
});

test('changed and missing managed files are unhealthy while extra files are ignored', () => {
  for (const mode of ['changed', 'missing']) {
    const { cwd, skill, skillsRoot } = installed();
    const managed = join(skill, 'SKILL.md');
    if (mode === 'changed') writeFileSync(managed, 'changed managed bytes\n');
    else rmSync(managed);
    writeFileSync(join(skill, 'user-notes.txt'), 'unmanaged and preserved\n');
    const report = failure(doctor(['--dir', skillsRoot], cwd));
    assert.ok(report.failures.some(({ path }) => path === 'SKILL.md'));
    assert.equal(readFileSync(join(skill, 'user-notes.txt'), 'utf8'), 'unmanaged and preserved\n');
  }
});

test('doctor validates a selected installation version independently of the executing package', () => {
  const { cwd, skill } = installed();
  const selectedVersion = '0.10.7';
  const manifestPath = join(skill, 'integrity.json');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  manifest.package_version = selectedVersion;
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  writeFileSync(
    join(skill, '.inferencex-skills.json'),
    `${JSON.stringify({ package: packageInfo.name, version: selectedVersion }, null, 2)}\n`,
  );
  writeFileSync(join(skill, 'local-user-file.txt'), 'ignored\n');

  const report = JSON.parse(succeeded(doctor(['--target', 'codex'], cwd)).stdout);
  assert.equal(report.executing_package.version, packageInfo.version);
  assert.equal(report.selected_installation.state, 'installed');
  assert.equal(report.selected_installation.version, selectedVersion);
  assert.equal(report.selected_installation.publisher_authenticity, 'not_established');
  assert.equal(readFileSync(join(skill, 'local-user-file.txt'), 'utf8'), 'ignored\n');
});

test('pending installer recovery is reported without changing the transaction or installation', () => {
  const { cwd, skill, skillsRoot } = installed();
  const transaction = `${skill}.inferencex-skills-transaction`;
  mkdirSync(transaction);
  const transactionId = randomUUID();
  const ownerPid = 2_147_483_647;
  const marker = join(transaction, `owner-${transactionId}-${ownerPid}-${randomUUID()}.json`);
  writeFileSync(
    marker,
    `${JSON.stringify(
      {
        schema_version: 1,
        transaction_id: transactionId,
        package: packageInfo.name,
        skill: 'inferencex-api',
        destination: skill,
        owner_pid: ownerPid,
        phase: 'staged',
        had_destination: true,
      },
      null,
      2,
    )}\n`,
  );
  const before = readFileSync(marker);

  const report = failure(doctor(['--dir', skillsRoot], cwd));
  assert.equal(report.selected_installation.state, 'recovery_needed');
  assert.equal(report.selected_installation.transaction.state, 'recovery_needed');
  assert.ok(report.failures.some(({ check }) => check === 'installer_transaction'));
  assert.deepEqual(readFileSync(marker), before);
  assert.ok(lstatSync(transaction).isDirectory());
  assert.ok(lstatSync(skill).isDirectory());
});

test('managed symlinks and files over the local byte ceiling fail closed', () => {
  for (const mode of ['symlink', 'oversize']) {
    const { cwd, skill, skillsRoot } = installed();
    const managed = join(skill, 'SKILL.md');
    if (mode === 'symlink') {
      const outside = join(cwd, 'outside-skill.md');
      renameSync(managed, outside);
      symlinkSync(outside, managed);
    } else {
      writeFileSync(managed, Buffer.alloc(2 * 1024 * 1024 + 1, 0x61));
    }
    const report = failure(doctor(['--dir', skillsRoot], cwd));
    assert.ok(report.failures.some(({ path }) => path === 'SKILL.md'));
  }
});

test('a managed file that grows during its bounded read is rejected', () => {
  const { cwd, skill, skillsRoot } = installed();
  const managed = join(skill, 'SKILL.md');
  const report = withNodeOptions(
    `
import fs from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
const original = fs.promises.open;
fs.promises.open = async (path, ...args) => {
  const handle = await original(path, ...args);
  if (path === ${JSON.stringify(managed)}) {
    const read = handle.read.bind(handle);
    let changed = false;
    handle.read = async (...readArgs) => {
      const result = await read(...readArgs);
      if (!changed) { changed = true; fs.appendFileSync(path, 'growth'); }
      return result;
    };
  }
  return handle;
};
syncBuiltinESMExports();
`,
    () => failure(doctor(['--dir', skillsRoot], cwd)),
  );
  assert.ok(report.failures.some(({ path }) => path === 'SKILL.md'));
});

test('--check-api performs one bounded OpenAPI GET with an explicit scope', () => {
  const cwd = suite.project('doctor api-');
  const events = join(cwd, 'events.jsonl');
  const paths = [
    '/api/v1/benchmarks',
    '/api/v1/benchmarks/history',
    '/api/v1/workflow-info',
    '/api/v1/server-log',
    '/api/v1/tco-feed',
    '/api/v1/agentic-aggregates',
    '/api/v1/derived-agentic-metrics',
    '/api/v1/trace-availability',
    '/api/v1/collectivex/runs',
    '/api/v1/collectivex/runs/{runId}',
  ];
  const result = withNodeOptions(
    `
import { appendFileSync } from 'node:fs';
const events = ${JSON.stringify(events)};
const timeout = AbortSignal.timeout;
AbortSignal.timeout = milliseconds => {
  appendFileSync(events, JSON.stringify({ type: 'timeout', milliseconds }) + '\\n');
  return timeout(milliseconds);
};
globalThis.fetch = async (url, options) => {
  appendFileSync(events, JSON.stringify({ type: 'fetch', url, redirect: options.redirect }) + '\\n');
  return new Response(${JSON.stringify(
    JSON.stringify({
      openapi: '3.1.0',
      paths: Object.fromEntries(paths.map((path) => [path, { get: {} }])),
    }),
  )}, { headers: { 'content-type': 'application/json' } });
};
`,
    () => doctor(['--check-api'], cwd),
  );
  const report = JSON.parse(succeeded(result).stdout);
  assert.equal(report.api_check.status, 'passed');
  assert.equal(report.api_check.request_count, 1);
  assert.match(report.api_check.scope, /OpenAPI/iu);
  const recorded = readFileSync(events, 'utf8').trim().split('\n').map(JSON.parse);
  assert.equal(recorded.filter(({ type }) => type === 'fetch').length, 1);
  assert.ok(
    recorded.some(({ type, milliseconds }) => type === 'timeout' && milliseconds === 10_000),
  );
  assert.ok(
    recorded
      .filter(({ type }) => type === 'timeout')
      .every(({ milliseconds }) => milliseconds <= 10_000),
  );
});

test('--check-api does not retry a retryable HTTP failure', () => {
  const cwd = suite.project('doctor api failure-');
  const events = join(cwd, 'requests.txt');
  const report = withNodeOptions(
    `
import { appendFileSync } from 'node:fs';
globalThis.fetch = async () => {
  appendFileSync(${JSON.stringify(events)}, 'request\\n');
  return new Response('temporarily unavailable', { status: 503 });
};
`,
    () => failure(doctor(['--check-api'], cwd)),
  );
  assert.equal(report.api_check.status, 'failed');
  assert.equal(report.api_check.request_count, 1);
  assert.equal(readFileSync(events, 'utf8'), 'request\n');
});
