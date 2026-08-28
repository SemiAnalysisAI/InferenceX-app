import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { AgenticPointDetail } from '@/components/inference/agentic-point/agentic-point-detail';
import { isPersistedBenchmarkId } from '@/lib/benchmark-id';
import { zhAlternates, ZH_OG_LOCALE } from '@/lib/i18n';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  return {
    title: 'Agentic trace 详情 | InferenceX',
    description: `查看 Agentic 基准测试数据点 #${id} 的请求时间线、服务器指标、聚合数据与日志。`,
    alternates: zhAlternates(`/inference/agentic/${id}`),
    openGraph: { locale: ZH_OG_LOCALE },
    robots: { index: false },
  };
}

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
