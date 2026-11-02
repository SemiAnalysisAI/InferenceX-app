import { getDb } from '@semianalysisai/inferencex-db/connection';
import {
  getExperimentCampaign,
  getExperimentRuns,
} from '@semianalysisai/inferencex-db/queries/experiments';

export const dynamic = 'force-dynamic';

/** Experiment identities remain separate from benchmark/workflow IDs. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ campaign: string }> },
): Promise<Response> {
  const { campaign: slug } = await params;
  const headers = { 'Cache-Control': 'no-store' };
  try {
    const sql = getDb();
    const campaign = await getExperimentCampaign(sql, slug);
    if (!campaign) return Response.json({ error: 'Not found' }, { status: 404, headers });
    const runs = await getExperimentRuns(sql, slug);
    return Response.json({ campaign, runs }, { headers });
  } catch (error) {
    console.error('Error reading experiment campaign:', error);
    return Response.json({ error: 'Internal server error' }, { status: 500, headers });
  }
}
