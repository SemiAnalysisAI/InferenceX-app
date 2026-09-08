import process from 'node:process';
import { parseArgs } from 'node:util';

import { argumentError, isMain } from './cli-contract.mjs';
import {
  AGGREGATE_GROUPS,
  buildAgentxExport,
  selectAgentxRows,
  validateAgentxChunk,
} from './export-contract.mjs';

const API_ORIGIN = 'https://inferencex.semianalysis.com';

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

// The formal entry and offline verifier share this closed canonical options object.
export function normalizeArgs(args) {
  try {
    let values;
    if (Array.isArray(args)) {
      const parsed = parseArgs({
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
          format: { type: 'string' },
        },
        tokens: true,
        strict: true,
        allowPositionals: false,
      });
      const seen = new Set();
      for (const token of parsed.tokens) {
        if (seen.has(token.name)) throw new Error(`Duplicate option --${token.name}`);
        seen.add(token.name);
      }
      values = {
        model: parsed.values.model,
        date: parsed.values.date ?? null,
        raw_model: parsed.values['raw-model'] ?? null,
        hardware: parsed.values.hardware ?? null,
        framework: parsed.values.framework ?? null,
        precision: parsed.values.precision ?? null,
        spec_method: parsed.values['spec-method'] ?? null,
        offload_mode: parsed.values['offload-mode'] ?? null,
        concurrency:
          parsed.values.concurrency === undefined
            ? null
            : positiveInteger(parsed.values.concurrency, 'concurrency'),
        format: parsed.values.format ?? 'json',
      };
    } else {
      const keys = [
        'model',
        'date',
        'raw_model',
        'hardware',
        'framework',
        'precision',
        'spec_method',
        'offload_mode',
        'concurrency',
        'format',
      ];
      if (
        !args ||
        typeof args !== 'object' ||
        Array.isArray(args) ||
        Object.keys(args).length !== keys.length ||
        keys.some((key) => !Object.hasOwn(args, key))
      ) {
        throw new Error('Invalid saved AgentX options');
      }
      values = { ...args };
    }
    if (typeof values.model !== 'string' || !values.model.trim()) {
      throw new Error('--model requires a display model name');
    }
    if (values.date !== null && !validDate(values.date)) {
      throw new Error('--date must be a valid YYYY-MM-DD date');
    }
    for (const [key, option] of [
      ['raw_model', 'raw-model'],
      ['hardware', 'hardware'],
      ['framework', 'framework'],
      ['precision', 'precision'],
      ['spec_method', 'spec-method'],
      ['offload_mode', 'offload-mode'],
    ]) {
      if (values[key] !== null && (typeof values[key] !== 'string' || !values[key].trim())) {
        throw new Error(`--${option} requires a non-empty key`);
      }
    }
    if (
      values.concurrency !== null &&
      (!Number.isSafeInteger(values.concurrency) || values.concurrency <= 0)
    ) {
      throw new Error('--concurrency must be a positive integer');
    }
    if (!['json', 'csv'].includes(values.format)) throw new Error('--format must be json or csv');
    return values;
  } catch (error) {
    throw argumentError(error.message, error);
  }
}

async function collectChunks(operation, ids, limit, get, requestUrls) {
  const joined = new Map();
  for (let offset = 0; offset < ids.length; offset += limit) {
    const chunk = ids.slice(offset, offset + limit);
    const url = new URL(`/api/v1/${operation}`, API_ORIGIN);
    url.searchParams.set('ids', chunk.join(','));
    const saved = await get({ operation, url: url.href, allowedStatuses: [200] });
    requestUrls.push({
      operation,
      url: url.href,
      response_id: saved.id,
      requested_ids: chunk.map(String),
    });
    const entries = validateAgentxChunk(operation, chunk, saved.body);
    for (const [id, value] of entries) joined.set(id, value);
  }
  return joined;
}

export async function collect(options, context) {
  const normalized = normalizeArgs(options);
  const scope = {
    display_model: normalized.model,
    date: normalized.date,
    date_selection: normalized.date === null ? 'latest' : 'as-of',
    raw_model: normalized.raw_model,
    hardware: normalized.hardware,
    framework: normalized.framework,
    precision: normalized.precision,
    spec_method: normalized.spec_method,
    offload_mode: normalized.offload_mode,
    concurrency: normalized.concurrency,
    benchmark_type: 'agentic_traces',
  };
  const benchmarkUrl = new URL('/api/v1/benchmarks', API_ORIGIN);
  benchmarkUrl.searchParams.set('model', normalized.model);
  if (normalized.date !== null) benchmarkUrl.searchParams.set('date', normalized.date);
  const benchmark = await context.get({
    operation: 'benchmarks',
    url: benchmarkUrl.href,
    allowedStatuses: [200],
  });
  const requestUrls = [
    { operation: 'benchmarks', url: benchmarkUrl.href, response_id: benchmark.id },
  ];
  const selection = selectAgentxRows(benchmark.body, scope);
  const aggregates = await collectChunks(
    'agentic-aggregates',
    selection.ids,
    200,
    context.get,
    requestUrls,
  );
  const derived = await collectChunks(
    'derived-agentic-metrics',
    selection.ids,
    200,
    context.get,
    requestUrls,
  );
  const traces = await collectChunks(
    'trace-availability',
    selection.ids,
    500,
    context.get,
    requestUrls,
  );
  const built = buildAgentxExport({
    producerVersion: context.producerVersion,
    contractVersion: 1,
    format: normalized.format,
    scope,
    selection,
    enrichments: { aggregates, derived, traces },
    requestUrls,
    retrievedAt: benchmark.retrievedAt,
  });
  const hardware = new Map();
  let unavailable = 0;
  for (const row of built.rows) {
    const usable =
      row.agentx.aggregates.status === 'available' &&
      AGGREGATE_GROUPS.some((group) => row.agentx.aggregates.value[group]?.n > 0);
    hardware.set(
      row.benchmark.hardware,
      (hardware.get(row.benchmark.hardware) ?? 0) + Number(usable),
    );
    if (!usable) unavailable++;
  }
  return {
    format: normalized.format,
    bytes: built.outputBytes,
    coverage: {
      status: built.rows.length === 0 ? 'empty' : unavailable > 0 ? 'partial' : 'complete',
      selected_records: built.rows.length,
      comparable_pairs: null,
      hardware: [...hardware]
        .sort(([left], [right]) => left.localeCompare(right, 'en'))
        .map(([key, count]) => ({ hardware: key, valid_records: count })),
      reasons: unavailable > 0 ? [{ code: 'aggregate_unavailable', count: unavailable }] : [],
    },
  };
}

if (isMain(import.meta.url)) {
  process.stderr.write('export-agentx.mjs is internal. Use inferencex agentx export instead.\n');
  process.exitCode = 2;
}
