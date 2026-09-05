'use client';

import { useTheme } from 'next-themes';
import { useEffect, useRef, type ReactNode } from 'react';

import {
  EMBED_RESIZE_MESSAGE_TYPE,
  embedBootScript,
  type EmbedResizeMessage,
  type EmbedSkin,
  type EmbedTheme,
} from '@/lib/embed';

/**
 * Client shell for `/embed/model/[slug]`.
 *
 * - Forces the theme the host asked for (`?theme=`) instead of the site's
 *   stored preference. The iframe has its own storage partition, so this does
 *   not leak into the visitor's InferenceX preference.
 * - Marks `<html data-inferencex-embed>` so decorative backgrounds stay out,
 *   and `<html data-inferencex-skin>` when the host asked for a skin
 *   (`?theme=vllm-light`). Both, plus the theme class, are also written by an
 *   inline script that runs before first paint so the frame never flashes the
 *   default look while React hydrates.
 * - Hoists the skin's font variables (loaded by the embed layout on a wrapper
 *   element) onto `<html>` so portalled UI (tooltips, dialogs, selects)
 *   picks them up too.
 * - Posts its rendered height to the parent window whenever it changes so the
 *   host can size the iframe without an inner scrollbar.
 */
/** CSS custom properties the skin fonts are published under (see embed layout). */
const SKIN_FONT_VARS = ['--font-embed-sans', '--font-embed-mono'] as const;

export default function EmbedFrame({
  theme,
  skin,
  children,
}: {
  theme: EmbedTheme;
  skin: EmbedSkin | undefined;
  children: ReactNode;
}) {
  const { setTheme } = useTheme();
  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    setTheme(theme);
  }, [setTheme, theme]);

  useEffect(() => {
    const html = document.documentElement;
    html.dataset.inferencexEmbed = '';
    if (skin) html.dataset.inferencexSkin = skin;
    else delete html.dataset.inferencexSkin;
    return () => {
      delete html.dataset.inferencexEmbed;
      delete html.dataset.inferencexSkin;
    };
  }, [skin]);

  // The embed layout loads the skin fonts with next/font on a wrapper element,
  // which only defines the variables below that wrapper. Copy them to <html>
  // so `html[data-inferencex-skin] body { --font-dm-sans: var(--font-embed-sans) }`
  // resolves everywhere, including Radix portals mounted on <body>.
  useEffect(() => {
    if (!skin) return;
    const root = rootRef.current;
    if (!root) return;
    const html = document.documentElement;
    const computed = getComputedStyle(root);
    for (const name of SKIN_FONT_VARS) {
      const value = computed.getPropertyValue(name).trim();
      if (value) html.style.setProperty(name, value);
    }
    return () => {
      for (const name of SKIN_FONT_VARS) html.style.removeProperty(name);
    };
  }, [skin]);

  useEffect(() => {
    if (window.parent === window) return;
    const root = rootRef.current;
    if (!root) return;
    let last = 0;
    const post = () => {
      const height = Math.ceil(root.getBoundingClientRect().height);
      if (height === last) return;
      last = height;
      const message: EmbedResizeMessage = { type: EMBED_RESIZE_MESSAGE_TYPE, height };
      // The host origin is unknown by design (any page may embed), so the
      // message carries nothing beyond the height.
      window.parent.postMessage(message, '*');
    };
    post();
    const observer = new ResizeObserver(post);
    observer.observe(root);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={rootRef} data-testid="embed-frame" className="flex flex-col gap-2 p-2 sm:p-3">
      <script dangerouslySetInnerHTML={{ __html: embedBootScript(theme, skin) }} />
      {children}
    </div>
  );
}
