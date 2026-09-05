#!/usr/bin/env node

import { writeFile } from 'node:fs/promises';
import process from 'node:process';
import { parseArgs } from 'node:util';

// Installed skills run independently of package.json; the packed-artifact test checks this version.
const PACKAGE_VERSION = '0.1.0';
const HELP = `export-powerx — export validated single-turn PowerX observations

Requires Node 24 or later.

Usage:
  node export-powerx.mjs --model <display-name> --isl <tokens> --osl <tokens> [options]

Options:
  --date <YYYY-MM-DD>  As-of cutoff; omission selects latest available observations
  --raw-model <key>   Select an exact returned model key within the display bucket
  --format <format>   csv (default) or json
  --output <file>     Output file relative to the current directory; default stdout
  --help             Show this help without making a request

Requests powerValid=strictV2 and selects the exact single-turn workload locally.
Data goes to stdout or --output; request metadata and coverage go to stderr.
`;

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

function object(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

async function run(args = process.argv.slice(2)) {
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
  const isl = positiveInteger(values.isl, 'isl');
  const osl = positiveInteger(values.osl, 'osl');
  if (values.date !== undefined) {
    const date = new Date(`${values.date}T00:00:00Z`);
    if (
      !/^\d{4}-\d{2}-\d{2}$/u.test(values.date) ||
      !Number.isFinite(date.getTime()) ||
      date.toISOString().slice(0, 10) !== values.date
    ) {
      throw new Error('--date must be a valid YYYY-MM-DD date');
    }
  }
  if (values['raw-model'] !== undefined && !values['raw-model'].trim()) {
    throw new Error('--raw-model requires a returned model key');
  }
  if (!['csv', 'json'].includes(values.format)) throw new Error('--format must be csv or json');
  if (values.output !== undefined && !values.output.trim()) {
    throw new Error('--output requires a file path');
  }

  const url = new URL('https://inferencex.semianalysis.com/api/v1/benchmarks');
  url.searchParams.set('model', values.model);
  if (values.date !== undefined) url.searchParams.set('date', values.date);
  url.searchParams.set('powerValid', 'strictV2');
  const response = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    const detail = typeof body?.error === 'string' ? `: ${body.error.slice(0, 300)}` : '';
    throw new Error(`HTTP ${response.status}${detail} (${url.href})`);
  }
  let rows;
  try {
    rows = await response.json();
  } catch (error) {
    throw new Error(`Could not read benchmark JSON: ${error.message}`, { cause: error });
  }
  if (
    !Array.isArray(rows) ||
    rows.some(
      (row) =>
        !object(row) ||
        typeof row.model !== 'string' ||
        typeof row.benchmark_type !== 'string' ||
        !object(row.metrics),
    )
  ) {
    throw new Error(
      'Unexpected response shape: expected benchmark rows with model, benchmark_type, and metrics',
    );
  }
  const selected = rows.filter(
    (row) =>
      row.metrics.power_valid === 1 &&
      row.metrics.power_metric_schema_version === 2 &&
      row.benchmark_type === 'single_turn' &&
      row.isl === isl &&
      row.osl === osl &&
      (values['raw-model'] === undefined || row.model === values['raw-model']),
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
  const metadata = {
    package_version: PACKAGE_VERSION,
    query_url: url.href,
    retrieved_at: new Date().toISOString(),
    requested_model: values.model,
    requested_date: values.date ?? null,
    date_selection: values.date === undefined ? 'latest' : 'as-of',
    benchmark_type: 'single_turn',
    isl,
    osl,
    raw_model: values['raw-model'] ?? null,
    returned_rows: rows.length,
    selected_rows: observations.length,
    returned_models: [...new Set(rows.map((row) => row.model))].toSorted(),
    selected_models: [...new Set(observations.map((row) => row.model))].toSorted(),
    non_finite_values: nonFiniteValues,
  };
  let output;
  if (values.format === 'json') {
    output = `${JSON.stringify({ metadata, rows: observations }, null, 2)}\n`;
  } else {
    const requestColumns = [
      'package_version',
      'query_url',
      'retrieved_at',
      'requested_model',
      'requested_date',
      'date_selection',
      'raw_model',
    ];
    const columns = [...requestColumns, ...ROW_COLUMNS, ...METRIC_COLUMNS];
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
    output = `${[columns.join(','), ...lines].join('\r\n')}\r\n`;
  }
  if (values.output === undefined) process.stdout.write(output);
  else await writeFile(values.output, output, 'utf8');
  process.stderr.write(`${JSON.stringify({ metadata })}\n`);
  process.stderr.write(
    `Selected ${metadata.selected_rows} of ${metadata.returned_rows} returned rows. Raw models: ${metadata.selected_models.join(', ') || '(none)'}.\n`,
  );
  if (observations.length === 0) {
    process.stderr.write('No strictV2 rows matched the requested scope.\n');
  }
  if (nonFiniteValues > 0) {
    process.stderr.write(
      `Unavailable non-finite values: ${nonFiniteValues}; exported as null or blank.\n`,
    );
  }
}

run().catch((error) => {
  process.stderr.write(`export-powerx: ${error.message}\n`);
  process.exitCode = 1;
});
