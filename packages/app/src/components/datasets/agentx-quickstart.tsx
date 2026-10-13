import Link from 'next/link';

import { CopyableCodeBlock } from '@/components/ui/copyable-code-block';
import {
  AGENTX_INSTALL,
  AGENTX_PROFILE,
  AGENTX_QUICKSTART,
  AGENTX_ROUTING,
} from '@/lib/agentx/quickstart';
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
      <CopyableCodeBlock locale={locale} label={t.install}>
        {AGENTX_INSTALL}
      </CopyableCodeBlock>
      <CopyableCodeBlock locale={locale} label={t.run}>
        {AGENTX_PROFILE}
      </CopyableCodeBlock>
      <AgentXMethodologyLink
        href={localePath('/agentx/quickstart', locale)}
        analyticsEvent="agentx_quickstart_opened"
        analyticsTarget="quickstart-callout"
        className="inline-flex min-h-11 items-center rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
      >
        {t.guide} →
      </AgentXMethodologyLink>
    </section>
  );
}

export function AgentXQuickstartArticle({ locale }: { locale: Locale }) {
  const t = AGENTX_QUICKSTART[locale];
  const sections = [
    { id: 'install', title: t.install, text: t.requirements, code: AGENTX_INSTALL },
    {
      id: 'configure',
      title: t.configure,
      text: t.configureHelp,
      code: 'export HUGGINGFACE_MODEL_NAME="org/model"\nexport CONC_SESSIONS=16',
    },
    { id: 'run', title: t.run, text: t.runHelp, code: AGENTX_PROFILE },
    { id: 'routing', title: t.routing, text: t.routingHelp, code: AGENTX_ROUTING },
  ];
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
        <details className="rounded-lg border border-border p-4">
          <summary className="cursor-pointer text-sm font-semibold">{t.setup}</summary>
          <p className="my-3 text-sm leading-6 text-muted-foreground">{t.setupNote}</p>
          <CopyableCodeBlock locale={locale} label={t.setup}>
            {'python3.11 -m venv .venv\nsource .venv/bin/activate'}
          </CopyableCodeBlock>
        </details>
        {sections.map((section) => (
          <section key={section.id} id={section.id} className="scroll-mt-24 space-y-3">
            <h2 className="text-lg font-semibold">{section.title}</h2>
            <p className="text-sm leading-6 text-muted-foreground">{section.text}</p>
            <CopyableCodeBlock locale={locale} label={section.title}>
              {section.code}
            </CopyableCodeBlock>
            {section.id === 'run' && (
              <p className="text-sm leading-6 text-muted-foreground">{t.trust}</p>
            )}
          </section>
        ))}
        <section id="results" className="scroll-mt-24 space-y-3">
          <h2 className="text-lg font-semibold">{t.results}</h2>
          <p className="text-sm leading-6 text-muted-foreground">{t.resultsHelp}</p>
          <p className="text-sm leading-6 text-muted-foreground">{t.compare}</p>
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
        </section>
      </div>
    </article>
  );
}
