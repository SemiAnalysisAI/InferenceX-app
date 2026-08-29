import Image from 'next/image';

import {
  OPTIMIZATION_FIGURES,
  prLabel,
  prUrl,
  type OptimizationFramework,
  type OptimizationHighlight,
  type OptimizationSection,
  type OptimizationsOverview,
} from '@/lib/agentx-optimizations';
import { getLocalizedFrameworks, getOptimizationsOverview } from '@/lib/agentx-optimizations-zh';
import type { Locale } from '@/lib/i18n';

import { AgentXOptimizationsLink } from './agentx-optimizations-link';

function localePrefix(locale: Locale): string {
  return locale === 'zh' ? '/zh' : '';
}

function Highlights({ items }: { items: readonly OptimizationHighlight[] }) {
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
      className="group my-7 block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
    >
      <figure
        className="overflow-hidden rounded-xl border border-border/70 bg-card transition-colors group-hover:border-primary/50"
        data-testid={`agentx-optimizations-figure-${figure.key}`}
      >
        <Image
          src={asset.src}
          alt={figure.alt}
          width={asset.width}
          height={asset.height}
          sizes="(max-width: 768px) 100vw, 1152px"
          quality={100}
          className="h-auto w-full bg-white"
        />
        <figcaption className="border-t border-border/70 px-4 py-3 text-sm leading-6 text-muted-foreground">
          <span className="block">{figure.caption}</span>
          <span className="mt-1 inline-block font-medium text-foreground underline decoration-border underline-offset-4 transition-colors group-hover:text-primary group-hover:decoration-primary">
            {ui.figureCta} ↗
          </span>
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
      {section.figure && <SectionFigure figure={section.figure} ui={ui} />}
      {section.prs && section.prs.length > 0 && (
        <div className="mt-5">
          <p className="font-mono text-xs font-semibold tracking-eyebrow text-brand uppercase">
            {ui.prsLabel}
          </p>
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
                  className="inline-flex items-center rounded-md border border-border bg-card px-2.5 py-1 font-mono text-xs text-muted-foreground transition-colors hover:border-primary/50 hover:text-primary"
                >
                  {prLabel(pr)} ↗
                </AgentXOptimizationsLink>
              </li>
            ))}
          </ul>
        </div>
      )}
      {section.links && section.links.length > 0 && (
        <div className="mt-5">
          <p className="font-mono text-xs font-semibold tracking-eyebrow text-brand uppercase">
            {ui.referencesLabel}
          </p>
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
                  className="text-sm leading-6 text-primary underline decoration-primary/40 underline-offset-4 hover:decoration-primary"
                >
                  {link.label} ↗
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
      className="group flex flex-col rounded-xl border border-border/70 bg-card p-5 transition-colors hover:border-primary/50"
    >
      <p className="font-mono text-2xs font-medium tracking-eyebrow text-brand uppercase">
        {overview.layerLabels[framework.layer]}
      </p>
      <h3 className="mt-2 text-lg font-semibold text-foreground">{framework.name}</h3>
      <p className="mt-2 flex-1 text-sm leading-6 text-muted-foreground">{framework.summary}</p>
      <span className="mt-4 inline-flex items-center text-sm font-semibold text-primary">
        {overview.ui.readMore} →
      </span>
    </AgentXOptimizationsLink>
  );
}

/** The /agentx/optimizations index: why the work happened, plus every project. */
export function AgentXOptimizationsIndex({ locale }: { locale: Locale }) {
  const overview = getOptimizationsOverview(locale);
  const frameworks = getLocalizedFrameworks(locale);
  const [ecosystem, ...rest] = overview.sections;

  return (
    <article data-testid="agentx-optimizations-index">
      <header className="border-b border-border/70 pb-8">
        <AgentXOptimizationsLink
          href={`${localePrefix(locale)}/agentx`}
          analyticsEvent="agentx_optimizations_returned"
          analyticsTarget="overview"
          className="text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          {overview.ui.backToAgentX}
        </AgentXOptimizationsLink>
        <p className="mt-8 font-mono text-xs font-semibold tracking-eyebrow-wide text-brand uppercase">
          {overview.eyebrow}
        </p>
        <h1 className="mt-3 text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
          {overview.title}
        </h1>
        <p className="mt-5 max-w-3xl text-lg leading-8 text-muted-foreground">{overview.lead}</p>
        <Highlights items={overview.highlights} />
      </header>

      <div className="py-10">
        <div className="space-y-4 text-base leading-7 text-muted-foreground">
          {overview.intro.map((paragraph) => (
            <p key={paragraph}>{paragraph}</p>
          ))}
        </div>

        <section aria-labelledby="projects" className="mt-14">
          <h2
            id="projects"
            className="mb-3 scroll-mt-24 text-2xl font-semibold tracking-tight text-foreground"
          >
            {overview.frameworksTitle}
          </h2>
          <p className="max-w-3xl text-base leading-7 text-muted-foreground">
            {overview.frameworksIntro}
          </p>
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
            className="mt-14 border-t border-border/70 pt-10"
          />
        ))}
      </div>
    </article>
  );
}

/** One project's page: /agentx/optimizations/<slug>. */
export function AgentXOptimizationsArticle({ slug, locale }: { slug: string; locale: Locale }) {
  const overview = getOptimizationsOverview(locale);
  const frameworks = getLocalizedFrameworks(locale);
  const framework = frameworks.find((entry) => entry.slug === slug);
  if (!framework) return null;
  const others = frameworks.filter((entry) => entry.slug !== slug);

  return (
    <article data-testid="agentx-optimizations-article" data-framework={framework.slug}>
      <header className="border-b border-border/70 pb-8">
        <AgentXOptimizationsLink
          href={`${localePrefix(locale)}/agentx/optimizations`}
          analyticsEvent="agentx_optimizations_returned"
          analyticsTarget="index"
          className="text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          {overview.ui.backToOverview}
        </AgentXOptimizationsLink>
        <p className="mt-8 font-mono text-xs font-semibold tracking-eyebrow-wide text-brand uppercase">
          {overview.eyebrow} · {overview.layerLabels[framework.layer]}
        </p>
        <h1 className="mt-3 text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
          {framework.name}
        </h1>
        <p className="mt-5 max-w-3xl text-lg leading-8 text-muted-foreground">{framework.lead}</p>
        <Highlights items={framework.highlights} />
      </header>

      <div className="py-10">
        <nav aria-label={overview.ui.onThisPage} className="mb-10">
          <p className="font-mono text-xs font-semibold tracking-eyebrow text-brand uppercase">
            {overview.ui.onThisPage}
          </p>
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

        <section aria-labelledby="other-projects" className="mt-14 border-t border-border/70 pt-10">
          <h2 id="other-projects" className="text-base font-semibold text-foreground">
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
