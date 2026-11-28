'use client';

import { useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { usePathname } from 'next/navigation';

import { track } from '@/lib/analytics/analytics';
import { useLocale } from '@/lib/i18n/use-locale';

import {
  ADVANCEMENT_COUNT,
  ADVANCEMENT_EVENT,
  DIMENSION_EVENT,
  DIMENSIONS,
  LINE_EVENT,
  LINE_INDEX,
  LINES,
  LINES_EVENT,
  readAdvancements,
  readLinesHeard,
  readDimension,
  type Dimension,
} from './minecraft-site';
import { SPLASHES, SPLASHES_ZH } from './minecraft-splash-text';

const SPLASH_KEY = 'minecraft-splash';

const MinecraftGameDialog = dynamic(() => import('./game/minecraft-game-dialog'), { ssr: false });

const STRINGS = {
  en: {
    tagline: 'SURVIVAL · CREATIVE · INFINITE WORLDS · CRAFTING',
    play: 'Play Minecraft',
    dimensions: 'Site palette',
    dimension: { overworld: 'Overworld', nether: 'Nether', end: 'The End' },
    advancements: (n: number, total: number) => `Advancements ${n}/${total}`,
    worlds: (n: number) => (n === 1 ? '1 saved world' : `${n} saved worlds`),
    noWorlds: 'No worlds yet',
    dragon: 'Ender Dragon defeated',
    steve: 'Steve: say hello',
    villager: 'Villager: ask about the trade-off',
    enderman: 'Enderman: do not look it in the eyes',
    eyes: 'Something in the dark is watching',
    lines: (n: number, total: number) => `Lines heard ${n}/${total}`,
  },
  zh: {
    tagline: '生存 · 创造 · 无限世界 · 合成与熔炼',
    play: '开始游戏',
    dimensions: '网站配色',
    dimension: { overworld: '主世界', nether: '下界', end: '末地' },
    advancements: (n: number, total: number) => `进度 ${n}/${total}`,
    worlds: (n: number) => `${n} 个已保存世界`,
    noWorlds: '还没有世界',
    dragon: '已击败末影龙',
    steve: 'Steve：打个招呼',
    villager: '村民：问问权衡',
    enderman: '末影人：别和它对视',
    eyes: '黑暗里有东西在看着你',
    lines: (n: number, total: number) => `已听到的台词 ${n}/${total}`,
  },
};

interface WorldSummary {
  worlds: number;
  dragon: boolean;
}

/** Reads the game's save index without importing game code, so the banner stays small. */
function readWorlds(): WorldSummary {
  try {
    const list = JSON.parse(localStorage.getItem('inferencex-minecraft-worlds') ?? '[]') as {
      id?: string;
    }[];
    if (!Array.isArray(list)) return { worlds: 0, dragon: false };
    const dragon = list.some((world) =>
      (localStorage.getItem(`inferencex-minecraft-world-${world.id}`) ?? '').includes(
        '"dragonDefeated":true',
      ),
    );
    return { worlds: list.length, dragon };
  } catch {
    return { worlds: 0, dragon: false };
  }
}

function sayLine(id: 'steve' | 'villager' | 'enderman') {
  window.dispatchEvent(new CustomEvent(LINE_EVENT, { detail: { id } }));
}

export function MinecraftPlayBanner() {
  const locale = useLocale();
  const pathname = usePathname() ?? '/';
  const t = STRINGS[locale];
  const compact = !/^\/(?:zh\/?)?$/.test(pathname);
  const [open, setOpen] = useState(false);
  const [dimension, setDimension] = useState<Dimension>('overworld');
  const [earned, setEarned] = useState(0);
  const [worlds, setWorlds] = useState<WorldSummary>({ worlds: 0, dragon: false });
  const [splash, setSplash] = useState(0);
  const [enderSpot, setEnderSpot] = useState(0);
  const [heard, setHeard] = useState<Set<string>>(new Set());

  useEffect(() => {
    setDimension(readDimension());
    setEarned(readAdvancements().size);
    setWorlds(readWorlds());
    // Every visit shows the next splash in the list, as the title screen does on each launch.
    let next = Math.floor(Math.random() * 1000);
    try {
      const seen = Number(localStorage.getItem(SPLASH_KEY));
      if (Number.isFinite(seen) && localStorage.getItem(SPLASH_KEY) !== null) next = seen + 1;
      localStorage.setItem(SPLASH_KEY, String(next % 1000));
    } catch {}
    setSplash(next);
    const onAdvancement = () => setEarned(readAdvancements().size);
    const onLines = () => setHeard(readLinesHeard());
    onLines();
    window.addEventListener(ADVANCEMENT_EVENT, onAdvancement);
    window.addEventListener(LINES_EVENT, onLines);
    return () => {
      window.removeEventListener(ADVANCEMENT_EVENT, onAdvancement);
      window.removeEventListener(LINES_EVENT, onLines);
    };
  }, []);

  // Any route change, browser Back included, closes the game; its unmount stops the loop,
  // releases audio and pointer lock, and gives scroll back.
  const openedOn = useRef(pathname);
  useEffect(() => {
    if (open && openedOn.current !== pathname) setOpen(false);
    openedOn.current = pathname;
  }, [open, pathname]);
  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    window.addEventListener('popstate', close);
    return () => window.removeEventListener('popstate', close);
  }, [open]);

  const splashes = locale === 'zh' ? SPLASHES_ZH : SPLASHES;
  const pick = (dim: Dimension) => {
    setDimension(dim);
    window.dispatchEvent(new CustomEvent(DIMENSION_EVENT, { detail: dim }));
    track('minecraft_dimension_selected', { dimension: dim });
  };

  return (
    <div className="container mx-auto px-4 lg:px-8" data-testid="minecraft-play-banner">
      <div className="mc-play-banner" data-compact={compact ? 'true' : undefined}>
        <div className="mc-play-banner-title">
          <img src="/decorative/minecraft/game/title.png" alt="Minecraft" width={256} height={64} />
          <span className="mc-splash" aria-hidden="true">
            {splashes[splash % splashes.length]}
          </span>
          <strong>{t.tagline}</strong>
          <span className="mc-play-banner-world">
            {worlds.worlds ? t.worlds(worlds.worlds) : t.noWorlds}
            {worlds.dragon && (
              <>
                {' · '}
                <b>{t.dragon}</b>
              </>
            )}
          </span>
        </div>
        <div className="mc-mobs">
          <button
            type="button"
            data-testid="minecraft-mob-steve"
            aria-label={t.steve}
            onClick={() => sayLine('steve')}
          >
            <img src="/decorative/minecraft/ip/steve.webp" alt="" width={58} height={120} />
          </button>
          <button
            type="button"
            data-testid="minecraft-mob-villager"
            aria-label={t.villager}
            onClick={() => sayLine('villager')}
            onPointerEnter={(event) => {
              if (event.pointerType === 'mouse') sayLine('villager');
            }}
          >
            <img src="/decorative/minecraft/ip/villager.webp" alt="" width={60} height={120} />
          </button>
          <img src="/decorative/minecraft/ip/alex.webp" alt="" width={58} height={120} />
          {!compact && (
            <button
              type="button"
              className="mc-herobrine-eyes"
              data-testid="minecraft-herobrine-eyes"
              aria-label={t.eyes}
            >
              <span aria-hidden="true" />
            </button>
          )}
          <img src="/decorative/minecraft/ip/creeper.webp" alt="" width={59} height={120} />
          <button
            type="button"
            className="mc-mobs-enderman"
            data-testid="minecraft-mob-enderman"
            data-spot={enderSpot}
            aria-label={t.enderman}
            onClick={() => {
              setEnderSpot((spot) => (spot + 1) % 3);
              sayLine('enderman');
            }}
            onPointerEnter={(event) => {
              if (event.pointerType !== 'mouse') return;
              setEnderSpot((spot) => (spot + 1) % 3);
              sayLine('enderman');
            }}
          >
            <img src="/decorative/minecraft/ip/enderman.webp" alt="" width={114} height={120} />
          </button>
          <img
            className="mc-mobs-jockey"
            src="/decorative/minecraft/ip/chicken-jockey.webp"
            alt=""
            width={60}
            height={120}
          />
        </div>
        <div className="mc-play-banner-side">
          <div className="mc-dimensions" role="group" aria-label={t.dimensions}>
            {DIMENSIONS.map((dim) => (
              <button
                key={dim}
                type="button"
                data-dim={dim}
                aria-pressed={dimension === dim}
                title={t.dimension[dim]}
                onClick={() => pick(dim)}
              >
                <span className="mc-dim-label">{t.dimension[dim]}</span>
              </button>
            ))}
          </div>
          <div className="mc-xp">
            <span className="mc-xp-bar" aria-hidden="true">
              <span style={{ width: `${(earned / ADVANCEMENT_COUNT) * 100}%` }} />
            </span>
            <span>{t.advancements(earned, ADVANCEMENT_COUNT)}</span>
          </div>
          <details className="mc-lines" data-testid="minecraft-lines-index">
            <summary>{t.lines(heard.size, LINE_INDEX.length)}</summary>
            <ol>
              {LINE_INDEX.map((id) => (
                <li key={id} data-heard={heard.has(id) ? 'true' : undefined}>
                  {heard.has(id) ? LINES[id][locale].replace(/[^.!。！）]*%s.*$/, '') : '▒▒▒▒▒▒'}
                </li>
              ))}
            </ol>
          </details>
          <button
            type="button"
            data-testid="minecraft-launch"
            onClick={() => {
              setOpen(true);
              track('minecraft_game_opened');
            }}
          >
            {t.play}
          </button>
        </div>
      </div>
      {open && (
        <MinecraftGameDialog
          onClose={() => {
            setOpen(false);
            setWorlds(readWorlds());
            track('minecraft_game_closed');
          }}
        />
      )}
    </div>
  );
}
