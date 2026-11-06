import type { ReactNode } from 'react';

import { Heading } from '@/components/ui/heading';
import { cn } from '@/lib/shared/utils';

type HeadingTag = 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6';

interface DashboardSectionHeaderProps {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  headingAs?: HeadingTag;
  level?: 'title' | 'card';
  className?: string;
  descriptionClassName?: string;
}

export function DashboardSectionHeader({
  title,
  description,
  actions,
  headingAs = 'h2',
  level = 'title',
  className,
  descriptionClassName,
}: DashboardSectionHeaderProps) {
  return (
    <div className={cn('flex flex-wrap items-start justify-between gap-3', className)}>
      <div className="min-w-0 flex-1 basis-60">
        <Heading as={headingAs} level={level} className="mb-1">
          {title}
        </Heading>
        {description !== undefined && (
          <p className={cn('text-sm text-muted-foreground', descriptionClassName)}>{description}</p>
        )}
      </div>
      {actions !== undefined && <div className="flex min-w-0 flex-wrap gap-2">{actions}</div>}
    </div>
  );
}
