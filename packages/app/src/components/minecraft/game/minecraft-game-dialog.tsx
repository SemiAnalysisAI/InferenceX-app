'use client';

import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { useLocale } from '@/lib/i18n/use-locale';
import { MinecraftGame } from './minecraft-game';

type EscapeHost = HTMLElement & { mcEscape?: () => boolean };

export default function MinecraftGameDialog({ onClose }: { onClose: () => void }) {
  const locale = useLocale();
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent
        className="mc-dialog"
        overlayClassName="mc-dialog-overlay"
        onEscapeKeyDown={(event) => {
          // In-game, Escape closes screens and toggles the pause menu instead of the dialog.
          const host = document.querySelector<EscapeHost>('[data-testid="minecraft-game"]');
          if (host?.mcEscape?.()) event.preventDefault();
        }}
        onPointerDownOutside={(event) => {
          // Pointer lock and inventory drags can land outside; never close on stray clicks mid-game.
          const host = document.querySelector<HTMLElement>('[data-testid="minecraft-game"]');
          if (host?.dataset.status === 'playing' || host?.dataset.status === 'loading')
            event.preventDefault();
        }}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          document.querySelector<HTMLButtonElement>('[data-testid="minecraft-launch"]')?.focus();
        }}
      >
        <DialogTitle className="sr-only">Minecraft</DialogTitle>
        <DialogDescription className="sr-only">
          {locale === 'zh'
            ? '可游玩的 Minecraft：生存与创造模式、无限地形、合成、熔炼、生物和本地存档。在标题屏幕按 Escape 返回仪表板。'
            : 'Playable Minecraft with survival and creative modes, infinite terrain, crafting, smelting, mobs and local saves. Escape on the title screen returns to the dashboard.'}
        </DialogDescription>
        <MinecraftGame locale={locale} onExit={onClose} />
      </DialogContent>
    </Dialog>
  );
}
