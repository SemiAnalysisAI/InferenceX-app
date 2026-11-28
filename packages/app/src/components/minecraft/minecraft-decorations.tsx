'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

const DECORATIONS = [
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
  const [dragonNonce, setDragonNonce] = useState(0);
  const [banner, setBanner] = useState<Element | null>(null);
  const [footer, setFooter] = useState<Element | null>(null);

  // The art credit sits in the stock footer, in the page flow, so no card can cover it.
  useEffect(() => {
    if (!active) return;
    const find = () => setFooter(document.querySelector('footer[data-testid="footer"]'));
    find();
    const timer = window.setInterval(find, 1500);
    return () => window.clearInterval(timer);
  }, [active]);

  // The dragon flies through the banner's sky, behind its content, not across the page.
  useEffect(() => {
    if (!active) return;
    const find = () => setBanner(document.querySelector('.mc-play-banner'));
    find();
    const timer = window.setTimeout(find, 900);
    return () => window.clearTimeout(timer);
  }, [active, dragonNonce]);

  useEffect(() => {
    let wasMinecraft = document.documentElement.classList.contains('minecraft');
    setActive(wasMinecraft);
    if (wasMinecraft) setDragonNonce((n) => n + 1);

    const check = () => {
      const isMinecraft = document.documentElement.classList.contains('minecraft');
      setActive(isMinecraft);
      if (isMinecraft && !wasMinecraft) setDragonNonce((n) => n + 1);
      wasMinecraft = isMinecraft;
    };

    const observer = new MutationObserver(check);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (dragonNonce === 0) return;
    if (localStorage.getItem('minecraft-sound') === 'false') return;
    // No sound before a user gesture.
    if (!(navigator.userActivation?.hasBeenActive ?? false)) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const audio = new Audio('/decorative/minecraft/ender-dragon.mp3');
    audio.volume = 0.25;
    const timeout = window.setTimeout(() => {
      audio.play().catch(() => {});
    }, 4200);
    return () => {
      window.clearTimeout(timeout);
      audio.pause();
      audio.src = '';
    };
  }, [dragonNonce]);

  if (!active) return null;

  return (
    <>
      <div
        aria-hidden="true"
        data-mc-props=""
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

      {banner?.isConnected &&
        createPortal(
          <div aria-hidden="true" className="mc-dragon-sky">
            <img
              key={dragonNonce}
              src="/decorative/minecraft/ender-dragon.gif"
              alt=""
              className="mc-dragon-flyacross"
            />
          </div>,
          banner,
        )}

      {footer?.isConnected &&
        createPortal(
          <p
            data-mc-credit=""
            className="container mx-auto px-4 pb-4 text-xs text-muted-foreground lg:px-8"
          >
            art:{' '}
            <a
              href="https://minecraft.wiki/"
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-foreground"
            >
              minecraft.wiki
            </a>
            {' · '}
            <a
              href="https://creativecommons.org/licenses/by-nc-sa/3.0/"
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-foreground"
            >
              CC BY-NC-SA 3.0
            </a>
          </p>,
          footer,
        )}
    </>
  );
}
