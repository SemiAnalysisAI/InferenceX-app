'use client';

import { usePathname } from 'next/navigation';
import { useEasterEggTheme } from '@/lib/use-easter-egg-theme';
import { useLocale } from '@/lib/use-locale';
import { track } from '@/lib/analytics';

const STRINGS = {
  en: {
    play: 'Play CS:GO',
    detail: '1 human + 9 bots · Development build',
    notice: 'Play here on InferenceX. Desktop keyboard and mouse required.',
  },
  zh: {
    play: '试玩 CS:GO',
    detail: '1 名真人 + 9 名机器人 · 开发版本',
    notice: '直接在 InferenceX 内游玩，需要桌面键盘和鼠标。',
  },
} as const;

export function CsgoThemeBanner() {
  const theme = useEasterEggTheme();
  const pathname = usePathname();
  const locale = useLocale();
  if (theme !== 'csgo') return null;
  const landing = pathname === '/' || pathname === '/zh' || pathname === '/zh/';
  const t = STRINGS[locale];

  return (
    <div className="container mx-auto px-4 lg:px-8" data-testid="csgo-theme-banner">
      {/* Do not hold a dashboard transition snapshot across the heavy WebGL document load. */}
      {landing && <style>{'@view-transition { navigation: none; }'}</style>}
      <div className="csgo-theme-banner">
        <img
          src="/decorative/csgo/csgo-logo.webp"
          alt="Counter-Strike: Global Offensive"
          width={243}
          height={69}
          decoding="async"
        />
        {landing ? (
          <div className="csgo-game-launcher">
            <span className="text-xs font-mono tracking-eyebrow text-primary">DUST II</span>
            <span>{t.detail}</span>
            {/* A native link neither prefetches the game nor mounts an iframe in the dashboard. */}
            <a
              href={`/games/csgo?lang=${locale}`}
              rel="nofollow"
              data-testid="csgo-game-launch"
              aria-describedby="csgo-game-access"
              onClick={() => track('csgo_game_opened', { surface: 'landing', locale })}
            >
              {t.play}
            </a>
            <small id="csgo-game-access">{t.notice}</small>
          </div>
        ) : (
          <span className="text-xs font-mono tracking-eyebrow text-primary">DUST II</span>
        )}
      </div>
    </div>
  );
}

/**
 * Share the selection/SSR/embed boundary with the parent loader.
 */
export function CsgoDecorations() {
  const theme = useEasterEggTheme();
  if (theme !== 'csgo') return null;

  return (
    <div className="csgo-scene" data-testid="csgo-scene" aria-hidden="true">
      <picture>
        <source media="(max-width: 640px)" srcSet="/decorative/csgo/dust2-mobile.webp" />
        <img
          className="csgo-scene-image"
          src="/decorative/csgo/dust2.webp"
          alt=""
          width={1920}
          height={1200}
          decoding="async"
          draggable={false}
        />
      </picture>
      <div className="csgo-scene-shade" />
    </div>
  );
}
