import { createHash, randomUUID } from 'node:crypto';
import { lstat, link, mkdir, realpath, unlink, writeFile } from 'node:fs/promises';
import { basename, dirname, isAbsolute, join, posix, relative, resolve, sep } from 'node:path';

import { CliError, responseError } from './cli-contract.mjs';
import { readBoundedRegular } from './local-files.mjs';
import { evaluatePolicy, validateCoverage } from './coverage-policy.mjs';

export const BUNDLE_LIMITS = Object.freeze({
  manifest: 1024 * 1024,
  response: 32 * 1024 * 1024,
  responses: 128 * 1024 * 1024,
  result: 256 * 1024 * 1024,
  report: 1024 * 1024,
});

const HASH = /^[0-9a-f]{64}$/u;
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

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

function jsonBytes(value) {
  return Buffer.from(`${JSON.stringify(stable(value), null, 2)}\n`);
}

function plainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function canonicalTimestamp(value) {
  return (
    typeof value === 'string' &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value) &&
    Number.isFinite(Date.parse(value)) &&
    new Date(value).toISOString() === value
  );
}

async function assertOwnedDirectory(path, identity, label) {
  let current;
  try {
    current = await lstat(path);
  } catch (error) {
    throw responseError(`${label} is no longer available`, error);
  }
  if (
    !current.isDirectory() ||
    current.isSymbolicLink() ||
    current.dev !== identity.dev ||
    current.ino !== identity.ino
  ) {
    throw responseError(`${label} identity changed`);
  }
}

function canonicalRelative(path, label) {
  if (
    typeof path !== 'string' ||
    path.length === 0 ||
    isAbsolute(path) ||
    path.includes('\\') ||
    posix.normalize(path) !== path ||
    path === '..' ||
    path.startsWith('../')
  ) {
    throw responseError(`${label} is not a canonical relative path`);
  }
  return path;
}

async function exclusiveWrite(path, bytes, label) {
  try {
    await writeFile(path, bytes, { flag: 'wx' });
  } catch (error) {
    if (error.code === 'EEXIST') throw responseError(`${label} already exists`);
    throw new CliError('OUTPUT_ERROR', `Could not write ${label}: ${error.message}`, {
      cause: error,
    });
  }
}

async function exclusiveLink(source, destination, label) {
  try {
    await link(source, destination);
  } catch (error) {
    if (error.code === 'EEXIST') throw responseError(`${label} already exists`);
    throw new CliError('OUTPUT_ERROR', `Could not commit ${label}: ${error.message}`, {
      cause: error,
    });
  }
}

async function verifyWritten(path, expected, limit, label, signal) {
  const actual = await readBoundedRegular(path, limit, label, { signal });
  if (actual.length !== expected.length || sha256(actual) !== sha256(expected)) {
    throw responseError(`${label} failed its persisted size or hash check`);
  }
}

function savedResponse(response, spec) {
  if (
    !plainObject(response) ||
    !Buffer.isBuffer(response.bytes) ||
    !HASH.test(response.id) ||
    sha256(response.bytes) !== response.id ||
    response.bytes.length > BUNDLE_LIMITS.response ||
    !Number.isInteger(response.status) ||
    !spec.allowedStatuses.includes(response.status) ||
    typeof response.retrievedAt !== 'string'
  ) {
    if (Buffer.isBuffer(response?.bytes) && response.bytes.length > BUNDLE_LIMITS.response) {
      throw responseError(`Response ${spec.operation} exceeds the 32 MiB byte limit`);
    }
    throw responseError(`Invalid saved response for ${spec.operation}`);
  }
  return response;
}

export async function reserveBundle(outputDir) {
  const requested = resolve(outputDir);
  let directory;
  try {
    const parent = await realpath(dirname(requested));
    directory = join(parent, basename(requested));
    await mkdir(directory);
    await mkdir(join(directory, 'responses'));
  } catch (error) {
    if (error.code === 'EEXIST') {
      throw new CliError('OUTPUT_ERROR', `Output directory already exists: ${requested}`, {
        cause: error,
      });
    }
    if (error instanceof CliError) throw error;
    throw new CliError('OUTPUT_ERROR', `Could not reserve output directory: ${error.message}`, {
      cause: error,
    });
  }

  const directoryIdentity = await lstat(directory);
  const responsesDirectory = join(directory, 'responses');
  const responsesIdentity = await lstat(responsesDirectory);

  const requests = [];
  const captured = new Map();
  let capturedBytes = 0;
  let complete = false;

  return {
    directory,
    async get(spec, client) {
      if (complete) throw responseError('Evidence bundle is already complete');
      await assertOwnedDirectory(directory, directoryIdentity, 'Owned evidence directory');
      await assertOwnedDirectory(
        responsesDirectory,
        responsesIdentity,
        'Owned responses directory',
      );
      if (
        !plainObject(spec) ||
        typeof spec.operation !== 'string' ||
        typeof spec.url !== 'string' ||
        !Array.isArray(spec.allowedStatuses)
      ) {
        throw responseError('Collector supplied an invalid request specification');
      }
      const attemptStart = client.attempts.length;
      const response = savedResponse(await client.get(spec), spec);
      const path = `responses/${response.id}.body`;
      const destination = join(directory, ...path.split('/'));
      if (!captured.has(response.id)) {
        if (capturedBytes + response.bytes.length > BUNDLE_LIMITS.responses) {
          throw responseError('Responses exceed the 128 MiB total byte limit');
        }
        await assertOwnedDirectory(
          responsesDirectory,
          responsesIdentity,
          'Owned responses directory',
        );
        await exclusiveWrite(destination, response.bytes, `response ${response.id}`);
        await assertOwnedDirectory(
          responsesDirectory,
          responsesIdentity,
          'Owned responses directory',
        );
        await verifyWritten(
          destination,
          response.bytes,
          BUNDLE_LIMITS.response,
          `response ${response.id}`,
        );
        captured.set(response.id, response.bytes.length);
        capturedBytes += response.bytes.length;
      }
      requests.push({
        operation: spec.operation,
        url: spec.url,
        allowed_statuses: [...spec.allowedStatuses],
        attempts: stable(client.attempts.slice(attemptStart)),
        response: {
          id: response.id,
          status: response.status,
          retrieved_at: response.retrievedAt,
          path,
          sha256: response.id,
          size: response.bytes.length,
          encoding: 'decoded',
        },
      });
      return response;
    },
    async complete({
      command,
      kind,
      contractVersion,
      options,
      producerVersion,
      generatedAt,
      built,
      policy = {},
      signal,
    }) {
      if (complete) throw responseError('Evidence bundle is already complete');
      signal?.throwIfAborted();
      await assertOwnedDirectory(directory, directoryIdentity, 'Owned evidence directory');
      await assertOwnedDirectory(
        responsesDirectory,
        responsesIdentity,
        'Owned responses directory',
      );
      validateCoverage(built.coverage);
      if (
        typeof kind !== 'string' ||
        kind.length === 0 ||
        typeof (command ?? kind) !== 'string' ||
        !Number.isSafeInteger(contractVersion) ||
        contractVersion < 1 ||
        typeof producerVersion !== 'string' ||
        producerVersion.length === 0 ||
        !canonicalTimestamp(generatedAt) ||
        !plainObject(options)
      ) {
        throw responseError('Bundle completion metadata is invalid');
      }
      if (!['json', 'csv'].includes(built.format) || !Buffer.isBuffer(built.bytes)) {
        throw responseError('Collector returned an invalid built result');
      }
      if (built.bytes.length > BUNDLE_LIMITS.result) {
        throw responseError('Result exceeds the 256 MiB byte limit');
      }
      for (const request of requests) validateRequest(request);
      const resultPath = `result.${built.format}`;
      const resultDestination = join(directory, resultPath);
      await exclusiveWrite(resultDestination, built.bytes, 'result');
      await assertOwnedDirectory(directory, directoryIdentity, 'Owned evidence directory');
      await verifyWritten(resultDestination, built.bytes, BUNDLE_LIMITS.result, 'result', signal);
      for (const request of requests) {
        const expected = captured.get(request.response.id);
        if (expected === undefined || expected !== request.response.size) {
          throw responseError(`Response ${request.response.id} was not persisted completely`);
        }
        await assertOwnedDirectory(
          responsesDirectory,
          responsesIdentity,
          'Owned responses directory',
        );
        const path = join(directory, ...request.response.path.split('/'));
        const bytes = await readBoundedRegular(path, BUNDLE_LIMITS.response, 'response', {
          signal,
        });
        if (bytes.length !== expected || sha256(bytes) !== request.response.sha256) {
          throw responseError(`Response ${request.response.id} failed its final integrity check`);
        }
      }
      const manifest = {
        schema_version: 1,
        contract_version: contractVersion,
        kind,
        producer: { package_version: producerVersion },
        created_at: generatedAt,
        normalized_arguments: stable(options),
        requests,
        result: {
          path: resultPath,
          format: built.format,
          sha256: sha256(built.bytes),
          size: built.bytes.length,
        },
        coverage: stable(built.coverage),
        summary: {
          schema_version: 1,
          command: command ?? kind,
          kind,
          package_version: producerVersion,
          created_at: generatedAt,
          validity: 'valid',
          coverage: stable(built.coverage),
          policy: evaluatePolicy(kind, built.coverage, policy),
          output: { result: resultPath, manifest: 'manifest.json' },
        },
      };
      const bytes = jsonBytes(manifest);
      if (bytes.length > BUNDLE_LIMITS.manifest) {
        throw responseError('Manifest exceeds the 1 MiB byte limit');
      }
      signal?.throwIfAborted();
      await assertOwnedDirectory(directory, directoryIdentity, 'Owned evidence directory');
      await assertOwnedDirectory(
        responsesDirectory,
        responsesIdentity,
        'Owned responses directory',
      );
      const temporary = join(directory, `.manifest-${randomUUID()}.tmp`);
      await exclusiveWrite(temporary, bytes, 'manifest staging file');
      try {
        signal?.throwIfAborted();
        await exclusiveLink(temporary, join(directory, 'manifest.json'), 'manifest');
        complete = true;
      } finally {
        await unlink(temporary).catch(() => {});
      }
      return { directory, manifest };
    },
  };
}

async function bundleRoot(directory) {
  const requested = resolve(directory);
  let entry;
  try {
    entry = await lstat(requested);
  } catch (error) {
    throw responseError(`Could not read evidence directory: ${error.message}`, error);
  }
  if (!entry.isDirectory() || entry.isSymbolicLink()) {
    throw responseError('Evidence directory must be a directory, not a symbolic link');
  }
  return { requested, physical: await realpath(requested) };
}

async function safeBundlePath(root, manifestPath, label) {
  const normalized = canonicalRelative(manifestPath, label);
  const parts = normalized.split('/');
  let lexical = root.requested;
  for (const part of parts) {
    lexical = join(lexical, part);
    let entry;
    try {
      entry = await lstat(lexical);
    } catch (error) {
      throw responseError(`Missing ${label}: ${normalized}`, error);
    }
    if (entry.isSymbolicLink()) throw responseError(`${label} must not use a symbolic link`);
  }
  const physical = await realpath(lexical);
  const within = relative(root.physical, physical);
  if (within === '..' || within.startsWith(`..${sep}`) || isAbsolute(within)) {
    throw responseError(`${label} escapes the evidence directory`);
  }
  return physical;
}

function parseJson(bytes, label) {
  let text;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch (error) {
    throw responseError(`${label} is not valid UTF-8`, error);
  }
  try {
    return JSON.parse(text);
  } catch (error) {
    throw responseError(`${label} is not valid JSON: ${error.message}`, error);
  }
}

function validateManifest(manifest) {
  if (
    !plainObject(manifest) ||
    manifest.schema_version !== 1 ||
    !Number.isSafeInteger(manifest.contract_version) ||
    manifest.contract_version < 1 ||
    typeof manifest.kind !== 'string' ||
    !plainObject(manifest.producer) ||
    typeof manifest.producer.package_version !== 'string' ||
    typeof manifest.created_at !== 'string' ||
    !plainObject(manifest.normalized_arguments) ||
    !Array.isArray(manifest.requests) ||
    !plainObject(manifest.result) ||
    !plainObject(manifest.summary) ||
    !canonicalTimestamp(manifest.created_at)
  ) {
    throw responseError('Malformed evidence manifest');
  }
  validateCoverage(manifest.coverage);
  if (
    !['json', 'csv'].includes(manifest.result.format) ||
    manifest.result.path !== `result.${manifest.result.format}` ||
    !HASH.test(manifest.result.sha256) ||
    !Number.isSafeInteger(manifest.result.size) ||
    manifest.result.size < 0 ||
    manifest.result.size > BUNDLE_LIMITS.result
  ) {
    throw responseError('Malformed evidence result record');
  }
}

function validateRequest(request) {
  if (
    !plainObject(request) ||
    typeof request.operation !== 'string' ||
    typeof request.url !== 'string' ||
    !Array.isArray(request.allowed_statuses) ||
    request.allowed_statuses.length === 0 ||
    request.allowed_statuses.some(
      (status) => !Number.isInteger(status) || status < 100 || status > 599,
    ) ||
    new Set(request.allowed_statuses).size !== request.allowed_statuses.length ||
    !Array.isArray(request.attempts) ||
    !plainObject(request.response) ||
    !HASH.test(request.response.id) ||
    request.response.sha256 !== request.response.id ||
    request.response.path !== `responses/${request.response.id}.body` ||
    request.response.encoding !== 'decoded' ||
    !Number.isInteger(request.response.status) ||
    !request.allowed_statuses.includes(request.response.status) ||
    typeof request.response.retrieved_at !== 'string' ||
    !Number.isSafeInteger(request.response.size) ||
    request.response.size < 0 ||
    request.response.size > BUNDLE_LIMITS.response
  ) {
    throw responseError('Malformed evidence request record');
  }
  if (request.attempts.length === 0) throw responseError('Request attempt ledger is empty');
  if (request.attempts.length > 3 || !canonicalTimestamp(request.response.retrieved_at)) {
    throw responseError('Malformed request attempt ledger');
  }
  for (const [index, attempt] of request.attempts.entries()) {
    const final = index === request.attempts.length - 1;
    const hasStatus = Object.hasOwn(attempt, 'status');
    const hasNetworkCode = Object.hasOwn(attempt, 'networkCode');
    const identityValid = final
      ? hasStatus && !hasNetworkCode
      : attempt.retry?.reason === 'transient_network_error'
        ? hasNetworkCode
        : hasStatus && !hasNetworkCode;
    if (
      !plainObject(attempt) ||
      attempt.operation !== request.operation ||
      attempt.url !== request.url ||
      attempt.ordinal !== index + 1 ||
      !canonicalTimestamp(attempt.startedAt) ||
      !canonicalTimestamp(attempt.endedAt) ||
      Date.parse(attempt.endedAt) < Date.parse(attempt.startedAt) ||
      !Number.isSafeInteger(attempt.consumedBytes) ||
      attempt.consumedBytes < 0 ||
      !identityValid ||
      (hasStatus &&
        (!Number.isInteger(attempt.status) || attempt.status < 100 || attempt.status > 599)) ||
      (hasNetworkCode &&
        (typeof attempt.networkCode !== 'string' || attempt.networkCode.length === 0)) ||
      !plainObject(attempt.retry) ||
      (final
        ? attempt.retry.decision !== 'accepted' || attempt.retry.reason !== 'allowed_status'
        : attempt.retry.decision !== 'retry' ||
          !['transient_network_error', 'retry_after', 'transient_http_status'].includes(
            attempt.retry.reason,
          )) ||
      (!final && (!Number.isSafeInteger(attempt.retry.delayMs) || attempt.retry.delayMs <= 0)) ||
      (final && Object.hasOwn(attempt.retry, 'delayMs'))
    ) {
      throw responseError('Malformed request attempt ledger');
    }
  }
  if (
    request.attempts.at(-1).status !== request.response.status ||
    request.attempts.at(-1).consumedBytes !== request.response.size
  ) {
    throw responseError('Final request attempt does not account for the consumed response');
  }
}

export async function openReplay(directory, { signal } = {}) {
  const root = await bundleRoot(directory);
  let manifestPath;
  try {
    manifestPath = await safeBundlePath(root, 'manifest.json', 'manifest');
  } catch (error) {
    if (error.cause?.code === 'ENOENT')
      throw responseError('Evidence bundle is incomplete: manifest.json is missing');
    throw error;
  }
  const manifest = parseJson(
    await readBoundedRegular(manifestPath, BUNDLE_LIMITS.manifest, 'manifest', { signal }),
    'manifest',
  );
  validateManifest(manifest);
  const resultPath = await safeBundlePath(root, manifest.result.path, 'result');
  const resultBytes = await readBoundedRegular(resultPath, BUNDLE_LIMITS.result, 'result', {
    signal,
  });
  if (
    resultBytes.length !== manifest.result.size ||
    sha256(resultBytes) !== manifest.result.sha256
  ) {
    throw responseError('Result size or SHA-256 does not match the manifest');
  }

  let total = 0;
  const responseCache = new Map();
  const responses = [];
  for (const request of manifest.requests) {
    validateRequest(request);
    let bytes = responseCache.get(request.response.id);
    if (bytes === undefined) {
      const path = await safeBundlePath(root, request.response.path, 'response');
      bytes = await readBoundedRegular(path, BUNDLE_LIMITS.response, 'response', { signal });
      total += bytes.length;
      if (total > BUNDLE_LIMITS.responses) {
        throw responseError('Responses exceed the 128 MiB total byte limit');
      }
      if (bytes.length !== request.response.size || sha256(bytes) !== request.response.sha256) {
        throw responseError(
          `Response ${request.response.id} size or SHA-256 does not match the manifest`,
        );
      }
      responseCache.set(request.response.id, bytes);
    }
    if (bytes.length !== request.response.size || sha256(bytes) !== request.response.sha256) {
      throw responseError(
        `Response ${request.response.id} size or SHA-256 does not match the manifest`,
      );
    }
    responses.push({ request, bytes, body: parseJson(bytes, `response ${request.response.id}`) });
  }
  const consumed = new Set();
  return {
    manifest,
    resultBytes,
    get(spec) {
      try {
        const index = responses.findIndex((_response, candidate) => !consumed.has(candidate));
        if (index === -1) throw responseError(`No recorded response remains for ${spec.operation}`);
        const saved = responses[index];
        if (
          saved.request.operation !== spec.operation ||
          saved.request.url !== spec.url ||
          JSON.stringify(saved.request.allowed_statuses) !== JSON.stringify(spec.allowedStatuses)
        ) {
          throw responseError(`Recorded request scope does not match ${spec.operation}`);
        }
        consumed.add(index);
        return Promise.resolve({
          id: saved.request.response.id,
          status: saved.request.response.status,
          retrievedAt: saved.request.response.retrieved_at,
          bytes: saved.bytes,
          body: saved.body,
        });
      } catch (error) {
        return Promise.reject(error);
      }
    },
    assertConsumed() {
      try {
        if (consumed.size !== responses.length) {
          throw responseError(
            `${responses.length - consumed.size} recorded request(s) were not consumed`,
          );
        }
        return Promise.resolve();
      } catch (error) {
        return Promise.reject(error);
      }
    },
  };
}
