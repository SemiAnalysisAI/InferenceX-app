import { DollarSign, FileText, Percent, TrendingUp } from 'lucide-react';
import Image from 'next/image';
import type { CSSProperties, ReactNode } from 'react';

import { ThemedFigureImage } from '@/components/blog/themed-figure-image';
import { JsonLd } from '@/components/json-ld';
import { Badge } from '@/components/ui/badge';
import { Eyebrow } from '@/components/ui/eyebrow';
import { ExternalLinkIcon } from '@/components/ui/external-link-icon';
import { Heading } from '@/components/ui/heading';
import { ResultContext } from '@/components/ui/result-context';
import { type Locale, localePath } from '@/lib/i18n';
import {
  buildWhitepaperBreadcrumbJsonLd,
  buildWhitepaperJsonLd,
  formatWhitepaperDate,
  WHITEPAPER_COPY,
  type Whitepaper,
  type WhitepaperKpiIcon,
  whitepaperCopy,
  whitepaperIndexPath,
} from '@/lib/whitepapers';
import { cn } from '@/lib/utils';

import {
  WhitepaperBackLink,
  WhitepaperEstimatorLink,
  WhitepaperPdfButton,
  WhitepaperSourceLink,
} from './whitepaper-links';

const ESTIMATOR_PATH = '/profit-estimator-per-gigawatt';

/** Chart red family from the figures; the light value is the plot's profit segment. */
const KPI_NUMBER_CLASS = 'text-[#ba534b] dark:text-[#d97a70]';

const KPI_ICONS: Record<WhitepaperKpiIcon, typeof DollarSign> = {
  dollar: DollarSign,
  trending: TrendingUp,
  percent: Percent,
};

/** Fine dot grid, faded toward the bottom-right so the chip render sits on clean ground. */
const HERO_GRID_STYLE: CSSProperties = {
  backgroundImage:
    'radial-gradient(circle at center, rgba(234, 235, 236, 0.16) 1px, transparent 1.2px), linear-gradient(rgba(234, 235, 236, 0.035) 1px, transparent 1px), linear-gradient(90deg, rgba(234, 235, 236, 0.035) 1px, transparent 1px)',
  backgroundSize: '28px 28px, 112px 112px, 112px 112px',
  maskImage:
    'linear-gradient(115deg, rgba(0, 0, 0, 0.9), rgba(0, 0, 0, 0.35) 55%, transparent 90%)',
  WebkitMaskImage:
    'linear-gradient(115deg, rgba(0, 0, 0, 0.9), rgba(0, 0, 0, 0.35) 55%, transparent 90%)',
};

const HERO_GLOW_STYLE: CSSProperties = {
  background:
    'radial-gradient(closest-side, rgba(247, 176, 65, 0.22), rgba(247, 176, 65, 0.06) 55%, transparent 100%)',
};

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

function StepNumber({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        'flex size-8 shrink-0 items-center justify-center rounded-full border border-primary/40 bg-primary/10 font-mono text-xs font-semibold text-primary tabular-nums',
        className,
      )}
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
      className="flex flex-col gap-4 rounded-2xl border border-border/50 bg-card/60 p-5 backdrop-blur-[2px]"
      data-testid="whitepaper-pdf-card"
    >
      <div className="flex items-start gap-4">
        <Image
          src={paper.coverImagePath}
          alt={copy.coverAlt}
          width={1275}
          height={1650}
          sizes="112px"
          className="w-24 shrink-0 rounded-md border border-border/60 shadow-md shadow-black/20"
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
      <div className="container mx-auto flex flex-col gap-10 px-4 pb-16 lg:gap-12 lg:px-8">
        {/* Hero band: dark surface in every theme, so the `dark` class scopes the dark tokens here. */}
        <section
          className="dark relative isolate overflow-hidden rounded-2xl border border-border/40 bg-[linear-gradient(135deg,#0b0c0e_0%,#131416_100%)] text-foreground lg:min-h-[420px]"
          data-testid="whitepaper-hero"
        >
          <div className="pointer-events-none absolute inset-0 -z-10" style={HERO_GRID_STYLE} />
          <div className="grid md:grid-cols-[minmax(0,1fr)_minmax(15rem,36%)] xl:grid-cols-[minmax(0,1fr)_30rem]">
            <div className="flex flex-col gap-5 p-6 md:p-10 lg:gap-6 lg:py-12 lg:pl-12">
              <WhitepaperBackLink href={whitepaperIndexPath(locale)} label={t.backToIndex} />
              <header className="flex flex-col gap-4">
                <Eyebrow as="p" wide>
                  {copy.typeLabel}
                </Eyebrow>
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
                    <Badge variant="outline" className="border-border/60 text-muted-foreground">
                      {tag}
                    </Badge>
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
              <div
                className="absolute right-[-10%] top-1/2 aspect-square w-[130%] -translate-y-1/2"
                style={HERO_GLOW_STYLE}
              />
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

        {/* Stat strip */}
        <section
          className="flex flex-col gap-4"
          aria-labelledby="whitepaper-key-numbers"
          id="whitepaper-key-numbers-section"
        >
          <h2 id="whitepaper-key-numbers" className="sr-only scroll-mt-24">
            {t.keyNumbers}
          </h2>
          <dl className="grid gap-4 sm:grid-cols-3" data-testid="whitepaper-kpis">
            {copy.kpis.map((kpi) => {
              const Icon = KPI_ICONS[kpi.icon];
              return (
                <div
                  key={kpi.label}
                  data-testid="whitepaper-kpi"
                  className="flex flex-col gap-3 rounded-2xl border border-border/50 bg-card/60 p-6 backdrop-blur-[2px] lg:p-7"
                >
                  <span className="flex size-9 items-center justify-center rounded-lg border border-border/50 bg-background/60 text-muted-foreground">
                    <Icon aria-hidden="true" className="size-4" />
                  </span>
                  <dt className="order-3 text-base font-semibold text-foreground">{kpi.label}</dt>
                  <dd
                    className={cn(
                      'order-2 text-4xl font-bold tracking-heading tabular-nums sm:text-5xl lg:text-6xl',
                      KPI_NUMBER_CLASS,
                    )}
                  >
                    {kpi.value}
                  </dd>
                  <dd className="order-4 text-sm leading-6 text-muted-foreground">{kpi.caption}</dd>
                </div>
              );
            })}
          </dl>
          <p
            className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-xl border border-border/40 bg-card/40 px-5 py-3.5 text-sm text-muted-foreground"
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
                  <span className="font-semibold text-foreground tabular-nums">{item.value}</span>{' '}
                  {item.label}
                </span>
              </span>
            ))}
          </p>
        </section>

        {/* Figures */}
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
                className="flex flex-col gap-4 rounded-2xl border border-border/50 bg-card/60 p-5 backdrop-blur-[2px] md:p-7"
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
                {/* The chart is wide; below sm it keeps a readable width and scrolls sideways. */}
                <div className="-mx-1 overflow-x-auto px-1 pb-1">
                  <div
                    className="min-w-[36rem] overflow-hidden rounded-lg border border-border/40 sm:min-w-0"
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

        {/* Body */}
        <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_18rem] lg:gap-12 xl:grid-cols-[minmax(0,1fr)_20rem]">
          <div className="flex min-w-0 flex-col gap-12">
            <Section id="whitepaper-summary" title={t.summary}>
              <p className="max-w-prose text-base leading-7 text-foreground/90">{copy.abstract}</p>
            </Section>

            <Section id="whitepaper-key-findings" title={t.keyFindings}>
              <ol className="grid gap-4 sm:grid-cols-2">
                {copy.keyFindings.map((finding, index) => (
                  <li
                    key={finding}
                    className="flex flex-col gap-3 rounded-2xl border border-border/50 bg-card/60 p-5 backdrop-blur-[2px] sm:last:odd:col-span-2"
                  >
                    <StepNumber>{index + 1}</StepNumber>
                    <p className="text-base leading-7 text-foreground/90">{finding}</p>
                  </li>
                ))}
              </ol>
            </Section>

            <Section id="whitepaper-method" title={t.method}>
              <ol className="flex flex-col divide-y divide-border/40 rounded-2xl border border-border/50 bg-card/60 backdrop-blur-[2px]">
                {copy.methodSteps.map((step, index) => (
                  <li key={step} className="flex items-start gap-4 px-5 py-4">
                    <StepNumber className="mt-0.5">{index + 1}</StepNumber>
                    <p className="text-base leading-7 text-foreground/90">{step}</p>
                  </li>
                ))}
              </ol>
            </Section>

            <Section id="whitepaper-assumptions" title={t.assumptions}>
              <div className="overflow-x-auto rounded-2xl border border-border/50 bg-card/60 backdrop-blur-[2px]">
                <table className="w-full text-sm">
                  <thead className="text-left text-xs text-muted-foreground">
                    <tr className="border-b border-border/50">
                      <th scope="col" className="px-5 py-3 font-medium">
                        {t.assumptionItem}
                      </th>
                      <th scope="col" className="px-5 py-3 font-medium">
                        {t.assumptionValue}
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/40">
                    {copy.assumptions.map((row) => (
                      <tr key={row.item}>
                        <th
                          scope="row"
                          className="whitespace-nowrap px-5 py-3 text-left align-top font-medium text-foreground"
                        >
                          {row.item}
                        </th>
                        <td className="px-5 py-3 leading-6 text-foreground/90">{row.value}</td>
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
            <nav
              className="hidden flex-col gap-3 rounded-2xl border border-border/50 bg-card/60 p-5 backdrop-blur-[2px] lg:flex"
              aria-label={t.onThisPage}
            >
              <Eyebrow as="p" tone="muted">
                {t.onThisPage}
              </Eyebrow>
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

        {/* Closing CTA */}
        <section
          className="flex flex-col items-start gap-5 rounded-2xl border border-primary/30 bg-primary/5 p-6 md:flex-row md:items-center md:justify-between md:p-8"
          aria-labelledby="whitepaper-closing"
        >
          <div className="flex items-start gap-4">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-primary/30 bg-primary/10 text-primary">
              <FileText aria-hidden="true" className="size-5" />
            </span>
            <div className="flex flex-col gap-1.5">
              <Heading as="h2" level="section" id="whitepaper-closing">
                {t.closingHeading}
              </Heading>
              <p className="max-w-prose text-sm leading-6 text-muted-foreground">{t.closingBody}</p>
            </div>
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
