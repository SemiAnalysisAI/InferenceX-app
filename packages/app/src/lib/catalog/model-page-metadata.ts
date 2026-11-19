import type { Metadata } from 'next';

import { MODEL_PAGE_COPY } from '@/components/model/model-page-copy';
import { AUTHOR_HANDLE, SITE_NAME, SITE_URL } from '@semianalysisai/inferencex-constants';

import { cachedDerivedData } from '../cache/api-cache';
import { enAlternates, type Locale, ZH_OG_LOCALE, zhAlternates } from '../i18n/i18n';
import { getHardwareByModelSlug } from '../compare/compare-availability';
import { toModel } from '../compare/compare-enum-coerce';
import { getModelArchitecture } from './model-architectures';
import { modelMetaDescription } from './model-meta-description';
import { getLocalizedModelPage } from './model-pages-zh';

const getMeasuredHardwareBySlug = cachedDerivedData(async (): Promise<Record<string, string[]>> => {
  const bySlug: Record<string, string[]> = {};
  for (const [slug, hardware] of await getHardwareByModelSlug()) bySlug[slug] = [...hardware];
  return bySlug;
}, 'model-measured-hardware-v1');

/** Measured hardware keys for a model, or none when availability cannot be read. */
async function measuredHardware(slug: string): Promise<readonly string[]> {
  try {
    const bySlug = await getMeasuredHardwareBySlug();
    return Object.hasOwn(bySlug, slug) ? bySlug[slug] : [];
  } catch {
    return [];
  }
}

export function modelIndexMetadata(locale: Locale): Metadata {
  const t = MODEL_PAGE_COPY[locale];
  const isZh = locale === 'zh';
  const enPath = '/model';
  const title = isZh
    ? `${t.indexTitle}：各模型的 MoE 架构、注意力机制与评估结果 | ${SITE_NAME}`
    : `${t.indexTitle} — MoE, Attention & Evals per Model | ${SITE_NAME}`;
  const socialTitle = isZh
    ? `${t.indexTitle}：各模型的 MoE 架构、注意力机制与评估结果`
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

export async function modelDetailMetadata(slug: string, locale: Locale): Promise<Metadata> {
  const page = getLocalizedModelPage(slug, locale);
  if (!page) return {};

  const t = MODEL_PAGE_COPY[locale];
  const isZh = locale === 'zh';
  const title = t.detailTitle(page.meta.title);
  const enPath = `/model/${slug}`;
  const url = `${SITE_URL}${isZh ? '/zh' : ''}${enPath}`;
  const image = `${SITE_URL}${enPath}/opengraph-image`;
  const model = toModel(page.entry.displayName);
  const description = modelMetaDescription(
    page.meta.title,
    model ? getModelArchitecture(model) : undefined,
    await measuredHardware(slug),
    locale,
  );

  return {
    title: { absolute: `${title} | ${SITE_NAME}` },
    description,
    alternates: isZh ? zhAlternates(enPath) : enAlternates(enPath),
    openGraph: {
      title,
      description,
      url,
      siteName: SITE_NAME,
      type: 'article',
      locale: isZh ? ZH_OG_LOCALE : 'en_US',
      ...(isZh ? { images: [image] } : {}),
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      site: AUTHOR_HANDLE,
      creator: AUTHOR_HANDLE,
      ...(isZh ? { images: [image] } : {}),
    },
  };
}
