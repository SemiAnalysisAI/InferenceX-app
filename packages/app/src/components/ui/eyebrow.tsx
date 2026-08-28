import { cva, type VariantProps } from 'class-variance-authority';
import * as React from 'react';

import { cn } from '@/lib/utils';

/**
 * Uppercase mono eyebrow label — the small kicker above headings. Wraps the
 * single most repeated typography recipe in the app so its size, weight, and
 * letter-spacing stay uniform. See docs/typography.md.
 */
const eyebrowVariants = cva('font-mono text-xs font-semibold uppercase', {
  variants: {
    tone: {
      brand: 'text-brand',
      muted: 'text-muted-foreground',
    },
    wide: {
      true: 'tracking-eyebrow-wide',
      false: 'tracking-eyebrow',
    },
  },
  defaultVariants: {
    tone: 'brand',
    wide: false,
  },
});

function Eyebrow({
  className,
  tone,
  wide,
  as: Tag = 'span',
  ...props
}: React.HTMLAttributes<HTMLElement> &
  VariantProps<typeof eyebrowVariants> & {
    as?: 'span' | 'p' | 'div';
  }) {
  return (
    <Tag
      data-slot="eyebrow"
      className={cn(eyebrowVariants({ tone, wide, className }))}
      {...props}
    />
  );
}

export { Eyebrow, eyebrowVariants };
