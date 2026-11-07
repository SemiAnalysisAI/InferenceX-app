import { cva, type VariantProps } from 'class-variance-authority';
import * as React from 'react';

import { cn } from '@/lib/shared/utils';

const headingVariants = cva('text-foreground', {
  variants: {
    level: {
      display: 'text-4xl font-semibold tracking-heading text-balance md:text-5xl',
      reading:
        'text-3xl leading-tight font-semibold text-balance sm:text-4xl sm:tracking-heading lg:text-5xl lg:leading-[1.08]',
      page: 'text-2xl font-semibold lg:text-4xl lg:tracking-heading',
      title: 'text-xl font-semibold md:text-2xl lg:text-title',
      section: 'text-xl font-medium',
      card: 'text-base font-semibold leading-snug',
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
  logo,
  children,
  ...props
}: React.ComponentProps<'h2'> &
  VariantProps<typeof headingVariants> & {
    as?: HeadingTag;
    logo?: React.ReactNode;
  }) {
  return (
    <Tag
      data-slot="heading"
      className={cn(headingVariants({ level, className }), logo && 'flex items-start gap-2')}
      {...props}
    >
      {logo ? (
        <>
          <span className="flex h-lh shrink-0 items-center empty:hidden">{logo}</span>
          <span className="min-w-0">{children}</span>
        </>
      ) : (
        children
      )}
    </Tag>
  );
}

function HeadingQualifier({ children }: { children: React.ReactNode }) {
  if (children === null || children === undefined || children === '') return null;
  const opensWithFullwidthBracket = typeof children === 'string' && /^[（【「]/u.test(children);
  return (
    <>
      {opensWithFullwidthBracket ? null : ' '}
      <span className="mt-0.5 block text-sm font-normal text-muted-foreground">{children}</span>
    </>
  );
}

export { Heading, HeadingQualifier, headingVariants };
