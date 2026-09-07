import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  cpSync,
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { test } from 'node:test';
import { pathToFileURL } from 'node:url';
import { PACKAGE, requireUnpublished, verifyArchive, verifyContents } from '../scripts/release.mjs';

const VERSION = '0.4.0';
const ARCHIVE = `semianalysisai-inferencex-skills-${VERSION}.tgz`;
const EXPECTED_FILES = [
  'LICENSE',
  'README.md',
  'bin/install.mjs',
  'package.json',
  'skills/inferencex-api/SKILL.md',
  'skills/inferencex-api/integrity.json',
  'skills/inferencex-api/references/agentx.md',
  'skills/inferencex-api/references/cli-contract.md',
  'skills/inferencex-api/references/cli.md',
  'skills/inferencex-api/references/collectivex.md',
  'skills/inferencex-api/references/offline-exports.md',
  'skills/inferencex-api/references/powerx.md',
  'skills/inferencex-api/references/provenance.md',
  'skills/inferencex-api/references/public-api-examples.md',
  'skills/inferencex-api/references/releases.md',
  'skills/inferencex-api/references/tco.md',
  'skills/inferencex-api/schemas.json',
  'skills/inferencex-api/scripts/cli-contract.mjs',
  'skills/inferencex-api/scripts/commands.mjs',
  'skills/inferencex-api/scripts/compare-collectivex.mjs',
  'skills/inferencex-api/scripts/compare-releases.mjs',
  'skills/inferencex-api/scripts/compare-tco.mjs',
  'skills/inferencex-api/scripts/coverage-policy.mjs',
  'skills/inferencex-api/scripts/discover.mjs',
  'skills/inferencex-api/scripts/doctor.mjs',
  'skills/inferencex-api/scripts/evidence-bundle.mjs',
  'skills/inferencex-api/scripts/export-agentx.mjs',
  'skills/inferencex-api/scripts/export-contract.mjs',
  'skills/inferencex-api/scripts/export-powerx.mjs',
  'skills/inferencex-api/scripts/http-client.mjs',
  'skills/inferencex-api/scripts/inferencex.mjs',
  'skills/inferencex-api/scripts/install-transaction.mjs',
  'skills/inferencex-api/scripts/investigate-result.mjs',
  'skills/inferencex-api/scripts/local-files.mjs',
  'skills/inferencex-api/scripts/response-budget.mjs',
  'skills/inferencex-api/scripts/verify-bundle.mjs',
];

test('read-only release verification rejects altered evidence and unsafe retries', () => {
  const result = spawnSync('python3', ['-B', 'test/verify-release.test.py'], {
    cwd: resolve(import.meta.dirname, '..'),
    encoding: 'utf8',
    timeout: 10_000,
  });
  assert.ifError(result.error);
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
});

test('release refuses mismatched or existing versions and registry failures', async () => {
  const manifest = { name: PACKAGE, version: VERSION };
  let requests = 0;
  const request = () => {
    requests++;
    return Promise.resolve(new Response(null, { status: 404 }));
  };
  await assert.rejects(requireUnpublished('0.1.0', manifest, request), /differs/);
  await assert.rejects(requireUnpublished('latest', manifest, request), /exact stable version/);
  assert.equal(requests, 0, 'Invalid versions must fail before network access');
  await requireUnpublished(VERSION, manifest, request);
  for (const [status, message] of [
    [200, /already published/],
    [429, /Cannot establish/],
    [503, /Cannot establish/],
  ]) {
    await assert.rejects(
      requireUnpublished(VERSION, manifest, () => Promise.resolve(new Response(null, { status }))),
      message,
    );
  }
});

test('release rejects changed bytes and a different reviewed archive', () => {
  const bytes = Buffer.from('exact reviewed archive');
  const record = {
    name: PACKAGE,
    version: VERSION,
    filename: ARCHIVE,
    files: EXPECTED_FILES,
    source_commit: 'a'.repeat(40),
    source_dirty: false,
    prepared_at: '2026-09-05T00:00:00.000Z',
    sha256: createHash('sha256').update(bytes).digest('hex'),
    integrity: `sha512-${createHash('sha512').update(bytes).digest('base64')}`,
  };
  verifyArchive(record, bytes, record.sha256);
  assert.throws(() => verifyArchive(record, Buffer.from('changed')), /SHA-256 differs/);
  assert.throws(() => verifyArchive(record, bytes, '0'.repeat(64)), /reviewed candidate/);
  assert.throws(() => verifyArchive({ ...record, version: '0.4.0-rc.1' }, bytes), /stable version/);
  assert.throws(() => verifyArchive({ ...record, version: '0.4.1' }, bytes), /filename/);
  assert.throws(() => verifyArchive({ ...record, filename: '../package.tgz' }, bytes), /filename/);
  assert.throws(
    () => verifyArchive({ ...record, files: EXPECTED_FILES.slice(1) }, bytes),
    /differs/,
  );
  assert.throws(() => verifyArchive({ ...record, integrity: 'sha512-other' }, bytes), /integrity/);
});

test('release content boundary is the exact independent file contract', () => {
  verifyContents(EXPECTED_FILES.toReversed());
  for (const missing of EXPECTED_FILES) {
    assert.throws(
      () => verifyContents(EXPECTED_FILES.filter((path) => path !== missing)),
      /differs/,
    );
  }
  for (const path of [
    'credentials.json',
    'skills/inferencex-api/DRAFT.md',
    'skills/inferencex-api/SKILL.md.bak',
    '.scratch/acceptance.json',
    'scripts/release.mjs',
    'test/release.test.mjs',
  ]) {
    assert.throws(() => verifyContents([...EXPECTED_FILES, path]), /differs/);
  }
  assert.throws(() => verifyContents([...EXPECTED_FILES, EXPECTED_FILES[0]]), /duplicates/);
});

test('release manifest provenance is clean, canonical and timezone-qualified', () => {
  const bytes = Buffer.from('exact reviewed archive');
  const record = {
    name: PACKAGE,
    version: VERSION,
    filename: ARCHIVE,
    files: EXPECTED_FILES,
    source_commit: 'a'.repeat(40),
    source_dirty: false,
    prepared_at: '2026-09-05T00:00:00.000Z',
    sha256: createHash('sha256').update(bytes).digest('hex'),
    integrity: `sha512-${createHash('sha512').update(bytes).digest('base64')}`,
  };
  verifyArchive(record, bytes);
  verifyArchive({ ...record, source_commit: 'b'.repeat(64) }, bytes);
  verifyArchive({ ...record, prepared_at: '2024-02-29T23:59:59.999Z' }, bytes);
  for (const source_dirty of [true, null, undefined]) {
    assert.throws(() => verifyArchive({ ...record, source_dirty }, bytes), /source must be clean/);
  }
  for (const source_commit of ['A'.repeat(40), 'a'.repeat(39), 'a'.repeat(65), 'g'.repeat(40)]) {
    assert.throws(() => verifyArchive({ ...record, source_commit }, bytes), /Git object ID/);
  }
  for (const prepared_at of [
    null,
    '2026-09-05Z',
    '2026-09-05 00:00:00Z',
    '2026-09-05T00:00:00Z',
    '2026-09-05T00:00:00.000+00:00',
    '2026-09-05T00:00:00',
    '2025-02-29T00:00:00.000Z',
    '2026-01-01T24:00:00.000Z',
    'not-a-dateZ',
    '2026-09-05T00:00:00+99:99',
  ]) {
    assert.throws(() => verifyArchive({ ...record, prepared_at }, bytes), /Preparation time/);
  }
});

test('integrity check is read-only and prepare rejects a clean stale manifest before network or output', (context) => {
  const temporary = mkdtempSync(join(realpathSync(tmpdir()), 'inferencex-integrity-test-'));
  context.after(() => rmSync(temporary, { recursive: true, force: true }));
  const source = resolve(import.meta.dirname, '..');
  const packageRoot = join(temporary, 'skills');
  cpSync(source, packageRoot, { recursive: true });
  const packagePath = join(packageRoot, 'package.json');
  const manifest = JSON.parse(readFileSync(packagePath, 'utf8'));
  writeFileSync(packagePath, `${JSON.stringify({ ...manifest, version: VERSION }, null, 2)}\n`);
  const updater = join(packageRoot, 'scripts/update-integrity.mjs');
  execFileSync(process.execPath, [updater]);
  const integrityPath = join(packageRoot, 'skills/inferencex-api/integrity.json');
  const exactIntegrity = readFileSync(integrityPath, 'utf8');

  const clean = spawnSync(process.execPath, [updater, '--check'], { encoding: 'utf8' });
  assert.equal(clean.status, 0, clean.stderr);
  assert.equal(readFileSync(integrityPath, 'utf8'), exactIntegrity);

  const managed = join(packageRoot, 'skills/inferencex-api/references/powerx.md');
  writeFileSync(managed, `${readFileSync(managed, 'utf8')}\nstale fixture\n`);
  const stale = spawnSync(process.execPath, [updater, '--check'], { encoding: 'utf8' });
  assert.notEqual(stale.status, 0, stale.stdout);
  assert.match(stale.stderr, /integrity manifest is stale/);
  assert.equal(readFileSync(integrityPath, 'utf8'), exactIntegrity, 'check must not repair');

  execFileSync('git', ['init', '--quiet'], { cwd: packageRoot });
  execFileSync('git', ['config', 'user.email', 'release-test@example.com'], { cwd: packageRoot });
  execFileSync('git', ['config', 'user.name', 'Release Test'], { cwd: packageRoot });
  execFileSync('git', ['add', '.'], { cwd: packageRoot });
  execFileSync(
    'git',
    [
      '-c',
      'commit.gpgSign=false',
      'commit',
      '--quiet',
      '-m',
      'test: prepare release fixture',
      '-m',
      '中文：准备发布测试夹具',
    ],
    {
      cwd: packageRoot,
    },
  );
  const fetchCalls = join(temporary, 'fetch-calls.txt');
  const preload = join(temporary, 'registry-404.mjs');
  writeFileSync(
    preload,
    `import { appendFileSync } from 'node:fs';
globalThis.fetch = async () => {
  appendFileSync(${JSON.stringify(fetchCalls)}, 'fetch\\n');
  return new Response(null, { status: 404 });
};
`,
  );
  const output = join(temporary, 'candidate');
  const prepared = spawnSync(
    process.execPath,
    [
      '--import',
      pathToFileURL(preload).href,
      join(packageRoot, 'scripts/release.mjs'),
      'prepare',
      VERSION,
      output,
    ],
    { encoding: 'utf8' },
  );
  assert.notEqual(prepared.status, 0, prepared.stdout);
  assert.match(prepared.stderr, /integrity manifest is stale/);
  assert.equal(existsSync(fetchCalls), false, 'stale integrity must fail before registry access');
  assert.equal(existsSync(output), false, 'stale integrity must fail before candidate output');
});

test('prepare rejects dirty or changing package source and packs one clean candidate', (context) => {
  const temporary = mkdtempSync(join(realpathSync(tmpdir()), 'inferencex-release-test-'));
  context.after(() => rmSync(temporary, { recursive: true, force: true }));
  const source = resolve(import.meta.dirname, '..');
  const packageRoot = join(temporary, 'skills');
  cpSync(source, packageRoot, { recursive: true });
  const packagePath = join(packageRoot, 'package.json');
  const manifest = JSON.parse(readFileSync(packagePath, 'utf8'));
  writeFileSync(packagePath, `${JSON.stringify({ ...manifest, version: VERSION }, null, 2)}\n`);
  execFileSync(process.execPath, [join(packageRoot, 'scripts/update-integrity.mjs')]);
  execFileSync('git', ['init', '--quiet'], { cwd: packageRoot });
  execFileSync('git', ['config', 'user.email', 'release-test@example.com'], { cwd: packageRoot });
  execFileSync('git', ['config', 'user.name', 'Release Test'], { cwd: packageRoot });
  execFileSync('git', ['add', '.'], { cwd: packageRoot });
  execFileSync(
    'git',
    [
      '-c',
      'commit.gpgSign=false',
      'commit',
      '--quiet',
      '-m',
      'test: prepare release fixture',
      '-m',
      '中文：准备发布测试夹具',
    ],
    {
      cwd: packageRoot,
    },
  );
  const sourceCommit = execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: packageRoot,
    encoding: 'utf8',
  }).trim();
  const fetchCalls = join(temporary, 'fetch-calls.txt');
  const preload = join(temporary, 'registry-404.mjs');
  writeFileSync(
    preload,
    `import { appendFileSync } from 'node:fs';
globalThis.fetch = async () => {
  appendFileSync(${JSON.stringify(fetchCalls)}, 'fetch\\n');
  return new Response(null, { status: 404 });
};
`,
  );
  const command = [
    '--import',
    pathToFileURL(preload).href,
    join(packageRoot, 'scripts/release.mjs'),
    'prepare',
    VERSION,
  ];

  writeFileSync(
    join(packageRoot, 'README.md'),
    `${readFileSync(join(packageRoot, 'README.md'))}\ndirty\n`,
  );
  const dirtyOutput = join(temporary, 'dirty-candidate');
  const dirty = spawnSync(process.execPath, [...command, dirtyOutput], { encoding: 'utf8' });
  assert.notEqual(dirty.status, 0, `${dirty.stdout}\n${dirty.stderr}`);
  assert.match(dirty.stderr, /source must be clean/);
  assert.equal(existsSync(dirtyOutput), false);
  assert.equal(existsSync(fetchCalls), false);

  execFileSync('git', ['checkout', '--quiet', '--', 'README.md'], { cwd: packageRoot });
  const output = join(temporary, 'candidate');
  const clean = spawnSync(process.execPath, [...command, output], { encoding: 'utf8' });
  assert.equal(clean.status, 0, clean.stderr);
  assert.equal(readFileSync(fetchCalls, 'utf8'), 'fetch\n');
  const record = JSON.parse(readFileSync(join(output, 'release.json'), 'utf8'));
  assert.equal(record.source_commit, sourceCommit);
  assert.equal(record.source_dirty, false);
  assert.deepEqual([...record.files].sort(), [...EXPECTED_FILES].sort());
  verifyArchive(record, readFileSync(join(output, record.filename)));

  const wrapperDirectory = join(temporary, 'bin');
  mkdirSync(wrapperDirectory);
  const npmWrapper = join(wrapperDirectory, 'npm');
  writeFileSync(
    npmWrapper,
    `#!/usr/bin/env node
import { appendFileSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
const packed = spawnSync(process.env.REAL_NPM, process.argv.slice(2), { encoding: 'utf8' });
process.stdout.write(packed.stdout ?? '');
process.stderr.write(packed.stderr ?? '');
if (packed.error) throw packed.error;
if (packed.status !== 0) process.exit(packed.status ?? 1);
if (process.env.PACK_MUTATION === 'dirty') {
  appendFileSync(process.env.SOURCE_ROOT + '/README.md', '\\npack mutation\\n');
} else {
  execFileSync('git', ['-c', 'commit.gpgSign=false', 'commit', '--allow-empty', '--quiet', '-m', 'test: record package mutation', '-m', '中文：记录打包期间的提交变化'], {
    cwd: process.env.SOURCE_ROOT,
    stdio: 'inherit',
  });
}
`,
    { mode: 0o755 },
  );
  const realNpm = execFileSync('which', ['npm'], { encoding: 'utf8' }).trim();
  for (const mutation of ['dirty', 'head']) {
    const mutationOutput = join(temporary, `${mutation}-during-pack`);
    const mutated = spawnSync(process.execPath, [...command, mutationOutput], {
      encoding: 'utf8',
      env: {
        ...process.env,
        PATH: `${wrapperDirectory}:${process.env.PATH}`,
        REAL_NPM: realNpm,
        SOURCE_ROOT: packageRoot,
        PACK_MUTATION: mutation,
      },
    });
    assert.notEqual(mutated.status, 0, `${mutated.stdout}\n${mutated.stderr}`);
    assert.match(mutated.stderr, mutation === 'dirty' ? /source changed/ : /commit changed/);
    assert.equal(existsSync(join(mutationOutput, 'release.json')), false);
    if (mutation === 'dirty') {
      execFileSync('git', ['checkout', '--quiet', '--', 'README.md'], { cwd: packageRoot });
    }
  }
});

test('check validates version and archive filename before reading archive bytes', (context) => {
  const temporary = mkdtempSync(join(realpathSync(tmpdir()), 'inferencex-release-check-'));
  context.after(() => rmSync(temporary, { recursive: true, force: true }));
  const manifest = join(temporary, 'release.json');
  for (const [version, filename, message] of [
    [VERSION, 'prompt.txt', /filename/],
    [VERSION, '../outside.tgz', /filename/],
    ['0.4.0-rc.1', 'missing.tgz', /stable version/],
  ]) {
    writeFileSync(manifest, JSON.stringify({ name: PACKAGE, version, filename }));
    const checked = spawnSync(
      process.execPath,
      [resolve(import.meta.dirname, '../scripts/release.mjs'), 'check', manifest],
      { encoding: 'utf8' },
    );
    assert.notEqual(checked.status, 0);
    assert.match(checked.stderr, message);
    assert.doesNotMatch(checked.stderr, /ENOENT/);
  }
});

test('public verification decodes gzip HTTP JSON but preserves raw npm tarball bytes', () => {
  const result = spawnSync(
    'python3',
    [
      '-c',
      String.raw`
import gzip, hashlib, importlib.util, io, json, tempfile
from pathlib import Path
from types import SimpleNamespace
from unittest import TestCase
from unittest.mock import patch
assertions = TestCase()
spec = importlib.util.spec_from_file_location('release_check', 'scripts/verify-release.py')
check = importlib.util.module_from_spec(spec)
spec.loader.exec_module(check)
class Response(io.BytesIO):
    status = 200
    def __init__(self, body, headers, url):
        super().__init__(body)
        self.headers, self.url = headers, url
payload = b'{"rows":[{"avg_power_w":0}]}'
compressed = gzip.compress(payload)
with tempfile.TemporaryDirectory() as directory:
    root = Path(directory)
    for name, wire, headers, expected in [
        ('compressed.json', compressed, {'Content-Encoding':'gzip','Content-Type':'application/json'}, payload),
        ('plain.json', payload, {'Content-Encoding':'identity','Content-Type':'application/json'}, payload),
        ('package.tgz', compressed, {'Content-Type':'application/gzip'}, compressed),
    ]:
        url = 'https://registry.npmjs.org/' + name
        report = {'requests':[]}
        opener = SimpleNamespace(open=lambda *a, **kw: Response(wire, headers, url))
        with patch.object(check, 'build_opener', return_value=opener):
            assert check.fetch_public(url, root / name, report) == expected
        assert (root / name).read_bytes() == expected
        record = report['requests'][0]
        assert record['content_encoding'] == headers.get('Content-Encoding','identity')
        assert record['wire_sha256'] == hashlib.sha256(wire).hexdigest()
        assert record['sha256'] == hashlib.sha256(expected).hexdigest()
        if headers.get('Content-Encoding') == 'gzip':
            assert Path(record['wire_response_file']).read_bytes() == compressed
            assert json.loads((root / name).read_bytes()) == {'rows':[{'avg_power_w':0}]}
    for encoding, wire in [('br', b'unsupported wire bytes'), ('gzip', b'broken gzip')]:
        url = 'https://registry.npmjs.org/bad-' + encoding
        report = {'requests':[]}
        opener = SimpleNamespace(open=lambda *a, **kw: Response(wire, {'Content-Encoding':encoding}, url))
        with patch.object(check, 'build_opener', return_value=opener):
            with assertions.assertRaises((ValueError, gzip.BadGzipFile), msg='Unsupported or malformed encoding must fail'):
                check.fetch_public(url, root / ('bad-' + encoding), report)
        assert Path(report['requests'][0]['wire_response_file']).read_bytes() == wire
        assert 'response_file' not in report['requests'][0]
`,
    ],
    { cwd: resolve(import.meta.dirname, '..'), encoding: 'utf8', timeout: 10_000 },
  );
  assert.ifError(result.error);
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
});
