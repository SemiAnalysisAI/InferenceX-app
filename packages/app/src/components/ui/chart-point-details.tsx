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

const STRIP_VALUE_MAX = 8;
const STRIP_LABEL_MAX = 14;

export interface ChartPointDetailsMetric {
  value: string;
  label: string;
  exact?: string;
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
    const panel = ref.current;
    if (!panel) return;
    const { top, bottom } = panel.getBoundingClientRect();
    if (bottom > 0 && top < window.innerHeight) return;
    panel.scrollIntoView?.({ block: 'nearest' });
  }, [title, subtitle, date]);

  const externalLinks = links.filter((link) => link.external && link.href);
  const actions = links.filter((link) => !externalLinks.includes(link));
  const facts = rows.filter(
    (row) =>
      !row.wide && row.value.length <= STRIP_VALUE_MAX && row.label.length <= STRIP_LABEL_MAX,
  );
  const strip = facts.length > 1 ? facts : [];
  const lines = rows.filter((row) => !strip.includes(row));

  return (
    <section
      ref={ref}
      data-testid="point-details-panel"
      aria-label={t.title}
      className="flex w-full scroll-mt-20 flex-col rounded-lg border border-border/30 bg-background p-2 text-xs leading-5"
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
        <div className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-2">
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
          className="-mr-1 -mt-1 shrink-0 text-muted-foreground"
          onClick={onClose}
        >
          <X />
        </Button>
      </div>
      {(metrics.length > 0 || rows.length > 0) && (
        <div className="inferencex-pinned-tooltip">
          {metrics.length > 0 && (
            <dl className="pinned-metrics">
              {metrics.map((metric) => (
                <div key={metric.label}>
                  <dt className="pinned-metric-label">{metric.label}</dt>
                  <dd className="pinned-metric-value">{metric.value}</dd>
                  {metric.exact && metric.exact !== metric.value && (
                    <dd className="pinned-exact">{metric.exact}</dd>
                  )}
                </div>
              ))}
            </dl>
          )}
          {strip.length > 0 && (
            <dl className="pinned-strip">
              {strip.map((row, index) => (
                <div key={`${row.label}-${index}`}>
                  <dt>{row.label}</dt>
                  <dd>{row.value}</dd>
                </div>
              ))}
            </dl>
          )}
          {lines.length > 0 && (
            <dl
              className={cn(
                'pinned-lines',
                (metrics.length > 0 || strip.length > 0) && 'pinned-section',
              )}
            >
              {lines.map((row, index) => (
                <div
                  key={`${row.label}-${index}`}
                  className={cn('tooltip-line', row.wide && 'pinned-line-wide')}
                >
                  <dt>{row.label}</dt>
                  <dd>{row.value}</dd>
                </div>
              ))}
            </dl>
          )}
        </div>
      )}
      {children}
      {links.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1 border-t border-border/50 pt-1.5">
          {[...externalLinks, ...actions].map((link) => {
            const external = externalLinks.includes(link);
            return (
              <Button
                key={link.action}
                asChild={Boolean(link.href)}
                type={link.href ? undefined : 'button'}
                variant="outline"
                size="2xs"
                data-action={link.action}
                onClick={(event: React.MouseEvent<HTMLElement>) => onAction?.(link.action, event)}
              >
                {link.href ? (
                  <a
                    href={link.href}
                    target={external ? '_blank' : undefined}
                    rel={external ? 'noopener noreferrer' : undefined}
                  >
                    {link.label} {external ? '↗' : '→'}
                  </a>
                ) : (
                  <>{link.label} →</>
                )}
              </Button>
            );
          })}
        </div>
      )}
    </section>
  );
}
