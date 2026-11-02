'use client';

import { Fragment } from 'react';

import { Card } from '@/components/ui/card';

import { ExternalLinkIcon } from '@/components/ui/external-link-icon';

import type { Locale } from '@/lib/i18n/i18n';

import { CompanyLogo, highlightBrand } from './quote-utils';
import { QUOTES, orgAnchorId } from './quotes-data';
import { SupporterLogoWall } from './supporter-logo-wall';

const STRINGS = {
  en: {
    heading: <>InferenceX&trade; Initiative Supporters</>,
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
    <blockquote
      id={id}
      className="scroll-mt-24 space-y-5 rounded-lg border-l-2 border-brand/40 pl-4 sm:pl-6"
    >
      <p className="text-base lg:text-lg leading-relaxed text-muted-foreground italic">
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
              className="font-semibold text-foreground hover:text-brand transition-colors group"
            >
              <span className="group-hover:underline">{name}</span>
              <ExternalLinkIcon />
            </a>
          ) : (
            <span className="font-semibold text-foreground">{name}</span>
          )}
          <span className="block text-muted-foreground text-xs">{title}</span>
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
      <div className="container mx-auto px-4 lg:px-8 flex flex-col gap-4">
        <section className="flex flex-col gap-4">
          <Card>
            <h1 className="text-2xl lg:text-4xl font-bold tracking-tight">{t.heading}</h1>
            <p className="mt-3 text-base lg:text-lg text-muted-foreground">{t.intro}</p>
            <div className="mt-6 pt-6 border-t border-border/40">
              <SupporterLogoWall locale={locale} />
            </div>
            <div className="mt-6 pt-6 border-t border-border/40">
              <div className="mx-auto flex max-w-4xl flex-col gap-8 md:gap-10">
                {QUOTES.map((quote, i) => (
                  <Fragment key={`${quote.org}-${quote.name}`}>
                    {i > 0 && <hr className="border-t border-border/40" aria-hidden="true" />}
                    <QuoteCard
                      id={
                        firstQuoteIndexForOrg[quote.org] === i ? orgAnchorId(quote.org) : undefined
                      }
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
            </div>
          </Card>
        </section>
      </div>
    </main>
  );
}
