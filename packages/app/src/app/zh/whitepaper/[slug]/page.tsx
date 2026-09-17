import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { WhitepaperDetailContent } from '@/components/whitepaper/whitepaper-detail-content';
import { getAllWhitepapers, getWhitepaper, whitepaperDetailMetadata } from '@/lib/whitepapers';

interface Props {
  params: Promise<{ slug: string }>;
}

export const dynamicParams = false;

export function generateStaticParams() {
  return getAllWhitepapers().map((paper) => ({ slug: paper.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  return whitepaperDetailMetadata(slug, 'zh');
}

export default async function ZhWhitepaperPage({ params }: Props) {
  const { slug } = await params;
  const paper = getWhitepaper(slug);
  if (!paper) notFound();
  return <WhitepaperDetailContent paper={paper} locale="zh" />;
}
