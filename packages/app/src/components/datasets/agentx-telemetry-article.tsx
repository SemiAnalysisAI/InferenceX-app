import Image from 'next/image';

import {
  TELEMETRY_FIGURES,
  type TelemetryGuide,
  type TelemetryHighlight,
  type TelemetrySection,
} from '@/lib/agentx-telemetry';
import { getTelemetryGuide } from '@/lib/agentx-telemetry-zh';
import type { Locale } from '@/lib/i18n';

import { AgentXTelemetryLink } from './agentx-telemetry-link';

function localePrefix(locale: Locale): string {
  return locale === 'zh' ? '/zh' : '';
}

function Highlights({ items }: { items: readonly TelemetryHighlight[] }) {
  return (
    <dl className="mt-8 grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border/70 bg-border/70 lg:grid-cols-4">
      {items.map((item) => (
        <div key={item.label} className="flex flex-col bg-card px-4 py-5">
          <dt className="order-2 mt-1 text-sm leading-5 text-muted-foreground">{item.label}</dt>
          <dd className="order-1 font-mono text-xl font-semibold tabular-nums text-foreground">
            {item.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function SectionFigure({
  figure,
  ui,
}: {
  figure: NonNullable<TelemetrySection['figure']>;
  ui: TelemetryGuide['ui'];
}) {
  const asset = TELEMETRY_FIGURES[figure.key];
  return (
    <AgentXTelemetryLink
      href={asset.src}
      analyticsEvent="agentx_telemetry_figure_opened"
      analyticsTarget={figure.key}
      target="_blank"
      rel="noopener noreferrer"
      prefetch={false}
      className="group my-7 block rounded-xl focus-visible:outline-none"
    >
      <figure
        className="overflow-hidden rounded-xl border border-border/70 bg-card transition-colors group-hover:border-primary/50"
        data-testid={`agentx-telemetry-figure-${figure.key}`}
      >
        <Image
          src={asset.src}
          alt={figure.alt}
          width={asset.width}
          height={asset.height}
          sizes="(max-width: 768px) 100vw, 1152px"
          quality={100}
          className="h-auto w-full"
        />
        <figcaption className="border-t border-border/70 px-4 py-3 text-sm leading-6 text-muted-foreground">
          <span className="block">{figure.caption}</span>
          <span className="mt-1 inline-block font-medium text-foreground underline decoration-border underline-offset-4 transition-colors group-hover:text-primary group-hover:decoration-primary">
            {ui.figureCta} ↗
          </span>
        </figcaption>
      </figure>
    </AgentXTelemetryLink>
  );
}

function SectionBlock({
  section,
  ui,
  className,
}: {
  section: TelemetrySection;
  ui: TelemetryGuide['ui'];
  className?: string;
}) {
  return (
    <section
      aria-labelledby={section.id}
      className={className}
      data-testid={`agentx-telemetry-section-${section.id}`}
    >
      <h2
        id={section.id}
        className="mb-4 scroll-mt-24 text-2xl font-semibold tracking-tight text-foreground"
      >
        {section.heading}
      </h2>
      <div className="space-y-4 text-base leading-7 text-muted-foreground">
        {section.paragraphs.map((paragraph) => (
          <p key={paragraph}>{paragraph}</p>
        ))}
      </div>
      {section.bullets && section.bullets.length > 0 && (
        <ul className="mt-5 space-y-2 border-l border-border pl-4 text-base leading-7 text-muted-foreground">
          {section.bullets.map((bullet) => (
            <li key={bullet}>{bullet}</li>
          ))}
        </ul>
      )}
      {section.figure && <SectionFigure figure={section.figure} ui={ui} />}
      {section.links && section.links.length > 0 && (
        <ul className="mt-5 flex flex-wrap gap-2">
          {section.links.map((link) => (
            <li key={link.href}>
              <AgentXTelemetryLink
                href={link.href}
                analyticsEvent="agentx_telemetry_opened"
                analyticsTarget={link.href}
                target="_blank"
                rel="noopener noreferrer"
                prefetch={false}
                className="inline-flex min-h-11 items-center rounded-md border border-border bg-card px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:border-primary/50 hover:text-primary"
              >
                {link.label}
              </AgentXTelemetryLink>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** The /agentx/telemetry tutorial. */
export function AgentXTelemetryArticle({ locale }: { locale: Locale }) {
  const guide = getTelemetryGuide(locale);
  const prefix = localePrefix(locale);

  return (
    <article data-testid="agentx-telemetry-article">
      <header className="border-b border-border/70 pb-8">
        <AgentXTelemetryLink
          href={`${prefix}/agentx`}
          analyticsEvent="agentx_telemetry_returned"
          analyticsTarget="agentx"
          className="text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          {guide.ui.backToAgentX}
        </AgentXTelemetryLink>
        <p className="mt-8 font-mono text-xs font-semibold tracking-eyebrow-wide text-brand uppercase">
          {guide.eyebrow}
        </p>
        <h1 className="mt-3 text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
          {guide.title}
        </h1>
        <p className="mt-5 max-w-3xl text-lg leading-8 text-muted-foreground">{guide.lead}</p>
        <Highlights items={guide.highlights} />
        <AgentXTelemetryLink
          href={`${prefix}/inference?i_seq=agentic-traces`}
          analyticsEvent="agentx_telemetry_results_opened"
          analyticsTarget="telemetry-header"
          data-testid="agentx-telemetry-results-cta"
          className="mt-6 inline-flex min-h-11 items-center rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
        >
          {guide.ui.openResults} →
        </AgentXTelemetryLink>
      </header>

      <div className="py-10">
        <div className="space-y-4 text-base leading-7 text-muted-foreground">
          {guide.intro.map((paragraph) => (
            <p key={paragraph}>{paragraph}</p>
          ))}
        </div>

        <nav aria-label={guide.ui.onThisPage} className="mt-10">
          <p className="font-mono text-xs font-semibold tracking-eyebrow text-brand uppercase">
            {guide.ui.onThisPage}
          </p>
          <ul className="mt-2 grid gap-x-8 gap-y-1 sm:grid-cols-2">
            {guide.sections.map((section) => (
              <li key={section.id}>
                <a
                  href={`#${section.id}`}
                  className="text-sm leading-6 text-muted-foreground underline decoration-border underline-offset-4 transition-colors hover:text-foreground"
                >
                  {section.heading}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        {guide.sections.map((section, index) => (
          <SectionBlock
            key={section.id}
            section={section}
            ui={guide.ui}
            className={index === 0 ? 'mt-12' : 'mt-14 border-t border-border/70 pt-10'}
          />
        ))}
      </div>
    </article>
  );
}
