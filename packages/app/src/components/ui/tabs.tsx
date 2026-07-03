'use client';

import * as TabsPrimitive from '@radix-ui/react-tabs';
import * as React from 'react';

import { cn } from '@/lib/utils';

function Tabs({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Root>) {
  return (
    <TabsPrimitive.Root
      data-slot="tabs"
      className={cn('flex flex-col gap-2', className)}
      {...props}
    />
  );
}

function TabsList({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.List>) {
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      className={cn('inline-flex flex-wrap items-end gap-1 border-b border-border', className)}
      {...props}
    />
  );
}

function TabsTrigger({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      data-slot="tabs-trigger"
      className={cn(
        'relative',
        '-mb-px',
        'inline-flex',
        'items-center',
        'justify-center',
        'gap-1.5',
        'rounded-t-md',
        'border-b-2',
        'border-transparent',
        'px-4',
        'py-2',
        'text-sm',
        'font-semibold',
        'whitespace-nowrap',
        'text-muted-foreground',
        'hover:text-foreground',
        'hover:bg-muted/40',
        'data-[state=active]:text-foreground',
        'data-[state=active]:bg-muted/60',
        'data-[state=active]:border-secondary',
        'dark:data-[state=active]:border-primary',
        'transition-colors duration-150',
        'focus-visible:outline-none',
        'focus-visible:ring-[3px]',
        'focus-visible:ring-ring',
        'disabled:pointer-events-none',
        'disabled:opacity-50',
        '[&_svg]:pointer-events-none',
        '[&_svg]:shrink-0',
        "[&_svg:not([class*='size-'])]:size-4",
        className,
      )}
      {...props}
    />
  );
}

function TabsContent({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Content>) {
  return (
    <TabsPrimitive.Content
      data-slot="tabs-content"
      className={cn('flex-1 outline-none pb-4', className)}
      {...props}
    />
  );
}

export { Tabs, TabsContent, TabsList, TabsTrigger };
