'use client';

import { useEffect, useState } from 'react';

import { prefersReducedMotion } from './csgo-store';

const STILLS = [
  '/decorative/csgo/fp-hud.webp',
  '/decorative/csgo/loc-b.webp',
  '/decorative/csgo/loc-tunnels.webp',
  '/decorative/csgo/loc-long.webp',
];

const MAP_STILLS: Record<string, string> = {
  'Dust II': '/decorative/csgo/loc-b.webp',
  Mirage: '/decorative/csgo/loc-mirage.webp',
  Overpass: '/decorative/csgo/loc-overpass.webp',
  Major: '/decorative/csgo/loc-major.webp',
};

export function CsgoScene() {
  const [active, setActive] = useState(false);
  const [frame, setFrame] = useState(0);
  const [redraw, setRedraw] = useState(false);
  const [mapId, setMapId] = useState('');

  useEffect(() => {
    const check = () => {
      setActive(document.documentElement.classList.contains('csgo'));
      setRedraw(document.documentElement.dataset.csgoRedraw === '1');
      setMapId(document.documentElement.dataset.csgoMap ?? '');
    };
    check();
    const observer = new MutationObserver(check);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class', 'data-csgo-redraw', 'data-csgo-map'],
    });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!active || prefersReducedMotion()) return;
    const timer = window.setInterval(() => setFrame((index) => (index + 1) % STILLS.length), 14000);
    return () => window.clearInterval(timer);
  }, [active]);

  useEffect(() => {
    if (!active || prefersReducedMotion()) return;
    const onScroll = () => {
      document.documentElement.style.setProperty('--csgo-scroll', String(window.scrollY));
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      document.documentElement.style.removeProperty('--csgo-scroll');
    };
  }, [active]);

  if (!active) return null;

  const still = MAP_STILLS[mapId] ?? STILLS[frame] ?? STILLS[0];

  return (
    <div
      className="csgo-scene"
      data-testid="csgo-scene"
      data-redraw={redraw ? 'true' : 'false'}
      data-map={mapId}
      aria-hidden="true"
    >
      <img
        className="csgo-scene-image"
        src={still}
        alt=""
        width={1280}
        height={720}
        decoding="async"
        draggable={false}
      />
      <div className="csgo-radar-grid" />
      <div className="csgo-scene-shade" />
      <div className="csgo-sweep" />
      {redraw ? (
        <div className="csgo-redraw">
          <span>B</span>
          <i />
          <span>TUNNELS</span>
        </div>
      ) : null}
    </div>
  );
}
