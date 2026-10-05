'use client';

import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { useLocale } from '@/lib/use-locale';
import { HeistGame } from './heist-game';

export default function GtaHeistDialog({ onClose }: { onClose: () => void }) {
  const locale = useLocale();
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent
        className="heist-dialog"
        overlayClassName="heist-dialog-overlay"
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          document.querySelector<HTMLButtonElement>('[data-testid="gta-heist-launch"]')?.focus();
        }}
      >
        <DialogTitle className="sr-only">
          {locale === 'zh' ? '湾区劫案' : 'Bay Area Heist'}
        </DialogTitle>
        <DialogDescription className="sr-only">
          {locale === 'zh'
            ? '虚构的湾区驾驶游戏。Escape 关闭游戏并返回仪表板。'
            : 'A fictional Bay Area driving game. Escape closes the game and returns to the dashboard.'}
        </DialogDescription>
        <HeistGame locale={locale} />
      </DialogContent>
    </Dialog>
  );
}
