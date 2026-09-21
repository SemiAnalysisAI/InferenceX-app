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
const caseIds = JSON.parse(
  readFileSync(new URL('../maintainer/natural-language-cases.json', import.meta.url), 'utf8'),
).cases.map((entry) => entry.id);
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
  scope: ['powerx', 'agentx', 'result', 'tco', 'releases', 'collectivex', 'offline', 'discovery'],
  cases: caseIds.map((caseId, index) => ({
    case_id: caseId,
    status: 'passed',
    assessor_status: 'passed',
    prompt_transcript_sha256: (index + 1).toString(16).padStart(64, '0'),
    answer_transcript_sha256: (index + 101).toString(16).padStart(64, '0'),
  })),
}));
const candidate = {
  status: 'passed',
  mode: 'candidate',
  candidate: release,
  new_benchmark_runs: false,
  scope,
  targets: ['codex', 'claude'].map((target) => ({ target, contract_one: { status: 'passed' } })),
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
const exceptionOptions = { allowNativeReportLimitations: true };

function reportException() {
  const archive = {
    ...release,
    sha256: 'b6ee16ef5d359f2055e4a86e156f1045e64f2a048ca6662b1859ce4b0f1480a2',
  };
  const record = structuredClone(qualification);
  record.archive_sha256 = archive.sha256;
  record.native_report_exception = 'accepted-1.0.0-report-limitations';
  for (const entry of record.platform_matrix) entry.archive_sha256 = archive.sha256;
  for (const entry of record.native_acceptance) {
    entry.archive_sha256 = archive.sha256;
    entry.status = 'not_run';
    entry.scope = [];
    delete entry.prompt_transcript_sha256;
    delete entry.answer_transcript_sha256;
    for (const item of entry.cases) {
      item.status = 'not_run';
      item.assessor_status = 'not_run';
      delete item.prompt_transcript_sha256;
      delete item.answer_transcript_sha256;
    }
  }
  return { archive, record };
}

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

test('summary requires both completed target workflows in each verification record', () => {
  for (const targets of [
    [null],
    candidate.targets.slice(0, 1),
    [candidate.targets[0], candidate.targets[0]],
    [candidate.targets[0], { target: 'claude' }],
    [candidate.targets[0], { target: 'claude', contract_one: { status: 'failed' } }],
  ]) {
    assert.throws(() =>
      createReleaseSummary(release, { ...candidate, targets }, publicVerification, qualification),
    );
    const rejected = execute({ ...publicVerification, targets });
    assert.notEqual(rejected.status, 0);
    assert.equal(rejected.outputFileExists, false);
  }
});

test('qualification rejects coerced known-limitation codes', () => {
  for (const knownLimitations of [
    [['WINDOWS_UNQUALIFIED']],
    [['WINDOWS_UNQUALIFIED'], ['WINDOWS_UNQUALIFIED']],
  ]) {
    assert.throws(() =>
      validateQualification(release, { ...qualification, known_limitations: knownLimitations }),
    );
  }
});

test('qualification preserves retried matrix attempts while requiring one run and archive', () => {
  const retried = structuredClone(qualification);
  retried.platform_matrix[0].run_attempt = '2';
  const accepted = validateQualification(release, retried);
  assert.deepEqual(
    accepted.platform_matrix.map((entry) => entry.run_attempt),
    ['2', '1', '1', '1'],
  );
  for (const changes of [
    {
      run_id: '987654321',
      evidence_url: 'https://github.com/SemiAnalysisAI/InferenceX-app/actions/runs/987654321',
    },
    { archive_sha256: 'f'.repeat(64) },
    { head_sha: 'f'.repeat(40) },
  ]) {
    const invalid = structuredClone(retried);
    Object.assign(invalid.platform_matrix[0], changes);
    assert.throws(() => validateQualification(release, invalid));
  }
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
      value.native_acceptance[0].cases = value.native_acceptance[0].cases.filter(
        (entry) => entry.case_id !== 'tco-tail-latency',
      );
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

test('the explicit 1.0.0 report exception records all current-archive native cases as unrun', () => {
  const { archive, record } = reportException();
  const summary = createReleaseSummary(
    archive,
    { ...candidate, candidate: archive },
    { ...publicVerification, candidate: archive },
    record,
    exceptionOptions,
  );
  assert.deepEqual(summary.native_report_exception.counts, { passed: 0, failed: 0, not_run: 26 });
  assert.equal(summary.native_report_exception.code, 'accepted-1.0.0-report-limitations');
  assert.match(summary.native_report_exception.reason, /not fully qualified/u);
  assert.deepEqual(summary.native_acceptance, record.native_acceptance);
  assert.equal(
    Object.hasOwn(validateQualification(release, qualification), 'native_report_exception'),
    false,
  );
});

test('the report exception requires both opt-ins and the exact release identity', () => {
  const { archive, record } = reportException();
  for (const options of [
    undefined,
    { allowNativeReportLimitations: false },
    { allowNativeReportLimitations: 'true' },
  ])
    assert.throws(() => validateQualification(archive, record, options));
  for (const declaration of [
    undefined,
    null,
    true,
    'accepted',
    ['accepted-1.0.0-report-limitations'],
  ])
    assert.throws(() =>
      validateQualification(
        archive,
        { ...record, native_report_exception: declaration },
        exceptionOptions,
      ),
    );
  for (const changed of [
    { ...archive, version: '1.0.1', filename: 'semianalysisai-inferencex-skills-1.0.1.tgz' },
    { ...archive, sha256: hash },
  ]) {
    const rebound = structuredClone(record);
    rebound.package_version = changed.version;
    rebound.archive_sha256 = changed.sha256;
    for (const entry of [...rebound.platform_matrix, ...rebound.native_acceptance])
      entry.archive_sha256 = changed.sha256;
    assert.throws(() => validateQualification(changed, rebound, exceptionOptions));
  }
});

test('the report exception rejects historical results, invented execution and nonpassed platform gates', () => {
  const { archive, record } = reportException();
  for (const mutate of [
    (value) => {
      value.native_acceptance.pop();
    },
    (value) => {
      value.native_acceptance[0].cases.pop();
    },
    (value) => {
      value.native_acceptance[0].cases[0].case_id = 'unknown';
    },
    (value) => {
      value.native_acceptance[0].cases[0] = value.native_acceptance[0].cases[1];
    },
    (value) => {
      value.native_acceptance[0].cases[0].status = 'passed';
    },
    (value) => {
      Object.assign(value.native_acceptance[1], {
        status: 'failed',
        scope: ['agentx', 'tco'],
        cases: value.native_acceptance[1].cases.map((item) => {
          const previous = {
            'agentx-live': 'passed',
            'agentx-selected-trace': 'passed',
            'tco-live': 'failed',
          }[item.case_id];
          return previous
            ? {
                ...item,
                status: previous,
                assessor_status: previous,
                prompt_transcript_sha256: hash,
                answer_transcript_sha256: hash,
              }
            : item;
        }),
      });
    },
    (value) => {
      Object.assign(
        value.native_acceptance[1].cases.find((item) => item.case_id === 'tco-live'),
        {
          status: 'passed',
          assessor_status: 'passed',
        },
      );
    },
    (value) => {
      value.native_acceptance[1].cases.find((item) => item.case_id === 'tco-live').assessor_status =
        'passed';
    },
    (value) => {
      value.native_acceptance[1].cases.find(
        (item) => item.case_id === 'tco-live',
      ).answer_transcript_sha256 = hash;
    },
    (value) => {
      value.native_acceptance[1].cases.find(
        (item) => item.case_id === 'agentx-live',
      ).prompt_transcript_sha256 = hash;
    },
    (value) => {
      value.native_acceptance[0].cases[0].answer_transcript_sha256 = hash;
    },
    (value) => {
      value.native_acceptance[0].prompt_transcript_sha256 = hash;
    },
    (value) => {
      value.native_acceptance[1].answer_transcript_sha256 = hash;
    },
    (value) => {
      value.native_acceptance[0].status = 'passed';
    },
    (value) => {
      value.native_acceptance[1].status = 'passed';
    },
    (value) => {
      value.native_acceptance[0].scope = ['agentx'];
    },
    (value) => {
      value.native_acceptance[1].scope = ['agentx', 'tco', 'powerx'];
    },
    (value) => {
      value.native_acceptance[0].case_set_sha256 = 'invalid';
    },
    (value) => {
      value.platform_matrix[0].status = 'failed';
    },
    (value) => {
      value.platform_matrix[0].archive_sha256 = hash;
    },
  ]) {
    const invalid = structuredClone(record);
    mutate(invalid);
    assert.throws(() => validateQualification(archive, invalid, exceptionOptions));
  }
  for (const mode of ['candidate', 'public']) {
    const verified = { ...candidate, candidate: archive };
    const publicRecord = { ...publicVerification, candidate: archive };
    (mode === 'candidate' ? verified : publicRecord).status = 'failed';
    assert.throws(() =>
      createReleaseSummary(archive, verified, publicRecord, record, exceptionOptions),
    );
  }
});

test('both CLI modes enable the one-off exception only for the literal true environment value', () => {
  const { archive, record } = reportException();
  const root = mkdtempSync(join(tmpdir(), 'report-exception-'));
  for (const [name, value] of [
    ['release.json', archive],
    ['qualification.json', record],
    ['candidate.json', { ...candidate, candidate: archive }],
    ['public.json', { ...publicVerification, candidate: archive }],
  ])
    writeFileSync(join(root, name), JSON.stringify(value));
  for (const setting of ['', 'false', '1', 'TRUE', 'true']) {
    for (const mode of ['check', 'summary']) {
      const output = join(root, `${mode}-${setting || 'unset'}.json`);
      const args =
        mode === 'check'
          ? ['check-qualification', join(root, 'release.json'), join(root, 'qualification.json')]
          : [
              ...['release.json', 'candidate.json', 'public.json', 'qualification.json'].map(
                (name) => join(root, name),
              ),
              output,
            ];
      const result = spawnSync(process.execPath, [script, ...args], {
        encoding: 'utf8',
        env: { ...process.env, ALLOW_NATIVE_REPORT_LIMITATIONS: setting },
      });
      if (setting === 'true') {
        assert.equal(result.status, 0, result.stderr);
        assert.deepEqual(JSON.parse(result.stdout).native_report_exception.counts, {
          passed: 0,
          failed: 0,
          not_run: 26,
        });
      } else {
        assert.notEqual(result.status, 0);
        assert.equal(existsSync(output), false);
      }
    }
  }
});
