'use client';

import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { useLocale } from '@/lib/use-locale';
import { GtaGame } from './gta-game';

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
          {locale === 'zh' ? 'Los Santos 夜行' : 'Los Santos After Hours'}
        </DialogTitle>
        <DialogDescription className="sr-only">
          {locale === 'zh'
            ? '使用 GTA V 资源的 3D 城市沙盒。Escape 关闭游戏并返回仪表板。'
            : 'A 3D city sandbox using GTA V assets. Escape closes the game and returns to the dashboard.'}
        </DialogDescription>
        <GtaGame locale={locale} />
      </DialogContent>
    </Dialog>
  );
}
