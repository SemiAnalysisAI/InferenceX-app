import { isDeepStrictEqual } from 'node:util';
import { randomUUID } from 'node:crypto';
import { link, lstat, realpath, unlink, writeFile } from 'node:fs/promises';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';

import { PACKAGE_VERSION, argumentError, outputBoundary, responseError } from './cli-contract.mjs';
import { allCommandDescriptions, getOperation } from './commands.mjs';
import { evaluatePolicy, validateCoverage } from './coverage-policy.mjs';
import { BUNDLE_LIMITS, openReplay } from './evidence-bundle.mjs';
import { readBoundedRegular } from './local-files.mjs';

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value)
        .toSorted()
        .map((key) => [key, stable(value[key])]),
    );
  }
  return value;
}

export async function verifyBundle(directory, { signal, policy = {} } = {}) {
  const replay = await openReplay(directory, { signal });
  const { manifest } = replay;
  const description = allCommandDescriptions().find(
    (candidate) => candidate.formal && candidate.kind === manifest.kind,
  );
  if (description === undefined) {
    throw responseError(`Unsupported evidence kind: ${manifest.kind}`);
  }
  let operation;
  try {
    operation = await getOperation(manifest.kind);
  } catch (error) {
    throw responseError(`Could not load the recorded evidence contract: ${error.message}`, error);
  }
  if (manifest.contract_version !== operation.contractVersion) {
    throw responseError(
      `Unsupported ${manifest.kind} evidence contract version: ${manifest.contract_version}`,
    );
  }
  if (!operation.formats.includes(manifest.result.format)) {
    throw responseError(
      `${manifest.kind} contract ${manifest.contract_version} does not support ${manifest.result.format}`,
    );
  }
  let options;
  try {
    options = operation.normalizeArgs(manifest.normalized_arguments);
  } catch (error) {
    throw responseError(`Saved normalized arguments are invalid: ${error.message}`, error);
  }
  if (!isDeepStrictEqual(stable(options), stable(manifest.normalized_arguments))) {
    throw responseError('Normalized arguments do not match the recorded canonical options');
  }
  let built;
  try {
    built = await operation.collect(options, {
      get: replay.get,
      signal,
      producerVersion: manifest.producer.package_version,
      generatedAt: manifest.created_at,
    });
  } catch (error) {
    if (error?.code === 'INVALID_ARGUMENT') {
      throw responseError(`Recorded evidence arguments are invalid: ${error.message}`, error);
    }
    throw error;
  }
  await replay.assertConsumed();
  validateCoverage(built.coverage);
  if (built.format !== manifest.result.format) {
    throw responseError('Reconstructed result format does not match the manifest');
  }
  if (!Buffer.isBuffer(built.bytes) || built.bytes.compare(replay.resultBytes) !== 0) {
    throw responseError('Reconstructed result bytes do not match the saved result');
  }
  if (!isDeepStrictEqual(stable(built.coverage), stable(manifest.coverage))) {
    throw responseError('Reconstructed coverage does not match the manifest');
  }
  let recordedPolicy;
  try {
    recordedPolicy = evaluatePolicy(
      manifest.kind,
      manifest.coverage,
      manifest.summary.policy?.requirements,
    );
  } catch (error) {
    throw responseError(`Recorded policy is invalid: ${error.message}`, error);
  }
  const expectedSummary = {
    schema_version: 1,
    command: description.command,
    kind: manifest.kind,
    package_version: manifest.producer.package_version,
    created_at: manifest.created_at,
    validity: 'valid',
    coverage: manifest.coverage,
    policy: recordedPolicy,
    output: { result: manifest.result.path, manifest: 'manifest.json' },
  };
  if (!isDeepStrictEqual(stable(manifest.summary), stable(expectedSummary))) {
    throw responseError('Recorded bundle summary does not match reconstructed evidence');
  }
  return {
    schema_version: 1,
    command: 'verify',
    kind: manifest.kind,
    package_version: PACKAGE_VERSION,
    validity: 'valid',
    coverage: manifest.coverage,
    policy: evaluatePolicy(manifest.kind, manifest.coverage, policy),
    input: {
      directory: resolve(directory),
      result: manifest.result.path,
      producer_package_version: manifest.producer.package_version,
      contract_version: manifest.contract_version,
    },
  };
}

export function renderVerificationMarkdown(verification) {
  const hardware =
    verification.coverage.hardware.length > 0
      ? verification.coverage.hardware
          .map(({ hardware: key, valid_records: count }) => `- ${key}: ${count} valid record(s)`)
          .join('\n')
      : '- None';
  const policyReasons =
    verification.policy.reasons.length > 0
      ? verification.policy.reasons
          .map((reason) => `- ${JSON.stringify(stable(reason))}`)
          .join('\n')
      : '- None';
  const report = `# InferenceX evidence verification

- Kind: ${verification.kind}
- Validity: ${verification.validity}
- Producer package: ${verification.input.producer_package_version}
- Contract version: ${verification.input.contract_version}
- Result: ${verification.input.result}

## Coverage

- Status: ${verification.coverage.status}
- Selected records: ${verification.coverage.selected_records}
- Comparable pairs: ${verification.coverage.comparable_pairs ?? 'not applicable'}

${hardware}

## Policy

- Status: ${verification.policy.status}

${policyReasons}
`;
  const bytes = Buffer.byteLength(report);
  if (bytes > BUNDLE_LIMITS.report) throw responseError('Verification report exceeds 1 MiB');
  return report;
}

function inside(parent, child) {
  const path = relative(parent, child);
  return path === '' || (!path.startsWith(`..${sep}`) && path !== '..' && !isAbsolute(path));
}

export async function writeVerificationReport(
  reportArgument,
  evidenceDirectory,
  verification,
  { signal } = {},
) {
  const report = resolve(reportArgument);
  let existing;
  try {
    existing = await lstat(report);
  } catch (error) {
    if (error.code !== 'ENOENT') {
      throw argumentError(`Could not inspect --report: ${error.message}`, error);
    }
  }
  if (existing) throw argumentError('--report must name a new file; the path already exists');
  let parent;
  let evidence;
  try {
    parent = await realpath(dirname(report));
    evidence = await realpath(evidenceDirectory);
  } catch (error) {
    throw argumentError(`--report parent must be an existing directory: ${error.message}`, error);
  }
  const destination = join(parent, basename(report));
  if (inside(evidence.toLowerCase(), destination.toLowerCase())) {
    throw argumentError('--report must be outside the evidence directory');
  }
  const bytes = Buffer.from(renderVerificationMarkdown(verification));
  const temporary = join(parent, `.inferencex-report-${randomUUID()}.tmp`);
  await outputBoundary(async () => {
    signal?.throwIfAborted();
    try {
      await writeFile(temporary, bytes, { flag: 'wx' });
      signal?.throwIfAborted();
      await link(temporary, destination);
    } catch (error) {
      if (error.code === 'EEXIST') {
        throw argumentError('--report must name a new file; the path already exists', error);
      }
      throw error;
    } finally {
      await unlink(temporary).catch(() => {});
    }
    const persisted = await readBoundedRegular(destination, BUNDLE_LIMITS.report, 'report', {
      signal,
    });
    if (persisted.compare(bytes) !== 0) throw new Error('Report changed while it was written');
  }, signal);
  return destination;
}
