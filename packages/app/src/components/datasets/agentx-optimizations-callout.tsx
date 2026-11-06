import { ArrowRight } from 'lucide-react';

import { badgeVariants } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import {
  getLocalizedFrameworks,
  getOptimizationsOverview,
} from '@/lib/agentx/agentx-optimizations-zh';
import type { Locale } from '@/lib/i18n/i18n';
import { cn } from '@/lib/shared/utils';

import { AgentXOptimizationsLink } from './agentx-optimizations-link';

export function AgentXOptimizationsCallout({ locale }: { locale: Locale }) {
  const overview = getOptimizationsOverview(locale);
  const frameworks = getLocalizedFrameworks(locale);
  const prefix = locale === 'zh' ? '/zh' : '';

  return (
    <section
      aria-labelledby="agentx-optimizations-title"
      data-testid="agentx-optimizations-callout"
    >
      <div>
        <p className="mb-2 text-xs font-medium text-muted-foreground">{overview.eyebrow}</p>
        <h2 id="agentx-optimizations-title" className="text-lg font-semibold text-foreground">
          {overview.title}
        </h2>
        <p className="mt-3 max-w-4xl text-sm leading-6 text-muted-foreground">{overview.lead}</p>

        <AgentXOptimizationsLink
          href={`${prefix}/agentx/optimizations`}
          analyticsEvent="agentx_optimizations_opened"
          analyticsTarget="agentx-callout"
          data-testid="agentx-optimizations-cta"
          className={cn(buttonVariants({ variant: 'outline' }), 'mt-4')}
        >
          {overview.ui.readMore}
          <ArrowRight aria-hidden="true" />
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
                className={cn(badgeVariants(), 'min-h-6 font-normal')}
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
