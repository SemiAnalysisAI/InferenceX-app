'use client';

import { Card } from '@/components/ui/card';

import { QUOTES } from './quotes-data';

function QuoteCard({
  text,
  name,
  title,
  link,
}: {
  text: string;
  name: string;
  title: string;
  link?: string;
}) {
  const content = (
    <Card className="p-6 lg:p-8">
      <blockquote className="space-y-4">
        <p className="text-base lg:text-lg leading-relaxed text-foreground/90 italic">
          &ldquo;{text}&rdquo;
        </p>
        <footer className="text-sm text-muted-foreground pl-6">
          <span className="font-semibold text-foreground not-italic">&ndash; {name}</span>
          <span className="block mt-0.5">{title}</span>
        </footer>
      </blockquote>
    </Card>
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
            <div className="flex flex-col gap-3 md:pl-6">
              {QUOTES.map((quote) => (
                <QuoteCard
                  key={quote.name}
                  text={quote.text}
                  name={quote.name}
                  title={quote.title}
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
