'use client';

import { ChevronDown } from 'lucide-react';
import { type ReactNode } from 'react';

import { cn } from '@/lib/shared/utils';
import { SEGMENTED_CONTAINER_STYLE, SELECT_TRIGGER_STYLE } from '@/components/ui/control-styles';

interface SegmentedToggleOptionBase<TValue extends string> {
  value: TValue;
  icon?: ReactNode;
  title?: string;
  testId?: string;
  className?: string;
  disabled?: boolean;
}

type SegmentedToggleOptionContent =
  | {
      label: string;
      ariaLabel?: string;
    }
  | {
      label?: undefined;
      ariaLabel: string;
    };

export type SegmentedToggleOption<TValue extends string> = SegmentedToggleOptionBase<TValue> &
  SegmentedToggleOptionContent;

interface SegmentedToggleProps<TValue extends string> {
  value: TValue;
  options: SegmentedToggleOption<TValue>[];
  onValueChange: (value: TValue) => void;
  ariaLabel: string;
  testId?: string;
  className?: string;
  buttonClassName?: string;
  activeButtonClassName?: string;
  inactiveButtonClassName?: string;
  size?: 'sm' | 'default';
  role?: 'tablist' | 'group';
  /**
   * `select` renders the same options as one native `<select>` (the phone fallback:
   * one 44 px control instead of a row of segments). Each option's `title` hint,
   * which touch never shows, joins its label as ` — hint`; `disabled` carries over.
   */
  variant?: 'segments' | 'select';
}

/** The text a `select` option shows: the label, plus the hover hint touch would miss. */
export function segmentedSelectOptionLabel<TValue extends string>(
  option: SegmentedToggleOption<TValue>,
): string {
  const label = option.label ?? option.ariaLabel;
  return option.title ? `${label} — ${option.title}` : label;
}

export function SegmentedToggle<TValue extends string>({
  value,
  options,
  onValueChange,
  ariaLabel,
  testId,
  className,
  buttonClassName,
  activeButtonClassName = 'bg-muted text-foreground',
  inactiveButtonClassName = 'text-muted-foreground hover:text-foreground',
  size = 'sm',
  role = 'tablist',
  variant = 'segments',
}: SegmentedToggleProps<TValue>) {
  if (variant === 'select') {
    return (
      <div className={cn('relative min-w-0', className)}>
        <select
          aria-label={ariaLabel}
          data-testid={testId}
          value={value}
          onChange={(event) => onValueChange(event.target.value as TValue)}
          className={cn(
            SELECT_TRIGGER_STYLE,
            size === 'sm' ? 'h-11 md:h-8' : 'h-11 md:h-9',
            'w-full appearance-none truncate pr-9 text-foreground',
          )}
        >
          {options.map((option) => (
            <option
              key={option.value}
              value={option.value}
              disabled={option.disabled}
              data-testid={option.testId}
            >
              {segmentedSelectOptionLabel(option)}
            </option>
          ))}
        </select>
        <ChevronDown
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-muted-foreground"
        />
      </div>
    );
  }
  return (
    <div
      className={cn(
        SEGMENTED_CONTAINER_STYLE,
        size === 'sm' ? 'md:min-h-8' : 'md:min-h-9',
        className,
      )}
      role={role}
      aria-label={ariaLabel}
      data-testid={testId}
    >
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role={role === 'tablist' ? 'tab' : undefined}
          aria-selected={role === 'tablist' ? value === option.value : undefined}
          aria-pressed={role === 'group' ? value === option.value : undefined}
          aria-label={option.ariaLabel}
          title={option.title}
          disabled={option.disabled}
          className={cn(
            'inline-flex min-h-11 min-w-0 max-w-full items-center gap-1.5 rounded-[max(0px,calc(var(--radius)-var(--segmented-inset)))] px-2 py-1 text-sm font-medium transition-colors disabled:pointer-events-none disabled:opacity-50 md:py-0.5',
            size === 'sm' ? 'md:min-h-6' : 'md:min-h-7',
            buttonClassName,
            value === option.value ? activeButtonClassName : inactiveButtonClassName,
            option.className,
          )}
          onClick={() => onValueChange(option.value)}
          data-testid={option.testId}
        >
          {option.icon}
          {option.label}
        </button>
      ))}
    </div>
  );
}
