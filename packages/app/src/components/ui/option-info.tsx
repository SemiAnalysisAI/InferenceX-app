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
import { HELP_CONTENT_CLASS_NAME } from './tooltip';
import { track } from '@/lib/analytics';
import { useLocale } from '@/lib/use-locale';
import { cn } from '@/lib/utils';

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
  return (
    <InfoHelp
      label={label}
      value={value}
      variant="selected"
      triggerTestId={`selected-option-help-${value}`}
      contentTestId={`selected-option-help-content-${value}`}
    >
      {children}
    </InfoHelp>
  );
}

/** A separate action beside an option, never nested inside its selection button. */
export function OptionInfo(props: Omit<InfoHelpProps, 'variant'>) {
  return <InfoHelp {...props} variant="option" />;
}

interface InfoHelpProps {
  label: string;
  value: string;
  children: ReactNode;
  onKeyDown?: KeyboardEventHandler<HTMLButtonElement>;
  tabIndex?: number;
  triggerClassName?: string;
  triggerTestId?: string;
  contentTestId?: string;
  ariaLabel?: string;
  align?: 'start' | 'center' | 'end';
  variant?: 'inline' | 'option' | 'selected';
  analyticsEvent?: 'selector_option_help_opened' | 'selector_help_opened';
}

/** One hover/click/keyboard help surface for labels, selected values and options. */
export function InfoHelp({
  label,
  value,
  children,
  onKeyDown,
  tabIndex,
  triggerClassName,
  triggerTestId,
  contentTestId,
  ariaLabel,
  align = 'end',
  variant = 'inline',
  analyticsEvent = 'selector_option_help_opened',
}: InfoHelpProps) {
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
          track(analyticsEvent, { value, label });
        }
        setOpen(next);
      }}
    >
      <PopoverTrigger asChild>
        <button
          ref={triggerRef}
          type="button"
          data-option-help={variant === 'option' ? '' : undefined}
          data-testid={triggerTestId ?? `option-help-${value}`}
          aria-label={ariaLabel ?? (locale === 'zh' ? `${label}说明` : `Help: ${label}`)}
          onPointerEnter={(event) => {
            if (event.pointerType !== 'mouse') return;
            cancelClose();
            if (!open) {
              hoverOpenedRef.current = true;
              setOpen(true);
              track(analyticsEvent, { value, label });
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
          className={cn(
            'no-export inline-flex shrink-0 cursor-help items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none',
            variant === 'option' && 'size-11 md:size-8',
            variant === 'inline' && 'size-6 -my-0.5',
            variant === 'selected' && 'pointer-events-auto h-full w-7',
            triggerClassName,
          )}
        >
          <Info aria-hidden="true" className="size-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        ref={contentRef}
        side="bottom"
        align={align}
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
        data-testid={contentTestId ?? `option-help-content-${value}`}
        className={cn(
          HELP_CONTENT_CLASS_NAME,
          'z-[130] w-96 max-w-[min(calc(100vw-1.5rem),var(--radix-popover-content-available-width))] max-h-[min(28rem,var(--radix-popover-content-available-height))] overflow-y-auto space-y-3',
        )}
      >
        <p id={titleId} className="font-medium text-foreground">
          {label}
        </p>
        <div className="space-y-3 text-muted-foreground">{children}</div>
      </PopoverContent>
    </Popover>
  );
}
