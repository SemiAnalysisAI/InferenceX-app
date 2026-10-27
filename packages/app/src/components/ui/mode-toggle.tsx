'use client';

import { track } from '@/lib/analytics/analytics';
import {
  Car,
  Crosshair,
  Moon,
  PencilLine,
  Pickaxe,
  Shield,
  Skull,
  Sun,
  UtensilsCrossed,
  type LucideIcon,
} from 'lucide-react';
import { useTheme } from 'next-themes';
import * as React from 'react';

import { nextTheme } from '@/lib/themes/themes';
import { useLocale } from '@/lib/i18n/use-locale';
import { cn } from '@/lib/shared/utils';
import { HEADER_ACTION_STYLE } from './control-styles';

const THEME_ICONS: Record<string, LucideIcon> = {
  light: Sun,
  dark: Moon,
  minecraft: Pickaxe,
  csgo: Crosshair,
  gta: Car,
  doom: Skull,
  halo: Shield,
  'orange-chicken': UtensilsCrossed,
  excalidraw: PencilLine,
};

const STRINGS = {
  en: { orangeChicken: 'Switch theme (currently orange chicken mode)' },
  zh: { orangeChicken: '切换主题（当前为陈皮鸡主题）' },
};

function PendingIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" className="fill-current">
      <path d="m12 21c4.971 0 9-4.029 9-9s-4.029-9-9-9-9 4.029-9 9 4.029 9 9 9zm4.95-13.95c1.313 1.313 2.05 3.093 2.05 4.95s-0.738 3.637-2.05 4.95c-1.313 1.313-3.093 2.05-4.95 2.05v-14c1.857 0 3.637 0.737 4.95 2.05z" />
    </svg>
  );
}

export function ModeToggle() {
  const { setTheme, theme } = useTheme();
  const strings = STRINGS[useLocale()];
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  const buttonClasses = cn(HEADER_ACTION_STYLE, 'size-11');

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
      aria-label={
        current === 'orange-chicken'
          ? strings.orangeChicken
          : mounted
            ? `Switch theme (currently ${theme} mode)`
            : 'Switch theme'
      }
      onClick={toggleTheme}
    >
      {ActiveIcon ? <ActiveIcon size={20} aria-hidden="true" /> : <PendingIcon />}
    </button>
  );
}
