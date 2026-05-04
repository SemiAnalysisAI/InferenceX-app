'use client';

import { useEffect, useState } from 'react';

/**
 * Decorative Rick & Morty character PNGs scattered around the viewport
 * corners, plus a one-shot Jerry top→bottom fall at theme activation. Only
 * renders while the rick-morty theme is active. Watches
 * `document.documentElement` class changes via a MutationObserver so it
 * appears / disappears live with the mode-toggle (mirrors the pattern used
 * by `minecraft-toggles.tsx` for header buttons, and the Ender Dragon
 * fly-across in `minecraft-decorations.tsx`).
 *
 * All static images are `pointer-events: none` and sit at low z-index so
 * they never interfere with chart hover, tooltips, or scroll. The Jerry
 * GIF is absolutely positioned and falls top-to-bottom once per theme
 * activation (animation-iteration-count: 1).
 *
 * Asset provenance: pngimg.com (CC BY-NC 4.0, decorative use only) for
 * static cutouts; jerry-falling.gif from a Reddit-hosted animated GIF.
 * pickle-rick.png was alpha-cut locally from a flat opaque source whose
 * "transparent" background was a baked-in checkerboard rendered in
 * pixels — flood-fill from the borders restored real alpha.
 */
const DECORATIONS = [
  // Top-left: Rick smiling — small, peeking from the corner.
  {
    src: '/decorative/rick-morty/rick-smile.png',
    alt: 'Rick Sanchez',
    style: {
      top: '5rem',
      left: '0.5rem',
      width: 'min(110px, 9vw)',
      transform: 'rotate(-8deg)',
    },
  },
  // Top-right: Pickle Rick — taller than wide, slight tilt.
  {
    src: '/decorative/rick-morty/pickle-rick.png',
    alt: 'Pickle Rick',
    style: {
      top: '5rem',
      right: '0.5rem',
      width: 'min(110px, 9vw)',
      transform: 'rotate(8deg)',
    },
  },
  // Mid-left: Morty Inc Rick — vertical, character-rich.
  {
    src: '/decorative/rick-morty/rick-morty-inc.png',
    alt: 'Rick with Morty Inc.',
    style: {
      top: '40%',
      left: '0',
      width: 'min(140px, 11vw)',
      transform: 'rotate(-4deg)',
    },
  },
  // Bottom-left: Rick + Morty dancing.
  {
    src: '/decorative/rick-morty/rick-morty-dance.png',
    alt: 'Rick and Morty dancing',
    style: {
      bottom: '4rem',
      left: '0.5rem',
      width: 'min(150px, 12vw)',
      transform: 'rotate(4deg)',
    },
  },
  // Bottom-right: Rick + Morty stepping out of a portal.
  {
    src: '/decorative/rick-morty/rick-morty-portal.png',
    alt: 'Rick and Morty in portal',
    style: {
      bottom: '4rem',
      right: '0.5rem',
      width: 'min(160px, 12vw)',
      transform: 'rotate(-3deg)',
    },
  },
] as const;

export function RickMortyDecorations() {
  const [active, setActive] = useState(false);
  // Bumps each time the theme is (re)activated, used as the React key on
  // the Jerry `<img>` to force-remount and re-trigger the CSS fall.
  const [jerryNonce, setJerryNonce] = useState(0);

  useEffect(() => {
    let wasRickMorty = document.documentElement.classList.contains('rick-morty');
    setActive(wasRickMorty);
    if (wasRickMorty) setJerryNonce((n) => n + 1);

    const check = () => {
      const isRickMorty = document.documentElement.classList.contains('rick-morty');
      setActive(isRickMorty);
      // Re-trigger Jerry only on a transition off→on, not on every
      // unrelated class change.
      if (isRickMorty && !wasRickMorty) setJerryNonce((n) => n + 1);
      wasRickMorty = isRickMorty;
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
            className="absolute opacity-55 drop-shadow-[0_0_18px_rgba(151,206,76,0.35)] transition-opacity"
            style={d.style}
          />
        ))}
      </div>

      {/* One-shot Jerry top→bottom fall. Keyed on jerryNonce so the `<img>`
       * remounts (and the CSS animation re-plays) every theme activation. */}
      <div
        aria-hidden="true"
        className="hidden md:block fixed inset-0 pointer-events-none z-0 overflow-hidden"
      >
        <img
          key={jerryNonce}
          src="/decorative/rick-morty/jerry-falling.gif"
          alt=""
          className="absolute left-[55%] drop-shadow-[0_0_24px_rgba(151,206,76,0.45)] rm-jerry-fall"
          style={{ width: 'min(220px, 18vw)' }}
        />
      </div>
    </>
  );
}
