import Image from 'next/image';

import { JsonLd } from '@/components/json-ld';
import { Badge } from '@/components/ui/badge';
import { Eyebrow } from '@/components/ui/eyebrow';
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
      <div className="container mx-auto flex flex-col gap-8 px-4 pb-16 lg:gap-10 lg:px-8">
        <header className="flex flex-col gap-3 pt-4 lg:pt-8">
          <Eyebrow as="p" wide>
            {t.indexEyebrow}
          </Eyebrow>
          <Heading as="h1" level="page" className="text-balance">
            {t.indexTitle}
          </Heading>
          <p className="max-w-prose text-base text-muted-foreground lg:text-lg">{t.indexIntro}</p>
        </header>

        {papers.length === 0 ? (
          <p className="text-muted-foreground">{t.indexEmpty}</p>
        ) : (
          <div className="grid gap-6 lg:grid-cols-2">
            {papers.map((paper) => {
              const copy = whitepaperCopy(paper, locale);
              const href = whitepaperDetailPath(paper.slug, locale);
              return (
                <WhitepaperCard
                  key={paper.slug}
                  slug={paper.slug}
                  href={href}
                  title={copy.title}
                  thumbnail={
                    <Image
                      src={paper.coverImagePath}
                      alt={copy.coverAlt}
                      width={1275}
                      height={1650}
                      sizes="(min-width: 1024px) 144px, 112px"
                      className="w-28 shrink-0 self-start rounded-md border border-border/60 shadow-md shadow-black/20 transition-transform duration-200 group-hover:-translate-y-0.5 lg:w-36"
                    />
                  }
                >
                  <div className="flex flex-col gap-3">
                    <Eyebrow as="p">{copy.typeLabel}</Eyebrow>
                    <Heading
                      as="h2"
                      level="card"
                      className="text-balance text-lg leading-snug group-hover:text-brand lg:text-xl"
                    >
                      {copy.title}
                    </Heading>
                    <p className="text-sm text-muted-foreground">{copy.subtitle}</p>
                    <p className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                      <time dateTime={paper.publishedDate}>
                        {formatWhitepaperDate(paper.publishedDate, locale)}
                      </time>
                      <span aria-hidden="true">&middot;</span>
                      <span>{t.pages(paper.pageCount)}</span>
                    </p>
                    <dl
                      className="flex flex-wrap gap-x-6 gap-y-2 border-y border-border/40 py-3"
                      data-testid="whitepaper-card-kpis"
                    >
                      {copy.kpis.map((kpi) => (
                        <div key={kpi.label} className="flex flex-col-reverse">
                          <dt className="text-xs text-muted-foreground">{kpi.label}</dt>
                          <dd className="text-lg font-bold tabular-nums text-foreground">
                            {kpi.value}
                          </dd>
                        </div>
                      ))}
                    </dl>
                    <ul className="flex flex-wrap gap-1.5" aria-label={t.tags}>
                      {paper.tags.map((tag) => (
                        <li key={tag}>
                          <Badge variant="outline">{tag}</Badge>
                        </li>
                      ))}
                    </ul>
                    <div className="flex flex-wrap items-center gap-4 pt-1">
                      <WhitepaperReadLink href={href} slug={paper.slug} label={t.readSummary} />
                      <WhitepaperPdfButton
                        href={paper.pdfPath}
                        slug={paper.slug}
                        label={t.downloadPdf}
                        placement="card"
                        size="sm"
                        variant="outline"
                        className="relative"
                      />
                    </div>
                  </div>
                </WhitepaperCard>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
