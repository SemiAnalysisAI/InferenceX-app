import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { before, test } from 'node:test';
import { pathToFileURL } from 'node:url';

import { packageInfo, packedSkillSuite } from './packed-skill.mjs';

const suite = packedSkillSuite();
const preload = join(suite.temporaryRoot, 'cli-contract-preload.mjs');
let scripts;

const cases = [
  ['export-powerx', ['--model', 'x', '--isl', '1', '--osl', '1']],
  ['export-agentx', ['--model', 'x']],
  ['investigate-result', ['--id', '1', '--model', 'x']],
  [
    'compare-tco',
    ['--model', 'x', '--workloads', '1x1', '--target', '1', '--gpu-hourly-prices', 'b200=1'],
  ],
  [
    'compare-releases',
    [
      '--model',
      'x',
      '--hardware',
      'b200',
      '--framework',
      'sglang',
      '--isl',
      '1',
      '--osl',
      '1',
      '--metric',
      'median_ttft',
      '--before-date',
      '2026-09-01',
      '--after-date',
      '2026-09-02',
      '--before-image',
      'before',
      '--after-image',
      'after',
    ],
  ],
  ['compare-collectivex', [], ['--left', '1']],
];

function run(name, args, mode = 'network') {
  return suite.node(
    ['--import', pathToFileURL(preload).href, scripts[name], ...args, '--error-format', 'json'],
    {
      env: { ...suite.environment, INFERENCEX_CLI_CONTRACT_MODE: mode },
    },
  );
}

function diagnostic(result, code, status = 1) {
  assert.equal(result.status, status, `${result.stdout}\n${result.stderr}`);
  assert.equal(result.stdout, '');
  const value = JSON.parse(result.stderr);
  assert.deepEqual(
    {
      schema_version: value.schema_version,
      package: value.package,
      package_version: value.package_version,
      code: value.error.code,
    },
    {
      schema_version: 1,
      package: packageInfo.name,
      package_version: packageInfo.version,
      code,
    },
    value.command,
  );
  assert.equal(typeof value.command, 'string');
  assert.ok(value.command.length > 0);
  assert.equal(typeof value.error.message, 'string');
  assert.ok(value.error.message.length > 0);
  return value;
}

before(() => {
  writeFileSync(
    preload,
    `
import { writeFileSync } from 'node:fs';
const mode = process.env.INFERENCEX_CLI_CONTRACT_MODE;
let parseTimeoutController;
if (mode === 'body-timeout' || mode === 'http-body-timeout' || mode === 'parse-timeout') {
  const timeout = AbortSignal.timeout;
  AbortSignal.timeout = milliseconds => {
    const controlled =
      (mode === 'parse-timeout' && milliseconds === 120_000) ||
      (mode !== 'parse-timeout' && milliseconds === 30_000);
    if (!controlled) return timeout(milliseconds);
    const controller = new AbortController();
    if (mode === 'parse-timeout') parseTimeoutController = controller;
    else {
      setTimeout(
        () => controller.abort(new DOMException('controlled body timeout', 'TimeoutError')),
        40,
      );
    }
    return controller.signal;
  };
}
if (mode === 'parse-cancel' || mode === 'parse-timeout') {
  const decode = TextDecoder.prototype.decode;
  TextDecoder.prototype.decode = function (...args) {
    const body = decode.apply(this, args);
    if (body === '[]') {
      if (mode === 'parse-cancel') process.emit('SIGTERM');
      else parseTimeoutController.abort(new DOMException('controlled parse timeout', 'TimeoutError'));
    }
    return body;
  };
}
if (mode === 'stdout-error') {
  process.stdout.write = (_bytes, callback) => {
    queueMicrotask(() => callback(Object.assign(new Error('controlled broken pipe'), { code: 'EPIPE' })));
    return false;
  };
}
if (mode === 'stdout-stall') process.stdout.write = () => false;
globalThis.fetch = async (_input, options) => {
  if (mode === 'network') throw new TypeError('controlled network failure');
  if (mode === 'timeout') throw new DOMException('controlled timeout', 'TimeoutError');
  options.signal?.throwIfAborted();
  if (mode === 'pending') {
    return await new Promise((_resolve, reject) => {
      const keepAlive = setInterval(() => {}, 1_000);
      options.signal.addEventListener('abort', () => {
        clearInterval(keepAlive);
        reject(options.signal.reason);
      }, { once: true });
      writeFileSync(process.env.INFERENCEX_TEST_READY, 'ready');
      if (options.signal.aborted) reject(options.signal.reason);
    });
  }
  if (mode === 'body-timeout' || mode === 'http-body-timeout' || mode === 'http-body-pending') {
    return new Response(new ReadableStream({
      start(controller) {
        if (mode === 'http-body-pending') {
          const keepAlive = setInterval(() => {}, 1_000);
          writeFileSync(process.env.INFERENCEX_TEST_READY, 'ready');
          options.signal.addEventListener('abort', () => clearInterval(keepAlive), { once: true });
        }
        options.signal.addEventListener('abort', () => controller.error(options.signal.reason), {
          once: true,
        });
      },
    }), {
      status: mode === 'body-timeout' ? 200 : 503,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  if (mode === 'http') return new Response('{"error":"unavailable"}', {
    status: 503, headers: { 'Content-Type': 'application/json' },
  });
  if (mode === 'empty') return new Response('[]', {
    headers: { 'Content-Type': 'application/json' },
  });
  if (mode === 'parse-cancel' || mode === 'parse-timeout') return new Response('[]', {
    headers: { 'Content-Type': 'application/json' },
  });
  return new Response('{not json', { headers: { 'Content-Type': 'application/json' } });
};
`,
  );
  const installed = suite.install('codex');
  scripts = Object.fromEntries(
    cases.map(([name]) => [name, join(installed, 'scripts', `${name}.mjs`)]),
  );
  scripts.installer = join(installed, '..', '..', '..', 'node_modules', '.bin', 'unused');
});

test('the packed shared contract exports the typed error and boundary helpers', async () => {
  const contract = join(scripts['export-powerx'], '..', 'cli-contract.mjs');
  assert.ok(existsSync(contract));
  const module = await import(pathToFileURL(contract));
  for (const name of [
    'CliError',
    'argumentError',
    'diagnostic',
    'httpError',
    'requestBoundary',
    'responseBoundary',
    'outputBoundary',
    'writeStdout',
    'runCli',
  ]) {
    assert.equal(typeof module[name], 'function', name);
  }
});

test('every packed entry point emits one structured INVALID_ARGUMENT diagnostic', () => {
  for (const [name, _validArgs, invalidArgs = []] of cases) {
    diagnostic(run(name, invalidArgs), 'INVALID_ARGUMENT', 2);
  }
  const cwd = suite.project();
  const result = suite.run(['install', '--target', 'unknown', '--error-format', 'json'], cwd);
  diagnostic(result, 'INVALID_ARGUMENT', 2);
});

test('every packed entry point rejects an unknown error format', () => {
  for (const [name] of cases) {
    const result = suite.node([scripts[name], '--error-format', 'yaml']);
    assert.notEqual(result.status, 0, name);
    assert.equal(result.stdout, '');
    assert.match(result.stderr, /--error-format.*json.*text/iu, name);
  }
  const result = suite.run(['install', '--error-format', 'yaml'], suite.project());
  assert.equal(result.status, 2);
  assert.equal(result.stdout, '');
  assert.match(result.stderr, /--error-format.*json.*text/iu);
});

test('an explicit JSON error format survives duplicate or conflicting format arguments', () => {
  const formats = [
    ['--error-format', 'json', '--error-format', 'json'],
    ['--error-format=json', '--error-format=text'],
    ['--error-format=text', '--error-format=json'],
    ['--error-format=yaml', '--error-format=json'],
    ['--error-format=json', '--error-format'],
    ['--error-format', '--error-format=json'],
    ['--error-format', '--error-format', 'json'],
  ];
  for (const args of formats) {
    for (const [name] of cases) {
      diagnostic(suite.node([scripts[name], '--help', ...args]), 'INVALID_ARGUMENT', 2);
    }
    diagnostic(suite.run(['install', ...args], suite.project()), 'INVALID_ARGUMENT', 2);
  }
});

for (const [name, args] of cases.slice(0, 2)) {
  test(`${name} classifies an unwritable evidence parent as OUTPUT_ERROR`, () => {
    const parent = join(suite.project(), 'unwritable');
    mkdirSync(parent, { mode: 0o500 });
    try {
      diagnostic(run(name, [...args, '--evidence-dir', join(parent, 'evidence')]), 'OUTPUT_ERROR');
      assert.equal(existsSync(join(parent, 'evidence')), false);
    } finally {
      chmodSync(parent, 0o700);
    }
  });

  test(`${name} classifies evidence/output collisions as INVALID_ARGUMENT`, () => {
    const evidence = join(suite.project(), 'evidence');
    diagnostic(
      run(name, [...args, '--evidence-dir', evidence, '--output', join(evidence, 'manifest.json')]),
      'INVALID_ARGUMENT',
      2,
    );
    assert.equal(existsSync(evidence), false);
  });
}

test('CollectiveX distinguishes output preflight I/O failures from invalid destinations', () => {
  const cwd = suite.project();
  diagnostic(
    run('compare-collectivex', ['--output', join(cwd, 'missing/out.json')]),
    'OUTPUT_ERROR',
  );
  const parent = join(cwd, 'inaccessible');
  mkdirSync(parent, { mode: 0o000 });
  try {
    diagnostic(run('compare-collectivex', ['--output', join(parent, 'out.json')]), 'OUTPUT_ERROR');
  } finally {
    chmodSync(parent, 0o700);
  }
  writeFileSync(join(cwd, 'file'), 'untouched');
  for (const output of ['file', 'file/out.json']) {
    diagnostic(run('compare-collectivex', ['--output', join(cwd, output)]), 'INVALID_ARGUMENT', 2);
  }
  assert.equal(readFileSync(join(cwd, 'file'), 'utf8'), 'untouched');
});

test('installer filesystem write failures are OUTPUT_ERROR and retain the installed skill', () => {
  const cwd = suite.project();
  const installed = suite.install('codex', cwd);
  const root = join(installed, '..');
  const receipt = readFileSync(join(installed, '.inferencex-skills.json'));
  writeFileSync(join(installed, 'keep.txt'), 'untouched');
  chmodSync(root, 0o500);
  try {
    diagnostic(
      suite.run(['install', '--target', 'codex', '--force', '--error-format', 'json'], cwd),
      'OUTPUT_ERROR',
    );
    assert.deepEqual(readFileSync(join(installed, '.inferencex-skills.json')), receipt);
    assert.equal(readFileSync(join(installed, 'keep.txt'), 'utf8'), 'untouched');
    assert.equal(existsSync(`${installed}.inferencex-skills-transaction`), false);
  } finally {
    chmodSync(root, 0o700);
  }
});

test('installer transaction protocol failures remain INTERNAL_ERROR', () => {
  const cwd = suite.project();
  const installed = suite.install('codex', cwd);
  const transaction = `${installed}.inferencex-skills-transaction`;
  mkdirSync(transaction);
  writeFileSync(join(transaction, 'unknown'), 'untouched');
  diagnostic(
    suite.run(['install', '--target', 'codex', '--force', '--error-format', 'json'], cwd),
    'INTERNAL_ERROR',
  );
  assert.equal(readFileSync(join(transaction, 'unknown'), 'utf8'), 'untouched');
});

test('every data helper classifies request, response, HTTP, and stdout boundaries', () => {
  for (const [name, args] of cases) {
    diagnostic(run(name, args, 'network'), 'NETWORK_ERROR');
    diagnostic(run(name, args, 'timeout'), 'TIMEOUT');
    diagnostic(run(name, args, 'invalid'), 'INVALID_RESPONSE');
    const http = diagnostic(run(name, args, 'http'), 'HTTP_ERROR');
    assert.equal(http.error.http_status, 503, name);
    diagnostic(run(name, ['--help'], 'stdout-error'), 'OUTPUT_ERROR');
  }
});

test('PowerX JSON success is additive and preserves a truthful empty selection', () => {
  const result = run(
    'export-powerx',
    ['--model', 'x', '--isl', '1', '--osl', '1', '--format', 'json'],
    'empty',
  );
  assert.equal(result.status, 0, result.stderr);
  const output = JSON.parse(result.stdout);
  assert.equal(output.schema_version, 1);
  assert.deepEqual(output.rows, []);
  assert.equal(output.metadata.selected_rows, 0);
});

test('a timeout while reading a response body remains TIMEOUT', () => {
  diagnostic(
    run('export-powerx', ['--model', 'x', '--isl', '1', '--osl', '1'], 'body-timeout'),
    'TIMEOUT',
  );
});

test('a non-2xx stalled response body preserves TIMEOUT in each affected reader', () => {
  for (const [name, args] of cases.slice(0, 3)) {
    diagnostic(run(name, args, 'http-body-timeout'), 'TIMEOUT');
  }
});

test('AgentX preserves cancellation and timeout between body read and JSON parsing', () => {
  const args = ['--model', 'x'];
  diagnostic(run('export-agentx', args, 'parse-cancel'), 'CANCELLED', 130);
  diagnostic(run('export-agentx', args, 'parse-timeout'), 'TIMEOUT');
});

test('stdout writes fail within a bounded interval when the consumer never drains', () => {
  const started = Date.now();
  const result = run('compare-tco', ['--help'], 'stdout-stall');
  diagnostic(result, 'OUTPUT_ERROR');
  assert.ok(Date.now() - started < 8_000, `stdout failure took ${Date.now() - started}ms`);
});

test('SIGTERM aborts an active request, preserves output, and leaves failed evidence', async () => {
  const cwd = suite.project();
  const ready = join(cwd, 'ready');
  const output = join(cwd, 'power.json');
  writeFileSync(output, 'previous complete export');
  const child = spawn(
    process.execPath,
    [
      '--import',
      pathToFileURL(preload).href,
      scripts['export-powerx'],
      '--model',
      'x',
      '--isl',
      '1',
      '--osl',
      '1',
      '--format',
      'json',
      '--output',
      output,
      '--evidence-dir',
      'evidence',
      '--error-format',
      'json',
    ],
    {
      cwd,
      env: {
        ...suite.environment,
        INFERENCEX_CLI_CONTRACT_MODE: 'pending',
        INFERENCEX_TEST_READY: ready,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  let stdout = '';
  let stderr = '';
  child.stdout.setEncoding('utf8').on('data', (chunk) => (stdout += chunk));
  child.stderr.setEncoding('utf8').on('data', (chunk) => (stderr += chunk));
  const deadline = Date.now() + 2_000;
  while (!existsSync(ready) && Date.now() < deadline) {
    await new Promise((resolve) => {
      setTimeout(resolve, 10);
    });
  }
  assert.ok(existsSync(ready), 'request did not start');
  const closed = new Promise((resolve) => {
    child.once('close', (code, closedBy) => resolve([code, closedBy]));
  });
  child.kill('SIGTERM');
  const [status, signal] = await closed;
  assert.equal(signal, null, stderr);
  assert.equal(status, 130, stderr);
  assert.equal(stdout, '');
  assert.equal(JSON.parse(stderr).error.code, 'CANCELLED');
  assert.equal(readFileSync(output, 'utf8'), 'previous complete export');
  const manifest = JSON.parse(readFileSync(join(cwd, 'evidence', 'manifest.json'), 'utf8'));
  assert.equal(manifest.status, 'failed');
  assert.match(manifest.error, /SIGTERM/u);
  assert.equal(manifest.export.sha256, null);
});

test('SIGTERM after non-2xx headers remains CANCELLED in each affected reader', async () => {
  for (const [name, args] of cases.slice(0, 3)) {
    const cwd = suite.project();
    const ready = join(cwd, `${name}-ready`);
    const child = spawn(
      process.execPath,
      ['--import', pathToFileURL(preload).href, scripts[name], ...args, '--error-format', 'json'],
      {
        cwd,
        env: {
          ...suite.environment,
          INFERENCEX_CLI_CONTRACT_MODE: 'http-body-pending',
          INFERENCEX_TEST_READY: ready,
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8').on('data', (chunk) => (stdout += chunk));
    child.stderr.setEncoding('utf8').on('data', (chunk) => (stderr += chunk));
    const deadline = Date.now() + 2_000;
    while (!existsSync(ready) && Date.now() < deadline) {
      await new Promise((resolve) => {
        setTimeout(resolve, 10);
      });
    }
    assert.ok(existsSync(ready), `${name} response headers did not arrive`);
    const closed = new Promise((resolve) => {
      child.once('close', (code, closedBy) => resolve([code, closedBy]));
    });
    child.kill('SIGTERM');
    const [status, signal] = await closed;
    assert.equal(signal, null, stderr);
    diagnostic({ status, stdout, stderr }, 'CANCELLED', 130);
  }
});
