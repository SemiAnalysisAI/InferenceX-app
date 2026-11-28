'use client';

import { useState, useSyncExternalStore } from 'react';

import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { track } from '@/lib/analytics/analytics';
import { useLocale } from '@/lib/i18n/use-locale';
import {
  SECRET_FIGURES,
  FIND_IDS,
  LINE_IDS,
  TAPPABLE_SECRETS,
  TRUE_BUILDER_GOAL,
  emitLegoEffect,
  getLegoState,
  getServerLegoState,
  resetLegoProgress,
  setMusicEnabled,
  setSoundEnabled,
  subscribeLego,
  type SecretId,
} from './lego-store';
import { STRINGS, fill } from './lego-strings';

const IMG = '/decorative/lego/img/';

/**
 * The set instructions: a journal of the secrets with hints, the minifigure each one
 * unlocks, tap alternatives for the secrets that need a keyboard, labelled sound switches and
 * the reset. Opened from the stud counter; loaded on first use.
 */
export default function LegoJournalDialog({ onClose }: { onClose: () => void }) {
  const locale = useLocale();
  const strings = STRINGS[locale];
  const t = strings.journal;
  const state = useSyncExternalStore(subscribeLego, getLegoState, getServerLegoState);
  const [confirming, setConfirming] = useState(false);
  const number = new Intl.NumberFormat(locale === 'zh' ? 'zh-CN' : 'en-US');
  const progress = Math.min(1, state.studs / TRUE_BUILDER_GOAL);

  const tryIt = (id: SecretId) => {
    track('lego_journal_secret_tried', { egg_id: id });
    onClose();
    // Let the dialog leave first so the effect is visible on the page.
    window.setTimeout(() => emitLegoEffect({ type: 'egg', id }), 260);
  };

  const toggle = (kind: 'sound' | 'music') => {
    const next = !state[kind];
    try {
      localStorage.setItem(`lego-${kind}`, String(next));
    } catch {
      // Storage may be blocked; the in-memory preference still changes.
    }
    if (kind === 'sound') {
      setSoundEnabled(next);
      track('lego_sound_toggled', { enabled: next });
    } else {
      setMusicEnabled(next);
      track('lego_music_toggled', { enabled: next });
    }
  };

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="lego-dialog lego-journal" overlayClassName="lego-dialog-overlay">
        <div className="lego-journal-head">
          <DialogTitle className="lego-journal-title">{t.title}</DialogTitle>
          <DialogDescription className="lego-journal-description">
            {t.description}
          </DialogDescription>
          <div className="lego-journal-progress">
            <div
              className="lego-meter"
              role="progressbar"
              aria-label={strings.banner.meterLabel}
              aria-valuemin={0}
              aria-valuemax={TRUE_BUILDER_GOAL}
              aria-valuenow={Math.min(state.studs, TRUE_BUILDER_GOAL)}
            >
              <span
                className="lego-meter-fill"
                style={{ width: `${(progress * 100).toFixed(1)}%` }}
              />
            </div>
            <p>
              {fill(t.studs, {
                studs: number.format(state.studs),
                goal: number.format(TRUE_BUILDER_GOAL),
              })}
            </p>
            <p>{fill(t.collected, { found: state.found.length, total: FIND_IDS.length })}</p>
          </div>
        </div>
        <ol className="lego-journal-list">
          {FIND_IDS.map((id, index) => {
            const found = state.found.includes(id);
            const figure = SECRET_FIGURES[id];
            return (
              <li key={id} className="lego-journal-item" data-found={found ? 'true' : 'false'}>
                <span className="lego-journal-step" aria-hidden="true">
                  {index + 1}
                </span>
                <span className="lego-journal-figure">
                  <img
                    src={`${IMG}${figure.file}`}
                    alt={found ? t.figures[id] : t.mystery}
                    width={figure.width}
                    height={figure.height ?? 176}
                    loading="lazy"
                    decoding="async"
                    draggable={false}
                  />
                </span>
                <span className="lego-journal-text">
                  <span className="lego-journal-name">
                    {found ? strings.secretNames[id] : t.missing}
                  </span>
                  <span className="lego-journal-who">{found ? t.figures[id] : t.mystery}</span>
                  <span className="lego-journal-hint">{t.hints[id]}</span>
                </span>
                {TAPPABLE_SECRETS.includes(id) && (
                  <button
                    type="button"
                    className="lego-game-button lego-journal-try"
                    data-testid={`lego-journal-try-${id}`}
                    aria-label={`${t.tryIt}: ${t.hints[id]}`}
                    onClick={() => tryIt(id)}
                  >
                    {t.tryIt}
                  </button>
                )}
              </li>
            );
          })}
        </ol>
        <section className="lego-journal-lines" data-testid="lego-line-index">
          <h3>
            {fill(strings.r5.linesTitle, { found: state.lines.length, total: LINE_IDS.length })}
          </h3>
          <ul>
            {LINE_IDS.map((id) => {
              const heard = state.lines.includes(id);
              return (
                <li key={id} data-heard={heard ? 'true' : 'false'}>
                  <span>{heard ? strings.lines[id] : strings.r5.lineMissing}</span>
                  <small>{strings.lineEvents[id]}</small>
                </li>
              );
            })}
          </ul>
        </section>
        <div className="lego-journal-foot">
          <fieldset className="lego-journal-switches">
            <legend>{t.settings}</legend>
            <label>
              <input
                type="checkbox"
                checked={state.sound}
                data-testid="lego-journal-sound"
                onChange={() => toggle('sound')}
              />
              <span>{t.sound}</span>
            </label>
            <label>
              <input
                type="checkbox"
                checked={state.music}
                data-testid="lego-journal-music"
                onChange={() => toggle('music')}
              />
              <span>{t.music}</span>
            </label>
          </fieldset>
          {confirming ? (
            <div className="lego-journal-confirm" role="alert">
              <p>{t.resetAsk}</p>
              <button
                type="button"
                className="lego-game-button"
                data-testid="lego-journal-reset-yes"
                onClick={() => {
                  resetLegoProgress();
                  track('lego_progress_reset');
                  setConfirming(false);
                  emitLegoEffect({ type: 'toast', text: strings.scene.reset });
                }}
              >
                {t.resetYes}
              </button>
              <button
                type="button"
                className="lego-game-button lego-game-quiet"
                autoFocus
                onClick={() => setConfirming(false)}
              >
                {t.resetNo}
              </button>
            </div>
          ) : (
            <div className="lego-journal-actions">
              {(state.studs > 0 || state.found.length > 0) && (
                <button
                  type="button"
                  className="lego-game-button lego-game-quiet"
                  data-testid="lego-journal-reset"
                  onClick={() => setConfirming(true)}
                >
                  {t.reset}
                </button>
              )}
              <button type="button" className="lego-game-button" onClick={onClose}>
                {t.close}
              </button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
