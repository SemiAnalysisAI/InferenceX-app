'use client';

import { type ComponentType, type KeyboardEvent, type ReactNode, useRef, useState } from 'react';

import type { Locale } from '@/lib/i18n/i18n';
import { cn } from '@/lib/shared/utils';

/** Chrome shared by every tutorial's widgets: the frame, the props contract and chips. */

export interface WidgetProps {
  locale: Locale;
  alt: string;
}

/** Where a widget sits in the article: the reading column or the full container width. */
export type WidgetLayout = 'column' | 'bleed';

/** The widgets one tutorial mounts with `<Widget name="<key>" alt="…" />`. */
export type TutorialWidgets = Record<
  string,
  { component: ComponentType<WidgetProps>; layout: WidgetLayout }
>;

export function WidgetFrame({
  name,
  alt,
  scope,
  children,
  className,
}: {
  name: string;
  /** Feature prefix of the test id, e.g. `powerx` → `powerx-widget-<name>`. */
  scope: string;
  alt: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      aria-label={alt}
      data-widget={name}
      data-testid={`${scope}-widget-${name}`}
      className={cn('not-prose min-w-0 text-sm text-foreground', className)}
    >
      {children}
    </section>
  );
}

export interface ChipOption<T extends string> {
  value: T;
  label: string;
  title?: string;
  /** A reason string disables the chip; it shows under the row on click and as the hover title. */
  disabled?: string | null;
}

/** A flat radio row: arrow keys move the selection, Enter and Space pick the focused chip. */
export function Chips<T extends string>({
  label,
  options,
  value,
  onChange,
  size = 'md',
  className,
}: {
  label: string;
  options: ChipOption<T>[];
  value: T;
  onChange: (value: T) => void;
  size?: 'md' | 'lg';
  className?: string;
}) {
  const [reason, setReason] = useState<string | null>(null);
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const pick = (option: ChipOption<T>) => {
    if (option.disabled) {
      setReason(option.disabled);
      return;
    }
    setReason(null);
    onChange(option.value);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const delta =
      event.key === 'ArrowRight' || event.key === 'ArrowDown'
        ? 1
        : event.key === 'ArrowLeft' || event.key === 'ArrowUp'
          ? -1
          : 0;
    if (delta === 0) return;
    event.preventDefault();
    const next = (index + delta + options.length) % options.length;
    refs.current[next]?.focus();
    pick(options[next]);
  };
  return (
    <div className={cn('min-w-0', className)}>
      <div
        role="radiogroup"
        aria-label={label}
        className="flex min-w-0 flex-wrap items-center gap-1"
      >
        {options.map((option, index) => {
          const selected = option.value === value;
          return (
            <button
              key={option.value}
              ref={(node) => {
                refs.current[index] = node;
              }}
              type="button"
              role="radio"
              aria-checked={selected}
              aria-disabled={Boolean(option.disabled)}
              tabIndex={selected ? 0 : -1}
              title={option.title ?? option.disabled ?? undefined}
              data-value={option.value}
              onClick={() => pick(option)}
              onKeyDown={(event) => onKeyDown(event, index)}
              className={cn(
                'inline-flex min-h-11 items-center rounded-md px-3 font-medium whitespace-nowrap transition-colors motion-reduce:transition-none',
                size === 'lg' ? 'text-base md:min-h-9' : 'text-sm md:min-h-8',
                selected
                  ? 'bg-muted text-foreground'
                  : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground',
                option.disabled && 'cursor-not-allowed opacity-50 hover:bg-transparent',
              )}
            >
              {option.label}
            </button>
          );
        })}
      </div>
      {reason !== null && (
        <p role="status" className="mt-1 text-xs text-muted-foreground">
          {reason}
        </p>
      )}
    </div>
  );
}
