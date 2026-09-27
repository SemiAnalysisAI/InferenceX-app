import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';

import { MAX_ROWS, barChart, format, tableImage, xml } from './chart-layout.mjs';
import { CliError, argumentError, responseError } from './cli-contract.mjs';
import { readBoundedRegular } from './local-files.mjs';

const METRICS = [
  ['isl', 'Input length', 'tokens'],
  ['osl', 'Output length', 'tokens'],
  ['e2e_ms', 'Completed request E2E', 'ms'],
  ['ttft_ms', 'Completed request TTFT', 'ms'],
];
// One focused chart per metric; `requests` is the default view.
const IMAGE_METRICS = {
  requests: { title: 'Requests by recorded source' },
  'input-tokens': {
    key: 'isl',
    title: 'Median input length by recorded source',
    unit: 'tokens, including cancelled requests',
    format: format.quantity,
  },
  'output-tokens': {
    key: 'osl',
    title: 'Median output length by recorded source',
    unit: 'tokens, including cancelled requests',
    format: format.quantity,
  },
  e2e: {
    key: 'e2e_ms',
    title: 'Median end-to-end latency by recorded source',
    unit: 'completed requests',
    format: format.duration,
  },
  ttft: {
    key: 'ttft_ms',
    title: 'Median time to first token by recorded source',
    unit: 'completed requests',
    format: format.duration,
  },
};
const object = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const nonnegative = (value) => typeof value === 'number' && Number.isFinite(value) && value >= 0;
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

export function chartTemplates() {
  return {
    schema_version: 1,
    templates: [
      {
        id: 'agentx-sources',
        status: 'available',
        chart: 'One metric by recorded srcKind; the layout adapts from 1 to 40 sources',
        table: 'SVG table of counts, share and medians, plus detailed Markdown and summary CSV',
        metrics: Object.keys(IMAGE_METRICS),
        default_metric: 'requests',
        styles: ['chart', 'table', 'both'],
        input: 'Saved selected-point capture from references/agentx.md',
        command: 'inferencex charts agentx-sources --input selected-point.json --output-dir charts',
      },
      {
        id: 'agentx-timeline',
        status: 'recipe_only',
        chart: 'Request timeline for one measured point',
        reference: 'references/agentx.md',
        input: 'One selected result with a stored request timeline',
      },
      {
        id: 'dataset-distributions',
        status: 'recommendation_only',
        chart: 'Dataset token-length distributions',
        input: 'Dataset token-length distributions; not measured latency',
        requirement:
          'Discover documented dataset data and supply a custom renderer; no bundled rendering recipe.',
      },
    ],
  };
}

export function normalizeChartArgs(args, outputDir) {
  let parsed;
  try {
    parsed = parseArgs({
      args,
      options: {
        input: { type: 'string' },
        phase: { type: 'string' },
        style: { type: 'string' },
        metric: { type: 'string' },
      },
      allowPositionals: true,
      strict: true,
      tokens: true,
    });
  } catch (error) {
    throw argumentError(error.message, error);
  }
  const { values, positionals, tokens } = parsed;
  const names = tokens.filter((token) => token.kind === 'option').map((token) => token.name);
  if (new Set(names).size !== names.length)
    throw argumentError('Specify each chart option only once.');
  if (positionals.length !== 1) throw argumentError('Choose charts list or charts agentx-sources.');
  if (positionals[0] === 'list') {
    if (names.length > 0 || outputDir !== null)
      throw argumentError('charts list accepts no options.');
    return { template: 'list' };
  }
  if (positionals[0] !== 'agentx-sources')
    throw argumentError('Unknown chart template; use charts list.');
  if (!values.input?.trim() || !outputDir)
    throw argumentError('charts agentx-sources requires --input and --output-dir.');
  const phase = values.phase ?? 'all';
  if (!['all', 'profiling', 'warmup'].includes(phase))
    throw argumentError('--phase must be all, profiling, or warmup.');
  const style = values.style ?? 'both';
  if (!['chart', 'table', 'both'].includes(style))
    throw argumentError('--style must be chart, table, or both.');
  const metric = values.metric ?? 'requests';
  if (!Object.hasOwn(IMAGE_METRICS, metric))
    throw argumentError(`--metric must be ${Object.keys(IMAGE_METRICS).join(', ')}.`);
  return { template: 'agentx-sources', input: values.input, outputDir, phase, style, metric };
}

function parseCapture(capture) {
  const id = capture?.metadata?.selected_result_id;
  if (
    !object(capture) ||
    capture.outcome !== 'trace_diagnostics' ||
    !/^[1-9]\d*$/u.test(String(id)) ||
    !Number.isSafeInteger(Number(id)) ||
    String(capture.selected_point?.id) !== String(id) ||
    capture.trace_availability?.available !== true ||
    !Array.isArray(capture.metadata.requests)
  ) {
    throw responseError(
      'Expected a complete selected-point capture with a matching result ID and available trace.',
    );
  }
  const sources = capture.metadata.requests.filter((entry) => {
    try {
      return new URL(entry.query_url).pathname === '/api/v1/request-timeline';
    } catch {
      return false;
    }
  });
  if (sources.length !== 1)
    throw responseError('Capture must contain exactly one raw request-timeline response.');
  const source = sources[0];
  const url = new URL(source.query_url);
  if (
    url.origin !== 'https://inferencex.semianalysis.com' ||
    url.username ||
    url.password ||
    url.hash ||
    url.searchParams.get('id') !== String(id) ||
    [...url.searchParams.keys()].length !== 1 ||
    !Number.isFinite(Date.parse(source.retrieved_at)) ||
    typeof source.body_utf8 !== 'string'
  )
    throw responseError('Timeline source URL, result ID, or capture time is invalid.');
  let timeline;
  try {
    timeline = JSON.parse(source.body_utf8);
  } catch (error) {
    throw responseError('Invalid captured timeline JSON.', error);
  }
  if (
    !object(timeline) ||
    !Number.isInteger(timeline.version) ||
    timeline.version < 1 ||
    !Array.isArray(timeline.requests) ||
    JSON.stringify(timeline) !== JSON.stringify(capture.timeline)
  ) {
    throw responseError(
      'Timeline must match the complete retained response; filtered or edited copies are not accepted.',
    );
  }
  for (const row of timeline.requests) {
    if (
      !object(row) ||
      typeof row.cid !== 'string' ||
      !Number.isInteger(row.ti) ||
      row.ti < 0 ||
      typeof row.wid !== 'string' ||
      (row.ri !== undefined && (!Number.isSafeInteger(row.ri) || row.ri < 0)) ||
      typeof row.phase !== 'string' ||
      typeof row.cancelled !== 'boolean' ||
      !Number.isSafeInteger(row.start) ||
      row.start < 0 ||
      !Number.isSafeInteger(row.end) ||
      row.end < row.start ||
      ['isl', 'osl', 'ttftMs'].some((key) => row[key] !== null && !nonnegative(row[key])) ||
      (row.srcKind !== undefined && typeof row.srcKind !== 'string')
    ) {
      throw responseError(
        'Timeline contains a malformed request. Expected recorded identities, timing, source, nullable lengths/TTFT and cancellation status.',
      );
    }
  }
  return { id: String(id), source, timeline };
}

function distribution(values, excludedCancelled, total) {
  const sorted = values.filter(nonnegative).toSorted((a, b) => a - b);
  const quantile = (fraction) => {
    if (sorted.length === 0) return null;
    const index = (sorted.length - 1) * fraction;
    const lower = Math.floor(index);
    return sorted[lower] + (sorted[Math.ceil(index)] - sorted[lower]) * (index - lower);
  };
  return {
    valid_count: sorted.length,
    missing_count: total - sorted.length - excludedCancelled,
    excluded_cancelled_count: excludedCancelled,
    min: sorted[0] ?? null,
    p25: quantile(0.25),
    median: quantile(0.5),
    p75: quantile(0.75),
    p95: quantile(0.95),
    max: sorted.at(-1) ?? null,
  };
}

export function summarizeSources(capture, phase = 'all') {
  const { id, source, timeline } = parseCapture(capture);
  const selected = timeline.requests.filter((row) => phase === 'all' || row.phase === phase);
  const rows = selected.map((row) => ({
    cid: row.cid,
    ri: row.ri ?? null,
    ti: row.ti,
    wid: row.wid,
    phase: row.phase,
    source_category: row.srcKind?.trim() ? row.srcKind : null,
    cancelled: row.cancelled,
    isl: row.isl,
    osl: row.osl,
    e2e_ms: row.cancelled ? null : (row.end - row.start) / 1e6,
    ttft_ms: row.cancelled ? null : row.ttftMs,
  }));
  const categories = [...new Set(rows.map((row) => row.source_category))].sort((a, b) =>
    a === null ? 1 : b === null ? -1 : a < b ? -1 : a > b ? 1 : 0,
  );
  if (categories.length > 40)
    throw responseError('Source chart supports at most 40 recorded categories.');
  const groups = categories.map((category) => {
    const members = rows.filter((row) => row.source_category === category);
    const cancelled = members.filter((row) => row.cancelled).length;
    return {
      source_category: category,
      request_count: members.length,
      request_share: members.length / rows.length,
      cancelled_count: cancelled,
      metrics: Object.fromEntries(
        METRICS.map(([key]) => [
          key,
          distribution(
            members.map((row) => row[key]),
            key.endsWith('_ms') ? cancelled : 0,
            members.length,
          ),
        ]),
      ),
    };
  });
  return {
    summary: {
      schema_version: 1,
      template: 'agentx-sources',
      formal_evidence_bundle: false,
      source: {
        selected_result_id: id,
        query_url: source.query_url,
        retrieved_at: source.retrieved_at,
        timeline_sha256: sha256(source.body_utf8),
        timeline_version: timeline.version,
      },
      scope: {
        population:
          'Requests in the retained response for one result; not the source dataset or all AgentX runs',
        completeness:
          'All captured rows are processed; upstream sampling or omissions are not independently verified',
        phase,
        available_phases: [...new Set(timeline.requests.map((row) => row.phase))].sort(),
        captured_request_count: timeline.requests.length,
        selected_request_count: rows.length,
        excluded_phase_count: timeline.requests.length - rows.length,
        missing_source_count: rows.filter((row) => row.source_category === null).length,
        cancelled_request_count: rows.filter((row) => row.cancelled).length,
      },
      methodology: {
        grouping:
          'Exact recorded srcKind; missing or blank is a separate null category. No main/subagent role is inferred.',
        chart_scale:
          'Linear bars from zero; one metric per chart and counts plus medians in the table image. Image latency uses readable units; detailed statistics retain ms.',
        quantiles: 'Linear interpolation at (n - 1) * p over sorted valid observations (R type 7)',
        tokens:
          'ISL/OSL tokens include cancelled requests when recorded; null is missing, zero is retained',
        latency:
          'Completed requests only: E2E=(end-start)/1e6 ms; TTFT=ttftMs. Cancelled requests excluded, not zero-filled.',
        interpretation:
          'Descriptive distributions; source differences do not establish subagent overhead or causation.',
      },
      groups,
    },
    rows,
  };
}

const number = (value) =>
  value === null ? 'unavailable' : value.toLocaleString('en-US', { maximumSignificantDigits: 4 });
const categoryLabel = (value) => (value === null ? '(source missing)' : `srcKind: ${value}`);

const sourceName = (value) => (value === null ? '(source missing)' : value);
const unavailable = (stats) =>
  stats.excluded_cancelled_count > 0 && stats.missing_count === 0
    ? 'all cancelled'
    : 'not recorded';

// Shared framing for chart and table images. Past MAX_ROWS sources, the largest
// keep their rows; the rest fold into one count row or a footnote for medians.
function presentation(summary) {
  const { scope, source } = summary;
  const ranked = summary.groups.toSorted((a, b) => b.request_count - a.request_count);
  const hidden = ranked.length > MAX_ROWS ? ranked.slice(MAX_ROWS - 1) : [];
  const hiddenRequests = hidden.reduce((sum, group) => sum + group.request_count, 0);
  return {
    eyebrow: 'SemiAnalysis · InferenceX AgentX',
    scope: `Result ${source.selected_result_id} · ${scope.phase === 'all' ? 'all phases' : `${scope.phase} phase`} · ${format.count(scope.selected_request_count)} requests`,
    groups: summary.groups.filter((group) => !hidden.includes(group)),
    top:
      hidden.length > 0
        ? ` · top ${ranked.length - hidden.length} of ${ranked.length} sources`
        : '',
    hidden:
      hidden.length > 0
        ? {
            count: hidden.length,
            label: `Other (${hidden.length} sources)`,
            requests: hiddenRequests,
            share: hiddenRequests / scope.selected_request_count,
            cancelled: hidden.reduce((sum, group) => sum + group.cancelled_count, 0),
          }
        : null,
    footer: [
      'Groups are recorded srcKind values; roles are not inferred. One captured result, not a dataset-wide comparison.',
      `Source: ${source.query_url} · captured ${source.retrieved_at.slice(0, 10)}`,
    ],
    empty: 'No requests in the selected phase.',
  };
}

export function renderSourceChart(summary, metric = 'requests') {
  const view = IMAGE_METRICS[metric];
  const base = presentation(summary);
  const rows = base.groups.map((group) => {
    if (!view.key)
      return {
        label: sourceName(group.source_category),
        value: group.request_count,
        text: format.count(group.request_count),
        detail: format.share(group.request_share),
      };
    const stats = group.metrics[view.key];
    return {
      label: sourceName(group.source_category),
      value: stats.median,
      text: view.format(stats.median),
      detail: stats.valid_count ? `n = ${format.count(stats.valid_count)}` : unavailable(stats),
    };
  });
  const footer = [...base.footer];
  if (base.hidden && !view.key)
    rows.push({
      label: base.hidden.label,
      value: base.hidden.requests,
      text: format.count(base.hidden.requests),
      detail: format.share(base.hidden.share),
      muted: true,
    });
  else if (base.hidden)
    footer.unshift(
      `${base.hidden.count} smaller sources with ${format.share(base.hidden.share)} of requests are not shown; summary.json lists every source.`,
    );
  return barChart({
    eyebrow: base.eyebrow,
    title: view.title,
    subtitle: [base.scope + base.top, view.unit].filter(Boolean).join(' · '),
    rows,
    footer,
    emptyText: base.empty,
    description: `${view.title}. ${base.scope}. ${footer.join(' ')}`,
  }).svg;
}

export function renderSourceTable(summary) {
  const base = presentation(summary);
  const columns = [
    { key: 'requests', label: 'Requests', group: 'Volume', format: format.count },
    { key: 'share', label: 'Share', group: 'Volume', format: format.share, bar: true },
    ...(summary.scope.cancelled_request_count > 0
      ? [{ key: 'cancelled', label: 'Cancelled', group: 'Volume', format: format.count }]
      : []),
    { key: 'isl', label: 'Input tokens', group: 'Median tokens', format: format.quantity },
    { key: 'osl', label: 'Output tokens', group: 'Median tokens', format: format.quantity },
    { key: 'e2e_ms', label: 'E2E latency', group: 'Median latency', format: format.duration },
    { key: 'ttft_ms', label: 'TTFT', group: 'Median latency', format: format.duration },
  ];
  const rows = base.groups.map((group) => ({
    label: sourceName(group.source_category),
    values: {
      requests: group.request_count,
      share: group.request_share,
      cancelled: group.cancelled_count,
      ...Object.fromEntries(METRICS.map(([key]) => [key, group.metrics[key].median])),
    },
  }));
  if (base.hidden)
    rows.push({
      label: base.hidden.label,
      muted: true,
      values: {
        requests: base.hidden.requests,
        share: base.hidden.share,
        cancelled: base.hidden.cancelled,
        ...Object.fromEntries(METRICS.map(([key]) => [key, null])),
      },
    });
  const footer = [
    'Latency medians use completed requests; token medians include cancelled requests. — means unavailable.',
    ...base.footer,
  ];
  return tableImage({
    eyebrow: base.eyebrow,
    title: 'AgentX requests by recorded source',
    subtitle: `${base.scope}${base.top} · medians per source`,
    nameLabel: 'Recorded source',
    columns,
    rows,
    footer,
    emptyText: base.empty,
    description: `AgentX requests by recorded source. ${base.scope}. ${footer.join(' ')}`,
  }).svg;
}

// Quote cells and neutralize spreadsheet formulas; JSON preserves exact source strings.
const csvCell = (value) =>
  `"${String(typeof value === 'string' && /^[=+\-@\t\r]/u.test(value) ? `'${value}` : (value ?? '')).replaceAll('"', '""')}"`;

function requestCsv(rows) {
  const fields = [
    'cid',
    'ri',
    'ti',
    'wid',
    'phase',
    'source_category',
    'cancelled',
    'isl',
    'osl',
    'e2e_ms',
    'ttft_ms',
  ];
  return `${fields.join(',')}\n${rows.map((row) => fields.map((key) => csvCell(row[key])).join(',')).join('\n')}\n`;
}

const QUANTILES = ['min', 'p25', 'median', 'p75', 'p95', 'max'];
const markdownCell = (value) =>
  xml(value)
    .replaceAll(/[\r\n]/gu, ' ')
    .replaceAll(/[\\`*_[\]|]/gu, (char) => `&#${char.codePointAt(0)};`);

function sourceTable(summary) {
  const lines = [
    '# AgentX requests by recorded source category',
    '',
    `Result ${summary.source.selected_result_id} · phase ${summary.scope.phase} · ${summary.scope.selected_request_count} captured requests selected`,
    '',
    '| Recorded source | Requests | Share of selected requests | Cancelled |',
    '| --- | ---: | ---: | ---: |',
    ...summary.groups.map(
      (group) =>
        `| ${markdownCell(categoryLabel(group.source_category))} | ${group.request_count} | ${number(group.request_share * 100)}% | ${group.cancelled_count} |`,
    ),
  ];
  if (summary.groups.length === 0) lines.push('', 'No requests in the selected phase.');
  for (const [key, title, unit] of METRICS) {
    lines.push(
      '',
      `## ${title} (${unit})`,
      '',
      '| Recorded source | Valid | Missing | Cancelled excluded | Min | p25 | Median | p75 | p95 | Max |',
      '| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |',
    );
    for (const group of summary.groups) {
      const stats = group.metrics[key];
      lines.push(
        `| ${[
          markdownCell(categoryLabel(group.source_category)),
          stats.valid_count,
          stats.missing_count,
          stats.excluded_cancelled_count,
          ...QUANTILES.map((field) => number(stats[field])),
        ].join(' | ')} |`,
      );
    }
  }
  lines.push(
    '',
    `${summary.scope.captured_request_count} rows captured; ${summary.scope.excluded_phase_count} excluded by phase; ${summary.scope.missing_source_count} missing source.`,
    '',
    'One captured result; upstream completeness/sampling is unverified. Recorded categories do not establish agent roles or causal overhead.',
    'Counts and token lengths include cancelled requests; latency excludes them. Missing values remain unavailable; zero is retained.',
    'Quantiles: linear interpolation at (n - 1) * p (R type 7). Display values use four significant digits; counts are exact. Full precision: [summary.csv](summary.csv) and [summary.json](summary.json).',
    '',
    `Source: ${summary.source.query_url} · captured ${markdownCell(summary.source.retrieved_at)} · [retained capture](source.json)`,
    '',
  );
  return lines.join('\n');
}

function summaryCsv(summary) {
  const fields = [
    'result_id',
    'phase',
    'source_category',
    'request_count',
    'request_share',
    'cancelled_count',
    'metric',
    'unit',
    'valid_count',
    'missing_count',
    'excluded_cancelled_count',
    ...QUANTILES,
  ];
  const rows = summary.groups.flatMap((group) =>
    METRICS.map(([key, , unit]) => {
      const stats = group.metrics[key];
      return [
        summary.source.selected_result_id,
        summary.scope.phase,
        group.source_category,
        group.request_count,
        group.request_share,
        group.cancelled_count,
        key,
        unit,
        stats.valid_count,
        stats.missing_count,
        stats.excluded_cancelled_count,
        ...QUANTILES.map((field) => stats[field]),
      ]
        .map(csvCell)
        .join(',');
    }),
  );
  return [fields.join(','), ...rows, ''].join('\n');
}

export async function runCharts(args, outputDir, { signal } = {}) {
  const options = normalizeChartArgs(args, outputDir);
  if (options.template === 'list') return chartTemplates();
  const bytes = await readBoundedRegular(
    options.input,
    64 * 1024 * 1024,
    'selected-point capture',
    { signal },
  );
  let capture;
  try {
    capture = JSON.parse(bytes.toString('utf8'));
  } catch (error) {
    throw responseError('Invalid selected-point capture JSON.', error);
  }
  const { summary, rows } = summarizeSources(capture, options.phase);
  summary.source.capture_sha256 = sha256(bytes);
  summary.presentation = { metric: options.metric, style: options.style };
  const files = [
    ['source.json', bytes],
    ['requests.csv', requestCsv(rows)],
  ];
  if (options.style !== 'table')
    files.push(['chart.svg', renderSourceChart(summary, options.metric)]);
  if (options.style !== 'chart')
    files.push(
      ['table.svg', renderSourceTable(summary)],
      ['table.md', sourceTable(summary)],
      ['summary.csv', summaryCsv(summary)],
    );
  summary.artifacts = [...files.map(([name]) => name), 'summary.json'];
  files.push(['summary.json', `${JSON.stringify(summary, null, 2)}\n`]);
  const directory = resolve(outputDir);
  try {
    await mkdir(directory);
    for (const [name, data] of files) {
      signal?.throwIfAborted();
      await writeFile(join(directory, name), data, { flag: 'wx', signal });
    }
  } catch (error) {
    if (signal?.aborted) throw signal.reason ?? error;
    throw new CliError('OUTPUT_ERROR', `Could not write chart directory: ${error.message}`, {
      cause: error,
      details: { output_directory: directory },
    });
  }
  return { ...summary, output: { directory } };
}
