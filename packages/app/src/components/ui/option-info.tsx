'use client';

import { Info } from 'lucide-react';
import {
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEventHandler,
  type ReactNode,
} from 'react';

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
    if (next && !open) track('selector_option_help_opened', { value, label });
  };
  return (
    <TooltipProvider delayDuration={0}>
      <TooltipRoot open={open} onOpenChange={handleOpenChange}>
        <TooltipTrigger asChild>
          <button
            type="button"
            data-testid={`selected-option-help-${value}`}
            aria-label={locale === 'zh' ? `${label}说明` : `Help: ${label}`}
            onClick={(event) => {
              // Focus/hover may already have opened it before activation. Keep
              // it readable on click, tap, or Enter instead of toggling it shut.
              event.preventDefault();
              handleOpenChange(true);
            }}
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
  const [open, setOpen] = useState(false);
  const hoverOpenedRef = useRef(false);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  const cancelClose = () => clearTimeout(closeTimerRef.current);
  useEffect(() => () => clearTimeout(closeTimerRef.current), []);

  const closeAfterHover = () => {
    cancelClose();
    // Give the pointer time to cross the gap into the explanation and its links.
    if (hoverOpenedRef.current) {
      closeTimerRef.current = setTimeout(() => setOpen(false), 200);
    }
  };

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        cancelClose();
        if (next) {
          hoverOpenedRef.current = false;
          track('selector_option_help_opened', { value, label });
        }
        setOpen(next);
      }}
    >
      <PopoverTrigger asChild>
        <button
          ref={triggerRef}
          type="button"
          data-option-help
          data-testid={`option-help-${value}`}
          aria-label={locale === 'zh' ? `${label}说明` : `Help: ${label}`}
          onPointerEnter={(event) => {
            if (event.pointerType !== 'mouse') return;
            cancelClose();
            if (!open) {
              hoverOpenedRef.current = true;
              setOpen(true);
              track('selector_option_help_opened', { value, label });
            }
          }}
          onPointerLeave={closeAfterHover}
          onClick={(event) => {
            if (open && hoverOpenedRef.current) {
              // Clicking an already-hovered icon keeps its help open instead of
              // immediately toggling it shut. Touch/keyboard retain normal toggling.
              event.preventDefault();
              cancelClose();
              hoverOpenedRef.current = false;
              contentRef.current?.focus();
            }
          }}
          onKeyDown={onKeyDown}
          tabIndex={tabIndex}
          className="no-export inline-flex size-11 md:size-8 shrink-0 cursor-help items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-none"
        >
          <Info aria-hidden="true" className="size-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        ref={contentRef}
        side="bottom"
        align="end"
        collisionPadding={12}
        aria-labelledby={titleId}
        onPointerEnter={cancelClose}
        onPointerLeave={closeAfterHover}
        onPointerDownCapture={() => {
          cancelClose();
          hoverOpenedRef.current = false;
        }}
        onInteractOutside={(event) => {
          // Activating the hovered trigger is part of this popover, not an
          // outside interaction; Escape should still return focus to it.
          if (triggerRef.current?.contains(event.target as Node)) event.preventDefault();
        }}
        onOpenAutoFocus={(event) => {
          // Looking up an option must not steal focus from the dropdown's search.
          if (hoverOpenedRef.current) event.preventDefault();
        }}
        onCloseAutoFocus={(event) => {
          if (hoverOpenedRef.current) event.preventDefault();
        }}
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
