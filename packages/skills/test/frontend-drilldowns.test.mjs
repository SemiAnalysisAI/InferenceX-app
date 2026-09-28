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
    assert.match(recipe, /\/api\/v1\/views\/dataset/u);
    assert.match(recipe, /\/api\/v1\/views\/agentx-catalog/u);
    assert.match(recipe, /\/api\/v1\/views\/agentx-point/u);
    assert.match(recipe, /\/api\/v1\/views\/evaluation-samples/u);
    assert.match(recipe, /\/api\/v1\/views\/gpu-specs/u);
    assert.match(recipe, /\/api\/v1\/views\/inference/u);
    assert.match(recipe, /cc-traces-weka-062126-256k/u);
    assert.match(recipe, /at most 100 characters/u);
    assert.match(recipe, /radar\.series/u);
    assert.match(recipe, /currentConfig/u);
    assert.doesNotMatch(recipe, /\/api\/v1\/views\/operatorx/u);
  });
}
