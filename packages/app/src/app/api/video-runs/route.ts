import { type NextRequest, NextResponse } from 'next/server';
import { GITHUB_API_BASE, GITHUB_OWNER, GITHUB_REPO } from '@semianalysisai/inferencex-constants';
import { getGithubToken } from '@/lib/github-artifacts';
import {
  readStoredArtifact,
  storedArtifacts,
  storeVideoArtifact,
  videoStorageEnabled,
} from '@/lib/video-storage';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;
const ROOT = `${GITHUB_API_BASE}/repos/${GITHUB_OWNER}/${GITHUB_REPO}`;
const MAX_BYTES = 256 * 1024 ** 2;
const headers = { 'Cache-Control': 'private, no-store' };
const id = (value: string) => /^[1-9]\d{0,19}$/u.test(value);
const artifactName = /^h3-(?:results|video|fidelity)-(?<runId>\d+)-(?<attempt>\d+)$/u;

function github(path: string, signal = AbortSignal.timeout(30000)) {
  const token = getGithubToken();
  return fetch(`${ROOT}${path}`, {
    headers: {
      Accept: 'application/vnd.github+json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    cache: 'no-store',
    signal,
  });
}

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams;
  const runId = query.get('run');
  const artifactId = query.get('artifact');
  const page = query.get('page') ?? '1';
  if ((runId && !id(runId)) || (artifactId && (!runId || !id(artifactId))) || !id(page))
    return NextResponse.json(
      { error: 'Invalid CI run, artifact or page' },
      { status: 400, headers },
    );
  const deadline = AbortSignal.timeout(270000);
  try {
    // This public viewer must never expose artifacts from a repository that becomes private.
    const repository = await github('');
    const repo = repository.ok ? await repository.json() : null;
    if (repo?.private !== false)
      return NextResponse.json(
        { error: 'Public H3 repository unavailable' },
        { status: 503, headers },
      );
    if (artifactId) {
      const media = query.get('format') === 'media';
      if (media && !videoStorageEnabled()) return new Response(null, { status: 204, headers });
      if (media) {
        const saved = await storedArtifacts(runId!);
        const stored = saved.find((a) => String(a.id) === artifactId);
        if (stored) {
          const result = await readStoredArtifact(runId!, stored);
          if (result) return NextResponse.json(result, { headers });
        }
      }
      const metaResponse = await github(`/actions/artifacts/${artifactId}`);
      if (!metaResponse.ok)
        return NextResponse.json(
          { error: 'Artifact unavailable' },
          { status: metaResponse.status, headers },
        );
      const artifact = await metaResponse.json();
      const name = artifactName.exec(artifact.name ?? '');
      if (!name || name.groups?.runId !== runId || String(artifact.workflow_run?.id) !== runId)
        return NextResponse.json(
          { error: 'Artifact does not belong to this H3 run' },
          { status: 404, headers },
        );
      if (artifact.expired)
        return NextResponse.json(
          { error: 'This GitHub artifact has expired' },
          { status: 410, headers },
        );
      if (artifact.size_in_bytes > MAX_BYTES)
        return NextResponse.json(
          { error: 'Artifact exceeds the 256 MiB viewer limit' },
          { status: 413, headers },
        );
      const zip = await github(`/actions/artifacts/${artifactId}/zip`, deadline);
      if (!zip.ok || !zip.body)
        return NextResponse.json(
          { error: `Artifact download failed (${zip.status})` },
          { status: 502, headers },
        );
      let bytes = 0;
      const stream = zip.body.pipeThrough(
        new TransformStream<Uint8Array, Uint8Array>({
          transform(chunk, controller) {
            bytes += chunk.byteLength;
            if (bytes > MAX_BYTES) throw new Error('Artifact exceeds viewer limit');
            controller.enqueue(chunk);
          },
        }),
      );
      if (media) {
        const result = await storeVideoArtifact(
          runId!,
          artifact,
          await new Response(stream).blob(),
          deadline,
        );
        return NextResponse.json(result, { headers });
      }
      return new Response(stream, { headers: { ...headers, 'Content-Type': 'application/zip' } });
    }
    if (runId) {
      const [runResponse, artifactsResponse, saved] = await Promise.all([
        github(`/actions/runs/${runId}`),
        github(`/actions/runs/${runId}/artifacts?per_page=100`),
        storedArtifacts(runId).catch(() => []),
      ]);
      if (!runResponse.ok)
        return NextResponse.json(
          { error: 'CI run unavailable' },
          { status: runResponse.status, headers },
        );
      if (!artifactsResponse.ok)
        return NextResponse.json({ error: 'Cannot list CI artifacts' }, { status: 502, headers });
      const data = await artifactsResponse.json();
      const artifacts = (data.artifacts ?? []).filter((a: { name: string }) => {
        const match = artifactName.exec(a.name);
        return match?.groups?.runId === runId;
      });
      for (const stored of saved) {
        const index = artifacts.findIndex((a: { id: number }) => a.id === stored.id);
        if (index === -1) artifacts.push(stored);
        else artifacts[index] = { ...artifacts[index], expired: false, stored: true };
      }
      return NextResponse.json({ run: await runResponse.json(), artifacts }, { headers });
    }
    const response = await github(`/actions/runs?per_page=100&page=${page}`);
    if (!response.ok)
      return NextResponse.json(
        { error: `GitHub run listing failed (${response.status})` },
        { status: 502, headers },
      );
    const data = await response.json();
    const runs = data.workflow_runs ?? [];
    return NextResponse.json(
      {
        runs: runs.filter(
          (run: { name: string; display_title: string; path: string }) =>
            (run.path === '.github/workflows/e2e-tests.yml' && /\bh3\b/iu.test(run.name)) ||
            run.path === '.github/workflows/h3-video.yml' ||
            run.path === '.github/workflows/h3-fidelity.yml',
        ),
        nextPage: runs.length === 100 ? Number(page) + 1 : null,
      },
      { headers },
    );
  } catch {
    return NextResponse.json(
      { error: 'GitHub is unavailable; retry shortly' },
      { status: 502, headers },
    );
  }
}
