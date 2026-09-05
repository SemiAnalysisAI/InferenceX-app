#!/usr/bin/env node

// Maintainer-only: package preparation and verification; publication lives in the workflow.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

export const PACKAGE = '@semianalysisai/inferencex-skills';
export const REGISTRY = 'https://registry.npmjs.org';
const packageRoot = resolve(import.meta.dirname, '..');
const digest = (bytes, algorithm = 'sha256', encoding = 'hex') =>
  createHash(algorithm).update(bytes).digest(encoding);

export async function requireUnpublished(version, manifest, request = fetch) {
  assert.match(
    version,
    /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/u,
    'Use an exact stable version',
  );
  assert.equal(manifest.name, PACKAGE, 'Unexpected package name');
  assert.equal(version, manifest.version, 'Requested version differs from package.json');
  const response = await request(`${REGISTRY}/${encodeURIComponent(PACKAGE)}/${version}`, {
    signal: AbortSignal.timeout(30_000),
  });
  assert.equal(
    response.status,
    404,
    response.ok
      ? `${PACKAGE}@${version} is already published; never republish it`
      : `Cannot establish whether version exists: registry returned HTTP ${response.status}`,
  );
}

export function verifyArchive(record, bytes, reviewedSha256) {
  assert.equal(record.name, PACKAGE, 'Unexpected package name');
  assert.equal(record.filename, basename(record.filename), 'Archive must be beside its manifest');
  assert.equal(digest(bytes), record.sha256, 'Archive SHA-256 differs from release manifest');
  assert.equal(
    `sha512-${digest(bytes, 'sha512', 'base64')}`,
    record.integrity,
    'Archive integrity mismatch',
  );
  if (reviewedSha256 !== undefined) {
    assert.match(reviewedSha256, /^[a-f0-9]{64}$/u, 'Supply the reviewed archive SHA-256');
    assert.equal(record.sha256, reviewedSha256, 'Archive differs from the reviewed candidate');
  }
}

export function verifyContents(files) {
  const required = [
    'package.json',
    'README.md',
    'LICENSE',
    'bin/install.mjs',
    'skills/inferencex-api/SKILL.md',
  ];
  for (const path of required) assert.ok(files.includes(path), `Archive is missing ${path}`);
  for (const path of files) {
    assert.ok(
      !path.split('/').some((part) => part.startsWith('.')),
      `Unexpected hidden file: ${path}`,
    );
    assert.ok(
      required.includes(path) || path.startsWith('skills/inferencex-api/'),
      `Maintainer files must not enter the public archive: ${path}`,
    );
  }
}

function main(args) {
  const [command, value, output, reviewedSha256] = args;
  if (command === 'check' && args.length >= 2 && args.length <= 3) {
    const record = JSON.parse(readFileSync(value, 'utf8'));
    verifyArchive(record, readFileSync(join(dirname(value), record.filename)), output);
    console.log(`Verified ${record.name}@${record.version}: ${record.sha256}`);
    return;
  }
  if (command !== 'prepare' || args.length < 3 || args.length > 4) {
    throw new Error(
      'Usage: release.mjs prepare <version> <new-output-directory> [reviewed-sha256]\n' +
        '       release.mjs check <release.json> [reviewed-sha256]',
    );
  }
  return prepare(value, output, reviewedSha256);
}

async function prepare(version, output, reviewedSha256) {
  const manifest = JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf8'));
  await requireUnpublished(version, manifest);
  const destination = resolve(output);
  // A new directory preserves earlier attempts, including failures.
  mkdirSync(destination);
  const packed = JSON.parse(
    execFileSync('npm', ['pack', '--json', '--ignore-scripts', '--pack-destination', destination], {
      cwd: packageRoot,
      encoding: 'utf8',
    }),
  );
  assert.equal(packed.length, 1, 'Expected exactly one archive');
  const [archive] = packed;
  assert.equal(archive.name, PACKAGE);
  assert.equal(archive.version, version);
  verifyContents(archive.files.map((file) => file.path));
  const bytes = readFileSync(join(destination, archive.filename));
  const record = {
    name: PACKAGE,
    version,
    filename: archive.filename,
    sha256: digest(bytes),
    integrity: archive.integrity,
    files: archive.files.map((file) => file.path),
    source_commit: execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: packageRoot,
      encoding: 'utf8',
    }).trim(),
    source_dirty:
      execFileSync('git', ['status', '--porcelain', '--', '.'], {
        cwd: packageRoot,
        encoding: 'utf8',
      }).trim().length > 0,
    prepared_at: new Date().toISOString(),
  };
  verifyArchive(record, bytes, reviewedSha256);
  writeFileSync(join(destination, 'release.json'), `${JSON.stringify(record, null, 2)}\n`);
  console.log(JSON.stringify(record, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  Promise.resolve()
    .then(() => main(process.argv.slice(2)))
    .catch((error) => {
      console.error(error.message);
      process.exitCode = 1;
    });
}
