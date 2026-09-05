'use client';

import { useTheme } from 'next-themes';
import { useEffect, useRef, type ReactNode } from 'react';

import { EMBED_RESIZE_MESSAGE_TYPE, type EmbedResizeMessage, type EmbedTheme } from '@/lib/embed';
import type { Locale } from '@/lib/i18n';

const STRINGS = {
  en: {
    attribution: 'Data from',
    openDashboard: 'Open in InferenceX',
    scope: (frameworks: string) => `Showing ${frameworks} results only`,
  },
  zh: {
    attribution: '数据来源',
    openDashboard: '在 InferenceX 中打开',
    scope: (frameworks: string) => `仅显示 ${frameworks} 的结果`,
  },
} as const;

/**
 * Client shell for `/embed/model/[slug]`.
 *
 * - Forces the theme the host asked for (`?theme=`) instead of the site's
 *   stored preference. The iframe has its own storage partition, so this does
 *   not leak into the visitor's InferenceX preference.
 * - Marks `<html data-inferencex-embed>` so decorative backgrounds stay out.
 * - Posts its rendered height to the parent window whenever it changes so the
 *   host can size the iframe without an inner scrollbar.
 * - Renders a compact attribution row with a link back to the dashboard.
 */
export default function EmbedFrame({
  theme,
  locale,
  dashboardHref,
  frameworkLabels,
  children,
}: {
  theme: EmbedTheme;
  locale: Locale;
  dashboardHref: string;
  /** Human labels for the locked framework families, if any. */
  frameworkLabels: readonly string[];
  children: ReactNode;
}) {
  const { setTheme } = useTheme();
  const rootRef = useRef<HTMLDivElement>(null);
  const t = STRINGS[locale];

  useEffect(() => {
    setTheme(theme);
  }, [setTheme, theme]);

  useEffect(() => {
    const html = document.documentElement;
    html.dataset.inferencexEmbed = '';
    return () => {
      delete html.dataset.inferencexEmbed;
    };
  }, []);

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
      {children}
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-1 text-xs text-muted-foreground">
        <span data-testid="embed-scope">
          {frameworkLabels.length > 0 ? t.scope(frameworkLabels.join(', ')) : null}
        </span>
        <span>
          {t.attribution}{' '}
          <a
            href={dashboardHref}
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-foreground underline underline-offset-2 hover:text-primary"
            data-testid="embed-dashboard-link"
          >
            InferenceX
          </a>
          {' · '}
          <a
            href={dashboardHref}
            target="_blank"
            rel="noopener noreferrer"
            className="underline underline-offset-2 hover:text-primary"
          >
            {t.openDashboard}
          </a>
        </span>
      </div>
    </div>
  );
}
