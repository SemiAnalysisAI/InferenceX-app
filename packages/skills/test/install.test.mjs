import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  chmodSync,
  lstatSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  readlinkSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, dirname, join, resolve } from 'node:path';
import process from 'node:process';
import { after, before, test } from 'node:test';

const packageRoot = resolve(import.meta.dirname, '..');
const packageInfo = JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf8'));
const metadataName = '.inferencex-skills.json';
const temporaryRoot = realpathSync(mkdtempSync(join(tmpdir(), 'inferencex-skills-test-')));
const environment = {
  ...process.env,
  PATH: `${dirname(process.execPath)}${delimiter}${process.env.PATH}`,
  npm_config_cache: join(temporaryRoot, 'npm-cache'),
  npm_config_update_notifier: 'false',
  npm_config_audit: 'false',
  npm_config_fund: 'false',
};
let archive;
let packedFiles;

function npm(args, cwd) {
  const result = spawnSync('npm', args, {
    cwd,
    env: environment,
    encoding: 'utf8',
    timeout: 60_000,
  });
  assert.ifError(result.error);
  return result;
}

function project() {
  return mkdtempSync(join(temporaryRoot, 'project with spaces-'));
}

function run(args, cwd, packageArchive = archive) {
  return npm(
    ['exec', '--yes', '--offline', '--package', packageArchive, '--', 'inferencex-skills', ...args],
    cwd,
  );
}

function setInstalledVersion(destination, version) {
  writeFileSync(
    join(destination, metadataName),
    JSON.stringify({ package: packageInfo.name, version }),
  );
  const exporter = join(destination, 'scripts/export-powerx.mjs');
  writeFileSync(
    exporter,
    readFileSync(exporter, 'utf8').replace(
      /^const PACKAGE_VERSION = .*;$/mu,
      `const PACKAGE_VERSION = '${version}';`,
    ),
  );
}

function succeeded(result) {
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
}

before(() => {
  const result = npm(['pack', '--json', '--pack-destination', temporaryRoot], packageRoot);
  succeeded(result);
  const [packed] = JSON.parse(result.stdout);
  archive = join(temporaryRoot, packed.filename);
  packedFiles = packed.files.map((file) => file.path);
});

after(() => {
  rmSync(temporaryRoot, { recursive: true, force: true });
});

test('the real npm archive installs the single skill with all bundled resources', () => {
  const cwd = project();
  const result = run(['install', '--target', 'codex'], cwd);
  succeeded(result);
  assert.ok(result.stdout.includes(`Installed version: ${packageInfo.version}\n`));
  assert.deepEqual(readdirSync(join(cwd, '.agents', 'skills')), ['inferencex-api']);
  assert.ok(packedFiles.includes('package.json'));
  assert.ok(packedFiles.includes('README.md'));
  assert.ok(packedFiles.includes('LICENSE'));
  assert.ok(packedFiles.includes('bin/install.mjs'));
  assert.ok(packedFiles.includes('skills/inferencex-api/SKILL.md'));
  assert.ok(
    packedFiles.every(
      (path) =>
        ['package.json', 'README.md', 'LICENSE', 'bin/install.mjs'].includes(path) ||
        path.startsWith('skills/inferencex-api/'),
    ),
  );
  for (const path of packedFiles.filter((entry) => entry.startsWith('skills/'))) {
    assert.deepEqual(
      readFileSync(join(cwd, '.agents', path)),
      readFileSync(join(packageRoot, path)),
    );
  }
  const installed = readFileSync(join(cwd, '.agents/skills/inferencex-api/SKILL.md'), 'utf8');
  for (const match of installed.matchAll(/\]\((?!https?:|#)(?<target>[^)]+)\)/g)) {
    const target = match.groups.target.split('#')[0];
    assert.ok(readFileSync(resolve(cwd, '.agents/skills/inferencex-api', target)).length > 0);
  }
});

test('default, Claude, generic agents, and explicit destinations work outside the repo', () => {
  for (const [args, location] of [
    [[], '.claude/skills'],
    [['--target', 'claude'], '.claude/skills'],
    [['--target', 'agents'], '.agents/skills'],
    [['--target', 'claude', '--dir', 'custom skills'], 'custom skills'],
  ]) {
    const cwd = project();
    succeeded(run(['install', ...args], cwd));
    assert.deepEqual(readdirSync(join(cwd, location)), ['inferencex-api']);
    const status = run(['status', ...args], cwd);
    succeeded(status);
    assert.ok(status.stdout.includes(`Installed version: ${packageInfo.version}\n`));
    assert.ok(status.stdout.includes(`Skill path: ${join(cwd, location, 'inferencex-api')}\n`));
  }
  const cwd = project();
  const destination = join(project(), 'absolute skills');
  succeeded(run(['install', '--dir', destination], cwd));
  assert.deepEqual(readdirSync(cwd), []);
  assert.deepEqual(readdirSync(destination), ['inferencex-api']);
  const status = run(['status', '--dir', destination], cwd);
  succeeded(status);
  assert.ok(status.stdout.includes(`Skill path: ${join(destination, 'inferencex-api')}\n`));
  assert.deepEqual(readdirSync(cwd), []);
});

test('repeat installation skips changes; explicit force merges and preserves neighboring skills', () => {
  const cwd = project();
  succeeded(run(['install'], cwd));
  const skillsRoot = join(cwd, '.claude/skills');
  const entry = join(skillsRoot, 'inferencex-api/SKILL.md');
  const original = readFileSync(entry);
  const metadataPath = join(skillsRoot, 'inferencex-api', metadataName);
  setInstalledVersion(join(skillsRoot, 'inferencex-api'), '0.1.99');
  writeFileSync(entry, 'my local edits');
  writeFileSync(join(skillsRoot, 'inferencex-api/obsolete.txt'), 'keep this');
  mkdirSync(join(skillsRoot, 'other-skill'));
  writeFileSync(join(skillsRoot, 'other-skill/SKILL.md'), 'neighbor');
  const skipped = run(['install'], cwd);
  succeeded(skipped);
  assert.match(skipped.stdout, /Skipped/);
  assert.ok(skipped.stdout.includes(`Installer version: ${packageInfo.version}\n`));
  assert.match(skipped.stdout, /Installed version: 0\.1\.99/);
  assert.equal(readFileSync(entry, 'utf8'), 'my local edits');
  assert.equal(JSON.parse(readFileSync(metadataPath, 'utf8')).version, '0.1.99');
  const upgraded = run(['install', '--force'], cwd);
  succeeded(upgraded);
  assert.ok(upgraded.stdout.includes(`Installed version: ${packageInfo.version}\n`));
  assert.equal(JSON.parse(readFileSync(metadataPath, 'utf8')).version, packageInfo.version);
  assert.deepEqual(readFileSync(entry), original);
  assert.equal(readFileSync(join(skillsRoot, 'inferencex-api/obsolete.txt'), 'utf8'), 'keep this');
  assert.equal(readFileSync(join(skillsRoot, 'other-skill/SKILL.md'), 'utf8'), 'neighbor');
});

test('offline status distinguishes the installer and installed version without changing local files', () => {
  const cwd = project();
  succeeded(run(['install', '--target', 'codex'], cwd));
  const destination = join(cwd, '.agents/skills/inferencex-api');
  const metadataPath = join(destination, metadataName);
  setInstalledVersion(destination, '0.1.99');
  const entry = join(destination, 'SKILL.md');
  writeFileSync(entry, 'local edits remain untouched');
  const priorModificationTimes = [metadataPath, entry, destination].map(
    (path) => lstatSync(path).mtimeMs,
  );
  const files = readdirSync(destination, { recursive: true });
  const result = run(['status', '--target', 'codex'], cwd);
  succeeded(result);
  assert.equal(
    result.stdout,
    `Installer version: ${packageInfo.version}\nInstalled version: 0.1.99\nSkill path: ${destination}\n`,
  );
  assert.equal(JSON.parse(readFileSync(metadataPath, 'utf8')).version, '0.1.99');
  assert.equal(readFileSync(entry, 'utf8'), 'local edits remain untouched');
  assert.deepEqual(
    [metadataPath, entry, destination].map((path) => lstatSync(path).mtimeMs),
    priorModificationTimes,
  );
  assert.deepEqual(readdirSync(destination, { recursive: true }), files);
});

test('a real 0.1.0 forced downgrade cannot retain the newer installed version', () => {
  const legacyArchive = join(
    packageRoot,
    'test/fixtures/semianalysisai-inferencex-skills-0.1.0.tgz',
  );
  assert.equal(
    createHash('sha256').update(readFileSync(legacyArchive)).digest('hex'),
    '83d5b12ce4de5f34200242acb527dc475102060a5e4056746b7a7548f4b8525e',
  );
  const cwd = project();
  succeeded(run(['install'], cwd));
  const destination = join(cwd, '.claude/skills/inferencex-api');
  const metadataPath = join(destination, metadataName);
  succeeded(run(['install', '--force'], cwd, legacyArchive));
  assert.equal(JSON.parse(readFileSync(metadataPath, 'utf8')).version, packageInfo.version);
  assert.match(
    readFileSync(join(destination, 'scripts/export-powerx.mjs'), 'utf8'),
    /const PACKAGE_VERSION = '0\.1\.0';/u,
  );
  for (const args of [['status'], ['install']]) {
    const result = run(args, cwd);
    succeeded(result);
    assert.match(
      result.stdout,
      /Installed version: unknown \(installation metadata disagrees with the installed exporter version\)/u,
    );
  }
  const repaired = run(['install', '--force'], cwd);
  succeeded(repaired);
  assert.ok(repaired.stdout.includes(`Installed version: ${packageInfo.version}\n`));
});

test('status reads exporter versions without executing code and reports missing or unreadable versions', () => {
  const cwd = project();
  succeeded(run(['install'], cwd));
  const exporter = join(cwd, '.claude/skills/inferencex-api/scripts/export-powerx.mjs');
  writeFileSync(
    exporter,
    `const PACKAGE_VERSION = '${packageInfo.version}';\nthrow new Error('Do not execute status input');\n`,
  );
  const readOnly = run(['status'], cwd);
  succeeded(readOnly);
  assert.ok(readOnly.stdout.includes(`Installed version: ${packageInfo.version}\n`));
  writeFileSync(exporter, '// no identifiable version');
  const missingVersion = run(['status'], cwd);
  succeeded(missingVersion);
  assert.match(
    missingVersion.stdout,
    /Installed version: unknown \(installed exporter version is missing\)/u,
  );
  if (process.getuid?.() !== 0) {
    chmodSync(exporter, 0o000);
    try {
      const unreadable = run(['status'], cwd);
      succeeded(unreadable);
      assert.match(
        unreadable.stdout,
        /Installed version: unknown \(could not read installed exporter: EACCES\)/u,
      );
    } finally {
      chmodSync(exporter, 0o600);
    }
  }
  rmSync(exporter);
  const absent = run(['status'], cwd);
  succeeded(absent);
  assert.match(
    absent.stdout,
    /Installed version: unknown \(installed exporter is missing or not a regular file\)/u,
  );
});

test('status distinguishes absent, legacy, malformed, and unreadable installation metadata', () => {
  const cwd = project();
  const absent = run(['status'], cwd);
  succeeded(absent);
  assert.match(absent.stdout, /Installed version: not installed/);
  assert.deepEqual(readdirSync(cwd), []);

  const destination = join(cwd, '.claude/skills/inferencex-api');
  const metadataPath = join(destination, metadataName);
  mkdirSync(destination, { recursive: true });
  writeFileSync(join(destination, 'SKILL.md'), 'legacy 0.1.0 copy without a version stamp');
  const legacy = run(['status'], cwd);
  succeeded(legacy);
  assert.match(legacy.stdout, /Installed version: unknown \(no installation metadata/);
  assert.equal(lstatSync(metadataPath, { throwIfNoEntry: false }), undefined);
  for (const metadata of [
    '{invalid json',
    'null',
    JSON.stringify({ package: 'other-package', version: '0.1.0' }),
    JSON.stringify({ package: packageInfo.name, version: 'latest' }),
    JSON.stringify({ package: packageInfo.name, version: 123 }),
  ]) {
    writeFileSync(metadataPath, metadata);
    const invalid = run(['status'], cwd);
    succeeded(invalid);
    assert.match(invalid.stdout, /Installed version: unknown \(invalid installation metadata\)/);
    assert.equal(readFileSync(metadataPath, 'utf8'), metadata);
  }
  rmSync(metadataPath);
  mkdirSync(metadataPath);
  const directory = run(['status'], cwd);
  succeeded(directory);
  assert.match(
    directory.stdout,
    /Installed version: unknown \(installation metadata is not a regular file\)/,
  );
  rmSync(metadataPath, { recursive: true });

  if (process.getuid?.() !== 0) {
    writeFileSync(metadataPath, JSON.stringify({ package: packageInfo.name, version: '0.1.99' }));
    chmodSync(metadataPath, 0o000);
    try {
      const unreadable = run(['status'], cwd);
      succeeded(unreadable);
      assert.match(
        unreadable.stdout,
        /Installed version: unknown \(could not read installation metadata: EACCES\)/,
      );
      assert.equal(lstatSync(metadataPath).mode & 0o777, 0);
    } finally {
      chmodSync(metadataPath, 0o600);
    }
  }
});

test('metadata symlinks are not followed by status or overwritten by force', () => {
  const cwd = project();
  succeeded(run(['install'], cwd));
  const metadataPath = join(cwd, '.claude/skills/inferencex-api', metadataName);
  const neighbor = join(cwd, 'neighbor.json');
  const content = JSON.stringify({ package: packageInfo.name, version: '9.9.9' });
  writeFileSync(neighbor, content);
  rmSync(metadataPath);
  symlinkSync(neighbor, metadataPath);
  const status = run(['status'], cwd);
  succeeded(status);
  assert.match(
    status.stdout,
    /Installed version: unknown \(installation metadata is not a regular file\)/,
  );
  const forced = run(['install', '--force'], cwd);
  assert.equal(forced.status, 1);
  assert.match(forced.stderr, /symbolic link/);
  assert.equal(readlinkSync(metadataPath), neighbor);
  assert.equal(readFileSync(neighbor, 'utf8'), content);
});

test('a failed force copy invalidates the old version stamp', () => {
  const cwd = project();
  succeeded(run(['install'], cwd));
  const destination = join(cwd, '.claude/skills/inferencex-api');
  const exporterPath = join(destination, 'scripts/export-powerx.mjs');
  rmSync(exporterPath);
  mkdirSync(exporterPath);
  writeFileSync(join(exporterPath, 'local-file.txt'), 'preserve');
  const forced = run(['install', '--force'], cwd);
  assert.equal(forced.status, 1);
  assert.match(forced.stderr, /Could not install the skill/);
  assert.equal(lstatSync(join(destination, metadataName), { throwIfNoEntry: false }), undefined);
  assert.equal(readFileSync(join(exporterPath, 'local-file.txt'), 'utf8'), 'preserve');
  const status = run(['status'], cwd);
  succeeded(status);
  assert.match(status.stdout, /Installed version: unknown/);
});

test('force refuses packaged destination symlinks and preserves their neighboring targets', () => {
  const cwd = project();
  succeeded(run(['install'], cwd));
  const skillsRoot = join(cwd, '.claude/skills');
  const entry = join(skillsRoot, 'inferencex-api/SKILL.md');
  mkdirSync(join(skillsRoot, 'other-skill'));
  const neighbor = join(skillsRoot, 'other-skill/SKILL.md');
  writeFileSync(neighbor, 'neighbor');
  rmSync(entry);
  symlinkSync(neighbor, entry);
  const result = run(['install', '--force'], cwd);
  assert.ok(
    readFileSync(neighbor, 'utf8') === 'neighbor',
    'force changed a neighboring skill through a symlink',
  );
  assert.equal(result.status, 1);
  assert.match(result.stderr, /symbolic link/i);
  assert.equal(readlinkSync(entry), neighbor);
});

test('help and list use the packed executable without writing into the project', () => {
  for (const args of [[], ['help'], ['--help'], ['-h'], ['install', '--help'], ['list']]) {
    const cwd = project();
    const result = run(args, cwd);
    succeeded(result);
    assert.match(result.stdout, /inferencex-api/);
    assert.deepEqual(readdirSync(cwd), []);
  }
});

test('--version reports only the invoking installer and does not inspect or create an installation', () => {
  const cwd = project();
  const result = run(['--version'], cwd);
  succeeded(result);
  assert.equal(result.stdout, `Installer version: ${packageInfo.version}\n`);
  assert.deepEqual(readdirSync(cwd), []);
});

test('invalid commands and options fail without creating destination files', () => {
  for (const args of [
    ['unknown'],
    ['install', 'extra'],
    ['install', '--unknown'],
    ['install', '-x'],
    ['install', '--target'],
    ['install', '--dir'],
    ['install', '--dir', ''],
    ['install', '--target', 'unknown'],
    ['install', '--target', 'toString'],
    ['install', '--target', 'unknown', '--dir', 'destination'],
    ['install', '--dir', '--force'],
    ['list', '--force'],
    ['status', '--force'],
    ['status', '--target', 'unknown'],
    ['status', '--dir', ''],
    ['install', '--version'],
    ['--version', '--target', 'codex'],
    ['--target', 'codex'],
  ]) {
    const cwd = project();
    const result = run(args, cwd);
    assert.equal(result.status, 2, `${args}: ${result.stdout}\n${result.stderr}`);
    assert.match(result.stderr, /help/);
    assert.deepEqual(readdirSync(cwd), []);
  }
});

test('filesystem errors return a clear failure and preserve existing files', () => {
  const cwd = project();
  const destination = join(cwd, 'file instead of directory');
  writeFileSync(destination, 'untouched');
  const result = run(['install', '--dir', destination], cwd);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Could not install the skill/);
  assert.equal(readFileSync(destination, 'utf8'), 'untouched');
  assert.deepEqual(readdirSync(cwd), ['file instead of directory']);
});
