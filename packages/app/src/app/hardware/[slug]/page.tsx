import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { HardwareChart } from '@/components/blog/blog-hardware-chart-lazy';
import { KatexStyles } from '@/components/blog/katex-styles';
import { createMdxComponents } from '@/components/blog/mdx-components';
import { HardwarePageContent } from '@/components/hardware/hardware-page-content';
import { JsonLd } from '@/components/seo/json-ld';
import { extractHeadings } from '@/lib/blog/blog';
import { compileBlogMdx } from '@/lib/blog/blog-mdx';
import {
  buildHardwareArticleJsonLd,
  buildHardwareBreadcrumbJsonLd,
  getAllHardwarePages,
  getHardwarePageBySlug,
  hardwarePageMetadata,
} from '@/lib/hardware/hardware';

interface Props {
  params: Promise<{ slug: string }>;
}

export function generateStaticParams() {
  return getAllHardwarePages().map((page) => ({ slug: page.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const page = getHardwarePageBySlug(slug);
  return page ? hardwarePageMetadata(page.meta, 'en') : {};
}

export default async function HardwarePage({ params }: Props) {
  const { slug } = await params;
  const page = getHardwarePageBySlug(slug);
  if (!page) notFound();

  const { meta, raw } = page;
  const { content, hasMath } = await compileBlogMdx(raw, 'en', {
    ...createMdxComponents('en'),
    HardwareChart,
  });

  return (
    <>
      <JsonLd data={buildHardwareArticleJsonLd(meta, raw)} />
      <JsonLd data={buildHardwareBreadcrumbJsonLd(meta)} />
      {hasMath && <KatexStyles />}
      <HardwarePageContent
        locale="en"
        meta={meta}
        headings={extractHeadings(raw)}
        content={content}
      />
    </>
  );
}
