import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ExperimentPointDetail } from '@/components/inference/agentic-point/experiment-point-detail';
import { isExperimentCampaign } from '@/lib/benchmarks/experiment-benchmarks';

export const metadata: Metadata = {
  title: '实验数据点指标 | InferenceX',
  robots: { index: false, follow: false },
};

export default async function ExperimentPointPage({
  params,
}: {
  params: Promise<{ campaign: string; runId: string }>;
}) {
  const { campaign, runId } = await params;
  if (!isExperimentCampaign(campaign) || !runId) notFound();
  return <ExperimentPointDetail key={`${campaign}:${runId}`} campaign={campaign} runId={runId} />;
}
