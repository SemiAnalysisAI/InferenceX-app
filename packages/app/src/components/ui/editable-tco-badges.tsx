'use client';

import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

export interface EditableTcoBadgeItem {
  /** Hardware key, e.g. `gb300`. Used for ids and analytics. */
  base: string;
  /** Chip name printed before the value, e.g. `GB300`. */
  label: string;
  /** Current $/chip/hr as typed or formatted. Empty means "no price". */
  value: string;
}

/**
 * The caption's "TCO $/chip/hr" badge row with the number inside each badge
 * editable in place. Typing into a badge is how a reader enters their own
 * $/chip/hr: the owner switches to its custom tier on the first edit, so
 * there is no separate custom-cost form.
 *
 * Inputs are `no-export`; PNG exports keep the plain value through the
 * `export-only` twin so the caption reads the same on the image.
 */
export function EditableTcoBadges({
  label,
  items,
  onChange,
  onCommit,
  inputLabel,
  testId,
  badgeTestId,
  inputIdPrefix,
  inputTestIdPrefix = inputIdPrefix,
  className,
}: {
  label: string;
  items: readonly EditableTcoBadgeItem[];
  onChange: (base: string, raw: string) => void;
  /** Fires on blur with the value as it stands; owners use it for analytics. */
  onCommit?: (base: string, raw: string) => void;
  /** Accessible name for the input of a chip, e.g. `GB300 $/chip/hr`. */
  inputLabel: (chipLabel: string) => string;
  testId: string;
  badgeTestId: string;
  inputIdPrefix: string;
  /**
   * Prefix for each input's `data-testid`; defaults to `inputIdPrefix`. Pass
   * it when the id prefix is per instance (`useId()`) but tests address the
   * inputs by a stable name.
   */
  inputTestIdPrefix?: string;
  className?: string;
}) {
  return (
    <p
      className={cn('text-muted-foreground mb-2 flex flex-wrap items-center gap-2', className)}
      data-testid={testId}
    >
      {label}{' '}
      {items.map(({ base, label: chipLabel, value }) => {
        const id = `${inputIdPrefix}-${base}`;
        return (
          <Badge
            key={base}
            variant="outline"
            data-testid={badgeTestId}
            className="gap-1 py-0 pr-1 text-muted-foreground has-[input:focus-visible]:border-ring has-[input:focus-visible]:ring-ring/50 has-[input:focus-visible]:ring-[3px]"
          >
            <label htmlFor={id} className="cursor-text">
              {chipLabel}:
            </label>{' '}
            <input
              id={id}
              data-testid={`${inputTestIdPrefix}-${base}`}
              type="number"
              inputMode="decimal"
              min={0}
              step={0.01}
              aria-label={inputLabel(chipLabel)}
              value={value}
              onChange={(event) => onChange(base, event.target.value)}
              onBlur={(event) => onCommit?.(base, event.target.value)}
              onWheel={(event) => event.currentTarget.blur()}
              // Sized to the digits typed, so the badge hugs the number the
              // way the read-only version did.
              style={{ width: `${Math.max(value.length, 1) + 1.5}ch` }}
              className="no-export h-5 min-w-0 rounded-sm border-b border-dashed border-muted-foreground/60 bg-transparent px-0.5 text-xs font-medium tabular-nums text-foreground outline-none focus-visible:border-solid focus-visible:border-transparent [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
            />
            <span className="export-only hidden font-medium text-foreground">{value}</span>
          </Badge>
        );
      })}
    </p>
  );
}
