import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
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
        if (
          path === ${JSON.stringify(transaction)} &&
          options?.recursive &&
          JSON.parse(fs.readFileSync(${JSON.stringify(join(transaction, 'transaction.json'))})).phase === 'activated'
        ) {
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
  writeFileSync(
    join(transaction, 'transaction.json'),
    JSON.stringify({
      schema_version: 1,
      package: packageInfo.name,
      skill: 'inferencex-api',
      destination,
      owner_pid: 2_147_483_647,
      phase: 'staged',
      had_destination: true,
    }),
  );
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
  writeFileSync(
    join(transaction, 'transaction.json'),
    JSON.stringify({
      schema_version: 1,
      package: packageInfo.name,
      skill: 'inferencex-api',
      destination,
      owner_pid: 2_147_483_647,
      phase: 'staged',
      had_destination: true,
    }),
  );
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
        if (path === ${JSON.stringify(join(transaction, 'transaction.json'))}) {
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
      writeFileSync(
        join(transaction, 'transaction.json'),
        kind === 'malformed'
          ? '{broken json'
          : JSON.stringify({
              schema_version: 1,
              package: 'foreign-package',
              skill: 'inferencex-api',
              destination: outside,
              owner_pid: 2_147_483_647,
              phase: 'staged',
              had_destination: true,
            }),
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
  writeFileSync(
    join(transaction, 'transaction.json'),
    JSON.stringify({
      schema_version: 1,
      package: packageInfo.name,
      skill: 'inferencex-api',
      destination,
      owner_pid: process.pid,
      phase: 'staged',
      had_destination: true,
    }),
  );
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
