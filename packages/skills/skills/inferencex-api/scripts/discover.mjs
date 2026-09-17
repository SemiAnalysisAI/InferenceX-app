import { readFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';

import { argumentError, responseError } from './cli-contract.mjs';
import { allCommandDescriptions } from './commands.mjs';

const API_ORIGIN = 'https://inferencex.semianalysis.com';
const RESOURCES = new Set(['capabilities', 'models', 'dates', 'datasets', 'configs']);
const PAGINATION_LIMITATION =
  'Items are sliced locally from one fetched snapshot; this is not stable server pagination.';

function object(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function date(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/u.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().startsWith(value);
}

function integer(value, name, { minimum, maximum }) {
  const text = typeof value === 'number' ? String(value) : value;
  if (!/^(?:0|[1-9]\d*)$/u.test(text ?? '')) {
    throw argumentError(`--${name} requires an integer.`);
  }
  const parsed = Number(text);
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw argumentError(`--${name} must be from ${minimum} to ${maximum}.`);
  }
  return parsed;
}

export function normalizeArgs(argsOrCanonical) {
  let input;
  if (Array.isArray(argsOrCanonical)) {
    let parsed;
    try {
      parsed = parseArgs({
        args: argsOrCanonical,
        options: {
          model: { type: 'string' },
          date: { type: 'string' },
          limit: { type: 'string' },
          offset: { type: 'string' },
        },
        strict: true,
        allowPositionals: true,
        tokens: true,
      });
    } catch (error) {
      throw argumentError(error.message, error);
    }
    if (parsed.positionals.length !== 1) {
      throw argumentError('discover requires one resource.');
    }
    const names = parsed.tokens.filter(({ kind }) => kind === 'option').map(({ name }) => name);
    if (new Set(names).size !== names.length) {
      throw argumentError('Specify each discovery option only once.');
    }
    input = { resource: parsed.positionals[0], ...parsed.values };
  } else if (object(argsOrCanonical)) {
    const allowed = new Set(['resource', 'model', 'date', 'limit', 'offset']);
    if (Object.keys(argsOrCanonical).some((key) => !allowed.has(key))) {
      throw argumentError('Discovery options contain an unknown field.');
    }
    input = argsOrCanonical;
  } else {
    throw argumentError('Discovery options must be arguments or a canonical object.');
  }

  if (!RESOURCES.has(input.resource)) {
    throw argumentError(`Choose a discovery resource: ${[...RESOURCES].join(', ')}.`);
  }
  if (input.model !== undefined && input.model !== null && typeof input.model !== 'string') {
    throw argumentError('--model requires a value.');
  }
  const model = input.model === undefined || input.model === null ? null : input.model.trim();
  if (model !== null && model.length === 0) throw argumentError('--model requires a value.');
  const requestedDate = input.date ?? null;
  if (requestedDate !== null && !date(requestedDate)) {
    throw argumentError('--date requires a real YYYY-MM-DD date.');
  }
  const needsModel = ['dates', 'configs'].includes(input.resource);
  if (needsModel && model === null) {
    throw argumentError(`discover ${input.resource} requires --model.`);
  }
  if (!needsModel && model !== null) {
    throw argumentError(`--model does not apply to discover ${input.resource}.`);
  }
  if (input.resource !== 'configs' && requestedDate !== null) {
    throw argumentError(`--date does not apply to discover ${input.resource}.`);
  }
  return {
    resource: input.resource,
    model,
    date: requestedDate,
    limit: integer(input.limit ?? 100, 'limit', { minimum: 1, maximum: 1_000 }),
    offset: integer(input.offset ?? 0, 'offset', { minimum: 0, maximum: Number.MAX_SAFE_INTEGER }),
  };
}

function availabilityRow(row) {
  return (
    object(row) &&
    ['model', 'precision', 'hardware', 'framework', 'spec_method', 'benchmark_type'].every(
      (key) => typeof row[key] === 'string',
    ) &&
    ['isl', 'osl'].every((key) => row[key] === null || Number.isFinite(row[key])) &&
    typeof row.disagg === 'boolean' &&
    date(row.date)
  );
}

function datasetRow(row) {
  return (
    object(row) &&
    ['id', 'slug', 'label', 'variant', 'ingested_at'].every(
      (key) => typeof row[key] === 'string',
    ) &&
    ['description', 'hf_url', 'license'].every(
      (key) => row[key] === null || typeof row[key] === 'string',
    ) &&
    Number.isInteger(row.conversation_count) &&
    row.conversation_count >= 0 &&
    object(row.summary) &&
    Number.isFinite(Date.parse(row.ingested_at))
  );
}

const BENCHMARK_STRINGS = [
  'hardware',
  'framework',
  'model',
  'precision',
  'spec_method',
  'benchmark_type',
  'offload_mode',
];
const BENCHMARK_BOOLEANS = [
  'disagg',
  'is_multinode',
  'prefill_dp_attention',
  'decode_dp_attention',
];
const BENCHMARK_INTEGERS = [
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

function resultId(value) {
  return (
    (typeof value === 'string' && /^[1-9]\d*$/u.test(value)) ||
    (Number.isSafeInteger(value) && value > 0)
  );
}

function optionalId(value) {
  return value === undefined || value === null || resultId(value);
}

function benchmarkRow(row) {
  return (
    object(row) &&
    resultId(row.id) &&
    BENCHMARK_STRINGS.every((key) => typeof row[key] === 'string') &&
    BENCHMARK_BOOLEANS.every((key) => typeof row[key] === 'boolean') &&
    BENCHMARK_INTEGERS.every((key) => Number.isInteger(row[key])) &&
    ['isl', 'osl'].every((key) => row[key] === null || Number.isFinite(row[key])) &&
    ['image', 'recipe_fingerprint', 'run_url'].every(
      (key) => row[key] === null || typeof row[key] === 'string',
    ) &&
    optionalId(row.workflow_run_id) &&
    optionalId(row.curve_workflow_run_id) &&
    ['run_started_at', 'curve_run_started_at'].every(
      (key) => row[key] === undefined || row[key] === null || typeof row[key] === 'string',
    ) &&
    (row.curve_date === undefined || date(row.curve_date)) &&
    object(row.metrics) &&
    date(row.date)
  );
}

function validateRows(body, validate, name) {
  if (!Array.isArray(body) || body.some((row) => !validate(row))) {
    throw responseError(`Unexpected ${name} response shape.`);
  }
  return body;
}

function responseSource(response, operation, url, scope) {
  return {
    kind: 'http_response',
    operation,
    url,
    response_id: response.id,
    status: response.status,
    retrieved_at: response.retrievedAt,
    scope,
  };
}

function page(options, allItems) {
  const items = allItems.slice(options.offset, options.offset + options.limit);
  return {
    items,
    coverage: {
      complete_for_scope: options.offset === 0 && items.length === allItems.length,
      returned_items: items.length,
      available_items: allItems.length,
      limit: options.limit,
      offset: options.offset,
      limitations: [PAGINATION_LIMITATION],
    },
  };
}

function compare(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function document(options, scope, allItems, sources, limitations = []) {
  const projected = page(options, allItems);
  return {
    schema_version: 1,
    kind: options.resource,
    scope,
    items: projected.items,
    sources,
    coverage: {
      ...projected.coverage,
      limitations: [...projected.coverage.limitations, ...limitations],
    },
  };
}

async function availability(options, get) {
  const url = `${API_ORIGIN}/api/v1/availability`;
  const response = await get({ operation: 'availability', url, allowedStatuses: [200] });
  const rows = validateRows(response.body, availabilityRow, 'availability');
  const allItems =
    options.resource === 'models'
      ? [...new Set(rows.map((row) => row.model))]
          .toSorted(compare)
          .map((raw_model) => ({ raw_model }))
      : [...new Set(rows.filter((row) => row.model === options.model).map((row) => row.date))]
          .toSorted(compare)
          .map((value) => ({ date: value }));
  return {
    ...page(options, allItems),
    source: responseSource(response, 'availability', url, {
      raw_model: options.resource === 'dates' ? options.model : null,
    }),
  };
}

function modelSelectors(body) {
  const parameters = body?.paths?.['/api/v1/benchmarks']?.get?.parameters;
  const parameter = Array.isArray(parameters)
    ? parameters.find((value) => value?.name === 'model' && value?.in === 'query')
    : null;
  const values = parameter?.schema?.enum;
  if (
    !Array.isArray(values) ||
    values.length === 0 ||
    values.some((value) => typeof value !== 'string')
  ) {
    throw responseError('OpenAPI does not expose the benchmarks model selector contract.');
  }
  return [...new Set(values)].toSorted(compare);
}

function power(row) {
  const powerValid = row.metrics.power_valid;
  const schemaVersion = row.metrics.power_metric_schema_version;
  const known = powerValid !== undefined || schemaVersion !== undefined;
  return {
    strict_v2:
      powerValid === 1 && schemaVersion === 2 ? 'eligible' : known ? 'ineligible' : 'unknown',
    power_valid: Number.isFinite(powerValid) ? powerValid : null,
    schema_version: Number.isFinite(schemaVersion) ? schemaVersion : null,
  };
}

function id(value) {
  return value === undefined || value === null ? null : String(value);
}

function configItem(row) {
  return {
    result_id: String(row.id),
    raw_model: row.model,
    hardware: row.hardware,
    workload: {
      benchmark_type: row.benchmark_type,
      input_tokens: row.isl,
      output_tokens: row.osl,
    },
    framework: row.framework,
    precision: row.precision,
    concurrency: row.conc,
    topology: {
      disaggregated: row.disagg,
      multi_node: row.is_multinode,
      prefill: {
        tensor_parallel: row.prefill_tp,
        expert_parallel: row.prefill_ep,
        data_parallel_attention: row.prefill_dp_attention,
        workers: row.prefill_num_workers,
        gpus: row.num_prefill_gpu,
      },
      decode: {
        tensor_parallel: row.decode_tp,
        expert_parallel: row.decode_ep,
        data_parallel_attention: row.decode_dp_attention,
        workers: row.decode_num_workers,
        gpus: row.num_decode_gpu,
      },
    },
    configuration: {
      speculative_method: row.spec_method,
      offload_mode: row.offload_mode,
      image: row.image,
      recipe_fingerprint: row.recipe_fingerprint,
    },
    observation_date: row.date,
    producer: {
      workflow_run_id: id(row.workflow_run_id),
      run_started_at: row.run_started_at ?? null,
      run_url: row.run_url,
      curve_date: row.curve_date ?? null,
      curve_workflow_run_id: id(row.curve_workflow_run_id),
      curve_run_started_at: row.curve_run_started_at ?? null,
    },
    power: power(row),
    trace: { availability: 'unknown' },
  };
}

function compareConfigs(left, right) {
  for (const value of [
    compare(left.hardware, right.hardware),
    compare(left.precision, right.precision),
    compare(left.framework, right.framework),
    compare(left.raw_model, right.raw_model),
    compare(JSON.stringify(left.workload), JSON.stringify(right.workload)),
    left.concurrency - right.concurrency,
    compare(left.result_id, right.result_id),
  ]) {
    if (value !== 0) return value;
  }
  return 0;
}

async function configs(options, get, signal) {
  const openapiUrl = `${API_ORIGIN}/api/openapi.json`;
  const openapiResponse = await get({
    operation: 'openapi',
    url: openapiUrl,
    allowedStatuses: [200],
  });
  const selectors = modelSelectors(openapiResponse.body);
  const openapiSource = responseSource(openapiResponse, 'openapi', openapiUrl, {
    contract: 'GET /api/v1/benchmarks model query parameter',
  });
  signal?.throwIfAborted();
  if (!selectors.includes(options.model)) {
    const scope = {
      requested_model: options.model,
      model_selector: null,
      requested_date: options.date,
      date_selection: options.date === null ? 'latest' : 'as-of',
    };
    return {
      schema_version: 1,
      kind: options.resource,
      scope,
      items: [],
      sources: [openapiSource],
      coverage: {
        complete_for_scope: false,
        returned_items: 0,
        available_items: null,
        limit: options.limit,
        offset: options.offset,
        limitations: [
          `${options.model} cannot be resolved to a public model selector from the consumed OpenAPI contract.`,
        ],
      },
    };
  }

  const url = new URL('/api/v1/benchmarks', API_ORIGIN);
  url.searchParams.set('model', options.model);
  if (options.date !== null) url.searchParams.set('date', options.date);
  const response = await get({ operation: 'benchmarks', url: url.href, allowedStatuses: [200] });
  const rows = validateRows(response.body, benchmarkRow, 'benchmarks');
  const scope = {
    requested_model: options.model,
    model_selector: options.model,
    requested_date: options.date,
    date_selection: options.date === null ? 'latest' : 'as-of',
  };
  return document(
    options,
    scope,
    rows.map(configItem).toSorted(compareConfigs),
    [openapiSource, responseSource(response, 'benchmarks', url.href, scope)],
    ['Trace availability is unknown because discovery does not request stored traces.'],
  );
}

async function datasets(options, get) {
  const url = `${API_ORIGIN}/api/v1/datasets`;
  const response = await get({ operation: 'datasets', url, allowedStatuses: [200] });
  const rows = validateRows(response.body, datasetRow, 'datasets').toSorted((left, right) =>
    compare(left.slug, right.slug),
  );
  return document(
    options,
    { registry: 'datasets' },
    rows,
    [responseSource(response, 'datasets', url, { registry: 'datasets' })],
    ['Dataset discovery reads registry records only; conversations are not requested.'],
  );
}

async function capabilities(options) {
  const schemas = JSON.parse(await readFile(new URL('../schemas.json', import.meta.url), 'utf8'));
  if (!object(schemas)) throw responseError('Installed schema registry is invalid.');
  const items = [
    ...allCommandDescriptions().map((entry) => ({ type: 'command', ...entry })),
    ...Object.keys(schemas)
      .toSorted(compare)
      .map((name) => ({ type: 'schema', name })),
  ].toSorted((left, right) =>
    compare(
      `${left.type}:${left.command ?? left.name}`,
      `${right.type}:${right.command ?? right.name}`,
    ),
  );
  return document(options, { installation: 'current_package' }, items, [
    {
      kind: 'local_registry',
      path: 'scripts/commands.mjs',
      scope: { installation: 'current_package' },
    },
    { kind: 'local_registry', path: 'schemas.json', scope: { installation: 'current_package' } },
  ]);
}

export async function discover(options, { get, signal } = {}) {
  const normalized = normalizeArgs(options);
  signal?.throwIfAborted();
  if (typeof get !== 'function' && normalized.resource !== 'capabilities') {
    throw new TypeError('discover requires get()');
  }
  if (['models', 'dates'].includes(normalized.resource)) {
    const projected = await availability(normalized, get);
    signal?.throwIfAborted();
    return {
      schema_version: 1,
      kind: normalized.resource,
      scope: {
        raw_model: normalized.resource === 'dates' ? normalized.model : null,
      },
      items: projected.items,
      sources: [projected.source],
      coverage: projected.coverage,
    };
  }
  if (normalized.resource === 'configs') return configs(normalized, get, signal);
  if (normalized.resource === 'datasets') return datasets(normalized, get);
  return capabilities(normalized);
}
