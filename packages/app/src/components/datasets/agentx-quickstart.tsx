import { ArrowLeft, ArrowRight } from 'lucide-react';
import Link from 'next/link';

import { buttonVariants } from '@/components/ui/button';
import { CopyableCodeBlock } from '@/components/ui/copyable-code-block';
import { AGENTX_COMMANDS, AGENTX_QUICKSTART, AGENTX_ROUTING } from '@/lib/agentx/quickstart';
import { localePath, type Locale } from '@/lib/i18n/i18n';

import { AgentXMethodologyLink } from './agentx-methodology-link';

export function AgentXQuickstartCallout({ locale }: { locale: Locale }) {
  const t = AGENTX_QUICKSTART[locale];
  return (
    <section
      id="benchmark-your-chips"
      aria-labelledby="benchmark-your-chips-title"
      data-testid="agentx-quickstart-callout"
      className="min-w-0 scroll-mt-24 space-y-4"
    >
      <h2 id="benchmark-your-chips-title" className="text-lg font-semibold">
        {t.title}
      </h2>
      <p className="text-sm leading-6 text-muted-foreground">{t.summary}</p>
      <CopyableCodeBlock locale={locale} label={t.run}>
        {AGENTX_COMMANDS}
      </CopyableCodeBlock>
      <AgentXMethodologyLink
        href={localePath('/agentx/quickstart', locale)}
        analyticsEvent="agentx_quickstart_opened"
        analyticsTarget="quickstart-callout"
        className={buttonVariants({ variant: 'outline' })}
      >
        {t.guide}
        <ArrowRight aria-hidden="true" />
      </AgentXMethodologyLink>
    </section>
  );
}

export function AgentXQuickstartArticle({ locale }: { locale: Locale }) {
  const t = AGENTX_QUICKSTART[locale];
  return (
    <article data-testid="agentx-quickstart-article" className="min-w-0">
      <header className="border-b border-border/20 pb-6">
        <Link
          href={localePath('/agentx', locale)}
          className="inline-flex min-h-8 items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft aria-hidden="true" className="size-4" />
          {t.back}
        </Link>
        <p className="mt-6 font-mono text-xs text-muted-foreground">agentx-harness · 1.0.7</p>
        <h1 className="mt-2 text-3xl font-semibold text-balance md:text-4xl">{t.title}</h1>
        <p className="mt-4 max-w-measure leading-reading text-muted-foreground">{t.description}</p>
      </header>
      <div className="space-y-8 py-8">
        <section id="run" className="scroll-mt-24 space-y-3">
          <h2 className="text-lg font-semibold">{t.run}</h2>
          <p className="max-w-measure leading-reading text-muted-foreground">{t.runHelp}</p>
          <CopyableCodeBlock locale={locale} label={t.run}>
            {AGENTX_COMMANDS}
          </CopyableCodeBlock>
          <p className="max-w-measure leading-reading text-muted-foreground">
            {t.modelNote} {t.trust}
          </p>
        </section>
        <section id="routing" className="scroll-mt-24 space-y-3">
          <h2 className="text-lg font-semibold">{t.routing}</h2>
          <p className="max-w-measure leading-reading text-muted-foreground">{t.routingHelp}</p>
          <CopyableCodeBlock locale={locale} label={t.routing}>
            {AGENTX_ROUTING}
          </CopyableCodeBlock>
        </section>
        <footer className="space-y-3 border-t border-border/20 pt-6">
          <p className="max-w-measure leading-reading text-muted-foreground">{t.resultsHelp}</p>
          <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
            <Link
              href={localePath('/agentx/methodology', locale)}
              className="inline-flex items-center gap-1 font-medium text-brand hover:underline"
            >
              {t.methodology}
              <ArrowRight aria-hidden="true" className="size-4" />
            </Link>
            <Link
              href="https://github.com/SemiAnalysisAI/agentx-harness/tree/agentx-v1.0.7"
              className="inline-flex items-center gap-1 font-medium text-brand hover:underline"
            >
              {t.repository}
              <ArrowRight aria-hidden="true" className="size-4" />
            </Link>
          </div>
        </footer>
      </div>
    </article>
  );
}
