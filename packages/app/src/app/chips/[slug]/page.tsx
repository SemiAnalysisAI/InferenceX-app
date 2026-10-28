import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { ChipDetailContent, ChipVsContent } from '@/components/chips/chip-page-sections';
import {
  getAllChipRouteSlugs,
  getChipPage,
  getChipVsPage,
  type ChipVsPage,
} from '@/lib/catalog/chip-pages';
import { enAlternates } from '@/lib/i18n/i18n';
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
    const title = `${chip.title} Specs, Price & Power`;
    const description = chipMetaDescription(chip, 'en');
    const url = `${SITE_URL}/chips/${chip.slug}`;
    return {
      title,
      description,
      keywords: [...chip.keywords],
      authors: [{ name: AUTHOR_NAME }],
      alternates: enAlternates(`/chips/${chip.slug}`),
      ...socialMetadata({
        title: `${title} | ${SITE_NAME}`,
        description,
        url,
        locale: 'en',
        type: 'article',
      }),
    };
  }

  const vsPage = getChipVsPage(slug);
  if (!vsPage) return {};
  const title = `${vsPage.a.label} vs ${vsPage.b.label}: Specs, Price & Power`;
  const description = chipVsMetaDescription(vsPage, 'en');
  const url = `${SITE_URL}/chips/${vsPage.slug}`;
  return {
    title,
    description,
    keywords: vsKeywords(vsPage),
    authors: [{ name: AUTHOR_NAME }],
    alternates: enAlternates(`/chips/${vsPage.slug}`),
    ...socialMetadata({
      title: `${title} | ${SITE_NAME}`,
      description,
      url,
      locale: 'en',
      type: 'article',
    }),
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
