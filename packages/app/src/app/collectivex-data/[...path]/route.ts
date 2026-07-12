import {
  collectiveXSweepErrorCode,
  listCollectiveXSweepRuns,
  loadCollectiveXSweepRun,
} from '@/lib/collectivex-github';
import { COLLECTIVEX_VERSIONS, parseCollectiveXVersion } from '@/components/collectivex/types';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const VERSION_PATTERN = COLLECTIVEX_VERSIONS.join('|');
const RUNS = new RegExp(`^(?<version>${VERSION_PATTERN})/runs\\.json$`);
const LATEST = new RegExp(`^(?<version>${VERSION_PATTERN})/latest\\.json$`);
const RUN = new RegExp(`^(?<version>${VERSION_PATTERN})/runs/(?<runId>[1-9][0-9]*)\\.json$`);

function unavailable(status: number) {
  return new Response(null, { status, headers: { 'Cache-Control': 'no-store' } });
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
  const runs = RUNS.exec(relative);
  const latest = LATEST.exec(relative);
  const run = RUN.exec(relative);
  if (!runs && !latest && !run) return unavailable(404);

  const version = parseCollectiveXVersion(
    runs?.groups?.version ?? latest?.groups?.version ?? run?.groups?.version ?? '',
  );
  if (!version) return unavailable(404);

  if (runs) {
    try {
      const listing = await listCollectiveXSweepRuns(version);
      return json(
        `${JSON.stringify({ version, runs: listing })}\n`,
        'public, s-maxage=60, stale-while-revalidate=300',
      );
    } catch (error) {
      const code = collectiveXSweepErrorCode(error);
      if (code === 'not-found') return unavailable(404);
      if (code === 'unavailable') return unavailable(503);
      return unavailable(502);
    }
  }

  try {
    const dataset = await loadCollectiveXSweepRun(version, run?.groups?.runId);
    return json(`${JSON.stringify(dataset)}\n`, 'public, s-maxage=60, stale-while-revalidate=300');
  } catch (error) {
    const code = collectiveXSweepErrorCode(error);
    if (code === 'not-found') return unavailable(404);
    if (code === 'unavailable') return unavailable(503);
    return unavailable(502);
  }
}
