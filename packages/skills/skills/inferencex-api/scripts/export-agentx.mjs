#!/usr/bin/env node

import { writeFile } from 'node:fs/promises';
import process from 'node:process';
import { parseArgs } from 'node:util';

// Installed skills run independently of package.json; release preparation updates this version.
const PACKAGE_VERSION = '0.3.0';
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
  --help               Show this help without making a request

The benchmark response is filtered locally to benchmark_type=agentic_traces.
The exporter reads existing observations; it does not run a benchmark.
`;

const REQUIRED_STRING_FIELDS = [
  'hardware',
  'framework',
  'model',
  'precision',
  'spec_method',
  'benchmark_type',
  'offload_mode',
  'date',
];
const REQUIRED_BOOLEAN_FIELDS = [
  'disagg',
  'is_multinode',
  'prefill_dp_attention',
  'decode_dp_attention',
];
const REQUIRED_INTEGER_FIELDS = [
  'prefill_tp',
  'prefill_ep',
  'prefill_num_workers',
  'decode_tp',
  'decode_ep',
  'decode_num_workers',
  'num_prefill_gpu',
  'num_decode_gpu',
  'conc',
];
const AGGREGATE_GROUPS = ['isl', 'osl', 'kvCacheUtil', 'prefixCacheHitRate'];
const PERCENTILE_FIELDS = ['mean', 'p50', 'p75', 'p90', 'p95', 'p99'];
const FILTERS = [
  ['raw_model', 'model'],
  ['hardware', 'hardware'],
  ['framework', 'framework'],
  ['precision', 'precision'],
  ['spec_method', 'spec_method'],
  ['offload_mode', 'offload_mode'],
  ['concurrency', 'conc'],
];
const CSV_CONTEXT_COLUMNS = [
  'package_version',
  'query_url',
  'retrieved_at',
  'requested_model',
  'requested_date',
  'date_selection',
  'requested_benchmark_type',
  ...FILTERS.map(([name]) => `filter.${name}`),
];
const CSV_BENCHMARK_COLUMNS = [
  'id',
  'model',
  'hardware',
  'framework',
  'image',
  'precision',
  'spec_method',
  'benchmark_type',
  'conc',
  'offload_mode',
  'recipe_fingerprint',
  'disagg',
  'is_multinode',
  'prefill_tp',
  'prefill_ep',
  'prefill_dp_attention',
  'prefill_num_workers',
  'decode_tp',
  'decode_ep',
  'decode_dp_attention',
  'decode_num_workers',
  'num_prefill_gpu',
  'num_decode_gpu',
  'isl',
  'osl',
  'date',
  'workflow_run_id',
  'run_started_at',
  'run_url',
  'curve_date',
  'curve_workflow_run_id',
  'curve_run_started_at',
];
const CSV_ENRICHMENT_COLUMNS = [
  ...AGGREGATE_GROUPS.flatMap((group) =>
    [...PERCENTILE_FIELDS, 'n'].map((field) => `aggregate.${group}.${field}`),
  ),
  'derived.p75_e2e_norm_intvty',
  'derived.p90_e2e_norm_intvty',
  'trace.available',
  'trace.response_key_present',
  'enrichment.status',
  'enrichment.aggregates_status',
  'enrichment.derived_metrics_status',
  'enrichment.trace_availability_status',
];

function object(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

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

function csvCell(value) {
  if (value === null || value === undefined) return '';
  const text = String(value);
  return /[",\r\n]/u.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function scalar(value) {
  return value === null || ['string', 'number', 'boolean'].includes(typeof value);
}

function unique(values) {
  return [...new Set(values)].toSorted();
}

function benchmarkRow(row) {
  return (
    object(row) &&
    Object.hasOwn(row, 'id') &&
    (typeof row.id === 'string' || (typeof row.id === 'number' && Number.isSafeInteger(row.id))) &&
    REQUIRED_STRING_FIELDS.every((key) => typeof row[key] === 'string') &&
    REQUIRED_BOOLEAN_FIELDS.every((key) => typeof row[key] === 'boolean') &&
    REQUIRED_INTEGER_FIELDS.every((key) => Number.isInteger(row[key])) &&
    ['isl', 'osl'].every((key) => row[key] === null || Number.isFinite(row[key])) &&
    ['image', 'recipe_fingerprint', 'run_url'].every(
      (key) => row[key] === null || typeof row[key] === 'string',
    ) &&
    object(row.metrics) &&
    validDate(row.date)
  );
}

function safeResultId(value) {
  if (typeof value === 'number') {
    return Number.isSafeInteger(value) && value > 0 ? value : null;
  }
  if (typeof value !== 'string' || !/^[1-9]\d*$/u.test(value)) return null;
  const number = Number(value);
  return Number.isSafeInteger(number) && String(number) === value ? number : null;
}

function percentileGroup(value) {
  return (
    object(value) &&
    PERCENTILE_FIELDS.every((key) => Number.isFinite(value[key])) &&
    Number.isInteger(value.n) &&
    value.n >= 0
  );
}

function responseMap(value, requestedIds, operation, validateEntry) {
  if (!object(value)) throw new Error(`Unexpected ${operation} response shape: expected an object`);
  const result = new Map();
  const requested = new Set(requestedIds);
  for (const [key, entry] of Object.entries(value)) {
    const id = safeResultId(key);
    if (id === null || !requested.has(id)) {
      throw new Error(`Unexpected ${operation} result ID ${JSON.stringify(key)}`);
    }
    if (!validateEntry(entry, id)) {
      throw new Error(`Unexpected ${operation} response shape for result ID ${key}`);
    }
    result.set(id, entry);
  }
  return result;
}

function aggregateMap(value, requestedIds) {
  return responseMap(
    value,
    requestedIds,
    'agentic-aggregates',
    (entry, id) =>
      object(entry) &&
      entry.id === id &&
      AGGREGATE_GROUPS.every((group) => entry[group] === null || percentileGroup(entry[group])),
  );
}

function derivedMap(value, requestedIds) {
  return responseMap(
    value,
    requestedIds,
    'derived-agentic-metrics',
    (entry, id) =>
      object(entry) &&
      entry.id === id &&
      ['p75_e2e_norm_intvty', 'p90_e2e_norm_intvty'].every(
        (key) => entry[key] === null || Number.isFinite(entry[key]),
      ),
  );
}

function traceMap(value, requestedIds) {
  return responseMap(
    value,
    requestedIds,
    'trace-availability',
    (entry) => typeof entry === 'boolean',
  );
}

async function fetchJson(url, operation, requestUrls) {
  requestUrls.push({ operation, url: url.href });
  let response;
  try {
    response = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  } catch (error) {
    throw new Error(`${operation} request failed: ${error.message} (${url.href})`, {
      cause: error,
    });
  }
  let body;
  try {
    body = await response.text();
  } catch (error) {
    throw new Error(`Could not read ${operation} response body: ${error.message}`, {
      cause: error,
    });
  }
  if (!response.ok) {
    let detail = '';
    try {
      const parsed = JSON.parse(body);
      if (typeof parsed?.error === 'string') detail = `: ${parsed.error.slice(0, 300)}`;
    } catch {
      // The HTTP status is authoritative when an error body is not JSON.
    }
    throw new Error(`HTTP ${response.status}${detail} (${url.href})`);
  }
  try {
    return JSON.parse(body);
  } catch (error) {
    throw new Error(`Could not read ${operation} JSON: ${error.message}`, { cause: error });
  }
}

async function fetchChunks(operation, ids, limit, validate, requestUrls) {
  const joined = new Map();
  for (let offset = 0; offset < ids.length; offset += limit) {
    const chunk = ids.slice(offset, offset + limit);
    const url = new URL(`/api/v1/${operation}`, API_ORIGIN);
    url.searchParams.set('ids', chunk.join(','));
    const entries = validate(await fetchJson(url, operation, requestUrls), chunk);
    for (const [id, value] of entries) joined.set(id, value);
  }
  return joined;
}

function coverage(rows) {
  const supported = rows.filter((row) => row.agentx.status !== 'unsupported_id');
  const unsupported = rows.length - supported.length;
  const aggregates = Object.fromEntries(
    AGGREGATE_GROUPS.map((group) => [
      group,
      {
        available_rows: supported.filter(
          (row) =>
            row.agentx.aggregates.status === 'available' &&
            row.agentx.aggregates.value[group] !== null,
        ).length,
        null_rows: supported.filter(
          (row) =>
            row.agentx.aggregates.status === 'available' &&
            row.agentx.aggregates.value[group] === null,
        ).length,
        missing_entry_rows: supported.filter(
          (row) => row.agentx.aggregates.status === 'not_returned',
        ).length,
        unsupported_id_rows: unsupported,
      },
    ]),
  );
  return {
    safe_id_rows: supported.length,
    unsupported_id_rows: unsupported,
    unique_safe_ids: new Set(supported.map((row) => row.agentx.result_id)).size,
    aggregates,
    derived_metrics: {
      available_rows: supported.filter((row) => row.agentx.derived_metrics.status === 'available')
        .length,
      missing_entry_rows: supported.filter(
        (row) => row.agentx.derived_metrics.status === 'not_returned',
      ).length,
      unsupported_id_rows: unsupported,
    },
    trace_availability: {
      stored_trace_rows: supported.filter((row) => row.agentx.trace_availability.value === true)
        .length,
      no_stored_trace_rows: supported.filter((row) => row.agentx.trace_availability.value === false)
        .length,
      response_key_rows: supported.filter(
        (row) => row.agentx.trace_availability.response_key_present,
      ).length,
      missing_key_rows: supported.filter(
        (row) => !row.agentx.trace_availability.response_key_present,
      ).length,
      unsupported_id_rows: unsupported,
    },
  };
}

async function run(args = process.argv.slice(2)) {
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
      help: { type: 'boolean' },
    },
    allowPositionals: false,
    strict: true,
  });
  if (values.help) {
    process.stdout.write(HELP);
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

  const requestUrls = [];
  const benchmarkUrl = new URL('/api/v1/benchmarks', API_ORIGIN);
  benchmarkUrl.searchParams.set('model', values.model);
  if (values.date !== undefined) benchmarkUrl.searchParams.set('date', values.date);
  const benchmarks = await fetchJson(benchmarkUrl, 'benchmarks', requestUrls);
  if (!Array.isArray(benchmarks) || benchmarks.some((row) => !benchmarkRow(row))) {
    throw new Error(
      'Unexpected benchmarks response shape: expected complete rows with required identity, configuration, workload, date, run_url, and metrics fields',
    );
  }
  const agentxRows = benchmarks.filter((row) => row.benchmark_type === 'agentic_traces');
  const requestedFilters = {
    raw_model: values['raw-model'],
    hardware: values.hardware,
    framework: values.framework,
    precision: values.precision,
    spec_method: values['spec-method'],
    offload_mode: values['offload-mode'],
    concurrency,
  };
  const selected = agentxRows.filter((row) =>
    FILTERS.every(
      ([name, field]) =>
        requestedFilters[name] === undefined || row[field] === requestedFilters[name],
    ),
  );
  const ids = [...new Set(selected.map((row) => safeResultId(row.id)).filter((id) => id !== null))];
  const aggregates = await fetchChunks('agentic-aggregates', ids, 200, aggregateMap, requestUrls);
  const derived = await fetchChunks('derived-agentic-metrics', ids, 200, derivedMap, requestUrls);
  const traces = await fetchChunks('trace-availability', ids, 500, traceMap, requestUrls);
  let nonFiniteValues = 0;
  const rows = selected.map((row) => {
    const benchmark = JSON.parse(
      JSON.stringify(row, (_key, value) => {
        if (typeof value === 'number' && !Number.isFinite(value)) {
          nonFiniteValues++;
          return null;
        }
        return value;
      }),
    );
    const id = safeResultId(row.id);
    if (id === null) {
      return {
        benchmark,
        agentx: {
          status: 'unsupported_id',
          result_id: null,
          aggregates: { status: 'unsupported_id', value: null },
          derived_metrics: { status: 'unsupported_id', value: null },
          trace_availability: {
            status: 'unsupported_id',
            value: null,
            response_key_present: null,
          },
        },
      };
    }
    const hasAggregates = aggregates.has(id);
    const hasDerived = derived.has(id);
    const hasTraceKey = traces.has(id);
    const traceAvailable = hasTraceKey ? traces.get(id) : false;
    return {
      benchmark,
      agentx: {
        status: hasAggregates && hasDerived ? 'complete' : 'partial',
        result_id: id,
        aggregates: {
          status: hasAggregates ? 'available' : 'not_returned',
          value: hasAggregates ? aggregates.get(id) : null,
        },
        derived_metrics: {
          status: hasDerived ? 'available' : 'not_returned',
          value: hasDerived ? derived.get(id) : null,
        },
        trace_availability: {
          status: traceAvailable ? 'stored_trace' : 'no_stored_trace',
          value: traceAvailable,
          response_key_present: hasTraceKey,
        },
      },
    };
  });
  const retrievedAt = new Date().toISOString();
  const benchmarkRequest = requestUrls[0].url;
  const filters = Object.fromEntries(
    Object.entries(requestedFilters).map(([name, value]) => [
      name,
      { status: value === undefined ? 'omitted' : 'applied', value: value ?? null },
    ]),
  );
  const metadata = {
    package_version: PACKAGE_VERSION,
    retrieved_at: retrievedAt,
    request_urls: requestUrls,
    requested_scope: {
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
    },
    filters,
    outcome:
      agentxRows.length === 0
        ? 'no_agentx_rows'
        : selected.length === 0
          ? 'no_matching_rows'
          : 'selected_rows',
    returned_rows: benchmarks.length,
    returned_agentx_rows: agentxRows.length,
    selected_rows: rows.length,
    available_filter_values: {
      raw_model: unique(agentxRows.map((row) => row.model)),
      hardware: unique(agentxRows.map((row) => row.hardware)),
      framework: unique(agentxRows.map((row) => row.framework)),
      precision: unique(agentxRows.map((row) => row.precision)),
      spec_method: unique(agentxRows.map((row) => row.spec_method)),
      offload_mode: unique(agentxRows.map((row) => row.offload_mode)),
      concurrency: unique(agentxRows.map((row) => row.conc)),
    },
    returned_model_keys: unique(benchmarks.map((row) => row.model)),
    selected_model_keys: unique(selected.map((row) => row.model)),
    enrichment_coverage: coverage(rows),
    non_finite_values: nonFiniteValues,
    observation_context: 'Existing observations were read; no new benchmark was run.',
  };
  let output;
  if (values.format === 'json') {
    output = `${JSON.stringify({ schema_version: 1, metadata, rows }, null, 2)}\n`;
  } else {
    const metricColumns = unique(
      rows.flatMap(({ benchmark }) =>
        Object.entries(benchmark.metrics)
          .filter(([, value]) => scalar(value))
          .map(([key]) => `metrics.${key}`),
      ),
    );
    const columns = [
      ...CSV_CONTEXT_COLUMNS,
      ...CSV_BENCHMARK_COLUMNS,
      ...metricColumns,
      ...CSV_ENRICHMENT_COLUMNS,
    ];
    const context = {
      package_version: PACKAGE_VERSION,
      query_url: benchmarkRequest,
      retrieved_at: retrievedAt,
      requested_model: values.model,
      requested_date: values.date ?? null,
      date_selection: values.date === undefined ? 'latest' : 'as-of',
      requested_benchmark_type: 'agentic_traces',
      ...Object.fromEntries(
        Object.entries(requestedFilters).map(([name, value]) => [`filter.${name}`, value ?? null]),
      ),
    };
    const lines = rows.map(({ benchmark, agentx }) => {
      const aggregateCells = Object.fromEntries(
        AGGREGATE_GROUPS.flatMap((group) =>
          [...PERCENTILE_FIELDS, 'n'].map((field) => [
            `aggregate.${group}.${field}`,
            agentx.aggregates.value?.[group]?.[field],
          ]),
        ),
      );
      const enrichment = {
        ...aggregateCells,
        'derived.p75_e2e_norm_intvty': agentx.derived_metrics.value?.p75_e2e_norm_intvty,
        'derived.p90_e2e_norm_intvty': agentx.derived_metrics.value?.p90_e2e_norm_intvty,
        'trace.available': agentx.trace_availability.value,
        'trace.response_key_present': agentx.trace_availability.response_key_present,
        'enrichment.status': agentx.status,
        'enrichment.aggregates_status': agentx.aggregates.status,
        'enrichment.derived_metrics_status': agentx.derived_metrics.status,
        'enrichment.trace_availability_status': agentx.trace_availability.status,
      };
      return [
        ...CSV_CONTEXT_COLUMNS.map((column) => context[column]),
        ...CSV_BENCHMARK_COLUMNS.map((column) => benchmark[column]),
        ...metricColumns.map((column) => {
          const value = benchmark.metrics[column.slice('metrics.'.length)];
          return scalar(value) ? value : null;
        }),
        ...CSV_ENRICHMENT_COLUMNS.map((column) => enrichment[column]),
      ]
        .map(csvCell)
        .join(',');
    });
    output = `${[columns.join(','), ...lines].join('\r\n')}\r\n`;
  }
  if (values.output === undefined) process.stdout.write(output);
  else await writeFile(values.output, output, 'utf8');
  process.stderr.write(`${JSON.stringify({ metadata })}\n`);
  process.stderr.write(
    `Selected ${metadata.selected_rows} AgentX rows from ${metadata.returned_rows} complete benchmark rows (${metadata.returned_agentx_rows} AgentX before raw-model selection).\n`,
  );
}

run().catch((error) => {
  process.stderr.write(`export-agentx: ${error.message}\n`);
  process.exitCode = 1;
});
