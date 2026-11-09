import { gzipSync } from 'node:zlib';
import { getDb } from '@semianalysisai/inferencex-db/connection';
import { getExperimentRunDetail } from '@semianalysisai/inferencex-db/queries/experiments';
import { experimentPointMetrics } from '@/lib/benchmarks/experiment-point-metrics';

export const dynamic = 'force-dynamic';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ campaign: string; runId: string }> },
): Promise<Response> {
  const { campaign, runId } = await params;
  const headers = { 'Cache-Control': 'no-store', Vary: 'Accept-Encoding' };
  try {
    const run = await getExperimentRunDetail(getDb(), campaign, runId);
    if (!run) return Response.json({ error: 'Not found' }, { status: 404, headers });
    const payload = experimentPointMetrics(run);
    if (/\bgzip\b/.test(request.headers.get('accept-encoding') ?? '')) {
      return new Response(new Uint8Array(gzipSync(JSON.stringify(payload))), {
        headers: { ...headers, 'Content-Type': 'application/json', 'Content-Encoding': 'gzip' },
      });
    }
    return Response.json(payload, { headers });
  } catch (error) {
    console.error('Error reading experiment point metrics:', error);
    return Response.json({ error: 'Internal server error' }, { status: 500, headers });
  }
}
