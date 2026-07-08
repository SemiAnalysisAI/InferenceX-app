import type { Metadata } from 'next';

import { DatasetDetail } from '@/components/datasets/dataset-detail';
import { zhAlternates, ZH_OG_LOCALE } from '@/lib/i18n';
import { SITE_URL } from '@semianalysisai/inferencex-constants';

interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const title = `${slug} | Agentic 数据集`;
  const description = `${slug} agentic trace 数据集的分布、token 统计及逐对话火焰图。`;
  return {
    title,
    description,
    alternates: zhAlternates(`/datasets/${slug}`),
    openGraph: {
      title: `${title} | InferenceX`,
      description,
      url: `${SITE_URL}/zh/datasets/${slug}`,
      locale: ZH_OG_LOCALE,
    },
    twitter: { title: `${title} | InferenceX`, description },
  };
}

export default async function DatasetDetailPageZh({ params }: Props) {
  const { slug } = await params;
  return (
    <main className="relative">
      <div className="container mx-auto px-4 pb-8 lg:px-8">
        <DatasetDetail slug={slug} />
      </div>
    </main>
  );
}
