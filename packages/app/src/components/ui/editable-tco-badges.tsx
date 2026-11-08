'use client';

import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';

import { getModelSortIndex } from '@/lib/catalog/constants';
import { useLocale } from '@/lib/i18n/use-locale';
import { cn } from '@/lib/shared/utils';

export interface EditableTcoBadgeItem {
  base: string;
  label: string;
  value: string;
  overridden?: boolean;
}

function twoDecimalValue(value: string): string {
  const parsed = Number(value);
  return value.trim() !== '' && Number.isFinite(parsed) ? parsed.toFixed(2) : value;
}

function TcoCostInput({
  id,
  testId,
  ariaLabel,
  value,
  overridden = false,
  twoDecimals = true,
  className,
  onChange,
  onCommit,
}: {
  id: string;
  testId: string;
  ariaLabel: string;
  value: string;
  overridden?: boolean;
  twoDecimals?: boolean;
  className?: string;
  onChange: (raw: string) => void;
  onCommit?: (raw: string) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const shown = draft ?? (twoDecimals ? twoDecimalValue(value) : value);
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
        value={shown}
        onFocus={() => setDraft(shown)}
        onChange={(event) => {
          if (draft !== null) setDraft(event.target.value);
          onChange(event.target.value);
        }}
        onBlur={(event) => {
          setDraft(null);
          onCommit?.(event.target.value);
        }}
        onWheel={(event) => event.currentTarget.blur()}
        style={{ width: `${Math.max(shown.length, 1) + 1.5}ch` }}
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
        {shown}
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

const CHIP_CELL = 'w-16';

const TABLE_STRINGS = {
  en: {
    header: '$/chip/hr',
    row: 'TCO',
    reset: 'Reset',
    input: (chip: string) => `${chip} $/chip/hr`,
  },
  zh: {
    header: '$/芯片/小时',
    row: 'TCO',
    reset: '重置',
    input: (name: string) => `${name} $/芯片/小时`,
  },
} as const;

interface TcoPriceTableSlots {
  rowLabel?: ReactNode;
  footnote?: ReactNode;
}

const TcoPriceTableSlotsContext = createContext<TcoPriceTableSlots>({});

/**
 * Lets the chart footer hand the price table its row label (the cost tier that
 * produced the prices) and its footnote (their source).
 */
export function TcoPriceTableSlotsProvider({
  rowLabel,
  footnote,
  children,
}: TcoPriceTableSlots & { children: ReactNode }) {
  const slots = useMemo(() => ({ rowLabel, footnote }), [rowLabel, footnote]);
  return (
    <TcoPriceTableSlotsContext.Provider value={slots}>
      {children}
    </TcoPriceTableSlotsContext.Provider>
  );
}

export function plottedChipBases(
  hwKeys: Iterable<string>,
  hasPrice: (base: string) => boolean,
): string[] {
  return [
    ...new Set(
      [...new Set(hwKeys)]
        .toSorted((a, b) => getModelSortIndex(a) - getModelSortIndex(b) || a.localeCompare(b))
        .map((key) => key.split('_')[0]),
    ),
  ].filter(hasPrice);
}

export function TcoPriceTable({
  header,
  rowLabel,
  items,
  editable = false,
  twoDecimals = true,
  onChange,
  onCommit,
  inputLabel,
  onReset,
  resetTestId,
  testId,
  cellTestId,
  inputIdPrefix,
  inputTestIdPrefix = inputIdPrefix,
  className,
}: {
  header?: string;
  rowLabel?: string;
  items: readonly EditableTcoBadgeItem[];
  editable?: boolean;
  twoDecimals?: boolean;
  onChange?: (base: string, raw: string) => void;
  onCommit?: (base: string, raw: string) => void;
  inputLabel?: (chipLabel: string) => string;
  onReset?: () => void;
  resetTestId?: string;
  testId: string;
  cellTestId: string;
  inputIdPrefix: string;
  inputTestIdPrefix?: string;
  className?: string;
}) {
  const t = TABLE_STRINGS[useLocale()];
  const slots = useContext(TcoPriceTableSlotsContext);
  const [editing, setEditing] = useState<{ item: EditableTcoBadgeItem; index: number } | null>(
    null,
  );
  const shownItems =
    editing && !items.some(({ base }) => base === editing.item.base)
      ? items.toSpliced(Math.min(editing.index, items.length), 0, editing.item)
      : items;
  return (
    <div className={cn('max-w-full', className)}>
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
                {header ?? t.header}
              </th>
              {shownItems.map(({ base, label }) => (
                <th
                  key={base}
                  scope="col"
                  className={cn(TABLE_CELL, CHIP_CELL, 'border-b border-border/60 font-normal')}
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
              <th
                scope="row"
                className={cn(
                  TABLE_CELL,
                  'text-left font-normal max-sm:[&_[aria-haspopup]]:max-w-36',
                )}
              >
                {slots.rowLabel ?? rowLabel ?? t.row}
              </th>
              {shownItems.map(({ base, label, value, overridden }, index) => (
                <td
                  key={base}
                  data-testid={cellTestId}
                  data-overridden={overridden ? '' : undefined}
                  className={cn(TABLE_CELL, CHIP_CELL, 'text-xs font-semibold')}
                  onFocus={() => setEditing({ item: shownItems[index], index })}
                  onBlur={() => setEditing(null)}
                >
                  {editable ? (
                    <TcoCostInput
                      id={`${inputIdPrefix}-${base}`}
                      testId={`${inputTestIdPrefix}-${base}`}
                      ariaLabel={(inputLabel ?? t.input)(label)}
                      value={value}
                      overridden={overridden}
                      twoDecimals={twoDecimals}
                      className="text-right font-semibold"
                      onChange={(raw) => onChange?.(base, raw)}
                      onCommit={onCommit ? (raw) => onCommit(base, raw) : undefined}
                    />
                  ) : (
                    <span className="text-foreground">
                      {twoDecimals ? twoDecimalValue(value) : value}
                    </span>
                  )}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
      {(slots.footnote || onReset || editable) && (
        <div className="mt-1 flex min-h-4 flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          {slots.footnote}
          {onReset && (
            <button
              type="button"
              data-testid={resetTestId}
              className="no-export cursor-pointer rounded-xs text-2xs leading-4 text-muted-foreground underline-offset-2 hover:text-foreground hover:underline focus-visible:outline-2 focus-visible:outline-ring"
              onClick={onReset}
            >
              {t.reset}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
