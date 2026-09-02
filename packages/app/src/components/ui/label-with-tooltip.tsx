'use client';

import { Info } from 'lucide-react';
import { useState, type ReactNode } from 'react';

import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { TooltipContent, TooltipRoot, TooltipTrigger } from '@/components/ui/tooltip';
import { track } from '@/lib/analytics';
import { useLocale } from '@/lib/use-locale';

const STRINGS = {
  en: { help: (label: string) => `Help: ${label}` },
  zh: { help: (label: string) => `${label}说明` },
} as const;

interface LabelWithTooltipProps {
  /**
   * Omit for controls that are not labelable elements — a segmented toggle is a
   * `role="tablist"`, so `for` would dangle and its `ariaLabel` is the accessible
   * name instead.
   */
  htmlFor?: string;
  label: string;
  tooltip: ReactNode;
}

export function LabelWithTooltip({ htmlFor, label, tooltip }: LabelWithTooltipProps) {
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  const helpLabel = STRINGS[locale].help(label);

  return (
    <div className="flex items-center gap-1">
      <Label htmlFor={htmlFor}>{label}</Label>
      <Popover
        open={open}
        onOpenChange={(nextOpen) => {
          setOpen(nextOpen);
          if (nextOpen) track('selector_help_opened', { label });
        }}
      >
        {/* Keep quick hover/focus help, with a persistent click/tap surface for
            touch users and descriptions containing links. Only one is open. */}
        <TooltipRoot open={open ? false : undefined}>
          <PopoverTrigger asChild>
            <TooltipTrigger asChild>
              <button
                type="button"
                aria-label={helpLabel}
                className="inline-flex size-6 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none"
              >
                <Info aria-hidden="true" className="size-3.5 cursor-help" />
              </button>
            </TooltipTrigger>
          </PopoverTrigger>
          <TooltipContent side="top" collisionPadding={10}>
            <span>{tooltip}</span>
          </TooltipContent>
        </TooltipRoot>
        <PopoverContent
          side="top"
          collisionPadding={12}
          aria-label={helpLabel}
          className="w-80 max-w-[calc(100vw-1.5rem)] space-y-2 text-sm leading-relaxed"
        >
          <p className="font-medium text-foreground">{label}</p>
          <div className="text-muted-foreground">{tooltip}</div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
