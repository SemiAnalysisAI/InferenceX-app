'use client';

import { ArrowLeft, ArrowRight, Download } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';

import { Button } from '@/components/ui/button';
import { track } from '@/lib/analytics/analytics';
import { cn } from '@/lib/shared/utils';

interface WhitepaperPdfButtonProps {
  href: string;
  slug: string;
  label: string;
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
        className="inline-flex min-h-8 items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        onClick={() => track('whitepaper_back_clicked')}
      >
        <ArrowLeft aria-hidden="true" className="size-4" />
        {label}
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
  thumbnail?: ReactNode;
  children: ReactNode;
  className?: string;
}

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
        'group relative flex min-w-0 flex-col gap-5 rounded-xl border border-border/30 bg-card p-5 transition-colors hover:border-border sm:flex-row md:gap-8 md:p-6',
        className,
      )}
    >
      {thumbnail}
      <div className="min-w-0 flex-1">
        <Link
          href={href}
          className="focus-visible:outline-none before:absolute before:inset-0 before:rounded-xl before:content-['']"
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
