'use client';

import { useEffect, useState } from 'react';
import { useTheme } from 'next-themes';

/** Deterministic skyline: [x, width, height] in a 1440×320 viewBox. */
const SKYLINE: [number, number, number][] = [
  [0, 70, 90],
  [62, 46, 140],
  [104, 80, 110],
  [176, 38, 190],
  [210, 64, 150],
  [268, 42, 230],
  [304, 90, 120],
  [388, 54, 175],
  [436, 30, 260],
  [462, 72, 205],
  [528, 48, 140],
  [570, 96, 110],
  [660, 40, 185],
  [694, 58, 290],
  [748, 36, 240],
  [780, 84, 160],
  [858, 50, 210],
  [902, 70, 130],
  [966, 44, 250],
  [1004, 62, 180],
  [1060, 90, 120],
  [1144, 40, 200],
  [1178, 66, 150],
  [1238, 50, 225],
  [1282, 82, 115],
  [1358, 46, 170],
  [1398, 42, 95],
];

/** Palm silhouettes: [x, trunk height, lean]. */
const PALMS: [number, number, number][] = [
  [96, 150, -14],
  [1312, 170, 16],
  [1384, 120, 10],
];

function Palm({ x, height, lean }: { x: number; height: number; lean: number }) {
  const top = 320 - height;
  const cx = x + lean;
  const fronds = [-150, -115, -70, -25, 20, 60];
  return (
    <g>
      <path d={`M${x} 320 Q${x + lean * 0.3} ${320 - height / 2} ${cx} ${top}`} strokeWidth="7" />
      {fronds.map((angle) => {
        const r = (angle * Math.PI) / 180;
        const ex = cx + Math.cos(r) * 62;
        const ey = top + Math.sin(r) * 34 + 26;
        return (
          <path
            key={angle}
            d={`M${cx} ${top} Q${(cx + ex) / 2} ${top - 18} ${ex.toFixed(1)} ${ey.toFixed(1)}`}
            strokeWidth="5"
          />
        );
      })}
    </g>
  );
}

function Star() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
      <path
        d="M12 2.5l2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17.3l-5.9 3.3 1.3-6.6-4.9-4.6 6.6-.8z"
        fill="currentColor"
        stroke="#000"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function GtaThemeBanner() {
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted || resolvedTheme !== 'gta') return null;

  return (
    <div className="container mx-auto px-4 lg:px-8" data-testid="gta-theme-banner">
      <div className="gta-theme-banner">
        <p className="gta-title">
          <span className="gta-title-small">Grand Theft</span>
          <span className="gta-title-large">Inference</span>
        </p>
        <div className="gta-wanted" role="img" aria-label="Wanted level: five stars">
          {[0, 1, 2, 3, 4].map((i) => (
            <Star key={i} />
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * Follow the root class, like the CS:GO and Minecraft decorations, because
 * this mounts outside ThemeProvider. Pure inline SVG: no network requests.
 */
export function GtaDecorations() {
  const [active, setActive] = useState(false);

  useEffect(() => {
    const check = () => setActive(document.documentElement.classList.contains('gta'));
    check();
    const observer = new MutationObserver(check);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);

  if (!active) return null;

  return (
    <div className="gta-scene" data-testid="gta-scene" aria-hidden="true">
      <div className="gta-scene-sky" />
      <div className="gta-scene-sun" />
      <svg
        className="gta-scene-skyline"
        viewBox="0 0 1440 320"
        preserveAspectRatio="xMidYMax slice"
        focusable="false"
      >
        <g fill="#0b0712">
          {SKYLINE.map(([x, w, h]) => (
            <rect key={x} x={x} y={320 - h} width={w} height={h} />
          ))}
        </g>
        <g fill="none" stroke="#0b0712" strokeLinecap="round">
          {PALMS.map(([x, height, lean]) => (
            <Palm key={x} x={x} height={height} lean={lean} />
          ))}
        </g>
      </svg>
      <div className="gta-scene-shade" />
    </div>
  );
}
