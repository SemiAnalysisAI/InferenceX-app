import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm, stat, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, test } from 'node:test';

import {
  normalizeChartArgs,
  renderSourceChart,
  renderSourceTable,
  runCharts,
  summarizeSources,
} from '../skills/inferencex-api/scripts/charts.mjs';
import { parseOperation } from '../skills/inferencex-api/scripts/commands.mjs';
import { packedSkillSuite, succeeded } from './packed-skill.mjs';

const root = await mkdtemp(join(tmpdir(), 'inferencex-chart-'));
after(() => rm(root, { recursive: true, force: true }));
const suite = packedSkillSuite();
const request = (srcKind, overrides = {}) => ({
  cid: 'conversation',
  ti: 0,
  wid: '0',
  phase: 'profiling',
  srcKind,
  start: 0,
  end: 10_000_000,
  isl: 100,
  osl: 10,
  ttftMs: 2,
  cancelled: false,
  ...overrides,
});
function capture(requests = [request('weka_main'), request('weka_subagent')]) {
  const timeline = {
    version: 6,
    startNs: 1_000_000_000,
    endNs: 2_000_000_000,
    durationS: 1,
    requests,
  };
  return {
    outcome: 'trace_diagnostics',
    selected_point: { id: 421 },
    trace_availability: { available: true },
    timeline,
    metadata: {
      selected_result_id: '421',
      requests: [
        {
          query_url: 'https://inferencex.semianalysis.com/api/v1/request-timeline?id=421',
          retrieved_at: '2026-09-23T00:00:00.000Z',
          body_utf8: JSON.stringify(timeline),
        },
      ],
    },
  };
}

test('source counts use exact recorded categories, keep unknown separate and scope to selected phase', () => {
  const { summary } = summarizeSources(
    capture([
      request('weka_main'),
      request('weka_subagent', { isl: null, osl: 0 }),
      request(undefined),
      request('tool', { phase: 'warmup' }),
      request('main-agent', { phase: 'replay-lane' }),
      request('weka_subagent', { cancelled: true }),
    ]),
    'profiling',
  );
  assert.equal(summary.scope.captured_request_count, 6);
  assert.equal(summary.scope.selected_request_count, 4);
  assert.equal(summary.scope.excluded_phase_count, 2);
  assert.equal(summary.scope.missing_source_count, 1);
  assert.deepEqual(
    summary.groups.map((g) => [g.source_category, g.request_count, g.request_share]),
    [
      ['weka_main', 1, 0.25],
      ['weka_subagent', 2, 0.5],
      [null, 1, 0.25],
    ],
  );
  const subagent = summary.groups[1];
  assert.equal(subagent.metrics.isl.valid_count, 1);
  assert.equal(subagent.metrics.isl.missing_count, 1);
  assert.equal(subagent.metrics.osl.min, 0);
  assert.equal(subagent.metrics.e2e_ms.valid_count, 1);
  assert.equal(subagent.metrics.e2e_ms.excluded_cancelled_count, 1);
  assert.equal(subagent.metrics.e2e_ms.missing_count, 0);
  assert.equal(summary.formal_evidence_bundle, false);
});

test('quantiles are reproducible, nullable latency stays unavailable, cancelled observations are excluded', () => {
  const { summary } = summarizeSources(
    capture([
      ...[0, 10, 20, 100].map((isl) => request('main', { isl, ttftMs: null })),
      request('sub', { cancelled: true }),
    ]),
  );
  assert.deepEqual(summary.groups[0].metrics.isl, {
    valid_count: 4,
    missing_count: 0,
    excluded_cancelled_count: 0,
    min: 0,
    p25: 7.5,
    median: 15,
    p75: 40,
    p95: 87.99999999999997,
    max: 100,
  });
  assert.equal(summary.groups[0].metrics.ttft_ms.missing_count, 4);
  assert.equal(summary.groups[0].metrics.ttft_ms.median, null);
  assert.equal(summary.groups[1].metrics.e2e_ms.valid_count, 0);
  assert.equal(summary.groups[1].metrics.e2e_ms.median, null);
  const ttft = renderSourceChart(summary, 'ttft');
  assert.match(ttft, />—</u);
  assert.match(ttft, /not recorded/u);
  assert.match(ttft, /all cancelled/u);
  assert.match(renderSourceChart(summary, 'input-tokens'), />15</u);
  assert.ok(!renderSourceChart(summary).includes('log(1+x)'));
  assert.ok(!renderSourceChart(summary).includes('NaN'));
  const zeros = summarizeSources(capture([request('zero', { isl: 0, osl: 0, ttftMs: 0, end: 0 })]));
  assert.match(renderSourceChart(zeros.summary, 'input-tokens'), />0</u);
  assert.match(renderSourceChart(zeros.summary, 'e2e'), />0 ms</u);
  assert.ok(!renderSourceChart(zeros.summary).includes('NaN'));
});

test('empty selections and unknown recorded phases are explicit rather than substituted', () => {
  const all = summarizeSources(capture([request('other', { phase: 'replay-lane' })]));
  assert.equal(all.summary.scope.selected_request_count, 1);
  const selected = summarizeSources(
    capture([request('other', { phase: 'replay-lane' })]),
    'profiling',
  );
  assert.equal(selected.summary.groups.length, 0);
  assert.match(renderSourceChart(selected.summary), /No requests in the selected phase/u);
  assert.deepEqual(selected.summary.scope.available_phases, ['replay-lane']);
});

test('mismatched IDs, missing source evidence, filtered captures and malformed rows fail closed', () => {
  const mutations = [
    (c) => {
      c.selected_point.id = 422;
    },
    (c) => {
      c.metadata.requests[0].query_url += '&limit=1';
    },
    (c) => {
      c.metadata.requests[0].query_url = c.metadata.requests[0].query_url.replace('421', '422');
    },
    (c) => {
      c.metadata.requests = [];
    },
    (c) => {
      c.metadata.requests.push(c.metadata.requests[0]);
    },
    (c) => {
      c.timeline.requests.pop();
    },
    (c) => {
      c.outcome = 'trace_unavailable';
    },
    (c) => {
      c.metadata.requests[0].retrieved_at = 'not-a-time';
    },
  ];
  for (const mutate of mutations) {
    const input = capture();
    mutate(input);
    assert.throws(() => summarizeSources(input), { code: 'INVALID_RESPONSE' });
  }
  for (const overrides of [
    { end: -1 },
    { ri: {} },
    { ri: -1 },
    { ri: 0.5 },
    { ri: Number.MAX_SAFE_INTEGER + 1 },
    { start: Number.MAX_SAFE_INTEGER + 1 },
    { cancelled: null },
    { isl: -1 },
    { srcKind: {} },
    { ttftMs: undefined },
  ]) {
    assert.throws(() => summarizeSources(capture([request('x', overrides)])), {
      code: 'INVALID_RESPONSE',
    });
  }
  assert.throws(
    () => summarizeSources(capture(Array.from({ length: 41 }, (_, i) => request(String(i))))),
    /40 recorded categories/u,
  );
});

test('chart argument parsing uses existing output-dir and rejects unknown or duplicate options', () => {
  const parsed = parseOperation([
    'charts',
    'agentx-sources',
    '--input',
    'in.json',
    '--output-dir',
    'new',
  ]);
  assert.deepEqual(normalizeChartArgs(parsed.args, parsed.outputDir), {
    template: 'agentx-sources',
    input: 'in.json',
    outputDir: 'new',
    phase: 'all',
    style: 'both',
    metric: 'requests',
  });
  for (const [args, out] of [
    [['list', '--phase', 'all'], null],
    [['agentx-sources'], 'new'],
    [['x'], null],
    [['agentx-sources', '--input', 'a', '--input', 'b'], 'new'],
    [['agentx-sources', '--input', 'a', '--phase', 'wat'], 'new'],
    [['list'], 'out'],
    [['list', '--style', 'table'], null],
    [['agentx-sources', '--input', 'a', '--style', 'html'], 'new'],
    ...['toString', '__proto__', 'unknown'].map((metric) => [
      ['agentx-sources', '--input', 'a', '--metric', metric],
      'new',
    ]),
    [['agentx-sources', '--input', 'a', '--metric', 'requests', '--metric', 'e2e'], 'new'],
    [['agentx-sources', '--input', 'a', '--style', 'table', '--style', 'chart'], 'new'],
  ]) {
    assert.throws(() => normalizeChartArgs(args, out), { code: 'INVALID_ARGUMENT' });
  }
});

test('saved charts retain evidence, escape SVG, neutralize spreadsheet formulas and never overwrite', async () => {
  const input = join(root, 'capture.json');
  await writeFile(input, JSON.stringify(capture([request('<script>&"'), request('=1+2')])));
  const out = join(root, 'chart');
  const report = await runCharts(['agentx-sources', '--input', input], out);
  const svg = await readFile(join(out, 'chart.svg'), 'utf8');
  assert.ok(!svg.includes('<script>'));
  assert.match(svg, /&lt;script&gt;&amp;&quot;/u);
  assert.match(await readFile(join(out, 'requests.csv'), 'utf8'), /"'=1\+2"/u);
  assert.equal(report.source.selected_result_id, '421');
  assert.deepEqual(await readFile(join(out, 'source.json')), await readFile(input));
  assert.equal(
    JSON.parse(await readFile(join(out, 'summary.json'), 'utf8')).source.capture_sha256,
    report.source.capture_sha256,
  );
  await assert.rejects(runCharts(['agentx-sources', '--input', input], out), {
    code: 'OUTPUT_ERROR',
  });
  assert.equal(await readFile(join(out, 'chart.svg'), 'utf8'), svg);
});

test('chart and table styles share statistics and export only the requested presentation', async () => {
  const input = join(root, 'styles.json');
  await writeFile(
    input,
    JSON.stringify(
      capture([
        request('main', { isl: 0, ttftMs: null }),
        request('main', { isl: 10, ttftMs: 0 }),
        request('sub', { cancelled: true }),
        request(undefined),
      ]),
    ),
  );
  const reports = [];
  for (const style of ['chart', 'table', 'both']) {
    const out = join(root, `${style}-style`);
    const report = await runCharts(['agentx-sources', '--input', input, '--style', style], out);
    const expected = ['source.json', 'summary.json', 'requests.csv'];
    if (style !== 'table') expected.push('chart.svg');
    if (style !== 'chart') expected.push('table.svg', 'table.md', 'summary.csv');
    const written = await readdir(out);
    assert.deepEqual(written.sort(), expected.sort());
    assert.deepEqual([...report.artifacts].sort(), expected.sort());
    reports.push(report);
  }
  assert.deepEqual(reports[0].groups, reports[1].groups);
  assert.deepEqual(reports[1].groups, reports[2].groups);
  const table = await readFile(join(root, 'table-style', 'table.md'), 'utf8');
  assert.match(table, /Result 421.*phase all/u);
  assert.match(table, /4 captured requests selected/u);
  assert.match(table, /srcKind: main \| 2 \| 50% \| 0/u);
  assert.match(table, /Input length \(tokens\)/u);
  assert.match(table, /Completed request TTFT \(ms\)/u);
  assert.match(table, /unavailable/u);
  assert.match(table, /source missing/u);
  assert.match(table, /upstream.*unverified/iu);
  const csv = await readFile(join(root, 'table-style', 'summary.csv'), 'utf8');
  assert.match(
    csv,
    /result_id,phase,source_category,request_count,request_share,cancelled_count,metric,unit,valid_count,missing_count,excluded_cancelled_count,min,p25,median,p75,p95,max/u,
  );
  assert.match(
    csv,
    /"421","all","main","2","0.5","0","ttft_ms","ms","1","1","0","0","0","0","0","0","0"/u,
  );
  assert.match(
    csv,
    /"421","all","sub","1","0.25","1","e2e_ms","ms","0","0","1","","","","","",""/u,
  );
  const svg = await readFile(join(root, 'both-style', 'chart.svg'), 'utf8');
  assert.match(svg, /#0a0d10/u);
  assert.match(svg, /Inter/u);
});

test('table cells cannot inject Markdown or spreadsheet formulas and empty selections stay explicit', async () => {
  const input = join(root, 'table-escape.json');
  await writeFile(
    input,
    JSON.stringify(capture([request('|[click](https://example.org)\n<script>'), request('=1+2')])),
  );
  const out = join(root, 'table-escaped');
  await runCharts(['agentx-sources', '--input', input, '--style', 'table'], out);
  const markdown = await readFile(join(out, 'table.md'), 'utf8');
  assert.ok(!markdown.includes('[click]('));
  assert.ok(!markdown.includes('<script>'));
  assert.match(markdown, /&#124;/u);
  assert.match(await readFile(join(out, 'summary.csv'), 'utf8'), /"'=1\+2"/u);
  const empty = join(root, 'table-empty');
  await runCharts(
    ['agentx-sources', '--input', input, '--style', 'table', '--phase', 'warmup'],
    empty,
  );
  assert.match(
    await readFile(join(empty, 'table.md'), 'utf8'),
    /No requests in the selected phase/u,
  );
  const emptyCsv = await readFile(join(empty, 'summary.csv'), 'utf8');
  assert.equal(emptyCsv.trim().split('\n').length, 1);
});

test('presentation retains tiny positive latencies distinctly from measured zero', async () => {
  const input = join(root, 'small-latencies.json');
  await writeFile(
    input,
    JSON.stringify(
      capture([
        request('tiny', { ttftMs: 0.0004, end: 123400 }),
        request('zero', { ttftMs: 0, end: 0 }),
      ]),
    ),
  );
  const out = join(root, 'small-latencies');
  await runCharts(['agentx-sources', '--input', input], out);
  const table = await readFile(join(out, 'table.md'), 'utf8');
  assert.match(table, /srcKind: tiny \| 1 \| 0 \| 0 \| 0\.0004 \|/u);
  assert.match(table, /srcKind: tiny \| 1 \| 0 \| 0 \| 0\.1234 \|/u);
  assert.match(table, /srcKind: zero \| 1 \| 0 \| 0 \| 0 \|/u);
  const { summary } = summarizeSources(JSON.parse(await readFile(input, 'utf8')));
  const svg = renderSourceChart(summary, 'ttft');
  assert.match(svg, />0\.400 µs</u);
  assert.match(renderSourceChart(summary, 'e2e'), />123 µs</u);
  assert.match(svg, />0 ms</u);
});

test('invalid and oversized inputs create no output directory', async () => {
  const input = join(root, 'bad.json');
  await writeFile(input, '{}');
  const out = join(root, 'not-created');
  await assert.rejects(runCharts(['agentx-sources', '--input', input], out), {
    code: 'INVALID_RESPONSE',
  });
  await assert.rejects(stat(out), { code: 'ENOENT' });
  const { open } = await import('node:fs/promises');
  const file = await open(input, 'w');
  await file.truncate(64 * 1024 * 1024 + 1);
  await file.close();
  await assert.rejects(runCharts(['agentx-sources', '--input', input], out), /64 MiB/u);
});

test('actual npm package and installed Codex/Claude skills discover and render the chart offline', async () => {
  for (const target of ['codex', 'claude']) {
    const cwd = suite.project();
    const installed = suite.install(target, cwd);
    const cli = join(installed, 'scripts/inferencex.mjs');
    const catalog = JSON.parse(succeeded(suite.node([cli, 'charts', 'list'], { cwd })).stdout);
    assert.equal(catalog.templates[0].status, 'available');
    assert.equal(catalog.templates[1].status, 'recipe_only');
    assert.equal(catalog.templates[2].status, 'recommendation_only');
    assert.match(
      succeeded(suite.node([cli, 'describe', 'charts'], { cwd })).stdout,
      /--output-dir/u,
    );
    assert.match(await readFile(join(installed, 'SKILL.md'), 'utf8'), /chart-templates.md/u);
    const input = join(cwd, 'point.json');
    await writeFile(input, JSON.stringify(capture()));
    const result = suite.node(
      [cli, 'charts', 'agentx-sources', '--input', input, '--output-dir', join(cwd, 'charts')],
      { cwd },
    );
    const report = JSON.parse(succeeded(result).stdout);
    assert.equal(report.scope.selected_request_count, 2);
    assert.equal(report.groups.length, 2);
    assert.match(
      await readFile(join(report.output.directory, 'chart.svg'), 'utf8'),
      /Requests by recorded source/u,
    );
  }
  assert.ok(suite.packedFiles.includes('skills/inferencex-api/scripts/charts.mjs'));
  assert.ok(suite.packedFiles.includes('skills/inferencex-api/references/chart-templates.md'));
});

test('charts show one metric; the table image combines counts and medians with explicit units', async () => {
  const input = join(root, 'focused.json');
  await writeFile(
    input,
    JSON.stringify(
      capture([
        request('one', { end: 2_000_000_000, ttftMs: 500, isl: 200 }),
        request('one', { end: 4_000_000_000, ttftMs: 1500, isl: 400 }),
        request('two', { cancelled: true }),
      ]),
    ),
  );
  const { summary } = summarizeSources(JSON.parse(await readFile(input, 'utf8')));
  const counts = renderSourceChart(summary);
  assert.match(counts, />66\.7%</u);
  assert.ok(!counts.includes('p95'));
  assert.match(renderSourceChart(summary, 'input-tokens'), />300</u);
  const latency = renderSourceChart(summary, 'e2e');
  assert.match(latency, />3\.00 s</u);
  assert.match(latency, /all cancelled/u);
  assert.match(renderSourceChart(summary, 'ttft'), />1\.00 s</u);
  const table = renderSourceTable(summary);
  for (const value of ['66.7%', '300', '3.00 s', '1.00 s', 'Cancelled', 'MEDIAN LATENCY'])
    assert.ok(table.includes(`>${value}<`), value);
  const out = join(root, 'focused-latency');
  const result = await runCharts(['agentx-sources', '--input', input, '--metric', 'e2e'], out);
  assert.deepEqual(result.presentation, { metric: 'e2e', style: 'both' });
  assert.equal(result.groups[0].metrics.e2e_ms.median, 3000);
  assert.match(await readFile(join(out, 'chart.svg'), 'utf8'), /Median end-to-end latency/u);
  assert.match(await readFile(join(out, 'table.svg'), 'utf8'), />E2E latency</u);
  assert.match(await readFile(join(out, 'summary.csv'), 'utf8'), /"e2e_ms","ms"/u);
});

test('many sources keep the largest nineteen and fold the rest', () => {
  const requests = Array.from({ length: 40 }, (_, i) =>
    Array.from({ length: 40 - i }, () => request(`source-${String(i).padStart(2, '0')}`)),
  ).flat();
  const { summary } = summarizeSources(capture(requests));
  const counts = renderSourceChart(summary);
  assert.match(counts, /top 19 of 40 sources/u);
  assert.match(counts, />Other \(21 sources\)</u);
  assert.match(counts, />source-00</u);
  assert.ok(!counts.includes('>source-19<'));
  const latency = renderSourceChart(summary, 'e2e');
  assert.ok(!latency.includes('Other ('));
  assert.match(latency, /21 smaller sources with 28\.2% of requests are not shown/u);
  const table = renderSourceTable(summary);
  assert.match(table, />Other \(21 sources\)</u);
  for (const svg of [counts, latency, table]) {
    const height = Number(svg.match(/height="(?<height>\d+)"/u).groups.height);
    assert.ok(height < 1300, `height ${height}`);
    assert.ok(!svg.includes('NaN'));
  }
});

test('table images escape labels and keep empty and missing sources explicit', () => {
  const summary = summarizeSources(capture([request('<script>'), request(undefined)])).summary;
  const svg = renderSourceTable(summary);
  assert.ok(!svg.includes('<script>'));
  assert.match(svg, /&lt;script&gt;/u);
  assert.match(svg, /source missing/u);
  assert.match(
    renderSourceTable(summarizeSources(capture([])).summary),
    /No requests in the selected phase/u,
  );
});
