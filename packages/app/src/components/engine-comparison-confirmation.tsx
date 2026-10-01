'use client';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useLocale } from '@/lib/use-locale';

const STRINGS = {
  en: {
    title: 'Compare vLLM and SGLang on the same SKU?',
    description:
      'These results use different inference implementations. The winner can change with the workload, metric, and operating range. Showing both is not a claim that either engine is universally better.',
    agreement: 'By continuing, I agree not to use this comparison to start vLLM vs SGLang drama.',
    cancel: 'Cancel',
    confirm: 'I agree, show both',
  },
  zh: {
    title: '同时显示同一 SKU 上的 vLLM 和 SGLang？',
    description:
      '这些结果使用不同的推理实现。性能优劣会随工作负载、指标和运行区间而变化。同时显示两者，并不代表某个引擎在所有情况下都更好。',
    agreement: '继续即表示我同意，不利用这组对比挑起 vLLM 与 SGLang 之间的争论。',
    cancel: '取消',
    confirm: '我同意，同时显示',
  },
} as const;

export function EngineComparisonConfirmation({
  open,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const t = STRINGS[useLocale()];
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onCancel();
      }}
    >
      <DialogContent
        data-testid="engine-comparison-confirmation"
        className="z-70 max-w-[calc(100%-2rem)] sm:max-w-lg"
        overlayClassName="z-60"
      >
        <DialogHeader>
          <DialogTitle>{t.title}</DialogTitle>
          <DialogDescription>
            {t.description} {t.agreement}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={onCancel} autoFocus>
            {t.cancel}
          </Button>
          <Button onClick={onConfirm}>{t.confirm}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
