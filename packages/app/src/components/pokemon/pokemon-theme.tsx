'use client';

import { useLocale } from '@/lib/i18n/use-locale';
import './pokemon-theme.css';

export default function PokemonTheme() {
  const zh = useLocale() === 'zh';

  return (
    <div className="container mx-auto px-4 lg:px-8" data-testid="pokemon-theme-banner">
      <div className="pokemon-banner">
        <div className="pokemon-device-lights" aria-hidden="true">
          <span />
          <i />
          <i />
          <i />
        </div>
        <div className="pokemon-banner-copy">
          <p className="pokemon-edition text-xs font-semibold uppercase tracking-widest">
            {zh ? '宝可梦主题 · X / Y' : 'Pokémon theme · X / Y'}
          </p>
          <p className="pokemon-title text-2xl sm:text-3xl font-bold">InferenceX</p>
          <p className="pokemon-caption text-sm">
            {zh ? '要把它们全部测一遍！' : 'Gotta benchmark ’em all.'}
          </p>
          <div className="pokemon-type-badges text-xs font-semibold" aria-hidden="true">
            <span>{zh ? '电' : 'ELECTRIC'}</span>
            <span>{zh ? '水' : 'WATER'}</span>
            <span>{zh ? '火' : 'FIRE'}</span>
          </div>
        </div>
        <div className="pokemon-ball-display" aria-hidden="true">
          <div className="pokemon-ball">
            <span />
          </div>
          <span className="pokemon-display-label text-xs font-semibold tracking-widest">X / Y</span>
        </div>
      </div>
    </div>
  );
}
