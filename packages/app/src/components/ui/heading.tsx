import { cva, type VariantProps } from 'class-variance-authority';
import * as React from 'react';

import { cn } from '@/lib/shared/utils';

const headingVariants = cva('text-foreground', {
  variants: {
    level: {
      display: 'text-4xl font-bold tracking-heading text-balance md:text-5xl',
      page: 'text-2xl lg:text-4xl font-bold tracking-tight',
      section: 'text-xl font-semibold',
      card: 'text-base font-semibold',
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
