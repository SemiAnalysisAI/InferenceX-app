import type { Metadata } from 'next';

import { DatasetDetail } from '@/components/datasets/dataset-detail';
import { SITE_URL } from '@semianalysisai/inferencex-constants';

interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const title = `${slug} | Agentic Datasets`;
  const description = `Distributions, token statistics, and per-conversation flamegraphs for the ${slug} agentic trace dataset.`;
  return {
    title,
    description,
    alternates: { canonical: `${SITE_URL}/datasets/${slug}` },
    openGraph: { title: `${title} | InferenceX`, description, url: `${SITE_URL}/datasets/${slug}` },
    twitter: { title: `${title} | InferenceX`, description },
  };
}

export default async function DatasetDetailPage({ params }: Props) {
  const { slug } = await params;
  return (
    <main className="relative">
      <div className="container mx-auto px-4 pb-8 lg:px-8">
        <DatasetDetail slug={slug} />
      </div>
    </main>
  );
}
