import { JsonLd } from '@/components/json-ld';
import { Card } from '@/components/ui/card';
import { Eyebrow } from '@/components/ui/eyebrow';
import { Heading } from '@/components/ui/heading';
import { type Locale, localePath } from '@/lib/i18n';
import {
  buildWhitepaperBreadcrumbJsonLd,
  buildWhitepaperJsonLd,
  formatWhitepaperDate,
  WHITEPAPER_COPY,
  type Whitepaper,
  whitepaperCopy,
  whitepaperIndexPath,
} from '@/lib/whitepapers';

import {
  WhitepaperBackLink,
  WhitepaperEstimatorLink,
  WhitepaperPdfButton,
  WhitepaperSourceLink,
} from './whitepaper-links';

const ESTIMATOR_PATH = '/profit-estimator-per-gigawatt';

function SectionHeading({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <Heading as="h2" level="section" id={id} className="scroll-mt-24">
      {children}
    </Heading>
  );
}

export function WhitepaperDetailContent({ paper, locale }: { paper: Whitepaper; locale: Locale }) {
  const t = WHITEPAPER_COPY[locale];
  const copy = whitepaperCopy(paper, locale);

  return (
    <main className="relative" data-testid="whitepaper-detail-page">
      <JsonLd data={buildWhitepaperJsonLd(paper, locale)} />
      <JsonLd data={buildWhitepaperBreadcrumbJsonLd(paper, locale)} />
      <div className="container mx-auto px-4 lg:px-8 flex flex-col gap-4">
        <section className="flex flex-col gap-4">
          <Card>
            <WhitepaperBackLink href={whitepaperIndexPath(locale)} label={t.backToIndex} />
            <header>
              <Eyebrow as="p">{copy.typeLabel}</Eyebrow>
              <Heading as="h1" level="page" className="mt-2 text-balance">
                {copy.title}
              </Heading>
              <p className="mt-3 text-base lg:text-lg text-muted-foreground">{copy.subtitle}</p>
              <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground mt-3">
                <span>{copy.authors}</span>
                <span>&middot;</span>
                <time dateTime={paper.publishedDate}>
                  {formatWhitepaperDate(paper.publishedDate, locale)}
                </time>
                <span>&middot;</span>
                <span>{t.pages(paper.pageCount)}</span>
                <span>&middot;</span>
                {paper.tags.map((tag) => (
                  <span key={tag} className="rounded-full bg-muted px-3 py-0.5 text-xs">
                    {tag}
                  </span>
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-3 mt-6">
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
            </header>

            <figure className="mt-8 flex flex-col gap-2">
              <img
                src={paper.heroImagePath}
                alt={copy.heroAlt}
                width={2400}
                height={1698}
                loading="eager"
                fetchPriority="high"
                className="w-full rounded-lg border border-border/50 bg-card"
              />
              <figcaption className="text-xs text-muted-foreground">{copy.heroCaption}</figcaption>
            </figure>

            <dl
              className="mt-8 grid gap-3 sm:grid-cols-2 xl:grid-cols-4"
              data-testid="whitepaper-kpis"
            >
              {copy.kpis.map((kpi) => (
                <div
                  key={kpi.label}
                  className="flex flex-col gap-1 rounded-lg border border-border/50 bg-card/60 p-4"
                >
                  <dt className="text-xs font-medium text-muted-foreground">{kpi.label}</dt>
                  <dd className="text-2xl font-bold tracking-tight text-foreground tabular-nums">
                    {kpi.value}
                  </dd>
                  <dd className="text-xs text-muted-foreground">{kpi.caption}</dd>
                </div>
              ))}
            </dl>

            <div className="mt-10 flex flex-col gap-10">
              <section className="flex flex-col gap-3" aria-labelledby="whitepaper-summary">
                <SectionHeading id="whitepaper-summary">{t.summary}</SectionHeading>
                <p className="text-base leading-relaxed text-foreground/90">{copy.abstract}</p>
              </section>

              <section className="flex flex-col gap-3" aria-labelledby="whitepaper-key-findings">
                <SectionHeading id="whitepaper-key-findings">{t.keyFindings}</SectionHeading>
                <ol className="flex flex-col gap-4">
                  {copy.keyFindings.map((finding, index) => (
                    <li key={finding} className="flex gap-4">
                      <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/15 font-mono text-xs font-semibold text-primary tabular-nums">
                        {index + 1}
                      </span>
                      <p className="text-base leading-relaxed text-foreground/90">{finding}</p>
                    </li>
                  ))}
                </ol>
              </section>

              <section className="flex flex-col gap-3" aria-labelledby="whitepaper-method">
                <SectionHeading id="whitepaper-method">{t.method}</SectionHeading>
                <ol className="flex flex-col gap-2 list-decimal pl-6 marker:text-muted-foreground">
                  {copy.methodSteps.map((step) => (
                    <li key={step} className="text-sm leading-relaxed text-foreground/90">
                      {step}
                    </li>
                  ))}
                </ol>
              </section>

              <section className="flex flex-col gap-3" aria-labelledby="whitepaper-assumptions">
                <SectionHeading id="whitepaper-assumptions">{t.assumptions}</SectionHeading>
                <div className="overflow-x-auto rounded-lg border border-border/50">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
                      <tr>
                        <th scope="col" className="px-4 py-2 font-medium">
                          {t.assumptionItem}
                        </th>
                        <th scope="col" className="px-4 py-2 font-medium">
                          {t.assumptionValue}
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/40">
                      {copy.assumptions.map((row) => (
                        <tr key={row.item}>
                          <th
                            scope="row"
                            className="whitespace-nowrap px-4 py-2 text-left font-medium text-foreground align-top"
                          >
                            {row.item}
                          </th>
                          <td className="px-4 py-2 text-foreground/90">{row.value}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>

              <section className="flex flex-col gap-3" aria-labelledby="whitepaper-sources">
                <SectionHeading id="whitepaper-sources">{t.sources}</SectionHeading>
                <ul className="flex flex-col gap-2 list-disc pl-6 marker:text-muted-foreground">
                  {copy.sources.map((source) => (
                    <li key={source.href} className="text-sm">
                      <WhitepaperSourceLink href={source.href} slug={paper.slug}>
                        {source.label}
                      </WhitepaperSourceLink>
                      <span className="ml-2 break-all text-xs text-muted-foreground">
                        {source.href}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>

              <section
                className="flex flex-col items-start gap-3 rounded-xl border border-brand/30 bg-brand/5 p-6"
                aria-labelledby="whitepaper-closing"
              >
                <Heading as="h2" level="section" id="whitepaper-closing">
                  {t.closingHeading}
                </Heading>
                <p className="text-sm text-muted-foreground">{t.closingBody}</p>
                <WhitepaperPdfButton
                  href={paper.pdfPath}
                  slug={paper.slug}
                  label={t.downloadPdf}
                  placement="closing"
                />
              </section>
            </div>
          </Card>
        </section>
      </div>
    </main>
  );
}
