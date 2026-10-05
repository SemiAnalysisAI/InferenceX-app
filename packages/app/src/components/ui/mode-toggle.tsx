'use client';

import { track } from '@/lib/analytics';
import { Car, Crosshair, Moon, Pickaxe, Sun, type LucideIcon } from 'lucide-react';
import { useTheme } from 'next-themes';
import * as React from 'react';

import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { APP_THEMES } from '@/lib/themes';
import { useLocale } from '@/lib/use-locale';
import { cn } from '@/lib/utils';
import { HEADER_ACTION_STYLE } from './control-styles';

const THEME_ICONS: Record<string, LucideIcon> = {
  light: Sun,
  dark: Moon,
  minecraft: Pickaxe,
  csgo: Crosshair,
  gta: Car,
};

const STRINGS = {
  en: {
    menu: 'Theme',
    labels: { light: 'Light', dark: 'Dark', minecraft: 'Minecraft', csgo: 'CS:GO', gta: 'GTA' },
  },
  zh: {
    menu: '主题',
    labels: { light: '浅色', dark: '深色', minecraft: 'Minecraft', csgo: 'CS:GO', gta: 'GTA' },
  },
} as const;

type ThemeLabel = keyof (typeof STRINGS)['en']['labels'];

/** Neutral half-moon shown before hydration, when the saved theme is unknown. */
function PendingIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" className="fill-current">
      <path d="m12 21c4.971 0 9-4.029 9-9s-4.029-9-9-9-9 4.029-9 9 4.029 9 9 9zm4.95-13.95c1.313 1.313 2.05 3.093 2.05 4.95s-0.738 3.637-2.05 4.95c-1.313 1.313-3.093 2.05-4.95 2.05v-14c1.857 0 3.637 0.737 4.95 2.05z" />
    </svg>
  );
}

/**
 * Icon-only theme picker: the trigger shows the active theme and expands a
 * compact column with one button per theme, so any theme is one tap away.
 */
export function ModeToggle() {
  const { setTheme, theme } = useTheme();
  const t = STRINGS[useLocale()];
  const [mounted, setMounted] = React.useState(false);
  const [open, setOpen] = React.useState(false);
  const optionRefs = React.useRef<(HTMLButtonElement | null)[]>([]);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  const buttonClasses = cn(HEADER_ACTION_STYLE, 'size-11');

  if (!mounted) {
    return (
      <button
        type="button"
        data-testid="theme-toggle"
        className={buttonClasses}
        aria-label="Switch theme"
        aria-haspopup="dialog"
        aria-expanded={false}
      >
        <PendingIcon />
      </button>
    );
  }

  const activeIndex = Math.max(0, APP_THEMES.indexOf(theme ?? ''));
  const ActiveIcon = THEME_ICONS[theme ?? ''];

  const choose = (next: string) => {
    setOpen(false);
    if (next === theme) return;
    setTheme(next);
    track('theme_toggled', { theme: next });
  };

  const focusOption = (index: number) => {
    const count = APP_THEMES.length;
    optionRefs.current[(index + count) % count]?.focus();
  };

  const onOptionKeyDown = (event: React.KeyboardEvent, index: number) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowRight') {
      event.preventDefault();
      focusOption(index + 1);
    } else if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') {
      event.preventDefault();
      focusOption(index - 1);
    } else if (event.key === 'Home') {
      event.preventDefault();
      focusOption(0);
    } else if (event.key === 'End') {
      event.preventDefault();
      focusOption(APP_THEMES.length - 1);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          data-testid="theme-toggle"
          className={cn(buttonClasses, open && 'bg-muted text-foreground')}
          aria-label={`Switch theme (currently ${theme} mode)`}
        >
          {ActiveIcon ? <ActiveIcon size={20} aria-hidden="true" /> : <PendingIcon />}
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="center"
        sideOffset={6}
        data-testid="theme-menu"
        className="w-auto p-1"
        onOpenAutoFocus={(event) => {
          // Land on the active theme so arrow keys start from the current choice.
          event.preventDefault();
          focusOption(activeIndex);
        }}
      >
        <div role="radiogroup" aria-label={t.menu} className="flex flex-col gap-0.5">
          {APP_THEMES.map((id, index) => {
            const Icon = THEME_ICONS[id];
            const label = t.labels[id as ThemeLabel] ?? id;
            const selected = id === theme;
            return (
              <button
                key={id}
                ref={(node) => {
                  optionRefs.current[index] = node;
                }}
                type="button"
                role="radio"
                aria-checked={selected}
                aria-label={label}
                title={label}
                tabIndex={index === activeIndex ? 0 : -1}
                data-testid={`theme-option-${id}`}
                className={cn(
                  HEADER_ACTION_STYLE,
                  'size-11 md:size-9 focus-visible:bg-muted focus-visible:text-foreground',
                  selected && 'bg-muted text-foreground',
                )}
                onClick={() => choose(id)}
                onKeyDown={(event) => onOptionKeyDown(event, index)}
              >
                <Icon size={18} aria-hidden="true" />
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
