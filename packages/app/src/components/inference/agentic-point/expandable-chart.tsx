'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Maximize2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { track } from '@/lib/analytics/analytics';
import { useDialogCloseTracking } from '@/lib/analytics/use-dialog-close-tracking';
import { useLocale } from '@/lib/i18n/use-locale';

import { CHART_SIZES } from './chart-shared';

export function ExpandableChart({
  title,
  render,
  controls,
  testId,
}: {
  title: string;
  render: (size: { width: number; height: number }) => ReactNode;
  controls?: ReactNode;
  testId?: string;
}) {
  const [open, setOpen] = useState(false);
  useDialogCloseTracking(open, 'agentic_chart_closed', { title });
  const locale = useLocale();
  const sectionRef = useRef<HTMLElement>(null);
  const [inlineWidth, setInlineWidth] = useState<number>(CHART_SIZES.inline.width);
  useEffect(() => {
    const section = sectionRef.current;
    if (!section || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(([entry]) => {
      const width = Math.round(entry?.contentRect.width ?? 0);
      if (width > 0) setInlineWidth(Math.min(width, CHART_SIZES.inline.width));
    });
    observer.observe(section);
    return () => observer.disconnect();
  }, []);

  return (
    <section ref={sectionRef} className="min-w-0" data-testid={testId}>
      <div className="mb-3 flex min-h-8 flex-wrap items-center justify-between gap-2">
        <h2 className="min-w-0 text-sm font-medium text-foreground">{title}</h2>
        <div className="ml-auto flex items-center gap-2">
          {controls}
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            aria-label={locale === 'zh' ? '展开图表' : 'Expand chart'}
            onClick={() => {
              track('agentic_chart_expanded', { title });
              setOpen(true);
            }}
            className="text-muted-foreground hover:text-foreground"
          >
            <Maximize2 />
          </Button>
        </div>
      </div>
      {render({ width: inlineWidth, height: CHART_SIZES.inline.height })}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-[min(96vw,1400px)] w-[min(96vw,1400px)]">
          <DialogHeader>
            <div className="flex items-center justify-between gap-3 pr-8">
              <DialogTitle>{title}</DialogTitle>
              {controls}
            </div>
          </DialogHeader>
          <div className="w-full">{render(CHART_SIZES.expanded)}</div>
        </DialogContent>
      </Dialog>
    </section>
  );
}
