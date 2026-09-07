import assert from 'node:assert/strict';
import { readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { before, test } from 'node:test';
import { pathToFileURL } from 'node:url';
import { packageInfo, packedSkillSuite, succeeded } from './packed-skill.mjs';

const suite = packedSkillSuite();
let installed;
const guard = join(suite.temporaryRoot, 'offline.mjs');
before(() => {
  installed = suite.install('codex');
  writeFileSync(
    guard,
    "globalThis.fetch = () => { throw new Error('version must be offline'); };\n",
  );
});
[
  'export-powerx',
  'export-agentx',
  'investigate-result',
  'compare-tco',
  'compare-releases',
  'compare-collectivex',
  'verify-export',
].forEach((name) => {
  test(`${name} reports the installed package version offline without required arguments or output files`, () => {
    const cwd = suite.project();
    const result = succeeded(
      suite.node(
        [
          '--import',
          pathToFileURL(guard).href,
          join(installed, `scripts/${name}.mjs`),
          '--version',
        ],
        { cwd },
      ),
    );
    assert.equal(result.stdout, `${packageInfo.version}\n`);
    assert.equal(result.stderr, '');
    assert.deepEqual(readdirSync(cwd), []);
  });
});
