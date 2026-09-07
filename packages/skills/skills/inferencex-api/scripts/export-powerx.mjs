import process from 'node:process';
import { parseArgs } from 'node:util';

import { argumentError, isMain } from './cli-contract.mjs';
import { buildPowerxExport, POWERX_UNITS } from './export-contract.mjs';

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

// The same closed canonical options are validated before export and during offline replay.
export function normalizeArgs(args) {
  try {
    let values;
    if (Array.isArray(args)) {
      const parsed = parseArgs({
        args,
        options: {
          model: { type: 'string' },
          isl: { type: 'string' },
          osl: { type: 'string' },
          date: { type: 'string' },
          'raw-model': { type: 'string' },
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
        isl: positiveInteger(parsed.values.isl, 'isl'),
        osl: positiveInteger(parsed.values.osl, 'osl'),
        raw_model: parsed.values['raw-model'] ?? null,
        format: parsed.values.format ?? 'json',
      };
    } else {
      const keys = ['model', 'date', 'isl', 'osl', 'raw_model', 'format'];
      if (
        !args ||
        typeof args !== 'object' ||
        Object.keys(args).length !== keys.length ||
        keys.some((key) => !Object.hasOwn(args, key))
      ) {
        throw new Error('Invalid saved PowerX options');
      }
      values = { ...args };
    }
    if (typeof values.model !== 'string' || !values.model.trim()) {
      throw new Error('--model requires a display model name');
    }
    if (values.date !== null && !validDate(values.date)) {
      throw new Error('--date must be a valid YYYY-MM-DD date');
    }
    for (const key of ['isl', 'osl']) {
      if (!Number.isSafeInteger(values[key]) || values[key] <= 0) {
        throw new Error(`--${key} must be a positive integer`);
      }
    }
    if (
      values.raw_model !== null &&
      (typeof values.raw_model !== 'string' || !values.raw_model.trim())
    ) {
      throw new Error('--raw-model must be a non-empty key');
    }
    if (!['json', 'csv'].includes(values.format)) throw new Error('--format must be json or csv');
    return values;
  } catch (error) {
    throw argumentError(error.message);
  }
}

export async function collect(options, context) {
  const scope = normalizeArgs(options);
  const url = new URL('https://inferencex.semianalysis.com/api/v1/benchmarks');
  url.searchParams.set('model', scope.model);
  if (scope.date !== null) url.searchParams.set('date', scope.date);
  url.searchParams.set('powerValid', 'strictV2');
  const saved = await context.get({
    operation: 'benchmarks',
    url: url.href,
    allowedStatuses: [200],
  });
  const built = buildPowerxExport({
    producerVersion: context.producerVersion,
    format: scope.format,
    benchmarks: saved.body,
    scope,
    queryUrl: url.href,
    retrievedAt: saved.retrievedAt,
    contractVersion: 1,
    responseId: saved.id,
  });
  const hardware = new Map();
  let unavailable = 0;
  for (const row of built.rows) {
    const measured = Object.keys(POWERX_UNITS)
      .filter((key) => key.includes('power_w') || key.includes('joules_per_'))
      .some((key) => Number.isFinite(row.metrics[key]) && row.metrics[key] >= 0);
    if (!measured) unavailable++;
    hardware.set(row.hardware, (hardware.get(row.hardware) ?? 0) + Number(measured));
  }
  const excluded = built.metadata.excluded_rows.not_strict_v2;
  return {
    format: scope.format,
    bytes: built.outputBytes,
    coverage: {
      status:
        built.rows.length === 0 ? 'empty' : excluded + unavailable > 0 ? 'partial' : 'complete',
      selected_records: built.rows.length,
      comparable_pairs: null,
      hardware: [...hardware]
        .sort(([left], [right]) => left.localeCompare(right, 'en'))
        .map(([key, count]) => ({ hardware: key, valid_records: count })),
      reasons: [
        ...(excluded > 0 ? [{ code: 'not_strict_v2', count: excluded }] : []),
        ...(unavailable > 0 ? [{ code: 'measurement_unavailable', count: unavailable }] : []),
      ],
    },
  };
}

if (isMain(import.meta.url)) {
  process.stderr.write('export-powerx.mjs is internal. Use inferencex powerx export instead.\n');
  process.exitCode = 2;
}
