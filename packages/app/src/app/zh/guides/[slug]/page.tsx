import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { JsonLd } from '@/components/json-ld';
import { Card } from '@/components/ui/card';
import { getPostBySlug } from '@/lib/blog';
import { getChipPage } from '@/lib/chip-pages';
import { getZhGlossaryEntry } from '@/lib/glossary-zh';
import {
  GUIDE_CATEGORY_LABELS_ZH,
  getAdjacentZhGuides,
  getAllZhGuides,
  getRelatedZhGuides,
  getZhGuide,
} from '@/lib/guides-zh';
import { ZH_LANG_TAG, ZH_OG_LOCALE, zhAlternates } from '@/lib/i18n';
import {
  AUTHOR_HANDLE,
  AUTHOR_NAME,
  SITE_NAME,
  SITE_URL,
} from '@semianalysisai/inferencex-constants';

interface Props {
  params: Promise<{ slug: string }>;
}

export const dynamicParams = false;

export function generateStaticParams() {
  return getAllZhGuides().map((entry) => ({ slug: entry.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const entry = getZhGuide(slug);
  if (!entry) return {};

  const url = `${SITE_URL}/zh/guides/${entry.slug}`;

  return {
    title: entry.title,
    description: entry.description,
    keywords: [...entry.keywords],
    authors: [{ name: AUTHOR_NAME }],
    alternates: zhAlternates(`/guides/${entry.slug}`),
    openGraph: {
      title: `${entry.title} | ${SITE_NAME}`,
      description: entry.description,
      url,
      locale: ZH_OG_LOCALE,
      type: 'article',
    },
    twitter: {
      card: 'summary_large_image',
      title: entry.title,
      description: entry.description,
      site: AUTHOR_HANDLE,
      creator: AUTHOR_HANDLE,
    },
  };
}

export default async function ZhGuidePage({ params }: Props) {
  const { slug } = await params;
  const entry = getZhGuide(slug);
  if (!entry) notFound();

  const relatedGuides = getRelatedZhGuides(entry);
  const adjacent = getAdjacentZhGuides(entry.slug);
  const relatedChips = entry.relatedChipSlugs.flatMap((chipSlug) => {
    const chip = getChipPage(chipSlug);
    return chip ? [{ slug: chipSlug, title: chip.title }] : [];
  });
  const relatedTerms = entry.relatedGlossarySlugs.flatMap((termSlug) => {
    const term = getZhGlossaryEntry(termSlug);
    return term ? [{ slug: termSlug, term: term.term }] : [];
  });
  const relatedArticles = entry.articleSlugs.flatMap((articleSlug) => {
    const post = getPostBySlug(articleSlug, 'zh');
    return post
      ? [{ slug: articleSlug, title: post.meta.title, subtitle: post.meta.subtitle }]
      : [];
  });
  const guideUrl = `${SITE_URL}/zh/guides/${entry.slug}`;
  const guidesUrl = `${SITE_URL}/zh/guides`;
  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'TechArticle',
        '@id': guideUrl,
        headline: entry.title,
        description: entry.description,
        url: guideUrl,
        inLanguage: ZH_LANG_TAG,
        author: {
          '@type': 'Organization',
          name: AUTHOR_NAME,
        },
        isPartOf: {
          '@type': 'CollectionPage',
          '@id': guidesUrl,
          name: 'InferenceX LLM 推理实践指南',
          url: guidesUrl,
          inLanguage: ZH_LANG_TAG,
        },
      },
      {
        '@type': 'FAQPage',
        inLanguage: ZH_LANG_TAG,
        mainEntity: entry.faq.map((item) => ({
          '@type': 'Question',
          name: item.question,
          acceptedAnswer: {
            '@type': 'Answer',
            text: item.answer,
          },
        })),
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          {
            '@type': 'ListItem',
            position: 1,
            name: '实践指南',
            item: guidesUrl,
          },
          {
            '@type': 'ListItem',
            position: 2,
            name: entry.title,
            item: guideUrl,
          },
        ],
      },
    ],
  };

  return (
    <main className="relative">
      <JsonLd data={jsonLd} />
      <div className="container mx-auto px-4 lg:px-8">
        <article className="mx-auto max-w-5xl">
          <Card className="overflow-hidden p-0">
            <header className="relative border-b border-border/50 px-5 py-8 md:px-10 md:py-12">
              <div
                aria-hidden="true"
                className="absolute inset-x-0 top-0 h-px bg-linear-to-r from-transparent via-brand/70 to-transparent"
              />
              <Link
                href="/zh/guides"
                className="group inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-brand"
              >
                <span
                  aria-hidden="true"
                  className="transition-transform group-hover:-translate-x-0.5"
                >
                  ←
                </span>
                LLM 推理实践指南
              </Link>
              <div className="mt-8 flex flex-wrap items-center gap-2">
                <span className="rounded-full border border-brand/25 bg-brand/8 px-3 py-1 text-xs font-semibold tracking-[0.14em] text-brand uppercase">
                  {GUIDE_CATEGORY_LABELS_ZH[entry.category]}
                </span>
              </div>
              <h1 className="mt-4 max-w-4xl text-4xl font-bold tracking-[-0.035em] text-balance md:text-5xl">
                {entry.title}
              </h1>
            </header>

            <div className="grid gap-0 lg:grid-cols-[minmax(0,1fr)_16rem]">
              <div className="px-5 py-8 md:px-10 md:py-12">
                <section
                  aria-labelledby="quick-answer-heading"
                  className="rounded-xl border border-brand/20 bg-brand/6 p-5 md:p-6"
                >
                  <p
                    id="quick-answer-heading"
                    className="font-mono text-xs font-semibold tracking-[0.18em] text-brand uppercase"
                  >
                    快速回答
                  </p>
                  <p className="mt-3 text-lg leading-relaxed font-medium text-pretty md:text-xl">
                    {entry.quickAnswer}
                  </p>
                </section>

                <div className="mt-10 space-y-10">
                  {entry.sections.map((section) => (
                    <section key={section.heading} aria-label={section.heading}>
                      <h2 className="text-xl font-semibold tracking-tight">{section.heading}</h2>
                      {section.paragraphs.map((paragraph) => (
                        <p key={paragraph} className="mt-3 leading-7 text-muted-foreground">
                          {paragraph}
                        </p>
                      ))}
                    </section>
                  ))}
                </div>

                <section
                  aria-labelledby="faq-heading"
                  className="mt-10 border-t border-border/50 pt-10"
                >
                  <h2 id="faq-heading" className="text-xl font-semibold tracking-tight">
                    常见问题
                  </h2>
                  <div className="mt-5 space-y-6">
                    {entry.faq.map((item) => (
                      <div key={item.question}>
                        <h3 className="font-semibold leading-snug">{item.question}</h3>
                        <p className="mt-2 leading-7 text-muted-foreground">{item.answer}</p>
                      </div>
                    ))}
                  </div>
                </section>
              </div>

              <aside className="border-t border-border/50 bg-muted/10 px-5 py-8 lg:border-t-0 lg:border-l lg:px-6 lg:py-12">
                {relatedGuides.length > 0 && (
                  <>
                    <p className="font-mono text-xs font-semibold tracking-[0.16em] text-muted-foreground uppercase">
                      相关指南
                    </p>
                    <nav aria-label="相关指南" className="mt-4 flex flex-col">
                      {relatedGuides.map((related) => (
                        <Link
                          key={related.slug}
                          href={`/zh/guides/${related.slug}`}
                          className="group border-b border-border/40 py-3 text-sm font-medium transition-colors last:border-b-0 hover:text-brand"
                        >
                          <span className="flex items-center justify-between gap-3">
                            {related.title}
                            <span
                              aria-hidden="true"
                              className="text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-brand"
                            >
                              →
                            </span>
                          </span>
                        </Link>
                      ))}
                    </nav>
                  </>
                )}

                {relatedChips.length > 0 && (
                  <>
                    <p className="mt-8 font-mono text-xs font-semibold tracking-[0.16em] text-muted-foreground uppercase">
                      涉及芯片
                    </p>
                    <nav aria-label="涉及的芯片页面" className="mt-3 flex flex-wrap gap-2">
                      {relatedChips.map((chip) => (
                        <Link
                          key={chip.slug}
                          href={`/zh/chips/${chip.slug}`}
                          className="rounded-full border border-border/50 px-3 py-1 text-xs font-medium transition-colors hover:border-brand/40 hover:text-brand"
                        >
                          {chip.title}
                        </Link>
                      ))}
                    </nav>
                  </>
                )}

                {relatedTerms.length > 0 && (
                  <>
                    <p className="mt-8 font-mono text-xs font-semibold tracking-[0.16em] text-muted-foreground uppercase">
                      关键术语
                    </p>
                    <nav aria-label="关键术语" className="mt-3 flex flex-wrap gap-2">
                      {relatedTerms.map((term) => (
                        <Link
                          key={term.slug}
                          href={`/zh/glossary/${term.slug}`}
                          className="rounded-full border border-border/50 px-3 py-1 text-xs font-medium transition-colors hover:border-brand/40 hover:text-brand"
                        >
                          {term.term}
                        </Link>
                      ))}
                    </nav>
                  </>
                )}
              </aside>
            </div>
          </Card>

          {relatedArticles.length > 0 && (
            <section aria-labelledby="further-reading" className="mt-4">
              <Card>
                <div className="flex flex-col gap-2 border-b border-border/50 pb-5 md:flex-row md:items-end md:justify-between">
                  <div>
                    <p className="font-mono text-xs font-semibold tracking-[0.18em] text-brand uppercase">
                      数据来源
                    </p>
                    <h2 id="further-reading" className="mt-2 text-2xl font-semibold tracking-tight">
                      支撑本指南的基准测试
                    </h2>
                  </div>
                  <Link href="/zh/blog" className="text-sm text-muted-foreground hover:text-brand">
                    全部文章 →
                  </Link>
                </div>
                <div className="divide-y divide-border/40">
                  {relatedArticles.map((article) => (
                    <Link
                      key={article.slug}
                      href={`/zh/blog/${article.slug}`}
                      className="group grid gap-2 py-5 md:grid-cols-[minmax(0,1fr)_auto] md:items-center md:gap-6"
                    >
                      <div>
                        <h3 className="font-semibold leading-snug group-hover:text-brand group-hover:underline">
                          {article.title}
                        </h3>
                        <p className="mt-1 line-clamp-2 text-sm leading-6 text-muted-foreground">
                          {article.subtitle}
                        </p>
                      </div>
                      <span
                        aria-hidden="true"
                        className="hidden text-muted-foreground transition-transform group-hover:translate-x-1 group-hover:text-brand md:block"
                      >
                        →
                      </span>
                    </Link>
                  ))}
                </div>
              </Card>
            </section>
          )}

          <nav aria-label="指南翻页" className="mt-4 grid gap-4 sm:grid-cols-2">
            {adjacent.previous ? (
              <Link
                href={`/zh/guides/${adjacent.previous.slug}`}
                className="rounded-xl border border-border/40 bg-background/20 p-5 backdrop-blur-[2px] transition-colors hover:border-brand/40 hover:bg-brand/5"
              >
                <span className="text-xs tracking-[0.14em] text-muted-foreground uppercase">
                  ← 上一篇
                </span>
                <span className="mt-2 block font-semibold">{adjacent.previous.title}</span>
              </Link>
            ) : (
              <div />
            )}
            {adjacent.next && (
              <Link
                href={`/zh/guides/${adjacent.next.slug}`}
                className="rounded-xl border border-border/40 bg-background/20 p-5 text-right backdrop-blur-[2px] transition-colors hover:border-brand/40 hover:bg-brand/5"
              >
                <span className="text-xs tracking-[0.14em] text-muted-foreground uppercase">
                  下一篇 →
                </span>
                <span className="mt-2 block font-semibold">{adjacent.next.title}</span>
              </Link>
            )}
          </nav>
        </article>
      </div>
    </main>
  );
}
