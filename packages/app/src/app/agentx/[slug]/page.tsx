import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { DatasetDetail } from '@/components/datasets/dataset-detail';
import { lookupDatasetPage } from '@/lib/agentx/dataset-pages.server';
import { enAlternates } from '@/lib/i18n/i18n';
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
  const title = `${name} | AgentX Datasets`;
  const description = clampMetaDescription(
    `Distributions, token statistics and per-conversation flamegraphs for the ${name} agentic trace dataset.`,
    'en',
  );
  const url = `${SITE_URL}/agentx/${slug}`;
  return {
    title,
    description,
    alternates: enAlternates(`/agentx/${slug}`),
    ...socialMetadata({ title: `${title} | InferenceX`, description, url, locale: 'en' }),
  };
}

export default async function DatasetDetailPage({ params }: Props) {
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
