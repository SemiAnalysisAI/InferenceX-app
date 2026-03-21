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
    <div className={cn('flex flex-col', className)}>
      <div className="w-full border-t-2 border-brand pb-6" />
      <TabsPrimitive.List
        data-slot="tabs-list"
        className="relative inline-flex p-1 gap-1 items-center justify-center bg-transparent"
        {...props}
      />
    </div>
  );
}

function TabsTrigger({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      data-slot="tabs-trigger"
      className={cn(
        'relative',
        'inline-flex',
        'h-10',
        'items-center',
        'justify-center',
        'gap-1.5',
        'px-4',
        'py-2.5',
        'text-base',
        'font-medium',
        'whitespace-nowrap',
        'text-foreground',
        'hover:text-foreground/80',
        'data-[state=active]:text-foreground',
        'data-[state=active]:border-b-2',
        'data-[state=active]:border-secondary',
        'dark:data-[state=active]:border-primary',
        'dark:hover:text-primary/80',
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
