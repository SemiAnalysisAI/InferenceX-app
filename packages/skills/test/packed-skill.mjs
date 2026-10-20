import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, dirname, join, resolve } from 'node:path';
import process from 'node:process';
import { gunzipSync } from 'node:zlib';
import { after, before } from 'node:test';

export const packageRoot = resolve(import.meta.dirname, '..');
export const packageInfo = JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf8'));

export function succeeded(result) {
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  return result;
}

// Each suite gets its own archive, temporary projects, npm cache, and cleanup hook.
// Minimal ustar/pax reader for npm pack output, so no tar binary is needed on any OS.
function extractArchive(packageArchive, destination) {
  const data = gunzipSync(readFileSync(packageArchive));
  const field = (header, start, length) =>
    data.toString('utf8', header + start, header + start + length).replace(/\0.*$/su, '');
  let paxPath;
  for (let header = 0; header + 512 <= data.length && data[header] !== 0;) {
    const size = Number.parseInt(field(header, 124, 12).trim() || '0', 8);
    const type = field(header, 156, 1) || '0';
    const body = data.subarray(header + 512, header + 512 + size);
    const prefix = field(header, 345, 155);
    const name = paxPath ?? (prefix ? `${prefix}/` : '') + field(header, 0, 100);
    header += 512 + Math.ceil(size / 512) * 512;
    if (type === 'x') {
      paxPath = /(?:^|\n)\d+ path=(?<path>[^\n]*)\n/u.exec(body.toString('utf8'))?.groups.path;
      continue;
    }
    paxPath = undefined;
    if (type !== '0' && type !== '5') continue;
    const target = resolve(destination, name);
    assert.ok(target.startsWith(destination), `Archive entry escapes destination: ${name}`);
    mkdirSync(type === '5' ? target : dirname(target), { recursive: true });
    if (type === '0') writeFileSync(target, body);
  }
}

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
  // Unpack each archive once and run its declared bins with Node directly.
  // `npm exec --package <tgz>` costs ~350ms per call; the package has no runtime
  // dependencies, so the unpacked tree is what npm would execute. `npmRun` and
  // `npmQuery` keep the real npm resolution path for the bin-wiring tests.
  const unpacked = new Map();
  function packedBin(packageArchive, name) {
    let root = unpacked.get(packageArchive);
    if (root === undefined) {
      const destination = mkdtempSync(join(temporaryRoot, 'unpacked-'));
      extractArchive(packageArchive, destination);
      root = join(destination, 'package');
      // npm marks declared bins executable on extraction; installs copy those modes.
      const { bin: bins = {} } = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
      for (const target of Object.values(bins)) chmodSync(join(root, target), 0o755);
      unpacked.set(packageArchive, root);
    }
    const { bin } = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
    assert.equal(typeof bin?.[name], 'string', `Packed archive does not declare the ${name} bin`);
    return join(root, bin[name]);
  }
  const run = (args, cwd, packageArchive = archive) =>
    command(process.execPath, [packedBin(packageArchive, 'inferencex-skills'), ...args], { cwd });
  const query = (args, cwd, packageArchive = archive) =>
    command(process.execPath, [packedBin(packageArchive, 'inferencex'), ...args], { cwd });
  function npmRun(args, cwd, packageArchive = archive) {
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
  function npmQuery(args, cwd, packageArchive = archive) {
    return command(
      'npm',
      ['exec', '--yes', '--offline', '--package', packageArchive, '--', 'inferencex', ...args],
      { cwd },
    );
  }
  function install(target, cwd = project()) {
    succeeded(run(['install', '--target', target], cwd));
    return join(cwd, target === 'codex' ? '.agents' : '.claude', 'skills/inferencex-api');
  }
  const suite = {
    temporaryRoot,
    environment,
    project,
    node,
    run,
    query,
    npmRun,
    npmQuery,
    install,
  };
  // Downstream setup hooks consume the archive synchronously.
  before(() => {
    succeeded(node([join(packageRoot, 'scripts/update-integrity.mjs'), '--check']));
    const suppliedArchive = process.env.INFERENCEX_SKILLS_ARCHIVE;
    const suppliedHash = process.env.INFERENCEX_SKILLS_ARCHIVE_SHA256;
    assert.equal(
      suppliedArchive === undefined,
      suppliedHash === undefined,
      'Supply both INFERENCEX_SKILLS_ARCHIVE and INFERENCEX_SKILLS_ARCHIVE_SHA256',
    );
    if (suppliedArchive !== undefined) {
      assert.match(suppliedHash, /^[a-f\d]{64}$/u, 'Supplied archive SHA-256 is invalid');
      archive = realpathSync(suppliedArchive);
      assert.equal(
        createHash('sha256').update(readFileSync(archive)).digest('hex'),
        suppliedHash,
        'Supplied archive SHA-256 differs',
      );
      const listing = succeeded(command('tar', ['-tzf', archive])).stdout;
      suite.archive = archive;
      suite.packedFiles = listing
        .trim()
        .split('\n')
        .filter((path) => path.startsWith('package/') && !path.endsWith('/'))
        .map((path) => path.slice('package/'.length));
      return;
    }
    const result = succeeded(
      command('npm', ['pack', '--json', '--pack-destination', temporaryRoot], { cwd: packageRoot }),
    );
    const [packed] = JSON.parse(result.stdout);
    archive = join(temporaryRoot, packed.filename);
    suite.archive = archive;
    suite.packedFiles = packed.files.map((file) => file.path);
  });
  after(() => rmSync(temporaryRoot, { recursive: true, force: true }));
  return suite;
}
