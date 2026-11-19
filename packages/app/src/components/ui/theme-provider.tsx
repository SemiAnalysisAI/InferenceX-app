'use client';

import {
  ThemeProvider as NextThemesProvider,
  useTheme,
  type ThemeProviderProps,
} from 'next-themes';
import { usePathname } from 'next/navigation';
import * as React from 'react';
import { isEmbedPathname } from '@/lib/embed/embed-route';
import { APP_THEMES, SITE_THEME } from '@/lib/themes/themes';

/**
 * Rewrites any saved choice (light, dark, system or a retired easter egg theme) to the site theme,
 * so `resolvedTheme`, which charts read for their palette, agrees with the forced `<html>` class.
 * Embeds keep their own light or dark choice.
 */
function SiteThemeMigration({ embed }: { embed: boolean }) {
  const { theme, setTheme } = useTheme();

  React.useEffect(() => {
    if (!theme) return;
    if (embed ? !APP_THEMES.includes(theme) && theme !== 'system' : theme !== SITE_THEME)
      setTheme(SITE_THEME);
  }, [embed, theme, setTheme]);

  return null;
}

/** The site always renders the SemiAnalysis theme; only embeds may pick light or dark. */
export function ThemeProvider({ children, ...props }: ThemeProviderProps) {
  const pathname = usePathname() ?? '/';
  const embed = isEmbedPathname(pathname);
  return (
    <NextThemesProvider forcedTheme={embed ? undefined : SITE_THEME} {...props}>
      <SiteThemeMigration embed={embed} />
      {children}
    </NextThemesProvider>
  );
}
