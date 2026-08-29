import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';

import 'katex/dist/katex.min.css';

import ModelDetailContent from '@/components/model/ModelDetailContent';
import { modelAliasDestination } from '@/components/model/model-page-copy';
import { COMPARE_MODEL_ALIASES } from '@/lib/compare-slug';
import { modelDetailMetadata } from '@/lib/model-page-metadata';
import { getModelPageSlugs } from '@/lib/model-pages';
import { getLocalizedModelPage } from '@/lib/model-pages-zh';

interface Props {
  params: Promise<{ slug: string }>;
}

export function generateStaticParams() {
  return getModelPageSlugs().map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  return modelDetailMetadata(slug, 'zh');
}

export default async function ZhModelPage({ params }: Props) {
  const { slug } = await params;
  const canonical = COMPARE_MODEL_ALIASES[slug];
  if (canonical) redirect(modelAliasDestination(canonical, 'zh'));

  const page = getLocalizedModelPage(slug, 'zh');
  if (!page) notFound();
  return <ModelDetailContent slug={slug} page={page} locale="zh" />;
}
