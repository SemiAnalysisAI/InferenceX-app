import { at, number, readVerifiedFiles, ROLES, rows, safePath, text, type Json } from './bundle';

export interface FidelityBundle {
  comparison: Json;
  portable: Json;
  comparisonSha256: string;
  documents: Map<string, Json>;
  checksums: Map<string, string>;
  files: Map<string, Blob>;
}
const hash = (value: Json) => /^[a-f0-9]{64}$/u.test(text(value));
const canonical = (value: Json): string => {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value !== null && typeof value === 'object')
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`)
      .join(',')}}`;
  return JSON.stringify(value);
};

export function fidelityEvidence(
  documents: Map<string, Json>,
  checksums: Map<string, string>,
  runId?: string,
) {
  const comparison = documents.get('comparison.json') ?? null;
  const portable = documents.get('report/index.comparison.json') ?? null;
  const producer = at(comparison, 'producer');
  const id = text(at(producer, 'run_id'));
  if (
    at(comparison, 'bundle_type') !== 'mvp_comparison' ||
    at(comparison, 'bundle_version') !== '0.1.0' ||
    !/^[1-9]\d*$/u.test(id) ||
    (runId !== undefined && runId !== id) ||
    !/^[1-9]\d*$/u.test(text(at(producer, 'run_attempt'))) ||
    !/^[a-f0-9]{40}$/u.test(text(at(producer, 'git_commit'))) ||
    at(producer, 'run_url') !== `https://github.com/SemiAnalysisAI/InferenceX/actions/runs/${id}` ||
    !['comparison.json', 'report/index.comparison.json', 'report/index.html'].every((path) =>
      checksums.has(path),
    ) ||
    !portable ||
    typeof portable !== 'object' ||
    Array.isArray(portable)
  )
    throw new Error('Unsupported or unverified H3 fidelity artifact');
  const normalized = structuredClone(portable);
  delete normalized.report;
  const originalSlots = rows(at(comparison, 'slots'));
  const slots = rows(at(normalized, 'slots'));
  const mediaPaths = new Set<string>();
  if (
    slots.length === 0 ||
    slots.length !== originalSlots.length ||
    new Set(slots.map((slot) => text(at(slot, 'slot_id')))).size !== slots.length
  )
    throw new Error('Missing or inconsistent fidelity slots');
  for (let index = 0; index < slots.length; index++) {
    for (const role of ROLES) {
      const observation = at(slots[index], role);
      const original = at(originalSlots[index], role);
      if (observation === null || typeof observation !== 'object' || Array.isArray(observation))
        throw new Error('Missing fidelity observation');
      const media = at(observation, 'media');
      const path = text(at(observation, 'artifact_path'));
      if (path) {
        const sha = at(observation, 'sha256');
        if (
          !hash(sha) ||
          path !== `index_assets/${sha}.mp4` ||
          at(observation, 'artifact_path_base') !== 'report_directory' ||
          at(media, 'path') !== path ||
          at(media, 'sha256') !== sha ||
          at(original, 'sha256') !== sha ||
          checksums.get(`report/${safePath(path)}`) !== sha
        )
          throw new Error('Fidelity media identity mismatch');
        mediaPaths.add(`report/${path}`);
        observation.artifact_path = at(original, 'artifact_path');
        delete observation.artifact_path_base;
        if (media !== null && typeof media === 'object' && !Array.isArray(media))
          media.path = at(original, 'media', 'path');
      }
    }
  }
  if ([...checksums.keys()].some((path) => path.endsWith('.mp4') && !mediaPaths.has(path)))
    throw new Error('Unreferenced fidelity media');
  if (canonical(normalized) !== canonical(comparison))
    throw new Error('Portable report disagrees with the original comparison');
  for (const role of ROLES)
    if (!hash(at(comparison, role, 'run_bundle_sha256')))
      throw new Error('Missing original role identity');
  const sources = rows(at(comparison, 'source_artifacts'));
  if (
    sources.length !== 2 ||
    new Set(sources.map((source) => at(source, 'ci', 'databaseId'))).size !== 2
  )
    throw new Error('Missing original CI sources');
  const matchedRoles = new Set<string>();
  for (const source of sources) {
    const sourceId = number(at(source, 'ci', 'databaseId'));
    const attempt = number(at(source, 'ci', 'runAttempt'));
    const revision = text(at(source, 'ci', 'headSha'));
    const prefix = `sources/${sourceId}/`;
    const manifest = documents.get(`${prefix}manifest.json`);
    const ci = documents.get(`${prefix}ci.json`);
    const role = ROLES.find(
      (candidateRole) =>
        at(comparison, candidateRole, 'run_bundle_sha256') ===
        checksums.get(`${prefix}c1-run.json`),
    );
    if (
      !Number.isSafeInteger(sourceId) ||
      !sourceId ||
      !Number.isSafeInteger(attempt) ||
      !attempt ||
      !/^[a-f0-9]{40}$/u.test(revision) ||
      at(source, 'ci', 'url') !==
        `https://github.com/SemiAnalysisAI/InferenceX/actions/runs/${sourceId}` ||
      at(source, 'artifact', 'name') !== `h3-video-${sourceId}-${attempt}` ||
      at(source, 'artifact', 'workflow_run', 'id') !== sourceId ||
      at(source, 'artifact', 'workflow_run', 'head_sha') !== revision ||
      !Number.isSafeInteger(number(at(source, 'artifact', 'id'))) ||
      (number(at(source, 'artifact', 'id')) ?? 0) <= 0 ||
      !/^sha256:[a-f0-9]{64}$/u.test(text(at(source, 'artifact', 'digest'))) ||
      !hash(at(source, 'source_seal_sha256')) ||
      checksums.get(`${prefix}original-SHA256SUMS`) !== at(source, 'source_seal_sha256') ||
      at(manifest, 'run_id') !== String(sourceId) ||
      at(manifest, 'git_commit') !== revision ||
      at(ci, 'run_id') !== String(sourceId) ||
      at(ci, 'source_sha') !== revision ||
      !role ||
      matchedRoles.has(role)
    )
      throw new Error('Fidelity source snapshots do not match original CI identities');
    matchedRoles.add(role);
  }
  return { comparison, portable, comparisonSha256: checksums.get('comparison.json')! };
}

export function fidelitySource(bundle: FidelityBundle, role: (typeof ROLES)[number]) {
  return (
    rows(at(bundle.comparison, 'source_artifacts')).find(
      (source) =>
        bundle.checksums.get(`sources/${at(source, 'ci', 'databaseId')}/c1-run.json`) ===
        at(bundle.comparison, role, 'run_bundle_sha256'),
    ) ?? null
  );
}

export async function loadFidelityBundle(
  read: (path: string) => Promise<Blob>,
  runId?: string,
): Promise<FidelityBundle> {
  const data = await readVerifiedFiles(read, 'comparison.json');
  return { ...data, ...fidelityEvidence(data.documents, data.checksums, runId) };
}
