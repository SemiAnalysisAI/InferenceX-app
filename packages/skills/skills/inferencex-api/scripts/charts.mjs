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
const IMAGE_METRICS = {
  requests: { title: 'AgentX request mix', unit: 'requests' },
  'input-tokens': { title: 'AgentX input length', key: 'isl', unit: 'tokens' },
  'output-tokens': { title: 'AgentX output length', key: 'osl', unit: 'tokens' },
  e2e: { title: 'AgentX request latency', key: 'e2e_ms', unit: 'seconds', divisor: 1000 },
  ttft: { title: 'AgentX time to first token', key: 'ttft_ms', unit: 'seconds', divisor: 1000 },
};
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
        chart: 'One focused bar chart: request counts or a selected token/latency median',
        table: 'One focused SVG table, with detailed statistics in Markdown and summary CSV',
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
          'Linear from zero; one selected metric per image. Latency image medians use seconds; detailed statistics retain ms.',
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

const pictureNumber = (v) =>
  v !== null && (v >= 1e9 || (v > 0 && v < 0.0001)) ? v.toExponential(3) : number(v);

export function renderSourceChart(summary, metric = 'requests') {
  return renderSourcePicture(summary, metric, false);
}

export function renderSourceTable(summary, metric = 'requests') {
  return renderSourcePicture(summary, metric, true);
}

function renderSourcePicture(summary, metric, table) {
  const spec = IMAGE_METRICS[metric];
  const groups = summary.groups;
  const horizontal = groups.length > 6;
  const rowHeight = table ? 100 : 90;
  const plotBottom = table || horizontal ? 230 + Math.max(1, groups.length) * rowHeight : 660;
  const width = 1440;
  const height = plotBottom + (table || horizontal ? 175 : 235);
  const pieces = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="title description"><title id="title">${xml(spec.title)}</title><desc id="description">${xml(JSON.stringify(summary.scope))}. Recorded source categories; ${spec.key ? `median ${spec.unit}` : 'request counts and shares'}.</desc><rect width="100%" height="100%" fill="#0a0d10"/><style>text{font-family:Inter,'Helvetica Neue',Arial,sans-serif;fill:#e8eaed}.small{font-size:19px;fill:#8a939c}.label{font-size:26px}.value{font-size:44px;font-weight:700}.title{font-size:48px;font-weight:700}.brand{font-size:20px;font-weight:600;fill:#2fa9ef}</style>`,
  ];
  const text = (x, y, value, cls = 'label', anchor = 'start', extra = '') =>
    pieces.push(
      `<text x="${x}" y="${y}" class="${cls}" text-anchor="${anchor}" ${extra}>${xml(value)}</text>`,
    );
  const label = (x, y, value, maxWidth, anchor = 'start') => {
    const full = value ?? '(source missing)';
    const maxLength = Math.floor(maxWidth / 26);
    const left = anchor === 'middle' ? x - maxWidth / 2 : x;
    pieces.push(
      `<svg x="${left}" y="${y - 28}" width="${maxWidth}" height="36" overflow="hidden"><text x="${anchor === 'middle' ? maxWidth / 2 : 0}" y="28" class="label" text-anchor="${anchor}"><title>${xml(full)}</title>${xml(full.length > maxLength ? `${full.slice(0, maxLength - 1)}…` : full)}</text></svg>`,
    );
  };
  const value = (group) => (spec.key ? group.metrics[spec.key].median : group.request_count);
  const display = (group) => {
    if (!spec.key) return group.request_count.toLocaleString('en-US');
    const v = value(group) === null ? null : value(group) / (spec.divisor ?? 1);
    return pictureNumber(v);
  };
  const detail = (group) => {
    if (!spec.key) return `${number(group.request_share * 100)}%`;
    const stats = group.metrics[spec.key];
    return stats.missing_count || stats.excluded_cancelled_count
      ? `n=${stats.valid_count}; ${stats.missing_count} missing; ${stats.excluded_cancelled_count} cancelled excluded`
      : '';
  };
  text(64, 42, 'SemiAnalysis · InferenceX', 'brand');
  text(64, 110, spec.title, 'title');
  text(
    64,
    155,
    spec.key
      ? `Median · ${spec.unit}${spec.key.endsWith('_ms') ? ' · completed requests' : ''}`
      : 'Request count · share of captured requests',
  );
  text(
    64,
    191,
    `Result ${summary.source.selected_result_id} · ${summary.scope.selected_request_count.toLocaleString('en-US')} selected requests · phase ${summary.scope.phase}`,
    'small',
  );
  if (table) {
    text(84, 247, 'Recorded source', 'small');
    text(
      spec.key ? 1310 : 1010,
      247,
      spec.key ? `Median (${spec.unit})` : 'Requests',
      'small',
      'end',
    );
    if (!spec.key) text(1310, 247, 'Share', 'small', 'end');
    for (const [index, group] of groups.entries()) {
      const y = 278 + index * rowHeight;
      pieces.push(
        `<rect x="64" y="${y}" width="1312" height="88" rx="8" fill="${index % 2 ? '#11161c' : '#151c23'}"/>`,
        `<rect x="64" y="${y}" width="5" height="88" fill="${COLORS[index % COLORS.length]}"/>`,
      );
      label(84, y + 53, group.source_category, spec.key ? 900 : 650);
      text(spec.key ? 1310 : 1010, y + 54, display(group), 'value', 'end');
      if (!spec.key) text(1310, y + 54, detail(group), 'value', 'end');
      else if (detail(group)) text(1310, y + 78, detail(group), 'small', 'end');
    }
  } else {
    const max = Math.max(1, ...groups.map((group) => (value(group) ?? 0) / (spec.divisor ?? 1)));
    const magnitude = 10 ** Math.floor(Math.log10(max));
    const ceiling = Math.min(
      Number.MAX_VALUE,
      Math.ceil(max / magnitude / 0.5) * (magnitude * 0.5),
    );
    if (!horizontal) {
      for (let tick = 0; tick <= 4; tick++) {
        const y = plotBottom - tick * 95;
        pieces.push(
          `<path d="M140,${y}H1370" stroke="#30363d" stroke-dasharray="${tick ? '4 8' : 'none'}"/>`,
        );
        text(120, y + 7, pictureNumber(ceiling * (tick / 4)), 'small', 'end');
      }
    }
    for (const [index, group] of groups.entries()) {
      const v = (value(group) ?? 0) / (spec.divisor ?? 1);
      const color = COLORS[index % COLORS.length];
      if (horizontal) {
        const y = 250 + index * rowHeight;
        label(64, y + 30, group.source_category, 350);
        pieces.push(
          `<rect x="440" y="${y}" width="${760 * (v / ceiling)}" height="36" fill="${color}"/>`,
        );
        text(1320, y + 30, display(group), 'label', 'end');
        if (detail(group)) text(440, y + 62, detail(group), 'small');
      } else {
        const band = 1230 / Math.max(1, groups.length);
        const center = 140 + band * (index + 0.5);
        const barWidth = Math.min(230, band * 0.64);
        const barHeight = 380 * (v / ceiling);
        pieces.push(
          `<rect x="${center - barWidth / 2}" y="${plotBottom - barHeight}" width="${barWidth}" height="${barHeight}" fill="${color}"/>`,
        );
        text(
          center,
          plotBottom - barHeight - 24,
          display(group),
          groups.length > 4 ? 'label' : 'value',
          'middle',
        );
        label(center, plotBottom + 45, group.source_category, band - 20, 'middle');
        // Keep detailed exclusions in the footer and machine-readable statistics.
        if (detail(group))
          text(
            center,
            plotBottom + 78,
            spec.key ? `n=${group.metrics[spec.key].valid_count}` : detail(group),
            'label',
            'middle',
          );
      }
    }
  }
  if (groups.length === 0) text(84, 310, 'No requests in the selected phase.');
  const footer = height - 97;
  const excluded = spec.key
    ? groups.reduce(
        (n, group) =>
          n +
          group.metrics[spec.key].missing_count +
          group.metrics[spec.key].excluded_cancelled_count,
        0,
      )
    : 0;
  text(
    64,
    footer,
    'Captured rows only; upstream completeness and agent roles are unverified.',
    'small',
  );
  if (excluded)
    text(
      64,
      footer + 30,
      `${excluded} missing/cancelled observations excluded. Per-source counts: summary.json.`,
      'small',
    );
  text(
    64,
    footer + (excluded ? 60 : 30),
    'Source: InferenceX request timeline · full statistics and capture: summary.json / source.json',
    'small',
  );
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
  summary.presentation = { metric: options.metric, style: options.style };
  const files = [
    ['source.json', bytes],
    ['requests.csv', requestCsv(rows)],
  ];
  if (options.style !== 'table')
    files.push(['chart.svg', renderSourceChart(summary, options.metric)]);
  if (options.style !== 'chart')
    files.push(
      ['table.svg', renderSourceTable(summary, options.metric)],
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
