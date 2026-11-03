import Image from 'next/image';
import type { CSSProperties, ReactNode } from 'react';

import { ThemedFigureImage } from '@/components/blog/themed-figure-image';
import { JsonLd } from '@/components/seo/json-ld';
import { Badge } from '@/components/ui/badge';
import { Eyebrow } from '@/components/ui/eyebrow';
import { ExternalLinkIcon } from '@/components/ui/external-link-icon';
import { Heading } from '@/components/ui/heading';
import { ResultContext } from '@/components/ui/result-context';
import { type Locale, localePath } from '@/lib/i18n/i18n';
import {
  buildWhitepaperBreadcrumbJsonLd,
  buildWhitepaperJsonLd,
  formatWhitepaperDate,
  WHITEPAPER_COPY,
  type Whitepaper,
  whitepaperCopy,
  whitepaperIndexPath,
  whitepaperTagLabel,
} from '@/lib/content/whitepapers';
import { cn } from '@/lib/shared/utils';

import {
  WhitepaperBackLink,
  WhitepaperEstimatorLink,
  WhitepaperPdfButton,
  WhitepaperSourceLink,
} from './whitepaper-links';

const ESTIMATOR_PATH = '/profit-estimator-per-gigawatt/kimi-k3/target/45';

const CHIP_SHADOW_STYLE: CSSProperties = {
  filter:
    'drop-shadow(0 28px 48px rgba(0, 0, 0, 0.55)) drop-shadow(0 6px 12px rgba(0, 0, 0, 0.35))',
};

interface SectionProps {
  id: string;
  title: string;
  children: ReactNode;
  className?: string;
}

function Section({ id, title, children, className }: SectionProps) {
  return (
    <section className={cn('flex flex-col gap-5', className)} aria-labelledby={id}>
      <Heading as="h2" level="section" id={id} className="scroll-mt-24 text-2xl">
        {title}
      </Heading>
      {children}
    </section>
  );
}

function StepNumber({ children }: { children: ReactNode }) {
  return (
    <span
      className="w-5 shrink-0 text-base leading-7 font-medium text-muted-foreground tabular-nums"
      aria-hidden="true"
    >
      {children}
    </span>
  );
}

export function WhitepaperDetailContent({ paper, locale }: { paper: Whitepaper; locale: Locale }) {
  const t = WHITEPAPER_COPY[locale];
  const copy = whitepaperCopy(paper, locale);
  const { chart } = paper;

  const sectionIds = [
    { id: 'whitepaper-key-numbers', label: t.keyNumbers },
    { id: 'whitepaper-figures', label: t.figures },
    { id: 'whitepaper-summary', label: t.summary },
    { id: 'whitepaper-key-findings', label: t.keyFindings },
    { id: 'whitepaper-method', label: t.method },
    { id: 'whitepaper-assumptions', label: t.assumptions },
    { id: 'whitepaper-sources', label: t.sources },
  ];

  const pdfCard = (
    <div
      className="flex flex-col gap-4 rounded-xl border border-border/30 bg-card p-5"
      data-testid="whitepaper-pdf-card"
    >
      <div className="flex items-start gap-4">
        <Image
          src={paper.coverImagePath}
          alt={copy.coverAlt}
          width={1275}
          height={1650}
          sizes="112px"
          className="w-24 shrink-0 rounded-md border border-border/30 shadow-sm"
        />
        <div className="min-w-0 flex flex-col gap-1.5">
          <Heading as="h2" level="card">
            {t.pdfCardTitle}
          </Heading>
          <p className="text-sm text-muted-foreground">{t.pdfCardMeta(paper.pageCount)}</p>
          <p className="text-xs text-muted-foreground">{t.dataAsOf(paper.dataDate)}</p>
        </div>
      </div>
      <WhitepaperPdfButton
        href={paper.pdfPath}
        slug={paper.slug}
        label={t.downloadPdf}
        placement="sidebar"
        size="default"
        className="w-full"
      />
    </div>
  );

  return (
    <main className="relative" data-testid="whitepaper-detail-page">
      <JsonLd data={buildWhitepaperJsonLd(paper, locale)} />
      <JsonLd data={buildWhitepaperBreadcrumbJsonLd(paper, locale)} />
      <div className="container mx-auto flex flex-col gap-10 px-4 pt-4 pb-8 lg:gap-12 lg:px-8">
        <section
          className="dark relative isolate overflow-hidden rounded-xl border border-border/30 bg-[linear-gradient(135deg,#0b0c0e_0%,#131416_100%)] text-foreground lg:min-h-[420px]"
          data-testid="whitepaper-hero"
        >
          <div className="grid md:grid-cols-[minmax(0,1fr)_minmax(15rem,36%)] xl:grid-cols-[minmax(0,1fr)_30rem]">
            <div className="flex flex-col gap-5 p-6 md:p-10 lg:gap-6 lg:py-12 lg:pl-12">
              <WhitepaperBackLink href={whitepaperIndexPath(locale)} label={t.backToIndex} />
              <header className="flex flex-col gap-4">
                <Eyebrow as="p">{copy.typeLabel}</Eyebrow>
                <Heading
                  as="h1"
                  level="display"
                  className="text-3xl leading-tight md:text-4xl lg:text-5xl lg:leading-[1.08]"
                >
                  {copy.title}
                </Heading>
                <p className="max-w-prose text-base text-muted-foreground lg:text-lg">
                  {copy.subtitle}
                </p>
              </header>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-muted-foreground">
                <span>{copy.authors}</span>
                <span aria-hidden="true">&middot;</span>
                <time dateTime={paper.publishedDate}>
                  {formatWhitepaperDate(paper.publishedDate, locale)}
                </time>
                <span aria-hidden="true">&middot;</span>
                <span>{t.pages(paper.pageCount)}</span>
              </div>
              <ul className="flex flex-wrap gap-2" aria-label={t.tags}>
                {paper.tags.map((tag) => (
                  <li key={tag}>
                    <Badge variant="outline">{whitepaperTagLabel(tag, locale)}</Badge>
                  </li>
                ))}
              </ul>
              <div className="mt-1 flex flex-wrap items-center gap-3">
                <WhitepaperPdfButton
                  href={paper.pdfPath}
                  slug={paper.slug}
                  label={t.downloadPdf}
                  placement="hero"
                />
                <WhitepaperEstimatorLink
                  href={localePath(ESTIMATOR_PATH, locale)}
                  slug={paper.slug}
                  label={t.openEstimator}
                />
              </div>
            </div>
            <div className="relative hidden min-h-[18rem] md:block" aria-hidden="true">
              <Image
                src={paper.chipImagePath}
                alt=""
                width={paper.chipImageWidth}
                height={paper.chipImageHeight}
                priority
                sizes="(min-width: 1280px) 620px, (min-width: 768px) 42vw, 0px"
                className="absolute bottom-[-9%] right-[-8%] w-[118%] max-w-none"
                style={CHIP_SHADOW_STYLE}
              />
            </div>
          </div>
        </section>

        <section
          className="flex flex-col gap-4"
          aria-labelledby="whitepaper-key-numbers"
          id="whitepaper-key-numbers-section"
        >
          <h2 id="whitepaper-key-numbers" className="sr-only scroll-mt-24">
            {t.keyNumbers}
          </h2>
          <dl className="grid gap-4 sm:grid-cols-3" data-testid="whitepaper-kpis">
            {copy.kpis.map((kpi) => (
              <div
                key={kpi.label}
                data-testid="whitepaper-kpi"
                className="flex flex-col gap-2 rounded-xl border border-border/30 bg-card p-6"
              >
                <dt className="order-2 text-base font-medium text-foreground">{kpi.label}</dt>
                <dd className="order-1 text-4xl font-medium text-foreground tabular-nums lg:text-5xl">
                  {kpi.value}
                </dd>
                <dd className="order-3 text-sm leading-6 text-muted-foreground">{kpi.caption}</dd>
              </div>
            ))}
          </dl>
          <p
            className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm text-muted-foreground"
            data-testid="whitepaper-comparison"
          >
            <span className="font-medium text-foreground">{copy.comparison.lead}:</span>
            {copy.comparison.items.map((item, index) => (
              <span key={item.label} className="inline-flex items-center gap-x-3">
                {index > 0 && (
                  <span aria-hidden="true" className="hidden sm:inline">
                    &middot;
                  </span>
                )}
                <span>
                  <span className="font-medium text-foreground tabular-nums">{item.value}</span>{' '}
                  {item.label}
                </span>
              </span>
            ))}
          </p>
        </section>

        <section className="flex flex-col gap-6" aria-labelledby="whitepaper-figures">
          <h2 id="whitepaper-figures" className="sr-only scroll-mt-24">
            {t.figures}
          </h2>
          {paper.figures.map((figure, index) => {
            const figureCopy = copy.figures[index];
            if (!figureCopy) return null;
            return (
              <figure
                key={figure.id}
                id={figure.id}
                className="flex flex-col gap-4 rounded-xl border border-border/30 bg-card p-5 md:p-6"
                data-testid="whitepaper-figure"
              >
                <div className="flex flex-col gap-2">
                  <Heading as="h3" level="card" className="text-balance">
                    <img
                      src={chart.modelLogoPath}
                      alt=""
                      aria-hidden="true"
                      width={24}
                      height={24}
                      className="mr-2 inline-block size-6 shrink-0 object-contain align-[-0.3em]"
                    />
                    {copy.figureTitle}
                  </Heading>
                  <ResultContext
                    locale={locale}
                    costTier={figureCopy.costTier}
                    utilization={chart.utilization}
                    licenseFee={chart.licenseFee}
                    date={paper.dataDate}
                    source={chart.source}
                  />
                  <p className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    {t.tcoBadgesLabel} <Badge variant="outline">{figure.tcoBadge}</Badge>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    <small>
                      {t.sourceLabel}{' '}
                      <a
                        href={chart.tcoSourceHref}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline hover:text-foreground"
                      >
                        {chart.tcoSourceTitle}
                        <ExternalLinkIcon />
                      </a>
                    </small>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    <span className="font-medium text-foreground">{t.sellingPriceLabel}:</span>{' '}
                    {t.sellingPrices(
                      chart.sellingPrices.input,
                      chart.sellingPrices.cached,
                      chart.sellingPrices.output,
                      chart.sellingPrices.source,
                    )}
                  </p>
                </div>
                <div className="-mx-1 overflow-x-auto px-1 pb-1">
                  <div
                    className="min-w-[36rem] overflow-hidden rounded-lg border border-border/30 sm:min-w-0"
                    style={{ aspectRatio: `${figure.width} / ${figure.height}` }}
                  >
                    <ThemedFigureImage
                      srcLight={figure.srcLight}
                      srcDark={figure.srcDark}
                      alt={figureCopy.alt}
                      loading={index === 0 ? 'eager' : 'lazy'}
                      className="block h-full w-full object-cover"
                    />
                  </div>
                </div>
                <p className="text-xs text-muted-foreground sm:hidden" aria-hidden="true">
                  {t.scrollHint}
                </p>
                <figcaption className="max-w-prose text-sm leading-6 text-muted-foreground">
                  {figureCopy.caption}
                </figcaption>
              </figure>
            );
          })}
        </section>

        <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_18rem] lg:gap-12 xl:grid-cols-[minmax(0,1fr)_20rem]">
          <div className="flex min-w-0 flex-col gap-12">
            <Section id="whitepaper-summary" title={t.summary}>
              <p className="max-w-prose text-base leading-7 text-foreground">{copy.abstract}</p>
            </Section>

            <Section id="whitepaper-key-findings" title={t.keyFindings}>
              <ol className="flex max-w-prose flex-col gap-4">
                {copy.keyFindings.map((finding, index) => (
                  <li key={finding} className="flex items-start gap-3">
                    <StepNumber>{index + 1}</StepNumber>
                    <p className="text-base leading-7 text-foreground">{finding}</p>
                  </li>
                ))}
              </ol>
            </Section>

            <Section id="whitepaper-method" title={t.method}>
              <ol className="flex max-w-prose flex-col gap-4">
                {copy.methodSteps.map((step, index) => (
                  <li key={step} className="flex items-start gap-3">
                    <StepNumber>{index + 1}</StepNumber>
                    <p className="text-base leading-7 text-foreground">{step}</p>
                  </li>
                ))}
              </ol>
            </Section>

            <Section id="whitepaper-assumptions" title={t.assumptions}>
              <div className="overflow-x-auto rounded-xl border border-border/30 bg-card">
                <table className="w-full text-sm">
                  <thead className="text-left text-xs text-muted-foreground">
                    <tr className="border-b border-border/30">
                      <th scope="col" className="px-5 py-3 font-medium">
                        {t.assumptionItem}
                      </th>
                      <th scope="col" className="px-5 py-3 font-medium">
                        {t.assumptionValue}
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/20">
                    {copy.assumptions.map((row) => (
                      <tr key={row.item}>
                        <th
                          scope="row"
                          className="whitespace-nowrap px-5 py-3 text-left align-top leading-6 font-medium text-foreground"
                        >
                          {row.item}
                        </th>
                        <td className="px-5 py-3 leading-6 text-foreground">{row.value}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Section>

            <Section id="whitepaper-sources" title={t.sources}>
              <ul className="flex flex-col gap-3">
                {copy.sources.map((source) => (
                  <li key={source.href} className="flex flex-col gap-0.5 text-sm">
                    <WhitepaperSourceLink href={source.href} slug={paper.slug}>
                      {source.label}
                    </WhitepaperSourceLink>
                    <span className="break-all font-mono text-xs text-muted-foreground">
                      {source.href}
                    </span>
                  </li>
                ))}
              </ul>
            </Section>
          </div>

          <aside className="flex flex-col gap-6 lg:sticky lg:top-24 lg:self-start">
            {pdfCard}
            <nav className="hidden flex-col gap-3 lg:flex" aria-label={t.onThisPage}>
              <Eyebrow as="p">{t.onThisPage}</Eyebrow>
              <ol className="flex flex-col gap-1.5 text-sm">
                {sectionIds.map((section) => (
                  <li key={section.id}>
                    <a
                      href={`#${section.id}`}
                      className="block rounded-md py-1 text-muted-foreground transition-colors hover:text-foreground"
                    >
                      {section.label}
                    </a>
                  </li>
                ))}
              </ol>
            </nav>
          </aside>
        </div>

        <section
          className="flex flex-col items-start gap-5 rounded-xl border border-border/30 bg-card p-6 md:flex-row md:items-center md:justify-between md:p-8"
          aria-labelledby="whitepaper-closing"
        >
          <div className="flex flex-col gap-1.5">
            <Heading as="h2" level="section" id="whitepaper-closing">
              {t.closingHeading}
            </Heading>
            <p className="max-w-prose text-sm leading-6 text-muted-foreground">{t.closingBody}</p>
          </div>
          <WhitepaperPdfButton
            href={paper.pdfPath}
            slug={paper.slug}
            label={t.downloadPdf}
            placement="closing"
            className="shrink-0"
          />
        </section>
      </div>
    </main>
  );
}
