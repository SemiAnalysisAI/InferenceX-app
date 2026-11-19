// Export a downloaded h3-results bundle directory as a storageVersion 1 StoredArtifact JSON,
// the frontend's retained form of a CI artifact. Usage:
//   bun export-stored-artifact.ts <bundle dir> <runId> <artifactId> <artifactName> <sizeBytes> <out.json>
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { loadBundle } from '@/components/video-benchmark/bundle';
import type { StoredArtifact } from '@/components/video-benchmark/stored';

const [dir, runId, artifactId, name, size, out] = process.argv.slice(2);
if (!dir || !runId || !artifactId || !name || !size || !out)
  throw new Error('six arguments required');
const bundle = await loadBundle(async (path) => new Blob([await readFile(join(dir, path))]));
const stored: StoredArtifact = {
  storageVersion: 1,
  runId,
  artifact: { id: Number(artifactId), name, expired: false, size_in_bytes: Number(size) },
  sources: [
    {
      id: runId,
      documents: [...bundle.documents],
      checksums: [...bundle.checksums],
      assets: [],
      texts: [],
    },
  ],
};
await writeFile(out, `${JSON.stringify(stored)}\n`);
console.log(`wrote ${out}: ${bundle.documents.size} documents, ${bundle.checksums.size} checksums`);
