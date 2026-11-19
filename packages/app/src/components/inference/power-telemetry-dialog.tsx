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
import { isPersistedBenchmarkId } from '@/lib/benchmarks/benchmark-id';
import { getInferenceHardwareConfig } from '@/lib/benchmarks/inference-labels';
import { getDisplayLabel } from '@/lib/shared/utils';
import { useLocale } from '@/lib/i18n/use-locale';

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
            <span className="font-medium text-foreground">
              {getDisplayLabel(
                getInferenceHardwareConfig(String(point.hwKey), point.model, [point]),
              )}
            </span>{' '}
            · {point.precision.toUpperCase()} · {t.concurrency} {point.conc} ·{' '}
            <span title={String(point.hwKey)}>
              {t.point} #{point.id}
            </span>
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
