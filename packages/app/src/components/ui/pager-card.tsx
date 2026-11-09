import { ArrowLeft, ArrowRight } from 'lucide-react';
import Link from 'next/link';

import { Eyebrow } from '@/components/ui/eyebrow';
import { headingVariants } from '@/components/ui/heading';
import { cn } from '@/lib/shared/utils';

export function PagerCard({
  href,
  direction,
  label,
  title,
  onClick,
  testId,
}: {
  href: string;
  direction: 'prev' | 'next';
  label: string;
  title: string;
  onClick?: () => void;
  testId?: string;
}) {
  const Icon = direction === 'prev' ? ArrowLeft : ArrowRight;
  return (
    <Link
      href={href}
      className={cn(
        'group flex min-w-0 flex-col gap-2 rounded-xl border border-border/30 bg-card p-5 transition-colors hover:border-border',
        direction === 'next' && 'items-end text-right',
      )}
      data-testid={testId}
      onClick={onClick}
    >
      <Eyebrow
        as="span"
        className={cn(
          'inline-flex items-center gap-1.5',
          direction === 'next' && 'flex-row-reverse',
        )}
      >
        <Icon
          aria-hidden="true"
          className={cn(
            'size-3.5 transition-transform duration-150',
            direction === 'prev' ? 'group-hover:-translate-x-0.5' : 'group-hover:translate-x-0.5',
          )}
        />
        {label}
      </Eyebrow>
      <span
        className={cn(
          headingVariants({ level: 'card' }),
          'line-clamp-2 text-balance leading-snug group-hover:text-brand',
        )}
      >
        {title}
      </span>
    </Link>
  );
}
