import type { Metadata } from 'next';

import EmbedModelPage, { type EmbedSearchParams } from '@/components/embed/EmbedModelPage';
import { getCompareModelBySlug } from '@/lib/compare-slug';

interface Props {
  params: Promise<{ slug: string }>;
  searchParams: Promise<EmbedSearchParams>;
}

/**
 * Embeddable single-model chart: `/embed/model/<slug>?framework=vllm`.
 *
 * Query options are documented on `parseEmbedOptions` in `@/lib/embed`. The
 * route is rendered per request because the framework lock, theme, and
 * scenario come from the query string.
 */
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
  return <EmbedModelPage slug={slug} searchParams={query} locale="en" />;
}
