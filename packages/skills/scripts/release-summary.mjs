#!/usr/bin/env node

import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';

const PACKAGE = '@semianalysisai/inferencex-skills';
const HASH = /^[a-f\d]{64}$/u;
const COMMIT = /^(?:[a-f\d]{40}|[a-f\d]{64})$/u;
const POSITIVE_INTEGER = /^[1-9]\d*$/u;
const VERSION = /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/u;
const ARCHITECTURES = new Set(['arm64', 'x64']);
const CASES = JSON.parse(
  readFileSync(new URL('../maintainer/natural-language-cases.json', import.meta.url), 'utf8'),
).cases;
const CASE_IDS = CASES.map((entry) => entry.id);
const SCOPE_IDS = [...new Set(CASES.map((entry) => entry.family))].toSorted();
const LIMITATIONS = Object.freeze({
  NO_NEW_BENCHMARKS: 'Release qualification did not launch new benchmark runs.',
  WINDOWS_UNQUALIFIED: 'Windows is outside the qualified platform matrix.',
  SAVED_CONSISTENCY_ONLY:
    'Offline verification establishes saved-bundle consistency within captured evidence.',
  OBSERVATIONAL_COMPARISONS:
    'Comparison outputs describe observed differences without causal attribution.',
  EXPLICIT_PRICE_ASSUMPTIONS:
    'TCO outputs use explicit user-supplied price assumptions rather than market prices.',
  BOUNDED_PUBLIC_SCOPE:
    'Public API qualification covers the recorded bounded scopes and retained responses.',
});
const SCOPE_KEYS = [
  'model',
  'date',
  'isl',
  'osl',
  'raw_model',
  'empty_isl',
  'empty_osl',
  'agentx_model',
];
const text = (value) => typeof value === 'string' && value.trim().length > 0;

function identity(record) {
  return {
    package: record.name,
    package_version: record.version,
    archive_sha256: record.sha256,
    archive_integrity: record.integrity,
    source_commit: record.source_commit,
  };
}

function validateVerdict(record, mode, releaseIdentity) {
  assert.equal(record.status, 'passed', `${mode} verification did not pass`);
  assert.equal(record.mode, mode, `Expected ${mode} verification`);
  assert.deepEqual(identity(record.candidate), releaseIdentity, `${mode} archive identity differs`);
  assert.equal(record.new_benchmark_runs, false, `${mode} verification launched a benchmark`);
  assert.ok(record.scope && typeof record.scope === 'object', `${mode} scope is missing`);
  assert.ok(
    Array.isArray(record.targets) && record.targets.length > 0,
    `${mode} targets are missing`,
  );
}

function validateRelease(release) {
  assert.equal(release.name, PACKAGE, 'Unexpected release package');
  assert.match(release.version, VERSION, 'Release version must be exact and stable');
  assert.match(release.sha256, HASH, 'Release archive SHA-256 is invalid');
  assert.match(release.source_commit, COMMIT, 'Release source commit is invalid');
  assert.equal(release.source_dirty, false, 'Release source was dirty');
  assert.ok(text(release.integrity), 'Release archive integrity is missing');
  assert.equal(
    release.filename,
    `semianalysisai-inferencex-skills-${release.version}.tgz`,
    'Release archive filename differs',
  );
}

export function validateQualification(release, qualification) {
  validateRelease(release);
  assert.equal(qualification.package_version, release.version, 'Qualification version differs');
  assert.equal(qualification.archive_sha256, release.sha256, 'Qualification archive differs');
  assert.match(
    qualification.tested_source_commit,
    COMMIT,
    'Qualification source commit is invalid',
  );
  const matrix = qualification.platform_matrix;
  assert.ok(
    Array.isArray(matrix) && matrix.length === 4,
    'Actual four-job platform matrix is required',
  );
  const required = new Set(['linux/node-24', 'linux/node-26', 'macos/node-24', 'macos/node-26']);
  const platforms = matrix.map((entry) => {
    assert.equal(entry.status, 'passed', 'A platform qualification did not pass');
    assert.ok(['linux', 'macos'].includes(entry.os), 'Unsupported platform matrix OS');
    assert.ok(['24', '26'].includes(String(entry.node)), 'Unsupported platform Node version');
    assert.ok(ARCHITECTURES.has(entry.arch), 'Unsupported platform architecture');
    assert.match(entry.archive_sha256, HASH, 'Platform archive identity is missing');
    assert.equal(entry.archive_sha256, release.sha256, 'Platform tested a different archive');
    assert.match(entry.run_id, POSITIVE_INTEGER, 'Platform workflow run ID is invalid');
    assert.match(entry.run_attempt, POSITIVE_INTEGER, 'Platform workflow attempt is invalid');
    assert.match(entry.head_sha, COMMIT, 'Platform workflow head SHA is invalid');
    assert.equal(
      entry.head_sha,
      qualification.tested_source_commit,
      'Platform workflow tested a different source commit',
    );
    const expectedName = `Packed skills (${entry.os === 'linux' ? 'Linux' : 'macOS'}, Node ${entry.node})`;
    assert.equal(entry.job_name, expectedName, 'Platform workflow job name differs');
    assert.equal(
      entry.evidence_url,
      `https://github.com/SemiAnalysisAI/InferenceX-app/actions/runs/${entry.run_id}`,
      'Platform evidence URL is invalid',
    );
    required.delete(`${entry.os}/node-${entry.node}`);
    return {
      os: entry.os,
      arch: entry.arch,
      node: String(entry.node),
      status: 'passed',
      archive_sha256: entry.archive_sha256,
      run_id: entry.run_id,
      run_attempt: entry.run_attempt,
      head_sha: entry.head_sha,
      job_name: entry.job_name,
      evidence_url: entry.evidence_url,
    };
  });
  assert.equal(required.size, 0, 'Platform matrix is incomplete or duplicated');
  for (const key of ['run_id', 'run_attempt', 'head_sha', 'evidence_url'])
    assert.equal(
      new Set(platforms.map((entry) => entry[key])).size,
      1,
      `Platform matrix ${key} differs between jobs`,
    );

  const native = qualification.native_acceptance;
  assert.ok(
    Array.isArray(native) && native.length === 2,
    'Codex and Claude acceptance are required',
  );
  const runtimes = new Set();
  const nativeAcceptance = native.map((entry) => {
    assert.ok(['codex', 'claude'].includes(entry.runtime), 'Unknown native runtime');
    assert.equal(entry.status, 'passed', 'Native acceptance did not pass');
    assert.equal(entry.archive_sha256, release.sha256, 'Native runtime tested a different archive');
    for (const key of ['case_set_sha256', 'prompt_transcript_sha256', 'answer_transcript_sha256']) {
      assert.match(entry[key], HASH, `Native acceptance ${key} is invalid`);
    }
    assert.ok(
      Array.isArray(entry.scope) && entry.scope.length === SCOPE_IDS.length,
      'Native acceptance scope is incomplete',
    );
    assert.deepEqual(
      [...entry.scope].sort(),
      SCOPE_IDS,
      'Native acceptance scope is incomplete or duplicated',
    );
    assert.ok(
      Array.isArray(entry.cases) && entry.cases.length === CASE_IDS.length,
      'Native acceptance cases are incomplete',
    );
    const cases = entry.cases.map((item) => {
      assert.ok(CASE_IDS.includes(item.case_id), 'Unknown native acceptance case');
      assert.equal(item.status, 'passed', 'A native acceptance case did not pass');
      assert.equal(
        item.assessor_status,
        'passed',
        'A native acceptance case assessor did not pass',
      );
      assert.match(
        item.prompt_transcript_sha256,
        HASH,
        'Native case prompt transcript identity is invalid',
      );
      assert.match(
        item.answer_transcript_sha256,
        HASH,
        'Native case answer transcript identity is invalid',
      );
      return {
        case_id: item.case_id,
        status: 'passed',
        assessor_status: 'passed',
        prompt_transcript_sha256: item.prompt_transcript_sha256,
        answer_transcript_sha256: item.answer_transcript_sha256,
      };
    });
    assert.deepEqual(
      cases.map((item) => item.case_id).toSorted(),
      CASE_IDS.toSorted(),
      'Native acceptance cases are incomplete or duplicated',
    );
    runtimes.add(entry.runtime);
    return {
      runtime: entry.runtime,
      archive_sha256: entry.archive_sha256,
      status: 'passed',
      case_set_sha256: entry.case_set_sha256,
      prompt_transcript_sha256: entry.prompt_transcript_sha256,
      answer_transcript_sha256: entry.answer_transcript_sha256,
      scope: [...entry.scope],
      cases,
    };
  });
  assert.deepEqual([...runtimes].toSorted(), ['claude', 'codex']);
  assert.equal(
    new Set(nativeAcceptance.map((entry) => entry.case_set_sha256)).size,
    1,
    'Native runtimes used different maintained case sets',
  );

  const limitations = qualification.known_limitations;
  assert.ok(Array.isArray(limitations), 'Known limitations are invalid');
  const acceptedLimitations = limitations.map((code) => {
    assert.ok(Object.hasOwn(LIMITATIONS, code), 'Unknown known-limitation code');
    return { code, description: LIMITATIONS[code] };
  });
  assert.equal(
    new Set(limitations).size,
    limitations.length,
    'Known-limitation codes are duplicated',
  );
  return {
    package_version: release.version,
    archive_sha256: release.sha256,
    tested_source_commit: qualification.tested_source_commit,
    platform_matrix: platforms,
    native_acceptance: nativeAcceptance,
    known_limitations: acceptedLimitations,
  };
}

export function createReleaseSummary(release, candidate, publicVerification, qualification) {
  const accepted = validateQualification(release, qualification);
  const releaseIdentity = identity(release);
  validateVerdict(candidate, 'candidate', releaseIdentity);
  validateVerdict(publicVerification, 'public', releaseIdentity);
  assert.deepEqual(candidate.scope, publicVerification.scope, 'Candidate and public scopes differ');
  const qualificationScope = Object.fromEntries(
    SCOPE_KEYS.filter((key) => Object.hasOwn(candidate.scope, key)).map((key) => [
      key,
      candidate.scope[key],
    ]),
  );
  assert.ok(Object.keys(qualificationScope).length > 0, 'Qualification scope is empty');
  return {
    schema_version: 1,
    package: PACKAGE,
    package_version: release.version,
    source_commit: release.source_commit,
    archive: { filename: release.filename, sha256: release.sha256, integrity: release.integrity },
    verdicts: { candidate: 'passed', public: 'passed' },
    qualification_scope: qualificationScope,
    tested_source_commit: accepted.tested_source_commit,
    platform_matrix: accepted.platform_matrix,
    native_acceptance: accepted.native_acceptance,
    known_limitations: accepted.known_limitations,
    capture_retention: {
      durable_assets: ['release.json', release.filename, 'release-summary.json'],
      detailed_actions_artifacts_days: 30,
    },
  };
}

function readRecord(path) {
  const bytes = readFileSync(path);
  assert.ok(bytes.length <= 1024 * 1024, 'Release record exceeds 1 MiB');
  return JSON.parse(bytes.toString('utf8'));
}

function main(args) {
  if (args[0] === 'check-qualification' && args.length === 3) {
    const accepted = validateQualification(readRecord(args[1]), readRecord(args[2]));
    process.stdout.write(`${JSON.stringify(accepted)}\n`);
    return;
  }
  if (args.length !== 5) {
    throw new Error(
      'Usage: release-summary.mjs <release.json> <candidate-verification.json> <public-verification.json> <qualification.json> <new-summary.json>\n       release-summary.mjs check-qualification <release.json> <qualification.json>',
    );
  }
  const [releasePath, candidatePath, publicPath] = args;
  const outputPath = resolve(args.at(-1));
  const summary = createReleaseSummary(
    readRecord(releasePath),
    readRecord(candidatePath),
    readRecord(publicPath),
    readRecord(args[3]),
  );
  writeFileSync(outputPath, `${JSON.stringify(summary, null, 2)}\n`, { flag: 'wx' });
  process.stdout.write(`${JSON.stringify(summary)}\n`);
}

if (process.argv[1] === import.meta.filename) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
