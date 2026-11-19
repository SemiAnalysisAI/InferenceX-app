import type { Metadata } from 'next';

import EmbedModelPage, { type EmbedSearchParams } from '@/components/embed/EmbedModelPage';
import { getCompareModelBySlug } from '@/lib/compare/compare-slug';

interface Props {
  params: Promise<{ slug: string }>;
  searchParams: Promise<EmbedSearchParams>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const entry = getCompareModelBySlug(slug);
  return {
    title: entry ? `${entry.label} — InferenceX embed` : 'InferenceX embed',
    robots: { index: false, follow: false },
  };
}

export default async function EmbedModelRoute({ params, searchParams }: Props) {
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  return <EmbedModelPage slug={slug} searchParams={query} />;
}
