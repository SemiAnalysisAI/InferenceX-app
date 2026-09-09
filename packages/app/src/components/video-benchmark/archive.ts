import { at, rows, safePath, sha256, text, type Json } from './bundle';

export interface CIArtifact {
  id: number;
  name: string;
  expired: boolean;
  size_in_bytes: number;
  digest?: string;
  stored?: boolean;
  indexUrl?: string;
}
export interface CIRun {
  id: number;
  name: string;
  run_attempt: number;
  head_sha: string;
  created_at: string;
  status: string;
  conclusion: string | null;
  html_url: string;
}

export async function archiveSources(blob: Blob, artifact: CIArtifact) {
  if (blob.size > 256 * 1024 ** 2) throw new Error('Archive exceeds 256 MiB');
  if (artifact.digest && artifact.digest !== `sha256:${await sha256(blob)}`)
    throw new Error('GitHub artifact digest mismatch');
  const { unzipSync } = await import('fflate');
  let total = 0;
  const names = new Set<string>();
  const files = unzipSync(new Uint8Array(await blob.arrayBuffer()), {
    filter(file) {
      if (file.name.endsWith('/')) return false;
      safePath(file.name);
      if (names.has(file.name)) throw new Error('Duplicate archive path');
      names.add(file.name);
      total += file.originalSize;
      if (names.size > 4000 || file.originalSize > 512 * 1024 ** 2 || total > 1024 ** 3)
        throw new Error('Expanded archive exceeds browser memory limit');
      return true;
    },
  });
  const read = (path: string) => {
    const bytes = files[safePath(path)];
    if (!bytes) throw new Error(`Missing artifact file: ${path}`);
    return new Blob([new Uint8Array(bytes).buffer]);
  };
  // Verify the outer export index and every contained source before selecting a result.
  const sums = await read('SHA256SUMS').text();
  const verified = new Set<string>();
  for (const line of sums.trim().split('\n')) {
    const match = /^(?<hash>[a-f0-9]{64})  (?<path>.+)$/u.exec(line);
    if (
      !match ||
      verified.has(match.groups!.path) ||
      (await sha256(read(match.groups!.path))) !== match.groups!.hash
    )
      throw new Error('Archive checksum mismatch');
    verified.add(match.groups!.path);
  }
  const fidelity = artifact.name.startsWith('h3-fidelity-');
  if (
    !verified.has(
      fidelity ? 'comparison.json' : files['index.json'] ? 'index.json' : 'manifest.json',
    )
  )
    throw new Error('Missing verified archive entry point');
  const index: Json = files['index.json'] ? JSON.parse(await read('index.json').text()) : null;
  const identity = /^h3-(?:video|results|fidelity)-(?<run>\d+)-(?<attempt>\d+)$/u.exec(
    artifact.name,
  )?.groups;
  if (!identity) throw new Error('Invalid H3 artifact identity');
  if (fidelity) {
    const comparison: Json = JSON.parse(await read('comparison.json').text());
    if (
      at(comparison, 'producer', 'run_id') !== identity.run ||
      at(comparison, 'producer', 'run_attempt') !== identity.attempt
    )
      throw new Error('Comparison and GitHub artifact identify different runs');
    return [
      {
        id: identity.run,
        kind: 'fidelity' as const,
        read: (path: string) => Promise.resolve(read(path)),
      },
    ];
  }
  if (
    index &&
    (at(index, 'producer', 'ci', 'run_id') !== identity.run ||
      at(index, 'producer', 'ci', 'run_attempt') !== identity.attempt)
  )
    throw new Error('Export and GitHub artifact identify different runs');
  if (index && at(index, 'schema_version') !== '1.0.0')
    throw new Error('Unsupported H3 export index');
  if (index)
    return rows(at(index, 'results')).map((result) => {
      const manifest = safePath(text(at(result, 'manifest')));
      if (!manifest.endsWith('/result.json')) throw new Error('Invalid export result path');
      const source = text(at(result, 'source_run_id'));
      if (
        !/^[1-9]\d*$/u.test(source) ||
        manifest !== `source-${source}/result.json` ||
        !verified.has(manifest)
      )
        throw new Error('Invalid export source identity');
      const prefix = manifest.slice(0, -'result.json'.length);
      const original: Json = JSON.parse(new TextDecoder().decode(files[`${prefix}manifest.json`]));
      if (at(original, 'run_id') !== source)
        throw new Error('Export source and original manifest identify different runs');
      return {
        id: text(at(result, 'source_run_id')),
        read: (path: string) => Promise.resolve(read(prefix + safePath(path))),
      };
    });
  const manifest: Json = JSON.parse(await read('manifest.json').text());
  if (at(manifest, 'run_id') !== identity.run || at(manifest, 'run_attempt') !== identity.attempt)
    throw new Error('Manifest and GitHub artifact identify different runs');
  return [
    { id: text(at(manifest, 'run_id')), read: (path: string) => Promise.resolve(read(path)) },
  ];
}
