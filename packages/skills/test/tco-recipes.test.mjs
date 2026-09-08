import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

import { packedSkillSuite, succeeded } from './packed-skill.mjs';

const suite = packedSkillSuite();
const row = (id, metrics, overrides = {}) => ({
  id,
  model: 'dsv4',
  hardware: 'b200',
  benchmark_type: 'single_turn',
  isl: 8192,
  osl: 1024,
  conc: 8,
  date: '2026-08-07',
  run_url: 'https://github.com/SemiAnalysisAI/InferenceX/actions/runs/30937733020/attempts/1',
  metrics,
  ...overrides,
});

test('installed tail-latency recipe evaluates actual P99 ITL and keeps unresolved rows', () => {
  const project = suite.project();
  const skill = suite.install('codex', project);
  const cookbook = readFileSync(join(skill, 'references/tco.md'), 'utf8');
  const section = cookbook.split('## Check a P99 ITL constraint\n')[1]?.split('\n## ')[0];
  const snippet = section?.match(
    /```bash\nnode --input-type=module - .* <<'JS'\n(?<code>[\s\S]*?)\nJS\n```/u,
  );
  assert.ok(snippet, 'the installed cookbook contains an executable P99 ITL recipe');
  const rows = [
    row('438804', { p99_itl: 0.05700164780020714, p99_intvty: 50.79342177879253 }, { conc: 1024 }),
    row(
      '434362',
      { p99_itl: 0.05607323992240702, p99_intvty: 53.10656552068859 },
      { hardware: 'mi355x', conc: 32 },
    ),
    row('below', { p99_itl: 0.019999 }, { conc: 1.5 }),
    row('boundary', { p99_itl: 0.02 }, { conc: 1 }),
    row('missing', {}, { conc: undefined }),
    row('null', { p99_itl: null }, { conc: null }),
    row('string', { p99_itl: '0.001' }, { conc: '8' }),
    row('negative', { p99_itl: -0.001 }, { conc: -1 }),
    row('overflow', { p99_itl: 'NONFINITE_FIXTURE' }, { conc: 0 }),
    row('other-workload', { p99_itl: 0.001 }, { isl: 1024 }),
  ];
  const input = join(project, 'history.body');
  const bytes = JSON.stringify(rows).replace('"NONFINITE_FIXTURE"', '1e400');
  writeFileSync(input, bytes);
  const result = succeeded(
    suite.node(['--input-type=module', '-', input], {
      cwd: project,
      input: snippet.groups.code,
    }),
  );
  const output = JSON.parse(result.stdout);
  assert.equal(output.matching_rows, 9);
  assert.deepEqual(
    output.rows.map(({ id, p99_itl_under_20ms }) => [id, p99_itl_under_20ms]),
    [
      ['438804', 'fail'],
      ['434362', 'fail'],
      ['below', 'pass'],
      ['boundary', 'fail'],
      ['missing', 'unknown'],
      ['null', 'unknown'],
      ['string', 'unknown'],
      ['negative', 'unknown'],
      ['overflow', 'unknown'],
    ],
  );
  assert.equal(output.rows[0].p99_itl_ms, 57.00164780020714);
  assert.equal(output.rows[1].p99_itl_ms, 56.07323992240702);
  assert.equal(output.rows[4].p99_itl_ms, null);
  assert.deepEqual(
    output.rows.map(({ concurrency }) => concurrency),
    [1024, 32, null, 1, null, null, null, null, null],
  );
  assert.equal(output.rows[6].conc, '8', 'invalid raw concurrency is retained for diagnosis');
  assert.equal(output.rows[0].run_url, rows[0].run_url);
  assert.equal(readFileSync(input, 'utf8'), bytes, 'the complete capture remains unchanged');
});
