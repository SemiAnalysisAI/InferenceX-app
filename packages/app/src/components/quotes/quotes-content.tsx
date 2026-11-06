import { Fragment } from 'react';

import { ExternalLinkIcon } from '@/components/ui/external-link-icon';

import type { Locale } from '@/lib/i18n/i18n';

import { CompanyLogo } from './quote-utils';
import { QUOTES, orgAnchorId } from './quotes-data';
import { SUPPORTER_GROUPS } from './supporter-groups';
import { SupporterLogoWall } from './supporter-logo-wall';

const STRINGS = {
  en: {
    heading: <>InferenceX&trade; supporters</>,
    intro:
      'InferenceX™ initiative is supported by many major buyers of compute and prominent members of the ML community including those from MiniMax, Moonshot Kimi, Alibaba Qwen, OpenAI, Microsoft, vLLM, PyTorch Foundation, Oracle and more.',
  },
  zh: {
    heading: <>业界与社区对 InferenceX&trade; 的评价</>,
    intro:
      'InferenceX™ 获得了众多大型算力采购方和 ML 社区知名人士的认可。以下评价来自 MiniMax、Moonshot Kimi、Alibaba Qwen、OpenAI、Microsoft、vLLM、PyTorch Foundation 和 Oracle 等机构的相关人士。',
  },
} as const;

const firstQuoteIndexForOrg: Record<string, number> = {};
QUOTES.forEach((q, i) => {
  if (!(q.org in firstQuoteIndexForOrg)) firstQuoteIndexForOrg[q.org] = i;
});

function highlightBrand(text: string) {
  const parts = text.split(/(?<brand>InferenceMAX™?|InferenceX™?|InferenceMAX|InferenceX)/giu);
  return parts.map((part, i) =>
    /^inference(?:max|x)/iu.test(part) ? (
      <span key={i} className="font-medium text-foreground">
        {part}
      </span>
    ) : (
      part
    ),
  );
}

function QuoteCard({
  id,
  text,
  name,
  title,
  org,
  logo,
  link,
}: {
  id?: string;
  text: string;
  name: string;
  title: string;
  org: string;
  logo?: string;
  link?: string;
}) {
  const content = (
    <blockquote id={id} className="scroll-mt-24 space-y-5">
      <p className="text-base leading-relaxed text-foreground lg:text-lg">
        &ldquo;{highlightBrand(text)}&rdquo;
      </p>
      <footer className="flex min-w-0 items-center gap-3">
        <CompanyLogo org={org} logo={logo} />
        <div className="h-12 w-px shrink-0 bg-border" />
        <div className="min-w-0 text-sm">
          {link ? (
            <a
              href={link}
              target="_blank"
              rel="noopener noreferrer"
              className="group font-medium text-foreground transition-colors hover:text-brand"
            >
              <span className="group-hover:underline">{name}</span>
              <ExternalLinkIcon />
            </a>
          ) : (
            <span className="font-medium text-foreground">{name}</span>
          )}
          <span className="block text-xs text-muted-foreground">{title}</span>
        </div>
      </footer>
    </blockquote>
  );

  return content;
}

export function QuotesContent({ locale = 'en' }: { locale?: Locale } = {}) {
  const t = STRINGS[locale];
  return (
    <main className="relative">
      <div className="container mx-auto flex flex-col gap-10 px-4 pt-4 lg:px-8 lg:pt-8">
        <header className="max-w-4xl">
          <h1 className="text-3xl font-semibold text-balance md:text-4xl">{t.heading}</h1>
          <p className="mt-3 text-base leading-7 text-muted-foreground lg:text-lg">{t.intro}</p>
        </header>
        <div className="border-t border-border/30 pt-10">
          <SupporterLogoWall locale={locale} groups={SUPPORTER_GROUPS} />
        </div>
        <section className="border-t border-border/30 pt-10">
          <div className="flex max-w-4xl flex-col gap-8 md:gap-10">
            {QUOTES.map((quote, i) => (
              <Fragment key={`${quote.org}-${quote.name}`}>
                {i > 0 && <hr className="border-t border-border/30" aria-hidden="true" />}
                <QuoteCard
                  id={firstQuoteIndexForOrg[quote.org] === i ? orgAnchorId(quote.org) : undefined}
                  text={locale === 'zh' ? (quote.textZh ?? quote.text) : quote.text}
                  name={quote.name}
                  title={locale === 'zh' ? (quote.titleZh ?? quote.title) : quote.title}
                  org={quote.org}
                  logo={quote.logo}
                  link={quote.link}
                />
              </Fragment>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
