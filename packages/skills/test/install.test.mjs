import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  readlinkSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, dirname, join, resolve } from 'node:path';
import process from 'node:process';
import { after, before, test } from 'node:test';

const packageRoot = resolve(import.meta.dirname, '..');
const temporaryRoot = mkdtempSync(join(tmpdir(), 'inferencex-skills-test-'));
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

function run(args, cwd) {
  return npm(
    ['exec', '--yes', '--offline', '--package', archive, '--', 'inferencex-skills', ...args],
    cwd,
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
  }
  const cwd = project();
  const destination = join(project(), 'absolute skills');
  succeeded(run(['install', '--dir', destination], cwd));
  assert.deepEqual(readdirSync(cwd), []);
  assert.deepEqual(readdirSync(destination), ['inferencex-api']);
});

test('repeat installation skips changes; explicit force merges and preserves neighboring skills', () => {
  const cwd = project();
  succeeded(run(['install'], cwd));
  const skillsRoot = join(cwd, '.claude/skills');
  const entry = join(skillsRoot, 'inferencex-api/SKILL.md');
  const original = readFileSync(entry);
  writeFileSync(entry, 'my local edits');
  writeFileSync(join(skillsRoot, 'inferencex-api/obsolete.txt'), 'keep this');
  mkdirSync(join(skillsRoot, 'other-skill'));
  writeFileSync(join(skillsRoot, 'other-skill/SKILL.md'), 'neighbor');
  const skipped = run(['install'], cwd);
  succeeded(skipped);
  assert.match(skipped.stdout, /Skipped/);
  assert.equal(readFileSync(entry, 'utf8'), 'my local edits');
  succeeded(run(['install', '--force'], cwd));
  assert.deepEqual(readFileSync(entry), original);
  assert.equal(readFileSync(join(skillsRoot, 'inferencex-api/obsolete.txt'), 'utf8'), 'keep this');
  assert.equal(readFileSync(join(skillsRoot, 'other-skill/SKILL.md'), 'utf8'), 'neighbor');
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
