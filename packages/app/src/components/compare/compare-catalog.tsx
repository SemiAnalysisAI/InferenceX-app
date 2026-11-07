import { ArrowRight } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';

import { Card } from '@/components/ui/card';
import { Heading } from '@/components/ui/heading';

/** Cross-link between the compare catalogs (throughput, per dollar, precision, spec decode). */
export function CompareCatalogLink({
  href,
  testId,
  children,
}: {
  href: string;
  testId?: string;
  children: ReactNode;
}) {
  return (
    <Link
      data-testid={testId}
      href={href}
      className="inline-flex min-h-11 w-full items-center justify-between gap-2 rounded-md border border-border px-4 py-2 text-left text-sm font-medium text-foreground transition-colors hover:bg-muted sm:w-auto sm:justify-start md:min-h-10"
    >
      <span className="text-balance">{children}</span>
      <ArrowRight aria-hidden="true" className="size-4 shrink-0" />
    </Link>
  );
}

export function CompareCatalogLinks({
  testId,
  children,
}: {
  testId?: string;
  children: ReactNode;
}) {
  return (
    <div className="mt-6 flex flex-wrap gap-3" data-testid={testId}>
      {children}
    </div>
  );
}

/** One model's block in a compare catalog: title, pair count, then groups of pairs. */
export function CompareModelSection({
  id,
  title,
  summary,
  children,
}: {
  id: string;
  title: ReactNode;
  summary: ReactNode;
  children: ReactNode;
}) {
  return (
    <section id={id}>
      <Card className="flex flex-col gap-6">
        <div>
          <Heading level="section" className="flex items-center gap-2">
            {title}
          </Heading>
          <p className="mt-1 text-sm text-muted-foreground">{summary}</p>
        </div>
        {children}
      </Card>
    </section>
  );
}

/** A group inside a model section; pairs render as borderless rows in a grid. */
export function ComparePairGroup({
  heading,
  description,
  children,
}: {
  heading: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div>
        <h3 className="text-sm font-medium text-foreground">{heading}</h3>
        <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
      </div>
      <ComparePairGrid>{children}</ComparePairGrid>
    </div>
  );
}

/** Borderless pair rows; the negative margin lets row hover fills align text with headings. */
export function ComparePairGrid({ children }: { children: ReactNode }) {
  return (
    <div className="-mx-3 grid grid-cols-1 gap-x-4 gap-y-1 sm:grid-cols-2 lg:grid-cols-3">
      {children}
    </div>
  );
}
