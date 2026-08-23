import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { BenchmarkLogDetail } from '@/components/inference/log-viewer/benchmark-log-detail';
import { isPersistedBenchmarkId } from '@/lib/benchmark-id';
import { zhAlternates } from '@/lib/i18n';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  return {
    title: '基准测试日志 | InferenceX',
    alternates: zhAlternates(`/inference/logs/${id}`),
    robots: { index: false },
  };
}

export default async function ZhBenchmarkLogPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const numericId = Number(id);
  if (!isPersistedBenchmarkId(numericId)) notFound();
  return <BenchmarkLogDetail id={numericId} />;
}
