'use client';

import { X } from 'lucide-react';
import { useEffect, useMemo } from 'react';

import { useLocale } from '@/lib/i18n/use-locale';

import { pickMeme, type MemeContext } from './meme-catalog';

const MEME_FONT = { fontFamily: 'Impact, "Anton", "Arial Black", sans-serif' };
const DISPLAY_MS = 5200;

const STRINGS = {
  en: { close: 'Close meme' },
  zh: { close: '关闭梗图' },
} as const;

/**
 * Easter egg: a small meme card in the top-right corner of the plot, the first time in a
 * playback run another vendor takes part of the curve from NVIDIA. Loaded only after a
 * reader turns memes on.
 */
export default function FrontierMemeOverlay({
  context,
  onDismiss,
}: {
  context: Omit<MemeContext, 'locale'>;
  onDismiss: () => void;
}) {
  const locale = useLocale();
  const t = STRINGS[locale];
  const meme = useMemo(() => pickMeme({ ...context, locale }), [context, locale]);
  useEffect(() => {
    const timer = setTimeout(onDismiss, DISPLAY_MS);
    return () => clearTimeout(timer);
  }, [meme.id, onDismiss]);

  return (
    <div
      key={meme.id}
      role="status"
      aria-live="polite"
      data-testid="frontier-meme"
      className="absolute top-8 right-10 z-20 w-44 overflow-hidden rounded-md border bg-black shadow-lg motion-safe:animate-in motion-safe:fade-in motion-safe:zoom-in-95 motion-safe:duration-300 sm:w-52"
    >
      <button
        type="button"
        aria-label={t.close}
        onClick={onDismiss}
        className="absolute top-1.5 right-1.5 z-10 rounded-full bg-black/60 p-1 text-white hover:bg-black/80"
      >
        <X className="size-3.5" />
      </button>
      <img src={meme.src} alt={meme.alt} className="block w-full" />
      <p
        className="px-2 py-1.5 text-center text-xs leading-snug text-white uppercase"
        style={MEME_FONT}
      >
        {meme.caption}
      </p>
    </div>
  );
}
