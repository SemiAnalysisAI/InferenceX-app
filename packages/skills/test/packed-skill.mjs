import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, dirname, join, resolve } from 'node:path';
import process from 'node:process';
import { after, before } from 'node:test';

export const packageRoot = resolve(import.meta.dirname, '..');
export const packageInfo = JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf8'));

export function succeeded(result) {
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  return result;
}

// Each suite gets its own archive, temporary projects, npm cache, and cleanup hook.
export function packedSkillSuite() {
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
  function command(executable, args, options) {
    const result = spawnSync(executable, args, {
      env: environment,
      encoding: 'utf8',
      timeout: 60_000,
      ...options,
    });
    assert.ifError(result.error);
    return result;
  }
  const project = (prefix = 'project with spaces-') => mkdtempSync(join(temporaryRoot, prefix));
  const node = (args, options) => command(process.execPath, args, { timeout: 10_000, ...options });
  function run(args, cwd, packageArchive = archive) {
    return command(
      'npm',
      [
        'exec',
        '--yes',
        '--offline',
        '--package',
        packageArchive,
        '--',
        'inferencex-skills',
        ...args,
      ],
      { cwd },
    );
  }
  function install(target, cwd = project()) {
    succeeded(run(['install', '--target', target], cwd));
    return join(cwd, target === 'codex' ? '.agents' : '.claude', 'skills/inferencex-api');
  }
  const suite = { temporaryRoot, environment, project, node, run, install };
  before(() => {
    const result = succeeded(
      command('npm', ['pack', '--json', '--pack-destination', temporaryRoot], { cwd: packageRoot }),
    );
    const [packed] = JSON.parse(result.stdout);
    archive = join(temporaryRoot, packed.filename);
    suite.packedFiles = packed.files.map((file) => file.path);
  });
  after(() => rmSync(temporaryRoot, { recursive: true, force: true }));
  return suite;
}
