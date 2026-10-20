#!/usr/bin/env node
// Skill renderer for raw historical views, not formal InferenceX evidence bundles.
import { parseArgs } from 'node:util';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { createHash } from 'node:crypto';
import { requestHeaders } from '../../inferencex-api/scripts/request-headers.mjs';

const HELP = `Usage:
  node waterfall.mjs --input saved-response.json --out NEW_DIRECTORY
  node waterfall.mjs --model MODEL --hardware GPU [options] --out NEW_DIRECTORY

Options (live mode only):
  --sequence 8k/1k          Workload; agentic-traces uses P90, single-turn median
  --metric outputTputPerGpu Metric key; costhOutput gives owning $/M output tokens
  --target 35              Interactivity target in tok/s/user
  --framework sglang       Optional framework selector
  --precision fp8          Optional; omission uses API precision auto-selection
  --start YYYY-MM-DD       Optional inclusive first snapshot; omitted = all history
  --end YYYY-MM-DD         Optional inclusive last snapshot; omitted = all history
  --base-url URL           Default https://inferencex.semianalysis.com
                           HTTPS origin or loopback HTTP for local testing

Requires Node 24+. Output directory must not exist. Retains exact JSON bytes and
request metadata, and creates summary.md, steps.csv and chart.svg. Live requests
are read-only, use internal TCO, and check deployed OpenAPI for waterfall support.
No interpolation or waterfall-step calculation occurs here. This
skill renderer does not create a bundle supported by inferencex verify.
`;
const keys = [
  'input',
  'out',
  'model',
  'hardware',
  'sequence',
  'metric',
  'target',
  'framework',
  'precision',
  'start',
  'end',
  'base-url',
];
const esc = (s) =>
  String(s).replaceAll(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c],
  );
const md = (s) =>
  String(s)
    .replaceAll(/[|\r\n]/g, ' ')
    .replaceAll(/[<>]/g, '');
const num = (n) =>
  new Intl.NumberFormat(
    'en-US',
    n !== 0 && Math.abs(n) < 0.01
      ? { minimumSignificantDigits: 2, maximumSignificantDigits: 2 }
      : { maximumFractionDigits: 2 },
  ).format(n);
const signed = (n) => `${n > 0 ? '+' : ''}${num(n)}`;
const hash = (b) => createHash('sha256').update(b).digest('hex');
const safeUrl = (url) => {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && !u.username && !u.password ? u.href : null;
  } catch {
    return null;
  }
};
const links = (step) => ({
  prs: step.prLinks.map(safeUrl).filter(Boolean),
  runs: [...new Set(step.sources.map((s) => safeUrl(s.runUrl)).filter(Boolean))],
});
const csv = (v) => `"${String(v ?? '').replaceAll('"', '""')}"`;
const validDate = (value) =>
  typeof value === 'string' &&
  /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  Number.isFinite(Date.parse(value)) &&
  new Date(value).toISOString().slice(0, 10) === value;
let output;
const save = (name, value) => writeFile(join(output, name), value, { flag: 'wx' });

function validate(data) {
  if (data?.error) throw new Error(`API error: ${data.error}`);
  if (
    data?.view !== 'historical' ||
    data?.params?.chart !== 'waterfall' ||
    !Array.isArray(data.series)
  )
    throw new Error(
      'Expected a historical waterfall response; line-only or unsupported responses are rejected.',
    );
  if (
    !data.metric?.label ||
    !data.params.model ||
    !data.params.sequence ||
    !Number.isFinite(data.target)
  )
    throw new Error('Missing metric, model, workload or target metadata.');
  const axis = data.interactivity;
  const agentic = data.params.sequence === 'agentic-traces';
  if (
    axis?.statistic !== (agentic ? 'p90' : 'median') ||
    axis?.field !== (agentic ? 'p90_intvty' : 'median_intvty') ||
    axis?.unit !== 'tok/s/user'
  )
    throw new Error('Missing or incompatible historical interactivity metadata.');
  if (new Set(data.series.map((s) => s.key)).size !== data.series.length)
    throw new Error('Duplicate series keys.');
  for (const s of data.series) {
    if (
      typeof s.key !== 'string' ||
      typeof s.label !== 'string' ||
      !Array.isArray(s.steps) ||
      !Number.isInteger(s.excludedPointCount) ||
      s.excludedPointCount < 0
    )
      throw new Error('Invalid series metadata or missing exclusion count.');
    if (
      s.steps.length > 0 &&
      (s.steps[0].kind !== 'baseline' ||
        s.steps.at(-1).kind !== 'best' ||
        s.steps.slice(1, -1).some((x) => x.kind !== 'gain'))
    )
      throw new Error(`Invalid baseline/gain/best order: ${s.key}`);
    for (const step of s.steps) {
      if (
        !['baseline', 'gain', 'best'].includes(step.kind) ||
        !validDate(step.date) ||
        !['from', 'to', 'delta'].every((k) => Number.isFinite(step[k])) ||
        !Array.isArray(step.sources) ||
        !Array.isArray(step.prLinks) ||
        typeof step.linksAvailable !== 'boolean'
      )
        throw new Error(`Invalid step: ${s.key}`);
      if (
        step.prLinks.some((url) => !safeUrl(url)) ||
        step.sources.some((source) => !safeUrl(source.runUrl))
      )
        throw new Error(`Invalid source link: ${s.key}`);
    }
  }
}

function render(data) {
  const p = data.params;
  const scope = `${p.model} · ${p.sequence} · ${data.interactivity.statistic.toUpperCase()} interactivity ${data.target} tok/s/user`;
  const notes =
    'Values are interpolated at the target. Record gains exclude regressions, recoveries and synthetic extensions. Source links identify curves, not isolated causal PR effects.';
  const title = `InferenceX improvement waterfall — ${p.model}`;
  const lines = [
    `# ${title}`,
    '',
    scope,
    '',
    `Metric: ${data.metric.label}. Precision: ${(p.precisions ?? []).join(', ') || 'unspecified'}. TCO basis: ${p.tcoBasis ?? 'unspecified'}.`,
    '',
    `Requested snapshot range: ${p.start ?? 'all available'} → ${p.end ?? 'all available'}.`,
    '',
    notes,
    '',
    'Local rendering of the retained API response; not a formal CLI verification bundle.',
    '',
    '[Chart](chart.svg) · [CSV](steps.csv) · [Exact response](response.json) · [Capture metadata](request.json)',
    '',
  ];
  const rows = [
    [
      'series',
      'hardware',
      'precision',
      'kind',
      'date',
      'from',
      'to',
      'delta',
      'runUrls',
      'prLinks',
      'linksAvailable',
      'excludedPointCount',
      'targetInteractivity',
      'interactivityStatistic',
      'interactivityField',
    ],
  ];
  const width = Math.max(1100, ...data.series.map((s) => 200 + s.steps.length * 104));
  let top = 145;
  const panels = [];
  for (const s of data.series) {
    const baseline = s.steps[0],
      best = s.steps.at(-1);
    const missing = s.steps.filter((x) => !x.linksAvailable).length;
    const absent = s.steps.filter((x) => x.linksAvailable && x.prLinks.length === 0).length;
    const coverage = `${s.excludedPointCount} excluded date points; ${missing} step entries with link lookup unavailable; ${absent} with no matched PR.`;
    const change = baseline && baseline.to !== 0 ? (best.to / baseline.to - 1) * 100 : null;
    const result = baseline
      ? `${num(baseline.to)} (${baseline.date}) → ${num(best.to)} (${best.date}); ${change === null ? 'percentage unavailable' : `${signed(change)}% change`}. ${s.steps.filter((x) => x.kind === 'gain').length} record gains.`
      : 'No eligible waterfall steps for this series.';
    lines.push(
      `## ${md(s.label)} — ${md(s.key)}`,
      '',
      result,
      '',
      coverage,
      '',
      '| Step | Date | From | To | Delta | Sources |',
      '| --- | --- | ---: | ---: | ---: | --- |',
    );
    const maxLinks = Math.max(
      1,
      ...s.steps.map((st) => links(st).prs.length + links(st).runs.length),
    );
    const height = 410 + maxLinks * 16;
    const left = 95,
      chartTop = top + 88,
      chartBottom = top + 305,
      usable = width - left - 55;
    const max = Math.max(1, ...s.steps.flatMap((st) => [st.from, st.to]));
    const y = (value) => chartBottom - (value / max) * (chartBottom - chartTop);
    panels.push(
      `<g aria-label="${esc(s.label)}"><text x="40" y="${top + 8}" class="series">${esc(s.label)} · ${esc(s.key)}</text><text x="40" y="${top + 35}" class="muted">${esc(result)}</text><text x="40" y="${top + 57}" class="muted">${esc(coverage)}</text>`,
    );
    for (let i = 0; i <= 4; i++) {
      const v = (max * i) / 4;
      panels.push(
        `<line x1="${left}" y1="${y(v)}" x2="${width - 55}" y2="${y(v)}" class="grid"/><text x="${left - 12}" y="${y(v) + 4}" text-anchor="end" class="tick">${esc(num(v))}</text>`,
      );
    }
    const slot = usable / Math.max(1, s.steps.length),
      bar = Math.min(54, slot * 0.6);
    s.steps.forEach((step, i) => {
      const { prs, runs } = links(step);
      const sourceLinks = [
        ...prs.map((u) => `[PR #${u.split('/').filter(Boolean).at(-1)}](${u})`),
        ...runs.map((u, j) => `[run ${j + 1}](${u})`),
      ];
      const linkNote = step.linksAvailable
        ? prs.length === 0
          ? 'no matched PR'
          : ''
        : 'PR lookup unavailable';
      lines.push(
        `| ${step.kind} | ${step.date} | ${num(step.from)} | ${num(step.to)} | ${signed(step.delta)} | ${sourceLinks.join(' · ') || 'No source links'}${linkNote ? `; ${linkNote}` : ''} |`,
      );
      rows.push([
        s.key,
        s.hwKey,
        s.precision ?? p.precisions?.join(',') ?? '',
        step.kind,
        step.date,
        step.from,
        step.to,
        step.delta,
        JSON.stringify(runs),
        JSON.stringify(prs),
        step.linksAvailable,
        s.excludedPointCount,
        data.target,
        data.interactivity.statistic,
        data.interactivity.field,
      ]);
      const x = left + slot * (i + 0.5),
        high = y(Math.max(step.from, step.to)),
        low = y(Math.min(step.from, step.to));
      const color = step.kind === 'gain' ? '#4bd6ad' : step.kind === 'best' ? '#7db4ff' : '#b0bacd';
      const tooltip = `${step.kind} ${step.date}: ${step.from} → ${step.to}; delta ${step.delta}. ${linkNote}`;
      if (i)
        panels.push(
          `<line x1="${x - slot + bar / 2}" y1="${y(s.steps[i - 1].to)}" x2="${x - bar / 2}" y2="${y(s.steps[i - 1].to)}" stroke="#7d879a" stroke-dasharray="3 4"/>`,
        );
      const rect = `<g><title>${esc(tooltip)}</title><rect x="${x - bar / 2}" y="${high}" width="${bar}" height="${Math.max(1, low - high)}" rx="2" fill="${color}"/></g>`;
      panels.push(
        prs[0] || runs[0]
          ? `<a href="${esc(prs[0] ?? runs[0])}" target="_blank">${rect}</a>`
          : rect,
        `<text x="${x}" y="${high - 10}" text-anchor="middle" class="value">${esc(step.kind === 'gain' ? signed(step.delta) : num(step.to))}</text><text x="${x}" y="${chartBottom + 25}" text-anchor="middle" class="tick">${step.kind}</text><text x="${x}" y="${chartBottom + 43}" text-anchor="middle" class="tick">${step.date}</text>`,
      );
      const labels = [
        ...prs.map((u) => ({ url: u, label: `PR #${u.split('/').filter(Boolean).at(-1)}` })),
        ...runs.map((u, j) => ({ url: u, label: `source run ${j + 1}` })),
      ];
      labels.forEach((link, j) =>
        panels.push(
          `<a href="${esc(link.url)}" target="_blank"><text x="${x}" y="${chartBottom + 63 + j * 16}" text-anchor="middle" class="link">${esc(link.label)}</text></a>`,
        ),
      );
      if (linkNote)
        panels.push(
          `<text x="${x}" y="${chartBottom + 63 + labels.length * 16}" text-anchor="middle" class="tick">${step.linksAvailable ? 'no matched PR' : 'links unavailable'}</text>`,
        );
    });
    if (s.steps.length === 0)
      panels.push(
        `<text x="${left}" y="${chartTop + 90}" class="muted">No eligible observations for this series.</text>`,
      );
    panels.push('</g>');
    top += height;
    lines.push('');
  }
  if (data.series.length === 0) {
    panels.push(
      '<text x="40" y="185" class="muted">No series returned for this selection. This does not prove no benchmarks ran.</text>',
    );
    top = 245;
    lines.push('No series returned for this selection. This does not prove no benchmarks ran.');
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${top + 58}" viewBox="0 0 ${width} ${top + 58}" role="img" aria-labelledby="title desc"><title id="title">${esc(title)}</title><desc id="desc">${esc(notes)}</desc><style>text{font-family:Arial,sans-serif;fill:#eff3fb}.series{font-size:20px;font-weight:700}.muted{font-size:13px;fill:#aebbd0}.tick{font-size:11px;fill:#bac5d8}.value{font-size:12px}.link{font-size:11px;fill:#8cc5ff;text-decoration:underline}.grid{stroke:#293345;stroke-width:1}</style><rect width="100%" height="100%" fill="#101723"/><text x="40" y="42" font-size="26" font-weight="700">InferenceX · Improvement waterfall</text><text x="40" y="72" class="muted">${esc(scope)}</text><text x="40" y="96" class="muted">${esc(data.metric.label)} · ${esc(p.precisions?.join(', ') ?? '')} · TCO: ${esc(p.tcoBasis ?? 'unspecified')}</text>${panels.join('')}<text x="40" y="${top + 18}" class="muted">Source: retained InferenceX historical view · interpolated values · links show provenance, not causal PR attribution.</text><text x="40" y="${top + 39}" class="muted">Skill rendering. Complete selectors, exclusions and links: summary.md / steps.csv / response.json.</text></svg>`;
  return {
    summary: `${lines.join('\n')}\n`,
    csv: `${rows.map((r) => r.map(csv).join(',')).join('\r\n')}\r\n`,
    svg,
  };
}

async function main() {
  const { values: a } = parseArgs({
    options: {
      ...Object.fromEntries(keys.map((key) => [key, { type: 'string' }])),
      help: { type: 'boolean' },
    },
    strict: true,
  });
  if (a.help) {
    console.log(HELP);
    return;
  }
  if (Number(process.versions.node.split('.')[0]) < 24)
    throw new Error('This skill renderer requires Node 24 or newer.');
  if (!a.out || (!a.input && (!a.model || !a.hardware)))
    throw new Error('Provide --out and either --input or --model plus --hardware. Use --help.');
  if (a.input && keys.some((k) => !['input', 'out'].includes(k) && a[k] !== undefined))
    throw new Error('--input cannot be combined with live query options.');
  let url, origin;
  if (!a.input) {
    origin = new URL(a['base-url'] ?? 'https://inferencex.semianalysis.com');
    if (
      origin.username ||
      origin.password ||
      origin.pathname !== '/' ||
      origin.search ||
      origin.hash ||
      !(
        origin.protocol === 'https:' ||
        (origin.protocol === 'http:' &&
          ['localhost', '127.0.0.1', '[::1]'].includes(origin.hostname))
      )
    )
      throw new Error('--base-url must be an HTTPS origin or loopback HTTP origin.');
    const target = Number(a.target ?? 35);
    if (!Number.isFinite(target) || target < 1 || target > 1000)
      throw new Error('--target must be between 1 and 1000.');
    for (const k of ['start', 'end'])
      if (a[k] !== undefined && !validDate(a[k]))
        throw new Error(`Invalid --${k} date; use a real calendar date in YYYY-MM-DD format.`);
    if (a.start && a.end && a.start > a.end) throw new Error('--end must not precede --start.');
    url = new URL('/api/v1/views/historical', origin);
    url.search = new URLSearchParams({
      model: a.model,
      gpus: a.hardware.toLowerCase(),
      sequence: a.sequence ?? '8k/1k',
      metric: a.metric ?? 'outputTputPerGpu',
      target: String(target),
      chart: 'waterfall',
      format: 'json',
      tcoBasis: 'internal',
      extendToDate: a.end ?? new Date().toISOString().slice(0, 10),
      ...(a.framework ? { frameworks: a.framework.toLowerCase() } : {}),
      ...(a.precision ? { precisions: a.precision.toLowerCase() } : {}),
      ...(a.start ? { start: a.start } : {}),
      ...(a.end ? { end: a.end } : {}),
    });
  }
  output = resolve(a.out);
  try {
    await mkdir(output);
  } catch (error) {
    if (error.code === 'EEXIST')
      throw new Error(
        'Output directory already exists; choose a new --out directory to preserve earlier captures.',
        { cause: error },
      );
    throw error;
  }
  let bytes, metadata;
  async function get(requestUrl, stem) {
    const response = await fetch(requestUrl, {
      headers: { accept: 'application/json', ...requestHeaders(requestUrl, { source: 'skill' }) },
      signal: AbortSignal.timeout(30000),
      redirect: 'error',
    });
    const buffer = Buffer.from(await response.arrayBuffer());
    const receipt = {
      url: requestUrl.href,
      retrievedAt: new Date().toISOString(),
      status: response.status,
      decodedBytes: buffer.length,
      sha256: hash(buffer),
    };
    await save(`${stem}.json`, buffer);
    await save(`${stem}-request.json`, JSON.stringify(receipt, null, 2));
    if (!response.ok) throw new Error(`HTTP ${response.status}; see ${stem}.json in ${output}.`);
    return { buffer, receipt };
  }
  if (a.input) {
    bytes = await readFile(resolve(a.input));
    metadata = {
      mode: 'offline',
      input: resolve(a.input),
      copiedAt: new Date().toISOString(),
      decodedBytes: bytes.length,
      sha256: hash(bytes),
    };
    await save('response.json', bytes);
  } else {
    const openapi = await get(new URL('/api/openapi.json', origin), 'openapi');
    const contract = JSON.parse(openapi.buffer);
    if (
      !contract.paths?.['/api/v1/views/historical']?.get?.parameters?.some(
        (p) => p.name === 'chart' && p.schema?.enum?.includes('waterfall'),
      )
    )
      throw new Error(
        'This deployment does not advertise historical waterfall support. No data query was sent.',
      );
    const captured = await get(url, 'response');
    bytes = captured.buffer;
    metadata = { mode: 'live', ...captured.receipt };
  }
  await save('request.json', JSON.stringify(metadata, null, 2));
  const data = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  validate(data);
  const result = render(data);
  await save('summary.md', result.summary);
  await save('steps.csv', result.csv);
  await save('chart.svg', result.svg);
  console.log(
    JSON.stringify({
      output,
      series: data.series.length,
      steps: data.series.reduce((n, s) => n + s.steps.length, 0),
      files: ['summary.md', 'steps.csv', 'chart.svg', 'response.json', 'request.json'],
    }),
  );
}
main().catch((error) => {
  console.error(JSON.stringify({ error: error.message, ...(output ? { output } : {}) }));
  process.exitCode = 1;
});
