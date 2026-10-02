import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = resolve(import.meta.dirname, '../../..');
const PROFILE_PATH = 'packages/app/src/lib/system-power-model.profiles.json';
const MANIFEST_PATH = 'packages/app/src/lib/system-power-model.provenance.json';
const SOURCE_PATHS = [
  'packages/app/src/lib/modeled-system-power.ts',
  PROFILE_PATH,
  'packages/app/src/lib/system-power-model.ts',
];
const sha256 = (value: string | Uint8Array) => createHash('sha256').update(value).digest('hex');

export async function buildSystemPowerProvenance(root = ROOT) {
  const sourceSha256 = Object.fromEntries(
    await Promise.all(
      SOURCE_PATHS.map(async (path) => [path, sha256(await readFile(resolve(root, path)))]),
    ),
  );
  return {
    modelRevision: `app-sha256:${sha256(JSON.stringify(sourceSha256))}`,
    modelRevisionStatus: 'App-owned TypeScript equations, parameters and admission/PUE policy',
    source: 'https://github.com/SemiAnalysisAI/InferenceX-app',
    status: 'DRAFT / pending human verification',
    assumptionsSource: `${PROFILE_PATH}#/assumptions`,
    rackAssumptionsSource: `${PROFILE_PATH}#/rackAssumptions`,
    sourceSha256,
  };
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length > 1 || (args.length === 1 && args[0] !== '--check'))
    throw new Error('Usage: bun packages/app/scripts/update-system-power-provenance.ts [--check]');
  const current = await buildSystemPowerProvenance();
  const target = resolve(ROOT, MANIFEST_PATH);
  if (args[0] === '--check') {
    const stored = JSON.parse(await readFile(target, 'utf8'));
    if (JSON.stringify(stored) !== JSON.stringify(current))
      throw new Error('Model provenance is stale; run this script without --check.');
  } else {
    await writeFile(target, `${JSON.stringify(current, null, 2)}\n`);
  }
  console.log(current.modelRevision);
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  await main();
}
