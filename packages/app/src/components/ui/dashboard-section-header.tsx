import type { ReactNode } from 'react';

import { Heading } from '@/components/ui/heading';
import { cn } from '@/lib/utils';

type HeadingTag = 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6';

interface DashboardSectionHeaderProps {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  headingAs?: HeadingTag;
  className?: string;
  descriptionClassName?: string;
}

/**
 * Shared title row for dashboard sections. Keeping the action in a shrinkable
 * sibling makes chart controls and share actions align consistently without
 * changing the section's heading semantics or copy.
 */
export function DashboardSectionHeader({
  title,
  description,
  actions,
  headingAs = 'h2',
  className,
  descriptionClassName,
}: DashboardSectionHeaderProps) {
  return (
    <div
      className={cn('flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between', className)}
    >
      <div className="min-w-0">
        <Heading as={headingAs} level="card" className="mb-1">
          {title}
        </Heading>
        {description !== undefined && (
          <p className={cn('text-sm text-muted-foreground', descriptionClassName)}>{description}</p>
        )}
      </div>
      {actions !== undefined && (
        <div className="flex min-w-0 flex-wrap gap-2 sm:shrink-0">{actions}</div>
      )}
    </div>
  );
}
