'use client';

import { useEffect, useRef, useState } from 'react';

import { useLocale } from '@/lib/i18n/use-locale';
import { FOODS, type Food } from './orange-chicken-art';
import { playOcSfx } from './orange-chicken-audio';
import { emitLine } from './orange-chicken-lines';
import { readChit } from './orange-chicken-memes';
import { discoverLine } from './orange-chicken-store';
import { BannerLogo } from './orange-chicken-plate';
import { STRINGS, fill as fillText } from './orange-chicken-strings';
import { DISHES, STAGE, type DishId } from './orange-chicken-stage-strings';

function FoodG({ food, x, y, s }: { food: Food; x: number; y: number; s: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      {FOODS[food].map((part, index) => (
        <path
          key={index}
          d={part.d}
          fill={part.fill ?? 'none'}
          stroke={part.stroke ?? 'none'}
          strokeWidth={part.width ?? 0}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ))}
    </g>
  );
}

/** Pei Pei: an original drawing of a panda cook-helper (not the brand's artwork). */
export function PeiPeiArt() {
  return (
    <svg viewBox="0 0 100 124" aria-hidden="true" focusable="false">
      <ellipse cx="50" cy="118" rx="30" ry="4" fill="rgb(74 30 10 / .2)" />
      <g className="oc-pp-body" stroke="#4a1e0a" strokeWidth="2.6" strokeLinejoin="round">
        <ellipse cx="34" cy="108" rx="12" ry="9" fill="#2b1f1a" />
        <ellipse cx="66" cy="108" rx="12" ry="9" fill="#2b1f1a" />
        <ellipse cx="50" cy="82" rx="28" ry="28" fill="#fffdf6" />
        <path
          d="M29 70Q17 84 23 98"
          fill="none"
          stroke="#2b1f1a"
          strokeWidth="11"
          strokeLinecap="round"
        />
        <path d="M31 62Q50 70 69 62L72 70Q50 80 28 70Z" fill="#c8321c" />
        <g className="oc-pp-arm">
          <path
            d="M71 70Q86 76 84 94"
            fill="none"
            stroke="#4a1e0a"
            strokeWidth="13"
            strokeLinecap="round"
          />
          <path
            d="M71 70Q86 76 84 94"
            fill="none"
            stroke="#2b1f1a"
            strokeWidth="9"
            strokeLinecap="round"
          />
        </g>
        <g className="oc-pp-head">
          <circle cx="27" cy="19" r="10" fill="#2b1f1a" />
          <circle cx="73" cy="19" r="10" fill="#2b1f1a" />
          <ellipse cx="50" cy="40" rx="28" ry="25" fill="#fffdf6" />
          <ellipse
            cx="37"
            cy="38"
            rx="7.5"
            ry="10"
            fill="#2b1f1a"
            transform="rotate(18 37 38)"
            stroke="none"
          />
          <ellipse
            cx="63"
            cy="38"
            rx="7.5"
            ry="10"
            fill="#2b1f1a"
            transform="rotate(-18 63 38)"
            stroke="none"
          />
          <g className="oc-pp-eyes" stroke="none">
            <circle cx="37" cy="37" r="3" fill="#fff" />
            <circle cx="63" cy="37" r="3" fill="#fff" />
            <circle cx="37.6" cy="37.4" r="1.5" fill="#4a1e0a" />
            <circle cx="62.4" cy="37.4" r="1.5" fill="#4a1e0a" />
          </g>
          <ellipse cx="50" cy="47" rx="4.5" ry="3.2" fill="#2b1f1a" stroke="none" />
          <path d="M44 52Q50 58 56 52" fill="none" strokeLinecap="round" />
          <circle cx="29" cy="49" r="3.6" fill="#f08a6a" stroke="none" opacity=".6" />
          <circle cx="71" cy="49" r="3.6" fill="#f08a6a" stroke="none" opacity=".6" />
        </g>
      </g>
    </svg>
  );
}

/** Small deterministic random: the same heap every render, so the pans never flicker. */
function rng(seed: number) {
  let s = seed * 9301 + 49297;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}

interface Bit {
  x: number;
  y: number;
  r: number;
  k: number;
}

function heap(seed: number, count: number): Bit[] {
  const rand = rng(seed);
  const bits: Bit[] = [];
  for (let i = 0; i < count; i++) {
    const x = 16 + rand() * 68;
    const top = 25 * Math.sin((Math.PI * (x - 8)) / 84) ** 0.8;
    const y = 35 - rand() * Math.max(4, top);
    bits.push({ x, y, r: rand() * 60 - 30, k: rand() });
  }
  return bits.sort((p, q) => p.y - q.y);
}

const BITS: Record<DishId, Bit[]> = {
  orange: heap(3, 14),
  beijing: heap(5, 22),
  broccoli: heap(7, 16),
  shrimp: heap(11, 13),
  kungpao: heap(13, 22),
  teriyaki: heap(17, 15),
  chow: heap(19, 16),
  rice: heap(23, 46),
  greens: heap(29, 16),
};

function Bits({ dish }: { dish: DishId }) {
  return (
    <>
      {BITS[dish].map((b, i) => {
        const at = `translate(${b.x.toFixed(1)} ${b.y.toFixed(1)}) rotate(${b.r.toFixed(0)}) scale(1.7)`;
        switch (dish) {
          case 'orange': {
            return <FoodG key={i} food="chicken" x={b.x} y={b.y} s={1.05 + b.k * 0.25} />;
          }
          case 'beijing': {
            return b.k < 0.2 ? (
              <rect
                key={i}
                transform={at}
                x="-3.5"
                y="-1"
                width="7"
                height="2"
                rx="1"
                fill="#6fa04a"
              />
            ) : (
              <rect
                key={i}
                transform={at}
                x="-4"
                y="-1.4"
                width="8"
                height="2.8"
                rx="1.2"
                fill="#7a2a14"
                stroke="#4a1e0a"
                strokeWidth=".5"
              />
            );
          }
          case 'broccoli': {
            return b.k < 0.62 ? (
              <g key={i} transform={at} stroke="#2a5f2a" strokeWidth=".5">
                <rect x="-.8" y="1" width="1.6" height="3" fill="#8bbf6a" stroke="none" />
                <circle cx="-2" cy="0" r="2.4" fill="#3f8a3a" />
                <circle cx="2" cy="0" r="2.4" fill="#4a9a44" />
                <circle cx="0" cy="-1.8" r="2.4" fill="#357a33" />
              </g>
            ) : (
              <ellipse
                key={i}
                transform={at}
                rx="4"
                ry="2"
                fill="#6b3a1c"
                stroke="#4a1e0a"
                strokeWidth=".5"
              />
            );
          }
          case 'shrimp': {
            return b.k < 0.7 ? (
              <path
                key={i}
                transform={at}
                d="M-4 1Q-3 -4 2 -3Q5 -1 3 3Q1 2 0 1Q-2 2 -4 1Z"
                fill="#f7cfa8"
                stroke="#c0824f"
                strokeWidth=".6"
              />
            ) : (
              <circle
                key={i}
                cx={b.x}
                cy={b.y}
                r="1.8"
                fill="#a9753c"
                stroke="#4a1e0a"
                strokeWidth=".4"
              />
            );
          }
          case 'kungpao': {
            return b.k < 0.55 ? (
              <rect
                key={i}
                transform={at}
                x="-2.4"
                y="-2.4"
                width="4.8"
                height="4.8"
                rx="1"
                fill="#e7b565"
                stroke="#8a5a2b"
                strokeWidth=".5"
              />
            ) : b.k < 0.72 ? (
              <path key={i} transform={at} d="M-3 0Q0 -2 3 0Q0 2 -3 0Z" fill="#c8321c" />
            ) : b.k < 0.88 ? (
              <circle key={i} cx={b.x} cy={b.y} r="2.5" fill="#9a5b2a" />
            ) : (
              <rect
                key={i}
                transform={at}
                x="-2"
                y="-1.2"
                width="4"
                height="2.4"
                rx="1"
                fill="#6fa04a"
              />
            );
          }
          case 'teriyaki': {
            return (
              <g key={i} transform={at}>
                <ellipse rx="4.6" ry="2.4" fill="#b9732c" stroke="#4a1e0a" strokeWidth=".5" />
                <path d="M-2 -1.4L-1 1.4M1 -1.6L2 1.2" stroke="#5a2e10" strokeWidth=".7" />
              </g>
            );
          }
          case 'chow': {
            return b.k < 0.8 ? (
              <path
                key={i}
                transform={at}
                d="M-5 0q2.5 -4 5 0t5 0"
                fill="none"
                stroke="#d9a45a"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            ) : (
              <rect
                key={i}
                transform={at}
                x="-2"
                y="-1.2"
                width="4"
                height="2.4"
                rx="1"
                fill="#7fae5c"
              />
            );
          }
          case 'rice': {
            return b.k < 0.78 ? (
              <ellipse
                key={i}
                transform={at}
                rx="1.6"
                ry=".8"
                fill="#fff4d6"
                stroke="#e0cfa4"
                strokeWidth=".3"
              />
            ) : b.k < 0.88 ? (
              <circle key={i} cx={b.x} cy={b.y} r="1.7" fill="#e7b92a" />
            ) : b.k < 0.95 ? (
              <circle key={i} cx={b.x} cy={b.y} r="1.7" fill="#e8731a" />
            ) : (
              <circle key={i} cx={b.x} cy={b.y} r="1.7" fill="#5aa04a" />
            );
          }
          default: {
            return (
              <ellipse
                key={i}
                transform={at}
                rx="4.2"
                ry="2.2"
                fill={b.k < 0.4 ? '#2f7d4f' : b.k < 0.75 ? '#4d9a55' : '#7fb85a'}
                stroke="#1f4d2f"
                strokeWidth=".4"
              />
            );
          }
        }
      })}
    </>
  );
}

const PHOTO_BASE = '/decorative/orange-chicken/';
/** Pans whose heap is a cropped real photo; the rest are drawn in code. */
const PHOTOS: Partial<Record<DishId, string>> = {
  orange: 'oc-pan-orange.webp',
  broccoli: 'oc-pan-broccoli.webp',
  rice: 'oc-pan-rice.webp',
  chow: 'oc-pan-chow.webp',
};
const DOME = 'M9 35Q10 -6 50 -6Q90 -6 91 35Z';

/** One steel pan on the line, heaped to `level` (0 to 1), with a serving spoon in it. */
function PanArt({ dish, level }: { dish: DishId; level: number }) {
  const h = Math.max(0.04, level);
  const photo = PHOTOS[dish];
  const scale = `translate(0 35) scale(1 ${h}) translate(0 -35)`;
  return (
    <svg viewBox="0 -8 100 74" aria-hidden="true" focusable="false">
      <ellipse cx="50" cy="62" rx="44" ry="3" fill="rgb(74 30 10 / .22)" />
      <path
        d="M6 34H94L89 61H11Z"
        fill="#c9cdd0"
        stroke="#4a1e0a"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path d="M11 41H89" stroke="#eef0f1" strokeWidth="2" />
      {photo ? (
        <>
          <clipPath id={`oc-pan-clip-${dish}`}>
            <path d={DOME} transform={scale} />
          </clipPath>
          <image
            href={`${PHOTO_BASE}${photo}`}
            x="9"
            y="-6"
            width="82"
            height="41"
            preserveAspectRatio="xMidYMid slice"
            clipPath={`url(#oc-pan-clip-${dish})`}
          />
          <path d={DOME} transform={scale} fill="none" stroke="#4a1e0a" strokeWidth="1.2" />
        </>
      ) : (
        <g transform={scale}>
          <Bits dish={dish} />
        </g>
      )}
      <path d="M6 34H94" stroke="#4a1e0a" strokeWidth="2.4" strokeLinecap="round" />
      <path d="M68 33L86 6" stroke="#8a8f94" strokeWidth="2.2" strokeLinecap="round" />
      <ellipse cx="86.5" cy="5.4" rx="3.2" ry="2" fill="#8a8f94" />
    </svg>
  );
}

/**
 * The home banner's serving line: a glass-fronted counter of heaped pans with name cards (Orange
 * Chicken is the biggest pan), Pei Pei at the end of the counter and the Panda Cares register.
 * Scooping drains a pan (the KV cache); an empty pan is replaced by a fresh one.
 */
export function BannerStage({ withLogo = false }: { withLogo?: boolean }) {
  const locale = useLocale();
  const t = STAGE[locale];
  const [levels, setLevels] = useState<Record<DishId, number>>(
    () => Object.fromEntries(DISHES.map((d) => [d.id, 1])) as Record<DishId, number>,
  );
  const [fresh, setFresh] = useState<DishId | null>(null);
  const [message, setMessage] = useState<string>('');
  const [pei, setPei] = useState<'idle' | 'hop' | 'ring'>('idle');
  const [rounded, setRounded] = useState(0);
  const lines = useRef(0);
  const timers = useRef(new Set<number>());
  // The order chit clue shares the note under the sign with the register question; it is shown
  // until the chain is paid out on About, and swaps back and forth so the question stays visible.
  const [chit, setChit] = useState<0 | 1 | 2>(0);
  const [showClue, setShowClue] = useState(true);

  useEffect(() => {
    const read = () => {
      const saved = readChit();
      setChit(saved ? (saved.paid ? 2 : 1) : 0);
    };
    read();
    window.addEventListener('oc-chit', read);
    const swap = window.setInterval(() => setShowClue((on) => !on), 6000);
    return () => {
      window.removeEventListener('oc-chit', read);
      window.clearInterval(swap);
    };
  }, []);

  useEffect(() => {
    const pending = timers.current;
    return () => {
      for (const id of pending) window.clearTimeout(id);
      pending.clear();
    };
  }, []);

  const later = (fn: () => void, ms: number) => {
    const id = window.setTimeout(() => {
      timers.current.delete(id);
      fn();
    }, ms);
    timers.current.add(id);
  };

  const scoop = (dish: DishId) => {
    const level = levels[dish];
    if (level <= 0.05) return;
    const next = Math.max(0, level - (dish === 'orange' ? 0.14 : 0.2));
    playOcSfx('clang', { rate: 1.3 });
    setLevels((all) => ({ ...all, [dish]: next }));
    if (next <= 0.05) {
      setMessage(t.empty);
      later(() => {
        setLevels((all) => ({ ...all, [dish]: 1 }));
        setFresh(dish);
        setMessage(fillText(t.fresh, { name: t.names[dish] }));
        later(() => setFresh(null), 900);
      }, 1300);
    } else {
      setMessage(fillText(t.scoop, { name: t.names[dish], level: Math.round(next * 100) }));
    }
  };

  const hello = () => {
    const list = t.peiLines;
    setMessage(list[lines.current++ % list.length] ?? '');
    setPei('hop');
    playOcSfx('pop');
    later(() => setPei('idle'), 1000);
  };

  const ring = () => {
    const n = rounded + 1;
    setRounded(n);
    setMessage(fillText(t.bellThanks, { n }));
    setPei('ring');
    if (
      !emitLine('roundup', {
        en: `Round-up number ${n} rang the bell at the register.`,
        zh: `第 ${n} 次凑整，柜台的铃响了。`,
      })
    ) {
      playOcSfx('bell');
    }
    discoverLine('meme-bell');
    later(() => setPei('idle'), 1400);
  };

  const clue = chit === 2 ? '' : showClue ? t.chit[chit] : '';
  const note = message || clue || t.bellAsk;

  return (
    <div className="oc-stage" data-testid="orange-chicken-stage" role="group" aria-label={t.label}>
      <div className="oc-line-sign">
        {withLogo && <BannerLogo compact />}
        <span className="oc-sign-text">
          <strong>{STRINGS[locale].ip.kicker}</strong>
          <small>{t.line}</small>
        </span>
        <p
          className="oc-line-note"
          role="status"
          title={note}
          data-empty={message ? 'false' : 'true'}
          data-chit={!message && clue ? 'true' : undefined}
        >
          {note}
        </p>
      </div>
      <div className="oc-line">
        <ul className="oc-pans">
          {DISHES.map((dish) => (
            <li key={dish.id} data-big={dish.id === 'orange' ? 'true' : 'false'}>
              <button
                type="button"
                className="oc-pan"
                data-empty={levels[dish.id] <= 0.05 ? 'true' : 'false'}
                data-fresh={fresh === dish.id ? 'true' : 'false'}
                aria-label={`${t.names[dish.id]}, ${t.kinds[dish.kind]}`}
                onClick={() => scoop(dish.id)}
              >
                <PanArt dish={dish.id} level={levels[dish.id]} />
                <span className="oc-pan-card">
                  <strong>{t.short[dish.id]}</strong>
                  <small>{t.kinds[dish.kind]}</small>
                </span>
              </button>
            </li>
          ))}
        </ul>
        <div className="oc-line-end">
          <button
            type="button"
            className="oc-mascot oc-mascot-pei"
            data-state={pei}
            aria-label={t.pei}
            title={t.pei}
            onClick={hello}
          >
            <PeiPeiArt />
          </button>
          <button
            type="button"
            className="oc-register"
            onClick={ring}
            title={t.bellAsk}
            aria-label={t.bell}
          >
            <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true" focusable="false">
              <path
                d="M10 2a5 5 0 0 0-5 5v3l-2 4h14l-2-4V7a5 5 0 0 0-5-5Z"
                fill="#f2b632"
                stroke="#4a1e0a"
                strokeWidth="1.4"
                strokeLinejoin="round"
              />
              <circle cx="10" cy="16.5" r="1.8" fill="#4a1e0a" />
            </svg>
            <span>{t.bellShort}</span>
            <small>{rounded}</small>
          </button>
        </div>
      </div>
    </div>
  );
}
