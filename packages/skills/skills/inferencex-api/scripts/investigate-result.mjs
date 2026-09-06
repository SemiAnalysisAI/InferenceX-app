#!/usr/bin/env node

import { createHash, randomUUID } from 'node:crypto';
import { rename, rm, writeFile } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import process from 'node:process';
import { parseArgs } from 'node:util';

// Installed skills run independently of package.json; release preparation updates this version.
const PACKAGE_VERSION = '0.7.0';
const API_ORIGIN = 'https://inferencex.semianalysis.com';
const RESPONSE_BYTE_BUDGET = 16 * 1024 * 1024;
const HELP = `investigate-result — collect existing benchmark provenance and one bounded log window

Requires Node 24 or later. No credentials or new benchmarks.

Usage:
  node investigate-result.mjs --id <result-id> --model <display-name> [options]

Options:
  --date <YYYY-MM-DD>  As-of benchmark scope; omission selects the latest snapshot
  --run-id <id>       Logical run snapshot (exactRun=true); cannot combine with date
  --log-file <name>   Exact artifact-relative name from server-log-files
  --log-offset <n>    Character offset, 0-2000000000 (default 0)
  --log-limit <n>     Characters to inspect, 1-262144 (default 16384)
  --output <file>     Save JSON atomically; default stdout
  --help             Show help without making requests

There is no full benchmark-row-by-ID endpoint. Supply the model and a scope
that contains the selected ID; the collector never substitutes a nearby result.
An exactRun snapshot may carry older points. Producer identity comes from the
selected row's run_url and date, never curve_* fields or internal workflow IDs.
Only one log chunk is read. No search, download, pagination, or causal analysis.
Responses share a 16 MiB decoded byte budget and each request has a 30s timeout.
`;

function object(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function identifier(value) {
  return (
    (typeof value === 'number' && Number.isSafeInteger(value) && value > 0) ||
    (typeof value === 'string' && /^[1-9]\d*$/u.test(value))
  );
}

function safeId(value) {
  return (
    identifier(value) &&
    Number.isSafeInteger(Number(value)) &&
    String(Number(value)) === String(value)
  );
}

function integerOption(value, name, minimum, maximum) {
  if (
    typeof value !== 'string' ||
    !/^(?:0|[1-9]\d*)$/u.test(value) ||
    !Number.isSafeInteger(Number(value)) ||
    Number(value) < minimum ||
    Number(value) > maximum
  ) {
    throw new Error(
      `--${name} must be a canonical ${minimum === 1 ? 'positive safe integer' : 'integer'} from ${minimum} to ${maximum}`,
    );
  }
  return Number(value);
}

function validDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/u.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function validTimestamp(value) {
  const match =
    typeof value === 'string' &&
    /^(?<date>\d{4}-\d{2}-\d{2})[T ](?<hour>\d{2}):(?<minute>\d{2}):(?<second>\d{2})(?:\.\d+)?(?:Z|[+-]\d{2}(?::?\d{2})?)$/u.exec(
      value,
    );
  return Boolean(
    match &&
    match[0] === value &&
    validDate(match.groups.date) &&
    Number(match.groups.hour) < 24 &&
    Number(match.groups.minute) < 60 &&
    Number(match.groups.second) < 60 &&
    Number.isFinite(Date.parse(value)),
  );
}

function benchmarkRow(row) {
  return (
    object(row) &&
    identifier(row.id) &&
    [
      'hardware',
      'framework',
      'model',
      'precision',
      'spec_method',
      'benchmark_type',
      'offload_mode',
    ].every((key) => typeof row[key] === 'string') &&
    ['disagg', 'is_multinode', 'prefill_dp_attention', 'decode_dp_attention'].every(
      (key) => typeof row[key] === 'boolean',
    ) &&
    [
      'prefill_tp',
      'prefill_ep',
      'prefill_num_workers',
      'decode_tp',
      'decode_ep',
      'decode_num_workers',
      'num_prefill_gpu',
      'num_decode_gpu',
      'conc',
    ].every((key) => Number.isSafeInteger(row[key])) &&
    ['isl', 'osl'].every((key) => row[key] === null || Number.isFinite(row[key])) &&
    ['image', 'run_url'].every((key) => row[key] === null || typeof row[key] === 'string') &&
    (row.recipe_fingerprint === undefined ||
      row.recipe_fingerprint === null ||
      typeof row.recipe_fingerprint === 'string') &&
    ['workflow_run_id', 'curve_workflow_run_id'].every(
      (key) => row[key] === undefined || identifier(row[key]),
    ) &&
    ['run_started_at', 'curve_run_started_at'].every(
      (key) => row[key] === undefined || row[key] === null || validTimestamp(row[key]),
    ) &&
    (row.curve_date === undefined || validDate(row.curve_date)) &&
    validDate(row.date) &&
    object(row.metrics)
  );
}

function githubRun(value) {
  if (value === null) return null;
  const match =
    typeof value === 'string' &&
    /^https:\/\/github\.com\/(?<owner>[\w.-]+)\/(?<repo>[\w.-]+)\/actions\/runs\/(?<id>[1-9]\d*)(?:\/attempts\/(?<attempt>[1-9]\d*))?$/u.exec(
      value,
    );
  if (
    !match ||
    !safeId(match.groups.id) ||
    (match.groups.attempt && !safeId(match.groups.attempt))
  ) {
    throw new Error('Invalid producer run_url: expected a canonical HTTPS GitHub Actions run URL');
  }
  return {
    github_run_id: match.groups.id,
    run_attempt: match.groups.attempt ?? null,
    run_url: `https://github.com/${match.groups.owner}/${match.groups.repo}/actions/runs/${match.groups.id}`,
  };
}

async function fetchJson(path, query, operation, evidence, budget, allowNotFound = false) {
  const url = new URL(path, API_ORIGIN);
  for (const [key, value] of Object.entries(query))
    if (value !== undefined) url.searchParams.set(key, String(value));
  const response = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(30_000) });
  if (response.redirected || (response.url && response.url !== url.href)) {
    throw new Error(`Unexpected response URL for ${operation}`);
  }
  const chunks = [];
  for await (const chunk of response.body ?? []) {
    budget.remaining -= chunk.byteLength;
    if (budget.remaining < 0) throw new Error('Exceeded the 16 MiB response byte budget');
    chunks.push(chunk);
  }
  const bytes = Buffer.concat(chunks);
  const body = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
  evidence.push({
    operation,
    url: url.href,
    retrieved_at: new Date().toISOString(),
    http_status: response.status,
    body_utf8: body,
    decoded_body_sha256: createHash('sha256').update(bytes).digest('hex'),
    checksum_covers: 'exact decoded UTF-8 response body',
  });
  if (!response.ok && !(allowNotFound && response.status === 404)) {
    throw new Error(`${operation}: HTTP ${response.status} (${url.href})`);
  }
  let value;
  try {
    value = JSON.parse(body.replace(/^\uFEFF/u, ''));
  } catch {
    throw new Error(`Invalid JSON from ${operation}`);
  }
  if (response.status === 404) {
    if (!object(value) || typeof value.error !== 'string')
      throw new Error(`Invalid ${operation} 404 response`);
    return null;
  }
  return value;
}

function workflowMetadata(value, row, producer) {
  if (
    !object(value) ||
    !['runs', 'changelogs', 'configs', 'runConfigs'].every(
      (key) => Array.isArray(value[key]) && value[key].every(object),
    ) ||
    value.runs.some(
      (run) =>
        !safeId(run.github_run_id) ||
        !safeId(run.run_attempt) ||
        !validDate(run.date) ||
        typeof run.name !== 'string' ||
        (run.conclusion !== null && typeof run.conclusion !== 'string') ||
        (run.html_url !== null && typeof run.html_url !== 'string') ||
        !validTimestamp(run.created_at),
    ) ||
    value.runConfigs.some(
      (config) =>
        !safeId(config.github_run_id) ||
        !['model', 'hardware', 'framework', 'precision', 'spec_method'].every(
          (key) => typeof config[key] === 'string',
        ) ||
        typeof config.disagg !== 'boolean' ||
        !['head_sha', 'html_url', 'run_started_at'].every(
          (key) => config[key] === null || typeof config[key] === 'string',
        ) ||
        (config.run_started_at !== null && !validTimestamp(config.run_started_at)),
    )
  ) {
    throw new Error('Invalid workflow-info response');
  }
  const matching = value.runs.filter((run) => String(run.github_run_id) === producer.github_run_id);
  if (
    matching.length > 1 ||
    matching.some(
      (run) =>
        run.date !== row.date ||
        (producer.run_attempt !== null && String(run.run_attempt) !== producer.run_attempt) ||
        (run.html_url !== null && run.html_url !== producer.run_url),
    )
  ) {
    throw new Error(
      'Producer identity mismatch in workflow-info; it exposes only the latest attempt',
    );
  }
  const configs = value.runConfigs.filter(
    (config) =>
      String(config.github_run_id) === producer.github_run_id &&
      ['model', 'hardware', 'framework', 'precision', 'spec_method', 'disagg'].every(
        (key) => config[key] === row[key],
      ),
  );
  if (
    configs.some(
      (config) =>
        (config.html_url !== null && config.html_url !== producer.run_url) ||
        (row.run_started_at !== undefined &&
          row.run_started_at !== null &&
          config.run_started_at !== null &&
          Math.floor(Date.parse(row.run_started_at) / 1000) !==
            Math.floor(Date.parse(config.run_started_at) / 1000)),
    )
  ) {
    throw new Error('Producer identity mismatch in workflow-info runConfigs');
  }
  // A bare run URL cannot prove the producer attempt from a latest-attempt listing.
  return {
    workflow_run: producer.run_attempt === null ? null : (matching[0] ?? null),
    run_configs: producer.run_attempt === null || matching.length === 0 ? [] : configs,
  };
}

function logWindow(value, id, offset, limit, file) {
  if (value === null) return { status: 'not_found', response: null };
  const count = typeof value?.serverLog === 'string' ? [...value.serverLog].length : -1;
  if (
    !object(value) ||
    !safeId(value.id) ||
    String(value.id) !== id ||
    typeof value.fileName !== 'string' ||
    value.fileName.length === 0 ||
    (file !== undefined && value.fileName !== file) ||
    value.offset !== offset ||
    count < 0 ||
    count > limit ||
    (value.nextOffset !== null && (count === 0 || value.nextOffset !== offset + count))
  ) {
    throw new Error(
      'Invalid server-log response: result, file, or character range does not match the request',
    );
  }
  return {
    status: 'available',
    partial: offset > 0 || value.nextOffset !== null,
    more_available: value.nextOffset !== null,
    inspected_characters: count,
    response: value,
  };
}

async function saveOutput(path, bytes) {
  if (path === undefined) {
    process.stdout.on('error', () => {});
    await new Promise((done, reject) => {
      process.stdout.write(bytes, (error) => (error ? reject(error) : done()));
    });
    return;
  }
  const target = resolve(path);
  const temporary = join(dirname(target), `.${basename(target)}.${randomUUID()}.tmp`);
  try {
    await writeFile(temporary, bytes, { flag: 'wx' });
    await rename(temporary, target);
  } finally {
    await rm(temporary, { force: true });
  }
}

async function main() {
  const { values } = parseArgs({
    options: {
      id: { type: 'string' },
      model: { type: 'string' },
      date: { type: 'string' },
      'run-id': { type: 'string' },
      'log-file': { type: 'string' },
      'log-offset': { type: 'string', default: '0' },
      'log-limit': { type: 'string', default: '16384' },
      output: { type: 'string' },
      help: { type: 'boolean' },
    },
    strict: true,
    allowPositionals: false,
  });
  if (values.help) {
    await saveOutput(undefined, HELP);
    return;
  }
  integerOption(values.id, 'id', 1, Number.MAX_SAFE_INTEGER);
  if (!values.model?.trim()) throw new Error('--model requires a display model name');
  if (values.date !== undefined && !validDate(values.date))
    throw new Error('--date must be a valid YYYY-MM-DD date');
  if (values['run-id'] !== undefined)
    integerOption(values['run-id'], 'run-id', 1, Number.MAX_SAFE_INTEGER);
  if (values.date !== undefined && values['run-id'] !== undefined)
    throw new Error('cannot combine --date and --run-id');
  const offset = integerOption(values['log-offset'], 'log-offset', 0, 2_000_000_000);
  const limit = integerOption(values['log-limit'], 'log-limit', 1, 262_144);
  const file = values['log-file'];
  if (file !== undefined && (file.length === 0 || file.length > 1024 || file.includes('\0'))) {
    throw new Error('--log-file must contain 1-1024 characters without NUL');
  }
  if (values.output !== undefined && !values.output.trim())
    throw new Error('--output requires a file path');

  const evidence = [];
  const budget = { remaining: RESPONSE_BYTE_BUDGET };
  const rows = await fetchJson(
    '/api/v1/benchmarks',
    {
      model: values.model,
      date: values.date,
      runId: values['run-id'],
      exactRun: values['run-id'] === undefined ? undefined : true,
    },
    'benchmarks',
    evidence,
    budget,
  );
  if (!Array.isArray(rows) || rows.some((row) => !benchmarkRow(row)))
    throw new Error('Invalid benchmark row response');
  const selected = rows.filter((row) => String(row.id) === values.id);
  if (selected.length !== 1)
    throw new Error(
      `Expected exactly one result with ID ${values.id} in the supplied model/snapshot scope; found ${selected.length}`,
    );
  const row = selected[0];
  if (
    values.date !== undefined &&
    (row.date > values.date || (row.curve_date !== undefined && row.curve_date > values.date))
  ) {
    throw new Error('Selected result contradicts the requested as-of cutoff');
  }
  if (row.curve_date !== undefined && row.curve_date < row.date) {
    throw new Error('Selected curve snapshot predates its producer');
  }
  const identity = githubRun(row.run_url);
  const limitations = [
    'Existing public observations only; these records do not establish performance causality.',
    'Log evidence covers one selected file window; other files and characters were not inspected.',
    'workflow_run_id and curve_workflow_run_id are internal identities, not GitHub run IDs.',
  ];
  let producer = {
    status: 'unresolved',
    github_run_id: null,
    run_attempt: null,
    workflow_run: null,
    run_configs: [],
  };
  if (identity) {
    const info = await fetchJson(
      '/api/v1/workflow-info',
      {
        date: row.date,
        benchmarkType: row.benchmark_type === 'agentic_traces' ? 'agentic_traces' : undefined,
      },
      'workflow-info',
      evidence,
      budget,
    );
    const metadata = workflowMetadata(info, row, identity);
    producer = {
      status: metadata.workflow_run ? 'confirmed' : 'row_only',
      github_run_id: identity.github_run_id,
      run_attempt: identity.run_attempt,
      ...metadata,
    };
    if (!metadata.workflow_run)
      limitations.push(
        'The public latest-attempt workflow listing did not confirm the producing attempt.',
      );
    if (metadata.run_configs.length === 0)
      limitations.push(
        'No matching producer config was confirmed in workflow-info; selected_result retains the original config and image.',
      );
  } else {
    limitations.push(
      'The selected run_url is null; the public response cannot identify its GitHub producer or attempt.',
    );
  }
  if (row.image === null)
    limitations.push('The selected row has no image; no image identity was inferred.');
  const log = logWindow(
    await fetchJson(
      '/api/v1/server-log',
      { id: values.id, offset, limit, file },
      'server-log',
      evidence,
      budget,
      true,
    ),
    values.id,
    offset,
    limit,
    file,
  );
  const report = {
    schema_version: 1,
    metadata: {
      package_version: PACKAGE_VERSION,
      selected_result_id: values.id,
      ran_new_benchmark: false,
      scope: {
        display_model: values.model,
        date: values.date ?? null,
        github_run_id: values['run-id'] ?? null,
        selection:
          values['run-id'] === undefined
            ? values.date === undefined
              ? 'latest_snapshot'
              : 'as_of_snapshot'
            : 'logical_run_snapshot',
      },
      log_window: { file: file ?? null, offset, limit, offset_unit: 'Unicode characters' },
    },
    selected_result: row,
    producer,
    log,
    limitations,
    evidence,
  };
  await saveOutput(values.output, `${JSON.stringify(report, null, 2)}\n`);
}

main().catch((error) => {
  process.stderr.write(`investigate-result: ${error.message}\n`);
  process.exitCode = 1;
});
