import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import {
  chmodSync,
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  readlinkSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { test } from 'node:test';

import { packageInfo, packageRoot, packedSkillSuite, succeeded } from './packed-skill.mjs';

const suite = packedSkillSuite();
const { project, run } = suite;
const metadataName = '.inferencex-skills.json';

function writeTransactionMarker(
  transaction,
  destination,
  { ownerPid = 2_147_483_647, raw, ...overrides } = {},
) {
  const transactionId = randomUUID();
  const record = {
    schema_version: 1,
    transaction_id: transactionId,
    package: packageInfo.name,
    skill: 'inferencex-api',
    destination,
    owner_pid: ownerPid,
    phase: 'staged',
    had_destination: true,
    ...overrides,
  };
  const path = join(transaction, `owner-${transactionId}-${ownerPid}-${randomUUID()}.json`);
  writeFileSync(path, raw ?? JSON.stringify(record));
  return { path, record };
}

function snapshot(root) {
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

function runWithPreload(args, cwd, source) {
  const preload = join(project('installer preload-'), 'preload.mjs');
  writeFileSync(preload, source);
  const previous = suite.environment.NODE_OPTIONS;
  suite.environment.NODE_OPTIONS = `--import=${JSON.stringify(pathToFileURL(preload).href)}`;
  try {
    return run(args, cwd);
  } finally {
    if (previous === undefined) delete suite.environment.NODE_OPTIONS;
    else suite.environment.NODE_OPTIONS = previous;
  }
}

async function waitForFile(path, child) {
  for (let attempt = 0; attempt < 250; attempt++) {
    if (existsSync(path)) return;
    if (child.exitCode !== null) throw new Error(`installer exited before ${path} was created`);
    await new Promise((resolve) => {
      setTimeout(resolve, 20);
    });
  }
  throw new Error(`timed out waiting for ${path}`);
}

function spawnPackedInstaller(args, cwd, nodeOptions) {
  const environment = { ...suite.environment };
  if (nodeOptions === undefined) delete environment.NODE_OPTIONS;
  else environment.NODE_OPTIONS = nodeOptions;
  const child = spawn(
    'npm',
    ['exec', '--yes', '--offline', '--package', suite.archive, '--', 'inferencex-skills', ...args],
    {
      cwd,
      detached: true,
      env: environment,
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  const output = { stdout: '', stderr: '' };
  child.stdout.on('data', (chunk) => (output.stdout += chunk));
  child.stderr.on('data', (chunk) => (output.stderr += chunk));
  return { child, output, closed: once(child, 'close') };
}

test('a staging copy failure preserves the existing installation byte for byte', () => {
  const cwd = project('copy failure 中文 path-');
  succeeded(run(['install', '--dir', 'custom skills'], cwd));
  const destination = join(cwd, 'custom skills/inferencex-api');
  const transaction = `${destination}.inferencex-skills-transaction`;
  writeFileSync(join(destination, 'SKILL.md'), 'old skill bytes\n');
  writeFileSync(join(destination, 'local-notes.txt'), 'keep me');
  chmodSync(join(destination, 'local-notes.txt'), 0o400);
  const oldReceipt = readFileSync(join(destination, metadataName));
  const before = snapshot(destination);

  const failed = runWithPreload(
    ['install', '--dir', 'custom skills', '--force', '--json'],
    cwd,
    `
      import fs from 'node:fs';
      import { syncBuiltinESMExports } from 'node:module';
      const original = fs.cpSync;
      fs.cpSync = (source, target, options) => {
        const result = original(source, target, options);
        if (target === ${JSON.stringify(join(transaction, 'stage'))}) {
          throw new Error('injected staged copy failure');
        }
        return result;
      };
      syncBuiltinESMExports();
    `,
  );

  assert.equal(failed.status, 1, `${failed.stdout}\n${failed.stderr}`);
  assert.match(failed.stderr, /injected staged copy failure/u);
  assert.deepEqual(snapshot(destination), before);
  assert.deepEqual(readFileSync(join(destination, metadataName)), oldReceipt);
  assert.equal(readFileSync(join(destination, 'local-notes.txt'), 'utf8'), 'keep me');
  assert.equal(lstatSync(transaction, { throwIfNoEntry: false }), undefined);
});

test('a staged receipt failure preserves the existing receipt and extra files', () => {
  const cwd = project();
  succeeded(run(['install'], cwd));
  const destination = join(cwd, '.claude/skills/inferencex-api');
  const transaction = `${destination}.inferencex-skills-transaction`;
  writeFileSync(join(destination, 'SKILL.md'), 'old skill bytes\n');
  writeFileSync(join(destination, 'local-notes.txt'), 'keep me');
  const oldReceipt = readFileSync(join(destination, metadataName));
  const before = snapshot(destination);

  const failed = runWithPreload(
    ['install', '--force', '--json'],
    cwd,
    `
      import fs from 'node:fs';
      import { syncBuiltinESMExports } from 'node:module';
      const original = fs.writeFileSync;
      fs.writeFileSync = (path, data, options) => {
        if (path === ${JSON.stringify(join(transaction, 'stage', metadataName))}) {
          throw new Error('injected receipt failure');
        }
        return original(path, data, options);
      };
      syncBuiltinESMExports();
    `,
  );

  assert.equal(failed.status, 1, `${failed.stdout}\n${failed.stderr}`);
  assert.match(failed.stderr, /injected receipt failure/u);
  assert.deepEqual(snapshot(destination), before);
  assert.deepEqual(readFileSync(join(destination, metadataName)), oldReceipt);
  assert.equal(readFileSync(join(destination, 'local-notes.txt'), 'utf8'), 'keep me');
  assert.equal(lstatSync(transaction, { throwIfNoEntry: false }), undefined);
});

test('an activation rename failure restores the complete previous installation', () => {
  const cwd = project();
  succeeded(run(['install'], cwd));
  const destination = join(cwd, '.claude/skills/inferencex-api');
  const transaction = `${destination}.inferencex-skills-transaction`;
  writeFileSync(join(destination, 'SKILL.md'), 'old skill bytes\n');
  writeFileSync(join(destination, 'local-notes.txt'), 'keep me');
  const before = snapshot(destination);

  const failed = runWithPreload(
    ['install', '--force', '--json'],
    cwd,
    `
      import fs from 'node:fs';
      import { syncBuiltinESMExports } from 'node:module';
      const original = fs.renameSync;
      fs.renameSync = (source, target) => {
        if (
          source === ${JSON.stringify(join(transaction, 'stage'))} &&
          target === ${JSON.stringify(destination)}
        ) {
          throw new Error('injected activation failure');
        }
        return original(source, target);
      };
      syncBuiltinESMExports();
    `,
  );

  assert.equal(failed.status, 1, `${failed.stdout}\n${failed.stderr}`);
  assert.match(failed.stderr, /injected activation failure/u);
  assert.deepEqual(snapshot(destination), before);
  assert.equal(readFileSync(join(destination, 'local-notes.txt'), 'utf8'), 'keep me');
  assert.equal(lstatSync(transaction, { throwIfNoEntry: false }), undefined);
});

test('a cleanup failure after activation keeps the complete new installation recoverable', () => {
  const cwd = project();
  succeeded(run(['install'], cwd));
  const destination = join(cwd, '.claude/skills/inferencex-api');
  const transaction = `${destination}.inferencex-skills-transaction`;
  writeFileSync(join(destination, 'SKILL.md'), 'old skill bytes\n');
  writeFileSync(join(destination, 'local-notes.txt'), 'keep me');

  const failed = runWithPreload(
    ['install', '--force', '--json'],
    cwd,
    `
      import fs from 'node:fs';
      import { syncBuiltinESMExports } from 'node:module';
      const original = fs.rmSync;
      fs.rmSync = (path, options) => {
        if (path.endsWith('/previous') && options?.recursive) {
          throw new Error('injected cleanup failure');
        }
        return original(path, options);
      };
      syncBuiltinESMExports();
    `,
  );

  assert.equal(failed.status, 1, `${failed.stdout}\n${failed.stderr}`);
  assert.match(failed.stderr, /injected cleanup failure/u);
  assert.deepEqual(
    readFileSync(join(destination, 'SKILL.md')),
    readFileSync(join(packageRoot, 'skills/inferencex-api/SKILL.md')),
  );
  assert.equal(readFileSync(join(destination, 'local-notes.txt'), 'utf8'), 'keep me');
  const pending = JSON.parse(run(['status', '--json'], cwd).stdout);
  assert.equal(pending.transaction_state, 'recovery_needed');
  assert.equal(pending.transaction_phase, 'activated');

  const recovered = run(['install', '--json'], cwd);
  assert.equal(recovered.status, 0, `${recovered.stdout}\n${recovered.stderr}`);
  const record = JSON.parse(recovered.stdout);
  assert.equal(record.outcome, 'skipped');
  assert.equal(record.installation_state, 'installed');
  assert.equal(record.installed_version, packageInfo.version);
  assert.equal(lstatSync(transaction, { throwIfNoEntry: false }), undefined);
});

test('a successful force install replaces packaged files and preserves extras and their modes', () => {
  const cwd = project();
  succeeded(run(['install'], cwd));
  const destination = join(cwd, '.claude/skills/inferencex-api');
  const localNotes = join(destination, 'local-notes.txt');
  writeFileSync(join(destination, 'SKILL.md'), 'old skill bytes\n');
  writeFileSync(localNotes, 'keep me');
  chmodSync(localNotes, 0o400);

  const upgraded = run(['install', '--force', '--json'], cwd);

  assert.equal(upgraded.status, 0, `${upgraded.stdout}\n${upgraded.stderr}`);
  assert.deepEqual(
    readFileSync(join(destination, 'SKILL.md')),
    readFileSync(join(packageRoot, 'skills/inferencex-api/SKILL.md')),
  );
  assert.equal(readFileSync(localNotes, 'utf8'), 'keep me');
  assert.equal(lstatSync(localNotes).mode & 0o777, 0o400);
  assert.equal(
    JSON.parse(readFileSync(join(destination, metadataName), 'utf8')).version,
    packageInfo.version,
  );
});

test('status reports an interrupted transaction without claiming the old version or writing', () => {
  const cwd = project();
  succeeded(run(['install'], cwd));
  const destination = join(cwd, '.claude/skills/inferencex-api');
  const transaction = `${destination}.inferencex-skills-transaction`;
  mkdirSync(transaction);
  cpSync(destination, join(transaction, 'stage'), { recursive: true });
  writeTransactionMarker(transaction, destination);
  const before = snapshot(cwd);

  const result = run(['status', '--json'], cwd);

  assert.equal(result.status, 0, result.stderr);
  const status = JSON.parse(result.stdout);
  assert.equal(status.installation_state, 'unknown');
  assert.equal(status.installed_version, null);
  assert.equal(status.transaction_state, 'recovery_needed');
  assert.equal(status.transaction_phase, 'staged');
  assert.match(status.reason, /needs recovery/u);
  assert.deepEqual(snapshot(cwd), before);
});

test('dry-run reports required recovery without changing the transaction or installation', () => {
  const cwd = project();
  succeeded(run(['install'], cwd));
  const destination = join(cwd, '.claude/skills/inferencex-api');
  const transaction = `${destination}.inferencex-skills-transaction`;
  mkdirSync(transaction);
  cpSync(destination, join(transaction, 'stage'), { recursive: true });
  writeTransactionMarker(transaction, destination);
  const before = snapshot(cwd);

  const result = run(['install', '--force', '--dry-run', '--json'], cwd);

  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  const preview = JSON.parse(result.stdout);
  assert.equal(preview.outcome, 'would_recover_then_overwrite');
  assert.equal(preview.installation_state, 'unknown');
  assert.equal(preview.installed_version, null);
  assert.equal(preview.transaction_state, 'recovery_needed');
  assert.ok(preview.write_paths.length > 0);
  assert.deepEqual(snapshot(cwd), before);
});

test('dry-run predicts a skip after recovering an activated first install', () => {
  const cwd = project('activated first install preview 中文 path-');
  succeeded(run(['install'], cwd));
  const destination = join(cwd, '.claude/skills/inferencex-api');
  const transaction = `${destination}.inferencex-skills-transaction`;
  const before = snapshot(destination);
  mkdirSync(transaction);
  writeTransactionMarker(transaction, destination, {
    phase: 'activated',
    had_destination: false,
  });
  const beforePreview = snapshot(cwd);

  const previewResult = run(['install', '--dry-run', '--json'], cwd);
  assert.equal(previewResult.status, 0, `${previewResult.stdout}\n${previewResult.stderr}`);
  const preview = JSON.parse(previewResult.stdout);
  assert.equal(preview.outcome, 'would_recover_then_skip');
  assert.deepEqual(preview.write_paths, []);
  assert.deepEqual(snapshot(cwd), beforePreview);

  const installed = run(['install', '--json'], cwd);
  assert.equal(installed.status, 0, `${installed.stdout}\n${installed.stderr}`);
  assert.equal(JSON.parse(installed.stdout).outcome, 'skipped');
  assert.deepEqual(snapshot(destination), before);
  assert.deepEqual(readdirSync(join(cwd, '.claude/skills')), ['inferencex-api']);
});

test('a process killed between activation renames is recovered by the next install', async () => {
  const cwd = project('killed activation 中文 path-');
  succeeded(run(['install'], cwd));
  const destination = join(cwd, '.claude/skills/inferencex-api');
  const transaction = `${destination}.inferencex-skills-transaction`;
  const receipt = join(destination, metadataName);
  const powerx = join(destination, 'scripts/export-powerx.mjs');
  writeFileSync(receipt, JSON.stringify({ package: packageInfo.name, version: '0.1.99' }));
  writeFileSync(
    powerx,
    readFileSync(powerx, 'utf8').replace(
      /^const PACKAGE_VERSION = .*;$/mu,
      "const PACKAGE_VERSION = '0.1.99';",
    ),
  );
  writeFileSync(join(destination, 'SKILL.md'), 'old skill bytes survive the killed process\n');
  writeFileSync(join(destination, 'local-notes.txt'), 'keep me');
  const oldReceipt = readFileSync(receipt);
  const before = snapshot(destination);
  const ready = join(cwd, 'activation-ready');
  const preload = join(project('kill preload-'), 'preload.mjs');
  writeFileSync(
    preload,
    `
      import fs from 'node:fs';
      import { syncBuiltinESMExports } from 'node:module';
      const original = fs.renameSync;
      fs.renameSync = (source, target) => {
        if (
          source === ${JSON.stringify(join(transaction, 'stage'))} &&
          target === ${JSON.stringify(destination)}
        ) {
          fs.writeFileSync(${JSON.stringify(ready)}, 'ready');
          Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0);
        }
        return original(source, target);
      };
      syncBuiltinESMExports();
    `,
  );
  const { child, output, closed } = spawnPackedInstaller(
    ['install', '--force'],
    cwd,
    `--import=${JSON.stringify(pathToFileURL(preload).href)}`,
  );
  await waitForFile(ready, child);
  process.kill(-child.pid, 'SIGKILL');
  await closed;
  assert.equal(lstatSync(destination, { throwIfNoEntry: false }), undefined, output.stderr);

  const pending = JSON.parse(run(['status', '--json'], cwd).stdout);
  assert.equal(pending.installation_state, 'unknown');
  assert.equal(pending.transaction_state, 'recovery_needed');
  assert.equal(pending.transaction_phase, 'previous_moved');
  const beforePreview = snapshot(cwd);
  const preview = JSON.parse(run(['install', '--dry-run', '--json'], cwd).stdout);
  assert.equal(preview.outcome, 'would_recover_then_skip');
  assert.deepEqual(preview.write_paths, []);
  assert.deepEqual(snapshot(cwd), beforePreview);

  const recovered = run(['install', '--json'], cwd);
  assert.equal(recovered.status, 0, `${recovered.stdout}\n${recovered.stderr}`);
  const recoveredRecord = JSON.parse(recovered.stdout);
  assert.equal(recoveredRecord.outcome, 'skipped');
  assert.equal(recoveredRecord.installation_state, 'installed');
  assert.equal(recoveredRecord.installed_version, '0.1.99');
  assert.deepEqual(snapshot(destination), before);
  assert.deepEqual(readFileSync(receipt), oldReceipt);
  assert.equal(readFileSync(join(destination, 'local-notes.txt'), 'utf8'), 'keep me');
  assert.equal(lstatSync(transaction, { throwIfNoEntry: false }), undefined);
  rmSync(ready);
});

test('a process killed after committed backup cleanup leaves its owner marker recoverable', async () => {
  const cwd = project('killed committed cleanup 中文 path-');
  succeeded(run(['install'], cwd));
  const skillsRoot = join(cwd, '.claude/skills');
  const destination = join(skillsRoot, 'inferencex-api');
  const transaction = `${destination}.inferencex-skills-transaction`;
  writeFileSync(join(destination, 'SKILL.md'), 'old skill bytes\n');
  writeFileSync(join(destination, 'local-notes.txt'), 'keep me');
  const ready = join(cwd, 'committed-backup-removed');
  const preload = join(project('committed cleanup kill preload-'), 'preload.mjs');
  writeFileSync(
    preload,
    `
      import fs from 'node:fs';
      import { syncBuiltinESMExports } from 'node:module';
      const original = fs.rmSync;
      let paused = false;
      fs.rmSync = (path, options) => {
        if (
          !paused &&
          path.endsWith('/previous') &&
          (path === ${JSON.stringify(join(transaction, 'previous'))} ||
            path.includes('.inferencex-skills-transaction.recovering-')) &&
          options?.recursive
        ) {
          paused = true;
          const result = original(path, options);
          fs.writeFileSync(${JSON.stringify(ready)}, 'ready');
          Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0);
          return result;
        }
        if (!paused && path === ${JSON.stringify(transaction)} && options?.recursive) {
          paused = true;
          original(${JSON.stringify(join(transaction, 'previous'))}, {
            recursive: true,
            force: true,
          });
          fs.writeFileSync(${JSON.stringify(ready)}, 'ready');
          Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0);
        }
        return original(path, options);
      };
      syncBuiltinESMExports();
    `,
  );
  const { child, output, closed } = spawnPackedInstaller(
    ['install', '--force', '--json'],
    cwd,
    `--import=${JSON.stringify(pathToFileURL(preload).href)}`,
  );
  await waitForFile(ready, child);
  process.kill(-child.pid, 'SIGKILL');
  await closed;

  const recoveryName = readdirSync(skillsRoot).find((name) =>
    name.startsWith('inferencex-api.inferencex-skills-transaction.recovering-'),
  );
  const recovery = recoveryName ? join(skillsRoot, recoveryName) : transaction;
  assert.ok(lstatSync(recovery, { throwIfNoEntry: false }), output.stderr);
  const ownerMarker =
    readdirSync(recovery).find((name) => name.startsWith('owner-')) ?? 'transaction.json';
  assert.ok(ownerMarker);
  assert.equal(JSON.parse(readFileSync(join(recovery, ownerMarker), 'utf8')).phase, 'activated');
  assert.equal(lstatSync(join(recovery, 'previous'), { throwIfNoEntry: false }), undefined);

  const pending = JSON.parse(run(['status', '--json'], cwd).stdout);
  assert.equal(pending.transaction_state, 'recovery_needed');
  assert.equal(pending.transaction_phase, 'activated');
  const recovered = run(['install', '--json'], cwd);
  assert.equal(recovered.status, 0, `${recovered.stdout}\n${recovered.stderr}`);
  const record = JSON.parse(recovered.stdout);
  assert.equal(record.outcome, 'skipped');
  assert.equal(record.installation_state, 'installed');
  assert.equal(record.installed_version, packageInfo.version);
  assert.equal(readFileSync(join(destination, 'local-notes.txt'), 'utf8'), 'keep me');
  assert.deepEqual(readdirSync(skillsRoot), ['inferencex-api']);
  assert.equal(lstatSync(transaction, { throwIfNoEntry: false }), undefined);
});

test('simultaneous installs serialize and the second observes the first result', async () => {
  const cwd = project('concurrent install 中文 path-');
  const destination = join(cwd, 'custom skills/inferencex-api');
  const transaction = `${destination}.inferencex-skills-transaction`;
  const ready = join(cwd, 'stage-ready');
  const release = join(cwd, 'release-first-installer');
  const preload = join(project('concurrent preload-'), 'preload.mjs');
  writeFileSync(
    preload,
    `
      import fs from 'node:fs';
      import { syncBuiltinESMExports } from 'node:module';
      const original = fs.cpSync;
      fs.cpSync = (source, target, options) => {
        const result = original(source, target, options);
        if (target === ${JSON.stringify(join(transaction, 'stage'))}) {
          fs.writeFileSync(${JSON.stringify(ready)}, 'ready');
          while (!fs.existsSync(${JSON.stringify(release)})) {
            Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 20);
          }
        }
        return result;
      };
      syncBuiltinESMExports();
    `,
  );
  const first = spawnPackedInstaller(
    ['install', '--dir', 'custom skills', '--json'],
    cwd,
    `--import=${JSON.stringify(pathToFileURL(preload).href)}`,
  );
  await waitForFile(ready, first.child);
  const busy = JSON.parse(run(['status', '--dir', 'custom skills', '--json'], cwd).stdout);
  assert.equal(busy.installation_state, 'unknown');
  assert.equal(busy.transaction_state, 'busy');

  const second = spawnPackedInstaller(['install', '--dir', 'custom skills', '--json'], cwd);
  await new Promise((resolve) => {
    setTimeout(resolve, 150);
  });
  assert.equal(second.child.exitCode, null, second.output.stderr);
  writeFileSync(release, 'continue');
  const [[firstCode], [secondCode]] = await Promise.all([first.closed, second.closed]);

  assert.equal(firstCode, 0, `${first.output.stdout}\n${first.output.stderr}`);
  assert.equal(secondCode, 0, `${second.output.stdout}\n${second.output.stderr}`);
  assert.equal(JSON.parse(first.output.stdout).outcome, 'installed');
  const secondRecord = JSON.parse(second.output.stdout);
  assert.equal(secondRecord.outcome, 'skipped');
  assert.equal(secondRecord.installation_state, 'installed');
  assert.equal(secondRecord.installed_version, packageInfo.version);
  assert.equal(
    JSON.parse(readFileSync(join(destination, metadataName), 'utf8')).version,
    packageInfo.version,
  );
  assert.equal(lstatSync(transaction, { throwIfNoEntry: false }), undefined);
});

test('a contender waits while the transaction owner writes its initial marker', async () => {
  const cwd = project();
  const destination = join(cwd, '.claude/skills/inferencex-api');
  const transaction = `${destination}.inferencex-skills-transaction`;
  const ready = join(cwd, 'transaction-directory-ready');
  const release = join(cwd, 'release-marker-write');
  const preload = join(project('marker preload-'), 'preload.mjs');
  writeFileSync(
    preload,
    `
      import fs from 'node:fs';
      import { syncBuiltinESMExports } from 'node:module';
      const original = fs.writeFileSync;
      fs.writeFileSync = (path, data, options) => {
        if (path.startsWith(${JSON.stringify(`${transaction}/owner-`)})) {
          fs.writeFileSync = original;
          original(${JSON.stringify(ready)}, 'ready');
          while (!fs.existsSync(${JSON.stringify(release)})) {
            Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 20);
          }
        }
        return original(path, data, options);
      };
      syncBuiltinESMExports();
    `,
  );
  const first = spawnPackedInstaller(
    ['install', '--json'],
    cwd,
    `--import=${JSON.stringify(pathToFileURL(preload).href)}`,
  );
  await waitForFile(ready, first.child);
  const second = spawnPackedInstaller(['install', '--json'], cwd);
  await new Promise((resolve) => {
    setTimeout(resolve, 1_000);
  });
  const secondWasWaiting = second.child.exitCode === null;
  writeFileSync(release, 'continue');
  const [[firstCode], [secondCode]] = await Promise.all([first.closed, second.closed]);

  assert.equal(secondWasWaiting, true, second.output.stderr);
  assert.equal(firstCode, 0, `${first.output.stdout}\n${first.output.stderr}`);
  assert.equal(secondCode, 0, `${second.output.stdout}\n${second.output.stderr}`);
  assert.equal(JSON.parse(first.output.stdout).outcome, 'installed');
  assert.equal(JSON.parse(second.output.stdout).outcome, 'skipped');
  assert.equal(lstatSync(transaction, { throwIfNoEntry: false }), undefined);
});

test('simultaneous recoverers atomically claim a dead transaction before restoring files', async () => {
  const cwd = project('concurrent recovery 中文 path-');
  succeeded(run(['install'], cwd));
  const destination = join(cwd, '.claude/skills/inferencex-api');
  const transaction = `${destination}.inferencex-skills-transaction`;
  const previous = join(transaction, 'previous');
  writeFileSync(join(destination, 'local-notes.txt'), 'keep me');
  const before = snapshot(destination);
  mkdirSync(transaction);
  renameSync(destination, previous);
  cpSync(previous, destination, { recursive: true });
  writeFileSync(join(destination, 'SKILL.md'), 'uncommitted staged destination\n');
  writeTransactionMarker(transaction, destination, { phase: 'previous_moved' });
  const ready = join(cwd, 'first-recoverer-ready');
  const release = join(cwd, 'release-first-recoverer');
  const preload = join(project('recovery race preload-'), 'preload.mjs');
  writeFileSync(
    preload,
    `
      import fs from 'node:fs';
      import { syncBuiltinESMExports } from 'node:module';
      const original = fs.rmSync;
      let paused = false;
      fs.rmSync = (path, options) => {
        if (!paused && path === ${JSON.stringify(destination)} && options?.recursive) {
          paused = true;
          fs.writeFileSync(${JSON.stringify(ready)}, 'ready');
          while (!fs.existsSync(${JSON.stringify(release)})) {
            Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 20);
          }
        }
        return original(path, options);
      };
      syncBuiltinESMExports();
    `,
  );
  const first = spawnPackedInstaller(
    ['install', '--json'],
    cwd,
    `--import=${JSON.stringify(pathToFileURL(preload).href)}`,
  );
  await waitForFile(ready, first.child);
  const second = spawnPackedInstaller(['install', '--json'], cwd);
  await new Promise((resolve) => {
    setTimeout(resolve, 1_000);
  });
  const secondWasWaiting = second.child.exitCode === null;
  writeFileSync(release, 'continue');
  const [[firstCode], [secondCode]] = await Promise.all([first.closed, second.closed]);

  assert.equal(secondWasWaiting, true, second.output.stderr);
  assert.equal(firstCode, 0, `${first.output.stdout}\n${first.output.stderr}`);
  assert.equal(secondCode, 0, `${second.output.stdout}\n${second.output.stderr}`);
  assert.equal(JSON.parse(first.output.stdout).outcome, 'skipped');
  assert.equal(JSON.parse(second.output.stdout).outcome, 'skipped');
  assert.deepEqual(snapshot(destination), before);
  assert.equal(readFileSync(join(destination, 'local-notes.txt'), 'utf8'), 'keep me');
  assert.deepEqual(readdirSync(join(cwd, '.claude/skills')), ['inferencex-api']);
});

test('a killed recovery owner leaves its exact owner token reclaimable', async () => {
  const cwd = project('killed recovery owner 中文 path-');
  succeeded(run(['install'], cwd));
  const destination = join(cwd, '.claude/skills/inferencex-api');
  const transaction = `${destination}.inferencex-skills-transaction`;
  const previous = join(transaction, 'previous');
  writeFileSync(join(destination, 'local-notes.txt'), 'keep me');
  const before = snapshot(destination);
  mkdirSync(transaction);
  renameSync(destination, previous);
  cpSync(previous, destination, { recursive: true });
  writeFileSync(join(destination, 'SKILL.md'), 'uncommitted staged destination\n');
  writeTransactionMarker(transaction, destination, { phase: 'previous_moved' });
  const ready = join(cwd, 'recovery-owner-ready');
  const preload = join(project('killed recovery owner preload-'), 'preload.mjs');
  writeFileSync(
    preload,
    `
      import fs from 'node:fs';
      import { syncBuiltinESMExports } from 'node:module';
      const original = fs.rmSync;
      fs.rmSync = (path, options) => {
        if (path === ${JSON.stringify(destination)} && options?.recursive) {
          fs.writeFileSync(${JSON.stringify(ready)}, 'ready');
          Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0);
        }
        return original(path, options);
      };
      syncBuiltinESMExports();
    `,
  );
  const { child, output, closed } = spawnPackedInstaller(
    ['install', '--json'],
    cwd,
    `--import=${JSON.stringify(pathToFileURL(preload).href)}`,
  );
  await waitForFile(ready, child);
  process.kill(-child.pid, 'SIGKILL');
  await closed;

  const pending = JSON.parse(run(['status', '--json'], cwd).stdout);
  assert.equal(pending.transaction_state, 'recovery_needed', output.stderr);
  assert.equal(pending.transaction_phase, 'previous_moved');
  const recovered = run(['install', '--json'], cwd);
  assert.equal(recovered.status, 0, `${recovered.stdout}\n${recovered.stderr}`);
  assert.equal(JSON.parse(recovered.stdout).outcome, 'skipped');
  assert.deepEqual(snapshot(destination), before);
  assert.deepEqual(readdirSync(join(cwd, '.claude/skills')), ['inferencex-api']);
});

test('a stale recovery contender cannot claim a newer transaction at the reused canonical path', async () => {
  const cwd = project('recovery generation ABA 中文 path-');
  succeeded(run(['install'], cwd));
  const destination = join(cwd, '.claude/skills/inferencex-api');
  const transaction = `${destination}.inferencex-skills-transaction`;
  const previous = join(transaction, 'previous');
  writeFileSync(join(destination, 'local-notes.txt'), 'keep me');
  const before = snapshot(destination);
  mkdirSync(transaction);
  renameSync(destination, previous);
  cpSync(previous, destination, { recursive: true });
  writeFileSync(join(destination, 'SKILL.md'), 'uncommitted staged destination\n');
  const { path: oldMarker } = writeTransactionMarker(transaction, destination, {
    phase: 'previous_moved',
  });

  const staleReady = join(cwd, 'stale-contender-ready');
  const releaseStale = join(cwd, 'release-stale-contender');
  const stalePreload = join(project('stale contender preload-'), 'preload.mjs');
  writeFileSync(
    stalePreload,
    `
      import fs from 'node:fs';
      import { syncBuiltinESMExports } from 'node:module';
      const original = fs.renameSync;
      let paused = false;
      fs.renameSync = (source, target) => {
        if (!paused && source === ${JSON.stringify(oldMarker)}) {
          paused = true;
          fs.writeFileSync(${JSON.stringify(staleReady)}, 'ready');
          while (!fs.existsSync(${JSON.stringify(releaseStale)})) {
            Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 20);
          }
        }
        return original(source, target);
      };
      syncBuiltinESMExports();
    `,
  );
  const stale = spawnPackedInstaller(
    ['install', '--json'],
    cwd,
    `--import=${JSON.stringify(pathToFileURL(stalePreload).href)}`,
  );
  await waitForFile(staleReady, stale.child);

  const recovered = run(['install', '--json'], cwd);
  assert.equal(recovered.status, 0, `${recovered.stdout}\n${recovered.stderr}`);
  assert.equal(JSON.parse(recovered.stdout).outcome, 'skipped');

  const currentReady = join(cwd, 'current-owner-ready');
  const releaseCurrent = join(cwd, 'release-current-owner');
  const currentPreload = join(project('current owner preload-'), 'preload.mjs');
  writeFileSync(
    currentPreload,
    `
      import fs from 'node:fs';
      import { syncBuiltinESMExports } from 'node:module';
      const original = fs.cpSync;
      let paused = false;
      fs.cpSync = (source, target, options) => {
        const result = original(source, target, options);
        if (!paused && target === ${JSON.stringify(join(transaction, 'stage'))}) {
          paused = true;
          fs.writeFileSync(${JSON.stringify(currentReady)}, 'ready');
          while (!fs.existsSync(${JSON.stringify(releaseCurrent)})) {
            Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 20);
          }
        }
        return result;
      };
      syncBuiltinESMExports();
    `,
  );
  const current = spawnPackedInstaller(
    ['install', '--force', '--json'],
    cwd,
    `--import=${JSON.stringify(pathToFileURL(currentPreload).href)}`,
  );
  await waitForFile(currentReady, current.child);
  writeFileSync(releaseStale, 'continue');
  await new Promise((resolve) => {
    setTimeout(resolve, 500);
  });

  assert.equal(stale.child.exitCode, null, stale.output.stderr);
  const busy = JSON.parse(run(['status', '--json'], cwd).stdout);
  assert.equal(busy.transaction_state, 'busy');
  writeFileSync(releaseCurrent, 'continue');
  const [[staleCode], [currentCode]] = await Promise.all([stale.closed, current.closed]);

  assert.equal(currentCode, 0, `${current.output.stdout}\n${current.output.stderr}`);
  assert.equal(staleCode, 0, `${stale.output.stdout}\n${stale.output.stderr}`);
  assert.equal(JSON.parse(current.output.stdout).outcome, 'overwritten');
  assert.equal(JSON.parse(stale.output.stdout).outcome, 'skipped');
  assert.deepEqual(snapshot(destination), before);
  assert.equal(readFileSync(join(destination, 'local-notes.txt'), 'utf8'), 'keep me');
});

test('a stale none contender can overlap only cleanup after recovery settles the destination', async () => {
  const cwd = project('stale none recovery 中文 path-');
  succeeded(run(['install'], cwd));
  const destination = join(cwd, '.claude/skills/inferencex-api');
  const transaction = `${destination}.inferencex-skills-transaction`;
  writeFileSync(join(destination, 'local-notes.txt'), 'keep me');
  const before = snapshot(destination);

  const contenderReady = join(cwd, 'contender-before-mkdir');
  const releaseContender = join(cwd, 'release-contender');
  const contenderPreload = join(project('stale none contender preload-'), 'preload.mjs');
  writeFileSync(
    contenderPreload,
    `
      import fs from 'node:fs';
      import { syncBuiltinESMExports } from 'node:module';
      const original = fs.mkdirSync;
      let paused = false;
      fs.mkdirSync = (path, options) => {
        if (!paused && path === ${JSON.stringify(transaction)}) {
          paused = true;
          fs.writeFileSync(${JSON.stringify(contenderReady)}, 'ready');
          while (!fs.existsSync(${JSON.stringify(releaseContender)})) {
            Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 20);
          }
        }
        return original(path, options);
      };
      syncBuiltinESMExports();
    `,
  );
  const contender = spawnPackedInstaller(
    ['install', '--force', '--json'],
    cwd,
    `--import=${JSON.stringify(pathToFileURL(contenderPreload).href)}`,
  );
  await waitForFile(contenderReady, contender.child);

  mkdirSync(transaction);
  renameSync(destination, join(transaction, 'previous'));
  cpSync(join(transaction, 'previous'), destination, { recursive: true });
  writeFileSync(join(destination, 'SKILL.md'), 'interrupted candidate bytes\n');
  const { record: deadRecord } = writeTransactionMarker(transaction, destination, {
    phase: 'previous_moved',
  });
  const recovery = `${transaction}.recovering-${deadRecord.transaction_id}`;
  const recoveryReady = join(cwd, 'recovery-entered-cleanup');
  const releaseRecovery = join(cwd, 'release-recovery-cleanup');
  const recoveryPreload = join(project('recovery cleanup boundary preload-'), 'preload.mjs');
  writeFileSync(
    recoveryPreload,
    `
      import fs from 'node:fs';
      import { syncBuiltinESMExports } from 'node:module';
      const original = fs.renameSync;
      let paused = false;
      fs.renameSync = (source, target) => {
        const result = original(source, target);
        if (
          !paused &&
          source === ${JSON.stringify(transaction)} &&
          target === ${JSON.stringify(recovery)}
        ) {
          paused = true;
          fs.writeFileSync(${JSON.stringify(recoveryReady)}, 'ready');
          while (!fs.existsSync(${JSON.stringify(releaseRecovery)})) {
            Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 20);
          }
        }
        return result;
      };
      syncBuiltinESMExports();
    `,
  );
  const recoveryOwner = spawnPackedInstaller(
    ['install', '--json'],
    cwd,
    `--import=${JSON.stringify(pathToFileURL(recoveryPreload).href)}`,
  );
  await waitForFile(recoveryReady, recoveryOwner.child);

  const destinationAtCleanupBoundary = snapshot(destination);
  const backupAtCleanupBoundary = lstatSync(join(recovery, 'previous'), {
    throwIfNoEntry: false,
  });
  writeFileSync(releaseContender, 'continue');
  await new Promise((resolve) => {
    setTimeout(resolve, 100);
  });
  writeFileSync(releaseRecovery, 'continue');
  const [[contenderCode], [recoveryCode]] = await Promise.all([
    contender.closed,
    recoveryOwner.closed,
  ]);

  assert.deepEqual(destinationAtCleanupBoundary, before);
  assert.equal(backupAtCleanupBoundary, undefined);
  assert.equal(contenderCode, 0, `${contender.output.stdout}\n${contender.output.stderr}`);
  assert.equal(JSON.parse(contender.output.stdout).outcome, 'overwritten');
  assert.equal(recoveryCode, 0, `${recoveryOwner.output.stdout}\n${recoveryOwner.output.stderr}`);
  assert.equal(JSON.parse(recoveryOwner.output.stdout).outcome, 'skipped');
  assert.deepEqual(snapshot(destination), before);
  assert.deepEqual(readdirSync(join(cwd, '.claude/skills')), ['inferencex-api']);
});

test('malformed, foreign, and symlink transaction markers fail closed without deletion', () => {
  for (const kind of ['malformed', 'foreign', 'symlink']) {
    const cwd = project(`${kind} transaction-`);
    succeeded(run(['install'], cwd));
    const destination = join(cwd, '.claude/skills/inferencex-api');
    const transaction = `${destination}.inferencex-skills-transaction`;
    const outside = project(`${kind} foreign data-`);
    writeFileSync(join(outside, 'sentinel.txt'), 'never delete me');
    if (kind === 'symlink') {
      symlinkSync(outside, transaction);
    } else {
      mkdirSync(transaction);
      writeTransactionMarker(
        transaction,
        destination,
        kind === 'malformed'
          ? { raw: '{broken json' }
          : { package: 'foreign-package', destination: outside },
      );
    }
    const beforeProject = snapshot(cwd);
    const beforeOutside = snapshot(outside);

    const status = run(['status', '--json'], cwd);
    assert.equal(status.status, 0, status.stderr);
    const record = JSON.parse(status.stdout);
    assert.equal(record.installation_state, 'unknown');
    assert.equal(record.installed_version, null);
    assert.equal(record.transaction_state, 'blocked');

    const failed = run(['install', '--force', '--json'], cwd);
    assert.equal(failed.status, 1, `${failed.stdout}\n${failed.stderr}`);
    assert.equal(JSON.parse(failed.stdout).outcome, 'failed');
    assert.deepEqual(snapshot(cwd), beforeProject);
    assert.deepEqual(snapshot(outside), beforeOutside);
    assert.equal(readFileSync(join(outside, 'sentinel.txt'), 'utf8'), 'never delete me');
  }
});

test('status and dry-run leave a live owner transaction untouched', () => {
  const cwd = project();
  succeeded(run(['install'], cwd));
  const destination = join(cwd, '.claude/skills/inferencex-api');
  const transaction = `${destination}.inferencex-skills-transaction`;
  mkdirSync(transaction);
  cpSync(destination, join(transaction, 'stage'), { recursive: true });
  writeTransactionMarker(transaction, destination, { ownerPid: process.pid });
  const before = snapshot(cwd);

  const status = JSON.parse(run(['status', '--json'], cwd).stdout);
  assert.equal(status.installation_state, 'unknown');
  assert.equal(status.installed_version, null);
  assert.equal(status.transaction_state, 'busy');
  const preview = JSON.parse(run(['install', '--force', '--dry-run', '--json'], cwd).stdout);
  assert.equal(preview.outcome, 'would_wait_for_install');
  assert.equal(preview.transaction_state, 'busy');
  assert.deepEqual(snapshot(cwd), before);
});
