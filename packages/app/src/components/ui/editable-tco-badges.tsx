'use client';

import type { ReactNode } from 'react';

import { cn } from '@/lib/shared/utils';

export interface EditableTcoBadgeItem {
  base: string;
  label: string;
  value: string;
  overridden?: boolean;
}

function TcoCostInput({
  id,
  testId,
  ariaLabel,
  value,
  overridden = false,
  className,
  onChange,
  onCommit,
}: {
  id: string;
  testId: string;
  ariaLabel: string;
  value: string;
  overridden?: boolean;
  className?: string;
  onChange: (raw: string) => void;
  onCommit?: (raw: string) => void;
}) {
  return (
    <>
      <input
        id={id}
        data-testid={testId}
        type="number"
        inputMode="decimal"
        min={0}
        step={0.01}
        aria-label={ariaLabel}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onBlur={(event) => onCommit?.(event.target.value)}
        onWheel={(event) => event.currentTarget.blur()}
        style={{ width: `${Math.max(value.length, 1) + 1.5}ch` }}
        className={cn(
          'no-export h-5 min-w-0 rounded-xs border-b border-dashed border-muted-foreground/50 bg-transparent px-0.5 text-xs font-medium tabular-nums outline-none transition-colors hover:border-foreground/60 focus-visible:border-solid focus-visible:border-ring [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none',
          overridden ? 'text-brand' : 'text-foreground',
          className,
        )}
      />
      <span
        className={cn(
          'export-only hidden font-medium',
          overridden ? 'text-brand' : 'text-foreground',
        )}
      >
        {value}
      </span>
    </>
  );
}

/**
 * Per-chip $/chip/hr assumptions as one quiet line of tabular figures. Each value is an
 * inline number input (dashed underline) so a reader can type their own cost in place.
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
  onCommit?: (base: string, raw: string) => void;
  inputLabel: (chipLabel: string) => string;
  testId: string;
  badgeTestId: string;
  inputIdPrefix: string;
  inputTestIdPrefix?: string;
  className?: string;
}) {
  return (
    <p
      className={cn(
        'mb-1 flex flex-wrap items-baseline gap-x-3 gap-y-1 text-xs text-muted-foreground tabular-nums',
        className,
      )}
      data-testid={testId}
    >
      <span>{label}</span>
      {items.map(({ base, label: chipLabel, value }) => {
        const id = `${inputIdPrefix}-${base}`;
        return (
          <span
            key={base}
            data-testid={badgeTestId}
            className="inline-flex items-baseline gap-1 whitespace-nowrap"
          >
            <label htmlFor={id} className="cursor-text">
              {chipLabel}
            </label>
            <TcoCostInput
              id={id}
              testId={`${inputTestIdPrefix}-${base}`}
              ariaLabel={inputLabel(chipLabel)}
              value={value}
              onChange={(raw) => onChange(base, raw)}
              onCommit={onCommit ? (raw) => onCommit(base, raw) : undefined}
            />
          </span>
        );
      })}
    </p>
  );
}

const TABLE_CELL =
  'whitespace-nowrap px-2.5 py-0.5 text-right [&+&]:border-l [&+&]:border-border/60';

export function TcoPriceTable({
  header,
  rowLabel,
  items,
  editable,
  onChange,
  onCommit,
  inputLabel,
  action,
  testId,
  cellTestId,
  inputIdPrefix,
  inputTestIdPrefix = inputIdPrefix,
  className,
}: {
  header: string;
  rowLabel: string;
  items: readonly EditableTcoBadgeItem[];
  editable: boolean;
  onChange: (base: string, raw: string) => void;
  onCommit?: (base: string, raw: string) => void;
  inputLabel: (chipLabel: string) => string;
  action?: ReactNode;
  testId: string;
  cellTestId: string;
  inputIdPrefix: string;
  inputTestIdPrefix?: string;
  className?: string;
}) {
  return (
    <div className={cn('relative max-w-full', className)}>
      <div
        data-testid={testId}
        className="max-w-full overflow-x-auto rounded-md border border-border/60 text-muted-foreground"
      >
        <table className="border-separate border-spacing-0 text-2xs tabular-nums">
          <thead>
            <tr>
              <th
                scope="col"
                className={cn(TABLE_CELL, 'border-b border-border/60 text-left font-normal')}
              >
                {header}
              </th>
              {items.map(({ base, label }) => (
                <th
                  key={base}
                  scope="col"
                  className={cn(TABLE_CELL, 'border-b border-border/60 font-normal')}
                >
                  {editable ? (
                    <label htmlFor={`${inputIdPrefix}-${base}`} className="cursor-text">
                      {label}
                    </label>
                  ) : (
                    label
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              <th scope="row" className={cn(TABLE_CELL, 'text-left font-normal')}>
                {rowLabel}
              </th>
              {items.map(({ base, label, value, overridden }) => (
                <td
                  key={base}
                  data-testid={cellTestId}
                  data-overridden={overridden ? '' : undefined}
                  className={cn(TABLE_CELL, 'text-xs font-semibold')}
                >
                  {editable ? (
                    <TcoCostInput
                      id={`${inputIdPrefix}-${base}`}
                      testId={`${inputTestIdPrefix}-${base}`}
                      ariaLabel={inputLabel(label)}
                      value={value}
                      overridden={overridden}
                      className="text-right font-semibold"
                      onChange={(raw) => onChange(base, raw)}
                      onCommit={onCommit ? (raw) => onCommit(base, raw) : undefined}
                    />
                  ) : (
                    <span className="text-foreground">{value}</span>
                  )}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
      {action && (
        <div className="no-export mt-1 xl:absolute xl:top-full xl:left-0 xl:mt-0.5">{action}</div>
      )}
    </div>
  );
}
