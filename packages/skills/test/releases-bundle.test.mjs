import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { lstatSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { before, test } from 'node:test';
import { pathToFileURL } from 'node:url';

import { normalizeArgs } from '../skills/inferencex-api/scripts/compare-releases.mjs';
import { packedSkillSuite, succeeded } from './packed-skill.mjs';
import { RELEASE_ARGS, RELEASE_BUNDLE_VARIANTS } from './releases-bundle-fixtures.mjs';

const suite = packedSkillSuite();
let installed;
let fixturePreload;
let offlinePreload;

function files(root, directory = root) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? [path, ...files(root, path)] : [path];
  });
}

function fingerprint(directory) {
  return files(directory)
    .map((path) => {
      const entry = lstatSync(path);
      const bytes = entry.isFile() ? readFileSync(path) : Buffer.alloc(0);
      return {
        path: relative(directory, path),
        size: entry.size,
        sha256: createHash('sha256').update(bytes).digest('hex'),
      };
    })
    .toSorted((left, right) => left.path.localeCompare(right.path));
}

function command(preload, args, cwd, env = {}) {
  return suite.node(
    ['--import', pathToFileURL(preload).href, join(installed, 'scripts/inferencex.mjs'), ...args],
    { cwd, env: { ...suite.environment, ...env } },
  );
}

function create(variant) {
  const selected = RELEASE_BUNDLE_VARIANTS[variant];
  const cwd = suite.project('release bundle-');
  const fixture = join(cwd, 'fixture.json');
  const directory = join(cwd, 'evidence');
  writeFileSync(fixture, JSON.stringify(selected.rows));
  const result = command(
    fixturePreload,
    ['releases', 'compare', ...RELEASE_ARGS, '--output-dir', directory],
    cwd,
    { INFERENCEX_RELEASE_FIXTURE: fixture },
  );
  succeeded(result);
  const manifest = JSON.parse(readFileSync(join(directory, 'manifest.json'), 'utf8'));
  const output = JSON.parse(readFileSync(join(directory, manifest.result.path), 'utf8'));
  return { directory, manifest, output, expected: selected.expected };
}

function verify(directory, args = []) {
  return command(offlinePreload, ['verify', directory, ...args], suite.project('verify release-'));
}

before(() => {
  installed = suite.install('codex');
  fixturePreload = join(suite.temporaryRoot, 'release-bundle-response.mjs');
  offlinePreload = join(suite.temporaryRoot, 'release-bundle-offline.mjs');
  writeFileSync(
    fixturePreload,
    `
import { readFileSync } from 'node:fs';
const rows = readFileSync(process.env.INFERENCEX_RELEASE_FIXTURE, 'utf8');
globalThis.fetch = async () => new Response(rows, { headers: { 'content-type': 'application/json' } });
`,
  );
  writeFileSync(
    offlinePreload,
    `globalThis.fetch = () => { throw new Error('release verification attempted network access'); };\n`,
  );
});

test('release options normalize to one closed replayable object', () => {
  const canonical = normalizeArgs(RELEASE_ARGS);
  assert.deepEqual(normalizeArgs(canonical), canonical);
  assert.throws(
    () => normalizeArgs({ ...canonical, unrecorded_selector: 'silent-scope-change' }),
    (error) => error.code === 'INVALID_ARGUMENT',
  );
});

test('release comparison bundle reconstructs offline without mutating evidence', () => {
  const saved = create('comparable');
  assert.equal(saved.output.metadata.causal_attribution, 'not_established');
  assert.equal(saved.output.metadata.statistical_verdict, 'not_established');
  assert.equal(saved.output.comparisons.length, saved.expected.comparisons);
  assert.equal(saved.manifest.coverage.comparable_pairs, saved.expected.comparable_pairs);
  assert.equal(saved.output.selection.before.rows[0].date, '2026-09-01');
  assert.equal(saved.output.selection.before.rows[0].curve_date, '2026-09-02');
  assert.equal(saved.output.comparisons[0].recipe_fingerprint_match, null);
  assert.ok(saved.output.comparisons[0].confounders.includes('recipe_fingerprint_unavailable'));
  assert.equal(saved.output.evidence, undefined);
  assert.equal(saved.output.sources[0].response_id, saved.manifest.requests[0].response.id);
  const beforeVerify = fingerprint(saved.directory);
  succeeded(verify(saved.directory));
  assert.deepEqual(fingerprint(saved.directory), beforeVerify);
});

test('valid evidence can have zero comparable pairs until policy requests one', () => {
  const saved = create('no-comparable-pairs');
  assert.equal(verify(saved.directory).status, 0);
  const gated = verify(saved.directory, ['--min-comparable-pairs', '1']);
  assert.equal(gated.status, 3);
  const decision = JSON.parse(gated.stdout);
  assert.equal(decision.validity, 'valid');
  assert.equal(decision.coverage.comparable_pairs, 0);
});

test('ambiguous identities stay unmatched and never satisfy pair policy', () => {
  const saved = create('ambiguous');
  assert.equal(saved.output.comparisons.length, 0);
  assert.equal(
    saved.output.unmatched.before.length + saved.output.unmatched.after.length,
    saved.expected.unmatched,
  );
  assert.equal(saved.manifest.coverage.comparable_pairs, 0);
  assert.ok(
    saved.output.unmatched.before.every(({ reason }) => reason === 'ambiguous_configuration'),
  );
});

test('rehashing a stronger causal claim cannot bypass offline reconstruction', () => {
  for (const field of ['causal_attribution', 'statistical_verdict']) {
    const saved = create('comparable');
    const resultPath = join(saved.directory, saved.manifest.result.path);
    const result = JSON.parse(readFileSync(resultPath, 'utf8'));
    result.metadata[field] = 'established';
    const bytes = Buffer.from(`${JSON.stringify(result, null, 2)}\n`);
    writeFileSync(resultPath, bytes);
    saved.manifest.result.sha256 = createHash('sha256').update(bytes).digest('hex');
    saved.manifest.result.size = bytes.length;
    writeFileSync(join(saved.directory, 'manifest.json'), `${JSON.stringify(saved.manifest)}\n`);
    const checked = verify(saved.directory);
    assert.equal(checked.status, 1);
    assert.equal(checked.stdout, '');
    assert.equal(JSON.parse(checked.stderr).error.code, 'INVALID_RESPONSE');
  }
});
