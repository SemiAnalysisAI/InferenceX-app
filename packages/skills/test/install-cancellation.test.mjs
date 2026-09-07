import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  readlinkSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { before, test } from 'node:test';
import { pathToFileURL } from 'node:url';

import { packageInfo, packedSkillSuite, succeeded } from './packed-skill.mjs';

const suite = packedSkillSuite();
const extracted = join(suite.temporaryRoot, 'extracted');
const installer = join(extracted, 'package/bin/install.mjs');
const source = join(extracted, 'package/skills/inferencex-api');

before(() => {
  mkdirSync(extracted);
  succeeded(spawnSync('tar', ['-xzf', suite.archive, '-C', extracted], { encoding: 'utf8' }));
});

function snapshot(root) {
  if (!existsSync(root)) return null;
  return ['', ...readdirSync(root, { recursive: true })].sort().map((path) => {
    const entry = lstatSync(join(root, path));
    return {
      path,
      mode: entry.mode & 0o777,
      contents: entry.isFile() ? readFileSync(join(root, path)).toString('base64') : null,
      link: entry.isSymbolicLink() ? readlinkSync(join(root, path)) : null,
    };
  });
}

async function waitForFile(path, child) {
  for (let attempt = 0; attempt < 250; attempt++) {
    if (existsSync(path)) return;
    if (child.exitCode !== null || child.signalCode !== null) {
      throw new Error(`installer exited before ${path} was created`);
    }
    await new Promise((resolve) => {
      setTimeout(resolve, 20);
    });
  }
  throw new Error(`timed out waiting for ${path}`);
}

function spawnInstaller(cwd, gate, phase, ownerPid) {
  mkdirSync(gate);
  const ready = join(gate, 'ready');
  const release = join(gate, 'release');
  const acknowledged = join(gate, 'acknowledged');
  const preload = join(gate, 'preload.mjs');
  writeFileSync(
    preload,
    `
import fs from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
const ready = ${JSON.stringify(ready)};
const release = ${JSON.stringify(release)};
const acknowledged = ${JSON.stringify(acknowledged)};
let gated = false;
function pause() {
  if (gated) return;
  gated = true;
  fs.writeFileSync(ready, String(process.pid));
  const deadline = Date.now() + 10_000;
  while (!fs.existsSync(release)) {
    if (Date.now() > deadline) throw new Error('test gate timed out');
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 10);
  }
}
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => fs.writeFileSync(acknowledged, signal));
}
if (${JSON.stringify(phase)} === 'staging') {
  const copy = fs.cpSync;
  fs.cpSync = (from, to, options) => {
    const result = copy(from, to, options);
    if (from === ${JSON.stringify(source)}) pause();
    return result;
  };
} else if (${JSON.stringify(phase)} === 'activated') {
  const rename = fs.renameSync;
  fs.renameSync = (from, to) => {
    const result = rename(from, to);
    if (from.endsWith('/transaction.next.json') &&
        JSON.parse(fs.readFileSync(to, 'utf8')).phase === 'activated') pause();
    return result;
  };
} else {
  const kill = process.kill;
  process.kill = (pid, signal) => {
    const result = kill(pid, signal);
    if (pid === ${JSON.stringify(ownerPid)} && signal === 0 && !gated) {
      gated = true;
      fs.writeFileSync(ready, String(process.pid));
    }
    return result;
  };
}
syncBuiltinESMExports();
`,
  );
  const child = spawn(
    process.execPath,
    [
      '--import',
      pathToFileURL(preload).href,
      installer,
      'install',
      '--dir',
      'skills',
      '--force',
      '--json',
      '--error-format',
      'json',
    ],
    { cwd, detached: true, env: suite.environment, stdio: ['ignore', 'pipe', 'pipe'] },
  );
  const output = { stdout: '', stderr: '' };
  child.stdout.on('data', (chunk) => (output.stdout += chunk));
  child.stderr.on('data', (chunk) => (output.stderr += chunk));
  return { child, output, ready, release, acknowledged, closed: once(child, 'close') };
}

async function finish(control) {
  const timer = setTimeout(() => process.kill(-control.child.pid, 'SIGKILL'), 5_000);
  try {
    return await control.closed;
  } finally {
    clearTimeout(timer);
  }
}

async function cleanup(control) {
  if (control.child.exitCode === null && control.child.signalCode === null) {
    process.kill(-control.child.pid, 'SIGKILL');
    await control.closed;
  }
}

function cancelled(control, result, signal) {
  assert.deepEqual(result, [130, null], JSON.stringify(control.output));
  assert.equal(control.output.stdout, '');
  const diagnostic = JSON.parse(control.output.stderr);
  assert.equal(diagnostic.error.code, 'CANCELLED');
  assert.equal(diagnostic.package_version, packageInfo.version);
  assert.equal(readFileSync(control.acknowledged, 'utf8'), signal);
}

for (const signal of ['SIGINT', 'SIGTERM']) {
  for (const existing of [false, true]) {
    test(`${signal} during staging cancels ${existing ? 'an upgrade' : 'a first install'} without partial files`, async () => {
      const cwd = suite.project('cancel staging 中文-');
      const destination = join(cwd, 'skills/inferencex-api');
      if (existing) {
        succeeded(suite.run(['install', '--dir', 'skills'], cwd));
        writeFileSync(join(destination, 'SKILL.md'), 'previous skill bytes\n');
        writeFileSync(join(destination, 'local-notes.txt'), 'keep me');
        chmodSync(join(destination, 'local-notes.txt'), 0o400);
      }
      const previous = snapshot(destination);
      const control = spawnInstaller(cwd, join(cwd, 'gate'), 'staging');
      try {
        await waitForFile(control.ready, control.child);
        control.child.kill(signal);
        writeFileSync(control.release, 'release');
        cancelled(control, await finish(control), signal);
        assert.deepEqual(snapshot(destination), previous);
        assert.deepEqual(readdirSync(dirname(destination)), existing ? ['inferencex-api'] : []);
      } finally {
        await cleanup(control);
      }
    });
  }
}

test('SIGTERM cancels a waiting installer without changing the live owner or destination', async () => {
  const cwd = suite.project('cancel waiter-');
  const destination = join(cwd, 'skills/inferencex-api');
  succeeded(suite.run(['install', '--dir', 'skills'], cwd));
  const previous = snapshot(destination);
  const owner = spawnInstaller(cwd, join(cwd, 'owner'), 'staging');
  let waiter;
  try {
    await waitForFile(owner.ready, owner.child);
    const transaction = `${destination}.inferencex-skills-transaction`;
    const pending = snapshot(transaction);
    waiter = spawnInstaller(cwd, join(cwd, 'waiter'), 'waiting', owner.child.pid);
    await waitForFile(waiter.ready, waiter.child);
    waiter.child.kill('SIGTERM');
    cancelled(waiter, await finish(waiter), 'SIGTERM');
    assert.equal(owner.child.exitCode, null);
    assert.deepEqual(snapshot(destination), previous);
    assert.deepEqual(snapshot(transaction), pending);
    writeFileSync(owner.release, 'release');
    assert.deepEqual(await finish(owner), [0, null], JSON.stringify(owner.output));
    assert.equal(JSON.parse(owner.output.stdout).outcome, 'overwritten');
  } finally {
    if (waiter) await cleanup(waiter);
    await cleanup(owner);
  }
});

test('SIGTERM after committed activation reports the completed installation', async () => {
  const cwd = suite.project('cancel after commit-');
  const destination = join(cwd, 'skills/inferencex-api');
  const control = spawnInstaller(cwd, join(cwd, 'gate'), 'activated');
  try {
    await waitForFile(control.ready, control.child);
    control.child.kill('SIGTERM');
    writeFileSync(control.release, 'release');
    assert.deepEqual(await finish(control), [0, null], JSON.stringify(control.output));
    assert.equal(control.output.stderr, '');
    assert.equal(JSON.parse(control.output.stdout).outcome, 'installed');
    assert.equal(readFileSync(control.acknowledged, 'utf8'), 'SIGTERM');
    assert.equal(
      JSON.parse(readFileSync(join(destination, '.inferencex-skills.json'), 'utf8')).version,
      packageInfo.version,
    );
    assert.deepEqual(readdirSync(dirname(destination)), ['inferencex-api']);
  } finally {
    await cleanup(control);
  }
});
