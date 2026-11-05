import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { pathToFileURL } from 'node:url';
import { agenticP90Interactivity } from '../skills/inferencex-api/scripts/agentic-interactivity.mjs';
import { packedSkillSuite } from './packed-skill.mjs';

const cases = JSON.parse(
  readFileSync(new URL('fixtures/agentic-interactivity.json', import.meta.url)),
);
const suite = packedSkillSuite();

for (const fixture of cases) {
  test(fixture.name, () => {
    const result = agenticP90Interactivity(fixture.metrics);
    assert.equal(result?.value ?? null, fixture.expected);
    assert.equal(result?.sourceMetric ?? null, fixture.source);
    if (result) assert.equal(result.statistic, 'p90');
  });
}

test('invalid and overflowing latency never becomes a zero or infinite operating point', () => {
  for (const value of [NaN, Infinity, -Infinity, Number.MIN_VALUE]) {
    assert.equal(agenticP90Interactivity({ p90_full_response_itl: value, p90_itl: 0.025 }), null);
  }
  assert.equal(agenticP90Interactivity(null), null);
});

test('the installed skill retains the helper, definition and default-workflow routing', async () => {
  const installed = suite.install('codex');
  const helper = await import(
    pathToFileURL(join(installed, 'scripts/agentic-interactivity.mjs')).href
  );
  for (const fixture of cases) {
    assert.equal(helper.agenticP90Interactivity(fixture.metrics)?.value ?? null, fixture.expected);
  }
  const guide = readFileSync(join(installed, 'SKILL.md'), 'utf8');
  assert.match(guide, /references\/agentic-interactivity\.md/u);
  const recipe = readFileSync(join(installed, 'references/agentic-interactivity.md'), 'utf8');
  assert.match(recipe, /scripts\/agentic-interactivity\.mjs/u);
  assert.match(recipe, /interactivity\.statistic=p90/u);
  assert.match(recipe, /does not accept a `percentile` query parameter/u);
});
