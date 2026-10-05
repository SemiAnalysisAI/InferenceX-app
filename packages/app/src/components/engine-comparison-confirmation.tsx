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
      'By continuing to display vLLM & SGLang on the same hardware SKU, I agree not to use this comparison to start vLLM vs SGLang drama on twitter or XHS or other forums',
    cancel: 'Cancel',
    confirm: 'I agree, show both',
  },
  zh: {
    title: '同时显示同一 SKU 上的 vLLM 和 SGLang？',
    description:
      '继续显示同一硬件 SKU 上的 vLLM 和 SGLang，即表示我同意不利用这组对比在 Twitter、小红书或其他论坛上挑起 vLLM 与 SGLang 之间的争论。',
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
          <DialogTitle className="pr-6">{t.title}</DialogTitle>
          <DialogDescription>{t.description}</DialogDescription>
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
