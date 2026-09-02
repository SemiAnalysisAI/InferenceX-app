'use client';

import { Info } from 'lucide-react';
import { useId, useState, type KeyboardEventHandler, type ReactNode } from 'react';

import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { TooltipProvider, TooltipRoot, TooltipTrigger, TooltipContent } from './tooltip';
import { track } from '@/lib/analytics';
import { useLocale } from '@/lib/use-locale';

/** Closed-field help sits beside the value, independently of the select button. */
export function SelectedOptionInfo({
  label,
  value,
  children,
}: {
  label: string;
  value: string;
  children: ReactNode;
}) {
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (next) track('selector_option_help_opened', { value, label });
  };
  return (
    <TooltipProvider delayDuration={0}>
      <TooltipRoot open={open} onOpenChange={handleOpenChange}>
        <TooltipTrigger asChild>
          <button
            type="button"
            data-testid={`selected-option-help-${value}`}
            aria-label={locale === 'zh' ? `${label}说明` : `Help: ${label}`}
            onClick={() => handleOpenChange(!open)}
            className="no-export pointer-events-auto inline-flex h-full w-7 shrink-0 cursor-help items-center justify-center rounded-md text-muted-foreground hover:text-foreground focus-visible:outline-none"
          >
            <Info aria-hidden="true" className="size-3.5" />
          </button>
        </TooltipTrigger>
        <TooltipContent
          side="top"
          collisionPadding={12}
          data-testid={`selected-option-help-content-${value}`}
          className="z-[130] w-96 max-w-[calc(100vw-1.5rem)] max-h-[min(28rem,var(--radix-tooltip-content-available-height))] overflow-y-auto space-y-3 p-3 text-sm leading-relaxed"
        >
          <p className="font-medium">{label}</p>
          <div className="space-y-3 text-muted-foreground">{children}</div>
        </TooltipContent>
      </TooltipRoot>
    </TooltipProvider>
  );
}

/** A separate action beside an option, never nested inside its selection button. */
export function OptionInfo({
  label,
  value,
  children,
  onKeyDown,
  tabIndex,
}: {
  label: string;
  value: string;
  children: ReactNode;
  onKeyDown?: KeyboardEventHandler<HTMLButtonElement>;
  tabIndex?: number;
}) {
  const locale = useLocale();
  const titleId = useId();
  return (
    <Popover
      onOpenChange={(open) => {
        if (open) track('selector_option_help_opened', { value, label });
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          data-option-help
          data-testid={`option-help-${value}`}
          aria-label={locale === 'zh' ? `${label}说明` : `Help: ${label}`}
          onKeyDown={onKeyDown}
          tabIndex={tabIndex}
          className="no-export inline-flex size-11 md:size-8 shrink-0 cursor-help items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-none"
        >
          <Info aria-hidden="true" className="size-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        side="bottom"
        align="end"
        collisionPadding={12}
        aria-labelledby={titleId}
        data-testid={`option-help-content-${value}`}
        className="z-[130] w-96 max-w-[calc(100vw-1.5rem)] max-h-[min(28rem,var(--radix-popover-content-available-height))] overflow-y-auto space-y-3 text-sm leading-relaxed"
      >
        <p id={titleId} className="font-medium text-foreground">
          {label}
        </p>
        <div className="space-y-3 text-muted-foreground">{children}</div>
      </PopoverContent>
    </Popover>
  );
}
