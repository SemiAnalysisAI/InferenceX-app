'use client';

import dynamic from 'next/dynamic';
import { forwardRef, useImperativeHandle, useState } from 'react';

import type { ChartDefinition } from '@/components/inference/types';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';

// Keep this in sync with REPLAY_HEIGHT + padding/header/controls in ReplayPanel
// so the dialog doesn't resize as the panel transitions through its loading states.
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

/**
 * Owns its own open state so callers only need a ref + .open() call instead of
 * a controlled boolean per chart instance. The dialog mounts the panel lazily,
 * keeping mp4-muxer and html-to-image out of the main inference bundle.
 */
const ReplayLauncher = forwardRef<ReplayLauncherHandle, ReplayLauncherProps>(
  function ReplayLauncher({ parentChartId, chartDefinition, yLabel, xLabel }, ref) {
    const [open, setOpen] = useState(false);
    useImperativeHandle(ref, () => ({ open: () => setOpen(true) }), []);
    return (
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          className="max-w-[min(1280px,95vw)] w-[min(1280px,95vw)] max-h-[92vh] overflow-y-auto p-0 sm:rounded-lg"
          data-testid={`replay-dialog-${parentChartId}`}
        >
          <DialogTitle className="sr-only">Replay over time</DialogTitle>
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
