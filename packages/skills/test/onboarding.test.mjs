import assert from 'node:assert/strict';
import { lstatSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { test } from 'node:test';
import { pathToFileURL } from 'node:url';
import { packageInfo, packageRoot, packedSkillSuite, succeeded } from './packed-skill.mjs';

const suite = packedSkillSuite();

function output(result) {
  return JSON.parse(succeeded(result).stdout);
}

function withHome(cwd, args, personalRoot) {
  const preload = join(suite.temporaryRoot, 'personal-root.mjs');
  writeFileSync(
    preload,
    `import os from 'node:os';\nimport { syncBuiltinESMExports } from 'node:module';\nos.homedir = () => ${JSON.stringify(personalRoot)};\nsyncBuiltinESMExports();\n`,
  );
  suite.environment.NODE_OPTIONS = `--import=${JSON.stringify(pathToFileURL(preload).href)}`;
  try {
    return suite.run(args, cwd);
  } finally {
    delete suite.environment.NODE_OPTIONS;
  }
}

test('both hosts install a discoverable inferencex entry forwarding to every existing CLI operation', () => {
  for (const target of ['claude', 'codex']) {
    const cwd = suite.project();
    const installed = output(suite.run(['install', '--target', target, '--json'], cwd));
    assert.equal(installed.entrypoint.installation_state, 'installed');
    assert.equal(installed.entrypoint.installed_version, packageInfo.version);
    const entry = readFileSync(join(installed.entrypoint.skill_path, 'SKILL.md'), 'utf8');
    assert.match(entry, /^---\nname: inferencex\n/);
    assert.doesNotMatch(entry, /disable-model-invocation: true/);
    // Resolve the shipped link, not a parallel command list maintained by this test.
    const guide = /\[the shared workflow guide\]\((?<path>[^)]+)\)/.exec(entry).groups.path;
    const guidePath = resolve(installed.entrypoint.skill_path, guide);
    assert.equal(guidePath, join(installed.skill_path, 'SKILL.md'));
    assert.ok(readFileSync(guidePath).length > 0);
    const cli = join(installed.skill_path, 'scripts/inferencex.mjs');
    const described = output(suite.node([cli, 'describe'], { cwd }));
    assert.equal(described.operations.length, 11);
    for (const command of described.operations) {
      const help = succeeded(suite.node([cli, ...command.route, '--help'], { cwd }));
      assert.match(help.stdout, /inferencex/);
    }
    assert.deepEqual(readdirSync(cwd), [target === 'claude' ? '.claude' : '.agents']);
  }
});

test('personal scope is available from a second project and explicit scope never overrides dir', () => {
  for (const target of ['claude', 'codex', 'agents']) {
    const personalRoot = suite.project('isolated personal skills-');
    const firstProject = suite.project();
    const secondProject = suite.project();
    const args = ['--target', target, '--scope', 'user', '--json'];
    const installed = output(withHome(firstProject, ['install', ...args], personalRoot));
    const directory = target === 'claude' ? '.claude' : '.agents';
    assert.equal(
      installed.entrypoint.skill_path,
      join(personalRoot, directory, 'skills/inferencex'),
    );
    const inspected = output(withHome(secondProject, ['status', ...args], personalRoot));
    assert.equal(inspected.entrypoint.installation_state, 'installed');
    assert.equal(inspected.entrypoint.skill_path, installed.entrypoint.skill_path);
    assert.deepEqual(readdirSync(firstProject), []);
    assert.deepEqual(readdirSync(secondProject), []);
    const projectStatus = output(
      withHome(
        secondProject,
        ['status', '--target', target, '--scope', 'project', '--json'],
        personalRoot,
      ),
    );
    assert.equal(projectStatus.installation_state, 'not_installed');
    assert.equal(projectStatus.entrypoint.installation_state, 'not_installed');
    for (const invalid of [
      ['install', '--scope', 'user', '--dir', 'custom'],
      ['status', '--scope', 'project', '--dir', 'custom'],
      ['install', '--scope', 'global'],
      ['list', '--scope', 'user'],
    ])
      assert.equal(withHome(secondProject, invalid, personalRoot).status, 2);
    assert.deepEqual(readdirSync(secondProject), []);
  }
});

test('entry integrity failures are observable and a missing entry is repaired without touching runtime', () => {
  const cwd = suite.project();
  const installed = output(suite.run(['install', '--json'], cwd));
  const entryPath = join(installed.entrypoint.skill_path, 'SKILL.md');
  writeFileSync(entryPath, 'local edits');
  const inspected = output(suite.run(['status', '--json'], cwd));
  assert.equal(inspected.installation_state, 'installed');
  assert.equal(inspected.entrypoint.installation_state, 'unknown');
  assert.match(inspected.entrypoint.reason, /SKILL.md.*Bytes differ/);
  const skipped = succeeded(suite.run(['install'], cwd));
  assert.match(skipped.stdout, /Setup is incomplete/);
  assert.doesNotMatch(skipped.stdout, /Next: open/);
  assert.equal(readFileSync(entryPath, 'utf8'), 'local edits');
  const repaired = output(suite.run(['install', '--force', '--json'], cwd));
  assert.equal(repaired.entrypoint.installation_state, 'installed');
  rmSync(installed.entrypoint.skill_path, { recursive: true });
  const runtimeEntry = join(installed.skill_path, 'SKILL.md');
  const before = lstatSync(runtimeEntry).mtimeMs;
  assert.equal(
    output(suite.run(['status', '--json'], cwd)).entrypoint.installation_state,
    'not_installed',
  );
  const resumed = output(suite.run(['install', '--json'], cwd));
  assert.equal(resumed.outcome, 'skipped');
  assert.equal(resumed.entrypoint.outcome, 'installed');
  assert.equal(lstatSync(runtimeEntry).mtimeMs, before);
});

test('a conflicting entry cannot masquerade as completed setup or overwrite local files', () => {
  const cwd = suite.project();
  mkdirSync(join(cwd, '.claude/skills/inferencex'), { recursive: true });
  writeFileSync(join(cwd, '.claude/skills/inferencex/SKILL.md'), 'user-owned skill');
  const result = succeeded(suite.run(['install'], cwd));
  assert.match(result.stdout, /Setup is incomplete/);
  const inspected = output(suite.run(['status', '--json'], cwd));
  assert.equal(inspected.installation_state, 'installed');
  assert.equal(inspected.entrypoint.installation_state, 'unknown');
  assert.equal(
    readFileSync(join(cwd, '.claude/skills/inferencex/SKILL.md'), 'utf8'),
    'user-owned skill',
  );
});

test('an interrupted entry transaction is reported and recovered independently of the runtime', () => {
  const cwd = suite.project();
  const preload = join(suite.temporaryRoot, 'interrupt-entry.mjs');
  writeFileSync(
    preload,
    `import fs from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import { basename } from 'node:path';
const original = fs.renameSync;
fs.renameSync = (source, target) => {
  const result = original(source, target);
  if (basename(source) === 'stage' && basename(target) === 'inferencex') process.kill(process.pid, 'SIGKILL');
  return result;
};
syncBuiltinESMExports();
`,
  );
  suite.environment.NODE_OPTIONS = `--import=${JSON.stringify(pathToFileURL(preload).href)}`;
  let interrupted;
  try {
    interrupted = suite.run(['install', '--json'], cwd);
  } finally {
    delete suite.environment.NODE_OPTIONS;
  }
  assert.notEqual(interrupted.status, 0);
  const inspected = output(suite.run(['status', '--json'], cwd));
  assert.equal(inspected.installation_state, 'installed');
  assert.equal(inspected.entrypoint.installation_state, 'unknown');
  assert.equal(inspected.entrypoint.transaction_state, 'recovery_needed');
  const preview = output(suite.run(['install', '--dry-run', '--json'], cwd));
  assert.equal(preview.entrypoint.outcome, 'would_recover_then_install');
  const recovered = output(suite.run(['install', '--json'], cwd));
  assert.equal(recovered.outcome, 'skipped');
  assert.equal(recovered.entrypoint.installation_state, 'installed');
  assert.deepEqual(readdirSync(join(cwd, '.claude/skills')), ['inferencex', 'inferencex-api']);
});

test('an old runtime with a new entry requires an explicit upgrade before declaring readiness', () => {
  const cwd = suite.project();
  const previous = join(packageRoot, 'test/fixtures/semianalysisai-inferencex-skills-0.11.0.tgz');
  succeeded(suite.run(['install'], cwd, previous));
  const result = succeeded(suite.run(['install'], cwd));
  assert.match(result.stdout, /older version/);
  assert.doesNotMatch(result.stdout, /Next: open/);
  const status = output(suite.run(['status', '--json'], cwd));
  assert.equal(status.installed_version, '0.11.0');
  assert.equal(status.entrypoint.installed_version, packageInfo.version);
  assert.equal(status.ready, false);
  const upgraded = output(suite.run(['install', '--force', '--json'], cwd));
  assert.equal(upgraded.ready, true);
  assert.equal(upgraded.installed_version, packageInfo.version);
});
