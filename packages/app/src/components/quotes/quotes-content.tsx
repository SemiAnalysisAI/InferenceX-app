'use client';

import { Card } from '@/components/ui/card';

import { ExternalLinkIcon } from '@/components/ui/external-link-icon';

import { CompanyLogo, highlightBrand } from './quote-utils';
import { QUOTES, QUOTE_GROUPS, type Quote, type QuoteGroup } from './quotes-data';

/** Render `<em>...</em>` spans inside an otherwise plain string as real <em>. */
function renderEm(text: string) {
  if (!text.includes('<em>')) return text;
  return text.split(/(<em>.*?<\/em>)/gu).map((part, i) => {
    const m = part.match(/^<em>(.*?)<\/em>$/u);
    return m ? <em key={i}>{m[1]}</em> : part;
  });
}

/** Deduplicated logos from all quote orgs, ordered by first appearance. */
const orgLogos: { org: string; logo: string }[] = [];
const seenOrgs = new Set<string>();
for (const q of QUOTES) {
  if (q.logo && !seenOrgs.has(q.org)) {
    seenOrgs.add(q.org);
    orgLogos.push({ org: q.org, logo: q.logo });
  }
}

function QuoteCard({ text, name, title, org, logo, link }: Quote) {
  return (
    <blockquote className="space-y-4">
      <p className="text-base lg:text-lg leading-relaxed text-foreground">
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
          <span className="block text-muted-foreground text-xs">{renderEm(title)}</span>
        </div>
      </footer>
    </blockquote>
  );
}

export function QuotesContent() {
  // Group quotes by their group field, preserving in-array order within each group.
  const grouped = new Map<QuoteGroup, Quote[]>();
  for (const g of QUOTE_GROUPS) grouped.set(g, []);
  for (const q of QUOTES) grouped.get(q.group)?.push(q);

  return (
    <main className="relative">
      <div className="container mx-auto px-4 lg:px-8 flex flex-col gap-4">
        {/* Intro card */}
        <section className="flex flex-col gap-4">
          <Card>
            <h2 className="text-2xl lg:text-4xl font-bold tracking-tight">
              InferenceX Initiative Supporters
            </h2>
            <p className="mt-3 text-base lg:text-lg text-muted-foreground">
              InferenceX is supported by many major buyers of compute and prominent members of the
              ML community including those from OpenAI, Microsoft, vLLM, PyTorch Foundation, Oracle
              and more.
            </p>
            <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
              {orgLogos.map(({ org, logo }) => (
                <div key={org} className="flex items-center justify-center h-10 px-3" title={org}>
                  <img
                    src={`/logos/${logo}`}
                    alt={org}
                    width={96}
                    height={40}
                    className="h-8 max-w-24 object-contain grayscale opacity-70 dark:invert"
                  />
                </div>
              ))}
            </div>
          </Card>
        </section>

        {/* Grouped quote cards */}
        {QUOTE_GROUPS.map((group) => {
          const quotes = grouped.get(group) ?? [];
          if (quotes.length === 0) return null;
          return (
            <section key={group} className="flex flex-col gap-4">
              <Card>
                <h2 className="text-xl lg:text-2xl font-bold tracking-tight">{group}</h2>
                <div className="mt-6 pt-6 border-t border-border/40 flex flex-col gap-10 md:gap-12">
                  {quotes.map((q) => (
                    <QuoteCard key={q.name} {...q} />
                  ))}
                </div>
              </Card>
            </section>
          );
        })}
      </div>
    </main>
  );
}
