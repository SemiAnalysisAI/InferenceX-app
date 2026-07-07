import {
  collectiveXPublicationErrorCode,
  listCollectiveXPublications,
  loadCollectiveXPublication,
} from '@/lib/collectivex-github';
import { COLLECTIVEX_VERSIONS, parseCollectiveXVersion } from '@/components/collectivex/types';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const VERSION_PATTERN = COLLECTIVEX_VERSIONS.join('|');
const CHANNEL = new RegExp(`^(?<version>${VERSION_PATTERN})/channels/dev-latest\\.json$`);
const DATASET = new RegExp(
  `^(?<version>${VERSION_PATTERN})/datasets/(?<digest>[a-f0-9]{64})/dataset\\.json$`,
);
const RUNS = new RegExp(`^(?<version>${VERSION_PATTERN})/runs\\.json$`);

type AvailabilityStatus = 'channel-unavailable' | 'source-unavailable';

function unavailable(status: number, availability?: AvailabilityStatus) {
  const headers: Record<string, string> = { 'Cache-Control': 'no-store' };
  if (availability) headers['X-CollectiveX-Status'] = availability;
  return new Response(null, { status, headers });
}

function json(body: BodyInit, cacheControl: string) {
  return new Response(body, {
    headers: {
      'Cache-Control': cacheControl,
      'Content-Type': 'application/json; charset=utf-8',
      'X-CollectiveX-Source': 'github-actions',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

export async function GET(_request: Request, context: { params: Promise<{ path: string[] }> }) {
  const parameters = await context.params;
  const relative = parameters.path.join('/');
  const channel = CHANNEL.exec(relative);
  const dataset = DATASET.exec(relative);
  const runs = RUNS.exec(relative);
  if (!channel && !dataset && !runs) return unavailable(404);

  const version = parseCollectiveXVersion(
    channel?.groups?.version ?? dataset?.groups?.version ?? runs?.groups?.version ?? '',
  );
  if (!version) return unavailable(404);

  if (runs) {
    try {
      const listing = await listCollectiveXPublications(version);
      return json(
        `${JSON.stringify({
          format: 'collectivex.runs.v1',
          version,
          runs: listing.map((run) => ({
            run_id: String(run.runId),
            run_attempt: run.runAttempt,
            head_sha: run.headSha,
            digest: run.digest,
            generated_at: run.generatedAt,
            coverage_scope: run.coverageScope,
            covered_skus: run.coveredSkus,
            bytes: run.bytes,
          })),
        })}\n`,
        'public, s-maxage=60, stale-while-revalidate=300',
      );
    } catch (error) {
      const code = collectiveXPublicationErrorCode(error);
      if (code === 'not-found') return unavailable(404, 'channel-unavailable');
      if (code === 'unavailable') return unavailable(503, 'source-unavailable');
      return unavailable(502);
    }
  }

  try {
    const publication = await loadCollectiveXPublication(version, dataset?.groups?.digest);
    if (dataset) {
      return json(publication.body, 'public, max-age=31536000, immutable');
    }
    return json(
      `${JSON.stringify({
        format: 'collectivex.channel.v1',
        channel: 'dev-latest',
        generated_at: publication.dataset.generated_at,
        dataset: {
          path: `datasets/${publication.digest}/dataset.json`,
          sha256: publication.digest,
          bytes: publication.body.byteLength,
        },
      })}\n`,
      'public, s-maxage=60, stale-while-revalidate=300',
    );
  } catch (error) {
    const code = collectiveXPublicationErrorCode(error);
    if (code === 'not-found') {
      return unavailable(404, channel ? 'channel-unavailable' : undefined);
    }
    if (code === 'unavailable') return unavailable(503, 'source-unavailable');
    return unavailable(502);
  }
}
