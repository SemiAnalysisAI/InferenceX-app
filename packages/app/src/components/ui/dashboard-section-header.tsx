import type { ReactNode } from 'react';

import { Badge } from '@/components/ui/badge';
import { Heading } from '@/components/ui/heading';
import { cn } from '@/lib/shared/utils';

type HeadingTag = 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6';

type DashboardSectionHeaderProps = (
  | { title: string; qualifier?: string }
  | { title: ReactNode; qualifier?: undefined }
) & {
  description?: ReactNode;
  actions?: ReactNode;
  headingAs?: HeadingTag;
  level?: 'title' | 'card';
  className?: string;
  descriptionClassName?: string;
};

export function DashboardSectionHeader({
  title,
  qualifier,
  description,
  actions,
  headingAs = 'h2',
  level = 'title',
  className,
  descriptionClassName,
}: DashboardSectionHeaderProps) {
  return (
    <div
      className={cn(
        'flex flex-wrap items-center justify-between gap-x-3 gap-y-1 sm:grid sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start',
        className,
      )}
    >
      <Heading as={headingAs} level={level} className="min-w-0 flex-1 basis-40 sm:col-start-1">
        {typeof title === 'string' && qualifier !== undefined ? (
          <>
            {title.slice(0, title.lastIndexOf(' ') + 1)}
            <span className="whitespace-nowrap">
              {title.slice(title.lastIndexOf(' ') + 1)}
              <Badge variant="secondary" className="ml-2 align-baseline">
                {qualifier}
              </Badge>
            </span>
          </>
        ) : (
          title
        )}
      </Heading>
      {actions !== undefined && (
        <div
          className={cn(
            'flex min-w-0 flex-wrap gap-2 sm:col-start-2 sm:row-start-1',
            description !== undefined && 'sm:row-span-2',
          )}
        >
          {actions}
        </div>
      )}
      {description !== undefined && (
        <p
          className={cn(
            'basis-full text-sm text-muted-foreground sm:col-start-1',
            descriptionClassName,
          )}
        >
          {description}
        </p>
      )}
    </div>
  );
}
