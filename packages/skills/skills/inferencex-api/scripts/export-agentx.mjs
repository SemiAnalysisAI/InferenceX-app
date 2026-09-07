#!/usr/bin/env node

import { createHash, randomUUID } from 'node:crypto';
import { lstat, mkdir, readlink, realpath, rename, rm, writeFile } from 'node:fs/promises';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import process from 'node:process';
import { parseArgs } from 'node:util';
import {
  argumentError,
  CliError,
  httpError,
  outputBoundary,
  requestBoundary,
  responseBoundary,
  responseError,
  runCli,
  writeStdout as writeCliStdout,
} from './cli-contract.mjs';
import { createResponseBudget } from './response-budget.mjs';
import { buildAgentxExport, selectAgentxRows, validateAgentxChunk } from './export-contract.mjs';

// Installed skills run independently of package.json; release preparation updates this version.
const PACKAGE_VERSION = '0.11.0';
const API_ORIGIN = 'https://inferencex.semianalysis.com';
const HELP = `export-agentx — export existing AgentX observations with summary enrichments

Requires Node 24 or later.

Usage:
  node export-agentx.mjs --model <display-name> [options]

Options:
  --date <YYYY-MM-DD>  As-of cutoff; omission selects latest available observations
  --raw-model <key>    Select an exact returned model key within the display bucket
  --hardware <key>     Select an exact returned hardware key
  --framework <key>    Select an exact returned framework key
  --precision <key>    Select an exact returned precision key
  --spec-method <key>  Select an exact returned speculative-method key
  --offload-mode <key> Select an exact returned offload-mode key
  --concurrency <n>    Select an exact positive concurrency
  --format <format>    csv (default) or json
  --output <file>      Output file; default stdout
  --evidence-dir <dir> Save consumed responses and a manifest in a new directory
  --error-format <mode> Failure diagnostics: text (default) or json
  --version          Show the installed package version offline
  --help               Show this help without making a request

The benchmark response is filtered locally to benchmark_type=agentic_traces.
The exporter reads existing observations; it does not run a benchmark.
Strict UTF-8; 32 MiB per response, 128 MiB total decoded bytes.
HTTP sequence deadline: 120s; each request: 30s. No HTTP retries.
`;

function validDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/u.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function positiveInteger(value, option) {
  const number = Number(value);
  if (!value || !/^\d+$/u.test(value) || !Number.isSafeInteger(number) || number <= 0) {
    throw new Error(`--${option} must be a positive integer`);
  }
  return number;
}

async function physicalPath(path) {
  try {
    return await realpath(path);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    const entry = await lstat(path).catch((statError) => {
      if (statError.code !== 'ENOENT') throw statError;
      return null;
    });
    if (entry?.isSymbolicLink()) return physicalPath(resolve(dirname(path), await readlink(path)));
    return join(await physicalPath(dirname(path)), basename(path));
  }
}

function containsPath(parent, child) {
  const path = relative(parent, child);
  return path === '' || (path !== '..' && !path.startsWith(`..${sep}`) && !isAbsolute(path));
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

async function saveManifest(evidence) {
  await outputBoundary(async () => {
    const temporary = join(evidence.directory, 'manifest.tmp');
    await writeFile(temporary, `${JSON.stringify(evidence.manifest, null, 2)}\n`, 'utf8');
    await rename(temporary, join(evidence.directory, 'manifest.json'));
  });
}

async function stageFileOutput(destination, bytes, signal) {
  const target = resolve(destination);
  const suffix = `${process.pid}-${randomUUID()}`;
  const temporary = join(dirname(target), `.${basename(target)}.${suffix}.tmp`);
  const backup = join(dirname(target), `.${basename(target)}.${suffix}.backup`);
  try {
    await writeFile(temporary, bytes, { flag: 'wx' });
  } catch (error) {
    await rm(temporary, { force: true }).catch(() => {});
    throw error;
  }
  let installed = false;
  let original = false;

  return {
    async commit() {
      const entry = await lstat(target).catch((error) => {
        if (error.code !== 'ENOENT') throw error;
        return null;
      });
      if (entry?.isDirectory()) throw new Error(`--output must not name a directory: ${target}`);
      if (entry) {
        await rename(target, backup);
        original = true;
      }
      signal.throwIfAborted();
      await rename(temporary, target);
      installed = true;
    },
    async rollback() {
      const errors = [];
      if (installed) {
        await rm(target, { force: true }).catch((error) => errors.push(error));
      }
      if (original) {
        await rename(backup, target).catch((error) => errors.push(error));
      }
      await rm(temporary, { force: true }).catch((error) => errors.push(error));
      if (errors.length > 0) {
        throw new Error(errors.map((error) => error.message).join('; '));
      }
    },
    async finish() {
      await rm(backup, { force: true }).catch(() => {});
    },
  };
}

async function fetchJson(url, operation, requestUrls, evidence, budget, requestedChunkIds = null) {
  const requestNumber = requestUrls.length + 1;
  requestUrls.push({ operation, url: url.href });
  let record;
  if (evidence) {
    record = {
      operation,
      request_number: requestNumber,
      url: url.href,
      method: 'GET',
      retrieved_at: null,
      http_status: null,
      decoded_body_sha256: null,
      body_file: null,
      requested_chunk_ids: requestedChunkIds,
      checksum_covers: 'saved decoded response body',
    };
    evidence.manifest.responses.push(record);
    await saveManifest(evidence);
  }
  let response;
  const requestSignal = AbortSignal.any([budget.signal, AbortSignal.timeout(30_000)]);
  try {
    budget.signal.throwIfAborted();
    response = await requestBoundary(
      () =>
        fetch(url, {
          redirect: 'error',
          signal: requestSignal,
        }),
      requestSignal,
    );
  } catch (error) {
    if (error?.code) {
      throw new CliError(
        error.code,
        `${operation} request failed: ${error.message} (${url.href})`,
        { cause: error, httpStatus: error.httpStatus },
      );
    }
    throw new Error(`${operation} request failed: ${error.message} (${url.href})`, {
      cause: error,
    });
  }
  if (record) {
    record.retrieved_at = new Date().toISOString();
    record.http_status = response.status;
  }
  let bytes;
  try {
    bytes = await responseBoundary(() => budget.read(response), requestSignal);
  } catch (error) {
    if (error instanceof CliError && ['CANCELLED', 'TIMEOUT'].includes(error.code)) throw error;
    if (!response.ok) throw httpError(response.status, `HTTP ${response.status} (${url.href})`);
    if (error?.code) {
      throw new CliError(
        error.code,
        `Could not read ${operation} response body: ${error.message}`,
        {
          cause: error,
          httpStatus: error.httpStatus,
        },
      );
    }
    throw new Error(`Could not read ${operation} response body: ${error.message}`, {
      cause: error,
    });
  }
  if (record) {
    const filename = `response-${String(requestNumber).padStart(4, '0')}-${operation}.json`;
    await outputBoundary(
      () => writeFile(join(evidence.directory, filename), bytes, { flag: 'wx' }),
      budget.signal,
    );
    record.decoded_body_sha256 = sha256(bytes);
    record.body_file = filename;
    await saveManifest(evidence);
  }
  // Fetch has already decoded HTTP compression. Parse the same bytes saved above.
  let body;
  try {
    body = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch (error) {
    if (response.ok) throw responseError(`${operation} response is not valid UTF-8`, error);
    body = '';
  }
  if (!response.ok) {
    let detail = '';
    try {
      const parsed = JSON.parse(body);
      if (typeof parsed?.error === 'string') detail = `: ${parsed.error.slice(0, 300)}`;
    } catch {
      // The HTTP status is authoritative when an error body is not JSON.
    }
    throw httpError(response.status, `HTTP ${response.status}${detail} (${url.href})`);
  }
  return responseBoundary(() => {
    try {
      return JSON.parse(body);
    } catch (error) {
      throw responseError(`Could not read ${operation} JSON: ${error.message}`, error);
    }
  }, budget.signal);
}

async function fetchChunks(operation, ids, limit, requestUrls, evidence, budget) {
  const joined = new Map();
  for (let offset = 0; offset < ids.length; offset += limit) {
    const chunk = ids.slice(offset, offset + limit);
    const url = new URL(`/api/v1/${operation}`, API_ORIGIN);
    url.searchParams.set('ids', chunk.join(','));
    const entries = await responseBoundary(
      async () =>
        validateAgentxChunk(
          operation,
          chunk,
          await fetchJson(url, operation, requestUrls, evidence, budget, chunk),
        ),
      budget.signal,
    );
    for (const [id, value] of entries) joined.set(id, value);
  }
  return joined;
}

async function run(args, signal) {
  let argumentsValidated = false;
  try {
    const { values } = parseArgs({
      args,
      options: {
        model: { type: 'string' },
        date: { type: 'string' },
        'raw-model': { type: 'string' },
        hardware: { type: 'string' },
        framework: { type: 'string' },
        precision: { type: 'string' },
        'spec-method': { type: 'string' },
        'offload-mode': { type: 'string' },
        concurrency: { type: 'string' },
        format: { type: 'string', default: 'csv' },
        output: { type: 'string' },
        'evidence-dir': { type: 'string' },
        version: { type: 'boolean' },
        help: { type: 'boolean' },
        'error-format': { type: 'string' },
      },
      allowPositionals: false,
      strict: true,
    });
    if (values.version) {
      await writeCliStdout(`${PACKAGE_VERSION}\n`, { signal });
      return;
    }
    if (values.help) {
      await writeCliStdout(HELP, { signal });
      return;
    }
    if (!values.model?.trim()) throw new Error('--model requires a display model name');
    if (values.date !== undefined && !validDate(values.date)) {
      throw new Error('--date must be a valid YYYY-MM-DD date');
    }
    for (const [option, description] of [
      ['raw-model', 'a returned model key'],
      ['hardware', 'a returned hardware key'],
      ['framework', 'a returned framework key'],
      ['precision', 'a returned precision key'],
      ['spec-method', 'a returned speculative-method key'],
      ['offload-mode', 'a returned offload-mode key'],
    ]) {
      if (values[option] !== undefined && !values[option].trim()) {
        throw new Error(`--${option} requires ${description}`);
      }
    }
    const concurrency =
      values.concurrency === undefined
        ? undefined
        : positiveInteger(values.concurrency, 'concurrency');
    if (!['csv', 'json'].includes(values.format)) throw new Error('--format must be csv or json');
    if (values.output !== undefined && !values.output.trim()) {
      throw new Error('--output requires a file path');
    }
    if (values['evidence-dir'] !== undefined && !values['evidence-dir'].trim()) {
      throw new Error('--evidence-dir requires a new directory path');
    }
    argumentsValidated = true;

    const requestedFilters = {
      raw_model: values['raw-model'],
      hardware: values.hardware,
      framework: values.framework,
      precision: values.precision,
      spec_method: values['spec-method'],
      offload_mode: values['offload-mode'],
      concurrency,
    };
    const filters = Object.fromEntries(
      Object.entries(requestedFilters).map(([name, value]) => [
        name,
        { status: value === undefined ? 'omitted' : 'applied', value: value ?? null },
      ]),
    );
    const requestedScope = {
      display_model: values.model,
      date: values.date ?? null,
      date_selection: values.date === undefined ? 'latest' : 'as-of',
      raw_model: values['raw-model'] ?? null,
      hardware: values.hardware ?? null,
      framework: values.framework ?? null,
      precision: values.precision ?? null,
      spec_method: values['spec-method'] ?? null,
      offload_mode: values['offload-mode'] ?? null,
      concurrency: concurrency ?? null,
      benchmark_type: 'agentic_traces',
    };
    const appliedFilters = {
      display_model: { status: 'applied', value: values.model },
      date: {
        status: values.date === undefined ? 'omitted' : 'applied',
        value: values.date ?? null,
      },
      benchmark_type: { status: 'applied', value: 'agentic_traces' },
      ...filters,
    };
    const outputPath = values.output === undefined ? null : resolve(values.output);
    let evidence;
    let outputTransaction;

    try {
      if (values['evidence-dir'] !== undefined) {
        const directory = resolve(values['evidence-dir']);
        if (outputPath !== null) {
          const physicalEvidencePath = await outputBoundary(() => physicalPath(directory), signal);
          const physicalOutputPath = await outputBoundary(() => physicalPath(outputPath), signal);
          const evidencePath = physicalEvidencePath.toLowerCase();
          const physicalOutput = physicalOutputPath.toLowerCase();
          if (
            containsPath(evidencePath, physicalOutput) ||
            containsPath(physicalOutput, evidencePath)
          ) {
            throw argumentError('--output collides with the evidence directory');
          }
        }
        await outputBoundary(async () => {
          await mkdir(dirname(directory), { recursive: true });
          await mkdir(directory); // EEXIST also rejects empty directories and symlinks.
        }, signal);
        evidence = {
          directory,
          manifest: {
            schema_version: 1,
            package_version: PACKAGE_VERSION,
            status: 'pending',
            started_at: new Date().toISOString(),
            finished_at: null,
            outcome: null,
            requested_filters: requestedScope,
            applied_filters: appliedFilters,
            counts: {
              returned_rows: null,
              returned_agentx_rows: null,
              selected_rows: null,
            },
            responses: [],
            export: {
              format: values.format,
              destination: outputPath ?? 'stdout',
              sha256: null,
              metadata: null,
              source_request_numbers: [],
            },
            error: null,
          },
        };
        await saveManifest(evidence);
      }

      const requestUrls = [];
      const budget = createResponseBudget({
        responseBytes: 32 * 1024 * 1024,
        totalBytes: 128 * 1024 * 1024,
        timeoutMs: 120_000,
        signal,
      });
      const benchmarkUrl = new URL('/api/v1/benchmarks', API_ORIGIN);
      benchmarkUrl.searchParams.set('model', values.model);
      if (values.date !== undefined) benchmarkUrl.searchParams.set('date', values.date);
      const benchmarks = await fetchJson(benchmarkUrl, 'benchmarks', requestUrls, evidence, budget);
      const selection = selectAgentxRows(benchmarks, requestedScope);
      const { agentxRows, selected, ids, outcome } = selection;
      if (evidence) {
        evidence.manifest.outcome = outcome;
        evidence.manifest.counts = {
          returned_rows: benchmarks.length,
          returned_agentx_rows: agentxRows.length,
          selected_rows: selected.length,
        };
        await saveManifest(evidence);
      }
      const aggregates = await fetchChunks(
        'agentic-aggregates',
        ids,
        200,
        requestUrls,
        evidence,
        budget,
      );
      const derived = await fetchChunks(
        'derived-agentic-metrics',
        ids,
        200,
        requestUrls,
        evidence,
        budget,
      );
      const traces = await fetchChunks(
        'trace-availability',
        ids,
        500,
        requestUrls,
        evidence,
        budget,
      );
      const { metadata, outputBytes } = buildAgentxExport({
        producerVersion: PACKAGE_VERSION,
        format: values.format,
        scope: requestedScope,
        selection,
        enrichments: { aggregates, derived, traces },
        requestUrls,
        retrievedAt: new Date().toISOString(),
      });
      if (evidence) {
        const sourceRequestNumbers = evidence.manifest.responses
          .filter((record) => record.body_file !== null)
          .map((record) => record.request_number);
        if (sourceRequestNumbers.length !== evidence.manifest.responses.length) {
          throw new Error('Cannot complete evidence with an uncaptured response');
        }
        evidence.manifest.export.metadata = metadata;
        evidence.manifest.export.source_request_numbers = sourceRequestNumbers;
        await saveManifest(evidence);
      }
      if (outputPath === null) {
        await writeCliStdout(outputBytes, { signal });
      } else {
        outputTransaction = await outputBoundary(
          () => stageFileOutput(outputPath, outputBytes, signal),
          signal,
        );
        await outputBoundary(() => outputTransaction.commit(), signal);
      }
      signal.throwIfAborted();
      if (evidence) {
        evidence.manifest.export.sha256 = sha256(outputBytes);
        evidence.manifest.status = 'complete';
        evidence.manifest.finished_at = new Date().toISOString();
        await saveManifest(evidence);
      }
      if (outputTransaction) {
        signal.throwIfAborted();
        await outputTransaction.finish();
        outputTransaction = null;
      }
      process.stderr.write(`${JSON.stringify({ metadata })}\n`);
      process.stderr.write(
        `Selected ${metadata.selected_rows} AgentX rows from ${metadata.returned_rows} complete benchmark rows (${metadata.returned_agentx_rows} AgentX before exact-filter selection).\n`,
      );
    } catch (error) {
      let failure = error;
      if (outputTransaction) {
        try {
          await outputTransaction.rollback();
        } catch (rollbackError) {
          failure = new CliError(
            error instanceof CliError ? error.code : 'INTERNAL_ERROR',
            `${error.message}; could not restore the previous output: ${rollbackError.message}`,
            { cause: error, httpStatus: error.httpStatus },
          );
        }
      }
      if (evidence) {
        evidence.manifest.status = 'failed';
        evidence.manifest.finished_at = new Date().toISOString();
        evidence.manifest.outcome = 'failed';
        evidence.manifest.error = failure.message;
        evidence.manifest.export.sha256 = null;
        evidence.manifest.export.source_request_numbers = [];
        try {
          await saveManifest(evidence);
        } catch (writeError) {
          throw new CliError(
            failure instanceof CliError ? failure.code : 'INTERNAL_ERROR',
            `${failure.message}; could not save failure evidence: ${writeError.message}`,
            { cause: failure, httpStatus: failure.httpStatus },
          );
        }
      }
      throw failure;
    }
  } catch (error) {
    if (!argumentsValidated && error?.code !== 'CANCELLED' && error?.code !== 'OUTPUT_ERROR') {
      throw argumentError(error.message, error);
    }
    throw error;
  }
}

await runCli({
  command: 'export-agentx',
  packageVersion: PACKAGE_VERSION,
  run: ({ args, signal }) => run(args, signal),
});
