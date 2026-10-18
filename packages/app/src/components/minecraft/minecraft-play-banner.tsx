'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';

import { track } from '@/lib/analytics/analytics';
import { useLocale } from '@/lib/i18n/use-locale';

const MinecraftGameDialog = dynamic(() => import('./game/minecraft-game-dialog'), { ssr: false });

/** Launcher for the playable game; the game bundle and assets load only after a click. */
export function MinecraftPlayBanner() {
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  return (
    <div className="container mx-auto px-4 lg:px-8" data-testid="minecraft-play-banner">
      <div className="mc-play-banner">
        <div className="mc-play-banner-title">
          <img src="/decorative/minecraft/game/title.png" alt="Minecraft" width={256} height={64} />
          <strong>
            {locale === 'zh'
              ? '生存 · 创造 · 无限世界 · 合成与熔炼'
              : 'SURVIVAL · CREATIVE · INFINITE WORLDS · CRAFTING'}
          </strong>
        </div>
        <button
          type="button"
          data-testid="minecraft-launch"
          onClick={() => {
            setOpen(true);
            track('minecraft_game_opened');
          }}
        >
          {locale === 'zh' ? '开始游戏' : 'Play Minecraft'}
        </button>
      </div>
      {open && (
        <MinecraftGameDialog
          onClose={() => {
            setOpen(false);
            track('minecraft_game_closed');
          }}
        />
      )}
    </div>
  );
}
