'use client';

import { track } from '@/lib/analytics';
import {
  Car,
  Crosshair,
  Flag,
  Moon,
  Pickaxe,
  Shield,
  Skull,
  Sun,
  type LucideIcon,
} from 'lucide-react';
import { useTheme } from 'next-themes';
import * as React from 'react';

import { nextTheme } from '@/lib/themes';
import { cn } from '@/lib/utils';
import { HEADER_ACTION_STYLE } from './control-styles';

const THEME_ICONS: Record<string, LucideIcon> = {
  light: Sun,
  dark: Moon,
  minecraft: Pickaxe,
  csgo: Crosshair,
  gta: Car,
  kart: Flag,
  doom: Skull,
  halo: Shield,
};

/** Neutral half-moon shown before hydration, when the saved theme is unknown. */
function PendingIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" className="fill-current">
      <path d="m12 21c4.971 0 9-4.029 9-9s-4.029-9-9-9-9 4.029-9 9 4.029 9 9 9zm4.95-13.95c1.313 1.313 2.05 3.093 2.05 4.95s-0.738 3.637-2.05 4.95c-1.313 1.313-3.093 2.05-4.95 2.05v-14c1.857 0 3.637 0.737 4.95 2.05z" />
    </svg>
  );
}

/** One click advances to the next presentation theme. */
export function ModeToggle() {
  const { setTheme, theme } = useTheme();
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  const buttonClasses = cn(HEADER_ACTION_STYLE, 'size-11');

  // Keep the button mounted and clickable while the saved theme hydrates.
  const current = mounted ? theme : undefined;
  const ActiveIcon = THEME_ICONS[current ?? ''];

  const toggleTheme = () => {
    const next = nextTheme(theme);
    setTheme(next);
    track('theme_toggled', { theme: next });
  };

  return (
    <button
      type="button"
      data-testid="theme-toggle"
      className={buttonClasses}
      aria-label={mounted ? `Switch theme (currently ${theme} mode)` : 'Switch theme'}
      onClick={toggleTheme}
    >
      {ActiveIcon ? <ActiveIcon size={20} aria-hidden="true" /> : <PendingIcon />}
    </button>
  );
}
