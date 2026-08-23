'use client';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ServerLogViewer } from '@/components/inference/agentic-point/server-log-viewer';
import { useLocale } from '@/lib/use-locale';

const STRINGS = {
  en: {
    title: 'Benchmark logs',
    description: 'Stored runtime logs for this fixed-sequence benchmark point.',
  },
  zh: {
    title: '基准测试日志',
    description: '该固定序列长度基准测试数据点的已存储运行时日志。',
  },
} as const;

interface Props {
  pointId: number | null;
  onOpenChange: (open: boolean) => void;
}

export function FixedSequenceLogDialog({ pointId, onOpenChange }: Props) {
  const t = STRINGS[useLocale()];

  return (
    <Dialog open={pointId !== null} onOpenChange={onOpenChange}>
      <DialogContent
        className="flex max-h-[94vh] w-[min(96vw,80rem)] max-w-[min(96vw,80rem)] flex-col gap-3 overflow-y-auto p-3 sm:p-5"
        data-testid="fixed-sequence-log-dialog"
      >
        <DialogHeader className="sr-only">
          <DialogTitle>{t.title}</DialogTitle>
          <DialogDescription>{t.description}</DialogDescription>
        </DialogHeader>
        {pointId === null ? null : (
          <ServerLogViewer id={pointId} enabled analyticsContext="fixed-sequence" />
        )}
      </DialogContent>
    </Dialog>
  );
}
