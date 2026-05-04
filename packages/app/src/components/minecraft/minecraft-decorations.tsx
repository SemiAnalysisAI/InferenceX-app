'use client';

import { useEffect, useState } from 'react';

/**
 * Decorative Minecraft asset PNGs scattered around the viewport corners,
 * plus a one-shot Ender Dragon fly-across at theme activation. Only renders
 * while the minecraft theme is active. Watches `document.documentElement`
 * class changes via a MutationObserver so it appears / disappears live with
 * the mode-toggle (mirrors `minecraft-toggles.tsx`).
 *
 * All static images are `pointer-events: none` at low z-index. The dragon is
 * absolutely positioned and flies right-to-left once per theme activation
 * (animation-iteration-count: 1) — the GIF's wing-flap plays during the
 * traversal so the entrance feels alive.
 *
 * Asset provenance: minecraft.wiki (CC BY-NC-SA 3.0) for blocks/items/dragon.
 */
const DECORATIONS = [
  // Top-left: Zombified Piglin, mirrored so its sword arm points toward the
  // middle of the screen rather than off-screen left. Keep the original
  // -6deg tilt — flipping over X also flips the rotate direction visually,
  // which lands as a slight forward lean toward the chart area.
  {
    src: '/decorative/minecraft/zombified-piglin.png',
    alt: 'Zombified Piglin',
    style: {
      top: '5rem',
      left: '0.5rem',
      width: 'min(110px, 9vw)',
      transform: 'scaleX(-1) rotate(-6deg)',
    },
  },
  // Top-right: Diamond pickaxe, mining vibe.
  {
    src: '/decorative/minecraft/diamond-pickaxe.png',
    alt: 'Diamond pickaxe',
    style: {
      top: '5rem',
      right: '0.5rem',
      width: 'min(110px, 9vw)',
      transform: 'rotate(35deg)',
    },
  },
  // Bottom-left: Grass block, classic anchor.
  {
    src: '/decorative/minecraft/grass-block.png',
    alt: 'Grass block',
    style: {
      bottom: '4rem',
      left: '0.5rem',
      width: 'min(110px, 9vw)',
      transform: 'rotate(-4deg)',
    },
  },
  // Bottom-mid-left: TNT, ready to go boom.
  {
    src: '/decorative/minecraft/tnt.png',
    alt: 'TNT',
    style: {
      bottom: '4rem',
      left: '20%',
      width: 'min(95px, 8vw)',
      transform: 'rotate(6deg)',
    },
  },
  // Bottom-right: Diamond, the loot.
  {
    src: '/decorative/minecraft/diamond.png',
    alt: 'Diamond',
    style: {
      bottom: '4rem',
      right: '0.5rem',
      width: 'min(95px, 8vw)',
      transform: 'rotate(-6deg)',
    },
  },
] as const;

export function MinecraftDecorations() {
  const [active, setActive] = useState(false);
  // Bumps each time the theme is (re)activated, used as the React key on the
  // dragon `<img>` to force-remount and re-trigger the CSS fly-across.
  const [dragonNonce, setDragonNonce] = useState(0);

  useEffect(() => {
    let wasMinecraft = document.documentElement.classList.contains('minecraft');
    setActive(wasMinecraft);
    if (wasMinecraft) setDragonNonce((n) => n + 1);

    const check = () => {
      const isMinecraft = document.documentElement.classList.contains('minecraft');
      setActive(isMinecraft);
      // Re-trigger the dragon only on a transition off→on, not on every
      // unrelated class change.
      if (isMinecraft && !wasMinecraft) setDragonNonce((n) => n + 1);
      wasMinecraft = isMinecraft;
    };

    const observer = new MutationObserver(check);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);

  if (!active) return null;

  return (
    <>
      <div
        aria-hidden="true"
        className="hidden lg:block fixed inset-0 pointer-events-none z-0 overflow-hidden"
      >
        {DECORATIONS.map((d) => (
          <img
            key={d.src}
            src={d.src}
            alt={d.alt}
            className="absolute opacity-70 [image-rendering:pixelated] drop-shadow-[0_0_14px_rgba(0,0,0,0.45)]"
            style={d.style}
          />
        ))}
      </div>

      {/* One-shot Ender Dragon fly-across. Keyed on dragonNonce so it
       * remounts (and the CSS animation re-plays) every theme activation. */}
      <div
        aria-hidden="true"
        className="hidden md:block fixed inset-0 pointer-events-none z-0 overflow-hidden"
      >
        <img
          key={dragonNonce}
          src="/decorative/minecraft/ender-dragon.gif"
          alt=""
          className="absolute top-[15%] [image-rendering:pixelated] drop-shadow-[0_0_24px_rgba(160,80,200,0.55)] mc-dragon-flyacross"
          style={{ width: 'min(280px, 22vw)' }}
        />
      </div>

      <div className="hidden lg:block fixed bottom-1 right-2 z-0 text-[10px] text-foreground/50 text-right leading-tight">
        <div>
          art:{' '}
          <a
            href="https://minecraft.wiki/"
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:text-foreground"
          >
            minecraft.wiki
          </a>
        </div>
        <div>
          <a
            href="https://creativecommons.org/licenses/by-nc-sa/3.0/"
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:text-foreground"
          >
            CC BY-NC-SA 3.0
          </a>
        </div>
      </div>
    </>
  );
}
