import { at, rows, safePath, text, type Bundle, type Json } from './bundle';

export interface ServingCell {
  id: string;
  concurrency: number;
  cell: Json;
  run: Json;
  job: Json;
  power: Json;
  spec: Json;
  runPath: string;
  jobPath: string;
  powerPath: string;
  specPath: string;
}

function requireValue(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Invalid H3 serving matrix: ${message}`);
}

function canonical(value: Json): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value !== null && typeof value === 'object')
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`)
      .join(',')}}`;
  return JSON.stringify(value);
}

/** Read the backend's single-runtime matrix without manufacturing paired results. */
export function servingCells(
  bundle: Pick<Bundle, 'documents' | 'checksums' | 'manifest' | 'ci'>,
): ServingCell[] {
  const { documents, checksums, manifest, ci } = bundle;
  if (!documents.has('serving-smoke.json')) return [];
  const matrix = documents.get('serving-smoke.json') ?? null;
  const cells = at(matrix, 'cells');
  requireValue(
    at(matrix, 'schema_version') === '1.0.0' &&
      at(matrix, 'bundle_type') === 'h3_serving_smoke_matrix' &&
      ['running', 'failed', 'complete'].includes(text(at(matrix, 'status'))) &&
      Array.isArray(cells) &&
      cells.length > 0 &&
      cells.length <= 3,
    'unsupported matrix contract',
  );
  requireValue(
    at(manifest, 'mode') === 'serving-smoke' &&
      at(ci, 'mode') === 'serving-smoke' &&
      at(ci, 'run_id') === at(manifest, 'run_id') &&
      at(ci, 'run_attempt') === at(manifest, 'run_attempt') &&
      at(ci, 'source_sha') === at(manifest, 'git_commit'),
    'CI identity does not match the manifest',
  );
  requireValue(
    checksums.has('serving-smoke.json') &&
      checksums.get('serving-smoke.json') === at(manifest, 'evidence', 'serving-smoke.json'),
    'summary is not bound to the manifest',
  );
  const plan = at(matrix, 'plan');
  const devices = rows(at(matrix, 'gpu_uuids'));
  requireValue(
    plan !== null &&
      canonical(plan) === canonical(at(manifest, 'workload_plan')) &&
      devices.length > 0 &&
      new Set(devices).size === devices.length &&
      devices.every((device) => typeof device === 'string' && device.startsWith('GPU-')),
    'workload or GPU identity is missing or inconsistent',
  );
  const seen = new Set<number>();
  return cells.map((cell): ServingCell => {
    const concurrency = at(cell, 'concurrency');
    requireValue(
      typeof concurrency === 'number' && [1, 2, 4].includes(concurrency) && !seen.has(concurrency),
      'invalid or duplicate concurrency',
    );
    seen.add(concurrency);
    const id = `c${concurrency}`;
    const root = `gpu/${id}`;
    const runPath = `${root}/baseline/run.json`;
    const jobPath = `${root}/gpu-job.json`;
    const powerPath = `${root}/power.json`;
    const specPath = `${root}/spec.json`;
    const linked = (field: string, path: string): Json => {
      const reference = at(cell, field);
      if (reference === null) return null;
      requireValue(
        at(reference, 'path') === path &&
          checksums.has(path) &&
          checksums.get(path) === at(reference, 'sha256') &&
          documents.has(path),
        `${id} ${field} reference or SHA256 does not match`,
      );
      return documents.get(path) ?? null;
    };
    const run = linked('run', runPath);
    const job = linked('receipt', jobPath);
    const power = linked('power', powerPath);
    const spec = documents.get(specPath) ?? null;
    requireValue(
      ['not_started', 'running', 'failed', 'complete'].includes(text(at(cell, 'status'))) &&
        typeof at(cell, 'verified') === 'boolean',
      `${id} has an invalid execution status`,
    );
    if (at(cell, 'verified') === true)
      requireValue(
        run && job && spec && at(cell, 'status') === 'complete',
        `${id} verified evidence is missing`,
      );
    if (job) {
      requireValue(
        at(job, 'schema_version') === '0.1.0' &&
          at(job, 'bundle_type') === 'controlled_serving_smoke' &&
          at(job, 'job_id') ===
            `github-${text(at(manifest, 'run_id'))}-${text(at(manifest, 'run_attempt'))}-${id}` &&
          spec &&
          checksums.has(specPath) &&
          at(job, 'spec_sha256') === checksums.get(specPath) &&
          canonical(at(spec, 'plan')) === canonical(plan) &&
          canonical(at(spec, 'gpu_uuids')) === canonical(devices) &&
          canonical(at(spec, 'baseline')) === canonical(at(matrix, 'runtime')) &&
          at(spec, 'serving', 'concurrency') === concurrency &&
          at(spec, 'serving', 'mode') === 'closed_loop',
        `${id} supervisor, workload or hardware identity does not match`,
      );
      if (at(cell, 'verified') === true)
        requireValue(
          at(job, 'measurement_verified') === true &&
            at(job, 'status') === 'complete' &&
            at(job, 'cleanup_status') === 'clean' &&
            at(job, 'evidence_kind') === 'controlled_h3_gpu',
          `${id} does not contain verified, complete GPU execution`,
        );
    }
    if (run) {
      requireValue(
        job &&
          at(job, 'roles', 'baseline', 'run_path') === 'baseline/run.json' &&
          at(job, 'roles', 'baseline', 'run_sha256') === checksums.get(runPath) &&
          at(run, 'bundle_type') === 'mvp_run' &&
          at(run, 'bundle_version') === '0.1.0' &&
          ['operator_endpoint', 'live_h3'].includes(text(at(run, 'evidence_kind'))) &&
          canonical(at(run, 'plan')) === canonical(plan) &&
          at(run, 'plan_sha256') === at(job, 'plan_sha256') &&
          at(run, 'configuration', 'runtime_revision') === at(matrix, 'runtime', 'revision') &&
          at(run, 'configuration', 'model_revision') === at(plan, 'model_revision') &&
          at(run, 'measurement', 'boundary') === 'submit_to_downloaded_media' &&
          at(run, 'measurement', 'concurrency') === concurrency &&
          at(run, 'configuration', 'serving', 'concurrency') === concurrency,
        `${id} request run does not match its execution`,
      );
      if (at(cell, 'verified') === true)
        requireValue(
          canonical(at(run, 'measurement')) === canonical(at(cell, 'metrics', 'measurement')) &&
            canonical(at(run, 'serving')) === canonical(at(cell, 'metrics', 'serving')) &&
            at(run, 'serving', 'client_ready_latency_seconds', 'p50') ===
              at(cell, 'metrics', 'client_ready_p50_seconds') &&
            at(run, 'summary', 'valid_clips_per_second') ===
              at(cell, 'metrics', 'valid_clips_per_second') &&
            ['scheduled', 'completed', 'valid', 'failed'].every(
              (key) => at(run, 'summary', key) === at(cell, 'completion', key),
            ),
          `${id} matrix metrics differ from the raw request run`,
        );
      for (const record of rows(at(run, 'records'))) {
        const relative = text(at(record, 'artifact_path'));
        if (relative) {
          const mediaPath = `${root}/baseline/${safePath(relative)}`;
          requireValue(
            checksums.has(mediaPath) && checksums.get(mediaPath) === at(record, 'sha256'),
            `${id} media identity does not match`,
          );
        }
      }
    }
    if (power)
      requireValue(
        at(power, 'schema_version') === '1.0.0' &&
          canonical(at(power, 'phases')) === canonical(at(cell, 'power', 'phases')),
        `${id} power summary does not match the recorded phases`,
      );
    return { id, concurrency, cell, run, job, power, spec, runPath, jobPath, powerPath, specPath };
  });
}
