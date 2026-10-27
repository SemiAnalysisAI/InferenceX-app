'use client';

import { Check, Copy } from 'lucide-react';
import { type ReactNode, useCallback, useEffect, useState } from 'react';

import { track } from '@/lib/analytics/analytics';
import type { Locale } from '@/lib/i18n/i18n';
import { readWidgetHash, writeWidgetHash } from '@/lib/powerx/widget-hash';
import { cn } from '@/lib/shared/utils';

/** Shared chrome for the /powerx/tutorial widgets: card, chip rows, badges, notes, hash state. */

export interface WidgetProps {
  locale: Locale;
  alt: string;
}

const CHROME_STRINGS = {
  en: { copy: 'Copy', copied: 'Copied', failed: 'Could not copy' },
  zh: { copy: '复制', copied: '已复制', failed: '复制失败' },
} as const;

/** Reads `key` from the URL hash on mount and writes every change back with replaceState. */
export function useWidgetHash<T>(
  key: string,
  encode: (state: T) => string,
  decode: (raw: string | null) => T,
): [T, (next: T) => void] {
  const [state, setState] = useState<T>(() => decode(null));
  useEffect(() => {
    const raw = readWidgetHash(window.location.hash, key);
    if (raw !== null) setState(decode(raw));
    // Hydrate once from the URL; later changes flow through `set`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  const set = useCallback(
    (next: T) => {
      setState(next);
      const hash = writeWidgetHash(window.location.hash, key, encode(next));
      window.history.replaceState(window.history.state, '', `#${hash}`);
    },
    [key, encode],
  );
  return [state, set];
}

export function WidgetCard({
  name,
  alt,
  children,
}: {
  name: string;
  alt: string;
  children: ReactNode;
}) {
  return (
    <section
      aria-label={alt}
      data-widget={name}
      data-testid={`powerx-widget-${name}`}
      className="not-prose my-6 min-w-0 overflow-hidden rounded-lg border border-border bg-background text-sm text-foreground"
    >
      {children}
    </section>
  );
}

export interface ChipOption<T extends string> {
  value: T;
  label: string;
  subtitle?: string;
  title?: string;
  /** A reason string disables the chip; it shows under the row on click and as the hover title. */
  disabled?: string | null;
}

export interface ChipGroup<T extends string> {
  label?: string;
  options: ChipOption<T>[];
}

export function ChipRow<T extends string>({
  label,
  groups,
  value,
  onChange,
  children,
}: {
  label: string;
  groups: ChipGroup<T>[];
  value: T;
  onChange: (value: T) => void;
  /** Extra controls rendered under the chips, inside the row. */
  children?: ReactNode;
}) {
  const [reason, setReason] = useState<string | null>(null);
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="border-b border-border/60 px-4 py-3 last:border-b-0"
    >
      <div className="grid gap-x-4 gap-y-2 sm:grid-cols-[7.5rem_minmax(0,1fr)]">
        <span className="pt-2 text-sm font-semibold text-foreground">{label}</span>
        <div className="min-w-0 space-y-2">
          {groups.map((group, index) => (
            <div key={group.label ?? index} className="flex min-w-0 flex-wrap items-stretch gap-2">
              {group.label && (
                <span className="w-full shrink-0 self-center pt-1 font-mono text-xs font-semibold tracking-eyebrow text-muted-foreground uppercase sm:w-20 sm:pt-0">
                  {group.label}
                </span>
              )}
              {group.options.map((option) => {
                const selected = option.value === value;
                const disabled = option.disabled ?? null;
                return (
                  <button
                    key={option.value}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    aria-disabled={disabled !== null}
                    title={option.title ?? disabled ?? undefined}
                    data-value={option.value}
                    onClick={() => {
                      if (disabled !== null) {
                        setReason(disabled);
                        return;
                      }
                      setReason(null);
                      onChange(option.value);
                    }}
                    className={cn(
                      'inline-flex min-h-11 min-w-0 max-w-full flex-col items-center justify-center rounded-md border px-3 py-1.5 text-center leading-tight transition-colors md:min-h-9',
                      selected
                        ? 'border-brand bg-brand text-primary-foreground'
                        : 'border-border bg-background text-foreground hover:bg-muted',
                      disabled !== null && 'cursor-not-allowed opacity-50 hover:bg-background',
                    )}
                  >
                    <span className="text-sm font-medium">{option.label}</span>
                    {option.subtitle && (
                      <span
                        className={cn(
                          'text-xs',
                          selected ? 'text-primary-foreground/80' : 'text-muted-foreground',
                        )}
                      >
                        {option.subtitle}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          ))}
          {children}
        </div>
      </div>
      {reason !== null && (
        <p role="status" className="mt-2 text-xs text-muted-foreground sm:pl-[8.5rem]">
          {reason}
        </p>
      )}
    </div>
  );
}

export function RangeRow({
  label,
  value,
  min,
  max,
  step,
  onChange,
  readout,
  hint,
  ariaLabel,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
  readout: string;
  hint?: string;
  ariaLabel?: string;
}) {
  return (
    <div className="border-b border-border/60 px-4 py-3 last:border-b-0">
      <div className="grid gap-x-4 gap-y-2 sm:grid-cols-[7.5rem_minmax(0,1fr)]">
        <span className="pt-2 text-sm font-semibold text-foreground">{label}</span>
        <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-1">
          <input
            type="range"
            aria-label={ariaLabel ?? label}
            min={min}
            max={max}
            step={step}
            value={value}
            onChange={(event) => onChange(Number(event.target.value))}
            className="h-11 min-w-0 flex-1 basis-40 accent-brand md:h-9"
          />
          <span className="font-mono text-sm tabular-nums text-foreground">{readout}</span>
          {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
        </div>
      </div>
    </div>
  );
}

export type BadgeTone = 'measured' | 'modeled' | 'rated' | 'verified' | 'valid' | 'invalid';

const TONE_DOT: Record<BadgeTone, string> = {
  measured: 'bg-brand',
  modeled: 'bg-muted-foreground',
  rated: 'bg-border',
  verified: 'bg-brand',
  valid: 'bg-brand',
  invalid: 'bg-destructive',
};

export function OutputBadge({
  tone,
  children,
  title,
}: {
  tone: BadgeTone;
  children: ReactNode;
  title?: string;
}) {
  return (
    <span
      title={title}
      data-tone={tone}
      className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-border px-2 py-0.5 text-xs font-medium whitespace-nowrap text-foreground"
    >
      <span aria-hidden="true" className={cn('size-1.5 rounded-full', TONE_DOT[tone])} />
      {children}
    </span>
  );
}

export function OutputHeader({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-wrap items-center justify-between gap-2 border-y border-border/60 bg-muted/30 px-4 py-2">
      {children}
    </div>
  );
}

export function WidgetNote({ children }: { children: ReactNode }) {
  return (
    <p role="note" className="flex gap-2 px-4 py-2 text-xs leading-5 text-muted-foreground">
      <span aria-hidden="true">⚠️</span>
      <span className="min-w-0">{children}</span>
    </p>
  );
}

export function CopyButton({
  text,
  label,
  locale,
  event,
}: {
  text: string;
  label?: string;
  locale: Locale;
  event: string;
}) {
  const t = CHROME_STRINGS[locale];
  const [status, setStatus] = useState<'idle' | 'copied' | 'failed'>('idle');
  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setStatus('copied');
      track(event);
    } catch {
      setStatus('failed');
    }
  }
  const caption =
    status === 'copied' ? t.copied : status === 'failed' ? t.failed : (label ?? t.copy);
  return (
    <button
      type="button"
      onClick={copy}
      aria-label={label ?? t.copy}
      className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-md px-2 text-xs font-medium text-foreground transition-colors hover:bg-muted focus-visible:outline-none md:min-h-8"
    >
      {status === 'copied' ? (
        <Check aria-hidden="true" className="size-3.5" />
      ) : (
        <Copy aria-hidden="true" className="size-3.5" />
      )}
      <span aria-live="polite">{caption}</span>
    </button>
  );
}
