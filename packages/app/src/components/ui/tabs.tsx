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
      className={cn('inline-flex flex-wrap items-end gap-1', className)}
      {...props}
    />
  );
}

// Active/inactive recipe mirrors the top-of-page section nav
// (data-testid="chart-section-tabs" in src/components/tab-nav.tsx: tabLinkClass +
// currentTabClass) so the two tab rows read as the same flat underline-strip
// component: accent text + accent border-b-2 underline when active, muted text
// with no background fill when inactive, and a faint border highlight on hover.
function TabsTrigger({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      data-slot="tabs-trigger"
      className={cn(
        'relative',
        'inline-flex',
        'items-center',
        'justify-center',
        'gap-1.5',
        'border-b-2',
        'border-transparent',
        'px-4',
        'py-2',
        'text-sm',
        'font-semibold',
        'whitespace-nowrap',
        'text-muted-foreground',
        'hover:border-muted-foreground/30',
        'data-[state=active]:text-secondary',
        'dark:data-[state=active]:text-primary',
        'data-[state=active]:border-secondary',
        'dark:data-[state=active]:border-primary',
        'transition-colors duration-200',
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
