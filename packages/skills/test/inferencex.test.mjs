import assert from 'node:assert/strict';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { pathToFileURL } from 'node:url';

import { packageInfo, packedSkillSuite, succeeded } from './packed-skill.mjs';

const suite = packedSkillSuite();
const routes = [
  'powerx export',
  'agentx export',
  'result inspect',
  'tco compare',
  'releases compare',
  'collectivex compare',
];

test('the packed npm binary works from an arbitrary Unicode path', () => {
  const result = suite.query(['--version'], suite.project('项目 with spaces-'));
  succeeded(result);
  assert.equal(result.stdout, `${packageInfo.version}\n`);
  assert.equal(result.stderr, '');
});

test('offline help lists the fixed public command surface', () => {
  const result = succeeded(suite.query(['--help'], suite.project()));
  for (const route of routes) assert.match(result.stdout, new RegExp(route, 'u'));
  for (const command of ['discover', 'verify', 'describe', 'schema', 'doctor']) {
    assert.match(result.stdout, new RegExp(`\\b${command}\\b`, 'u'));
  }
  assert.doesNotMatch(result.stdout, /export verify/u);
  assert.equal(result.stderr, '');
});

test('the installed skill exposes only inferencex as its query entry', () => {
  const skill = suite.install('codex', suite.project());
  for (const [name, route] of [
    ['export-powerx', 'powerx export'],
    ['export-agentx', 'agentx export'],
    ['investigate-result', 'result inspect'],
    ['compare-tco', 'tco compare'],
    ['compare-releases', 'releases compare'],
    ['compare-collectivex', 'collectivex compare'],
  ]) {
    const result = suite.node([join(skill, 'scripts', `${name}.mjs`), '--help']);
    assert.equal(result.status, 2, name);
    assert.equal(result.stdout, '', name);
    assert.match(result.stderr, new RegExp(`Use inferencex ${route} instead\\.`, 'u'), name);
  }
  assert.equal(existsSync(join(skill, 'scripts', 'verify-export.mjs')), false);
  assert.equal(existsSync(join(skill, 'scripts', 'inferencex.mjs')), true);
});

test('command help exposes the required business inputs offline', () => {
  const powerx = succeeded(suite.query(['powerx', 'export', '--help'], suite.project()));
  for (const option of ['--model', '--isl', '--osl', '--output-dir']) {
    assert.match(powerx.stdout, new RegExp(option, 'u'));
  }
  assert.match(powerx.stdout, /required/iu);
  const tco = succeeded(suite.query(['tco', 'compare', '--help'], suite.project()));
  assert.match(tco.stdout, /--gpu-hourly-prices/u);
});

test('describe exposes fixed machine-readable metadata offline', () => {
  const all = JSON.parse(succeeded(suite.query(['describe'], suite.project())).stdout);
  assert.equal(all.schema_version, 1);
  assert.equal(all.package_version, packageInfo.version);
  assert.deepEqual(
    all.operations.filter(({ formal }) => formal).map(({ command }) => command),
    routes,
  );
  const powerx = JSON.parse(
    succeeded(suite.query(['describe', 'powerx', 'export'], suite.project())).stdout,
  );
  assert.equal(powerx.operation.command, 'powerx export');
  assert.deepEqual(powerx.operation.formats, ['json', 'csv']);
  assert.deepEqual(powerx.operation.policies, ['require-hardware']);
});

test('JSON-only offline interfaces reject unadvertised human rendering', () => {
  for (const args of [
    ['describe', '--human'],
    ['schema', 'error', '--human'],
  ]) {
    const result = suite.query(args, suite.project());
    assert.equal(result.status, 2);
    assert.equal(result.stdout, '');
    assert.equal(JSON.parse(result.stderr).error.code, 'INVALID_ARGUMENT');
  }
});

test('new entry has the same argument exit in both renderings', () => {
  for (const mode of ['json', 'text']) {
    const result = suite.query(['unknown', '--error-format', mode], suite.project());
    assert.equal(result.status, 2);
    assert.equal(result.stdout, '');
    if (mode === 'json') assert.equal(JSON.parse(result.stderr).error.code, 'INVALID_ARGUMENT');
    else {
      assert.match(result.stderr, /^inferencex: .*supported command/u);
      assert.throws(() => JSON.parse(result.stderr));
    }
  }
});

test('offline version accepts either error-format syntax without domain arguments', () => {
  for (const errorArgs of [['--error-format', 'text'], ['--error-format=json']]) {
    const result = succeeded(
      suite.query(['powerx', 'export', '--version', ...errorArgs], suite.project()),
    );
    assert.equal(result.stdout, `${packageInfo.version}\n`);
    assert.equal(result.stderr, '');
  }
  const missing = suite.query(['--version', '--error-format'], suite.project());
  assert.equal(missing.status, 2);
  assert.equal(missing.stdout, '');
  assert.equal(JSON.parse(missing.stderr).error.code, 'INVALID_ARGUMENT');
});

test('duplicate global options produce one JSON diagnostic', () => {
  for (const args of [
    ['describe', '--error-format', 'json', '--error-format=json'],
    ['powerx', 'export', '--output-dir', 'one', '--output-dir=two'],
    ['verify', 'bundle', '--timeout-ms', '10', '--timeout-ms=20'],
  ]) {
    const result = suite.query(args, suite.project());
    assert.equal(result.status, 2);
    assert.equal(result.stdout, '');
    const diagnostic = JSON.parse(result.stderr);
    assert.equal(diagnostic.error.code, 'INVALID_ARGUMENT');
    assert.equal(result.stderr.trim().split('\n').length, 1);
  }
});

test('new entry rejects legacy output flags with a migration hint', () => {
  for (const flag of ['--output', '--evidence-dir']) {
    const result = suite.query(['powerx', 'export', flag, 'old'], suite.project());
    assert.equal(result.status, 2);
    assert.equal(result.stdout, '');
    assert.match(JSON.parse(result.stderr).error.message, /--output-dir/u);
  }
});

test('a missing error-format value still uses the default JSON diagnostic', () => {
  const result = suite.query(['unknown', '--error-format'], suite.project());
  assert.equal(result.status, 2);
  assert.equal(result.stdout, '');
  assert.equal(JSON.parse(result.stderr).error.code, 'INVALID_ARGUMENT');
});

test('formal routes apply the domain deadline before the first request', () => {
  const cwd = suite.project();
  const skill = suite.install('codex', cwd);
  const events = join(cwd, 'events.jsonl');
  const preload = join(cwd, 'deadline-preload.mjs');
  writeFileSync(
    preload,
    `
import { appendFileSync } from 'node:fs';
const record = value => appendFileSync(process.env.INFERENCEX_EVENTS, JSON.stringify(value) + '\\n');
const timeout = AbortSignal.timeout;
AbortSignal.timeout = milliseconds => { record({ type: 'timeout', milliseconds }); return timeout(milliseconds); };
globalThis.fetch = async () => { record({ type: 'fetch' }); return new Response('[]'); };
`,
  );
  for (const [extra, expected] of [
    [[], 30_000],
    [['--timeout-ms', '5000'], 5_000],
  ]) {
    writeFileSync(events, '');
    const output = join(cwd, `bundle-${expected}`);
    const result = suite.node(
      [
        '--import',
        pathToFileURL(preload).href,
        join(skill, 'scripts/inferencex.mjs'),
        'powerx',
        'export',
        '--model',
        'test-model',
        '--isl',
        '1',
        '--osl',
        '1',
        '--output-dir',
        output,
        ...extra,
      ],
      { cwd, env: { ...suite.environment, INFERENCEX_EVENTS: events } },
    );
    succeeded(result);
    const recorded = readFileSync(events, 'utf8')
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line));
    const fetchIndex = recorded.findIndex(({ type }) => type === 'fetch');
    assert.ok(fetchIndex > 0, JSON.stringify(recorded));
    assert.ok(
      recorded
        .slice(0, fetchIndex)
        .some(({ type, milliseconds }) => type === 'timeout' && milliseconds === expected),
      JSON.stringify(recorded),
    );
  }
});

test('domain validation finishes before output-directory reservation', () => {
  const cwd = suite.project();
  const output = join(cwd, 'must-not-exist');
  const result = suite.query(
    [
      'powerx',
      'export',
      '--model',
      'test-model',
      '--isl',
      '1',
      '--osl',
      '1',
      '--date',
      '2026-02-30',
      '--output-dir',
      output,
    ],
    cwd,
  );
  assert.equal(result.status, 2);
  assert.equal(JSON.parse(result.stderr).error.code, 'INVALID_ARGUMENT');
  assert.equal(existsSync(output), false);
});
