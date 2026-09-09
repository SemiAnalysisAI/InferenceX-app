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
export function text(value: Json): string {
  return typeof value === 'string' ? value : '';
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
export async function loadBundle(read: (path: string) => Promise<Blob>): Promise<Bundle> {
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
  if (!checksums.has('manifest.json') || checksums.size > 2000)
    throw new Error('Missing manifest or oversized inventory');
  const files = new Map<string, Blob>([['SHA256SUMS', sums]]);
  const documents = new Map<string, Json>();
  let total = 0;
  // ponytail: whole bundles stay in browser memory; stream to storage for bundles above 1 GiB.
  for (const [path, hash] of checksums) {
    const blob = await read(path);
    total += blob.size;
    if (blob.size > 512 * 1024 ** 2 || total > 1024 ** 3)
      throw new Error('Bundle exceeds browser memory limit');
    if ((await sha256(blob)) !== hash) throw new Error(`SHA256 mismatch: ${path}`);
    files.set(path, blob);
    if (path.endsWith('.json')) documents.set(path, JSON.parse(await blob.text()));
  }
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

export function folderReader(files: File[]): (path: string) => Promise<Blob> {
  const manifests = files.filter((f) => f.webkitRelativePath.endsWith('/manifest.json'));
  if (manifests.length !== 1)
    throw new Error('Select one extracted CI artifact folder containing manifest.json');
  const prefix = manifests[0].webkitRelativePath.slice(0, -'manifest.json'.length);
  const map = new Map(files.map((f) => [f.webkitRelativePath, f]));
  return (path) => {
    const file = map.get(prefix + safePath(path));
    if (!file) throw new Error(`Missing artifact: ${path}`);
    return Promise.resolve(file);
  };
}

export function httpReader(manifestUrl: string): (path: string) => Promise<Blob> {
  const url = new URL(manifestUrl);
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (
    (url.protocol !== 'https:' && !(local && url.protocol === 'http:')) ||
    url.username ||
    url.password ||
    !url.pathname.endsWith('/manifest.json') ||
    url.search ||
    url.hash
  ) {
    throw new Error(
      'Use an HTTPS manifest.json URL (HTTP allowed on localhost), without credentials or query parameters',
    );
  }
  const base = new URL('./', url);
  return async (path) => {
    const response = await fetch(new URL(safePath(path), base), {
      credentials: 'omit',
      redirect: 'error',
      referrerPolicy: 'no-referrer',
      signal: AbortSignal.timeout(30000),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}: ${path}`);
    if (Number(response.headers.get('content-length')) > 512 * 1024 ** 2)
      throw new Error('Artifact exceeds 512 MiB');
    return response.blob();
  };
}

export function sampledPower(
  samples: Json[],
  uuids: string[],
  maxGap: number,
): {
  watts: number;
  joules: number;
  seconds: number;
  sampleCount: number;
  start: string;
  end: string;
} | null {
  const measured = samples.filter((s) => at(s, 'phase') === 'measurement');
  if (
    measured.length < 2 ||
    uuids.length === 0 ||
    new Set(uuids).size !== uuids.length ||
    !(maxGap > 0)
  )
    return null;
  let joules = 0;
  const points: { t: number; watts: number }[] = [];
  for (const sample of measured) {
    const t = number(at(sample, 'monotonic_seconds'));
    const devices = rows(at(sample, 'gpus'));
    if (t === null || rows(at(sample, 'unowned_compute_apps')).length > 0) return null;
    let watts = 0;
    for (const uuid of uuids) {
      const matches = devices.filter((g) => at(g, 'uuid') === uuid);
      const w = number(at(matches[0], 'power_watts'));
      if (
        matches.length !== 1 ||
        w === null ||
        w < 0 ||
        !rows(at(sample, 'owned_compute_apps')).some((g) => at(g, 'gpu_uuid') === uuid)
      )
        return null;
      watts += w;
    }
    const previous = points.at(-1);
    if (previous) {
      const dt = t - previous.t;
      if (dt <= 0 || dt > maxGap) return null;
      joules += ((previous.watts + watts) / 2) * dt;
    }
    points.push({ t, watts });
  }
  const seconds = points.at(-1)!.t - points[0].t;
  return {
    watts: joules / seconds,
    joules,
    seconds,
    sampleCount: points.length,
    start: text(at(measured[0], 'at')),
    end: text(at(measured.at(-1), 'at')),
  };
}

export function estimateEconomics(
  rate: number | null,
  participating: number | null,
  billed: number | null,
  price: number | null,
  cost: number | null,
) {
  if (
    rate === null ||
    rate < 0 ||
    participating === null ||
    !Number.isInteger(participating) ||
    participating <= 0 ||
    billed === null ||
    !Number.isInteger(billed) ||
    billed < participating ||
    price === null ||
    price < 0 ||
    ![rate, participating, billed, price].every(Number.isFinite)
  )
    return null;
  const revenue = rate * 3600 * price;
  const profit =
    cost !== null && Number.isFinite(cost) && cost >= 0 ? revenue - cost * billed : null;
  return {
    revenue,
    revenuePerParticipating: revenue / participating,
    revenuePerBilled: revenue / billed,
    profitPerParticipating: profit === null ? null : profit / participating,
    profitPerBilled: profit === null ? null : profit / billed,
  };
}
