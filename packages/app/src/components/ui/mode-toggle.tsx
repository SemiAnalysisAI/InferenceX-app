'use client';

import { track } from '@/lib/analytics/analytics';
import {
  Car,
  Check,
  Crosshair,
  Moon,
  Pickaxe,
  Shield,
  Skull,
  Sun,
  type LucideIcon,
} from 'lucide-react';
import { useTheme } from 'next-themes';
import * as React from 'react';

import { APP_THEMES } from '@/lib/themes/themes';
import { cn } from '@/lib/shared/utils';
import { HEADER_ACTION_STYLE } from './control-styles';
import { Popover, PopoverContent, PopoverTrigger } from './popover';

const THEME_ICONS: Record<string, LucideIcon> = {
  light: Sun,
  dark: Moon,
  minecraft: Pickaxe,
  csgo: Crosshair,
  gta: Car,
  doom: Skull,
  halo: Shield,
};

const THEME_LABELS: Record<string, { en: string; zh: string }> = {
  light: { en: 'Light', zh: '浅色' },
  dark: { en: 'Dark', zh: '深色' },
  minecraft: { en: 'Minecraft', zh: 'Minecraft' },
  csgo: { en: 'CS:GO', zh: 'CS:GO' },
  gta: { en: 'GTA', zh: 'GTA' },
  doom: { en: 'DOOM', zh: 'DOOM' },
  halo: { en: 'Halo', zh: 'Halo' },
};

/** Neutral half-moon shown before hydration, when the saved theme is unknown. */
function PendingIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" className="fill-current">
      <path d="m12 21c4.971 0 9-4.029 9-9s-4.029-9-9-9-9 4.029-9 9 4.029 9 9 9zm4.95-13.95c1.313 1.313 2.05 3.093 2.05 4.95s-0.738 3.637-2.05 4.95c-1.313 1.313-3.093 2.05-4.95 2.05v-14c1.857 0 3.637 0.737 4.95 2.05z" />
    </svg>
  );
}

/** Icon button that opens a menu of every presentation theme. */
export function ModeToggle({ isZh = false }: { isZh?: boolean }) {
  const { setTheme, theme } = useTheme();
  const [mounted, setMounted] = React.useState(false);
  const [open, setOpen] = React.useState(false);
  const optionRefs = React.useRef<(HTMLButtonElement | null)[]>([]);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  // Keep the button mounted and clickable while the saved theme hydrates.
  const current = mounted ? theme : undefined;
  const ActiveIcon = THEME_ICONS[current ?? ''];
  const activeIndex = Math.max(0, APP_THEMES.indexOf(current ?? ''));

  const selectTheme = (next: string) => {
    setOpen(false);
    if (next === theme) return;
    setTheme(next);
    track('theme_toggled', { theme: next });
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    const focused = optionRefs.current.indexOf(document.activeElement as HTMLButtonElement);
    const last = APP_THEMES.length - 1;
    const target =
      event.key === 'ArrowDown'
        ? focused >= last
          ? 0
          : focused + 1
        : event.key === 'ArrowUp'
          ? focused <= 0
            ? last
            : focused - 1
          : event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? last
              : -1;
    if (target < 0) return;
    event.preventDefault();
    optionRefs.current[target]?.focus();
  };

  const label = isZh ? '主题' : 'Theme';

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          data-testid="theme-toggle"
          className={cn(HEADER_ACTION_STYLE, 'size-11')}
          aria-label={mounted ? `Switch theme (currently ${theme} mode)` : 'Switch theme'}
        >
          {ActiveIcon ? <ActiveIcon size={20} aria-hidden="true" /> : <PendingIcon />}
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-44 p-1"
        data-testid="theme-menu"
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          optionRefs.current[activeIndex]?.focus();
        }}
      >
        <div role="radiogroup" aria-label={label} onKeyDown={onKeyDown}>
          {APP_THEMES.map((option, index) => {
            const Icon = THEME_ICONS[option];
            const selected = option === current;
            return (
              <button
                key={option}
                ref={(node) => {
                  optionRefs.current[index] = node;
                }}
                type="button"
                role="radio"
                aria-checked={selected}
                tabIndex={index === activeIndex ? 0 : -1}
                data-testid={`theme-option-${option}`}
                onClick={() => selectTheme(option)}
                className={cn(
                  'flex min-h-11 w-full cursor-pointer items-center gap-2 rounded-sm px-2 text-sm transition-colors hover:bg-muted focus-visible:bg-muted focus-visible:outline-none md:min-h-8',
                  selected ? 'text-foreground font-medium' : 'text-muted-foreground',
                )}
              >
                {Icon && <Icon size={16} aria-hidden="true" />}
                <span className="flex-1 text-left">
                  {THEME_LABELS[option]?.[isZh ? 'zh' : 'en']}
                </span>
                {selected && <Check size={14} aria-hidden="true" />}
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
