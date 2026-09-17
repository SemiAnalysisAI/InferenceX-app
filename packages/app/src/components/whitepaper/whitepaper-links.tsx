'use client';

import { ArrowRight, Download } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';

import { Button } from '@/components/ui/button';
import { track } from '@/lib/analytics';
import { cn } from '@/lib/utils';

/**
 * Tracked interactive elements for the whitepaper pages. All events use the
 * `whitepaper_` prefix per the analytics convention in AGENTS.md.
 */

interface WhitepaperPdfButtonProps {
  href: string;
  slug: string;
  label: string;
  /** Where on the page the button sits, so hero vs. closing clicks separate. */
  placement: 'hero' | 'closing' | 'card' | 'sidebar';
  size?: 'default' | 'lg' | 'sm';
  variant?: 'default' | 'outline';
  className?: string;
}

export function WhitepaperPdfButton({
  href,
  slug,
  label,
  placement,
  size = 'lg',
  variant = 'default',
  className,
}: WhitepaperPdfButtonProps) {
  return (
    <Button asChild size={size} variant={variant} className={className}>
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        data-testid={`whitepaper-pdf-${placement}`}
        onClick={() => track('whitepaper_pdf_download_clicked', { slug, placement })}
      >
        <Download aria-hidden="true" />
        {label}
      </a>
    </Button>
  );
}

interface WhitepaperEstimatorLinkProps {
  href: string;
  slug: string;
  label: string;
  className?: string;
}

/** Secondary call to action into the live profit estimator per gigawatt tab. */
export function WhitepaperEstimatorLink({
  href,
  slug,
  label,
  className,
}: WhitepaperEstimatorLinkProps) {
  return (
    <Button asChild size="lg" variant="outline" className={className}>
      <Link
        href={href}
        data-testid="whitepaper-estimator-link"
        onClick={() => track('whitepaper_estimator_clicked', { slug })}
      >
        {label}
        <ArrowRight aria-hidden="true" />
      </Link>
    </Button>
  );
}

export function WhitepaperBackLink({ href, label }: { href: string; label: string }) {
  return (
    <nav>
      <Link
        href={href}
        className="text-sm text-muted-foreground hover:underline mb-4 inline-block"
        onClick={() => track('whitepaper_back_clicked')}
      >
        &larr;&nbsp;&nbsp;{label}
      </Link>
    </nav>
  );
}

export function WhitepaperSourceLink({
  href,
  slug,
  children,
}: {
  href: string;
  slug: string;
  children: ReactNode;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="font-medium text-brand hover:underline break-words"
      onClick={() => track('whitepaper_source_clicked', { slug, href })}
    >
      {children}
    </a>
  );
}

interface WhitepaperCardProps {
  slug: string;
  href: string;
  title: string;
  /** Cover thumbnail rendered in the left column. */
  thumbnail?: ReactNode;
  children: ReactNode;
  className?: string;
}

/** Index card. The whole card links to the landing page; the PDF button inside stops propagation. */
export function WhitepaperCard({
  slug,
  href,
  title,
  thumbnail,
  children,
  className,
}: WhitepaperCardProps) {
  return (
    <article
      data-testid="whitepaper-card"
      className={cn(
        'group relative flex min-w-0 flex-col gap-5 rounded-2xl border border-border/50 bg-card/60 p-5 backdrop-blur-[2px] transition-[border-color,box-shadow,transform] duration-200 hover:-translate-y-0.5 hover:border-primary/60 hover:shadow-lg hover:shadow-primary/5 sm:flex-row md:gap-7 md:p-7',
        className,
      )}
    >
      {thumbnail}
      <div className="min-w-0 flex-1">
        <Link
          href={href}
          className="focus-visible:outline-none before:absolute before:inset-0 before:rounded-2xl before:content-['']"
          onClick={() => track('whitepaper_card_clicked', { slug, title })}
        >
          <span className="sr-only">{title}</span>
        </Link>
        {children}
      </div>
    </article>
  );
}

export function WhitepaperReadLink({
  href,
  slug,
  label,
}: {
  href: string;
  slug: string;
  label: string;
}) {
  return (
    <Link
      href={href}
      className="relative inline-flex min-h-11 items-center gap-1 text-sm font-medium text-brand hover:underline md:min-h-8"
      onClick={() => track('whitepaper_read_clicked', { slug })}
    >
      {label}
      <ArrowRight aria-hidden="true" className="size-4" />
    </Link>
  );
}
