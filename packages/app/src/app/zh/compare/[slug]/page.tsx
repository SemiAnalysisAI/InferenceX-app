import type { Metadata } from 'next';

import FullDetailView, { fullDetailMetadata } from '@/lib/compare/full-detail-view';

export const dynamic = 'force-dynamic';

interface Props {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  return fullDetailMetadata(slug, 'zh');
}

export default async function ComparePageZh({ params, searchParams }: Props) {
  const [{ slug }, sp] = await Promise.all([params, searchParams]);
  return <FullDetailView slug={slug} sp={sp} lang="zh" />;
}
