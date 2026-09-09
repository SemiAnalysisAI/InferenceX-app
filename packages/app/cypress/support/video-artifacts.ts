import { servingFixture } from '../../src/components/video-benchmark/serving.fixture';
import type { StoredArtifact } from '../../src/components/video-benchmark/stored';

// Synthetic CI artifacts; never benchmark evidence.
export function servingArtifact(
  id = 123,
  artifactId = 40,
  hardware = 'NVIDIA H200',
): StoredArtifact {
  const fixture = servingFixture(String(id), hardware);
  fixture.documents.set('manifest.json', fixture.manifest);
  fixture.documents.set('ci.json', fixture.ci);
  fixture.checksums.set('manifest.json', String(id).padEnd(64, '0'));
  return {
    storageVersion: 1,
    runId: String(id),
    artifact: {
      id: artifactId,
      name: `h3-video-${id}-1`,
      expired: false,
      size_in_bytes: 100,
      stored: true,
    },
    sources: [
      {
        id: String(id),
        documents: [...fixture.documents],
        checksums: [...fixture.checksums],
        texts: [],
        assets: [...fixture.checksums.keys()]
          .filter((path) => path.endsWith('.mp4'))
          .map((path) => [
            path,
            {
              url: `https://media.test/${path}`,
              downloadUrl: `https://media.test/${path}?download=1`,
            },
          ]),
      },
    ],
  };
}

export const videoRun = (id: number, conclusion: string) => ({
  id,
  name: `H3 fixture ${id}`,
  run_attempt: 1,
  head_sha: 'a'.repeat(40),
  created_at: '2026-09-09T00:00:00Z',
  status: 'completed',
  conclusion,
  html_url: `https://github.com/SemiAnalysisAI/InferenceX/actions/runs/${id}`,
});
