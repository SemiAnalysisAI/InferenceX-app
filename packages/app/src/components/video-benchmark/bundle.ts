export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
export const ROLES = ['baseline', 'candidate'] as const;
export function at(value: Json | undefined, ...keys: (string | number)[]): Json {
  for (const key of keys) {
    if (value === null || typeof value !== 'object') return null;
    value = (value as Record<string | number, Json>)[key];
  }
  return value ?? null;
}
export function rows(value: Json): Json[] {
  return Array.isArray(value) ? value : [];
}
export function entries(value: Json): [string, Json][] {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? Object.entries(value)
    : [];
}
export function number(value: Json): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}
/**
 * Clip length a plan requests: its `duration_seconds`, or `frame_count / fps` for plans that
 * request frames (Wan-style specs carry no separate nominal duration).
 */
export function generationDuration(generation: Json): number | null {
  const seconds = number(at(generation, 'duration_seconds'));
  if (seconds !== null) return seconds > 0 ? seconds : null;
  const frames = number(at(generation, 'frame_count')),
    fps = number(at(generation, 'fps'));
  return frames !== null && fps !== null && frames > 0 && fps > 0 ? frames / fps : null;
}
export function text(value: Json): string {
  return typeof value === 'string' ? value : '';
}
/** Key-sorted JSON, so two documents compare equal whatever their key order. */
export function canonical(value: Json): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value !== null && typeof value === 'object')
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`)
      .join(',')}}`;
  return JSON.stringify(value);
}
export function safePath(path: string): string {
  if (
    !path ||
    path.split('/').some((p) => !p || p === '.' || p === '..') ||
    /[\\:%?#]/u.test(path) ||
    [...path].some((c) => (c.codePointAt(0) ?? 0) < 32) ||
    path.startsWith('/')
  ) {
    throw new Error(`Unsafe artifact path: ${path}`);
  }
  return path;
}
export async function sha256(blob: Blob): Promise<string> {
  return Array.from(
    new Uint8Array(await crypto.subtle.digest('SHA-256', await blob.arrayBuffer())),
    (b) => b.toString(16).padStart(2, '0'),
  ).join('');
}
export interface Bundle {
  manifest: Json;
  result: Json;
  report: Json;
  job: Json;
  ci: Json;
  comparison: Json;
  files: Map<string, Blob>;
  documents: Map<string, Json>;
  checksums: Map<string, string>;
  manifestSha256: string;
}
/**
 * Reads and hashes every SHA256SUMS path that `include` accepts. Skipped paths keep their
 * sealed checksum, so manifest evidence and media identity checks still bind them.
 */
export async function readVerifiedFiles(
  read: (path: string) => Promise<Blob>,
  entryPoint: 'manifest.json' | 'comparison.json',
  include: (path: string) => boolean = () => true,
) {
  const sums = await read('SHA256SUMS');
  if (sums.size > 1024 * 1024) throw new Error('Checksum inventory exceeds 1 MiB');
  const checksums = new Map<string, string>();
  const sumText = await sums.text();
  for (const line of sumText.trim().split('\n')) {
    const match = /^(?<hash>[a-f0-9]{64})  (?<path>.+)$/u.exec(line);
    if (!match || checksums.has(match.groups!.path))
      throw new Error('Malformed or duplicate SHA256SUMS entry');
    checksums.set(safePath(match.groups!.path), match.groups!.hash);
  }
  if (!checksums.has(entryPoint) || checksums.size > 2000)
    throw new Error('Missing artifact entry point or oversized inventory');
  const files = new Map<string, Blob>([['SHA256SUMS', sums]]);
  const documents = new Map<string, Json>();
  let total = 0;
  for (const [path, hash] of checksums) {
    if (!include(path)) continue;
    const blob = await read(path);
    total += blob.size;
    if (blob.size > 512 * 1024 ** 2 || total > 1024 ** 3)
      throw new Error('Bundle exceeds browser memory limit');
    if ((await sha256(blob)) !== hash) throw new Error(`SHA256 mismatch: ${path}`);
    files.set(path, blob);
    if (path.endsWith('.json') && !path.endsWith('.stdout.json'))
      documents.set(path, JSON.parse(await blob.text()));
  }
  return { files, documents, checksums };
}

export async function loadBundle(
  read: (path: string) => Promise<Blob>,
  include?: (path: string) => boolean,
): Promise<Bundle> {
  const { files, documents, checksums } = await readVerifiedFiles(read, 'manifest.json', include);
  const manifest = documents.get('manifest.json') ?? null;
  if (
    at(manifest, 'schema_version') !== 1 ||
    at(manifest, 'ci', 'repository') !== 'SemiAnalysisAI/InferenceX' ||
    !/^\d+$/u.test(text(at(manifest, 'run_attempt'))) ||
    !/^\d+$/u.test(text(at(manifest, 'run_id'))) ||
    !/^[a-f0-9]{40}$/u.test(text(at(manifest, 'git_commit')))
  ) {
    throw new Error('Unsupported H3 CI manifest');
  }
  for (const [path, hash] of entries(at(manifest, 'evidence'))) {
    if (checksums.get(safePath(path)) !== hash)
      throw new Error(`Manifest evidence mismatch: ${path}`);
  }
  const report = documents.get('report/evidence.json') ?? null;
  if (report && at(report, 'bundle_type') !== 'controlled_gpu_report')
    throw new Error('Unsupported report; fixture/imported reports are not H3 CI results');
  if (
    report &&
    at(report, 'job_id') !==
      `github-${text(at(manifest, 'run_id'))}-${text(at(manifest, 'run_attempt'))}`
  )
    throw new Error('Report and CI manifest identify different runs');
  for (const role of ROLES) {
    for (const observation of [
      ...rows(at(report, 'roles', role, 'observations')),
      ...rows(at(report, 'roles', role, 'warmups')),
    ]) {
      const path = text(at(observation, 'artifact_path'));
      if (path && checksums.get(`report/${safePath(path)}`) !== at(observation, 'sha256'))
        throw new Error(`Media identity mismatch: ${role}`);
    }
  }
  const result = documents.get('result.json') ?? null;
  if (
    result &&
    (at(result, 'schema_version') !== '1.0.0' ||
      at(result, 'bundle_type') !== 'h3_benchmark_result' ||
      at(result, 'execution', 'ci', 'run_id') !== at(manifest, 'run_id'))
  )
    throw new Error('Unsupported or mismatched H3 result contract');
  return {
    manifest,
    result,
    report,
    job: documents.get('gpu/gpu-job.json') ?? null,
    ci: documents.get('ci.json') ?? null,
    comparison: documents.get('gpu/comparison.json') ?? null,
    files,
    documents,
    checksums,
    manifestSha256: checksums.get('manifest.json')!,
  };
}
