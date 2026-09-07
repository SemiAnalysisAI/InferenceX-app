import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { createReleaseSummary, validateQualification } from '../scripts/release-summary.mjs';

const hash = 'a'.repeat(64);
const release = {
  name: '@semianalysisai/inferencex-skills',
  version: '1.0.0',
  filename: 'semianalysisai-inferencex-skills-1.0.0.tgz',
  sha256: hash,
  integrity: 'sha512-example',
  source_commit: 'b'.repeat(40),
  source_dirty: false,
};
const scope = {
  model: 'DeepSeek-V4-Pro',
  date: null,
  isl: 8192,
  osl: 1024,
  raw_model: null,
  empty_isl: 7,
  empty_osl: 13,
  agentx_model: 'DeepSeek-V4-Pro',
};
const caseIds = [
  'powerx-live',
  'agentx-live',
  'result-live',
  'tco-live',
  'releases-live',
  'collectivex-live',
  'offline-six-family',
];
const matrix = ['linux', 'macos'].flatMap((os) =>
  ['24', '26'].map((node) => ({
    os,
    node,
    arch: os === 'linux' ? 'x64' : 'arm64',
    status: 'passed',
    archive_sha256: hash,
    run_id: '123456789',
    run_attempt: '1',
    head_sha: release.source_commit,
    job_name: `Packed skills (${os === 'linux' ? 'Linux' : 'macOS'}, Node ${node})`,
    evidence_url: 'https://github.com/SemiAnalysisAI/InferenceX-app/actions/runs/123456789',
  })),
);
const native = ['codex', 'claude'].map((runtime) => ({
  runtime,
  status: 'passed',
  archive_sha256: hash,
  case_set_sha256: 'c'.repeat(64),
  prompt_transcript_sha256: 'd'.repeat(64),
  answer_transcript_sha256: 'e'.repeat(64),
  scope: ['powerx', 'agentx', 'result', 'tco', 'releases', 'collectivex', 'offline'],
  cases: caseIds.map((caseId, index) => ({
    case_id: caseId,
    status: 'passed',
    assessor_status: 'passed',
    prompt_transcript_sha256: (index + 1).toString(16).repeat(64),
    answer_transcript_sha256: (index + 8).toString(16).repeat(64),
  })),
}));
const candidate = {
  status: 'passed',
  mode: 'candidate',
  candidate: release,
  new_benchmark_runs: false,
  scope,
  targets: [{ target: 'codex' }, { target: 'claude' }],
  environment: { SECRET: 'must-not-copy' },
  logs: 'must-not-copy',
};
const publicVerification = { ...candidate, mode: 'public' };
const qualification = {
  package_version: release.version,
  archive_sha256: hash,
  tested_source_commit: release.source_commit,
  platform_matrix: matrix,
  native_acceptance: native,
  known_limitations: ['NO_NEW_BENCHMARKS', 'WINDOWS_UNQUALIFIED'],
};
const script = fileURLToPath(new URL('../scripts/release-summary.mjs', import.meta.url));

function execute(publicRecord = publicVerification) {
  const root = mkdtempSync(join(tmpdir(), 'release-summary-'));
  for (const [name, value] of [
    ['release.json', release],
    ['candidate.json', candidate],
    ['public.json', publicRecord],
    ['qualification.json', qualification],
  ]) {
    writeFileSync(join(root, name), JSON.stringify(value));
  }
  const output = join(root, 'summary.json');
  const result = spawnSync(
    process.execPath,
    [
      script,
      join(root, 'release.json'),
      join(root, 'candidate.json'),
      join(root, 'public.json'),
      join(root, 'qualification.json'),
      output,
    ],
    { encoding: 'utf8' },
  );
  return { ...result, root, output, outputFileExists: existsSync(output) };
}

test('summary requires an explicit qualification record', () => {
  assert.throws(() =>
    createReleaseSummary(release, { ...candidate, ...qualification }, publicVerification),
  );
});

test('matching passed identities produce one sanitized durable summary', () => {
  const summary = createReleaseSummary(release, candidate, publicVerification, qualification);
  assert.equal(summary.package_version, '1.0.0');
  assert.equal(summary.archive.sha256, hash);
  assert.equal(summary.platform_matrix.length, 4);
  assert.equal(summary.native_acceptance.length, 2);
  assert.equal(JSON.stringify(summary).includes('SECRET'), false);
  assert.equal(JSON.stringify(summary).includes('must-not-copy'), false);
  assert.deepEqual(summary.known_limitations, [
    {
      code: 'NO_NEW_BENCHMARKS',
      description: 'Release qualification did not launch new benchmark runs.',
    },
    {
      code: 'WINDOWS_UNQUALIFIED',
      description: 'Windows is outside the qualified platform matrix.',
    },
  ]);

  const matchingPassedInputs = execute();
  assert.equal(matchingPassedInputs.status, 0, matchingPassedInputs.stderr);
  assert.equal(JSON.parse(matchingPassedInputs.stdout).package_version, '1.0.0');
  assert.equal(JSON.parse(readFileSync(matchingPassedInputs.output)).package_version, '1.0.0');
});

test('mismatched archive identity and missing verdicts never create an output', () => {
  const mismatchedIdentity = execute({
    ...publicVerification,
    candidate: { ...release, sha256: 'f'.repeat(64) },
  });
  assert.notEqual(mismatchedIdentity.status, 0);
  assert.equal(mismatchedIdentity.outputFileExists, false);
  for (const changed of [
    { ...candidate, status: 'failed' },
    { ...candidate, new_benchmark_runs: true },
  ])
    assert.throws(() => createReleaseSummary(release, changed, publicVerification, qualification));
  for (const changed of [
    { ...qualification, platform_matrix: matrix.slice(1) },
    { ...qualification, native_acceptance: native.slice(1) },
  ])
    assert.throws(() => createReleaseSummary(release, candidate, publicVerification, changed));
});

test('summary output is create-new and platform jobs test the accepted archive', () => {
  const changed = structuredClone(qualification);
  changed.platform_matrix[0].archive_sha256 = 'f'.repeat(64);
  assert.throws(
    () => createReleaseSummary(release, candidate, publicVerification, changed),
    /different archive/u,
  );
  const first = execute();
  const rerun = spawnSync(
    process.execPath,
    [
      script,
      join(first.root, 'release.json'),
      join(first.root, 'candidate.json'),
      join(first.root, 'public.json'),
      join(first.root, 'qualification.json'),
      first.output,
    ],
    { encoding: 'utf8' },
  );
  assert.notEqual(rerun.status, 0);
});

test('qualification is validated before publication and supplied independently of live verification', () => {
  assert.equal(validateQualification(release, qualification).platform_matrix.length, 4);
  const summary = createReleaseSummary(release, candidate, publicVerification, qualification);
  assert.equal(summary.native_acceptance.length, 2);
  assert.equal(summary.tested_source_commit, release.source_commit);
  for (const mutate of [
    (value) => {
      value.archive_sha256 = 'f'.repeat(64);
    },
    (value) => {
      value.package_version = '0.11.0';
    },
    (value) => {
      value.native_acceptance[0].archive_sha256 = 'f'.repeat(64);
    },
    (value) => {
      value.native_acceptance[0].scope[0] = 'offline';
    },
    (value) => {
      value.native_acceptance[1].runtime = 'codex';
    },
    (value) => {
      value.platform_matrix[0] = value.platform_matrix[1];
    },
    (value) => {
      value.platform_matrix[0].arch = '/Users/reviewer/private';
    },
    (value) => {
      value.platform_matrix[0].run_id = 'run-123';
    },
    (value) => {
      value.platform_matrix[0].run_attempt = '0';
    },
    (value) => {
      value.platform_matrix[0].head_sha = 'f'.repeat(40);
    },
    (value) => {
      value.platform_matrix[0].job_name = 'Packed skills';
    },
    (value) => {
      value.platform_matrix[0].evidence_url =
        'https://github.com/attacker/repo/actions/runs/123456789';
    },
    (value) => {
      value.native_acceptance[0].cases[0].case_id = 'made-up-case';
    },
    (value) => {
      value.native_acceptance[0].cases[0].status = 'failed';
    },
    (value) => {
      value.native_acceptance[0].cases[0].assessor_status = 'needs-review';
    },
    (value) => {
      value.native_acceptance[0].cases[0].answer_transcript_sha256 = '/tmp/answer';
    },
    (value) => {
      value.known_limitations = ['/Users/reviewer/secret.txt'];
    },
  ]) {
    const invalid = structuredClone(qualification);
    mutate(invalid);
    assert.throws(() => validateQualification(release, invalid));
  }
  const root = mkdtempSync(join(tmpdir(), 'qualification-'));
  writeFileSync(join(root, 'release.json'), JSON.stringify(release));
  writeFileSync(join(root, 'qualification.json'), JSON.stringify(qualification));
  const result = spawnSync(
    process.execPath,
    [script, 'check-qualification', join(root, 'release.json'), join(root, 'qualification.json')],
    { encoding: 'utf8' },
  );
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).archive_sha256, hash);
});
