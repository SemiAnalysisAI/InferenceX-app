#!/usr/bin/env node

import { createHash, randomUUID } from 'node:crypto';
import {
  closeSync,
  constants,
  fstatSync,
  linkSync,
  lstatSync,
  openSync,
  readSync,
  readdirSync,
  realpathSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import process from 'node:process';
import { isDeepStrictEqual, parseArgs } from 'node:util';

import {
  argumentError,
  CliError,
  responseError,
  runCli,
  outputBoundary,
  writeStdout,
} from './cli-contract.mjs';
import {
  buildAgentxExport,
  buildPowerxExport,
  selectAgentxRows,
  validateAgentxChunk,
} from './export-contract.mjs';

const PACKAGE_VERSION = '0.10.0';
const API_ORIGIN = 'https://inferencex.semianalysis.com';
const MANIFEST_LIMIT = 1024 * 1024;
const RESPONSE_LIMIT = 32 * 1024 * 1024;
const RESPONSE_TOTAL_LIMIT = 128 * 1024 * 1024;
const EXPORT_LIMIT = 256 * 1024 * 1024;
const REPORT_LIMIT = 1024 * 1024;
const SUPPORTED_PRODUCERS = new Set(['0.9.0', '0.10.0', '0.11.0']);
const AGENTX_OPERATIONS = [
  ['agentic-aggregates', 200],
  ['derived-agentic-metrics', 200],
  ['trace-availability', 500],
];
const FILTER_FIELDS = [
  'raw_model',
  'hardware',
  'framework',
  'precision',
  'spec_method',
  'offload_mode',
  'concurrency',
];
const POWER_UNITS = {
  avg_power_w: 'measured W per GPU',
  prefill_avg_power_w: 'role-local measured W per GPU',
  decode_avg_power_w: 'role-local measured W per GPU',
  joules_per_successful_query: 'whole-deployment accelerator J/query',
  joules_per_input_token: 'whole-deployment accelerator J/input token',
  joules_per_output_token: 'whole-deployment accelerator J/output token',
  joules_per_total_token: 'whole-deployment accelerator J/total token',
  prefill_joules_per_input_token: 'role-local accelerator J/input token',
  decode_joules_per_output_token: 'role-local accelerator J/output token',
  avg_temp_c: 'per-GPU degrees C',
  peak_temp_c: 'per-GPU degrees C',
  avg_util_pct: 'per-GPU percent',
  avg_mem_used_mb: 'per-GPU MB',
};
const HELP = `Usage:
  verify-export --evidence-dir <dir> --export <file> [--report <file>]

Options:
  --evidence-dir <dir> Saved PowerX or AgentX summary evidence
  --export <file>      Saved CSV or JSON export to verify
  --report <file>      Create a Markdown report; default stdout
  --error-format <mode> Failure diagnostics: text (default) or json
  --version            Show the installed verifier version offline
  --help               Show this help without reading evidence

Reads local saved evidence only. No HTTP requests or benchmark runs.
`;

function verify(condition, message) {
  if (!condition) throw responseError(message);
}

function exactKeys(value, expected, label) {
  verify(
    value !== null && typeof value === 'object' && !Array.isArray(value),
    `${label} must be an object`,
  );
  const actual = Object.keys(value).toSorted();
  verify(
    isDeepStrictEqual(actual, [...expected].toSorted()),
    `${label} has an unsupported key set`,
  );
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function hashValue(value, label) {
  verify(typeof value === 'string' && /^[0-9a-f]{64}$/u.test(value), `${label} SHA-256 is invalid`);
}

function timestamp(value, label) {
  const parsed = typeof value === 'string' ? Date.parse(value) : Number.NaN;
  verify(
    typeof value === 'string' &&
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value) &&
      Number.isFinite(parsed) &&
      new Date(parsed).toISOString() === value,
    `${label} is not a canonical ISO timestamp`,
  );
  return parsed;
}

function validDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/u.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function readRegular(path, limit, label) {
  let descriptor;
  try {
    const entry = lstatSync(path);
    verify(
      entry.isFile() && !entry.isSymbolicLink(),
      `${label} must be a regular file, not a symbolic link`,
    );
    verify(entry.size <= limit, `${label} exceeds the ${formatLimit(limit)} byte limit`);
    descriptor = openSync(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    const opened = fstatSync(descriptor);
    verify(
      opened.isFile() && opened.size <= limit,
      `${label} exceeds the ${formatLimit(limit)} byte limit`,
    );
    const bytes = Buffer.allocUnsafe(opened.size);
    let offset = 0;
    while (offset < bytes.length) {
      const count = readSync(descriptor, bytes, offset, Math.min(64 * 1024, bytes.length - offset));
      if (count === 0) break;
      offset += count;
    }
    const extra = Buffer.allocUnsafe(1);
    const extraBytes = readSync(descriptor, extra, 0, 1);
    const after = fstatSync(descriptor);
    verify(
      offset === opened.size &&
        extraBytes === 0 &&
        after.dev === opened.dev &&
        after.ino === opened.ino &&
        after.mode === opened.mode &&
        after.size === opened.size &&
        after.mtimeMs === opened.mtimeMs &&
        after.ctimeMs === opened.ctimeMs,
      `${label} changed while it was being read`,
    );
    return bytes;
  } catch (error) {
    if (error instanceof CliError) throw error;
    throw responseError(`Could not read ${label}: ${error.message}`, error);
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

function formatLimit(limit) {
  if (limit % (1024 * 1024) === 0) return `${limit / (1024 * 1024)} MiB`;
  return `${limit} byte`;
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

function regularDirectory(path, label) {
  try {
    const entry = lstatSync(path);
    verify(
      entry.isDirectory() && !entry.isSymbolicLink(),
      `${label} must be a directory, not a symbolic link`,
    );
    return realpathSync.native(path);
  } catch (error) {
    if (error instanceof CliError) throw error;
    throw responseError(`Could not read ${label}: ${error.message}`, error);
  }
}

function inside(parent, child) {
  const path = relative(parent, child);
  return path === '' || (!path.startsWith(`..${sep}`) && path !== '..' && !isAbsolute(path));
}

function validateInputPaths(evidenceArgument, exportArgument) {
  const evidence = regularDirectory(resolve(evidenceArgument), 'evidence directory');
  const exportPath = resolve(exportArgument);
  const exportBytes = readRegular(exportPath, EXPORT_LIMIT, 'export');
  const physicalExport = realpathSync.native(exportPath);
  verify(
    !inside(evidence, physicalExport) && !inside(physicalExport, evidence),
    'Export path aliases or collides with the evidence directory',
  );
  return { evidence, exportBytes, physicalExport };
}

function validateReportPath(reportArgument, evidence, physicalExport) {
  if (reportArgument === undefined) return null;
  const report = resolve(reportArgument);
  let entry;
  try {
    entry = lstatSync(report, { throwIfNoEntry: false });
  } catch (error) {
    throw argumentError(`Could not inspect --report: ${error.message}`, error);
  }
  if (entry) throw argumentError('--report must name a new file; the path already exists');
  let physicalParent;
  try {
    physicalParent = realpathSync.native(dirname(report));
  } catch (error) {
    throw argumentError(`--report parent must be an existing directory: ${error.message}`, error);
  }
  if (physicalParent !== resolve(dirname(report))) {
    throw argumentError('--report must not resolve through a symbolic-link directory');
  }
  const physicalReport = join(physicalParent, basename(report));
  const foldedReport = physicalReport.toLowerCase();
  const foldedEvidence = evidence.toLowerCase();
  const foldedExport = physicalExport.toLowerCase();
  if (
    inside(foldedEvidence, foldedReport) ||
    inside(foldedReport, foldedEvidence) ||
    foldedReport === foldedExport
  ) {
    throw argumentError('--report collides with or aliases the evidence directory or export');
  }
  return physicalReport;
}

function validateCommonManifest(record) {
  verify(record.schema_version === 1, 'Unsupported capture schema version');
  verify(
    typeof record.package_version === 'string' && SUPPORTED_PRODUCERS.has(record.package_version),
    'Unsupported capture producer version',
  );
  verify(record.status === 'complete', 'Evidence capture is not complete');
}

function validateDestination(value, label) {
  verify(
    typeof value === 'string' && value.length > 0 && (value === 'stdout' || isAbsolute(value)),
    `${label} destination is invalid`,
  );
}

function validateFormat(record, label) {
  verify(['csv', 'json'].includes(record.format), `${label} format is unsupported`);
  validateDestination(record.destination, label);
  hashValue(record.sha256, label);
}

function expectedFiles(evidence, names, label) {
  let entries;
  try {
    entries = readdirSync(evidence, { withFileTypes: true });
  } catch (error) {
    throw responseError(`Could not list ${label}: ${error.message}`, error);
  }
  const actual = entries.map(({ name }) => name).toSorted();
  const expected = [...names].toSorted();
  verify(isDeepStrictEqual(actual, expected), `${label} contains unexpected or missing files`);
  verify(
    entries.every((entry) => entry.isFile() || entry.isSymbolicLink()),
    `${label} contains an unexpected directory`,
  );
  verify(
    new Set(actual.map((name) => name.toLowerCase())).size === actual.length,
    `${label} contains case-alias filenames`,
  );
}

function readResponse(evidence, filename, recordedHash, budget) {
  const bytes = readRegular(join(evidence, filename), RESPONSE_LIMIT, `response ${filename}`);
  budget.bytes += bytes.length;
  verify(
    budget.bytes <= RESPONSE_TOTAL_LIMIT,
    'Saved responses exceed the 128 MiB total byte limit',
  );
  hashValue(recordedHash, `response ${filename}`);
  verify(sha256(bytes) === recordedHash, `Response ${filename} SHA-256 differs from the manifest`);
  return parseJson(bytes, `response ${filename}`);
}

function validateExportBytes(bytes, record) {
  verify(sha256(bytes) === record.sha256, 'Export SHA-256 differs from the manifest');
}

function validatePowerx(record, evidence, exportBytes) {
  exactKeys(
    record,
    ['schema_version', 'package_version', 'status', 'request', 'response', 'export'],
    'PowerX manifest',
  );
  validateCommonManifest(record);
  exactKeys(record.request, ['url', 'method', 'filters'], 'PowerX request');
  exactKeys(
    record.request.filters,
    ['model', 'date', 'powerValid', 'benchmark_type', 'isl', 'osl', 'raw_model'],
    'PowerX request filters',
  );
  const filters = record.request.filters;
  verify(
    typeof filters.model === 'string' && filters.model.trim(),
    'PowerX model filter is invalid',
  );
  verify(filters.date === null || validDate(filters.date), 'PowerX date filter is invalid');
  verify(filters.powerValid === 'strictV2', 'PowerX powerValid filter must be strictV2');
  verify(filters.benchmark_type === 'single_turn', 'PowerX benchmark type must be single_turn');
  verify(Number.isSafeInteger(filters.isl) && filters.isl > 0, 'PowerX isl filter is invalid');
  verify(Number.isSafeInteger(filters.osl) && filters.osl > 0, 'PowerX osl filter is invalid');
  verify(
    filters.raw_model === null ||
      (typeof filters.raw_model === 'string' && filters.raw_model.trim()),
    'PowerX raw model filter is invalid',
  );
  verify(record.request.method === 'GET', 'PowerX request method must be GET');
  const query = new URL('/api/v1/benchmarks', API_ORIGIN);
  query.searchParams.set('model', filters.model);
  if (filters.date !== null) query.searchParams.set('date', filters.date);
  query.searchParams.set('powerValid', 'strictV2');
  verify(record.request.url === query.href, 'PowerX request URL differs from its filters');

  exactKeys(
    record.response,
    ['status', 'retrieved_at', 'body_file', 'sha256', 'checksum_covers'],
    'PowerX response',
  );
  verify(record.response.status === 200, 'PowerX response status must be 200');
  verify(
    record.response.body_file === 'response.json',
    'PowerX response filename must be response.json',
  );
  verify(
    record.response.checksum_covers === 'saved decoded response body',
    'PowerX response checksum scope is invalid',
  );
  timestamp(record.response.retrieved_at, 'PowerX response retrieval time');

  exactKeys(record.export, ['format', 'destination', 'sha256', 'metadata'], 'PowerX export');
  validateFormat(record.export, 'PowerX export');
  verify(
    record.export.metadata !== null && typeof record.export.metadata === 'object',
    'PowerX export metadata is missing',
  );
  verify(
    record.export.metadata.retrieved_at === record.response.retrieved_at,
    'PowerX response and export retrieval times differ',
  );
  expectedFiles(evidence, ['manifest.json', 'response.json'], 'PowerX evidence directory');
  const budget = { bytes: 0 };
  const benchmarks = readResponse(evidence, 'response.json', record.response.sha256, budget);
  validateExportBytes(exportBytes, record.export);
  const built = buildPowerxExport({
    producerVersion: record.package_version,
    format: record.export.format,
    benchmarks,
    scope: {
      model: filters.model,
      date: filters.date,
      isl: filters.isl,
      osl: filters.osl,
      raw_model: filters.raw_model,
    },
    queryUrl: record.request.url,
    retrievedAt: record.response.retrieved_at,
  });
  verify(
    isDeepStrictEqual(built.metadata, record.export.metadata),
    'PowerX export metadata differs from the saved response',
  );
  verify(
    Buffer.compare(built.outputBytes, exportBytes) === 0,
    'PowerX reconstructed export bytes differ from --export',
  );
  return {
    kind: 'PowerX',
    manifest: record,
    built,
    ledger: [{ ...record.response, operation: 'benchmarks', url: record.request.url }],
  };
}

function validateScope(scope) {
  exactKeys(
    scope,
    ['display_model', 'date', 'date_selection', ...FILTER_FIELDS, 'benchmark_type'],
    'AgentX requested filters',
  );
  verify(
    typeof scope.display_model === 'string' && scope.display_model.trim(),
    'AgentX display model is invalid',
  );
  verify(scope.date === null || validDate(scope.date), 'AgentX date filter is invalid');
  verify(
    scope.date_selection === (scope.date === null ? 'latest' : 'as-of'),
    'AgentX date selection is inconsistent',
  );
  verify(scope.benchmark_type === 'agentic_traces', 'AgentX benchmark type is invalid');
  for (const key of FILTER_FIELDS) {
    const value = scope[key];
    if (key === 'concurrency') {
      verify(
        value === null || (Number.isSafeInteger(value) && value > 0),
        'AgentX concurrency filter is invalid',
      );
    } else {
      verify(
        value === null || (typeof value === 'string' && value.trim()),
        `AgentX ${key} filter is invalid`,
      );
    }
  }
}

function validateAppliedFilters(applied, scope) {
  const names = ['display_model', 'date', 'benchmark_type', ...FILTER_FIELDS];
  exactKeys(applied, names, 'AgentX applied filters');
  for (const name of names) {
    const item = applied[name];
    exactKeys(item, ['status', 'value'], `AgentX applied filter ${name}`);
    const expected = scope[name];
    const omitted = expected === null;
    verify(
      item.status === (omitted ? 'omitted' : 'applied'),
      `AgentX applied filter status differs: ${name}`,
    );
    verify(isDeepStrictEqual(item.value, expected), `AgentX applied filter value differs: ${name}`);
  }
}

function chunks(values, size) {
  return Array.from({ length: Math.ceil(values.length / size) }, (_, index) =>
    values.slice(index * size, (index + 1) * size),
  );
}

function agentxUrl(operation, scope, ids) {
  const url = new URL(`/api/v1/${operation}`, API_ORIGIN);
  if (operation === 'benchmarks') {
    url.searchParams.set('model', scope.display_model);
    if (scope.date !== null) url.searchParams.set('date', scope.date);
  } else {
    url.searchParams.set('ids', ids.join(','));
  }
  return url.href;
}

function validateAgentxRecord(record, expected, number) {
  exactKeys(
    record,
    [
      'operation',
      'request_number',
      'url',
      'method',
      'retrieved_at',
      'http_status',
      'decoded_body_sha256',
      'body_file',
      'requested_chunk_ids',
      'checksum_covers',
    ],
    `AgentX response ${number}`,
  );
  verify(record.operation === expected.operation, `AgentX response operation differs: ${number}`);
  verify(record.request_number === number, `AgentX response request number differs: ${number}`);
  verify(record.url === expected.url, `AgentX response URL differs: ${number}`);
  verify(record.method === 'GET', `AgentX response method differs: ${number}`);
  timestamp(record.retrieved_at, `AgentX response retrieval time ${number}`);
  verify(record.http_status === 200, `AgentX response status differs: ${number}`);
  verify(record.body_file === expected.filename, `AgentX response filename differs: ${number}`);
  verify(
    isDeepStrictEqual(record.requested_chunk_ids, expected.ids),
    `AgentX response chunk identity differs: ${number}`,
  );
  verify(
    record.checksum_covers === 'saved decoded response body',
    `AgentX response checksum scope differs: ${number}`,
  );
  hashValue(record.decoded_body_sha256, `AgentX response ${number}`);
}

function agentxSpecs(scope, ids) {
  const specs = [{ operation: 'benchmarks', ids: null, url: agentxUrl('benchmarks', scope, null) }];
  for (const [operation, limit] of AGENTX_OPERATIONS) {
    for (const group of chunks(ids, limit))
      specs.push({ operation, ids: group, url: agentxUrl(operation, scope, group) });
  }
  return specs.map((spec, index) => ({
    ...spec,
    filename: `response-${String(index + 1).padStart(4, '0')}-${spec.operation}.json`,
  }));
}

function validateAgentx(record, evidence, exportBytes) {
  exactKeys(
    record,
    [
      'schema_version',
      'package_version',
      'status',
      'started_at',
      'finished_at',
      'outcome',
      'requested_filters',
      'applied_filters',
      'counts',
      'responses',
      'export',
      'error',
    ],
    'AgentX manifest',
  );
  validateCommonManifest(record);
  verify(record.error === null, 'AgentX complete evidence must not contain an error');
  const started = timestamp(record.started_at, 'AgentX capture start time');
  const finished = timestamp(record.finished_at, 'AgentX capture finish time');
  verify(started <= finished, 'AgentX capture times are reversed');
  validateScope(record.requested_filters);
  validateAppliedFilters(record.applied_filters, record.requested_filters);
  exactKeys(
    record.counts,
    ['returned_rows', 'returned_agentx_rows', 'selected_rows'],
    'AgentX counts',
  );
  verify(
    Object.values(record.counts).every((value) => Number.isSafeInteger(value) && value >= 0),
    'AgentX counts are invalid',
  );
  verify(
    Array.isArray(record.responses) && record.responses.length > 0,
    'AgentX evidence has no complete response',
  );
  exactKeys(
    record.export,
    ['format', 'destination', 'sha256', 'metadata', 'source_request_numbers'],
    'AgentX export',
  );
  validateFormat(record.export, 'AgentX export');
  verify(
    record.export.metadata !== null && typeof record.export.metadata === 'object',
    'AgentX export metadata is missing',
  );

  const firstSpec = {
    operation: 'benchmarks',
    ids: null,
    url: agentxUrl('benchmarks', record.requested_filters, null),
    filename: 'response-0001-benchmarks.json',
  };
  validateAgentxRecord(record.responses[0], firstSpec, 1);
  const budget = { bytes: 0 };
  const benchmarks = readResponse(
    evidence,
    firstSpec.filename,
    record.responses[0].decoded_body_sha256,
    budget,
  );
  const selection = selectAgentxRows(benchmarks, record.requested_filters);
  const specs = agentxSpecs(record.requested_filters, selection.ids);
  verify(
    record.responses.length === specs.length,
    'AgentX response count differs from the exact chunk ledger',
  );
  const enrichments = {
    aggregates: new Map(),
    derived: new Map(),
    traces: new Map(),
  };
  const destination = {
    'agentic-aggregates': enrichments.aggregates,
    'derived-agentic-metrics': enrichments.derived,
    'trace-availability': enrichments.traces,
  };
  for (let index = 0; index < specs.length; index++) {
    const number = index + 1;
    const spec = specs[index];
    const response = record.responses[index];
    validateAgentxRecord(response, spec, number);
    if (index === 0) continue;
    const body = readResponse(evidence, spec.filename, response.decoded_body_sha256, budget);
    const entries = validateAgentxChunk(spec.operation, spec.ids, body);
    for (const [id, value] of entries) destination[spec.operation].set(id, value);
  }
  expectedFiles(
    evidence,
    ['manifest.json', ...specs.map(({ filename }) => filename)],
    'AgentX evidence directory',
  );
  verify(
    record.outcome === selection.outcome,
    'AgentX outcome differs from the saved benchmark response',
  );
  verify(
    isDeepStrictEqual(record.counts, {
      returned_rows: selection.benchmarks.length,
      returned_agentx_rows: selection.agentxRows.length,
      selected_rows: selection.selected.length,
    }),
    'AgentX counts differ from the saved benchmark response',
  );
  verify(
    isDeepStrictEqual(
      record.export.source_request_numbers,
      specs.map((_value, index) => index + 1),
    ),
    'AgentX export source request numbers differ from the complete ledger',
  );
  const retrievedAt = record.export.metadata.retrieved_at;
  const retrieved = timestamp(retrievedAt, 'AgentX export retrieval time');
  const responseTimes = record.responses.map(({ retrieved_at: responseTime }) =>
    timestamp(responseTime, 'AgentX response retrieval time'),
  );
  verify(
    responseTimes.every(
      (time, index) =>
        started <= time &&
        (index === 0 || responseTimes[index - 1] <= time) &&
        time <= retrieved &&
        retrieved <= finished,
    ),
    'AgentX capture times do not cover every response and the export',
  );
  const requestUrls = record.responses.map(({ operation, url }) => ({ operation, url }));
  const built = buildAgentxExport({
    producerVersion: record.package_version,
    format: record.export.format,
    scope: record.requested_filters,
    selection,
    enrichments,
    requestUrls,
    retrievedAt,
  });
  validateExportBytes(exportBytes, record.export);
  verify(
    isDeepStrictEqual(built.metadata, record.export.metadata),
    'AgentX export metadata differs from the saved responses',
  );
  verify(
    Buffer.compare(built.outputBytes, exportBytes) === 0,
    'AgentX reconstructed export bytes differ from --export',
  );
  return { kind: 'AgentX', manifest: record, built, ledger: record.responses, selection };
}

function loadVerification(evidence, exportBytes) {
  const manifestBytes = readRegular(join(evidence, 'manifest.json'), MANIFEST_LIMIT, 'manifest');
  const record = parseJson(manifestBytes, 'manifest');
  verify(
    record !== null && typeof record === 'object' && !Array.isArray(record),
    'Manifest must be an object',
  );
  if (Object.hasOwn(record, 'selected_result_id')) {
    throw responseError(
      'AgentX point evidence is unsupported; verify-export accepts summary captures only',
    );
  }
  const powerx = Object.hasOwn(record, 'request') || Object.hasOwn(record, 'response');
  const agentx = Object.hasOwn(record, 'responses') || Object.hasOwn(record, 'requested_filters');
  verify(powerx !== agentx, 'Manifest capture kind is ambiguous or unsupported');
  return powerx
    ? validatePowerx(record, evidence, exportBytes)
    : validateAgentx(record, evidence, exportBytes);
}

function inlineCode(value) {
  let text = '';
  let currentBackticks = 0;
  let longestBackticks = 0;
  for (const character of String(value)) {
    const code = character.codePointAt(0);
    if (character === '`') {
      currentBackticks++;
      longestBackticks = Math.max(longestBackticks, currentBackticks);
    } else {
      currentBackticks = 0;
    }
    if (character === '\\') text += String.raw`\\`;
    else if (character === '\r') text += String.raw`\r`;
    else if (character === '\n') text += String.raw`\n`;
    else if (character === '\t') text += String.raw`\t`;
    else if (code < 32 || code === 127) text += String.raw`\u${code.toString(16).padStart(4, '0')}`;
    else text += character;
  }
  const fence = '`'.repeat(longestBackticks + 1);
  const padding = text.startsWith('`') || text.endsWith('`') ? ' ' : '';
  return `${fence}${padding}${text}${padding}${fence}`;
}

function countValues(rows, field) {
  const counts = new Map();
  let missing = 0;
  for (const row of rows) {
    if (!Object.hasOwn(row, field) || row[field] === null || row[field] === undefined) {
      missing++;
    } else {
      const value = String(row[field]);
      counts.set(value, (counts.get(value) ?? 0) + 1);
    }
  }
  return {
    values: [...counts].toSorted(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0)),
    missing,
  };
}

function timeContext(rows) {
  const lines = ['## Time context'];
  for (const [label, field] of [
    ['Observation dates', 'date'],
    ['Producer run starts', 'run_started_at'],
    ['Logical snapshot dates', 'curve_date'],
    ['Logical snapshot run starts', 'curve_run_started_at'],
  ]) {
    const counts = countValues(rows, field);
    lines.push(
      `- ${label}: ${counts.values.map(([value, count]) => `${inlineCode(value)} (${count})`).join(', ') || '(none)'}`,
      `- ${label} missing: ${counts.missing}`,
    );
  }
  return lines;
}

function sourceLedger(ledger) {
  return [
    '## Source ledger',
    ...ledger.map(
      (source, index) =>
        `- Request ${index + 1}: ${inlineCode(source.operation)}; URL ${inlineCode(source.url)}; retrieved ${inlineCode(source.retrieved_at)}; SHA-256 ${inlineCode(source.decoded_body_sha256 ?? source.sha256)}; file ${inlineCode(source.body_file)}`,
    ),
  ];
}

function availableAgentxFilters(rows) {
  return [
    ['raw_model', 'model'],
    ['hardware', 'hardware'],
    ['framework', 'framework'],
    ['precision', 'precision'],
    ['spec_method', 'spec_method'],
    ['offload_mode', 'offload_mode'],
    ['concurrency', 'conc'],
  ].map(([name, field]) => {
    const values = [...new Set(rows.map((row) => row[field]))].toSorted((left, right) => {
      const leftText = String(left);
      const rightText = String(right);
      return leftText < rightText ? -1 : leftText > rightText ? 1 : 0;
    });
    return `- ${inlineCode(name)}: ${values.map(inlineCode).join(', ') || '(none)'}`;
  });
}

function renderPowerx({ manifest, built, ledger }) {
  const metadata = built.metadata;
  const lines = [
    '# Verified PowerX export',
    '',
    '## Verification identity',
    `- Capture schema: ${manifest.schema_version}`,
    `- Producer package: ${inlineCode(manifest.package_version)}`,
    `- Format: ${inlineCode(manifest.export.format)}`,
    `- Saved sources: ${ledger.length}`,
    `- Export SHA-256: ${inlineCode(manifest.export.sha256)}`,
    '- Result: verified against saved evidence. These hashes establish bundle consistency, not publisher authenticity.',
    '',
    '## Exact scope',
    `- Display model: ${inlineCode(metadata.requested_model)}`,
    `- Date selection: ${inlineCode(metadata.date_selection)}`,
    `- Date cutoff: ${inlineCode(metadata.requested_date)}`,
    `- Benchmark type: ${inlineCode(metadata.benchmark_type)}`,
    `- Workload: ISL ${metadata.isl}, OSL ${metadata.osl}`,
    `- Raw model: ${inlineCode(metadata.raw_model)}`,
    '- Power eligibility: `strictV2`.',
    '',
    ...sourceLedger(ledger),
    '',
    '## Selection counts',
    `- Complete-response rows: ${metadata.returned_rows}`,
    `- Requested-scope rows: ${metadata.returned_rows - metadata.excluded_rows.outside_requested_scope}`,
    `- Selected strictV2 rows: ${metadata.selected_rows}`,
    `- Excluded outside scope: ${metadata.excluded_rows.outside_requested_scope}`,
    `- Excluded non-strictV2: ${metadata.excluded_rows.not_strict_v2}`,
    '',
    ...timeContext(built.rows),
    '',
    '## Metric coverage',
  ];
  for (const [metric, unit] of Object.entries(POWER_UNITS)) {
    const coverage = metadata.metric_coverage[metric];
    lines.push(
      `- ${inlineCode(metric)} — ${unit}; available ${coverage.available_rows}; unavailable ${coverage.unavailable_rows}; source ${inlineCode('response.json')}.`,
    );
  }
  if (metadata.selected_rows === 0) {
    lines.push('', 'The requested scope had no eligible observations in this saved response.');
  }
  return lines;
}

function derivedCoverage(rows, field) {
  const supported = rows.filter(({ agentx }) => agentx.status !== 'unsupported_id');
  const unsupported = rows.length - supported.length;
  return {
    finite: supported.filter(
      ({ agentx }) =>
        agentx.derived_metrics.status === 'available' &&
        Number.isFinite(agentx.derived_metrics.value[field]),
    ).length,
    null: supported.filter(
      ({ agentx }) =>
        agentx.derived_metrics.status === 'available' &&
        agentx.derived_metrics.value[field] === null,
    ).length,
    missing: supported.filter(({ agentx }) => agentx.derived_metrics.status === 'not_returned')
      .length,
    unsupported,
  };
}

function renderAgentx({ manifest, built, ledger, selection }) {
  const metadata = built.metadata;
  const coverage = metadata.enrichment_coverage;
  const sources = Object.fromEntries(
    AGENTX_OPERATIONS.map(([operation]) => [
      operation,
      ledger.filter((entry) => entry.operation === operation).map(({ body_file }) => body_file),
    ]),
  );
  const traceRows = built.rows.filter(({ agentx }) => agentx.status !== 'unsupported_id');
  const explicitFalse = traceRows.filter(
    ({ agentx }) =>
      agentx.trace_availability.response_key_present && agentx.trace_availability.value === false,
  ).length;
  const lines = [
    '# Verified AgentX export',
    '',
    '## Verification identity',
    `- Capture schema: ${manifest.schema_version}`,
    `- Producer package: ${inlineCode(manifest.package_version)}`,
    `- Format: ${inlineCode(manifest.export.format)}`,
    `- Saved sources: ${ledger.length}`,
    `- Export SHA-256: ${inlineCode(manifest.export.sha256)}`,
    '- Result: verified against saved evidence. These hashes establish bundle consistency, not publisher authenticity.',
    '',
    '## Exact scope',
    ...Object.entries(metadata.requested_scope).map(
      ([key, value]) => `- ${inlineCode(key)}: ${inlineCode(value)}`,
    ),
    '',
    ...sourceLedger(ledger),
    '',
    '## Selection counts',
    `- Complete-response rows: ${metadata.returned_rows}`,
    `- Returned AgentX rows: ${metadata.returned_agentx_rows}`,
    `- Selected rows: ${metadata.selected_rows}`,
    `- Safe-ID rows: ${coverage.safe_id_rows}`,
    `- Unsupported-ID rows: ${coverage.unsupported_id_rows}`,
    `- Unique safe IDs: ${coverage.unique_safe_ids}`,
    `- Outcome: ${inlineCode(metadata.outcome)}`,
    '',
    ...timeContext(built.rows.map(({ benchmark }) => benchmark)),
    '',
    '## Enrichment coverage',
  ];
  for (const [group, unit] of [
    ['isl', 'tokens; n is unitless'],
    ['osl', 'tokens; n is unitless'],
    ['kvCacheUtil', 'ratio; n is unitless'],
    ['prefixCacheHitRate', 'ratio; n is unitless'],
  ]) {
    const item = coverage.aggregates[group];
    lines.push(
      `- ${inlineCode(group)} — ${unit}; available ${item.available_rows}; null ${item.null_rows}; Missing enrichment entries: ${item.missing_entry_rows}; unsupported ${item.unsupported_id_rows}; sources ${sources['agentic-aggregates'].map(inlineCode).join(', ') || '(none)'}.`,
    );
  }
  for (const field of ['p75_e2e_norm_intvty', 'p90_e2e_norm_intvty']) {
    const item = derivedCoverage(built.rows, field);
    lines.push(
      `- ${inlineCode(field)} — tok/s/user; finite ${item.finite}; null ${item.null}; missing entries ${item.missing}; unsupported ${item.unsupported}; sources ${sources['derived-agentic-metrics'].map(inlineCode).join(', ') || '(none)'}.`,
    );
  }
  lines.push(
    `- Trace availability — stored true ${coverage.trace_availability.stored_trace_rows}; Explicit false: ${explicitFalse}; Missing keys: ${coverage.trace_availability.missing_key_rows}; unsupported ${coverage.trace_availability.unsupported_id_rows}; sources ${sources['trace-availability'].map(inlineCode).join(', ') || '(none)'}.`,
  );
  if (metadata.selected_rows === 0) {
    lines.push(
      '',
      'The saved complete response produced no selected AgentX observations for this exact scope.',
      '',
      '### Available AgentX filter values in the complete response',
      ...availableAgentxFilters(selection.agentxRows),
    );
  }
  return lines;
}

function renderReport(verification) {
  const lines =
    verification.kind === 'PowerX' ? renderPowerx(verification) : renderAgentx(verification);
  lines.push(
    '',
    '## Limits',
    'Existing observations were read; no new benchmark was run. Missing values were not converted to zero. This report does not calculate averages, rank configurations, infer model quality, or assign causes to missing data.',
    '',
  );
  const bytes = Buffer.from(lines.join('\n'));
  verify(bytes.length <= REPORT_LIMIT, 'Markdown report exceeds the 1 MiB byte limit');
  return bytes;
}

async function publishReport(path, bytes, signal) {
  const temporary = join(dirname(path), `.${basename(path)}.${process.pid}.${randomUUID()}.tmp`);
  let descriptor;
  let identity;
  try {
    descriptor = openSync(
      temporary,
      constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL,
      0o600,
    );
    identity = fstatSync(descriptor);
    writeFileSync(descriptor, bytes);
    closeSync(descriptor);
    descriptor = undefined;
    await new Promise((done) => {
      setImmediate(done);
    });
    signal.throwIfAborted();
    linkSync(temporary, path);
  } finally {
    if (descriptor !== undefined) {
      try {
        closeSync(descriptor);
      } catch {}
    }
    if (identity !== undefined) {
      try {
        const current = lstatSync(temporary);
        if (current.dev === identity.dev && current.ino === identity.ino) unlinkSync(temporary);
      } catch {}
    }
  }
}

async function main(args, signal) {
  const { values } = parseArgs({
    args,
    options: {
      'evidence-dir': { type: 'string' },
      export: { type: 'string' },
      report: { type: 'string' },
      'error-format': { type: 'string' },
      version: { type: 'boolean' },
      help: { type: 'boolean' },
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
  if (!values['evidence-dir']?.trim()) throw argumentError('--evidence-dir is required');
  if (!values.export?.trim()) throw argumentError('--export is required');
  if (values.report !== undefined && !values.report.trim())
    throw argumentError('--report requires a file path');

  const paths = validateInputPaths(values['evidence-dir'], values.export);
  const reportPath = validateReportPath(values.report, paths.evidence, paths.physicalExport);
  signal.throwIfAborted();
  const verification = loadVerification(paths.evidence, paths.exportBytes);
  const report = renderReport(verification);
  await new Promise((done) => {
    setImmediate(done);
  });
  signal.throwIfAborted();
  await (reportPath === null
    ? writeStdout(report, { signal })
    : outputBoundary(() => publishReport(reportPath, report, signal), signal));
  process.stderr.write(`Verified ${verification.kind} export against saved evidence.\n`);
}

await runCli({
  command: 'verify-export',
  packageVersion: PACKAGE_VERSION,
  args: process.argv.slice(2),
  textUsageExitCode: 2,
  run: ({ args, signal }) => main(args, signal),
});
