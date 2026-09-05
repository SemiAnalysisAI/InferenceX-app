import type { Metadata } from 'next';

import EmbedModelPage, { type EmbedSearchParams } from '@/components/embed/EmbedModelPage';
import { getCompareModelBySlug } from '@/lib/compare-slug';

interface Props {
  params: Promise<{ slug: string }>;
  searchParams: Promise<EmbedSearchParams>;
}

/** Chinese sibling of `/embed/model/[slug]`; see that route for the contract. */
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const entry = getCompareModelBySlug(slug);
  return {
    title: entry ? `${entry.label} — InferenceX 嵌入图表` : 'InferenceX 嵌入图表',
    robots: { index: false, follow: false },
  };
}

export default async function ZhEmbedModelRoute({ params, searchParams }: Props) {
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  return <EmbedModelPage slug={slug} searchParams={query} />;
}
