import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { ChipDetailContent, ChipVsContent } from '@/components/chips/chip-page-sections';
import {
  getAllChipRouteSlugs,
  getChipPage,
  getChipVsPage,
  type ChipVsPage,
} from '@/lib/chip-pages';
import { getZhChipTranslation } from '@/lib/chip-pages-zh';
import { ZH_OG_LOCALE, zhAlternates } from '@/lib/i18n';
import {
  AUTHOR_HANDLE,
  AUTHOR_NAME,
  SITE_NAME,
  SITE_URL,
  SUPPORTERS_LINE_ZH,
} from '@semianalysisai/inferencex-constants';

interface Props {
  params: Promise<{ slug: string }>;
}

export const dynamicParams = false;

export function generateStaticParams() {
  return getAllChipRouteSlugs().map((slug) => ({ slug }));
}

function vsDescriptionZh(page: ChipVsPage): string {
  return `${page.a.title} 对比 ${page.b.title}：显存、内存带宽、FP8/FP4 算力、TDP 与云端价格并列呈现，并附相同工作负载上持续测量的 LLM 推理基准测试。${SUPPORTERS_LINE_ZH}`;
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

  const chip = getChipPage(slug);
  if (chip) {
    const translation = getZhChipTranslation(chip.slug);
    if (!translation) return {};
    const title = `${chip.title} 规格、价格与 AI 推理基准测试`;
    const description = `${translation.summary}${SUPPORTERS_LINE_ZH}`;
    const url = `${SITE_URL}/zh/chips/${chip.slug}`;
    return {
      title,
      description,
      keywords: [...translation.keywords],
      authors: [{ name: AUTHOR_NAME }],
      alternates: zhAlternates(`/chips/${chip.slug}`),
      openGraph: {
        title: `${title} | ${SITE_NAME}`,
        description,
        url,
        locale: ZH_OG_LOCALE,
        type: 'article',
      },
      twitter: {
        card: 'summary_large_image',
        title: `${title} | ${SITE_NAME}`,
        description,
        creator: AUTHOR_HANDLE,
      },
    };
  }

  const vsPage = getChipVsPage(slug);
  if (!vsPage) return {};
  const title = `${vsPage.a.label} vs ${vsPage.b.label}：规格、功耗与 AI 推理对比`;
  const description = vsDescriptionZh(vsPage);
  const url = `${SITE_URL}/zh/chips/${vsPage.slug}`;
  return {
    title,
    description,
    keywords: vsKeywordsZh(vsPage),
    authors: [{ name: AUTHOR_NAME }],
    alternates: zhAlternates(`/chips/${vsPage.slug}`),
    openGraph: {
      title: `${title} | ${SITE_NAME}`,
      description,
      url,
      locale: ZH_OG_LOCALE,
      type: 'article',
    },
    twitter: {
      card: 'summary_large_image',
      title: `${title} | ${SITE_NAME}`,
      description,
      creator: AUTHOR_HANDLE,
    },
  };
}

export default async function ZhChipRoutePage({ params }: Props) {
  const { slug } = await params;

  const chip = getChipPage(slug);
  if (chip) return <ChipDetailContent entry={chip} locale="zh" />;

  const vsPage = getChipVsPage(slug);
  if (!vsPage) notFound();
  return <ChipVsContent page={vsPage} locale="zh" />;
}
