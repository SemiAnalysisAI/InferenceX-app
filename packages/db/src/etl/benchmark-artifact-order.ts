import fs from 'node:fs';
import path from 'node:path';

import type { ArtifactMeta } from '../lib/github-artifacts';

export const ARTIFACT_MANIFEST = 'ingest-artifact-manifest.json';

/** Keep GitHub upload provenance: filesystem order and mtimes are not attempt order. */
export function writeArtifactManifest(root: string, artifacts: readonly ArtifactMeta[]): void {
  fs.writeFileSync(path.join(root, ARTIFACT_MANIFEST), JSON.stringify(artifacts, null, 2));
}

/**
 * Individual job exports own their point and sidecars; collected exports only fill
 * missing points. Within each kind, newest uploads win, including hashed retry
 * names that cannot safely be deduplicated from their truncated name alone.
 * Legacy bundles without a manifest retain their existing ingestion behavior.
 */
export function benchmarkArtifactOrder(root: string, files: readonly string[]) {
  const manifestPath = path.join(root, ARTIFACT_MANIFEST);
  const uniqueFiles = [...new Set(files)];
  if (!fs.existsSync(manifestPath)) return { files: uniqueFiles, selectNewest: false };
  const artifacts = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as ArtifactMeta[];
  const byName = new Map(artifacts.map((artifact) => [artifact.name, artifact]));
  const name = (file: string) => path.relative(root, file).split(path.sep)[0]!;
  for (const file of uniqueFiles) {
    const artifact = byName.get(name(file));
    if (!artifact || !Number.isFinite(Date.parse(artifact.created_at))) {
      throw new Error(`Missing upload provenance for benchmark artifact: ${name(file)}`);
    }
  }
  uniqueFiles.sort((left, right) => {
    const a = byName.get(name(left))!;
    const b = byName.get(name(right))!;
    return (
      Number(b.name.startsWith('bmk_')) - Number(a.name.startsWith('bmk_')) ||
      Date.parse(b.created_at) - Date.parse(a.created_at) ||
      (b.id ?? 0) - (a.id ?? 0) ||
      left.localeCompare(right)
    );
  });
  return { files: uniqueFiles, selectNewest: true };
}

/** Only the selected point may write metrics, logs, or asynchronously prepared traces. */
export class BenchmarkArtifactSelection {
  private readonly selected = new Map<string, string>();

  constructor(private readonly enabled: boolean) {}

  accept(identity: string, file: string): boolean {
    if (!this.enabled) return true;
    const selected = this.selected.get(identity);
    if (selected !== undefined && selected !== file) return false;
    this.selected.set(identity, file);
    return true;
  }
}
