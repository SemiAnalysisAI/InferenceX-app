import fs from 'node:fs';
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { mapBenchmarkRow, type BenchmarkParams } from './benchmark-mapper';
import { createSkipTracker } from './skip-tracker';
import { CHANGELOG_ARTIFACT_NAME, REQUIRED_POWER_MANIFEST } from '../lib/ci-artifact-preparation';

type JsonRow = Record<string, unknown>;
export interface RequiredPowerSource {
  runId: number;
  runAttempt: number;
  headSha: string | null;
}
export interface BenchmarkArtifactRows {
  path: string;
  rows: unknown[];
}

function object(value: unknown, label: string): JsonRow {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error(`Required power: invalid ${label}`);
  return value as JsonRow;
}

function identity(
  fingerprint: unknown,
  conc: unknown,
  scenario: string,
  isl: unknown,
  osl: unknown,
) {
  if (typeof fingerprint !== 'string' || !/^[a-f0-9]{64}$/u.test(fingerprint))
    throw new Error('Required power: missing or invalid recipe fingerprint');
  if (typeof conc !== 'number' || !Number.isSafeInteger(conc) || conc <= 0)
    throw new Error('Required power: invalid concurrency');
  return JSON.stringify([fingerprint, conc, scenario, isl, osl]);
}

function mappedIdentity(row: BenchmarkParams): string {
  return JSON.stringify([row.recipeFingerprint, row.conc, row.benchmarkType, row.isl, row.osl]);
}

/** A purge or later ingest filter must not turn an incomplete required scope into success. */
export function assertRequiredPowerPointsRetained(
  required: readonly BenchmarkParams[],
  retained: readonly BenchmarkParams[],
): void {
  const present = new Set(retained.map(mappedIdentity));
  for (const row of required) {
    const key = mappedIdentity(row);
    if (!present.has(key))
      throw new Error(`Required power: missing benchmark point after ingest ${key}`);
  }
}

/** Validate only the producer-declared required scope; legacy optional points remain unchanged. */
export function verifyRequiredPowerPublication(
  manifestValue: unknown,
  artifacts: readonly BenchmarkArtifactRows[],
  source: RequiredPowerSource,
): BenchmarkParams[] {
  const manifest = object(manifestValue, 'sweep manifest');
  const declaredAttempt = manifest['run-attempt'];
  if (
    manifest['run-id'] !== source.runId ||
    typeof declaredAttempt !== 'number' ||
    !Number.isSafeInteger(declaredAttempt) ||
    declaredAttempt <= 0 ||
    declaredAttempt > source.runAttempt ||
    !source.headSha ||
    manifest.head !== source.headSha
  )
    throw new Error('Required power: manifest source run, attempt or head does not match');

  const matrix = object(manifest.matrix, 'sweep matrix');
  const expected = new Map<string, boolean>();
  for (const topology of ['single_node', 'multi_node']) {
    const buckets = object(matrix[topology], topology);
    for (const [scenario, entries] of Object.entries(buckets)) {
      if (!Array.isArray(entries)) throw new Error(`Required power: invalid ${scenario} matrix`);
      for (const value of entries) {
        const row = object(value, 'matrix row');
        if (row['require-power'] !== true || row['eval-only'] === true) continue;
        if (!['1k1k', '8k1k', 'agentic'].includes(scenario))
          throw new Error(`Required power: unsupported scenario ${scenario}`);
        const agentic = scenario === 'agentic';
        const isl = agentic ? null : row.isl;
        const osl = agentic ? null : row.osl;
        if (!agentic && (isl !== (scenario === '8k1k' ? 8192 : 1024) || osl !== 1024))
          throw new Error(`Required power: inconsistent sequence lengths for ${scenario}`);
        const concurrencies = Array.isArray(row.conc) ? row.conc : [row.conc];
        if (concurrencies.length === 0) throw new Error('Required power: empty concurrency list');
        for (const conc of concurrencies) {
          const key = identity(
            row['recipe-fingerprint'],
            conc,
            agentic ? 'agentic_traces' : 'single_turn',
            isl,
            osl,
          );
          if (expected.has(key)) throw new Error(`Required power: duplicate matrix point ${key}`);
          expected.set(key, row.disagg === true);
        }
      }
    }
  }
  if (expected.size === 0)
    throw new Error('Required power: manifest has no required benchmark points');

  const seen = new Map<string, { row: JsonRow; path: string; point: BenchmarkParams }>();
  for (const artifact of artifacts) {
    const inFile = new Set<string>();
    for (const value of artifact.rows) {
      if (!value || typeof value !== 'object' || Array.isArray(value)) continue;
      const raw = value as JsonRow;
      const mapped = mapBenchmarkRow(raw, createSkipTracker());
      if (!mapped) continue;
      const fingerprint = mapped.recipeFingerprint;
      // A missing fingerprint cannot match a required point; the missing-point check fails below.
      if (typeof fingerprint !== 'string' || !/^[a-f0-9]{64}$/u.test(fingerprint)) continue;
      const key = mappedIdentity(mapped);
      if (!expected.has(key)) continue;
      if (inFile.has(key))
        throw new Error(`Required power: duplicate point ${key} in ${artifact.path}`);
      inFile.add(key);
      const prior = seen.get(key);
      if (prior) {
        // collect-results uploads exact copies of per-job rows in results_bmk.
        if (prior.path === artifact.path || !isDeepStrictEqual(prior.row, raw))
          throw new Error(
            `Required power: conflicting or duplicate point ${key} in ${artifact.path}`,
          );
        continue;
      }
      if (raw.power_valid !== 1 || raw.power_metric_schema_version !== 2)
        throw new Error(`Required power: invalid power verdict for ${key}`);
      const fields = [
        'avg_power_w',
        'avg_total_gpu_power_w',
        'total_gpu_energy_j',
        'joules_per_output_token',
      ];
      if (expected.get(key))
        fields.push(
          'prefill_gpu_energy_j',
          'decode_gpu_energy_j',
          'prefill_joules_per_input_token',
          'decode_joules_per_output_token',
        );
      for (const field of fields) {
        const metric = raw[field];
        if (typeof metric !== 'number' || !Number.isFinite(metric) || metric <= 0)
          throw new Error(`Required power: ${field} must be finite and positive for ${key}`);
      }
      seen.set(key, { row: raw, path: artifact.path, point: mapped });
    }
  }
  for (const key of expected.keys()) {
    if (!seen.has(key)) throw new Error(`Required power: missing benchmark point ${key}`);
  }
  return [...seen.values()].map(({ point }) => point);
}

/** Run before any database upsert, including workflow/config metadata writes. */
export function verifyRequiredPowerArtifacts(
  root: string,
  source: RequiredPowerSource,
): BenchmarkParams[] {
  const manifestDir = path.join(root, REQUIRED_POWER_MANIFEST);
  if (!fs.existsSync(manifestDir)) {
    const metadataDir = path.join(root, CHANGELOG_ARTIFACT_NAME);
    if (fs.existsSync(metadataDir)) {
      for (const name of fs.readdirSync(metadataDir).filter((file) => file.endsWith('.json'))) {
        const metadata = JSON.parse(fs.readFileSync(path.join(metadataDir, name), 'utf8'));
        if (metadata?.['require-power'] === true)
          throw new Error('Required power: sweep manifest missing for required changelog scope');
      }
    }
    return [];
  }
  const manifest = JSON.parse(
    fs.readFileSync(path.join(manifestDir, 'sweep_manifest.json'), 'utf8'),
  );
  const artifacts: BenchmarkArtifactRows[] = [];
  for (const name of fs.readdirSync(root)) {
    if (!name.startsWith('bmk_') && !name.startsWith('results_')) continue;
    const dir = path.join(root, name);
    if (!fs.statSync(dir).isDirectory()) continue;
    for (const file of fs.readdirSync(dir)) {
      if (!file.endsWith('.json')) continue;
      const data = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
      artifacts.push({ path: path.join(name, file), rows: Array.isArray(data) ? data : [data] });
    }
  }
  const points = verifyRequiredPowerPublication(manifest, artifacts, source);
  // Rerun-failed-jobs keeps successful points and metadata from earlier attempts of this head.
  console.log(
    `  Required power scope: run ${source.runId}, declared attempt ${manifest['run-attempt']}, ingest attempt ${source.runAttempt}`,
  );
  return points;
}
