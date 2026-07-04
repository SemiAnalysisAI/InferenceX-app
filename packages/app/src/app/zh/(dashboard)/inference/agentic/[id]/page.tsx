import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { AgenticPointDetail } from '@/components/inference/agentic-point/agentic-point-detail';
import { isPersistedBenchmarkId } from '@/lib/benchmark-id';

export const metadata: Metadata = {
  title: 'Agentic 追踪详情 | InferenceX',
  robots: { index: false },
};

export default async function ZhAgenticPointDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const numericId = Number(id);
  if (!isPersistedBenchmarkId(numericId)) notFound();
  return <AgenticPointDetail id={numericId} />;
}
