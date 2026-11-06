import { ArrowLeft, ArrowRight } from 'lucide-react';
import Image from 'next/image';

import { buttonVariants } from '@/components/ui/button';
import { ExternalLinkIcon } from '@/components/ui/external-link-icon';
import {
  TELEMETRY_FIGURES,
  type TelemetryGuide,
  type TelemetrySection,
} from '@/lib/agentx/agentx-telemetry';
import { getTelemetryGuide } from '@/lib/agentx/agentx-telemetry-zh';
import type { Locale } from '@/lib/i18n/i18n';
import { cn } from '@/lib/shared/utils';

import { AgentXTelemetryLink } from './agentx-telemetry-link';
import { FactGrid } from './fact-grid';

function localePrefix(locale: Locale): string {
  return locale === 'zh' ? '/zh' : '';
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
        className="overflow-hidden rounded-xl border border-border/30 bg-card transition-colors group-hover:border-border"
        data-testid={`agentx-telemetry-figure-${figure.key}`}
      >
        <Image
          src={asset.src}
          alt={figure.alt}
          width={asset.width}
          height={asset.height}
          sizes="(max-width: 768px) 100vw, 832px"
          quality={100}
          className="h-auto w-full"
        />
        <figcaption className="border-t border-border/20 px-4 py-3 text-sm leading-6 text-muted-foreground">
          <span className="block">{figure.caption}</span>
          <span className="mt-1 inline-block font-medium text-foreground underline decoration-border underline-offset-4 transition-colors group-hover:text-brand group-hover:decoration-brand">
            {ui.figureCta}
            <ExternalLinkIcon aria-hidden="true" />
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
      <h2 id={section.id} className="mb-4 scroll-mt-24 text-2xl font-semibold text-foreground">
        {section.heading}
      </h2>
      <div className="max-w-measure space-y-4 text-base leading-reading text-muted-foreground">
        {section.paragraphs.map((paragraph) => (
          <p key={paragraph}>{paragraph}</p>
        ))}
      </div>
      {section.bullets && section.bullets.length > 0 && (
        <ul className="mt-4 max-w-measure space-y-2 border-l border-border/20 pl-4 text-base leading-reading text-muted-foreground">
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
                className={cn(
                  buttonVariants({ variant: 'outline', size: 'sm' }),
                  'font-normal text-muted-foreground hover:text-foreground',
                )}
              >
                {link.label}
                <ExternalLinkIcon aria-hidden="true" className="ml-0" />
              </AgentXTelemetryLink>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function AgentXTelemetryArticle({ locale }: { locale: Locale }) {
  const guide = getTelemetryGuide(locale);
  const prefix = localePrefix(locale);

  return (
    <article data-testid="agentx-telemetry-article">
      <header className="border-b border-border/20 pb-8">
        <AgentXTelemetryLink
          href={`${prefix}/agentx`}
          analyticsEvent="agentx_telemetry_returned"
          analyticsTarget="agentx"
          className="inline-flex min-h-8 items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft aria-hidden="true" className="size-4" />
          {guide.ui.backToAgentX}
        </AgentXTelemetryLink>
        <p className="mt-8 text-xs font-medium text-muted-foreground">{guide.eyebrow}</p>
        <h1 className="mt-3 text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
          {guide.title}
        </h1>
        <p className="mt-5 max-w-measure text-lg leading-8 text-muted-foreground">{guide.lead}</p>
        <FactGrid items={guide.highlights} />
        <AgentXTelemetryLink
          href={`${prefix}/inference?i_seq=agentic-traces`}
          analyticsEvent="agentx_telemetry_results_opened"
          analyticsTarget="telemetry-header"
          data-testid="agentx-telemetry-results-cta"
          className={cn(buttonVariants({ variant: 'brand' }), 'mt-6')}
        >
          {guide.ui.openResults}
          <ArrowRight aria-hidden="true" />
        </AgentXTelemetryLink>
      </header>

      <div className="py-10">
        <div className="max-w-measure space-y-4 text-base leading-reading text-muted-foreground">
          {guide.intro.map((paragraph) => (
            <p key={paragraph}>{paragraph}</p>
          ))}
        </div>

        <nav aria-label={guide.ui.onThisPage} className="mt-10">
          <p className="text-xs font-medium text-muted-foreground">{guide.ui.onThisPage}</p>
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
            className={index === 0 ? 'mt-12' : 'mt-14 border-t border-border/20 pt-10'}
          />
        ))}
      </div>
    </article>
  );
}
