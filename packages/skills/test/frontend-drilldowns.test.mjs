import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { packedSkillSuite } from './packed-skill.mjs';

const suite = packedSkillSuite();
for (const agent of ['codex', 'claude']) {
  test(`${agent} receives the routed frontend drilldown recipe in the packed install`, () => {
    const skill = suite.install(agent, suite.project());
    const hub = readFileSync(join(skill, 'SKILL.md'), 'utf8');
    const recipe = readFileSync(
      join(skill, 'references/frontend-drilldowns.md'),
      'utf8',
    ).replaceAll(/\s+/gu, ' ');
    assert.match(hub, /references\/frontend-drilldowns\.md/u);
    for (const view of [
      'dataset',
      'agentx-catalog',
      'agentx-point',
      'evaluation-samples',
      'gpu-specs',
      'inference',
    ]) {
      assert.ok(recipe.includes(`/api/v1/views/${view}`), view);
    }
    for (const invariant of [
      'maxGroupTokens',
      'that page',
      'effectivePhase',
      'microsecond quantization',
      'before visibility filtering',
      'baselineConfig',
      'deployed',
      'raw timeline',
    ])
      assert.ok(recipe.includes(invariant), invariant);
  });
}
