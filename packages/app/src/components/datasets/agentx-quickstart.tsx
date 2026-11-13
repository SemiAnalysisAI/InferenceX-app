import { ArrowLeft, ArrowRight } from 'lucide-react';
import Link from 'next/link';

import { buttonVariants } from '@/components/ui/button';
import { CopyableCodeBlock } from '@/components/ui/copyable-code-block';
import {
  ARTICLE_H2_CLASS,
  ARTICLE_H3_CLASS,
  READING_SECTION_CLASS,
  READING_TEXT_CLASS,
} from '@/components/ui/reading-layout';
import { AGENTX_COMMANDS, AGENTX_QUICKSTART, AGENTX_ROUTING } from '@/lib/agentx/quickstart';
import { localePath, type Locale } from '@/lib/i18n/i18n';
import { cn } from '@/lib/shared/utils';

import { AgentXMethodologyLink } from './agentx-methodology-link';
import { AGENTX_ROUTE } from '@/lib/routing/dashboard-routes';

export function AgentXQuickstartCallout({ locale, wide }: { locale: Locale; wide?: boolean }) {
  const t = AGENTX_QUICKSTART[locale];
  return (
    <section
      id="benchmark-your-chips"
      aria-labelledby="benchmark-your-chips-title"
      data-testid="agentx-quickstart-callout"
      className="min-w-0 scroll-mt-24 space-y-4"
    >
      <h2 id="benchmark-your-chips-title" className={ARTICLE_H3_CLASS}>
        {t.title}
      </h2>
      <p className={READING_TEXT_CLASS}>{t.summary}</p>
      <CopyableCodeBlock locale={locale} label={t.run} className={wide ? 'max-w-none' : undefined}>
        {AGENTX_COMMANDS}
      </CopyableCodeBlock>
      <AgentXMethodologyLink
        href={localePath(`${AGENTX_ROUTE.path}/quickstart`, locale)}
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
          href={localePath(AGENTX_ROUTE.path, locale)}
          className="inline-flex min-h-8 items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft aria-hidden="true" className="size-4" />
          {t.back}
        </Link>
        <p className="mt-6 font-mono text-xs text-muted-foreground">agentx-harness · 1.0.14</p>
        <h1 className="mt-2 text-3xl font-semibold text-balance md:text-4xl">{t.title}</h1>
        <p className="mt-4 leading-reading text-muted-foreground">{t.description}</p>
      </header>
      <div className="space-y-10 py-10">
        <section id="run" className="scroll-mt-24 space-y-3">
          <h2 className={ARTICLE_H2_CLASS}>{t.run}</h2>
          <p className={READING_TEXT_CLASS}>{t.runHelp}</p>
          <CopyableCodeBlock locale={locale} label={t.run}>
            {AGENTX_COMMANDS}
          </CopyableCodeBlock>
          <p className={READING_TEXT_CLASS}>
            {t.modelNote} {t.trust}
          </p>
        </section>
        <section id="routing" className="scroll-mt-24 space-y-3">
          <h2 className={ARTICLE_H2_CLASS}>{t.routing}</h2>
          <p className={READING_TEXT_CLASS}>{t.routingHelp}</p>
          <CopyableCodeBlock locale={locale} label={t.routing}>
            {AGENTX_ROUTING}
          </CopyableCodeBlock>
        </section>
        <footer className={cn(READING_SECTION_CLASS, 'space-y-3')}>
          <p className={READING_TEXT_CLASS}>{t.resultsHelp}</p>
          <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
            <Link
              href={localePath(`${AGENTX_ROUTE.path}/methodology`, locale)}
              className="inline-flex items-center gap-1 font-medium text-brand hover:underline"
            >
              {t.methodology}
              <ArrowRight aria-hidden="true" className="size-4" />
            </Link>
            <Link
              href="https://github.com/SemiAnalysisAI/agentx-harness/tree/agentx-v1.0.14"
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
