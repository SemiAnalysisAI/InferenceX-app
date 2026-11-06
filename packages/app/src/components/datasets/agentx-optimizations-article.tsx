import { ArrowLeft, ArrowRight } from 'lucide-react';
import Image from 'next/image';

import {
  OPTIMIZATION_FIGURES,
  prLabel,
  prUrl,
  type OptimizationFramework,
  type OptimizationSection,
  type OptimizationsOverview,
} from '@/lib/agentx/agentx-optimizations';
import {
  getLocalizedFrameworks,
  getOptimizationsOverview,
} from '@/lib/agentx/agentx-optimizations-zh';
import type { Locale } from '@/lib/i18n/i18n';

import { ExternalLinkIcon } from '@/components/ui/external-link-icon';

import { AgentXOptimizationsLink } from './agentx-optimizations-link';
import { FactGrid } from './fact-grid';
import { ARTICLE_H2_CLASS, READING_LINK_CLASS } from '@/components/ui/reading-layout';
import { cn } from '@/lib/shared/utils';

function localePrefix(locale: Locale): string {
  return locale === 'zh' ? '/zh' : '';
}

function RichText({ text }: { text: string }) {
  return text.split(/\*\*(?<bold>.+?)\*\*/u).map((part, index) =>
    index % 2 === 1 ? (
      <strong key={index} className="font-semibold text-foreground">
        {part}
      </strong>
    ) : (
      part
    ),
  );
}

function SectionFigure({
  figure,
  ui,
}: {
  figure: NonNullable<OptimizationSection['figure']>;
  ui: OptimizationsOverview['ui'];
}) {
  const asset = OPTIMIZATION_FIGURES[figure.key];
  return (
    <AgentXOptimizationsLink
      href={asset.src}
      analyticsEvent="agentx_optimizations_figure_opened"
      analyticsTarget={figure.key}
      target="_blank"
      rel="noopener noreferrer"
      prefetch={false}
      className="group my-7 block rounded-xl focus-visible:outline-none"
    >
      <figure
        className="overflow-hidden rounded-xl border border-border/30 bg-card transition-colors group-hover:border-border"
        data-testid={`agentx-optimizations-figure-${figure.key}`}
      >
        <Image
          src={asset.src}
          alt={figure.alt}
          width={asset.width}
          height={asset.height}
          sizes="(max-width: 768px) 100vw, 720px"
          quality={100}
          className="h-auto w-full bg-white"
        />
        <figcaption className="border-t border-border/20 px-4 py-3 text-sm leading-6 text-muted-foreground">
          <span className="block">{figure.caption}</span>
          {!figure.hideFullResolutionCta && (
            <span className="mt-1 inline-block font-medium text-foreground underline decoration-border underline-offset-4 transition-colors group-hover:text-brand group-hover:decoration-brand">
              {ui.figureCta}
              <ExternalLinkIcon aria-hidden="true" />
            </span>
          )}
        </figcaption>
      </figure>
    </AgentXOptimizationsLink>
  );
}

function SectionBlock({
  section,
  ui,
  className,
}: {
  section: OptimizationSection;
  ui: OptimizationsOverview['ui'];
  className?: string;
}) {
  return (
    <section
      aria-labelledby={section.id}
      className={className}
      data-testid={`agentx-optimizations-section-${section.id}`}
    >
      <h2 id={section.id} className={cn(ARTICLE_H2_CLASS, 'mb-4')}>
        {section.heading}
      </h2>
      <div className="space-y-4 text-base leading-reading text-foreground">
        {section.paragraphs.map((paragraph) => (
          <p key={paragraph}>
            <RichText text={paragraph} />
          </p>
        ))}
      </div>
      {section.figure && <SectionFigure figure={section.figure} ui={ui} />}
      {section.prs && section.prs.length > 0 && (
        <div className="mt-5">
          <p className="text-xs font-medium text-muted-foreground">{ui.prsLabel}</p>
          <ul className="mt-2 flex flex-wrap gap-2">
            {section.prs.map((pr) => (
              <li key={prUrl(pr)}>
                <AgentXOptimizationsLink
                  href={prUrl(pr)}
                  analyticsEvent="agentx_optimizations_pr_opened"
                  analyticsTarget={`${pr.repo}#${pr.number}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  prefetch={false}
                  data-testid="agentx-optimizations-pr"
                  className="inline-flex min-h-8 items-center gap-1 rounded-md border border-border/30 bg-card px-2.5 font-mono text-xs leading-none text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  {prLabel(pr)}
                  <ExternalLinkIcon aria-hidden="true" className="ml-0" />
                </AgentXOptimizationsLink>
              </li>
            ))}
          </ul>
        </div>
      )}
      {section.links && section.links.length > 0 && (
        <div className="mt-5">
          <p className="text-xs font-medium text-muted-foreground">{ui.referencesLabel}</p>
          <ul className="mt-2 grid gap-x-8 gap-y-2 sm:grid-cols-2">
            {section.links.map((link) => (
              <li key={link.href}>
                <AgentXOptimizationsLink
                  href={link.href}
                  analyticsEvent="agentx_optimizations_reference_opened"
                  analyticsTarget={link.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  prefetch={false}
                  className={cn(READING_LINK_CLASS, 'text-sm leading-6')}
                >
                  {link.label}
                  <ExternalLinkIcon aria-hidden="true" />
                </AgentXOptimizationsLink>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

function FrameworkCard({
  framework,
  overview,
  locale,
}: {
  framework: OptimizationFramework;
  overview: OptimizationsOverview;
  locale: Locale;
}) {
  return (
    <AgentXOptimizationsLink
      href={`${localePrefix(locale)}/agentx/optimizations/${framework.slug}`}
      analyticsEvent="agentx_optimizations_framework_opened"
      analyticsTarget={framework.slug}
      data-testid="agentx-optimizations-card"
      data-framework={framework.slug}
      className="group flex flex-col rounded-xl border border-border/30 bg-card p-5 transition-colors hover:bg-muted/40"
    >
      <p className="text-xs font-medium text-muted-foreground">
        {overview.layerLabels[framework.layer]}
      </p>
      <h3 className="mt-2 text-lg font-semibold text-foreground">{framework.name}</h3>
      <p className="mt-2 flex-1 text-sm leading-6 text-muted-foreground">{framework.summary}</p>
      <span className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-brand">
        {overview.ui.readMore}
        <ArrowRight aria-hidden="true" className="size-4" />
      </span>
    </AgentXOptimizationsLink>
  );
}

export function AgentXOptimizationsIndex({ locale }: { locale: Locale }) {
  const overview = getOptimizationsOverview(locale);
  const frameworks = getLocalizedFrameworks(locale);
  const [ecosystem, ...rest] = overview.sections;

  return (
    <article data-testid="agentx-optimizations-index">
      <header className="border-b border-border/20 pb-8">
        <AgentXOptimizationsLink
          href={`${localePrefix(locale)}/agentx`}
          analyticsEvent="agentx_optimizations_returned"
          analyticsTarget="overview"
          className="inline-flex min-h-8 items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft aria-hidden="true" className="size-4" />
          {overview.ui.backToAgentX}
        </AgentXOptimizationsLink>
        <p className="mt-8 text-xs font-medium text-muted-foreground">{overview.eyebrow}</p>
        <h1 className="mt-3 text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
          {overview.title}
        </h1>
        <p className="mt-5 text-lg leading-8 text-muted-foreground">{overview.lead}</p>
        <FactGrid items={overview.highlights} />
      </header>

      <div className="py-10">
        <div className="space-y-4 text-base leading-reading text-foreground">
          {overview.intro.map((paragraph) => (
            <p key={paragraph}>{paragraph}</p>
          ))}
        </div>

        <section aria-labelledby="projects" className="mt-14">
          <h2 id="projects" className={cn(ARTICLE_H2_CLASS, 'mb-4')}>
            {overview.frameworksTitle}
          </h2>
          <p className="text-base leading-reading text-foreground">{overview.frameworksIntro}</p>
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {frameworks.map((framework) => (
              <FrameworkCard
                key={framework.slug}
                framework={framework}
                overview={overview}
                locale={locale}
              />
            ))}
          </div>
        </section>

        {ecosystem && <SectionBlock section={ecosystem} ui={overview.ui} className="mt-14" />}
        {rest.map((section) => (
          <SectionBlock
            key={section.id}
            section={section}
            ui={overview.ui}
            className="mt-14 border-t border-border/20 pt-10"
          />
        ))}
      </div>
    </article>
  );
}

export function AgentXOptimizationsArticle({ slug, locale }: { slug: string; locale: Locale }) {
  const overview = getOptimizationsOverview(locale);
  const frameworks = getLocalizedFrameworks(locale);
  const framework = frameworks.find((entry) => entry.slug === slug);
  if (!framework) return null;
  const others = frameworks.filter((entry) => entry.slug !== slug);

  return (
    <article data-testid="agentx-optimizations-article" data-framework={framework.slug}>
      <header className="border-b border-border/20 pb-8">
        <AgentXOptimizationsLink
          href={`${localePrefix(locale)}/agentx/optimizations`}
          analyticsEvent="agentx_optimizations_returned"
          analyticsTarget="index"
          className="inline-flex min-h-8 items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft aria-hidden="true" className="size-4" />
          {overview.ui.backToOverview}
        </AgentXOptimizationsLink>
        <p className="mt-8 text-xs font-medium text-muted-foreground">
          {overview.eyebrow} · {overview.layerLabels[framework.layer]}
        </p>
        <h1 className="mt-3 text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
          {framework.name}
        </h1>
        <p className="mt-5 text-lg leading-8 text-muted-foreground">{framework.lead}</p>
        <FactGrid items={framework.highlights} />
      </header>

      <div className="py-10">
        <nav aria-label={overview.ui.onThisPage} className="mb-10">
          <p className="text-xs font-medium text-muted-foreground">{overview.ui.onThisPage}</p>
          <ul className="mt-2 grid gap-x-8 gap-y-1 sm:grid-cols-2">
            {framework.sections.map((section) => (
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

        {framework.sections.map((section, index) => (
          <SectionBlock
            key={section.id}
            section={section}
            ui={overview.ui}
            className={index === 0 ? undefined : 'mt-14'}
          />
        ))}

        <section aria-labelledby="other-projects" className="mt-14 border-t border-border/20 pt-10">
          <h2 id="other-projects" className={ARTICLE_H2_CLASS}>
            {overview.ui.allProjects}
          </h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {others.map((entry) => (
              <FrameworkCard
                key={entry.slug}
                framework={entry}
                overview={overview}
                locale={locale}
              />
            ))}
          </div>
        </section>
      </div>
    </article>
  );
}
