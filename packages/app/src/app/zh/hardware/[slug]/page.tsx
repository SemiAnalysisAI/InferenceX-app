import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import 'katex/dist/katex.min.css';

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
  return getAllHardwarePages('zh').map((page) => ({ slug: page.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const page = getHardwarePageBySlug(slug, 'zh');
  return page ? hardwarePageMetadata(page.meta, 'zh') : {};
}

export default async function ZhHardwarePage({ params }: Props) {
  const { slug } = await params;
  const page = getHardwarePageBySlug(slug, 'zh');
  if (!page) notFound();

  const { meta, raw } = page;
  const { content } = await compileBlogMdx(raw, 'zh');

  return (
    <>
      <JsonLd data={buildHardwareArticleJsonLd(meta, raw, 'zh')} />
      <JsonLd data={buildHardwareBreadcrumbJsonLd(meta, 'zh')} />
      <HardwarePageContent
        locale="zh"
        meta={meta}
        headings={extractHeadings(raw)}
        content={content}
      />
    </>
  );
}
