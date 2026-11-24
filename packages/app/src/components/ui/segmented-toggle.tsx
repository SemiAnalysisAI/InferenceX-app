'use client';

import { ChevronDown } from 'lucide-react';
import { startTransition, useOptimistic, type ReactNode } from 'react';

import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/shared/utils';
import {
  SEGMENT_RADIUS_STYLE,
  SEGMENTED_CONTAINER_STYLE,
  SELECT_TRIGGER_STYLE,
} from '@/components/ui/control-styles';

interface SegmentedToggleOptionBase<TValue extends string> {
  value: TValue;
  icon?: ReactNode;
  title?: string;
  badge?: string;
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
  /** Lets a `<label htmlFor>` name the control. */
  id?: string;
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
  const label = option.badge
    ? `${option.label ?? option.ariaLabel} · ${option.badge}`
    : (option.label ?? option.ariaLabel);
  return option.title ? `${label} — ${option.title}` : label;
}

export function SegmentedToggle<TValue extends string>({
  value,
  options,
  onValueChange,
  ariaLabel,
  id,
  testId,
  className,
  buttonClassName,
  activeButtonClassName = 'bg-muted text-foreground dark:bg-input',
  inactiveButtonClassName = 'text-muted-foreground hover:text-foreground',
  size = 'sm',
  role = 'tablist',
  variant = 'segments',
}: SegmentedToggleProps<TValue>) {
  // The pressed segment paints at once; whatever the pick re-renders (often whole charts)
  // runs as a transition so it cannot hold up that paint.
  const [shownValue, setShownValue] = useOptimistic(value);
  const choose = (next: TValue) =>
    startTransition(() => {
      setShownValue(next);
      onValueChange(next);
    });
  if (variant === 'select') {
    return (
      <div className={cn('relative min-w-0', className)}>
        <select
          id={id}
          aria-label={ariaLabel}
          data-testid={testId}
          value={shownValue}
          onChange={(event) => choose(event.target.value as TValue)}
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
      id={id}
      role={role}
      aria-label={ariaLabel}
      data-testid={testId}
    >
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role={role === 'tablist' ? 'tab' : undefined}
          aria-selected={role === 'tablist' ? shownValue === option.value : undefined}
          aria-pressed={role === 'group' ? shownValue === option.value : undefined}
          aria-label={option.ariaLabel}
          title={option.title}
          disabled={option.disabled}
          className={cn(
            'inline-flex min-h-11 min-w-0 max-w-full items-center justify-center gap-1.5 px-1.5 py-1 text-sm font-medium transition-colors disabled:pointer-events-none disabled:opacity-60 md:py-0.5',
            SEGMENT_RADIUS_STYLE,
            size === 'sm' ? 'md:min-h-6' : 'md:min-h-7',
            buttonClassName,
            shownValue === option.value ? activeButtonClassName : inactiveButtonClassName,
            option.className,
          )}
          onClick={() => choose(option.value)}
          data-testid={option.testId}
        >
          {option.icon}
          {option.label}
          {option.badge && (
            <Badge variant="secondary" className="px-1.5 py-0">
              {option.badge}
            </Badge>
          )}
        </button>
      ))}
    </div>
  );
}
