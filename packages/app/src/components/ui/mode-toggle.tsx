'use client';

import { track } from '@/lib/analytics';
import { Pickaxe, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';
import * as React from 'react';

import { cn } from '@/lib/utils';

type Theme = 'light' | 'dark' | 'minecraft';
const THEME_CYCLE: Theme[] = ['light', 'dark', 'minecraft'];

export function ModeToggle() {
  const { setTheme, theme } = useTheme();

  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  const toggleTheme = () => {
    const idx = THEME_CYCLE.indexOf(theme as Theme);
    const next = THEME_CYCLE[(idx + 1) % THEME_CYCLE.length];
    setTheme(next);
    track('theme_toggled', { theme: next });
  };

  const buttonClasses = cn(
    'inline-flex items-center justify-center rounded-md p-2',
    'text-muted-foreground hover:text-foreground hover:bg-accent',
    'transition-colors duration-200',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
  );

  if (!mounted) {
    return (
      <button
        type="button"
        data-testid="theme-toggle"
        className={buttonClasses}
        aria-label="Switch theme"
        onClick={toggleTheme}
      >
        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" className="fill-current">
          <path d="m12 21c4.971 0 9-4.029 9-9s-4.029-9-9-9-9 4.029-9 9 4.029 9 9 9zm4.95-13.95c1.313 1.313 2.05 3.093 2.05 4.95s-0.738 3.637-2.05 4.95c-1.313 1.313-3.093 2.05-4.95 2.05v-14c1.857 0 3.637 0.737 4.95 2.05z" />
        </svg>
      </button>
    );
  }

  const displayAriaLabel = `Switch theme (currently ${theme} mode)`;

  return (
    <button
      type="button"
      data-testid="theme-toggle"
      className={buttonClasses}
      aria-label={displayAriaLabel}
      onClick={toggleTheme}
    >
      {theme === 'minecraft' ? (
        <Pickaxe size={20} aria-hidden="true" />
      ) : theme === 'dark' ? (
        <Sun size={20} aria-hidden="true" />
      ) : (
        /* Moon icon */
        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" className="fill-current">
          <path d="M10 7a7 7 0 0 0 12 4.9v.1c0 5.523-4.477 10-10 10S2 17.523 2 12 6.477 2 12 2h.1A6.979 6.979 0 0 0 10 7zm-6 5a8 8 0 0 0 15.062 3.762A9 9 0 0 1 8.238 4.938 7.999 7.999 0 0 0 4 12z" />
        </svg>
      )}
    </button>
  );
}
