'use client';

import { useRef, useState, useSyncExternalStore } from 'react';
import dynamic from 'next/dynamic';

import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { track } from '@/lib/analytics/analytics';
import type { GtaRuntime } from './gta-runtime';
import {
  CHARACTERS,
  FIND_IDS,
  STATIONS,
  getGtaState,
  getServerGtaState,
  rankIndex,
  setMusicEnabled,
  setSoundEnabled,
  subscribeGta,
  type SecretId,
} from './gta-store';
import { QUOTES, fill, formatTime, type GtaStrings } from './gta-strings';

// The Jobs page draws the heist's city map in 2D; its code and the city data load when the
// page is first opened.
const GtaPhoneMap = dynamic(() => import('./gta-phone-map'), { ssr: false });

const TABS = ['cheats', 'radio', 'switch', 'stats', 'jobs'] as const;
type Tab = (typeof TABS)[number];
/** Secrets that can be run from the phone, so touch users are not locked out of typed codes. */
const TAPPABLE: readonly SecretId[] = [
  'fugitive',
  'lawyerup',
  'makeitrain',
  'slowmo',
  'liquor',
  'buzzoff',
  'skyfall',
  'konami',
  'train',
  'order',
  'herewego',
  'hesoyam',
];
const ART_BASE = '/decorative/gta/art/';
const money = (amount: number) => `$${new Intl.NumberFormat('en-US').format(amount)}`;

/**
 * The in-game phone: the list of cheats and secrets with tap alternatives, the radio wheel,
 * the character switch and the stats page. Opened from the cash counter; loaded on first use.
 */
export default function GtaPhoneDialog({
  strings,
  runtime,
  onClose,
}: {
  strings: GtaStrings;
  runtime: GtaRuntime | null;
  onClose: () => void;
}) {
  const t = strings.phone;
  const state = useSyncExternalStore(subscribeGta, getGtaState, getServerGtaState);
  const [tab, setTab] = useState<Tab>('cheats');
  const tabRefs = useRef<Partial<Record<Tab, HTMLButtonElement | null>>>({});

  const tryIt = (id: SecretId) => {
    track('gta_phone_cheat_tried', { cheat_id: id });
    onClose();
    // Let the phone leave first so the effect is visible on the page.
    window.setTimeout(() => runtime?.cheat(id), 260);
  };

  const onTabKey = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
    if (step === 0) return;
    event.preventDefault();
    const next = TABS[(TABS.indexOf(tab) + step + TABS.length) % TABS.length];
    setTab(next);
    tabRefs.current[next]?.focus();
  };

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent
        className="gta-dialog gta-phone"
        overlayClassName="gta-dialog-overlay"
        onCloseAutoFocus={(event) => {
          const opener = document.querySelector<HTMLElement>('[data-testid="gta-phone-open"]');
          if (!opener) return;
          event.preventDefault();
          opener.focus();
        }}
      >
        <div className="gta-phone-head">
          <span className="gta-phone-clock" aria-hidden="true">
            {new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit' }).format(
              new Date(),
            )}
          </span>
          <DialogTitle className="gta-phone-title">{t.title}</DialogTitle>
          <DialogDescription className="gta-phone-description">{t.description}</DialogDescription>
        </div>

        <div className="gta-phone-tabs" role="tablist" aria-label={t.title}>
          {TABS.map((id) => (
            <button
              key={id}
              ref={(node) => {
                tabRefs.current[id] = node;
              }}
              type="button"
              role="tab"
              id={`gta-phone-tab-${id}`}
              aria-selected={tab === id}
              aria-controls={`gta-phone-panel-${id}`}
              tabIndex={tab === id ? 0 : -1}
              className="gta-phone-tab"
              onClick={() => setTab(id)}
              onKeyDown={onTabKey}
            >
              {t.tabs[id]}
            </button>
          ))}
        </div>

        <div
          className="gta-phone-panel"
          role="tabpanel"
          id={`gta-phone-panel-${tab}`}
          aria-labelledby={`gta-phone-tab-${tab}`}
          tabIndex={0}
        >
          {tab === 'cheats' && (
            <>
              <div className="gta-phone-message">
                {/* eslint-disable-next-line @next/next/no-img-element -- small local decorative art */}
                <img
                  src={`${ART_BASE}${QUOTES.crib.art}.webp`}
                  alt=""
                  width={40}
                  height={40}
                  decoding="async"
                />
                <p className="gta-phone-message-from">{strings.lines.crib.speaker}</p>
                <p className="gta-phone-message-quote" lang="en">
                  {QUOTES.crib.quote}
                </p>
                {strings.lines.crib.gloss && (
                  <p className="gta-phone-message-gloss">{strings.lines.crib.gloss}</p>
                )}
                <p className="gta-phone-message-remix">{strings.lines.crib.remix}</p>
              </div>
              <p className="gta-phone-note">{t.cheatsIntro}</p>
              <ul className="gta-cheat-list">
                {FIND_IDS.map((id) => {
                  const secret = strings.secrets[id];
                  const found = state.found.includes(id);
                  return (
                    <li key={id} className="gta-cheat" data-found={found ? 'true' : 'false'}>
                      <span className="gta-cheat-mark" aria-hidden="true" />
                      <div className="gta-cheat-text">
                        <p className="gta-cheat-name">
                          {secret.name}
                          <span className="sr-only">: {found ? t.found : t.locked}</span>
                        </p>
                        <p className="gta-cheat-hint">
                          {secret.hint}
                          {secret.code && (
                            <>
                              {' '}
                              {t.typeHint} <kbd>{secret.code}</kbd>
                            </>
                          )}
                        </p>
                      </div>
                      {TAPPABLE.includes(id) && (
                        <button
                          type="button"
                          className="gta-phone-action"
                          data-testid={`gta-cheat-${id}`}
                          onClick={() => tryIt(id)}
                        >
                          {t.tryIt}
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            </>
          )}

          {tab === 'radio' && (
            <>
              <div className="gta-phone-switches">
                <button
                  type="button"
                  role="switch"
                  aria-checked={state.music}
                  className="gta-phone-switch"
                  onClick={() => setMusicEnabled(!state.music)}
                >
                  <span className="gta-phone-switch-track" aria-hidden="true" />
                  {state.music ? t.radioOn : t.radioOff}
                </button>
                <button
                  type="button"
                  role="switch"
                  aria-checked={state.sound}
                  className="gta-phone-switch"
                  onClick={() => setSoundEnabled(!state.sound)}
                >
                  <span className="gta-phone-switch-track" aria-hidden="true" />
                  {state.sound ? strings.toggles.muteSound : strings.toggles.unmuteSound}
                </button>
              </div>
              <ul className="gta-station-list">
                {STATIONS.map((station) => (
                  <li key={station}>
                    <button
                      type="button"
                      className="gta-station"
                      data-station={station}
                      data-testid={`gta-station-${station}`}
                      aria-pressed={state.station === station}
                      onClick={() => {
                        runtime?.tune(station);
                        track('gta_radio_tuned', { station });
                      }}
                    >
                      <span className="gta-station-logo" aria-hidden="true" />
                      <span className="gta-station-name">{strings.stations[station].name}</span>
                      <span className="gta-station-genre">
                        {state.station === station && state.music ? `${t.nowPlaying}: ` : ''}
                        {strings.stations[station].genre}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
              <p className="gta-phone-note">{t.audioNote}</p>
            </>
          )}

          {tab === 'switch' && (
            <>
              <ul className="gta-character-list">
                {CHARACTERS.map((character) => (
                  <li key={character}>
                    <button
                      type="button"
                      className="gta-character"
                      data-char={character}
                      aria-pressed={state.character === character}
                      onClick={() => {
                        runtime?.switchCharacter(character);
                        track('gta_character_switched', { character });
                      }}
                    >
                      <span className="gta-character-swatch" aria-hidden="true" />
                      <span className="gta-character-name">
                        {strings.characters[character].name}
                      </span>
                      <span className="gta-character-mood">
                        {strings.characters[character].mood}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
              <p className="gta-phone-note">
                {t.weatherLabel}: {strings.weather[state.weather]}
              </p>
              <button
                type="button"
                className="gta-phone-action"
                disabled={state.wanted === 0}
                onClick={() => runtime?.cheat('lawyerup')}
              >
                {t.resetWanted}
              </button>
            </>
          )}

          {tab === 'jobs' && <GtaPhoneMap strings={strings} passed={state.heist.passed} />}

          {tab === 'stats' && (
            <div className="gta-cover" aria-hidden="true">
              <span data-panel="franklin" />
              <span data-panel="batch">{t.cover[0]}</span>
              <span data-panel="michael" />
              <span data-panel="logo" />
              <span data-panel="frontier">{t.cover[1]}</span>
              <span data-panel="trevor" />
            </div>
          )}
          {tab === 'stats' && (
            <dl className="gta-stats">
              <div>
                <dt>{t.statsCash}</dt>
                <dd data-stat="cash">{money(state.cash)}</dd>
              </div>
              <div>
                <dt>{t.statsRank}</dt>
                <dd>{strings.banner.ranks[rankIndex(state.cash)]}</dd>
              </div>
              <div>
                <dt>{t.statsSecrets}</dt>
                <dd>
                  {fill(strings.banner.secrets, {
                    found: state.found.length,
                    total: FIND_IDS.length,
                  })}
                  <span className="gta-stat-meter" aria-hidden="true">
                    <span style={{ width: `${(state.found.length / FIND_IDS.length) * 100}%` }} />
                  </span>
                </dd>
              </div>
              <div>
                <dt>{t.statsHeists}</dt>
                <dd>{state.heist.passed}</dd>
              </div>
              <div>
                <dt>{t.statsBest}</dt>
                <dd>{state.heist.passed > 0 ? formatTime(state.heist.best) : t.statsNone}</dd>
              </div>
              <div>
                <dt>{t.statsTake}</dt>
                <dd>{state.heist.passed > 0 ? money(state.heist.take) : t.statsNone}</dd>
              </div>
            </dl>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
