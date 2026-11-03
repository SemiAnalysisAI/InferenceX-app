import * as React from 'react';

import { cn } from '@/lib/shared/utils';

/** Small sentence-case label above a heading. Pass sentence-case text; nothing is uppercased. */
function eyebrowVariants({ className }: { className?: string } = {}) {
  return cn('text-xs font-medium text-muted-foreground', className);
}

function Eyebrow({
  className,
  as: Tag = 'span',
  ...props
}: React.HTMLAttributes<HTMLElement> & {
  as?: 'span' | 'p' | 'div';
}) {
  return <Tag data-slot="eyebrow" className={eyebrowVariants({ className })} {...props} />;
}

export { Eyebrow, eyebrowVariants };
