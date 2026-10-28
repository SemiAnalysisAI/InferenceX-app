import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { ChipDetailContent, ChipVsContent } from '@/components/chips/chip-page-sections';
import {
  getAllChipRouteSlugs,
  getChipPage,
  getChipVsPage,
  type ChipVsPage,
} from '@/lib/catalog/chip-pages';
import { getZhChipTranslation } from '@/lib/catalog/chip-pages-zh';
import { zhAlternates } from '@/lib/i18n/i18n';
import { AUTHOR_NAME, SITE_NAME, SITE_URL } from '@semianalysisai/inferencex-constants';
import { chipMetaDescription, chipVsMetaDescription } from '@/lib/seo/chip-meta';
import { socialMetadata } from '@/lib/seo/social-metadata';

interface Props {
  params: Promise<{ slug: string }>;
}

export const dynamicParams = false;

export function generateStaticParams() {
  return getAllChipRouteSlugs().map((slug) => ({ slug }));
}

function vsKeywordsZh(page: ChipVsPage): string[] {
  const a = page.a.label;
  const b = page.b.label;
  return [
    `${a} vs ${b}`,
    `${b} vs ${a}`,
    `${a} 对比 ${b}`,
    `${a} vs ${b} 基准测试`,
    `${a} vs ${b} 规格`,
    `${a} vs ${b} 价格`,
    'AI 芯片对比',
    'AI 推理基准测试',
  ];
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;

  const entry = getChipPage(slug);
  if (entry) {
    const translation = getZhChipTranslation(entry.slug);
    if (!translation) return {};
    const title = `${entry.title} 规格、价格与功耗`;
    const description = chipMetaDescription(entry, 'zh');
    const url = `${SITE_URL}/zh/chips/${entry.slug}`;
    return {
      title,
      description,
      keywords: [...translation.keywords],
      authors: [{ name: AUTHOR_NAME }],
      alternates: zhAlternates(`/chips/${entry.slug}`),
      ...socialMetadata({
        title: `${title} | ${SITE_NAME}`,
        description,
        url,
        locale: 'zh',
        type: 'article',
      }),
    };
  }

  const vsPage = getChipVsPage(slug);
  if (!vsPage) return {};
  const title = `${vsPage.a.label} vs ${vsPage.b.label}：规格、价格与功耗`;
  const description = chipVsMetaDescription(vsPage, 'zh');
  const url = `${SITE_URL}/zh/chips/${vsPage.slug}`;
  return {
    title,
    description,
    keywords: vsKeywordsZh(vsPage),
    authors: [{ name: AUTHOR_NAME }],
    alternates: zhAlternates(`/chips/${vsPage.slug}`),
    ...socialMetadata({
      title: `${title} | ${SITE_NAME}`,
      description,
      url,
      locale: 'zh',
      type: 'article',
    }),
  };
}

export default async function ZhChipRoutePage({ params }: Props) {
  const { slug } = await params;

  const entry = getChipPage(slug);
  if (entry) return <ChipDetailContent entry={entry} locale="zh" />;

  const vsPage = getChipVsPage(slug);
  if (!vsPage) notFound();
  return <ChipVsContent page={vsPage} locale="zh" />;
}
