import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, test } from 'node:test';

import {
  normalizeChartArgs,
  renderSourceChart,
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
  assert.match(renderSourceChart(summary), /unavailable/u);
  assert.match(renderSourceChart(summary), /log\(1\+x\) scale/u);
  assert.match(renderSourceChart(summary), /median 15/u);
  assert.ok(!renderSourceChart(summary).includes('NaN'));
  const zeros = summarizeSources(capture([request('zero', { isl: 0, osl: 0, ttftMs: 0, end: 0 })]));
  assert.match(renderSourceChart(zeros.summary), /median 0/u);
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
  });
  for (const [args, out] of [
    [['list', '--phase', 'all'], null],
    [['agentx-sources'], 'new'],
    [['x'], null],
    [['agentx-sources', '--input', 'a', '--input', 'b'], 'new'],
    [['agentx-sources', '--input', 'a', '--phase', 'wat'], 'new'],
    [['list'], 'out'],
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
      /AgentX requests/u,
    );
  }
  assert.ok(suite.packedFiles.includes('skills/inferencex-api/scripts/charts.mjs'));
  assert.ok(suite.packedFiles.includes('skills/inferencex-api/references/chart-templates.md'));
});
