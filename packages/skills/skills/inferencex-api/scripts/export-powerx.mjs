#!/usr/bin/env node

import { createHash, randomUUID } from 'node:crypto';
import { lstat, mkdir, readlink, realpath, rename, rm, writeFile } from 'node:fs/promises';
import { basename, dirname, join, relative, resolve, sep } from 'node:path';
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
  writeStdout,
} from './cli-contract.mjs';
import { createResponseBudget } from './response-budget.mjs';
import { buildPowerxExport } from './export-contract.mjs';

// Installed skills run independently of package.json; the packed-artifact test checks this version.
const PACKAGE_VERSION = '0.10.0';
const HELP = `export-powerx — export validated single-turn PowerX observations

Requires Node 24 or later.

Usage:
  node export-powerx.mjs --model <display-name> --isl <tokens> --osl <tokens> [options]

Options:
  --date <YYYY-MM-DD>  As-of cutoff; omission selects latest available observations
  --raw-model <key>   Select an exact returned model key within the display bucket
  --format <format>   csv (default) or json
  --output <file>     Output file relative to the current directory; default stdout
  --evidence-dir <dir> Save the consumed response and manifest in a new directory
  --error-format <mode> Failure diagnostics: text (default) or json
  --version          Show the installed package version offline
  --help             Show this help without making a request

Requests powerValid=strictV2 and selects the exact single-turn workload locally.
Data goes to stdout or --output; request metadata and coverage go to stderr.
One 30s request; at most 32 MiB decoded bytes; strict UTF-8. No HTTP retries.
File output is staged before replacing its destination; failed writes preserve old output.
`;

function positiveInteger(value, option) {
  const number = Number(value);
  if (!value || !/^\d+$/u.test(value) || !Number.isSafeInteger(number) || number <= 0) {
    throw new Error(`--${option} must be a positive integer`);
  }
  return number;
}

function validDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/u.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

// Resolve existing symlink ancestors, including dangling output links, before creating evidence.
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

async function saveManifest(evidence) {
  await outputBoundary(async () => {
    const temporary = join(evidence.directory, 'manifest.tmp');
    await writeFile(temporary, `${JSON.stringify(evidence.manifest, null, 2)}\n`, 'utf8');
    await rename(temporary, join(evidence.directory, 'manifest.json'));
  });
}

async function run(args, signal) {
  let argumentsValidated = false;
  try {
    const { values } = parseArgs({
      args,
      options: {
        model: { type: 'string' },
        isl: { type: 'string' },
        osl: { type: 'string' },
        date: { type: 'string' },
        'raw-model': { type: 'string' },
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
      await writeStdout(`${PACKAGE_VERSION}\n`, { signal });
      return;
    }
    if (values.help) {
      await writeStdout(HELP, { signal });
      return;
    }
    if (!values.model?.trim()) throw new Error('--model requires a display model name');
    const isl = positiveInteger(values.isl, 'isl');
    const osl = positiveInteger(values.osl, 'osl');
    if (values.date !== undefined && !validDate(values.date)) {
      throw new Error('--date must be a valid YYYY-MM-DD date');
    }
    if (values['raw-model'] !== undefined && !values['raw-model'].trim()) {
      throw new Error('--raw-model requires a returned model key');
    }
    if (!['csv', 'json'].includes(values.format)) throw new Error('--format must be csv or json');
    if (values.output !== undefined && !values.output.trim()) {
      throw new Error('--output requires a file path');
    }
    if (values['evidence-dir'] !== undefined && !values['evidence-dir'].trim()) {
      throw new Error('--evidence-dir requires a new directory path');
    }
    argumentsValidated = true;

    const url = new URL('https://inferencex.semianalysis.com/api/v1/benchmarks');
    url.searchParams.set('model', values.model);
    if (values.date !== undefined) url.searchParams.set('date', values.date);
    url.searchParams.set('powerValid', 'strictV2');
    let evidence;
    if (values['evidence-dir'] !== undefined) {
      const directory = resolve(values['evidence-dir']);
      if (values.output !== undefined) {
        // Reserve case-only aliases too, so the export is safe on case-insensitive filesystems.
        let evidencePath = await outputBoundary(() => physicalPath(directory), signal);
        let outputPath = await outputBoundary(() => physicalPath(resolve(values.output)), signal);
        evidencePath = evidencePath.toLowerCase();
        outputPath = outputPath.toLowerCase();
        const withinEvidence = relative(evidencePath, outputPath);
        if (
          withinEvidence === '' ||
          ['response.json', 'manifest.json', 'manifest.tmp'].some(
            (file) => withinEvidence === file || withinEvidence.startsWith(`${file}${sep}`),
          ) ||
          evidencePath.startsWith(`${outputPath}${sep}`)
        ) {
          throw argumentError(
            '--output collides with the evidence directory or a reserved evidence file',
          );
        }
      }
      await outputBoundary(async () => {
        await mkdir(dirname(directory), { recursive: true });
        await mkdir(directory); // EEXIST also refuses empty directories and symlinks.
      }, signal);
      evidence = {
        directory,
        manifest: {
          schema_version: 1,
          package_version: PACKAGE_VERSION,
          status: 'pending',
          request: {
            url: url.href,
            method: 'GET',
            filters: {
              model: values.model,
              date: values.date ?? null,
              powerValid: 'strictV2',
              benchmark_type: 'single_turn',
              isl,
              osl,
              raw_model: values['raw-model'] ?? null,
            },
          },
          response: null,
          export: {
            format: values.format,
            destination: values.output === undefined ? 'stdout' : resolve(values.output),
            sha256: null,
            metadata: null,
          },
        },
      };
      await saveManifest(evidence);
    }
    try {
      await exportPowerx(values, isl, osl, url, evidence, signal);
    } catch (error) {
      if (evidence) {
        evidence.manifest.status = 'failed';
        evidence.manifest.error = error.message;
        try {
          await saveManifest(evidence);
        } catch (writeError) {
          throw new CliError(
            error instanceof CliError ? error.code : 'INTERNAL_ERROR',
            `${error.message}; could not save failure evidence: ${writeError.message}`,
            {
              cause: error,
              httpStatus: error.httpStatus,
            },
          );
        }
      }
      throw error;
    }
  } catch (error) {
    if (!argumentsValidated && error?.code !== 'CANCELLED' && error?.code !== 'OUTPUT_ERROR') {
      throw argumentError(error.message, error);
    }
    throw error;
  }
}

async function exportPowerx(values, isl, osl, url, evidence, signal) {
  const budget = createResponseBudget({
    responseBytes: 32 * 1024 * 1024,
    totalBytes: 32 * 1024 * 1024,
    timeoutMs: 30_000,
    signal,
  });
  const response = await requestBoundary(
    () => fetch(url, { signal: budget.signal, redirect: 'error' }),
    budget.signal,
  );
  if (evidence) {
    const captured = {
      status: response.status,
      retrieved_at: new Date().toISOString(),
      body_file: null,
      sha256: null,
      checksum_covers: 'saved decoded response body',
    };
    evidence.manifest.response = captured;
    // fetch decodes HTTP compression; save and parse these same bytes, without refetching.
  }
  let bytes;
  try {
    bytes = await responseBoundary(() => budget.read(response), budget.signal);
  } catch (error) {
    if (error instanceof CliError && ['CANCELLED', 'TIMEOUT'].includes(error.code)) throw error;
    if (!response.ok) throw httpError(response.status, `HTTP ${response.status} (${url.href})`);
    throw error;
  }
  if (evidence) {
    await outputBoundary(
      () => writeFile(join(evidence.directory, 'response.json'), bytes, { flag: 'wx' }),
      signal,
    );
    evidence.manifest.response.body_file = 'response.json';
    evidence.manifest.response.sha256 = createHash('sha256').update(bytes).digest('hex');
  }
  let capturedBody;
  try {
    capturedBody = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch (error) {
    if (response.ok) throw responseError('Benchmark response is not valid UTF-8', error);
    capturedBody = '';
  }
  if (!response.ok) {
    let body;
    try {
      body = JSON.parse(capturedBody);
    } catch {
      body = null;
    }
    const detail = typeof body?.error === 'string' ? `: ${body.error.slice(0, 300)}` : '';
    throw httpError(response.status, `HTTP ${response.status}${detail} (${url.href})`);
  }
  const rows = await responseBoundary(() => {
    let parsed;
    try {
      parsed = JSON.parse(capturedBody);
    } catch (error) {
      throw new Error(`Could not read benchmark JSON: ${error.message}`, { cause: error });
    }
    return parsed;
  }, signal);
  const {
    metadata,
    rows: observations,
    outputBytes: output,
  } = buildPowerxExport({
    producerVersion: PACKAGE_VERSION,
    format: values.format,
    benchmarks: rows,
    scope: {
      model: values.model,
      date: values.date ?? null,
      isl,
      osl,
      raw_model: values['raw-model'] ?? null,
    },
    queryUrl: url.href,
    retrievedAt: evidence?.manifest.response.retrieved_at ?? new Date().toISOString(),
  });
  if (evidence) {
    evidence.manifest.export.sha256 = createHash('sha256').update(output).digest('hex');
    evidence.manifest.export.metadata = metadata;
  }
  // A closed consumer is a failed export, even if response capture already succeeded.
  await (values.output === undefined
    ? writeStdout(output, { signal })
    : outputBoundary(async () => {
        // Follow existing output symlinks, preserving the previous writeFile destination semantics.
        const destination = await physicalPath(resolve(values.output));
        const temporary = join(
          dirname(destination),
          `.${basename(destination)}.${randomUUID()}.tmp`,
        );
        let mode;
        try {
          const existing = await lstat(destination);
          if (!existing.isFile()) throw new Error('--output must name a regular file');
          mode = existing.mode & 0o777;
        } catch (error) {
          if (error.code !== 'ENOENT') throw error;
        }
        try {
          await writeFile(temporary, output, { encoding: 'utf8', flag: 'wx', mode });
          signal.throwIfAborted();
          await rename(temporary, destination);
        } finally {
          await rm(temporary, { force: true });
        }
      }, signal));
  if (evidence) {
    signal.throwIfAborted();
    evidence.manifest.status = 'complete';
    await saveManifest(evidence);
  }
  process.stderr.write(`${JSON.stringify({ metadata })}\n`);
  process.stderr.write(
    `Selected ${metadata.selected_rows} of ${metadata.returned_rows} returned rows. Raw models: ${metadata.selected_models.join(', ') || '(none)'}.\n`,
  );
  process.stderr.write(
    `Excluded ${metadata.excluded_rows.outside_requested_scope} outside the requested scope and ${metadata.excluded_rows.not_strict_v2} failing strictV2 within that scope.\n`,
  );
  if (observations.length > 0) {
    process.stderr.write(
      'StrictV2 eligibility does not guarantee every metric is available. See metric_coverage for finite-value counts; unavailable CSV metrics remain blank.\n',
    );
  }
  if (observations.length === 0) {
    process.stderr.write('No strictV2 rows matched the requested scope.\n');
  }
  if (metadata.non_finite_values > 0) {
    process.stderr.write(
      `Unavailable non-finite values: ${metadata.non_finite_values}; exported as null or blank.\n`,
    );
  }
}

await runCli({
  command: 'export-powerx',
  packageVersion: PACKAGE_VERSION,
  run: ({ args, signal }) => run(args, signal),
});
