import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';

import { CliError, argumentError, responseError } from './cli-contract.mjs';
import { readBoundedRegular } from './local-files.mjs';

const METRICS = [
  ['isl', 'Input length', 'tokens'],
  ['osl', 'Output length', 'tokens'],
  ['e2e_ms', 'Completed request E2E', 'ms'],
  ['ttft_ms', 'Completed request TTFT', 'ms'],
];
const COLORS = ['#2fa9ef', '#f7b041', '#63d6b3', '#b39aff', '#ff8fab', '#67d4e8'];
const object = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const nonnegative = (value) => typeof value === 'number' && Number.isFinite(value) && value >= 0;
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const xml = (value) =>
  String(value).replaceAll(
    /[<>&"']/gu,
    (char) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' })[char],
  );

export function chartTemplates() {
  return {
    schema_version: 1,
    templates: [
      {
        id: 'agentx-sources',
        status: 'available',
        chart: 'Request-count bars and token/latency box plots by recorded srcKind',
        table: 'Request counts and per-metric distributions in Markdown and summary CSV',
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
      options: { input: { type: 'string' }, phase: { type: 'string' }, style: { type: 'string' } },
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
  return { template: 'agentx-sources', input: values.input, outputDir, phase, style };
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
        chart_scale: 'Counts are linear; distribution positions use log(1 + value), retaining zero',
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

export function renderSourceChart(summary) {
  const groups = summary.groups;
  const panelHeight = Math.max(140, groups.length * 50 + 90);
  const width = 1440;
  const height = 190 + panelHeight * 3 + 160;
  const pieces = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="title description"><title id="title">AgentX requests by recorded source category</title><desc id="description">${xml(JSON.stringify(summary.scope))}. Box plots show minimum, p25, median, p75, maximum.</desc><rect width="100%" height="100%" fill="#0a0d10"/><style>text{font-family:Inter,'Helvetica Neue',Arial,sans-serif;fill:#e8eaed}.small{font-size:15px;fill:#8a939c}.label{font-size:16px}.panel{font-size:19px;font-weight:600}.title{font-size:29px;font-weight:600}.brand{font-size:20px;font-weight:600;fill:#2fa9ef}</style>`,
  ];
  const text = (x, y, value, cls = 'label') =>
    pieces.push(`<text x="${x}" y="${y}" class="${cls}">${xml(value)}</text>`);
  text(32, 41, 'SemiAnalysis', 'brand');
  text(205, 43, 'AgentX · request sources', 'title');
  text(
    32,
    72,
    `Result ${summary.source.selected_result_id} · phase ${summary.scope.phase} · ${summary.scope.selected_request_count} captured requests selected`,
  );
  text(
    32,
    97,
    `${summary.scope.cancelled_request_count} cancelled · ${summary.scope.missing_source_count} missing source · captured ${summary.source.retrieved_at}`,
    'small',
  );
  text(32, 121, 'Recorded srcKind categories; labels do not infer main/subagent roles.', 'small');
  function panel(x, y, title, metric) {
    const w = 676;
    pieces.push(
      `<rect x="${x}" y="${y}" width="${w}" height="${panelHeight - 16}" rx="10" fill="#11161c" stroke="#252c34"/>`,
    );
    text(x + 16, y + 29, title, 'panel');
    const max = Math.max(
      1,
      ...groups.map((group) => (metric ? (group.metrics[metric].max ?? 0) : group.request_count)),
    );
    const left = x + 246,
      plotWidth = 248;
    text(left, y + 53, '0', 'small');
    text(left + plotWidth - 35, y + 53, number(max), 'small');
    for (const [index, group] of groups.entries()) {
      const cy = y + 80 + index * 50;
      const label = categoryLabel(group.source_category);
      pieces.push(
        `<text x="${x + 14}" y="${cy}" class="label"><title>${xml(label)}</title>${xml(label.length > 25 ? `${label.slice(0, 24)}…` : label)}</text>`,
      );
      const color = COLORS[index % COLORS.length];
      if (metric) {
        const stats = group.metrics[metric];
        if (stats.valid_count) {
          const scale = (v) => left + (plotWidth * Math.log1p(v)) / Math.log1p(max);
          pieces.push(
            `<path d="M${scale(stats.min)},${cy - 5}H${scale(stats.max)}" stroke="${color}"/><rect x="${scale(stats.p25)}" y="${cy - 13}" width="${Math.max(1, scale(stats.p75) - scale(stats.p25))}" height="16" fill="${color}" fill-opacity=".3" stroke="${color}"/><path d="M${scale(stats.median)},${cy - 15}v20" stroke="${color}" stroke-width="2"/>`,
          );
        }
        text(
          left + plotWidth + 12,
          cy,
          stats.valid_count ? `n=${stats.valid_count}` : 'unavailable',
          'small',
        );
        text(left + plotWidth + 12, cy + 20, `median ${number(stats.median)}`, 'small');
        text(
          left,
          cy + 20,
          `missing ${stats.missing_count}; cancelled ${stats.excluded_cancelled_count} excluded`,
          'small',
        );
      } else {
        pieces.push(
          `<rect x="${left}" y="${cy - 13}" width="${(plotWidth * group.request_count) / max}" height="17" fill="${color}"/>`,
        );
        text(
          left + plotWidth + 12,
          cy,
          `${group.request_count} (${number(group.request_share * 100)}%)`,
          'small',
        );
      }
    }
    if (groups.length === 0) text(x + 16, y + 75, 'No requests in the selected phase.', 'small');
  }
  panel(32, 150, 'Request count · all selected requests', null);
  METRICS.forEach(([key, title, unit], index) =>
    panel(
      32 + (index % 2) * 700,
      150 + panelHeight * (1 + Math.floor(index / 2)),
      `${title} (${unit}) · log(1+x) scale`,
      key,
    ),
  );
  const bottom = 150 + panelHeight * 3;
  const notes = [
    'Boxes: p25–p75, line: median, whiskers: min–max. Distribution axes use log(1+x), retaining zero. Medians use panel units.',
    'Token lengths include recorded cancelled requests; latency excludes cancelled requests. Missing values are not zero.',
    `${summary.scope.captured_request_count} rows captured; ${summary.scope.excluded_phase_count} excluded by phase. Upstream completeness/sampling is unverified.`,
    summary.source.query_url,
    'Source: source.json. This is one captured result, not a dataset-wide comparison or proof of subagent overhead.',
  ];
  notes.forEach((note, index) => text(32, bottom + 14 + index * 23, note, 'small'));
  pieces.push('</svg>');
  return pieces.join('\n');
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
  const files = [
    ['source.json', bytes],
    ['requests.csv', requestCsv(rows)],
  ];
  if (options.style !== 'table') files.push(['chart.svg', renderSourceChart(summary)]);
  if (options.style !== 'chart')
    files.push(['table.md', sourceTable(summary)], ['summary.csv', summaryCsv(summary)]);
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
