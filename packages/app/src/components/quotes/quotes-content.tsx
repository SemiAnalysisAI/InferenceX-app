'use client';

import { Card } from '@/components/ui/card';

import { ExternalLinkIcon } from '@/components/ui/external-link-icon';

import { CompanyLogo, highlightBrand } from './quote-utils';
import { QUOTES } from './quotes-data';

/** Deduplicated logos from all quote orgs. */
const orgLogos: { org: string; logo: string }[] = [];
const seenOrgs = new Set<string>();
for (const q of QUOTES) {
  if (q.logo && !seenOrgs.has(q.org)) {
    seenOrgs.add(q.org);
    orgLogos.push({ org: q.org, logo: q.logo });
  }
}

function QuoteCard({
  text,
  name,
  title,
  org,
  logo,
  link,
}: {
  text: string;
  name: string;
  title: string;
  org: string;
  logo?: string;
  link?: string;
}) {
  const content = (
    <blockquote className="space-y-4">
      <p className="text-base lg:text-lg leading-relaxed text-muted-foreground italic">
        &ldquo;{highlightBrand(text)}&rdquo;
      </p>
      <footer className="flex items-center gap-3">
        <CompanyLogo org={org} logo={logo} />
        <div className="h-12 w-0.5 bg-brand" />
        <div className="text-sm">
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

export function QuotesContent() {
  return (
    <main className="relative">
      <div className="container mx-auto px-4 lg:px-8 flex flex-col gap-4">
        <section className="flex flex-col gap-4">
          <Card>
            <h2 className="text-2xl lg:text-4xl font-bold tracking-tight">
              InferenceX&trade; Initiative Supporters
            </h2>
            <p className="mt-3 text-base lg:text-lg text-muted-foreground">
              InferenceX&trade; initiative is supported by many major buyers of compute and
              prominent members of the ML community including those from OpenAI, Microsoft, vLLM,
              PyTorch Foundation, Oracle and more.
            </p>
            <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
              {orgLogos.map(({ org, logo }) => (
                <div key={org} className="flex items-center justify-center h-10 px-2" title={org}>
                  <img
                    src={`/logos/${logo}`}
                    alt={org}
                    width={80}
                    height={40}
                    className="h-8 max-w-20 object-contain grayscale opacity-70 dark:invert"
                  />
                </div>
              ))}
            </div>
            <div className="mt-6 pt-6 border-t border-border/40">
              <div className="flex flex-col gap-10 md:gap-12">
                {QUOTES.map((quote) => (
                  <QuoteCard
                    key={quote.name}
                    text={quote.text}
                    name={quote.name}
                    title={quote.title}
                    org={quote.org}
                    logo={quote.logo}
                    link={quote.link}
                  />
                ))}
              </div>
            </div>
          </Card>
        </section>
      </div>
    </main>
  );
}
