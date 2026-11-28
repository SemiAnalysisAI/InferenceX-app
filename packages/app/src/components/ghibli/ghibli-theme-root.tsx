'use client';

import { useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { usePathname } from 'next/navigation';
import { track } from '@/lib/analytics/analytics';
import { isEmbedPathname } from '@/lib/embed/embed-route';
import { useLocale } from '@/lib/i18n/use-locale';
import { GhibliAudio } from './ghibli-audio';
import { GhibliBanner } from './ghibli-banner';
import { mountGhibliCharts } from './ghibli-charts';
import {
  prefersReducedMotion,
  useGhibliFilm,
  useGhibliLantern,
  writeGhibliFilm,
  type GhibliFilm,
} from './ghibli-prefs';
import { GhibliStage } from './ghibli-stage';
import { STRINGS } from './ghibli-strings';
import { ThemeHeaderToggles } from '@/components/effects/theme-header-toggles';
import GhibliToggles from './ghibli-toggles';
import './ghibli-theme.css';

// The game, its canvas painter, audio and CSS load only when the player opens it.
const GhibliBoiler = dynamic(() => import('./ghibli-boiler'), { ssr: false });

/** Watercolour sky, clouds and meadow behind the page. Clouds drift with scroll for parallax. */
function GhibliSky() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const sky = ref.current;
    if (!sky || prefersReducedMotion()) return;
    let frame: number | undefined;
    const update = () => {
      frame = undefined;
      sky.style.setProperty('--ghibli-scroll', String(Math.round(window.scrollY)));
    };
    const onScroll = () => {
      if (frame === undefined) frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      if (frame !== undefined) cancelAnimationFrame(frame);
      sky.style.removeProperty('--ghibli-scroll');
    };
  }, []);

  return (
    <div ref={ref} className="ghibli-sky no-export" aria-hidden="true">
      <div className="ghibli-sun" />
      <div className="ghibli-clouds ghibli-clouds-far" />
      <div className="ghibli-clouds ghibli-clouds-near" />
      <div className="ghibli-hills ghibli-hills-far" />
      <div className="ghibli-hills ghibli-hills-near" />
      <div className="ghibli-grass" />
      <div className="ghibli-paper" />
    </div>
  );
}

export default function GhibliTheme() {
  const locale = useLocale();
  const film = useGhibliFilm();
  const layerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<GhibliStage | null>(null);
  const filmRef = useRef(film);
  filmRef.current = film;
  const strings = STRINGS[locale];
  const stringsRef = useRef(strings);
  stringsRef.current = strings;
  const audioRef = useRef<GhibliAudio | null>(null);
  const launchRef = useRef<HTMLButtonElement>(null);
  const [gameOpen, setGameOpen] = useState(false);
  const pathname = usePathname();
  // Any route change, browser Back included, closes the game: it unmounts, which stops its
  // loop, releases its audio and lets the dialog restore scroll and focus.
  useEffect(() => {
    setGameOpen(false);
  }, [pathname]);
  useEffect(() => {
    const close = () => setGameOpen(false);
    window.addEventListener('popstate', close);
    return () => window.removeEventListener('popstate', close);
  }, []);
  const lantern = useGhibliLantern();

  useEffect(() => {
    const root = document.documentElement;
    if (lantern) root.dataset.ghibliLantern = 'true';
    else delete root.dataset.ghibliLantern;
    return () => {
      delete root.dataset.ghibliLantern;
    };
  }, [lantern]);

  useEffect(() => {
    const layer = layerRef.current;
    const root = document.documentElement;
    if (!layer || Object.hasOwn(root.dataset, 'inferencexEmbed')) return;
    if (isEmbedPathname(window.location.pathname)) return;
    const audio = new GhibliAudio();
    audioRef.current = audio;
    const stage = new GhibliStage(layer, {
      strings: stringsRef.current,
      film: filmRef.current,
      audio,
      reduced: prefersReducedMotion(),
    });
    stageRef.current = stage;
    const unmountCharts = mountGhibliCharts();
    return () => {
      unmountCharts();
      stage.destroy();
      audio.dispose();
      audioRef.current = null;
      stageRef.current = null;
    };
  }, []);

  useEffect(() => {
    stageRef.current?.setStrings(strings);
  }, [strings]);

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.ghibliFilm = film;
    stageRef.current?.setFilm(film);
    return () => {
      delete root.dataset.ghibliFilm;
    };
  }, [film]);

  const chooseFilm = (next: GhibliFilm) => {
    writeGhibliFilm(next);
    stageRef.current?.greet(next);
  };

  return (
    <>
      <ThemeHeaderToggles>
        <GhibliToggles />
      </ThemeHeaderToggles>
      <GhibliSky />
      <div ref={layerRef} className="ghibli-scene no-export" />
      <GhibliBanner
        film={film}
        onFilm={chooseFilm}
        launchRef={launchRef}
        onPlay={() => {
          setGameOpen(true);
          track('ghibli_boiler_opened');
        }}
      />
      {gameOpen && (
        <GhibliBoiler
          open
          onOpenChange={setGameOpen}
          audio={audioRef.current}
          returnFocus={() => launchRef.current?.focus({ preventScroll: true })}
        />
      )}
    </>
  );
}
