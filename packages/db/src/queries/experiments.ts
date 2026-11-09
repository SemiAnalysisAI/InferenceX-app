import type { DbClient } from '../connection.js';

export interface ExperimentCampaign {
  slug: string;
  title: string;
  description: string;
  reference_points: Record<string, unknown>[];
  comparison_notes: unknown;
  manifest_sha256: string;
  expected_run_count: number;
  complete: boolean;
}
export interface ExperimentRun {
  campaign_slug: string;
  run_id: string;
  series: 'weka' | 'native' | 'recovered-c150';
  concurrency: number;
  replicate: number | null;
  metrics: Record<string, number>;
  plot_metrics: Record<string, unknown>;
  configuration: Record<string, unknown>;
  provenance: Record<string, unknown>;
  health: Record<string, unknown>;
  cache_evidence: Record<string, unknown>;
  clean_backend_qualified: boolean;
  frontier_eligible: boolean;
  record_sha256: string;
  config_name?: string | null;
  perf_changelog?: string | null;
}
export interface ExperimentRunDetail extends ExperimentRun {
  aggregate_stats: Record<string, unknown>;
  chart_series: Record<string, unknown>;
  request_timeline: Record<string, unknown>;
  payload_inventory: Record<string, unknown>[];
}

export async function getExperimentCampaign(
  sql: DbClient,
  slug: string,
): Promise<ExperimentCampaign | null> {
  const rows =
    await sql`select slug,title,description,reference_points,comparison_notes,manifest_sha256,expected_run_count,complete from experiment_campaigns where slug=${slug} and complete=true`;
  return (rows[0] as unknown as ExperimentCampaign) ?? null;
}
export async function getExperimentRuns(sql: DbClient, slug: string): Promise<ExperimentRun[]> {
  return (await sql`select r.campaign_slug,r.run_id,r.series,r.concurrency,r.replicate,r.metrics,r.plot_metrics,r.configuration,r.provenance,r.health,r.cache_evidence,r.clean_backend_qualified,r.frontier_eligible,r.record_sha256,r.config_name,r.perf_changelog from experiment_runs r join experiment_campaigns c on c.slug=r.campaign_slug where r.campaign_slug=${slug} and c.complete=true order by r.series,r.concurrency,r.replicate,r.run_id`) as unknown as ExperimentRun[];
}
export async function getExperimentRunDetail(
  sql: DbClient,
  slug: string,
  runId: string,
): Promise<ExperimentRunDetail | null> {
  const rows =
    await sql`select r.* from experiment_runs r join experiment_campaigns c on c.slug=r.campaign_slug where r.campaign_slug=${slug} and r.run_id=${runId} and c.complete=true`;
  return (rows[0] as unknown as ExperimentRunDetail) ?? null;
}
export async function getExperimentPayloadChunk(
  sql: DbClient,
  slug: string,
  runId: string,
  kind: string,
  part: number,
): Promise<{ data: Buffer; sha256: string } | null> {
  const rows =
    await sql`select p.data,p.sha256 from experiment_payload_chunks p join experiment_campaigns c on c.slug=p.campaign_slug where p.campaign_slug=${slug} and p.run_id=${runId} and p.kind=${kind} and p.part=${part} and c.complete=true`;
  return (rows[0] as unknown as { data: Buffer; sha256: string }) ?? null;
}
