import { JsonLd } from '@/components/json-ld';
import { Card } from '@/components/ui/card';
import { Heading } from '@/components/ui/heading';
import type { Locale } from '@/lib/i18n';
import {
  buildWhitepaperIndexJsonLd,
  formatWhitepaperDate,
  getAllWhitepapers,
  WHITEPAPER_COPY,
  whitepaperCopy,
  whitepaperDetailPath,
} from '@/lib/whitepapers';

import { WhitepaperCard, WhitepaperPdfButton, WhitepaperReadLink } from './whitepaper-links';

export function WhitepaperIndexContent({ locale }: { locale: Locale }) {
  const t = WHITEPAPER_COPY[locale];
  const papers = getAllWhitepapers();

  return (
    <main className="relative" data-testid="whitepaper-index-page">
      <JsonLd data={buildWhitepaperIndexJsonLd(locale)} />
      <div className="container mx-auto px-4 lg:px-8 flex flex-col gap-4">
        <section className="flex flex-col gap-4">
          <Card>
            <Heading as="h1" level="page">
              {t.indexTitle}
            </Heading>
            <p className="mt-3 text-base lg:text-lg text-muted-foreground">{t.indexIntro}</p>
            <div className="mt-6 pt-6 border-t border-border/40">
              {papers.length === 0 ? (
                <p className="text-muted-foreground">{t.indexEmpty}</p>
              ) : (
                <div className="flex flex-col gap-8">
                  {papers.map((paper) => {
                    const copy = whitepaperCopy(paper, locale);
                    const href = whitepaperDetailPath(paper.slug, locale);
                    return (
                      <WhitepaperCard
                        key={paper.slug}
                        slug={paper.slug}
                        href={href}
                        title={copy.title}
                      >
                        <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground mb-2">
                          <span>{copy.typeLabel}</span>
                          <span>&middot;</span>
                          <time dateTime={paper.publishedDate}>
                            {formatWhitepaperDate(paper.publishedDate, locale)}
                          </time>
                          <span>&middot;</span>
                          <span>{t.pages(paper.pageCount)}</span>
                        </div>
                        <Heading
                          as="h2"
                          level="section"
                          className="text-2xl mb-2 group-hover:underline group-hover:text-brand"
                        >
                          {copy.title}
                        </Heading>
                        <p className="text-muted-foreground mb-3">{copy.subtitle}</p>
                        <div className="flex flex-wrap gap-2 mb-4">
                          {paper.tags.map((tag) => (
                            <span
                              key={tag}
                              className="rounded-full bg-muted px-3 py-0.5 text-xs text-muted-foreground"
                            >
                              {tag}
                            </span>
                          ))}
                        </div>
                        <div className="flex flex-wrap items-center gap-3">
                          <WhitepaperPdfButton
                            href={paper.pdfPath}
                            slug={paper.slug}
                            label={t.downloadPdf}
                            placement="card"
                            size="sm"
                            className="relative"
                          />
                          <WhitepaperReadLink href={href} slug={paper.slug} label={t.readSummary} />
                        </div>
                      </WhitepaperCard>
                    );
                  })}
                </div>
              )}
            </div>
          </Card>
        </section>
      </div>
    </main>
  );
}
