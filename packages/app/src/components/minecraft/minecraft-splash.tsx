'use client';

import { useState, useEffect } from 'react';

import { useLocale } from '@/lib/use-locale';

export const SPLASHES = [
  'AgentX is here!!',
  'Now with more tokens!',
  'Chip go brrr!',
  'Also try SGLang!',
  'Tensor cores activated!',
  'FP8 is the new FP16!',
  '100% open source!',
  'Benchmarked on real hardware!',
  'Not just vibes!',
  'Tokens per second!',
  'Time to first token!',
  'May contain NaN!',
  'Works on my Chip!',
  'DeepSeek approved!',
  'Lower latency!',
  'Higher throughput!',
  'Runs on a single node!',
  'NVLink go brrr!',
  'Attention is all you need!',
  'Powered by CUDA!',
  'Batch size = 1!',
  'No synthetic benchmarks!',
  'Real-world workloads!',
  'Out of VRAM!',
  'KV cache optimized!',
  'Prefill gang!',
  'Disagg or no disagg?',
  'GB200 NVL72!',
  'More flops!',
  'PCIe bottleneck!',
  'Roofline analysis!',
];

/**
 * Splash shown outside the minecraft theme. Light and dark mode get a single
 * fixed announcement rather than the random rotation — the rotation is a
 * minecraft-theme easter egg, while this is a launch callout that has to say
 * the same thing on every load.
 */
/** Mirrors the `@media (min-width: 1024px)` rule that reveals `.splash-wrapper`. */
const SPLASH_MIN_WIDTH = '(min-width: 1024px)';

const ANNOUNCEMENT = {
  en: 'AgentX is here!!',
  zh: 'AgentX 来了！！',
} as const;

/**
 * Splash text — yellow, rotated, bouncing text (Minecraft title screen style)
 * on the landing page. Light and dark mode show the fixed AgentX announcement;
 * the minecraft theme keeps the random per-load rotation.
 */
export function MinecraftSplash() {
  const locale = useLocale();
  const [randomSplash, setRandomSplash] = useState('');
  const [isMinecraft, setIsMinecraft] = useState(false);
  const [wideEnough, setWideEnough] = useState(false);

  // Picked client-side only: a server-rendered random pick would mismatch on
  // hydration. Minecraft mode is the only consumer, and it starts `false`.
  useEffect(() => {
    setRandomSplash(SPLASHES[Math.floor(Math.random() * SPLASHES.length)]);
  }, []);

  // `.splash-wrapper` is `display: none` below 1024px, but hiding it in CSS is
  // not enough: the browser still fetches the Monocraft webfont the splash
  // asks for, so a phone pays for a font it never paints. Gate the element out
  // of the tree entirely below the same breakpoint the stylesheet uses.
  // Starts `false` so the server render and the first client render agree.
  useEffect(() => {
    const query = window.matchMedia(SPLASH_MIN_WIDTH);
    const sync = () => setWideEnough(query.matches);
    sync();
    query.addEventListener('change', sync);
    return () => query.removeEventListener('change', sync);
  }, []);

  useEffect(() => {
    function check() {
      setIsMinecraft(document.documentElement.classList.contains('minecraft'));
    }
    check();
    const observer = new MutationObserver(check);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);

  const splash = isMinecraft ? randomSplash : ANNOUNCEMENT[locale];
  if (!splash || !wideEnough) return null;

  return (
    <div className="splash-wrapper" data-testid="splash-text">
      <span className="splash-text">{splash}</span>
    </div>
  );
}
