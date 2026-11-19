'use client';

import {
  ThemeProvider as NextThemesProvider,
  useTheme,
  type ThemeProviderProps,
} from 'next-themes';
import * as React from 'react';

function RetiredThemeMigration() {
  const { theme, setTheme } = useTheme();

  React.useEffect(() => {
    document.documentElement.classList.remove('kart');
    if (theme === 'kart') setTheme('dark');
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
