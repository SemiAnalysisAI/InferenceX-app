'use client';

import type { InferenceData } from '@/components/inference/types';
import { PowerTelemetryView } from '@/components/inference/agentic-point/power-telemetry-view';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { isPersistedBenchmarkId } from '@/lib/benchmark-id';
import { useLocale } from '@/lib/use-locale';

const STRINGS = {
  en: { point: 'Benchmark point', concurrency: 'Concurrency' },
  zh: { point: '基准测试数据点', concurrency: '并发数' },
} as const;

interface Props {
  point: InferenceData;
  onOpenChange: (open: boolean) => void;
}

export function PowerTelemetryDialog({ point, onOpenChange }: Props) {
  const t = STRINGS[useLocale()];
  if (!isPersistedBenchmarkId(point.id)) return null;

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent
        className="flex max-h-[94vh] w-[min(96vw,80rem)] max-w-[min(96vw,80rem)] flex-col gap-3 overflow-y-auto p-3 sm:p-5"
        data-testid="power-telemetry-dialog"
      >
        <DialogHeader className="pr-6">
          <DialogTitle>PowerX</DialogTitle>
          <DialogDescription className="break-words">
            {t.point} #{point.id} · {point.hwKey} · {point.precision.toUpperCase()} ·{' '}
            {t.concurrency} {point.conc}
          </DialogDescription>
        </DialogHeader>
        <PowerTelemetryView
          id={point.id}
          enabled
          hardware={point.hw}
          serverMetricsEnabled={point.benchmark_type === 'agentic_traces'}
        />
      </DialogContent>
    </Dialog>
  );
}
