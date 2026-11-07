'use client';

import { CONTROL_HEIGHT } from '@/components/ui/control-styles';
import { cn } from '@/lib/shared/utils';

export function CaptionPercentInput({
  id,
  testId,
  ariaLabel,
  value,
  onChange,
  onBlur,
  className,
}: {
  id: string;
  testId: string;
  ariaLabel: string;
  value: string;
  onChange: (raw: string) => void;
  onBlur: () => void;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-md border border-input px-2 text-xs font-medium text-foreground',
        CONTROL_HEIGHT.sm,
        "after:content-['%'] hover:bg-muted/60 has-[input:focus-visible]:border-ring has-[input:focus-visible]:ring-ring/50 has-[input:focus-visible]:ring-[3px]",
        className,
      )}
    >
      <input
        id={id}
        data-testid={testId}
        type="number"
        inputMode="decimal"
        min={0}
        max={100}
        step={1}
        aria-label={ariaLabel}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onBlur={onBlur}
        onWheel={(event) => event.currentTarget.blur()}
        style={{ width: `${Math.max(value.length, 1) + 0.5}ch` }}
        className="h-5 min-w-0 bg-transparent text-right text-xs font-medium tabular-nums text-foreground outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
      />
    </span>
  );
}
