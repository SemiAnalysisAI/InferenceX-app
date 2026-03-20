'use client';

import { Card } from '@/components/ui/card';
import { useState } from 'react';

import { QUOTES } from './quotes-data';

function highlightBrand(text: string) {
  const parts = text.split(/(InferenceMAX™?|InferenceX™?|InferenceMAX|InferenceX)/gi);
  return parts.map((part, i) =>
    /^inference(max|x)/i.test(part) ? (
      <span key={i} className="text-secondary dark:text-primary font-semibold">
        {part}
      </span>
    ) : (
      part
    ),
  );
}

function CompanyLogo({ company, logo }: { company: string; logo?: string }) {
  const [failed, setFailed] = useState(false);

  if (!logo || failed) {
    return (
      <div className="h-12 shrink-0 rounded-full bg-muted flex items-center justify-center px-3">
        <span className="text-xs font-bold text-muted-foreground">{company[0]}</span>
      </div>
    );
  }

  return (
    <img
      src={`/logos/${logo}`}
      alt={company}
      className="h-10 min-w-10 max-w-20 shrink-0 object-contain grayscale opacity-70 dark:invert"
      onError={() => setFailed(true)}
    />
  );
}

function QuoteCard({
  text,
  name,
  title,
  company,
  logo,
  link,
}: {
  text: string;
  name: string;
  title: string;
  company: string;
  logo?: string;
  link?: string;
}) {
  const content = (
    <blockquote className="space-y-4">
      <p className="text-base lg:text-lg leading-relaxed text-muted-foreground italic">
        &ldquo;{highlightBrand(text)}&rdquo;
      </p>
      <footer className="flex items-center gap-3">
        <CompanyLogo company={company} logo={logo} />
        <div className="h-12 w-0.5 bg-secondary dark:bg-primary" />
        <div className="text-sm">
          <span className="font-semibold text-foreground">{name}</span>
          <span className="block text-muted-foreground text-xs">{title}</span>
        </div>
      </footer>
    </blockquote>
  );

  if (link) {
    return (
      <a
        href={link}
        target="_blank"
        rel="noopener noreferrer"
        className="block transition-opacity hover:opacity-80"
      >
        {content}
      </a>
    );
  }

  return content;
}

export function QuotesContent() {
  return (
    <main className="relative min-h-screen">
      <div className="container mx-auto px-4 lg:px-8 flex flex-col gap-16 lg:gap-4">
        <section>
          <Card>
            <h2 className="text-2xl lg:text-4xl font-bold tracking-tight">
              InferenceX&trade; Initiative Supporters
            </h2>
            <p className="mt-3 text-base lg:text-lg text-muted-foreground">
              InferenceX&trade; (formerly InferenceMAX) initiative is supported by many major buyers
              of compute and prominent members of the ML community including those from OpenAI,
              Microsoft, vLLM, PyTorch Foundation, Oracle and more.
            </p>
          </Card>
          <Card>
            <div className="flex flex-col gap-10 md:gap-12 mx-4 md:mx-8">
              {QUOTES.map((quote) => (
                <QuoteCard
                  key={quote.name}
                  text={quote.text}
                  name={quote.name}
                  title={quote.title}
                  company={quote.company}
                  logo={quote.logo}
                  link={quote.link}
                />
              ))}
            </div>
          </Card>
        </section>
      </div>
    </main>
  );
}
