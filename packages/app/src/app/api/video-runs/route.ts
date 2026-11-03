import { videoArtifactIdentity } from '@/components/video-benchmark/artifact-identity';
import type { CIArtifact } from '@/components/video-benchmark/archive';
import { type NextRequest, NextResponse } from 'next/server';
import {
  GITHUB_API_BASE,
  GITHUB_OWNER,
  GITHUB_REPO,
  SITE_URL,
} from '@semianalysisai/inferencex-constants';
import { getGithubToken } from '@/lib/github/github-artifacts';
import { loadFixture } from '@/lib/testing/test-fixtures';
import { bearerMatches } from '@/lib/api/bearer-auth';
import type { VideoHistoryPage } from '@/components/video-benchmark/history';
import {
  publishedVideoHistory,
  approveVideoPublication,
  readStoredArtifact,
  storedArtifacts,
  storeVideoArtifact,
  videoStorageEnabled,
} from '@/lib/video/video-storage';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;
const ROOT = `${GITHUB_API_BASE}/repos/${GITHUB_OWNER}/${GITHUB_REPO}`;
const MAX_BYTES = 256 * 1024 ** 2;
const headers = { 'Cache-Control': 'private, no-store' };
const id = (value: string) => /^[1-9]\d{0,19}$/u.test(value) && Number.isSafeInteger(Number(value));

function limitedZip(response: Response) {
  let bytes = 0;
  return response.body!.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        bytes += chunk.byteLength;
        if (bytes > MAX_BYTES) throw new Error('Artifact exceeds viewer limit');
        controller.enqueue(chunk);
      },
    }),
  );
}

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
  const history = query.get('format') === 'history';
  const publishedOnly = query.get('format') === 'published';
  const media = query.get('format') === 'media' || publishedOnly;
  if (
    (runId && !id(runId)) ||
    (artifactId && (!runId || !id(artifactId))) ||
    !id(page) ||
    !Number.isSafeInteger(Number(page)) ||
    (history && (runId || artifactId))
  )
    return NextResponse.json(
      { error: 'Invalid CI run, artifact or page' },
      { status: 400, headers },
    );
  if (history && process.env.NODE_ENV === 'development' && process.env.E2E_FIXTURES === '1') {
    const fixture = loadFixture<VideoHistoryPage>('video-history');
    return NextResponse.json(
      Number(page) === 1 ? fixture : { schemaVersion: 1, entries: [], nextPage: null },
      { headers: { ...headers, 'X-VideoGenX-Replay': '1' } },
    );
  }
  const deadline = AbortSignal.timeout(270000);
  try {
    if (
      process.env.NODE_ENV === 'development' &&
      !videoStorageEnabled() &&
      (!artifactId || media)
    ) {
      // Production checks repository visibility; local reads must never publish on a cache miss.
      const url = new URL('/api/video-runs', SITE_URL);
      if (history) url.searchParams.set('format', 'history');
      if (runId) url.searchParams.set('run', runId);
      if (artifactId) {
        url.searchParams.set('artifact', artifactId);
        url.searchParams.set('format', 'published');
      } else if (!runId) url.searchParams.set('page', page);
      const response = await fetch(url, {
        cache: 'no-store',
        credentials: 'omit',
        redirect: 'error',
        signal: AbortSignal.timeout(30000),
      });
      if (response.status === 204) return new Response(null, { status: 204, headers });
      if (!response.headers.get('content-type')?.includes('application/json')) {
        await response.body?.cancel();
        throw new Error('Published result unavailable');
      }
      const data = await response.json();
      if (response.ok) {
        if (artifactId) {
          if (
            data.storageVersion !== 1 ||
            data.runId !== runId ||
            data.artifact?.id !== Number(artifactId) ||
            !Array.isArray(data.sources) ||
            data.sources.length === 0
          )
            throw new Error('Published artifact identity mismatch');
        } else if (
          history
            ? data.schemaVersion !== 1 || !Array.isArray(data.entries)
            : runId
              ? String(data.run?.id) !== runId || !Array.isArray(data.artifacts)
              : !Array.isArray(data.runs)
        ) {
          throw new Error('Published run identity mismatch');
        }
      }
      return NextResponse.json(data, { status: response.status, headers });
    }
    // This public viewer must never expose artifacts from a repository that becomes private.
    const repository = await github('');
    const repo = repository.ok ? await repository.json() : null;
    if (repo?.private !== false)
      return NextResponse.json(
        { error: 'Public H3 repository unavailable' },
        { status: 503, headers },
      );
    if (history) return NextResponse.json(await publishedVideoHistory(Number(page)), { headers });
    if (artifactId) {
      if (media && !videoStorageEnabled()) return new Response(null, { status: 204, headers });
      if (media) {
        const saved = await storedArtifacts(runId!);
        const stored = saved.find((a) => String(a.id) === artifactId);
        if (stored) {
          const result = await readStoredArtifact(runId!, stored);
          if (result) return NextResponse.json(result, { headers });
        }
        return new Response(null, { status: 204, headers });
      }
      const metaResponse = await github(`/actions/artifacts/${artifactId}`);
      if (!metaResponse.ok)
        return NextResponse.json(
          { error: 'Artifact unavailable' },
          { status: metaResponse.status, headers },
        );
      const artifact = await metaResponse.json();
      const name = videoArtifactIdentity(artifact.name ?? '');
      if (!name || name.run !== runId || String(artifact.workflow_run?.id) !== runId)
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
      return new Response(limitedZip(zip), {
        headers: { ...headers, 'Content-Type': 'application/zip' },
      });
    }
    if (runId) {
      const [runResponse, firstArtifactsResponse, saved] = await Promise.all([
        github(`/actions/runs/${runId}`),
        github(`/actions/runs/${runId}/artifacts?per_page=100`),
        storedArtifacts(runId).catch(() => []),
      ]);
      if (!runResponse.ok)
        return NextResponse.json(
          { error: 'CI run unavailable' },
          { status: runResponse.status, headers },
        );
      const artifacts: CIArtifact[] = [];
      const seen = new Set<number>();
      let artifactsResponse = firstArtifactsResponse;
      for (let artifactPage = 1; ; artifactPage++) {
        if (!artifactsResponse.ok)
          return NextResponse.json({ error: 'Cannot list CI artifacts' }, { status: 502, headers });
        const data: { artifacts: CIArtifact[] } = await artifactsResponse.json();
        for (const artifact of data.artifacts ?? []) {
          if (videoArtifactIdentity(artifact.name)?.run !== runId || seen.has(artifact.id))
            continue;
          seen.add(artifact.id);
          artifacts.push(artifact);
        }
        if ((data.artifacts?.length ?? 0) < 100) break;
        artifactsResponse = await github(
          `/actions/runs/${runId}/artifacts?per_page=100&page=${artifactPage + 1}`,
        );
      }
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
            run.path === '.github/workflows/run-sweep.yml' ||
            run.path === '.github/workflows/h3-video.yml' ||
            run.path === '.github/workflows/h3-fidelity.yml',
        ),
        nextPage: runs.length === 100 ? Number(page) + 1 : null,
      },
      { headers },
    );
  } catch {
    return NextResponse.json(
      {
        error: history
          ? 'Published video history is unavailable; retry shortly'
          : 'GitHub is unavailable; retry shortly',
      },
      { status: 502, headers },
    );
  }
}

export async function POST(request: Request) {
  const secret = process.env.INVALIDATE_SECRET;
  if (!secret)
    return NextResponse.json({ error: 'INVALIDATE_SECRET is not set' }, { status: 500, headers });
  if (!bearerMatches(request.headers.get('Authorization') ?? '', secret))
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers });
  if (!videoStorageEnabled())
    return NextResponse.json(
      { error: 'Video storage is not configured' },
      { status: 503, headers },
    );
  let input: unknown;
  try {
    input = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid publication request' }, { status: 400, headers });
  }
  const body = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  const { runId, artifactId, mergeRunId } = body as Record<string, unknown>;
  if (
    typeof runId !== 'string' ||
    !id(runId) ||
    typeof artifactId !== 'string' ||
    !id(artifactId) ||
    (mergeRunId !== null && (typeof mergeRunId !== 'string' || !id(mergeRunId)))
  )
    return NextResponse.json({ error: 'Invalid publication identity' }, { status: 400, headers });
  const deadline = AbortSignal.timeout(270000);
  try {
    const repository = await github('');
    const repo = repository.ok ? await repository.json() : null;
    if (repo?.private !== false)
      return NextResponse.json(
        { error: 'Public H3 repository unavailable' },
        { status: 503, headers },
      );
    const metaResponse = await github(`/actions/artifacts/${artifactId}`);
    if (!metaResponse.ok)
      return NextResponse.json(
        { error: 'Artifact unavailable' },
        { status: metaResponse.status, headers },
      );
    const artifact: CIArtifact = await metaResponse.json();
    if (
      artifact.id !== Number(artifactId) ||
      !Number.isSafeInteger(artifact.id) ||
      videoArtifactIdentity(artifact.name)?.run !== runId ||
      String(artifact.workflow_run?.id) !== runId ||
      (artifact.digest !== undefined && !/^sha256:[a-f0-9]{64}$/u.test(artifact.digest))
    )
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
    let saved = await readStoredArtifact(runId, artifact);
    if (!saved) {
      const zip = await github(`/actions/artifacts/${artifactId}/zip`, deadline);
      if (!zip.ok || !zip.body)
        return NextResponse.json(
          { error: `Artifact download failed (${zip.status})` },
          { status: 502, headers },
        );
      await storeVideoArtifact(
        runId,
        artifact,
        await new Response(limitedZip(zip)).blob(),
        deadline,
      );
      saved = await readStoredArtifact(runId, artifact);
      if (!saved) throw new Error('Stored video index readback failed');
    }
    const receipt = await approveVideoPublication(runId, artifact, saved, mergeRunId, deadline);
    return NextResponse.json(receipt, { headers });
  } catch {
    return NextResponse.json(
      { error: 'Video publication failed; retry the exact source artifact' },
      { status: 502, headers },
    );
  }
}
