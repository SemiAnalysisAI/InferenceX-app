'use client';

import { useTheme } from 'next-themes';
import { useEffect, useRef, type ReactNode } from 'react';

import {
  EMBED_RESIZE_MESSAGE_TYPE,
  embedBootScript,
  type EmbedResizeMessage,
  type EmbedSkin,
  type EmbedTheme,
} from '@/lib/embed/embed';

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
