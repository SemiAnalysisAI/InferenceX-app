import Link from 'next/link';

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
      className="min-w-0 scroll-mt-24 space-y-4 rounded-lg border border-border p-4 sm:p-5"
    >
      <h2 id="benchmark-your-chips-title" className="text-lg font-semibold">
        {t.title}
      </h2>
      <p className="max-w-prose text-sm leading-6 text-muted-foreground">{t.summary}</p>
      <CopyableCodeBlock locale={locale} label={t.run}>
        {AGENTX_COMMANDS}
      </CopyableCodeBlock>
      <AgentXMethodologyLink
        href={localePath('/agentx/quickstart', locale)}
        analyticsEvent="agentx_quickstart_opened"
        analyticsTarget="quickstart-callout"
        className="inline-flex min-h-11 items-center rounded-md border border-border px-4 py-2 text-sm font-semibold text-foreground hover:bg-muted"
      >
        {t.guide} →
      </AgentXMethodologyLink>
    </section>
  );
}

export function AgentXQuickstartArticle({ locale }: { locale: Locale }) {
  const t = AGENTX_QUICKSTART[locale];
  return (
    <article data-testid="agentx-quickstart-article" className="min-w-0">
      <header className="border-b border-border pb-6">
        <Link href={localePath('/agentx', locale)} className="text-sm text-brand hover:underline">
          ← {t.back}
        </Link>
        <p className="mt-6 font-mono text-xs text-muted-foreground">agentx-harness · 1.0.7</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">{t.title}</h1>
        <p className="mt-4 max-w-prose leading-7 text-muted-foreground">{t.description}</p>
      </header>
      <div className="space-y-8 py-8">
        <section id="run" className="scroll-mt-24 space-y-3">
          <h2 className="text-lg font-semibold">{t.run}</h2>
          <p className="text-sm leading-6 text-muted-foreground">{t.runHelp}</p>
          <CopyableCodeBlock locale={locale} label={t.run}>
            {AGENTX_COMMANDS}
          </CopyableCodeBlock>
          <p className="text-sm leading-6 text-muted-foreground">
            {t.modelNote} {t.trust}
          </p>
        </section>
        <section id="routing" className="scroll-mt-24 space-y-3">
          <h2 className="text-lg font-semibold">{t.routing}</h2>
          <p className="text-sm leading-6 text-muted-foreground">{t.routingHelp}</p>
          <CopyableCodeBlock locale={locale} label={t.routing}>
            {AGENTX_ROUTING}
          </CopyableCodeBlock>
        </section>
        <footer className="space-y-3 border-t border-border pt-6">
          <p className="text-sm leading-6 text-muted-foreground">{t.resultsHelp}</p>
          <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
            <Link
              href={localePath('/agentx/methodology', locale)}
              className="text-brand hover:underline"
            >
              {t.methodology} →
            </Link>
            <Link
              href="https://github.com/SemiAnalysisAI/agentx-harness/tree/agentx-v1.0.7"
              className="text-brand hover:underline"
            >
              {t.repository} →
            </Link>
          </div>
        </footer>
      </div>
    </article>
  );
}
