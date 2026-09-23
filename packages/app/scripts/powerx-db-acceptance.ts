/** bun scripts/powerx-db-acceptance.ts /absolute/output/directory; requires PostgreSQL 17 tools. */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawn } from 'node:child_process';
import { startPowerxBlobFixture } from './powerx-blob-fixture';

const output = path.resolve(
  process.argv[2] ?? fs.mkdtempSync(path.join(os.tmpdir(), 'powerx-db-')),
);
const pgBin = process.env.POWERX_PG_BIN ?? '/opt/homebrew/opt/postgresql@17/bin';
const appRoot = path.resolve(import.meta.dirname, '..');
const pgData = path.join(output, 'postgres');
const appPort = Number(process.env.POWERX_ACCEPTANCE_APP_PORT ?? 3137);
const pgPort = Number(process.env.POWERX_ACCEPTANCE_PG_PORT ?? 3138);
const baseUrl = `http://127.0.0.1:${appPort}`;
const dbUrl = `postgres://powerx_acceptance@127.0.0.1:${pgPort}/powerx_acceptance`;
fs.mkdirSync(output, { recursive: true });
const blob = await startPowerxBlobFixture();
const env = {
  ...process.env,
  POWERX_ACCEPTANCE_OUTPUT: output,
  POWERX_ACCEPTANCE_DATABASE_URL: dbUrl,
  POWERX_ACCEPTANCE_BASE_URL: baseUrl,
  DATABASE_READONLY_URL: dbUrl,
  DATABASE_WRITE_URL: '',
  DATABASE_DRIVER: 'postgres',
  DATABASE_SSL: 'false',
  E2E_FIXTURES: '0',
  GITHUB_TOKEN: '',
  ...blob.env,
  NEXT_PUBLIC_POSTHOG_KEY: '',
};
let server: ReturnType<typeof spawn> | undefined;
let dbStarted = false;
const cleanupErrors: string[] = [];
const receipt = {
  output,
  database: 'disposable localhost PostgreSQL',
  githubToken: false,
  blobCache: 'real SDK, local HTTP transport',
  retainedFixture: JSON.parse(
    fs.readFileSync(
      path.resolve(appRoot, '../../docs/fixtures/powerx-reingest/provenance.json'),
      'utf8',
    ),
  ),
  exitCode: 1,
  cleanupErrors,
};
try {
  execFileSync(
    path.join(pgBin, 'initdb'),
    ['-D', pgData, '-A', 'trust', '-U', 'powerx_acceptance', '--no-locale', '--encoding=UTF8'],
    { stdio: 'pipe' },
  );
  execFileSync(
    path.join(pgBin, 'pg_ctl'),
    [
      '-D',
      pgData,
      '-l',
      path.join(output, 'postgres.log'),
      '-o',
      `-h 127.0.0.1 -p ${pgPort} -k /tmp`,
      'start',
    ],
    { stdio: 'pipe' },
  );
  dbStarted = true;
  execFileSync(path.join(pgBin, 'createdb'), [
    '-h',
    '127.0.0.1',
    '-p',
    String(pgPort),
    '-U',
    'powerx_acceptance',
    'powerx_acceptance',
  ]);
  const seedLog = fs.openSync(path.join(output, 'seed.log'), 'w');
  execFileSync('bun', ['scripts/powerx-db-fixture.ts', 'seed'], {
    cwd: appRoot,
    env,
    stdio: ['ignore', seedLog, seedLog],
  });
  fs.closeSync(seedLog);
  const serverLog = fs.openSync(path.join(output, 'next.log'), 'w');
  server = spawn(
    'node',
    [
      'node_modules/next/dist/bin/next',
      'dev',
      '--hostname',
      '127.0.0.1',
      '--port',
      String(appPort),
    ],
    {
      cwd: appRoot,
      env,
      detached: true,
      stdio: ['ignore', serverLog, serverLog],
    },
  );
  let ready = false;
  for (let i = 0; i < 60; i++) {
    try {
      const response = await fetch(`${baseUrl}/api/v1/gpu-metrics-point?id=206885`, {
        signal: AbortSignal.timeout(5000),
      });
      if (response.ok) {
        ready = true;
        break;
      }
    } catch {
      /* Connection refusal is expected while Next starts. */
    }
    await new Promise((resolve) => {
      setTimeout(resolve, 500);
    });
  }
  if (!ready) throw new Error(`Local server did not become ready; inspect ${output}/next.log`);
  await fetch(`${baseUrl}/inference/agentic/206885?view=power`);
  await fetch(`${baseUrl}/zh/inference/agentic/206885?view=power`);
  await fetch(`${baseUrl}/inference`);
  const browserLog = fs.openSync(path.join(output, 'browser.log'), 'w');
  const browser = spawn(
    'node',
    ['node_modules/cypress/bin/cypress', 'run', '--config-file', 'cypress.powerx-db.config.ts'],
    {
      cwd: appRoot,
      env,
      stdio: ['ignore', browserLog, browserLog],
    },
  );
  receipt.exitCode = await new Promise<number>((resolve) => {
    browser.on('exit', (code) => resolve(code ?? 1));
  });
  const payloads = [...blob.objects.values()].map((value) => JSON.parse(value));
  const producersOf = (ids: number[]) =>
    payloads
      .filter((payload) => ids.includes(payload?.benchmarkResultId))
      .map((payload) => payload.series[0].sidecars.context.producer);
  const producers = producersOf([206885]);
  const retainedProducers = producersOf([206888, 206889]);
  const cacheVerified =
    blob.counts.reads > 0 &&
    producers.includes('collector-before-repair') &&
    producers.includes('collector-after-repair') &&
    retainedProducers.includes('retained-before-repair') &&
    retainedProducers.includes('retained-after-repair');
  fs.writeFileSync(
    path.join(output, 'blob-receipt.json'),
    JSON.stringify({ counts: blob.counts, producers, retainedProducers, cacheVerified }, null, 2),
  );
  if (!cacheVerified) receipt.exitCode = 1;
  fs.closeSync(browserLog);
  fs.closeSync(serverLog);
} finally {
  try {
    if (server?.pid) process.kill(-server.pid, 'SIGTERM');
  } catch (error) {
    if (!(error instanceof Error && 'code' in error && error.code === 'ESRCH'))
      cleanupErrors.push(`Next: ${String(error)}`);
  }
  try {
    if (dbStarted)
      execFileSync(path.join(pgBin, 'pg_ctl'), ['-D', pgData, '-m', 'fast', 'stop'], {
        stdio: 'pipe',
      });
  } catch (error) {
    cleanupErrors.push(`PostgreSQL: ${String(error)}`);
  }
  try {
    await blob.close();
  } catch (error) {
    cleanupErrors.push(`Blob fixture: ${String(error)}`);
  }
  if (cleanupErrors.length > 0) receipt.exitCode = 1;
  fs.writeFileSync(path.join(output, 'receipt.json'), JSON.stringify(receipt, null, 2));
}
console.log(JSON.stringify(receipt));
process.exitCode = receipt.exitCode;
