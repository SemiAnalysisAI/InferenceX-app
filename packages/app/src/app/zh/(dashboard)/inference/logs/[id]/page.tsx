import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { BenchmarkLogDetail } from '@/components/inference/log-viewer/benchmark-log-detail';
import { isPersistedBenchmarkId } from '@/lib/benchmark-id';

export const metadata: Metadata = {
  title: '基准测试日志 | InferenceX',
  robots: { index: false },
};

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
