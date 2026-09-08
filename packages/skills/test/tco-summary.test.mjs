import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { packedSkillSuite, succeeded } from './packed-skill.mjs';
import { tcoFeed, tcoPoint } from './tco-bundle-fixtures.mjs';

const suite = packedSkillSuite();
function run(rows, options = {}) {
  const project = suite.project();
  const skill = suite.install('codex', project);
  const input = join(project, 'feed.body');
  const report = join(project, 'report.md');
  writeFileSync(input, JSON.stringify(tcoFeed(rows, options.feed)));
  if (options.existing) writeFileSync(report, 'keep me');
  const result = suite.node(
    [
      join(skill, 'scripts/tco-summary.mjs'),
      '--input',
      input,
      '--model',
      'dsv4',
      '--workloads',
      '1024x1024',
      '--target',
      '50',
      '--date',
      '2026-09-06',
      '--hardware-a',
      'b200',
      '--hardware-b',
      'mi355x',
      '--report',
      report,
      ...(options.args ?? []),
    ],
    { cwd: project },
  );
  return { result, input, report };
}

test('installed missing-price summary binds the boundary to scope and a conditional conclusion', () => {
  const { result, report } = run([
    tcoPoint('b200', { output_tput_per_gpu: 2508.931 }),
    tcoPoint('mi355x', { output_tput_per_gpu: 517.56 }),
  ]);
  const value = JSON.parse(succeeded(result).stdout);
  assert.equal(value.price_status, 'missing');
  assert.equal(value.cost_winner, null);
  assert.equal(value.comparisons[0].price_a_over_b_at_equal_cost, 4.847613803230544);
  assert.equal(value.comparisons[0].workload, '1024x1024');
  assert.equal(value.comparisons[0].a.point.hardware, 'b200');
  assert.equal(value.scope.interactivity_statistic, 'median');
  assert.equal(value.units.gpu_hourly_price, 'USD per GPU-hour');
  assert.match(value.source.sha256, /^[a-f0-9]{64}$/u);
  const markdown = readFileSync(report, 'utf8');
  assert.ok(markdown.includes(value.conclusion));
  assert.match(markdown, /4\.847613803230544/u);
  assert.match(value.conclusion, /undetermined/u);
});

test('boundary stays unavailable for a missing, zero or clamped point', () => {
  for (const b of [
    null,
    tcoPoint('mi355x', { output_tput_per_gpu: 0 }),
    tcoPoint('mi355x', {
      boundary: 'clamped_low',
      is_interpolated: false,
      frontier_min_interactivity: 75,
      evidence_date: { from: '2026-09-02', to: '2026-09-02' },
    }),
  ]) {
    const { result } = run([tcoPoint(), ...(b ? [b] : [])]);
    const value = JSON.parse(succeeded(result).stdout);
    assert.equal(value.comparisons[0].price_a_over_b_at_equal_cost, null);
    assert.equal(value.comparisons[0].status, 'unavailable');
    assert.equal(value.cost_winner, null);
  }
});

test('invalid captures and selectors fail before producing a report', () => {
  for (const [rows, options] of [
    [[tcoPoint(), tcoPoint()], {}],
    [[tcoPoint()], { feed: { model: 'another-model' } }],
    [[tcoPoint()], { args: ['--hardware-b', 'b200'] }],
    [[tcoPoint()], { args: ['--gpu-hourly-prices', 'b200=1'] }],
  ]) {
    const { result } = run(rows, options);
    assert.notEqual(result.status, 0);
    assert.equal(result.stdout, '');
    assert.ok(
      ['INVALID_ARGUMENT', 'INVALID_RESPONSE'].includes(JSON.parse(result.stderr).error.code),
    );
  }
});

test('the summary refuses to overwrite a report', () => {
  const { result, report } = run([tcoPoint()], { existing: true });
  assert.notEqual(result.status, 0);
  assert.equal(JSON.parse(result.stderr).error.code, 'OUTPUT_ERROR');
  assert.equal(readFileSync(report, 'utf8'), 'keep me');
});
