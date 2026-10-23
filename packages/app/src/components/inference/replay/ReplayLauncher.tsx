'use client';

import dynamic from 'next/dynamic';
import { forwardRef, useImperativeHandle, useState } from 'react';

import type { ChartDefinition } from '@/components/inference/types';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { useLocale } from '@/lib/i18n/use-locale';

const REPLAY_PANEL_MIN_HEIGHT = 620;

const ReplayPanel = dynamic(() => import('./ReplayPanel'), {
  ssr: false,
  loading: () => <Skeleton className="w-full" style={{ height: REPLAY_PANEL_MIN_HEIGHT }} />,
});

interface ReplayLauncherProps {
  parentChartId: string;
  chartDefinition: ChartDefinition;
  yLabel: string;
  xLabel: string;
}

export interface ReplayLauncherHandle {
  open: () => void;
}

const ReplayLauncher = forwardRef<ReplayLauncherHandle, ReplayLauncherProps>(
  ({ parentChartId, chartDefinition, yLabel, xLabel }, ref) => {
    const [open, setOpen] = useState(false);
    const locale = useLocale();
    useImperativeHandle(ref, () => ({ open: () => setOpen(true) }), []);
    return (
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          className="max-w-[min(1280px,95vw)] w-[min(1280px,95vw)] max-h-[92vh] overflow-y-auto p-0 sm:rounded-lg"
          data-testid={`replay-dialog-${parentChartId}`}
        >
          <DialogTitle className="sr-only">
            {locale === 'zh' ? '按时间回放' : 'Replay over time'}
          </DialogTitle>
          {open && (
            <ReplayPanel
              parentChartId={parentChartId}
              chartDefinition={chartDefinition}
              yLabel={yLabel}
              xLabel={xLabel}
            />
          )}
        </DialogContent>
      </Dialog>
    );
  },
);

export default ReplayLauncher;
