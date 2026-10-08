'use client';

import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { useLocale } from '@/lib/use-locale';
import { KartGame } from './kart-game';

export default function KartDialog({ onClose }: { onClose: () => void }) {
  const locale = useLocale();
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent
        className="kart-dialog"
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          document.querySelector<HTMLButtonElement>('[data-testid="kart-launch"]')?.focus();
        }}
      >
        <DialogTitle className="sr-only">Mario Kart · Luigi Circuit</DialogTitle>
        <DialogDescription className="sr-only">
          {locale === 'zh'
            ? '三圈 3D 街机竞速。Escape 关闭比赛并返回仪表板。'
            : 'A three-lap 3D arcade race. Escape closes the race and returns to the dashboard.'}
        </DialogDescription>
        <KartGame locale={locale} />
      </DialogContent>
    </Dialog>
  );
}
