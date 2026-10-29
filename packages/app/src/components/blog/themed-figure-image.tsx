'use client';

import { useSyncExternalStore } from 'react';
import { useTheme } from 'next-themes';
import { isDarkTheme, LIGHT_THEMES } from '@/lib/themes/themes';

// Pre-hydration copy of LIGHT_THEMES; a static literal so no value is spliced into script source.
// srcset goes on first so the browser never starts a request for the plain src.
const THEMED_FIGURE_BOOTSTRAP = `(()=>{const s=document.currentScript,i=s&&s.previousElementSibling;if(!(i instanceof HTMLImageElement))return;const l=['light','excalidraw'].some((c)=>document.documentElement.classList.contains(c)),d=i.dataset,w=l?d.srcsetLight:d.srcsetDark,v=l?d.srcLight:d.srcDark;if(w)i.setAttribute('srcset',w);if(v)i.setAttribute('src',v)})()`;

const subscribeClient = () => () => {};
const getClientSnapshot = () => true;
const getServerSnapshot = () => false;

interface ThemedFigureImageProps {
  srcLight?: string;
  srcDark?: string;
  /** Responsive candidates for each variant, e.g. from next/image `getImageProps`. */
  srcSetLight?: string;
  srcSetDark?: string;
  sizes?: string;
  width?: number;
  height?: number;
  alt: string;
  loading: 'eager' | 'lazy';
  fetchPriority?: 'high' | 'auto';
  className: string;
}

export function ThemedFigureImage({
  srcLight,
  srcDark,
  srcSetLight,
  srcSetDark,
  sizes,
  width,
  height,
  alt,
  loading,
  fetchPriority,
  className,
}: ThemedFigureImageProps) {
  const { resolvedTheme } = useTheme();
  const isClient = useSyncExternalStore(subscribeClient, getClientSnapshot, getServerSnapshot);
  const clientTheme =
    resolvedTheme ??
    (isClient && LIGHT_THEMES.some((theme) => document.documentElement.classList.contains(theme))
      ? 'light'
      : 'dark');
  const dark = isDarkTheme(clientTheme);
  const src = isClient ? (dark ? srcDark : srcLight) : undefined;
  const srcSet = isClient ? (dark ? srcSetDark : srcSetLight) : undefined;
  const noscriptDark = Boolean(srcDark);
  const shared = { alt, sizes, width, height, loading, fetchPriority, className };

  return (
    <>
      <img
        {...shared}
        srcSet={srcSet}
        src={src}
        data-src-light={srcLight}
        data-src-dark={srcDark}
        data-srcset-light={srcSetLight}
        data-srcset-dark={srcSetDark}
        decoding="async"
        suppressHydrationWarning
      />
      <script
        aria-hidden="true"
        suppressHydrationWarning
        dangerouslySetInnerHTML={{ __html: THEMED_FIGURE_BOOTSTRAP }}
      />
      <noscript>
        <img
          {...shared}
          srcSet={noscriptDark ? srcSetDark : srcSetLight}
          src={noscriptDark ? srcDark : srcLight}
          decoding="async"
        />
      </noscript>
    </>
  );
}
