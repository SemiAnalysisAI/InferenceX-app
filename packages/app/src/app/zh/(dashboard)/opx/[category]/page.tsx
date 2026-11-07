import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { SITE_NAME, SITE_URL } from '@semianalysisai/inferencex-constants';

import OperatorXView from '@/components/operatorx/OperatorXView';
import { ZhTabIntro } from '@/components/zh/zh-tab-intro';
import { zhAlternates, zhPath } from '@/lib/i18n/i18n';
import { operatorXCategoryMetaZh } from '@/lib/routing/operatorx-category-meta';
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
  const { title, description } = operatorXCategoryMetaZh(category);
  const enPath = operatorXCategoryPath(category);
  const url = `${SITE_URL}${zhPath(enPath)}`;
  return {
    title: { absolute: `${title} | ${SITE_NAME}` },
    description,
    alternates: zhAlternates(enPath),
    ...socialMetadata({ title: `${title} | ${SITE_NAME}`, description, url, locale: 'zh' }),
  };
}

export default async function ZhOperatorXCategoryPage({ params }: Props) {
  const { category } = await params;
  if (!isOperatorXCategory(category)) notFound();
  return (
    <>
      <OperatorXView />
      <ZhTabIntro tab="operatorx" />
    </>
  );
}
