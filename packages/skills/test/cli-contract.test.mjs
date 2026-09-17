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
  ['export-powerx', ['powerx', 'export'], ['--model', 'x', '--isl', '1', '--osl', '1']],
  ['export-agentx', ['agentx', 'export'], ['--model', 'x']],
  ['investigate-result', ['result', 'inspect'], ['--id', '1', '--model', 'x']],
  [
    'compare-tco',
    ['tco', 'compare'],
    ['--model', 'x', '--workloads', '1x1', '--target', '1', '--gpu-hourly-prices', 'b200=1'],
  ],
  [
    'compare-releases',
    ['releases', 'compare'],
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
  ['compare-collectivex', ['collectivex', 'compare'], [], ['--left', '1']],
];

function run(name, args, mode = 'network') {
  const cwd = suite.project();
  const route = cases.find(([candidate]) => candidate === name)[1];
  const output = args.includes('--help') ? [] : ['--output-dir', join(cwd, 'bundle')];
  return suite.node(
    [
      '--import',
      pathToFileURL(preload).href,
      scripts,
      ...route,
      ...args,
      ...output,
      '--error-format',
      'json',
    ],
    {
      cwd,
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
if (mode === 'body-timeout' || mode === 'parse-timeout' || mode === 'request-abort') {
  const timeout = AbortSignal.timeout;
  AbortSignal.timeout = milliseconds => {
    const controlled =
      mode === 'request-abort' ||
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
  if (mode === 'request-abort') {
    return await new Promise((_resolve, reject) => {
      options.signal.addEventListener('abort', () => {
        reject(new DOMException('fetch aborted', 'AbortError'));
      }, { once: true });
    });
  }
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
  if (mode === 'body-timeout' || mode === 'http-body-stall' || mode === 'http-body-pending') {
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
  scripts = join(installed, 'scripts/inferencex.mjs');
});

test('the packed shared contract exports the typed error and boundary helpers', async () => {
  const contract = join(scripts, '..', 'cli-contract.mjs');
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

test('every formal route emits one structured INVALID_ARGUMENT diagnostic', () => {
  for (const [name, _route, _validArgs, invalidArgs = []] of cases) {
    diagnostic(run(name, invalidArgs), 'INVALID_ARGUMENT', 2);
  }
  const cwd = suite.project();
  const result = suite.run(['install', '--target', 'unknown', '--error-format', 'json'], cwd);
  diagnostic(result, 'INVALID_ARGUMENT', 2);
});

test('request budgets classify a generic fetch AbortError as TIMEOUT', () => {
  for (const [name, _route, args] of cases) {
    diagnostic(run(name, args, 'request-abort'), 'TIMEOUT');
  }
});

test('every formal route rejects an unknown error format', () => {
  for (const [name, route] of cases) {
    const result = suite.node([scripts, ...route, '--error-format', 'yaml']);
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
    for (const [, route] of cases) {
      diagnostic(suite.node([scripts, ...route, '--help', ...args]), 'INVALID_ARGUMENT', 2);
    }
    diagnostic(suite.run(['install', ...args], suite.project()), 'INVALID_ARGUMENT', 2);
  }
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

test('every formal route classifies request, response, HTTP, and stdout boundaries', () => {
  for (const [name, _route, args] of cases) {
    diagnostic(run(name, args, 'network'), 'NETWORK_ERROR');
    diagnostic(run(name, args, 'timeout'), 'TIMEOUT');
    diagnostic(run(name, args, 'invalid'), 'INVALID_RESPONSE');
    const http = diagnostic(run(name, args, 'http'), 'HTTP_ERROR');
    assert.equal(http.error.http_status, 503, name);
    diagnostic(run(name, ['--help'], 'stdout-error'), 'OUTPUT_ERROR');
  }
});

test('a timeout while reading a response body remains TIMEOUT', () => {
  diagnostic(
    run('export-powerx', ['--model', 'x', '--isl', '1', '--osl', '1'], 'body-timeout'),
    'TIMEOUT',
  );
});

test('every formal route discards a stalled rejected body and reports its HTTP status', () => {
  for (const [name, _route, args] of cases) {
    const value = diagnostic(run(name, args, 'http-body-stall'), 'HTTP_ERROR');
    assert.equal(value.error.http_status, 503, name);
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

test('SIGTERM aborts an active unified request and leaves no completed manifest', async () => {
  const cwd = suite.project();
  const ready = join(cwd, 'ready');
  const output = join(cwd, 'evidence');
  const child = spawn(
    process.execPath,
    [
      '--import',
      pathToFileURL(preload).href,
      scripts,
      'powerx',
      'export',
      '--model',
      'x',
      '--isl',
      '1',
      '--osl',
      '1',
      '--format',
      'json',
      '--output-dir',
      output,
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
  assert.equal(existsSync(output), true);
  assert.equal(existsSync(join(output, 'manifest.json')), false);
});

test('SIGTERM after non-2xx headers remains CANCELLED in each affected reader', async () => {
  for (const [name, route, args] of cases.slice(0, 3)) {
    const cwd = suite.project();
    const ready = join(cwd, `${name}-ready`);
    const output = join(cwd, 'bundle');
    const child = spawn(
      process.execPath,
      [
        '--import',
        pathToFileURL(preload).href,
        scripts,
        ...route,
        ...args,
        '--output-dir',
        output,
        '--error-format',
        'json',
      ],
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
