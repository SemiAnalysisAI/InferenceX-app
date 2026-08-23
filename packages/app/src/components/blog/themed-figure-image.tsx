'use client';

import { useSyncExternalStore } from 'react';
import { useTheme } from 'next-themes';

const THEMED_FIGURE_BOOTSTRAP = `(()=>{const s=document.currentScript,i=s&&s.previousElementSibling;if(!(i instanceof HTMLImageElement))return;const l=document.documentElement.classList.contains('light'),v=l?i.dataset.srcLight:i.dataset.srcDark;if(v)i.setAttribute('src',v)})()`;

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

/**
 * The server leaves `src` out of the hydrated image, then a parser-time script
 * selects the saved root theme before first paint. Client-created figures use
 * the live theme or root class directly. The noscript image preserves article
 * content for non-JavaScript readers and crawlers.
 */
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
    (isClient && document.documentElement.classList.contains('light') ? 'light' : 'dark');
  const src = isClient
    ? clientTheme === 'dark' || clientTheme === 'minecraft'
      ? srcDark
      : srcLight
    : undefined;

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
