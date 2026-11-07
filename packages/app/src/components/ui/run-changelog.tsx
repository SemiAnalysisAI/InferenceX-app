'use client';

import { ChevronDownIcon } from 'lucide-react';
import type { ReactNode } from 'react';

import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useLocale } from '@/lib/i18n/use-locale';
import { cn } from '@/lib/shared/utils';

export function RunChangelog({
  children,
  className,
  testId,
}: {
  children: ReactNode;
  className?: string;
  testId?: string;
}) {
  const locale = useLocale();
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" className={cn('w-fit', className)} data-testid={testId}>
          <span className="font-medium">{locale === 'zh' ? '变更日志' : 'Changelog'}</span>
          <ChevronDownIcon />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        collisionPadding={12}
        className="max-h-[min(32rem,calc(100dvh-1.5rem))] w-[min(400px,calc(100vw-1.5rem))] overflow-y-auto"
      >
        {children}
      </PopoverContent>
    </Popover>
  );
}
