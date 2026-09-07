import { responseError } from './cli-contract.mjs';

function validateProducer(version, format, contractVersion) {
  if (contractVersion !== 1) {
    throw responseError(`Unsupported export contract version: ${contractVersion}`);
  }
  if (!/^1\.\d+\.\d+$/u.test(version)) {
    throw responseError(`Unsupported export producer version: ${version}`);
  }
  if (!['json', 'csv'].includes(format))
    throw responseError(`Unsupported export format: ${format}`);
}

const ROW_COLUMNS = [
  'id',
  'model',
  'hardware',
  'framework',
  'image',
  'precision',
  'spec_method',
  'benchmark_type',
  'isl',
  'osl',
  'conc',
  'disagg',
  'is_multinode',
  'offload_mode',
  'recipe_fingerprint',
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
  'date',
  'workflow_run_id',
  'run_started_at',
  'run_url',
  'curve_date',
  'curve_workflow_run_id',
  'curve_run_started_at',
];

const METRIC_COLUMNS = [
  'power_valid',
  'power_metric_schema_version',
  'avg_power_w',
  'prefill_avg_power_w',
  'decode_avg_power_w',
  'joules_per_successful_query',
  'joules_per_input_token',
  'joules_per_output_token',
  'joules_per_total_token',
  'prefill_joules_per_input_token',
  'decode_joules_per_output_token',
  'avg_temp_c',
  'peak_temp_c',
  'avg_util_pct',
  'avg_mem_used_mb',
];

export const POWERX_UNITS = Object.freeze({
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
});
const POWERX_REQUEST_COLUMNS = [
  'package_version',
  'query_url',
  'retrieved_at',
  'requested_model',
  'requested_date',
  'date_selection',
  'raw_model',
];
export const POWERX_CSV_COLUMNS = Object.freeze([
  ...POWERX_REQUEST_COLUMNS,
  'source_response_id',
  ...ROW_COLUMNS,
  ...METRIC_COLUMNS,
]);

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
export const AGENTX_CSV_COLUMNS = Object.freeze([
  ...CSV_CONTEXT_COLUMNS,
  'source_response_ids',
  ...CSV_BENCHMARK_COLUMNS,
  'metrics_json',
  ...CSV_ENRICHMENT_COLUMNS,
]);

function csvCell(value) {
  if (value === null || value === undefined) return '';
  const text = String(value);
  return /[",\r\n]/u.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function object(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function validDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/u.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function powerxBenchmarkRow(row) {
  if (!object(row) || !object(row.metrics)) return false;
  return (
    (Number.isSafeInteger(row.id) || (typeof row.id === 'string' && row.id.trim().length > 0)) &&
    [
      'hardware',
      'framework',
      'model',
      'precision',
      'spec_method',
      'benchmark_type',
      'offload_mode',
      'date',
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
    ].every((key) => Number.isInteger(row[key])) &&
    ['isl', 'osl'].every((key) => row[key] === null || Number.isFinite(row[key])) &&
    ['image', 'run_url'].every((key) => row[key] === null || typeof row[key] === 'string') &&
    validDate(row.date) &&
    (row.curve_date === undefined || validDate(row.curve_date)) &&
    ['workflow_run_id', 'curve_workflow_run_id'].every(
      (key) =>
        row[key] === undefined || typeof row[key] === 'string' || Number.isSafeInteger(row[key]),
    ) &&
    ['run_started_at', 'curve_run_started_at'].every(
      (key) => row[key] === undefined || row[key] === null || typeof row[key] === 'string',
    )
  );
}

function unique(values) {
  return [...new Set(values)].toSorted();
}

function agentxBenchmarkRow(row) {
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
    ['workflow_run_id', 'curve_workflow_run_id'].every(
      (key) =>
        row[key] === undefined || typeof row[key] === 'string' || Number.isSafeInteger(row[key]),
    ) &&
    ['run_started_at', 'curve_run_started_at'].every(
      (key) => row[key] === undefined || row[key] === null || typeof row[key] === 'string',
    ) &&
    (row.curve_date === undefined || validDate(row.curve_date)) &&
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
  if (!object(value))
    throw responseError(`Unexpected ${operation} response shape: expected an object`);
  const result = new Map();
  const requested = new Set(requestedIds);
  for (const [key, entry] of Object.entries(value)) {
    const id = safeResultId(key);
    if (id === null || !requested.has(id)) {
      throw responseError(`Unexpected ${operation} result ID ${JSON.stringify(key)}`);
    }
    if (!validateEntry(entry, id)) {
      throw responseError(`Unexpected ${operation} response shape for result ID ${key}`);
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

// Inputs are parsed source rows and normalized scope; retrieval time comes from the caller.
export function buildPowerxExport({
  producerVersion,
  format,
  benchmarks,
  scope,
  queryUrl,
  retrievedAt,
  contractVersion,
  responseId,
}) {
  validateProducer(producerVersion, format, contractVersion);
  if (!/^[a-f\d]{64}$/u.test(responseId ?? '')) {
    throw responseError('PowerX contract 1 requires a captured response reference');
  }
  const rows = benchmarks;
  const { isl, osl } = scope;
  if (!Array.isArray(rows) || rows.some((row) => !powerxBenchmarkRow(row))) {
    throw responseError(
      'Unexpected response shape: expected benchmark rows with required identity, configuration, workload, date, run_url, and metrics fields',
    );
  }
  const scoped = rows.filter(
    (row) =>
      row.benchmark_type === 'single_turn' &&
      row.isl === isl &&
      row.osl === osl &&
      (scope.raw_model === null || row.model === scope.raw_model),
  );
  const selected = scoped.filter(
    (row) => row.metrics.power_valid === 1 && row.metrics.power_metric_schema_version === 2,
  );
  let nonFiniteValues = 0;
  const observations = JSON.parse(
    JSON.stringify(selected, (_key, value) => {
      if (typeof value === 'number' && !Number.isFinite(value)) {
        nonFiniteValues++;
        return null;
      }
      return value;
    }),
  );
  for (const row of observations) {
    for (const key of ['id', 'workflow_run_id', 'curve_workflow_run_id']) {
      if (row[key] !== undefined && row[key] !== null) row[key] = String(row[key]);
    }
  }
  const metadata = {
    package_version: producerVersion,
    query_url: queryUrl,
    retrieved_at: retrievedAt,
    requested_model: scope.model,
    requested_date: scope.date ?? null,
    date_selection: scope.date === null ? 'latest' : 'as-of',
    benchmark_type: 'single_turn',
    isl,
    osl,
    raw_model: scope.raw_model ?? null,
    returned_rows: rows.length,
    selected_rows: observations.length,
    returned_models: [...new Set(rows.map((row) => row.model))].toSorted(),
    selected_models: [...new Set(observations.map((row) => row.model))].toSorted(),
    excluded_rows: {
      outside_requested_scope: rows.length - scoped.length,
      not_strict_v2: scoped.length - selected.length,
    },
    metric_coverage: Object.fromEntries(
      METRIC_COLUMNS.filter(
        (key) => !['power_valid', 'power_metric_schema_version'].includes(key),
      ).map((key) => {
        const available = selected.filter((row) => Number.isFinite(row.metrics[key])).length;
        return [key, { available_rows: available, unavailable_rows: selected.length - available }];
      }),
    ),
    non_finite_values: nonFiniteValues,
    contract_version: 1,
    source_response_id: responseId,
  };
  let output;
  if (format === 'json') {
    const document = {
      schema_version: 1,
      kind: 'powerx',
      metadata,
      units: POWERX_UNITS,
      rows: observations,
    };
    output = `${JSON.stringify(document, null, 2)}\n`;
  } else {
    const requestColumns = [...POWERX_REQUEST_COLUMNS, 'source_response_id'];
    const lines = observations.map((row) =>
      [
        ...requestColumns.map((key) => metadata[key]),
        ...ROW_COLUMNS.map((key) => row[key]),
        ...METRIC_COLUMNS.map((key) =>
          typeof row.metrics[key] === 'number' && Number.isFinite(row.metrics[key])
            ? row.metrics[key]
            : null,
        ),
      ]
        .map(csvCell)
        .join(','),
    );
    output = `${[POWERX_CSV_COLUMNS.join(','), ...lines].join('\r\n')}\r\n`;
  }
  return { metadata, rows: observations, outputBytes: Buffer.from(output) };
}

// Validate the complete response before selecting rows or planning enrichment requests.
// Scope is the requested_scope object, with null for each omitted filter.
export function selectAgentxRows(benchmarks, scope) {
  if (!Array.isArray(benchmarks) || benchmarks.some((row) => !agentxBenchmarkRow(row))) {
    throw responseError(
      'Unexpected benchmarks response shape: expected complete rows with required identity, configuration, workload, date, run_url, and metrics fields',
    );
  }
  const agentxRows = benchmarks.filter((row) => row.benchmark_type === 'agentic_traces');
  const selected = agentxRows.filter((row) =>
    FILTERS.every(([name, field]) => scope[name] === null || row[field] === scope[name]),
  );
  const outcome =
    agentxRows.length === 0
      ? 'no_agentx_rows'
      : selected.length === 0
        ? 'no_matching_rows'
        : 'selected_rows';
  const ids = [...new Set(selected.map((row) => safeResultId(row.id)).filter((id) => id !== null))];
  return { benchmarks, agentxRows, selected, ids, outcome };
}

// Call after each response, before fetching the next chunk. Missing entries remain absent.
export function validateAgentxChunk(operation, requestedIds, parsedBody) {
  if (operation === 'agentic-aggregates') return aggregateMap(parsedBody, requestedIds);
  if (operation === 'derived-agentic-metrics') return derivedMap(parsedBody, requestedIds);
  if (operation === 'trace-availability') return traceMap(parsedBody, requestedIds);
  throw responseError(`Unsupported AgentX operation: ${operation}`);
}

// Maps contain the original entries returned by validateAgentxChunk, preserving extra fields.
export function buildAgentxExport({
  producerVersion,
  contractVersion,
  format,
  scope,
  selection,
  enrichments,
  requestUrls,
  retrievedAt,
}) {
  validateProducer(producerVersion, format, contractVersion);
  if (
    requestUrls.some(
      (request) =>
        !object(request) ||
        !/^[a-f\d]{64}$/u.test(request.response_id ?? '') ||
        typeof request.operation !== 'string' ||
        typeof request.url !== 'string',
    )
  ) {
    throw responseError('AgentX contract 1 requires a captured response reference per request');
  }
  const { benchmarks, agentxRows, selected, outcome } = selection;
  const { aggregates, derived, traces } = enrichments;
  const requestedScope = {
    display_model: scope.display_model,
    date: scope.date,
    date_selection: scope.date_selection,
    raw_model: scope.raw_model,
    hardware: scope.hardware,
    framework: scope.framework,
    precision: scope.precision,
    spec_method: scope.spec_method,
    offload_mode: scope.offload_mode,
    concurrency: scope.concurrency,
    benchmark_type: 'agentic_traces',
  };
  const filters = Object.fromEntries(
    FILTERS.map(([name]) => [
      name,
      { status: scope[name] === null ? 'omitted' : 'applied', value: scope[name] },
    ]),
  );
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
    for (const key of ['id', 'workflow_run_id', 'curve_workflow_run_id']) {
      if (benchmark[key] !== undefined && benchmark[key] !== null) {
        benchmark[key] = String(benchmark[key]);
      }
    }
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
    const aggregateValue = hasAggregates ? structuredClone(aggregates.get(id)) : null;
    const derivedValue = hasDerived ? structuredClone(derived.get(id)) : null;
    if (aggregateValue !== null) aggregateValue.id = String(aggregateValue.id);
    if (derivedValue !== null) derivedValue.id = String(derivedValue.id);
    return {
      benchmark,
      agentx: {
        status: hasAggregates && hasDerived ? 'complete' : 'partial',
        result_id: String(id),
        aggregates: {
          status: hasAggregates ? 'available' : 'not_returned',
          value: aggregateValue,
        },
        derived_metrics: {
          status: hasDerived ? 'available' : 'not_returned',
          value: derivedValue,
        },
        trace_availability: {
          status: traceAvailable ? 'stored_trace' : 'no_stored_trace',
          value: traceAvailable,
          response_key_present: hasTraceKey,
        },
      },
    };
  });
  const benchmarkRequest = requestUrls[0].url;
  const metadata = {
    package_version: producerVersion,
    retrieved_at: retrievedAt,
    request_urls: requestUrls,
    requested_scope: requestedScope,
    filters,
    outcome,
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
    contract_version: 1,
    source_response_ids: requestUrls.map((request) => request.response_id),
  };
  let output;
  if (format === 'json') {
    output = `${JSON.stringify({ schema_version: 1, kind: 'agentx', metadata, rows }, null, 2)}\n`;
  } else {
    const context = {
      package_version: producerVersion,
      query_url: benchmarkRequest,
      retrieved_at: retrievedAt,
      requested_model: scope.display_model,
      requested_date: scope.date ?? null,
      date_selection: scope.date === null ? 'latest' : 'as-of',
      requested_benchmark_type: 'agentic_traces',
      ...Object.fromEntries(FILTERS.map(([name]) => [`filter.${name}`, scope[name] ?? null])),
      source_response_ids: JSON.stringify(metadata.source_response_ids),
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
      const cells = [
        ...CSV_CONTEXT_COLUMNS.map((column) => context[column]),
        context.source_response_ids,
        ...CSV_BENCHMARK_COLUMNS.map((column) => benchmark[column]),
        JSON.stringify(benchmark.metrics),
        ...CSV_ENRICHMENT_COLUMNS.map((column) => enrichment[column]),
      ];
      return cells.map(csvCell).join(',');
    });
    output = `${[AGENTX_CSV_COLUMNS.map(csvCell).join(','), ...lines].join('\r\n')}\r\n`;
  }
  const outputBytes = Buffer.from(output);
  return { metadata, rows, outputBytes };
}
