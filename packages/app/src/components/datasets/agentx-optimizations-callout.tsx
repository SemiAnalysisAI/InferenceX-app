import { getLocalizedFrameworks, getOptimizationsOverview } from '@/lib/agentx-optimizations-zh';
import type { Locale } from '@/lib/i18n';

import { AgentXOptimizationsLink } from './agentx-optimizations-link';

/**
 * Entry point from /agentx into the optimizations pages: the headline claim,
 * a button to the index, and one link per project so a reader who already
 * knows which engine they care about can go straight there. Rendered inside
 * the AgentX methodology card, so it is a section rather than its own card.
 */
export function AgentXOptimizationsCallout({ locale }: { locale: Locale }) {
  const overview = getOptimizationsOverview(locale);
  const frameworks = getLocalizedFrameworks(locale);
  const prefix = locale === 'zh' ? '/zh' : '';

  return (
    <section
      aria-labelledby="agentx-optimizations-title"
      data-testid="agentx-optimizations-callout"
      className="rounded-lg border border-primary/30 bg-primary/5"
    >
      <div className="px-4 py-4 sm:px-5 sm:py-5">
        <p className="mb-2 font-mono text-2xs font-medium tracking-eyebrow text-primary uppercase">
          {overview.eyebrow}
        </p>
        <h2 id="agentx-optimizations-title" className="text-lg font-semibold text-foreground">
          {overview.title}
        </h2>
        <p className="mt-3 max-w-4xl text-sm leading-6 text-muted-foreground">{overview.lead}</p>

        <AgentXOptimizationsLink
          href={`${prefix}/agentx/optimizations`}
          analyticsEvent="agentx_optimizations_opened"
          analyticsTarget="agentx-callout"
          data-testid="agentx-optimizations-cta"
          className="mt-4 inline-flex min-h-11 items-center rounded-md border border-primary/40 px-4 py-2 text-sm font-semibold text-primary transition-colors hover:bg-primary/10"
        >
          {overview.ui.readMore} →
        </AgentXOptimizationsLink>

        <ul className="mt-4 flex flex-wrap gap-2">
          {frameworks.map((framework) => (
            <li key={framework.slug}>
              <AgentXOptimizationsLink
                href={`${prefix}/agentx/optimizations/${framework.slug}`}
                analyticsEvent="agentx_optimizations_framework_opened"
                analyticsTarget={framework.slug}
                data-testid="agentx-optimizations-framework-link"
                data-framework={framework.slug}
                className="inline-flex min-h-11 items-center rounded-md border border-border bg-card px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:border-primary/50 hover:text-primary"
              >
                {framework.name}
              </AgentXOptimizationsLink>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
