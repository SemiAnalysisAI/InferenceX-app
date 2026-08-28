import type { Metadata } from 'next';

import { MODEL_PAGE_COPY } from '@/components/model/model-page-copy';
import { AUTHOR_HANDLE, SITE_NAME, SITE_URL } from '@semianalysisai/inferencex-constants';

import { enAlternates, type Locale, ZH_OG_LOCALE, zhAlternates } from './i18n';
import { getLocalizedModelPage } from './model-pages-zh';

export function modelIndexMetadata(locale: Locale): Metadata {
  const t = MODEL_PAGE_COPY[locale];
  const isZh = locale === 'zh';
  const enPath = '/model';
  const title = isZh
    ? `${t.indexTitle}：各模型的 MoE、注意力与评估 | ${SITE_NAME}`
    : `${t.indexTitle} — MoE, Attention & Evals per Model | ${SITE_NAME}`;
  const socialTitle = isZh
    ? `${t.indexTitle}：各模型的 MoE、注意力与评估`
    : `${t.indexTitle} — MoE, Attention & Evals per Model`;
  const url = `${SITE_URL}${isZh ? '/zh' : ''}${enPath}`;
  const image = `${SITE_URL}/model/opengraph-image`;

  return {
    title: { absolute: title },
    description: t.indexDescription,
    alternates: isZh ? zhAlternates(enPath) : enAlternates(enPath),
    openGraph: {
      title: socialTitle,
      description: t.indexDescription,
      url,
      siteName: SITE_NAME,
      type: 'website',
      locale: isZh ? ZH_OG_LOCALE : 'en_US',
      ...(isZh ? { images: [image] } : {}),
    },
    twitter: {
      card: 'summary_large_image',
      title: socialTitle,
      description: t.indexDescription,
      site: AUTHOR_HANDLE,
      creator: AUTHOR_HANDLE,
      ...(isZh ? { images: [image] } : {}),
    },
  };
}

export function modelDetailMetadata(slug: string, locale: Locale): Metadata {
  const page = getLocalizedModelPage(slug, locale);
  if (!page) return {};

  const t = MODEL_PAGE_COPY[locale];
  const isZh = locale === 'zh';
  const title = t.detailTitle(page.meta.title);
  const enPath = `/model/${slug}`;
  const url = `${SITE_URL}${isZh ? '/zh' : ''}${enPath}`;
  const image = `${SITE_URL}${enPath}/opengraph-image`;

  return {
    title: { absolute: `${title} | ${SITE_NAME}` },
    description: page.meta.description,
    alternates: isZh ? zhAlternates(enPath) : enAlternates(enPath),
    openGraph: {
      title,
      description: page.meta.description,
      url,
      siteName: SITE_NAME,
      type: 'article',
      locale: isZh ? ZH_OG_LOCALE : 'en_US',
      ...(isZh ? { images: [image] } : {}),
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description: page.meta.description,
      site: AUTHOR_HANDLE,
      creator: AUTHOR_HANDLE,
      ...(isZh ? { images: [image] } : {}),
    },
  };
}
