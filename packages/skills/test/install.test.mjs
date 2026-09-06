import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  chmodSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  readlinkSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { join, resolve } from 'node:path';
import process from 'node:process';
import { test } from 'node:test';

import { packageInfo, packageRoot, packedSkillSuite, succeeded } from './packed-skill.mjs';

const suite = packedSkillSuite();
const { project, run } = suite;
const metadataName = '.inferencex-skills.json';

function setExporterVersion(destination, name, version) {
  const exporter = join(destination, `scripts/export-${name}.mjs`);
  writeFileSync(
    exporter,
    readFileSync(exporter, 'utf8').replace(
      /^const PACKAGE_VERSION = .*;$/mu,
      `const PACKAGE_VERSION = '${version}';`,
    ),
  );
}

function setInstalledVersion(destination, version) {
  writeFileSync(
    join(destination, metadataName),
    JSON.stringify({ package: packageInfo.name, version }),
  );
  setExporterVersion(destination, 'powerx', version);
}

function jsonResult(result, expectedStatus = 0) {
  assert.equal(result.status, expectedStatus, `${result.stdout}\n${result.stderr}`);
  const output = JSON.parse(result.stdout);
  assert.equal(output.schema_version, 1);
  return output;
}

function assertDuplicateVersionsRejected(cwd, exporter, reason) {
  const matching = `const PACKAGE_VERSION = '${packageInfo.version}';`;
  for (const second of [matching, "const PACKAGE_VERSION = '9.9.9';"]) {
    writeFileSync(exporter, `${matching}\n${second}\n`);
    const status = run(['status'], cwd);
    succeeded(status);
    assert.ok(status.stdout.includes(`Installed version: unknown (${reason})\n`));
  }
}

function snapshot(root) {
  return ['', ...readdirSync(root, { recursive: true })].sort().map((path) => {
    const fullPath = join(root, path);
    const info = lstatSync(fullPath);
    return {
      path,
      mode: info.mode,
      mtime: info.mtimeMs,
      ctime: info.ctimeMs,
      contents: info.isFile() ? readFileSync(fullPath).toString('base64') : null,
      link: info.isSymbolicLink() ? readlinkSync(fullPath) : null,
    };
  });
}

test('the real npm archive installs the single skill with all bundled resources', () => {
  const cwd = project();
  const result = run(['install', '--target', 'codex'], cwd);
  succeeded(result);
  assert.ok(result.stdout.includes(`Installed version: ${packageInfo.version}\n`));
  assert.deepEqual(readdirSync(join(cwd, '.agents', 'skills')), ['inferencex-api']);
  assert.ok(suite.packedFiles.includes('package.json'));
  assert.ok(suite.packedFiles.includes('README.md'));
  assert.ok(suite.packedFiles.includes('LICENSE'));
  assert.ok(suite.packedFiles.includes('bin/install.mjs'));
  assert.ok(suite.packedFiles.includes('skills/inferencex-api/SKILL.md'));
  assert.ok(
    suite.packedFiles.every(
      (path) =>
        ['package.json', 'README.md', 'LICENSE', 'bin/install.mjs'].includes(path) ||
        path.startsWith('skills/inferencex-api/'),
    ),
  );
  for (const path of suite.packedFiles.filter((entry) => entry.startsWith('skills/'))) {
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
  assertDuplicateVersionsRejected(cwd, exporter, 'installed exporter version is missing');
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

test('pre-0.4 status requires only PowerX and ignores absent or stale AgentX files', () => {
  const cwd = project();
  succeeded(run(['install'], cwd));
  const destination = join(cwd, '.claude/skills/inferencex-api');
  const agentx = join(destination, 'scripts/export-agentx.mjs');
  setInstalledVersion(destination, '0.3.999+legacy');

  for (const mutate of [
    () => writeFileSync(agentx, `const PACKAGE_VERSION = '9.9.9';\nthrow new Error('stale');\n`),
    () => rmSync(agentx),
  ]) {
    mutate();
    const status = run(['status'], cwd);
    succeeded(status);
    assert.ok(status.stdout.includes('Installed version: 0.3.999+legacy\n'));
  }

  rmSync(join(destination, 'scripts/export-powerx.mjs'));
  const missingPowerX = run(['status'], cwd);
  succeeded(missingPowerX);
  assert.match(
    missingPowerX.stdout,
    /Installed version: unknown \(installed exporter is missing or not a regular file\)/u,
  );
});

test('0.4 prerelease and later receipts require matching AgentX versions', () => {
  for (const version of ['0.4.0-rc.1+build.7', '1.0.0']) {
    const cwd = project();
    succeeded(run(['install'], cwd));
    const destination = join(cwd, '.claude/skills/inferencex-api');
    setInstalledVersion(destination, version);
    const mismatch = run(['status'], cwd);
    succeeded(mismatch);
    assert.match(
      mismatch.stdout,
      /Installed version: unknown \(installation metadata disagrees with the installed AgentX exporter version\)/u,
    );
    setExporterVersion(destination, 'agentx', version);
    if (version === '1.0.0') {
      writeFileSync(
        join(destination, 'scripts/investigate-result.mjs'),
        `const PACKAGE_VERSION = '${version}';\n`,
      );
      writeFileSync(
        join(destination, 'scripts/compare-tco.mjs'),
        `const PACKAGE_VERSION = '${version}';\n`,
      );
    }
    const matching = run(['status'], cwd);
    succeeded(matching);
    assert.ok(matching.stdout.includes(`Installed version: ${version}\n`));
  }
});

test('0.5 status verifies the provenance helper without executing it', () => {
  const cwd = project();
  succeeded(run(['install'], cwd));
  const destination = join(cwd, '.claude/skills/inferencex-api');
  const file = join(destination, 'scripts/investigate-result.mjs');
  writeFileSync(
    file,
    `const PACKAGE_VERSION = '${packageInfo.version}';\nthrow new Error('must not execute');\n`,
  );
  assert.equal(jsonResult(run(['status', '--json'], cwd)).installed_version, packageInfo.version);
  for (const contents of [
    "const PACKAGE_VERSION = '0.4.0';\n",
    '// missing declaration\n',
    `const PACKAGE_VERSION = '${packageInfo.version}';\nconst PACKAGE_VERSION = '${packageInfo.version}';\n`,
  ]) {
    writeFileSync(file, contents);
    assert.equal(jsonResult(run(['status', '--json'], cwd)).installation_state, 'unknown');
  }
  rmSync(file);
  assert.equal(jsonResult(run(['status', '--json'], cwd)).installation_state, 'unknown');
  // Forced downgrades can retain newer files; 0.4 receipts require only PowerX and AgentX.
  setInstalledVersion(destination, '0.4.9');
  setExporterVersion(destination, 'agentx', '0.4.9');
  assert.equal(jsonResult(run(['status', '--json'], cwd)).installed_version, '0.4.9');
});

test('0.6 status requires the TCO helper and ignores it after a forced downgrade', () => {
  const cwd = project();
  succeeded(run(['install'], cwd));
  const destination = join(cwd, '.claude/skills/inferencex-api');
  const tco = join(destination, 'scripts/compare-tco.mjs');
  for (const version of ['0.6.0-rc.1+build.7', '0.5.9']) {
    setInstalledVersion(destination, version);
    setExporterVersion(destination, 'agentx', version);
    writeFileSync(
      join(destination, 'scripts/investigate-result.mjs'),
      `const PACKAGE_VERSION = '${version}';\n`,
    );
    writeFileSync(
      tco,
      `const PACKAGE_VERSION = '${version}';\nthrow new Error('must not execute');\n`,
    );
    assert.equal(jsonResult(run(['status', '--json'], cwd)).installed_version, version);
    for (const contents of [
      "const PACKAGE_VERSION = '0.4.0';\n",
      '// missing declaration\n',
      `const PACKAGE_VERSION = '${version}';\nconst PACKAGE_VERSION = '${version}';\n`,
    ]) {
      writeFileSync(tco, contents);
      const status = jsonResult(run(['status', '--json'], cwd));
      assert.equal(status.installation_state, version.startsWith('0.6.') ? 'unknown' : 'installed');
    }
    rmSync(tco);
    const status = jsonResult(run(['status', '--json'], cwd));
    assert.equal(status.installed_version, version.startsWith('0.6.') ? null : version);
  }
});

test('status reads the required AgentX version without executing it and diagnoses invalid files', () => {
  const cwd = project();
  succeeded(run(['install'], cwd));
  const destination = join(cwd, '.claude/skills/inferencex-api');
  const exporter = join(destination, 'scripts/export-agentx.mjs');
  writeFileSync(
    exporter,
    `const PACKAGE_VERSION = '${packageInfo.version}';\nthrow new Error('Do not execute status input');\n`,
  );
  const readOnly = run(['status'], cwd);
  succeeded(readOnly);
  assert.ok(readOnly.stdout.includes(`Installed version: ${packageInfo.version}\n`));
  assertDuplicateVersionsRejected(cwd, exporter, 'installed AgentX exporter version is missing');

  for (const [name, mutate, reason, repairable] of [
    [
      'missing',
      () => rmSync(exporter),
      'installed AgentX exporter is missing or not a regular file',
      true,
    ],
    [
      'directory',
      () => {
        rmSync(exporter);
        mkdirSync(exporter);
      },
      'installed AgentX exporter is missing or not a regular file',
      false,
    ],
    [
      'symlink',
      () => {
        const neighbor = join(cwd, 'matching-agentx.mjs');
        writeFileSync(neighbor, `const PACKAGE_VERSION = '${packageInfo.version}';\n`);
        rmSync(exporter);
        symlinkSync(neighbor, exporter);
      },
      'installed AgentX exporter is missing or not a regular file',
      false,
    ],
    [
      'missing declaration',
      () => writeFileSync(exporter, '// no identifiable version'),
      'installed AgentX exporter version is missing',
      true,
    ],
    [
      'mismatch',
      () => writeFileSync(exporter, "const PACKAGE_VERSION = '9.9.9';\n"),
      'installation metadata disagrees with the installed AgentX exporter version',
      true,
    ],
  ]) {
    if (name !== 'missing') {
      rmSync(exporter, { recursive: true, force: true });
      writeFileSync(exporter, `const PACKAGE_VERSION = '${packageInfo.version}';\n`);
    }
    mutate();
    const invalid = run(['status'], cwd);
    succeeded(invalid);
    assert.ok(invalid.stdout.includes(`Installed version: unknown (${reason})\n`), name);
    if (repairable) {
      succeeded(run(['install', '--force'], cwd));
      const repaired = run(['status'], cwd);
      succeeded(repaired);
      assert.ok(repaired.stdout.includes(`Installed version: ${packageInfo.version}\n`), name);
    }
  }

  if (process.getuid?.() !== 0) {
    rmSync(exporter, { recursive: true, force: true });
    writeFileSync(exporter, `const PACKAGE_VERSION = '${packageInfo.version}';\n`);
    chmodSync(exporter, 0o000);
    try {
      const unreadable = run(['status'], cwd);
      succeeded(unreadable);
      assert.match(
        unreadable.stdout,
        /Installed version: unknown \(could not read installed AgentX exporter: EACCES\)/u,
      );
    } finally {
      chmodSync(exporter, 0o600);
    }
  }
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

test('force detects file/directory conflicts before invalidating the old version stamp', () => {
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
  assert.equal(
    JSON.parse(readFileSync(join(destination, metadataName))).version,
    packageInfo.version,
  );
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
    ['status', '--dry-run'],
    ['list', '--dry-run'],
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

test('JSON status reports absent and installed versions separately from the installer', () => {
  const cwd = project('JSON 版本 with spaces-');
  const destination = join(cwd, '.agents/skills/inferencex-api');
  const args = ['status', '--target', 'codex', '--json'];
  assert.deepEqual(jsonResult(run(args, cwd)), {
    schema_version: 1,
    package: packageInfo.name,
    installer_version: packageInfo.version,
    skill_path: destination,
    installation_state: 'not_installed',
    installed_version: null,
    reason: null,
  });
  assert.deepEqual(readdirSync(cwd), []);
  succeeded(run(['install', '--target', 'codex'], cwd));
  setInstalledVersion(destination, '0.1.99');
  const before = snapshot(cwd);
  const status = jsonResult(run(args, cwd));
  assert.equal(status.package, packageInfo.name);
  assert.equal(status.installer_version, packageInfo.version);
  assert.equal(status.skill_path, destination);
  assert.equal(status.installation_state, 'installed');
  assert.equal(status.installed_version, '0.1.99');
  assert.equal(status.reason, null);
  assert.deepEqual(snapshot(cwd), before);
});

test('JSON status preserves legacy, invalid receipt, and exporter mismatch as unknown versions', () => {
  const cwd = project();
  succeeded(run(['install'], cwd));
  const destination = join(cwd, '.claude/skills/inferencex-api');
  const receipt = join(destination, metadataName);
  for (const [contents, reason] of [
    [null, 'no installation metadata; legacy or manually copied skill'],
    ['{invalid JSON', 'invalid installation metadata'],
    [
      JSON.stringify({ package: 'other-package', version: '0.1.0' }),
      'invalid installation metadata',
    ],
    [
      JSON.stringify({ package: packageInfo.name, version: '0.1.99' }),
      'installation metadata disagrees with the installed exporter version',
    ],
  ]) {
    if (contents === null) rmSync(receipt);
    else writeFileSync(receipt, contents);
    const before = snapshot(cwd);
    for (const command of ['status', 'install']) {
      const result = jsonResult(run([command, '--json'], cwd));
      assert.equal(result.installation_state, 'unknown');
      assert.equal(result.installed_version, null);
      assert.equal(result.reason, reason);
      if (command === 'install') {
        assert.equal(result.outcome, 'skipped');
        assert.deepEqual(result.write_paths, []);
      }
    }
    assert.deepEqual(snapshot(cwd), before);
  }
});

test('JSON install distinguishes installed, skipped, and overwritten with the actual installed state', () => {
  const cwd = project();
  const installed = jsonResult(run(['install', '--json'], cwd));
  const destination = join(cwd, '.claude/skills/inferencex-api');
  assert.equal(installed.outcome, 'installed');
  assert.equal(installed.dry_run, false);
  assert.equal(installed.installed_version, packageInfo.version);
  assert.equal(installed.installation_state, 'installed');
  assert.equal(installed.skill_path, destination);
  assert.equal(installed.preserves_extra_files, true);
  assert.deepEqual(
    installed.write_paths,
    [
      metadataName,
      ...suite.packedFiles
        .filter((path) => path.startsWith('skills/inferencex-api/'))
        .map((path) => path.slice('skills/inferencex-api/'.length)),
    ].sort(),
  );
  setInstalledVersion(destination, '0.1.99');
  writeFileSync(join(destination, 'obsolete.txt'), 'keep this');
  const before = snapshot(cwd);
  const skipped = jsonResult(run(['install', '--json'], cwd));
  assert.equal(skipped.outcome, 'skipped');
  assert.equal(skipped.installed_version, '0.1.99');
  assert.deepEqual(skipped.write_paths, []);
  assert.deepEqual(snapshot(cwd), before);
  const overwritten = jsonResult(run(['install', '--force', '--json'], cwd));
  assert.equal(overwritten.outcome, 'overwritten');
  assert.equal(overwritten.installed_version, packageInfo.version);
  assert.deepEqual(overwritten.write_paths, installed.write_paths);
  assert.equal(readFileSync(join(destination, 'obsolete.txt'), 'utf8'), 'keep this');
});

test('dry-run uses the same default, target, and custom destination resolution without writes', () => {
  for (const [args, relative] of [
    [[], '.claude/skills'],
    [['--target', 'codex'], '.agents/skills'],
    [['--target', 'agents'], '.agents/skills'],
    [['--target', 'claude'], '.claude/skills'],
    [['--target', 'codex', '--dir', 'custom 技能 with spaces'], 'custom 技能 with spaces'],
    [['--dir', join(project(), 'absolute 技能')], null],
  ]) {
    const cwd = project();
    const root = relative === null ? args[1] : join(cwd, relative);
    const before = snapshot(cwd);
    const preview = jsonResult(run(['install', ...args, '--dry-run', '--json'], cwd));
    assert.equal(preview.outcome, 'would_install');
    assert.equal(preview.dry_run, true);
    assert.equal(preview.installation_state, 'not_installed');
    assert.equal(preview.installed_version, null);
    assert.equal(preview.installer_version, packageInfo.version);
    assert.equal(preview.skill_path, join(root, 'inferencex-api'));
    assert.equal(preview.preserves_extra_files, true);
    assert.deepEqual(snapshot(cwd), before);
    assert.equal(lstatSync(root, { throwIfNoEntry: false }), undefined);
    const installed = jsonResult(run(['install', ...args, '--json'], cwd));
    assert.equal(installed.skill_path, preview.skill_path);
    assert.deepEqual(installed.write_paths, preview.write_paths);
  }
});

test('force previews preserve existing receipts, local edits, obsolete files, and neighboring skills', () => {
  const cwd = project();
  succeeded(run(['install'], cwd));
  const destination = join(cwd, '.claude/skills/inferencex-api');
  setInstalledVersion(destination, '0.1.99');
  writeFileSync(join(destination, 'SKILL.md'), 'local edit');
  writeFileSync(join(destination, 'obsolete.txt'), 'preserved');
  mkdirSync(join(cwd, '.claude/skills/neighbor'));
  writeFileSync(join(cwd, '.claude/skills/neighbor/SKILL.md'), 'neighbor');
  const before = snapshot(cwd);
  for (const force of [[], ['--force']]) {
    const args = ['install', '--dry-run', ...force];
    const text = run(args, cwd);
    succeeded(text);
    assert.match(text.stdout, /Dry run: would (?:skip|overwrite)/);
    assert.match(text.stdout, /Installed version: 0\.1\.99/);
    assert.match(text.stdout, /Unrelated and obsolete files remain untouched/);
    const preview = jsonResult(run([...args, '--json'], cwd));
    assert.equal(preview.installed_version, '0.1.99');
    assert.equal(preview.installation_state, 'installed');
    assert.equal(preview.outcome, force.length > 0 ? 'would_overwrite' : 'would_skip');
    assert.equal(preview.write_paths.length > 0, force.length > 0);
    assert.equal(preview.preserves_extra_files, true);
    assert.deepEqual(snapshot(cwd), before);
  }
});

test('dry-run and install reject matching packaged conflicts and symlinks before changing files', () => {
  for (const [relative, type] of [
    ['scripts', 'file'],
    ['scripts/export-powerx.mjs', 'directory'],
    ['scripts/export-agentx.mjs', 'directory'],
    [metadataName, 'directory'],
    ['SKILL.md', 'symlink'],
    ['scripts', 'symlink'],
    ['scripts/export-agentx.mjs', 'symlink'],
    [metadataName, 'symlink'],
    ['', 'file'],
    ['', 'symlink'],
  ]) {
    const cwd = project();
    succeeded(run(['install'], cwd));
    const destination = join(cwd, '.claude/skills/inferencex-api');
    const conflict = join(destination, relative);
    rmSync(conflict, { recursive: true, force: true });
    if (type === 'file') writeFileSync(conflict, 'local file');
    else if (type === 'directory') mkdirSync(conflict);
    else symlinkSync(project('preserved symlink target-'), conflict);
    const before = snapshot(cwd);
    const errors = [true, false].map((dryRun) => {
      const result = run(['install', '--force', '--json', ...(dryRun ? ['--dry-run'] : [])], cwd);
      const output = jsonResult(result, 1);
      assert.equal(output.outcome, 'failed');
      assert.match(result.stderr, /Could not install the skill/);
      assert.deepEqual(snapshot(cwd), before);
      return output.reason;
    });
    assert.equal(errors[0], errors[1]);
  }
});

test('ancestor file conflicts fail before writes while directory parent symlinks remain supported', () => {
  const cwd = project();
  const conflict = join(cwd, 'not a directory');
  writeFileSync(conflict, 'keep');
  const before = snapshot(cwd);
  for (const dryRun of [true, false]) {
    const result = run(
      [
        'install',
        '--dir',
        join(conflict, 'nested/skills'),
        '--json',
        ...(dryRun ? ['--dry-run'] : []),
      ],
      cwd,
    );
    const error = jsonResult(result, 1);
    assert.equal(error.outcome, 'failed');
    assert.deepEqual(snapshot(cwd), before);
  }
  const actualRoot = project('parent symlink target-');
  const linkedRoot = join(cwd, 'linked skills');
  symlinkSync(actualRoot, linkedRoot);
  const beforeLink = snapshot(cwd);
  const beforeTarget = snapshot(actualRoot);
  const preview = jsonResult(run(['install', '--dir', linkedRoot, '--dry-run', '--json'], cwd));
  assert.equal(preview.outcome, 'would_install');
  assert.equal(preview.skill_path, join(linkedRoot, 'inferencex-api'));
  assert.deepEqual(snapshot(cwd), beforeLink);
  assert.deepEqual(snapshot(actualRoot), beforeTarget);
  const installed = jsonResult(run(['install', '--dir', linkedRoot, '--json'], cwd));
  assert.equal(installed.outcome, 'installed');
  assert.equal(installed.skill_path, preview.skill_path);
  assert.deepEqual(installed.write_paths, preview.write_paths);
  assert.ok(readFileSync(join(actualRoot, 'inferencex-api/SKILL.md')).length);
});

test('JSON usage failures stay one document and preserve exit code 2 without writes', () => {
  for (const args of [
    ['status', '--dry-run', '--json'],
    ['status', '--force', '--json'],
    ['install', '--target', 'invalid', '--json'],
    ['install', '--unknown', '--json'],
    ['install', '--dir', '', '--json'],
    ['install', '--help', '--json'],
    ['help', '--json'],
    ['list', '--json'],
    ['--version', '--json'],
    ['--json'],
  ]) {
    const cwd = project();
    const result = run(args, cwd);
    const error = jsonResult(result, 2);
    assert.deepEqual(Object.keys(error), ['schema_version', 'outcome', 'reason']);
    assert.equal(error.outcome, 'failed');
    assert.equal(typeof error.reason, 'string');
    assert.match(result.stderr, /--help/);
    assert.deepEqual(readdirSync(cwd), []);
  }
});

test('an operational copy failure removes the receipt instead of reporting a successful JSON installation', () => {
  const cwd = project();
  succeeded(run(['install'], cwd));
  const destination = join(cwd, '.claude/skills/inferencex-api');
  const preload = join(project(), 'fail-copy.mjs');
  writeFileSync(
    preload,
    `
    import fs from 'node:fs';
    import { syncBuiltinESMExports } from 'node:module';
    const copy = fs.cpSync;
    fs.cpSync = (source, target, options) => {
      if (target === ${JSON.stringify(destination)}) throw new Error('injected copy failure');
      return copy(source, target, options);
    };
    syncBuiltinESMExports();
  `,
  );
  const priorOptions = suite.environment.NODE_OPTIONS;
  suite.environment.NODE_OPTIONS = `--import=${JSON.stringify(preload)}`;
  try {
    const failed = run(['install', '--force', '--json'], cwd);
    const error = jsonResult(failed, 1);
    assert.equal(error.outcome, 'failed');
    assert.match(failed.stderr, /Could not install the skill: injected copy failure/);
    assert.equal(lstatSync(join(destination, metadataName), { throwIfNoEntry: false }), undefined);
    const status = jsonResult(run(['status', '--json'], cwd));
    assert.equal(status.installation_state, 'unknown');
    assert.equal(status.installed_version, null);
  } finally {
    if (priorOptions === undefined) delete suite.environment.NODE_OPTIONS;
    else suite.environment.NODE_OPTIONS = priorOptions;
  }
});
