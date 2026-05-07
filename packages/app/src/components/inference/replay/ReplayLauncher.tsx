'use client';

import dynamic from 'next/dynamic';
import { useState } from 'react';
import { Film } from 'lucide-react';

import type { ChartDefinition } from '@/components/inference/types';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { track } from '@/lib/analytics';

const ReplayPanel = dynamic(() => import('./ReplayPanel'), {
  ssr: false,
  loading: () => <Skeleton className="h-[640px] w-full" />,
});

interface ReplayLauncherProps {
  parentChartId: string;
  chartDefinition: ChartDefinition;
  yLabel: string;
  xLabel: string;
}

/**
 * Tiny eager button that, on first click, dynamically imports the replay panel
 * and mounts it inside a modal Dialog. Keeps mp4-muxer, html-to-image, and the
 * replay controller out of the main inference bundle until a user opts in.
 */
export default function ReplayLauncher({
  parentChartId,
  chartDefinition,
  yLabel,
  xLabel,
}: ReplayLauncherProps) {
  const [open, setOpen] = useState(false);

  const handleOpen = () => {
    setOpen(true);
    track('inference_replay_opened', {
      chartId: parentChartId,
      chartType: chartDefinition.chartType,
    });
  };

  return (
    <>
      <div className="flex justify-end mt-3 pt-3 border-t border-border/60">
        <Button
          size="sm"
          variant="ghost"
          onClick={handleOpen}
          data-testid={`replay-launcher-${parentChartId}`}
          className="gap-1 text-muted-foreground hover:text-foreground"
        >
          <Film className="size-4" />
          Replay over time
        </Button>
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          className="max-w-[min(1280px,95vw)] w-[min(1280px,95vw)] max-h-[92vh] overflow-y-auto p-0 sm:rounded-lg"
          data-testid={`replay-dialog-${parentChartId}`}
        >
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
    </>
  );
}
