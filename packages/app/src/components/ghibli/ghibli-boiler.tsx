'use client';

/**
 * Kamaji's Boiler: the Ghibli theme's mini-game. This module is only loaded by next/dynamic
 * after the player clicks "Tend the boiler" on the banner, and everything it starts (RAF,
 * timers, audio nodes) is torn down when the dialog closes.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { track } from '@/lib/analytics/analytics';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { useLocale } from '@/lib/i18n/use-locale';
import type { GhibliAudio } from './ghibli-audio';
import { BoilerAudio } from './ghibli-boiler-audio';
import type { Mode, Result } from './ghibli-boiler-engine';
import { CHAPTERS, UPGRADES } from './ghibli-boiler-levels';
import { BoilerPlay } from './ghibli-boiler-play';
import { MAP_H, MAP_VIEW_W, MapPainter, stationX, stationY } from './ghibli-boiler-map';
import {
  BLENDS,
  BLEND_UNLOCK,
  CHAPTER_IDS,
  HELPERS,
  HELPER_UNLOCK,
  UPGRADE_MAX,
  chapterUnlocked,
  formatTokens,
  medalCount,
  unlockedByMedal,
  useBoilerSave,
  writeBoiler,
  type BoilerSave,
} from './ghibli-boiler-store';
import { BOILER_STRINGS, fill, type BoilerStrings } from './ghibli-boiler-strings';
import GhibliToggles from './ghibli-toggles';
import { prefersReducedMotion } from './ghibli-prefs';
import './ghibli-boiler.css';

type View = 'menu' | 'map' | 'prep' | 'shop' | 'howto' | 'play';

const MEDAL_KONPEITO = [0, 3, 5, 8];

function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() => prefersReducedMotion());
  useEffect(() => {
    const query = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    if (!query) return;
    const update = () => setReduced(query.matches);
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);
  return reduced;
}

function Loadout({
  save,
  t,
  audio,
}: {
  save: BoilerSave;
  t: BoilerStrings;
  audio: BoilerAudio | null;
}) {
  const lockName = (index: number) => t.chapters[CHAPTER_IDS[index]].name;
  return (
    <div className="ghibli-boiler-loadout">
      <fieldset>
        <legend>{t.loadout.blend}</legend>
        {BLENDS.map((blend) => {
          const open = unlockedByMedal(save, BLEND_UNLOCK[blend]);
          return (
            <label
              key={blend}
              className="ghibli-boiler-choice"
              data-locked={open ? undefined : 'true'}
            >
              <input
                type="radio"
                name="ghibli-boiler-blend"
                value={blend}
                checked={save.blend === blend}
                disabled={!open}
                onChange={() => {
                  audio?.cue('menu');
                  writeBoiler((current) => ({ ...current, blend }));
                }}
              />
              <span className="ghibli-boiler-choice-name">{t.loadout.blends[blend].name}</span>
              <span className="ghibli-boiler-small">
                {open
                  ? t.loadout.blends[blend].text
                  : fill(t.loadout.lockedAfter, { n: lockName(BLEND_UNLOCK[blend]) })}
              </span>
            </label>
          );
        })}
      </fieldset>
      <fieldset>
        <legend>{t.loadout.helper}</legend>
        {HELPERS.map((helper) => {
          const open = unlockedByMedal(save, HELPER_UNLOCK[helper]);
          return (
            <label
              key={helper}
              className="ghibli-boiler-choice"
              data-locked={open ? undefined : 'true'}
            >
              <input
                type="radio"
                name="ghibli-boiler-helper"
                value={helper}
                checked={save.helper === helper}
                disabled={!open}
                onChange={() => {
                  audio?.cue('menu');
                  writeBoiler((current) => ({ ...current, helper }));
                }}
              />
              <span className="ghibli-boiler-choice-name">{t.loadout.helpers[helper].name}</span>
              <span className="ghibli-boiler-small">
                {open
                  ? t.loadout.helpers[helper].text
                  : fill(t.loadout.lockedAfter, { n: lockName(HELPER_UNLOCK[helper]) })}
              </span>
            </label>
          );
        })}
      </fieldset>
    </div>
  );
}

function SeaMap({
  save,
  t,
  selected,
  onSelect,
  onBoard,
  reduced,
}: {
  save: BoilerSave;
  t: BoilerStrings;
  selected: number;
  onSelect: (index: number) => void;
  onBoard: () => void;
  reduced: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const painterRef = useRef<MapPainter | null>(null);
  const trainRef = useRef(stationX(selected));
  const unitsRef = useRef(1);
  const frameRef = useRef<number | undefined>(undefined);
  const drawRef = useRef<() => void>(() => {});

  const stations = CHAPTER_IDS.map((id, index) => ({
    name: t.chapters[id].name,
    medal: save.medals[id] ?? 0,
    locked: !chapterUnlocked(save, index),
  }));
  const stationsRef = useRef(stations);
  stationsRef.current = stations;
  const selectedRef = useRef(selected);
  selectedRef.current = selected;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const painter = new MapPainter(canvas, () => drawRef.current());
    painterRef.current = painter;
    drawRef.current = () =>
      painter.draw(trainRef.current, stationsRef.current, selectedRef.current, [...t.map.acts]);
    unitsRef.current = painter.resize();
    drawRef.current();
    const observer = new ResizeObserver(() => {
      unitsRef.current = painter.resize();
      drawRef.current();
    });
    observer.observe(canvas);
    return () => {
      observer.disconnect();
      if (frameRef.current !== undefined) cancelAnimationFrame(frameRef.current);
      drawRef.current = () => {};
    };
  }, [t]);

  // Glide the train to the chosen station; the map only animates while the train moves.
  useEffect(() => {
    const target = stationX(selected);
    if (reduced) {
      trainRef.current = target;
      drawRef.current();
      return;
    }
    const from = trainRef.current;
    const started = performance.now();
    const duration = Math.min(900, 240 + Math.abs(target - from) * 0.8);
    const step = (now: number) => {
      const progress = Math.min(1, (now - started) / duration);
      const eased = 1 - (1 - progress) ** 3;
      trainRef.current = from + (target - from) * eased;
      drawRef.current();
      frameRef.current = progress < 1 ? requestAnimationFrame(step) : undefined;
    };
    if (frameRef.current !== undefined) cancelAnimationFrame(frameRef.current);
    frameRef.current = requestAnimationFrame(step);
    return () => {
      if (frameRef.current !== undefined) cancelAnimationFrame(frameRef.current);
      frameRef.current = undefined;
    };
  }, [selected, reduced]);

  useEffect(() => {
    drawRef.current();
  });

  const onPointer = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    const painter = painterRef.current;
    if (!canvas || !painter) return;
    const rect = canvas.getBoundingClientRect();
    const camera = painter.cameraFor(trainRef.current);
    const x = (event.clientX - rect.left) * (MAP_VIEW_W / rect.width) + camera;
    const y = (event.clientY - rect.top) * (MAP_H / rect.height);
    let best = -1;
    let distance = 70;
    CHAPTER_IDS.forEach((_, index) => {
      const d = Math.hypot(stationX(index) - x, stationY(index) - 30 - y);
      if (d < distance) {
        distance = d;
        best = index;
      }
    });
    if (best < 0) return;
    if (best === selected && stations[best] && !stations[best].locked) onBoard();
    else onSelect(best);
  };

  return (
    <canvas
      ref={canvasRef}
      className="ghibli-boiler-map"
      onPointerDown={onPointer}
      role="img"
      aria-label={`${t.map.title}. ${t.map.hint}`}
      data-testid="ghibli-boiler-map"
    />
  );
}

export default function GhibliBoiler({
  open,
  onOpenChange,
  audio: sharedAudio,
  returnFocus,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  audio: GhibliAudio | null;
  returnFocus?: () => void;
}) {
  const locale = useLocale();
  const t = BOILER_STRINGS[locale];
  const save = useBoilerSave();
  const reduced = useReducedMotion();
  const [view, setView] = useState<View>(() => (save.seenHowTo ? 'menu' : 'howto'));
  const [mode, setMode] = useState<Mode>('campaign');
  const [chapterIndex, setChapterIndex] = useState(() =>
    Math.min(save.station, CHAPTERS.length - 1),
  );
  const [audio, setAudio] = useState<BoilerAudio | null>(null);
  const [notice, setNotice] = useState('');

  useEffect(() => {
    const instance = new BoilerAudio(sharedAudio);
    setAudio(instance);
    instance.update({ mood: 0 });
    return () => instance.dispose();
  }, [sharedAudio]);

  useEffect(() => {
    if (view !== 'play') audio?.update({ mood: 0, paused: false, batch: 0, pressure: 0, night: 0 });
  }, [view, audio]);

  const go = useCallback(
    (next: View) => {
      audio?.cue('menu');
      if (next !== 'howto' && view === 'howto' && !save.seenHowTo)
        writeBoiler((current) => ({ ...current, seenHowTo: true }));
      setView(next);
    },
    [audio, view, save.seenHowTo],
  );

  const start = useCallback(
    (nextMode: Mode, index = chapterIndex) => {
      setMode(nextMode);
      setChapterIndex(index);
      setView('play');
      track('ghibli_boiler_started', {
        mode: nextMode,
        chapter: nextMode === 'campaign' ? CHAPTER_IDS[index] : 'none',
      });
    },
    [chapterIndex],
  );

  const finish = useCallback(
    (result: Result) => {
      const id = CHAPTER_IDS[result.chapterIndex];
      writeBoiler((current) => {
        const next: BoilerSave = {
          ...current,
          medals: { ...current.medals },
          chapterBest: { ...current.chapterBest },
          peakThroughput: Math.max(current.peakThroughput, result.peakThroughput),
        };
        let earned = result.stars;
        if (result.mode === 'campaign') {
          const previous = current.medals[id] ?? 0;
          if (result.medal > previous) {
            next.medals[id] = result.medal;
            earned += MEDAL_KONPEITO[result.medal] - MEDAL_KONPEITO[previous];
          }
          next.chapterBest[id] = Math.max(current.chapterBest[id] ?? 0, result.goodput);
          if (result.medal > 0)
            next.station = Math.max(
              current.station,
              Math.min(CHAPTERS.length - 1, result.chapterIndex + 1),
            );
        } else if (result.mode === 'endless') {
          next.endlessBest = Math.max(current.endlessBest, result.goodput);
          next.endlessWave = Math.max(current.endlessWave, result.wave);
        }
        if (result.mode !== 'sandbox') next.konpeito = current.konpeito + earned;
        return next;
      });
      if (result.medal > 0) audio?.cue('medal');
      track('ghibli_boiler_finished', {
        mode: result.mode,
        chapter: result.mode === 'campaign' ? id : 'none',
        medal: result.medal,
        goodput: result.goodput,
        failed: result.failed,
      });
    },
    [audio],
  );

  const buy = (index: number) => {
    const spec = UPGRADES[index];
    const level = save.upgrades[spec.id] ?? 0;
    if (level >= UPGRADE_MAX) return;
    const cost = spec.cost[level];
    if (save.konpeito < cost) {
      audio?.cue('locked');
      setNotice(t.shop.poor);
      return;
    }
    audio?.cue('buy');
    setNotice('');
    writeBoiler((current) => ({
      ...current,
      konpeito: current.konpeito - cost,
      upgrades: { ...current.upgrades, [spec.id]: level + 1 },
    }));
    track('ghibli_boiler_upgrade_bought', { upgrade: spec.id, level: level + 1 });
  };

  // Arrow keys ride the train on the map.
  useEffect(() => {
    if (view !== 'map') return;
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest('input, select, textarea')) return;
      if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
        event.preventDefault();
        setChapterIndex((current) => {
          const next = Math.max(
            0,
            Math.min(CHAPTERS.length - 1, current + (event.key === 'ArrowRight' ? 1 : -1)),
          );
          if (next !== current) audio?.cue('door', next / (CHAPTERS.length - 1));
          return next;
        });
      } else if (event.key === 'Enter' && !target?.closest('button')) {
        event.preventDefault();
        if (chapterUnlocked(save, chapterIndex)) start('campaign');
        else audio?.cue('locked');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [view, save, chapterIndex, start, audio]);

  const selectedId = CHAPTER_IDS[chapterIndex];
  const selectedOpen = chapterUnlocked(save, chapterIndex);
  const selectedChapter = CHAPTERS[chapterIndex];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="ghibli-boiler"
        overlayClassName="ghibli-boiler-overlay"
        data-testid="ghibli-boiler-dialog"
        data-view={view}
        onInteractOutside={(event) => {
          if (view === 'play') event.preventDefault();
        }}
        onCloseAutoFocus={(event) => {
          if (returnFocus) {
            event.preventDefault();
            returnFocus();
          }
        }}
      >
        <DialogTitle className="ghibli-boiler-title">{t.title}</DialogTitle>
        <DialogDescription className="sr-only">{t.subtitle}</DialogDescription>

        {view === 'menu' && (
          <div className="ghibli-boiler-menu">
            <p className="ghibli-boiler-lede">{t.subtitle}</p>
            <ul className="ghibli-boiler-ledger" aria-label={t.shop.konpeito}>
              <li>
                <span>
                  {fill(t.banner.badge, {
                    m: medalCount(save),
                    b: formatTokens(save.endlessBest, locale),
                  })}
                </span>
              </li>
              <li>
                <span className="ghibli-boiler-star" aria-hidden="true" /> {t.shop.konpeito}:{' '}
                {save.konpeito}
              </li>
            </ul>
            <div className="ghibli-boiler-cards">
              <button
                type="button"
                className="ghibli-boiler-card"
                data-testid="ghibli-boiler-campaign"
                onClick={() => go('map')}
              >
                <span className="ghibli-boiler-card-name">{t.modes.campaign}</span>
                <span className="ghibli-boiler-small">{t.modes.campaignText}</span>
              </button>
              <button
                type="button"
                className="ghibli-boiler-card"
                data-testid="ghibli-boiler-endless"
                onClick={() => go('prep')}
              >
                <span className="ghibli-boiler-card-name">{t.modes.endless}</span>
                <span className="ghibli-boiler-small">{t.modes.endlessText}</span>
              </button>
              <button
                type="button"
                className="ghibli-boiler-card"
                data-testid="ghibli-boiler-sandbox"
                onClick={() => start('sandbox', 0)}
              >
                <span className="ghibli-boiler-card-name">{t.modes.sandbox}</span>
                <span className="ghibli-boiler-small">{t.modes.sandboxText}</span>
              </button>
              <button
                type="button"
                className="ghibli-boiler-card"
                data-testid="ghibli-boiler-shop"
                onClick={() => go('shop')}
              >
                <span className="ghibli-boiler-card-name">{t.modes.shop}</span>
                <span className="ghibli-boiler-small">{t.modes.shopText}</span>
              </button>
            </div>
            <div className="ghibli-boiler-settings">
              <GhibliToggles variant="game" />
              <label className="ghibli-boiler-check">
                <input
                  type="checkbox"
                  checked={save.assist}
                  onChange={(event) =>
                    writeBoiler((current) => ({ ...current, assist: event.target.checked }))
                  }
                />
                <span>
                  {t.settings.assist}
                  <span className="ghibli-boiler-small"> · {t.settings.assistText}</span>
                </span>
              </label>
              <button type="button" className="ghibli-boiler-btn" onClick={() => go('howto')}>
                {t.modes.howto}
              </button>
            </div>
            {reduced && <p className="ghibli-boiler-small">{t.settings.reduced}</p>}
          </div>
        )}

        {view === 'howto' && (
          <div className="ghibli-boiler-howto">
            <p className="ghibli-boiler-section">{t.howto.title}</p>
            <ol>
              {t.howto.lines.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ol>
            <p className="ghibli-boiler-small">{t.controls.keys}</p>
            <div className="ghibli-boiler-row">
              <button
                type="button"
                className="ghibli-boiler-btn"
                data-tone="primary"
                data-testid="ghibli-boiler-howto-done"
                onClick={() => go('menu')}
              >
                {save.seenHowTo ? t.controls.back : t.controls.start}
              </button>
            </div>
          </div>
        )}

        {view === 'map' && (
          <div className="ghibli-boiler-mapview">
            <p className="ghibli-boiler-section">{t.map.title}</p>
            <SeaMap
              save={save}
              t={t}
              selected={chapterIndex}
              onSelect={(index) => {
                audio?.cue('door', index / (CHAPTERS.length - 1));
                setChapterIndex(index);
              }}
              onBoard={() => start('campaign')}
              reduced={reduced}
            />
            <ol className="ghibli-boiler-route" aria-label={t.map.route}>
              {CHAPTER_IDS.map((id, index) => (
                <li
                  key={id}
                  data-current={index === chapterIndex ? 'true' : undefined}
                  data-medal={save.medals[id] ?? 0}
                >
                  <button
                    type="button"
                    aria-label={`${index + 1}. ${t.chapters[id].name}`}
                    aria-current={index === chapterIndex ? 'step' : undefined}
                    data-testid={`ghibli-boiler-station-${index + 1}`}
                    onClick={() => setChapterIndex(index)}
                  />
                </li>
              ))}
            </ol>
            <p className="ghibli-boiler-small">{t.map.hint}</p>
            <div className="ghibli-boiler-station" data-locked={selectedOpen ? undefined : 'true'}>
              <p className="ghibli-boiler-station-name">
                {fill(t.map.act, { n: selectedChapter.act })} · {chapterIndex + 1}.{' '}
                {t.chapters[selectedId].name}
                {selectedChapter.hazards.boss && (
                  <span className="ghibli-boiler-tag"> {t.map.boss}</span>
                )}
              </p>
              <p className="ghibli-boiler-small">{t.chapters[selectedId].place}</p>
              <p>{t.chapters[selectedId].rule}</p>
              <p className="ghibli-boiler-small">
                {t.end.medal[save.medals[selectedId] ?? 0]}
                {save.chapterBest[selectedId]
                  ? ` · ${fill(t.map.best, { n: formatTokens(save.chapterBest[selectedId] ?? 0, locale) })}`
                  : ''}
              </p>
              {!selectedOpen && <p className="ghibli-boiler-small">{t.map.locked}</p>}
            </div>
            <Loadout save={save} t={t} audio={audio} />
            <div className="ghibli-boiler-row">
              <button type="button" className="ghibli-boiler-btn" onClick={() => go('menu')}>
                {t.controls.back}
              </button>
              <button
                type="button"
                className="ghibli-boiler-btn"
                data-tone="primary"
                disabled={!selectedOpen}
                data-testid="ghibli-boiler-board"
                onClick={() => start('campaign')}
              >
                {t.map.board} {t.chapters[selectedId].name}
              </button>
            </div>
          </div>
        )}

        {view === 'prep' && (
          <div className="ghibli-boiler-mapview">
            <p className="ghibli-boiler-section">{t.modes.endless}</p>
            <p>{t.modes.endlessText}</p>
            <p className="ghibli-boiler-small">
              {fill(t.map.best, { n: formatTokens(save.endlessBest, locale) })} ·{' '}
              {fill(t.end.wave, { n: save.endlessWave || 1 })}
            </p>
            <Loadout save={save} t={t} audio={audio} />
            <div className="ghibli-boiler-row">
              <button type="button" className="ghibli-boiler-btn" onClick={() => go('menu')}>
                {t.controls.back}
              </button>
              <button
                type="button"
                className="ghibli-boiler-btn"
                data-tone="primary"
                data-testid="ghibli-boiler-endless-start"
                onClick={() => start('endless', 0)}
              >
                {t.controls.start}
              </button>
            </div>
          </div>
        )}

        {view === 'shop' && (
          <div className="ghibli-boiler-shop">
            <p className="ghibli-boiler-section">{t.shop.title}</p>
            <p>
              <span className="ghibli-boiler-star" aria-hidden="true" /> {t.shop.konpeito}:{' '}
              {save.konpeito}
            </p>
            <ul className="ghibli-boiler-drawers">
              {UPGRADES.map((spec, index) => {
                const level = save.upgrades[spec.id] ?? 0;
                const full = level >= UPGRADE_MAX;
                return (
                  <li key={spec.id} className="ghibli-boiler-drawer">
                    <span className="ghibli-boiler-choice-name">{t.upgrades[spec.id].name}</span>
                    <span className="ghibli-boiler-small">{t.upgrades[spec.id].text}</span>
                    <span
                      className="ghibli-boiler-pips"
                      aria-label={fill(t.shop.level, { n: level })}
                    >
                      {[0, 1, 2].map((pip) => (
                        <span
                          key={pip}
                          data-on={pip < level ? 'true' : undefined}
                          aria-hidden="true"
                        />
                      ))}
                    </span>
                    <button
                      type="button"
                      className="ghibli-boiler-btn"
                      disabled={full}
                      onClick={() => buy(index)}
                    >
                      {full ? t.shop.max : fill(t.shop.buy, { n: spec.cost[level] })}
                    </button>
                  </li>
                );
              })}
            </ul>
            <p className="ghibli-boiler-small" aria-live="polite">
              {notice}
            </p>
            <div className="ghibli-boiler-row">
              <button type="button" className="ghibli-boiler-btn" onClick={() => go('menu')}>
                {t.controls.back}
              </button>
            </div>
          </div>
        )}

        {view === 'play' && (
          <BoilerPlay
            key={`${mode}-${chapterIndex}`}
            mode={mode}
            chapterIndex={chapterIndex}
            save={save}
            t={t}
            locale={locale}
            audio={audio}
            reduced={reduced}
            onFinish={finish}
            onMenu={() => go(mode === 'campaign' ? 'map' : 'menu')}
            onNext={() => {
              const next = Math.min(CHAPTERS.length - 1, chapterIndex + 1);
              start('campaign', next);
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
