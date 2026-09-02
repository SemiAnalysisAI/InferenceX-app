'use client';

import { Info } from 'lucide-react';
import { useId, type KeyboardEventHandler, type ReactNode } from 'react';

import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { track } from '@/lib/analytics';
import { useLocale } from '@/lib/use-locale';

/** A separate action beside an option, never nested inside its selection button. */
export function OptionInfo({
  label,
  value,
  children,
  onKeyDown,
}: {
  label: string;
  value: string;
  children: ReactNode;
  onKeyDown?: KeyboardEventHandler<HTMLButtonElement>;
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
