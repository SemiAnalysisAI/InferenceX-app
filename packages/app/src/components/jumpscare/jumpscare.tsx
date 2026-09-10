'use client';

import { useEffect, useRef, useState } from 'react';

import { track } from '@/lib/analytics';
import {
  getJumpscareEligibility,
  JUMPSCARE_ACTIVATION_EVENTS,
  JUMPSCARE_DURATION_MS,
  pickJumpscareDelayMs,
} from '@/lib/jumpscare';
import { playJumpscareSound, unlockJumpscareAudio } from '@/lib/jumpscare-audio';
import { useLocale } from '@/lib/use-locale';

import { JumpscareFace } from './jumpscare-face';

const STRINGS = {
  en: {
    caption: 'CUDA ERROR: DEVICE-SIDE ASSERT. IT IS BEHIND YOU.',
    label: 'Jumpscare',
  },
  zh: {
    caption: 'CUDA ERROR: DEVICE-SIDE ASSERT。它就在你身后。',
    label: '惊吓彩蛋',
  },
} as const;

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

/** Low-res noise canvas; CSS scales it up with `image-rendering: pixelated`. */
const STATIC_W = 160;
const STATIC_H = 96;

function isAutomatedBrowser(): boolean {
  if (typeof navigator !== 'undefined' && navigator.webdriver) return true;
  return typeof window !== 'undefined' && 'Cypress' in window;
}

/**
 * Halloween easter egg: within ten seconds of a visitor's first click, tap, or
 * keypress, the page goes black, a face lunges at the camera, and a synthesized
 * scream plays. No cooldown: every page load gets one. Mounted once in the
 * root layout. Scheduling rules live in
 * `@/lib/jumpscare` so they stay testable; this component owns the DOM.
 */
export function Jumpscare() {
  const locale = useLocale();
  const [active, setActive] = useState(false);
  const audioRef = useRef<AudioContext | null>(null);
  const staticRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const eligibility = getJumpscareEligibility({
      search: window.location.search,
      pathname: window.location.pathname,
      reducedMotion: window.matchMedia(REDUCED_MOTION_QUERY).matches,
      automated: isAutomatedBrowser(),
    });
    if (!eligibility.eligible) return;

    let fireTimer: ReturnType<typeof setTimeout> | null = null;
    let hideTimer: ReturnType<typeof setTimeout> | null = null;

    const removeListeners = () => {
      for (const type of JUMPSCARE_ACTIVATION_EVENTS) {
        document.removeEventListener(type, onActivate, true);
      }
    };

    const fire = () => {
      fireTimer = null;
      track('jumpscare_fired', {
        forced: eligibility.forced,
        pathname: window.location.pathname,
        audio_unlocked: audioRef.current !== null,
      });
      playJumpscareSound(audioRef.current);
      setActive(true);
      hideTimer = setTimeout(() => {
        hideTimer = null;
        setActive(false);
      }, JUMPSCARE_DURATION_MS);
    };

    function onActivate() {
      removeListeners();
      // Must happen synchronously inside the gesture so the browser unlocks audio.
      audioRef.current = unlockJumpscareAudio(audioRef.current);
      fireTimer = setTimeout(fire, pickJumpscareDelayMs());
    }

    for (const type of JUMPSCARE_ACTIVATION_EVENTS) {
      document.addEventListener(type, onActivate, { capture: true, passive: true });
    }

    return () => {
      removeListeners();
      if (fireTimer !== null) clearTimeout(fireTimer);
      if (hideTimer !== null) clearTimeout(hideTimer);
      audioRef.current?.close().catch(() => {});
      audioRef.current = null;
    };
  }, []);

  // TV static: redraw random grey pixels every other frame while active.
  useEffect(() => {
    if (!active) return;
    const canvas = staticRef.current;
    const g = canvas?.getContext('2d');
    if (!canvas || !g) return;
    const image = g.createImageData(STATIC_W, STATIC_H);
    const data = image.data;
    let frame = 0;
    let raf = 0;
    const draw = () => {
      if (frame++ % 2 === 0) {
        for (let i = 0; i < data.length; i += 4) {
          const v = Math.random() < 0.5 ? 0 : 140 + Math.floor(Math.random() * 115);
          data[i] = v;
          data[i + 1] = v;
          data[i + 2] = v;
          data[i + 3] = 255;
        }
        g.putImageData(image, 0, 0);
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [active]);

  if (!active) return null;

  const strings = STRINGS[locale];

  return (
    <div
      className="jumpscare-root"
      role="presentation"
      aria-hidden="true"
      data-testid="jumpscare"
      data-label={strings.label}
    >
      <canvas ref={staticRef} className="jumpscare-static" width={STATIC_W} height={STATIC_H} />
      <div className="jumpscare-stage">
        <div className="jumpscare-face-wrap">
          <JumpscareFace className="jumpscare-face jumpscare-face-ghost" data-tint="red" />
          <JumpscareFace className="jumpscare-face jumpscare-face-ghost" data-tint="cyan" />
          <JumpscareFace className="jumpscare-face" />
        </div>
      </div>
      <div className="jumpscare-vignette" />
      <div className="jumpscare-scanlines" />
      <div className="jumpscare-flash" />
      <p className="jumpscare-text" data-testid="jumpscare-caption">
        {strings.caption}
      </p>
    </div>
  );
}
