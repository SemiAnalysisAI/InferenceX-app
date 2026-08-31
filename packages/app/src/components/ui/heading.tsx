import { cva, type VariantProps } from 'class-variance-authority';
import * as React from 'react';

import { cn } from '@/lib/utils';

/**
 * Visual heading levels, derived from the recipes already in use across the
 * app. The rendered tag is chosen independently via `as`, so document outline
 * and visual size never fight each other. New pages should reach for this
 * instead of retyping a size/weight/tracking combo; existing headings migrate
 * as their files get touched. See docs/typography.md.
 */
const headingVariants = cva('text-foreground', {
  variants: {
    level: {
      /** Landing/marketing hero. */
      display: 'text-4xl font-bold tracking-heading text-balance md:text-5xl',
      /** Route-level page title. */
      page: 'text-2xl lg:text-4xl font-bold tracking-tight',
      /** Section head within a page. */
      section: 'text-xl font-semibold',
      /** Card or panel head. */
      card: 'text-base font-semibold',
      /** Dense sub-head above tables or control groups. */
      label: 'text-sm font-medium',
    },
  },
  defaultVariants: {
    level: 'section',
  },
});

type HeadingTag = 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6';

function Heading({
  className,
  level,
  as: Tag = 'h2',
  ...props
}: React.ComponentProps<'h2'> &
  VariantProps<typeof headingVariants> & {
    as?: HeadingTag;
  }) {
  return (
    <Tag data-slot="heading" className={cn(headingVariants({ level, className }))} {...props} />
  );
}

export { Heading, headingVariants };
