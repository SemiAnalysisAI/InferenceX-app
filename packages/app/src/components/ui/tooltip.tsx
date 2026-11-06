'use client';

import * as TooltipPrimitive from '@radix-ui/react-tooltip';
import * as React from 'react';

import { cn } from '@/lib/shared/utils';

const TooltipProvider = TooltipPrimitive.Provider;
const TooltipRoot = TooltipPrimitive.Root;
const TooltipTrigger = TooltipPrimitive.Trigger;

export const HELP_CONTENT_CLASS_NAME =
  'rounded-md border bg-popover p-3 text-sm font-normal not-italic leading-relaxed text-popover-foreground shadow-md';

const TooltipContent = React.forwardRef<
  React.ComponentRef<typeof TooltipPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Content>
>(({ className, sideOffset = 4, ...props }, ref) => (
  <TooltipPrimitive.Portal>
    <TooltipPrimitive.Content
      ref={ref}
      sideOffset={sideOffset}
      className={cn(
        'motion-surface origin-(--radix-tooltip-content-transform-origin) z-[130] max-w-[min(24rem,var(--radix-tooltip-content-available-width))] max-h-[var(--radix-tooltip-content-available-height)] overflow-y-auto',
        HELP_CONTENT_CLASS_NAME,
        className,
      )}
      {...props}
    />
  </TooltipPrimitive.Portal>
));
TooltipContent.displayName = TooltipPrimitive.Content.displayName;

export { TooltipRoot, TooltipTrigger, TooltipContent, TooltipProvider };
