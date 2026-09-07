import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

import { packageInfo, packageRoot, packedSkillSuite, succeeded } from './packed-skill.mjs';

const suite = packedSkillSuite();
const legacyArchive = join(
  packageRoot,
  'test/fixtures/semianalysisai-inferencex-skills-0.11.0.tgz',
);

test('the published 0.11 archive upgrades without deleting user-owned files', () => {
  assert.equal(
    createHash('sha256').update(readFileSync(legacyArchive)).digest('hex'),
    'ec2dd84c67e1feb59492217f3549bd2989aae3bb4f6dba694c45c8cbf250af5f',
  );
  const cwd = suite.project();
  succeeded(suite.run(['install', '--target', 'codex'], cwd, legacyArchive));
  const skill = join(cwd, '.agents/skills/inferencex-api');
  const neighboring = join(cwd, '.agents/skills/user-skill');
  writeFileSync(join(skill, 'user-notes.txt'), 'preserve me');
  mkdirSync(neighboring);
  writeFileSync(join(neighboring, 'SKILL.md'), 'neighbor');
  const transaction = `${skill}.inferencex-skills-transaction`;
  mkdirSync(transaction);
  cpSync(skill, join(transaction, 'stage'), { recursive: true });
  const transactionId = randomUUID();
  const ownerPid = 2_147_483_647;
  writeFileSync(
    join(transaction, `owner-${transactionId}-${ownerPid}-${randomUUID()}.json`),
    JSON.stringify({
      schema_version: 1,
      transaction_id: transactionId,
      package: packageInfo.name,
      skill: 'inferencex-api',
      destination: skill,
      owner_pid: ownerPid,
      phase: 'staged',
      had_destination: true,
    }),
  );

  const upgraded = succeeded(suite.run(['install', '--target', 'codex', '--force'], cwd));
  assert.match(upgraded.stdout, new RegExp(`Installed version: ${packageInfo.version}`));
  assert.equal(readFileSync(join(skill, 'user-notes.txt'), 'utf8'), 'preserve me');
  assert.equal(readFileSync(join(neighboring, 'SKILL.md'), 'utf8'), 'neighbor');
  assert.ok(existsSync(join(skill, 'scripts/inferencex.mjs')));
  assert.ok(existsSync(join(skill, 'scripts/export-powerx.mjs')));
  assert.ok(existsSync(join(skill, 'scripts/verify-export.mjs')));
  assert.equal(existsSync(transaction), false);

  const directHelp = suite.node([join(skill, 'scripts/export-powerx.mjs'), '--help']);
  assert.equal(directHelp.status, 0, directHelp.stderr);
  assert.match(directHelp.stdout, /export-powerx/u);
  const legacyText = suite.node([join(skill, 'scripts/verify-export.mjs')]);
  assert.equal(legacyText.status, 2);
  assert.equal(legacyText.stdout, '');
  assert.match(legacyText.stderr, /^verify-export:/u);
});
