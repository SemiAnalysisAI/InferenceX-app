import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { DatasetDetail } from '@/components/datasets/dataset-detail';
import { lookupDatasetPage } from '@/lib/agentx/dataset-pages.server';
import { zhAlternates } from '@/lib/i18n/i18n';
import { clampMetaDescription } from '@/lib/seo/meta-text';
import { socialMetadata } from '@/lib/seo/social-metadata';
import { SITE_URL } from '@semianalysisai/inferencex-constants';

interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const page = await lookupDatasetPage(slug);
  if (page.kind === 'missing') return {};
  const name = page.kind === 'found' ? page.record.label : slug;
  const title = `${name} | AgentX 数据集`;
  const description = clampMetaDescription(
    `${name} agentic trace 数据集的分布、token 统计及逐对话火焰图。`,
    'zh',
  );
  const url = `${SITE_URL}/zh/agentx/${slug}`;
  return {
    title,
    description,
    alternates: zhAlternates(`/agentx/${slug}`),
    ...socialMetadata({ title: `${title} | InferenceX`, description, url, locale: 'zh' }),
  };
}

export default async function DatasetDetailPageZh({ params }: Props) {
  const { slug } = await params;
  const lookup = await lookupDatasetPage(slug);
  if (lookup.kind === 'missing') notFound();
  return (
    <main className="relative">
      <div className="container mx-auto px-4 pb-8 lg:px-8">
        <DatasetDetail slug={slug} />
      </div>
    </main>
  );
}
