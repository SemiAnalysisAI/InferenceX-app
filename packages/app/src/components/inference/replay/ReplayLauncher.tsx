'use client';

import dynamic from 'next/dynamic';

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
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Controlled dialog that mounts the replay panel lazily. Keeps mp4-muxer,
 * html-to-image, and the replay controller out of the main inference bundle
 * until the parent opens this dialog (typically from the export menu's MP4
 * entry).
 */
export default function ReplayLauncher({
  parentChartId,
  chartDefinition,
  yLabel,
  xLabel,
  open,
  onOpenChange,
}: ReplayLauncherProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
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
}
