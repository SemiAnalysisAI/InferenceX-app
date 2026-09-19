import { createHash } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import {
  argumentError,
  isMain,
  outputBoundary,
  responseBoundary,
  runCli,
  writeStdout,
} from './cli-contract.mjs';
import { normalizeFeedArgs, TCO_UNITS, validateFeed } from './compare-tco.mjs';
import { readBoundedRegular } from './local-files.mjs';

function options(args) {
  try {
    const parsed = parseArgs({
      args,
      strict: true,
      allowPositionals: false,
      tokens: true,
      options: Object.fromEntries(
        [
          'input',
          'model',
          'date',
          'workloads',
          'target',
          'hardware-a',
          'hardware-b',
          'report',
          'error-format',
        ].map((key) => [key, { type: 'string' }]),
      ),
    });
    const names = parsed.tokens.map((token) => token.name);
    if (new Set(names).size !== names.length) throw new Error('Specify each option only once');
    const values = parsed.values;
    if (!values.input) throw new Error('--input requires a saved complete points-feed response');
    const hardware = [values['hardware-a'], values['hardware-b']];
    if (
      hardware.some(
        (key) => typeof key !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_-]*$/u.test(key),
      ) ||
      hardware[0] === hardware[1]
    ) {
      throw new Error('--hardware-a and --hardware-b require two distinct exact hardware keys');
    }
    if (values.report === '') throw new Error('--report requires a new file path');
    return {
      input: values.input,
      report: values.report,
      hardware,
      scope: normalizeFeedArgs(values),
    };
  } catch (error) {
    throw argumentError(error.message, error);
  }
}

function pointStatus(point) {
  return point === null
    ? 'missing_point'
    : point.boundary === 'interpolated'
      ? point.output_tput_per_gpu === 0
        ? 'zero_throughput'
        : 'available'
      : point.boundary;
}

export function summarizeTco(feed, scope, hardware) {
  const points = validateFeed(
    feed,
    scope,
    scope.workloads,
    scope.target_output_tokens_per_second_per_user,
  );
  const comparisons = scope.workloads.map((workload) => {
    const [a, b] = hardware.map((key) => {
      const point = points.get(`${key}/${workload}`) ?? null;
      return { hardware: key, status: pointStatus(point), point };
    });
    const available = a.status === 'available' && b.status === 'available';
    const ratio = available ? a.point.output_tput_per_gpu / b.point.output_tput_per_gpu : null;
    if (ratio !== null && (!Number.isFinite(ratio) || ratio <= 0))
      throw new Error('TCO price boundary exceeds numeric range');
    return {
      workload,
      status: available ? 'available' : 'unavailable',
      a,
      b,
      price_a_over_b_at_equal_cost: ratio,
    };
  });
  return {
    kind: 'tco-missing-prices-summary',
    scope: {
      ...scope,
      hardware,
      db_model_keys: feed.db_model_keys,
      interactivity_statistic: 'median',
    },
    units: TCO_UNITS,
    price_status: 'missing',
    cost_winner: null,
    conclusion:
      'The cheaper hardware is undetermined. Supply both USD/GPU-hour rates and the intended billing scope to determine modeled cost.',
    comparisons,
  };
}

const text = (value) =>
  String(value).replaceAll(/[&<>`|]/gu, (character) => `&#${character.codePointAt(0)};`);

export function renderTcoSummary(summary) {
  const scope = summary.scope;
  const lines = [
    '# Conditional TCO comparison',
    '',
    summary.conclusion,
    '',
    `Model: ${text(scope.model)}. Median target: ${scope.target_output_tokens_per_second_per_user} ${summary.units.target_output_throughput}.`,
    `Date selection: ${scope.date ? `as of ${scope.date}` : 'latest available'}. Raw model keys: ${scope.db_model_keys.join(', ')}.`,
    '',
    '| Workload | Hardware | Point status | Output tok/s/GPU | Backing evidence dates |',
    '| --- | --- | --- | --- | --- |',
  ];
  for (const comparison of summary.comparisons) {
    for (const row of [comparison.a, comparison.b]) {
      const dates = row.point?.evidence_date;
      lines.push(
        `| ${comparison.workload} | ${row.hardware} | ${row.status} | ${row.point?.output_tput_per_gpu ?? 'missing'} | ${dates ? `${dates.from} to ${dates.to}` : 'unavailable'} |`,
      );
    }
  }
  lines.push('');
  for (const { workload, a, b, price_a_over_b_at_equal_cost: ratio } of summary.comparisons) {
    lines.push(
      ratio === null
        ? `${workload}: no price boundary is available for this pair.`
        : `${workload}: equal modeled cost at price(${a.hardware}) / price(${b.hardware}) = ${ratio}. ${a.hardware} is cheaper only below this ratio; ${b.hardware} only above it; equality is a tie.`,
    );
  }
  lines.push(
    '',
    'These are frontier rate estimates on the API-reported throughput basis. The feed pools configurations and supplies no observation IDs or verified whole-deployment GPU denominator. This comparison does not establish matched configurations, a tail-latency SLA, or whole-deployment cost.',
  );
  if (summary.source)
    lines.push(
      '',
      `Saved input: ${text(summary.source.path)}`,
      `SHA-256: ${summary.source.sha256}`,
    );
  return `${lines.join('\n')}\n`;
}

if (isMain(import.meta.url)) {
  await runCli({
    command: 'tco-summary',
    defaultErrorFormat: 'json',
    run: async ({ args, signal }) => {
      const selected = options(args);
      const bytes = await readBoundedRegular(selected.input, 32 * 1024 * 1024, 'TCO response', {
        signal,
      });
      const summary = await responseBoundary(
        () =>
          summarizeTco(
            JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)),
            selected.scope,
            selected.hardware,
          ),
        signal,
      );
      summary.source = {
        path: resolve(selected.input),
        decoded_bytes: bytes.length,
        sha256: createHash('sha256').update(bytes).digest('hex'),
      };
      summary.report_markdown = renderTcoSummary(summary);
      if (selected.report)
        await outputBoundary(
          () => writeFile(selected.report, summary.report_markdown, { flag: 'wx', signal }),
          signal,
        );
      await writeStdout(`${JSON.stringify(summary, null, 2)}\n`, { signal });
    },
  });
}
