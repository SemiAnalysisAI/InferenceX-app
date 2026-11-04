import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { KatexStyles } from '@/components/blog/katex-styles';
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
  const { content, hasMath } = await compileBlogMdx(raw, 'zh');

  return (
    <>
      <JsonLd data={buildHardwareArticleJsonLd(meta, raw, 'zh')} />
      <JsonLd data={buildHardwareBreadcrumbJsonLd(meta, 'zh')} />
      {hasMath && <KatexStyles />}
      <HardwarePageContent
        locale="zh"
        meta={meta}
        headings={extractHeadings(raw)}
        content={content}
      />
    </>
  );
}
