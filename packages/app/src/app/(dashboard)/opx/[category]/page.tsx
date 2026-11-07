import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { SITE_NAME, SITE_URL } from '@semianalysisai/inferencex-constants';

import OperatorXView from '@/components/operatorx/OperatorXView';
import { enAlternates } from '@/lib/i18n/i18n';
import { operatorXCategoryMeta } from '@/lib/routing/operatorx-category-meta';
import {
  isOperatorXCategory,
  OPERATORX_CATEGORIES,
  operatorXCategoryPath,
} from '@/lib/routing/operatorx-category';
import { socialMetadata } from '@/lib/seo/social-metadata';

interface Props {
  params: Promise<{ category: string }>;
}

export function generateStaticParams(): { category: string }[] {
  return OPERATORX_CATEGORIES.map((entry) => ({ category: entry.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { category } = await params;
  if (!isOperatorXCategory(category)) return {};
  const { title, description } = operatorXCategoryMeta(category);
  const enPath = operatorXCategoryPath(category);
  const url = `${SITE_URL}${enPath}`;
  return {
    title: { absolute: `${title} | ${SITE_NAME}` },
    description,
    alternates: enAlternates(enPath),
    ...socialMetadata({ title: `${title} | ${SITE_NAME}`, description, url, locale: 'en' }),
  };
}

export default async function OperatorXCategoryPage({ params }: Props) {
  const { category } = await params;
  if (!isOperatorXCategory(category)) notFound();
  return <OperatorXView />;
}
