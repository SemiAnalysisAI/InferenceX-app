import { getDb } from '@semianalysisai/inferencex-db/connection';
import { getExperimentRunDetail } from '@semianalysisai/inferencex-db/queries/experiments';

export const dynamic = 'force-dynamic';

/** Raw stored metrics and trace projections; no synthetic benchmark ID. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ campaign: string; runId: string }> },
): Promise<Response> {
  const { campaign, runId } = await params;
  const headers = { 'Cache-Control': 'no-store' };
  try {
    const run = await getExperimentRunDetail(getDb(), campaign, runId);
    if (!run) return Response.json({ error: 'Not found' }, { status: 404, headers });
    return Response.json(run, { headers });
  } catch (error) {
    console.error('Error reading experiment run:', error);
    return Response.json({ error: 'Internal server error' }, { status: 500, headers });
  }
}
