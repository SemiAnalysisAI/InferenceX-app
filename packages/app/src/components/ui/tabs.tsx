'use client';

import * as TabsPrimitive from '@radix-ui/react-tabs';
import * as React from 'react';

import { cn } from '@/lib/shared/utils';

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

/** Tab look, keyed off `data-state="active"`; also used by link-based tab strips. */
export const tabsTriggerClassName = cn(
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
  'font-medium',
  'whitespace-nowrap',
  'text-muted-foreground',
  'hover:text-foreground',
  'data-[state=active]:text-foreground',
  'data-[state=active]:border-brand',
  'transition-colors duration-200',
  'focus-visible:outline-none',
  'disabled:pointer-events-none',
  'disabled:opacity-60',
  '[&_svg]:pointer-events-none',
  '[&_svg]:shrink-0',
  "[&_svg:not([class*='size-'])]:size-4",
);

function TabsTrigger({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      data-slot="tabs-trigger"
      className={cn(tabsTriggerClassName, className)}
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
