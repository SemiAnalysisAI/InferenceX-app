'use client';

import { type ReactNode } from 'react';

import { cn } from '@/lib/utils';

type SegmentedToggleOptionBase<TValue extends string> = {
  value: TValue;
  icon?: ReactNode;
  title?: string;
  testId?: string;
  className?: string;
};

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
}: SegmentedToggleProps<TValue>) {
  return (
    <div
      className={cn(
        'inline-flex items-center rounded-lg border border-border p-0.5 gap-0.5',
        className,
      )}
      role="tablist"
      aria-label={ariaLabel}
      data-testid={testId}
    >
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="tab"
          aria-selected={value === option.value}
          aria-label={option.ariaLabel}
          title={option.title}
          className={cn(
            'inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium transition-colors',
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
