'use client';

import { X } from 'lucide-react';
import type * as React from 'react';
import { useEffect, useRef } from 'react';

import { Button } from '@/components/ui/button';
import { Stat } from '@/components/ui/stat';
import type { PointDetailAction, PointDetails } from '@/components/inference/utils/tooltipUtils';
import { useLocale } from '@/lib/i18n/use-locale';
import { cn } from '@/lib/shared/utils';

const STRINGS = {
  en: { title: 'Point details', close: 'Close point details' },
  zh: { title: '数据点详情', close: '关闭数据点详情' },
} as const;

const LINK_CLASS =
  'cursor-pointer font-medium text-foreground underline decoration-muted-foreground/50 underline-offset-4 hover:decoration-foreground';

interface PointDetailsPanelProps {
  details: PointDetails;
  color: string;
  onClose: () => void;
  onAction?: (action: PointDetailAction, event: React.MouseEvent<HTMLElement>) => void;
}

export function PointDetailsPanel({ details, color, onClose, onAction }: PointDetailsPanelProps) {
  const t = STRINGS[useLocale()];
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    ref.current?.scrollIntoView?.({ block: 'nearest' });
  }, [details]);

  return (
    <section
      ref={ref}
      data-testid="point-details-panel"
      aria-label={t.title}
      className="flex w-full flex-col rounded-lg border border-border/30 bg-background p-3.5 text-xs"
    >
      {details.unofficial && (
        <p className="mb-1 font-semibold text-destructive">{details.unofficial}</p>
      )}
      <div className="flex items-start gap-1.5">
        <span
          aria-hidden
          className="mt-1.5 size-2 shrink-0 rounded-full"
          style={{ backgroundColor: color }}
        />
        <p className="min-w-0 flex-1 text-sm font-semibold text-foreground">
          {details.title}{' '}
          <span className="font-normal text-muted-foreground">{details.subtitle}</span>
        </p>
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
      <p className="mt-0.5 tabular-nums text-muted-foreground">{details.date}</p>
      <dl className="mt-3 flex flex-wrap gap-x-5 gap-y-2">
        {details.metrics.map((metric) => (
          <Stat
            key={metric.label}
            valueFirst
            className="shrink-0 grow"
            label={<span className="block w-0 min-w-full text-xs leading-4">{metric.label}</span>}
            value={metric.value}
            valueClassName="text-lg font-semibold leading-tight"
          />
        ))}
      </dl>
      <dl className="mt-3.5 grid grid-flow-row-dense grid-cols-2 gap-x-3 gap-y-2">
        {details.rows.map((row, index) => {
          const wide = row.wide || row.value.length > 16;
          return (
            <Stat
              key={`${row.label}-${index}`}
              label={row.label}
              value={row.value}
              className={wide ? 'col-span-2' : undefined}
              valueClassName={cn(
                'mt-0.5 text-xs font-semibold',
                wide && 'whitespace-normal [overflow-wrap:anywhere]',
              )}
            />
          );
        })}
      </dl>
      {details.powerHtml && (
        <div className="mt-3" dangerouslySetInnerHTML={{ __html: details.powerHtml }} />
      )}
      {details.image && (
        <p className="mt-3 break-all whitespace-pre-line text-2xs text-muted-foreground">
          {details.image}
        </p>
      )}
      {details.links.length > 0 && (
        <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-border/50 pt-2.5">
          {details.links.map((link) =>
            link.href ? (
              <a
                key={link.action}
                data-action={link.action}
                href={link.href}
                target={link.action === 'run' ? '_blank' : undefined}
                rel={link.action === 'run' ? 'noopener noreferrer' : undefined}
                className={LINK_CLASS}
                onClick={(event) => onAction?.(link.action, event)}
              >
                {link.label} {link.action === 'run' ? '↗' : '→'}
              </a>
            ) : (
              <button
                key={link.action}
                type="button"
                data-action={link.action}
                className={LINK_CLASS}
                onClick={(event) => onAction?.(link.action, event)}
              >
                {link.label} →
              </button>
            ),
          )}
        </div>
      )}
    </section>
  );
}
