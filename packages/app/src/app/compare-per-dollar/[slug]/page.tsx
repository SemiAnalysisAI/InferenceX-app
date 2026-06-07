import type { Metadata } from 'next';

import PerDollarDetailView, { perDollarDetailMetadata } from '@/lib/compare/per-dollar-detail-view';

export const dynamic = 'force-dynamic';

interface Props {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  return perDollarDetailMetadata(slug, 'en');
}

export default async function ComparePerDollarPage({ params, searchParams }: Props) {
  const [{ slug }, sp] = await Promise.all([params, searchParams]);
  return <PerDollarDetailView slug={slug} sp={sp} lang="en" />;
}
