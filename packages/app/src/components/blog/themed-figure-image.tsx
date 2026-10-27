'use client';

import { useSyncExternalStore } from 'react';
import { useTheme } from 'next-themes';
import { isDarkTheme, LIGHT_THEMES } from '@/lib/themes/themes';

// Pre-hydration copy of LIGHT_THEMES; a static literal so no value is spliced into script source.
const THEMED_FIGURE_BOOTSTRAP = `(()=>{const s=document.currentScript,i=s&&s.previousElementSibling;if(!(i instanceof HTMLImageElement))return;const l=['light','excalidraw'].some((c)=>document.documentElement.classList.contains(c)),v=l?i.dataset.srcLight:i.dataset.srcDark;if(v)i.setAttribute('src',v)})()`;

const subscribeClient = () => () => {};
const getClientSnapshot = () => true;
const getServerSnapshot = () => false;

interface ThemedFigureImageProps {
  srcLight?: string;
  srcDark?: string;
  alt: string;
  loading: 'eager' | 'lazy';
  className: string;
}

export function ThemedFigureImage({
  srcLight,
  srcDark,
  alt,
  loading,
  className,
}: ThemedFigureImageProps) {
  const { resolvedTheme } = useTheme();
  const isClient = useSyncExternalStore(subscribeClient, getClientSnapshot, getServerSnapshot);
  const clientTheme =
    resolvedTheme ??
    (isClient && LIGHT_THEMES.some((theme) => document.documentElement.classList.contains(theme))
      ? 'light'
      : 'dark');
  const src = isClient ? (isDarkTheme(clientTheme) ? srcDark : srcLight) : undefined;

  return (
    <>
      <img
        src={src}
        data-src-light={srcLight}
        data-src-dark={srcDark}
        alt={alt}
        loading={loading}
        decoding="async"
        className={className}
        suppressHydrationWarning
      />
      <script
        aria-hidden="true"
        suppressHydrationWarning
        dangerouslySetInnerHTML={{ __html: THEMED_FIGURE_BOOTSTRAP }}
      />
      <noscript>
        <img
          src={srcDark ?? srcLight}
          alt={alt}
          loading={loading}
          decoding="async"
          className={className}
        />
      </noscript>
    </>
  );
}
