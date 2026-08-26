import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { ChipDetailContent, ChipVsContent } from '@/components/chips/chip-page-sections';
import {
  getAllChipRouteSlugs,
  getChipPage,
  getChipVsPage,
  type ChipVsPage,
} from '@/lib/chip-pages';
import { enAlternates } from '@/lib/i18n';
import {
  AUTHOR_HANDLE,
  AUTHOR_NAME,
  SITE_NAME,
  SITE_URL,
  SUPPORTERS_LINE,
} from '@semianalysisai/inferencex-constants';

interface Props {
  params: Promise<{ slug: string }>;
}

export const dynamicParams = false;

export function generateStaticParams() {
  return getAllChipRouteSlugs().map((slug) => ({ slug }));
}

function vsDescription(page: ChipVsPage): string {
  return `${page.a.title} vs ${page.b.title}: memory, bandwidth, FP8/FP4 compute, TDP and cloud pricing side by side, with continuously measured LLM inference benchmarks on identical workloads. ${SUPPORTERS_LINE}`;
}

function vsKeywords(page: ChipVsPage): string[] {
  const a = page.a.label;
  const b = page.b.label;
  return [
    `${a} vs ${b}`,
    `${b} vs ${a}`,
    `${a} vs ${b} benchmark`,
    `${a} vs ${b} specs`,
    `${a} vs ${b} inference performance`,
    `${a} vs ${b} price`,
    `${a} GPU comparison`,
    'AI inference benchmarks',
  ];
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;

  const chip = getChipPage(slug);
  if (chip) {
    const title = `${chip.title} Specs, Pricing & AI Inference Benchmarks`;
    const description = `${chip.summary} ${SUPPORTERS_LINE}`;
    const url = `${SITE_URL}/chips/${chip.slug}`;
    return {
      title,
      description,
      keywords: [...chip.keywords],
      authors: [{ name: AUTHOR_NAME }],
      alternates: enAlternates(`/chips/${chip.slug}`),
      openGraph: {
        title: `${title} | ${SITE_NAME}`,
        description,
        url,
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
  const title = `${vsPage.a.label} vs ${vsPage.b.label}: Specs, Power & AI Inference Comparison`;
  const description = vsDescription(vsPage);
  const url = `${SITE_URL}/chips/${vsPage.slug}`;
  return {
    title,
    description,
    keywords: vsKeywords(vsPage),
    authors: [{ name: AUTHOR_NAME }],
    alternates: enAlternates(`/chips/${vsPage.slug}`),
    openGraph: {
      title: `${title} | ${SITE_NAME}`,
      description,
      url,
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

export default async function ChipRoutePage({ params }: Props) {
  const { slug } = await params;

  const chip = getChipPage(slug);
  if (chip) return <ChipDetailContent entry={chip} locale="en" />;

  const vsPage = getChipVsPage(slug);
  if (!vsPage) notFound();
  return <ChipVsContent page={vsPage} locale="en" />;
}
