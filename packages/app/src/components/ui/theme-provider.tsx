'use client';

import {
  ThemeProvider as NextThemesProvider,
  useTheme,
  type ThemeProviderProps,
} from 'next-themes';
import * as React from 'react';

import { DISABLED_THEMES } from '@/lib/themes/themes';

const RETIRED_THEMES: readonly string[] = ['kart', ...DISABLED_THEMES];

function RetiredThemeMigration() {
  const { theme, setTheme } = useTheme();

  React.useEffect(() => {
    document.documentElement.classList.remove(...RETIRED_THEMES);
    if (theme !== undefined && RETIRED_THEMES.includes(theme)) setTheme('dark');
  }, [theme, setTheme]);

  return null;
}

export function ThemeProvider({ children, ...props }: ThemeProviderProps) {
  return (
    <NextThemesProvider {...props}>
      <RetiredThemeMigration />
      {children}
    </NextThemesProvider>
  );
}
