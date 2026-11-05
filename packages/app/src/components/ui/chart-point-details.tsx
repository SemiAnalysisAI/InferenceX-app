'use client';

import { X } from 'lucide-react';
import type * as React from 'react';
import { useEffect, useRef } from 'react';

import { Button } from '@/components/ui/button';
import { useLocale } from '@/lib/i18n/use-locale';
import { cn } from '@/lib/shared/utils';

const STRINGS = {
  en: { title: 'Point details', close: 'Close point details' },
  zh: { title: '数据点详情', close: '关闭数据点详情' },
} as const;

const LINK_CLASS =
  'cursor-pointer font-medium text-foreground underline decoration-muted-foreground/50 underline-offset-4 hover:decoration-foreground';

export interface ChartPointDetailsMetric {
  value: string;
  label: string;
}

export interface ChartPointDetailsRow {
  label: string;
  value: string;
  wide?: boolean;
}

export interface ChartPointDetailsLink<A extends string = string> {
  action: A;
  label: string;
  href?: string;
  external?: boolean;
}

export interface ChartPointDetailsProps<A extends string = string> {
  title: string;
  subtitle?: string;
  color?: string;
  date?: string;
  warning?: string;
  metrics: readonly ChartPointDetailsMetric[];
  rows?: readonly ChartPointDetailsRow[];
  links?: readonly ChartPointDetailsLink<A>[];
  onClose: () => void;
  onAction?: (action: A, event: React.MouseEvent<HTMLElement>) => void;
  children?: React.ReactNode;
}

export function ChartPointDetails<A extends string = string>({
  title,
  subtitle,
  color,
  date,
  warning,
  metrics,
  rows = [],
  links = [],
  onClose,
  onAction,
  children,
}: ChartPointDetailsProps<A>) {
  const t = STRINGS[useLocale()];
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    ref.current?.scrollIntoView?.({ block: 'nearest' });
  }, [title, subtitle, date]);

  const externalLinks = links.filter((link) => link.external && link.href);
  const actions = links.filter((link) => !externalLinks.includes(link));

  return (
    <section
      ref={ref}
      data-testid="point-details-panel"
      aria-label={t.title}
      className="flex w-full flex-col rounded-lg border border-border/30 bg-background p-3 text-xs leading-5"
    >
      {warning && <p className="mb-1 font-semibold text-destructive">{warning}</p>}
      <div className="flex items-start gap-1.5">
        {color && (
          <span
            aria-hidden
            className="mt-1.5 size-2 shrink-0 rounded-full"
            style={{ backgroundColor: color }}
          />
        )}
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-foreground">
            {title}
            {subtitle && (
              <>
                {' '}
                <span className="font-normal text-muted-foreground">{subtitle}</span>
              </>
            )}
          </p>
          {date && <p className="tabular-nums text-muted-foreground">{date}</p>}
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon-2xs"
          data-testid="point-details-close"
          aria-label={t.close}
          className="-mr-1.5 -mt-1 shrink-0 text-muted-foreground"
          onClick={onClose}
        >
          <X />
        </Button>
      </div>
      {metrics.length > 0 && (
        <dl className="mt-2.5 space-y-1 border-t border-border/50 pt-2.5">
          {metrics.map((metric) => (
            <DetailRow
              key={metric.label}
              label={metric.label}
              value={metric.value}
              valueClassName="text-sm font-semibold"
            />
          ))}
        </dl>
      )}
      {rows.length > 0 && (
        <dl className="mt-2.5 space-y-1 border-t border-border/50 pt-2.5">
          {rows.map((row, index) => (
            <DetailRow
              key={`${row.label}-${index}`}
              label={row.label}
              value={row.value}
              stacked={row.wide || row.value.length > 24}
            />
          ))}
        </dl>
      )}
      {children}
      {links.length > 0 && (
        <div className="mt-3 flex flex-col gap-2 border-t border-border/50 pt-2.5">
          {externalLinks.length > 0 && (
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              {externalLinks.map((link) => (
                <a
                  key={link.action}
                  data-action={link.action}
                  href={link.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={LINK_CLASS}
                  onClick={(event) => onAction?.(link.action, event)}
                >
                  {link.label} ↗
                </a>
              ))}
            </div>
          )}
          {actions.length > 0 && (
            <div className="grid grid-cols-2 gap-1.5">
              {actions.map((link) => (
                <Button
                  key={link.action}
                  asChild={Boolean(link.href)}
                  type={link.href ? undefined : 'button'}
                  variant="outline"
                  size="xs"
                  data-action={link.action}
                  className="w-full"
                  onClick={(event: React.MouseEvent<HTMLElement>) => onAction?.(link.action, event)}
                >
                  {link.href ? <a href={link.href}>{link.label} →</a> : <>{link.label} →</>}
                </Button>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function DetailRow({
  label,
  value,
  stacked = false,
  valueClassName,
}: {
  label: string;
  value: string;
  stacked?: boolean;
  valueClassName?: string;
}) {
  return (
    <div className={stacked ? undefined : 'flex items-baseline justify-between gap-3'}>
      <dt className="min-w-0 text-muted-foreground">{label}</dt>
      <dd
        className={cn(
          'font-medium tabular-nums text-foreground',
          stacked ? '[overflow-wrap:anywhere]' : 'shrink-0 whitespace-nowrap text-right',
          valueClassName,
        )}
      >
        {value}
      </dd>
    </div>
  );
}
