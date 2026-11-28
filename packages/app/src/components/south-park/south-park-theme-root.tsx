'use client';

import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { ClipboardList, MountainSnow } from 'lucide-react';
import { usePathname } from 'next/navigation';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useLocale } from '@/lib/i18n/use-locale';
import { CaseProp } from './case-prop';
import { makeRadio } from './radio';
import { buildStage } from './stage';
import type { makePlotStunts } from './plot-stunts';
import { STRINGS } from './strings';
import { COUNTY_LINES, recordLine } from './county-lines';
import SouthParkToggles from './south-park-toggles';
import { ThemeHeaderToggles } from '@/components/effects/theme-header-toggles';
import './south-park-theme.css';

const ART = '/decorative/south-park/art/';
const CAST = ['stan', 'kyle', 'cartman', 'kenny'] as const;
const SLATES = ['snow', 'mysterion', 'school', 'pond', 'casa'] as const;
type Slate = (typeof SLATES)[number];
const slateSound = { snow: 1, mysterion: 2, casa: 3, school: 4, pond: 5 };
const KEY = 'south-park-kenny-deaths';
const KONAMI = '↑↑↓↓←→←→ba';
const ARROWS: Record<string, string> = {
  ArrowUp: '↑',
  ArrowDown: '↓',
  ArrowLeft: '←',
  ArrowRight: '→',
};
const Arcade = dynamic(() => import('./bus-stop-arcade'), { ssr: false });
const Drawer = dynamic(() => import('./case-drawer'), { ssr: false });
const ChannelFour = dynamic(() => import('./channel-four'), { ssr: false });
const Backyard = dynamic(() => import('./backyard'), { ssr: false });
interface Line {
  kid: number;
  text: string;
  id: number;
}
interface Prank {
  from: number;
  to: number;
  dx: number;
  dy: number;
  snack: boolean;
  id: number;
}

export default function SouthParkTheme() {
  const locale = useLocale();
  const t = STRINGS[locale],
    alt = STRINGS[locale === 'en' ? 'zh' : 'en'];
  const pathname = usePathname();
  const lastOfficePath = useRef(pathname);
  const compact = pathname !== '/' && pathname !== '/zh' && pathname !== '/zh/';
  const banner = useRef<HTMLDivElement>(null);
  const scene = useRef<HTMLDivElement>(null);
  const [deaths, setDeaths] = useState(0);
  const [report, setReport] = useState(0);
  const [incident, setIncident] = useState<number | null>(null);
  const [line, setLine] = useState<Line | null>(null);
  const [prank, setPrank] = useState<Prank | null>(null);
  const [outfit, setOutfit] = useState<'ski' | 'cop' | 'hero' | null>(null);
  const [cameo, setCameo] = useState<'kitty' | 'towelie' | null>(null);
  const [snacks, setSnacks] = useState(false);
  const [office, setOffice] = useState<'arcade' | 'cases' | 'news' | 'keep' | null>(null);
  const fromKeep = useRef(false);
  const inOffice = useRef(false);
  inOffice.current = office !== null;
  const [palette, setPalette] = useState<Slate>('snow');
  const [record, setRecord] = useState(0);
  const [rank, setRank] = useState(1);
  const [medal, setMedal] = useState(0);
  const [keepStamp, setKeepStamp] = useState(false);
  const [cleanupCrew, setCleanupCrew] = useState(false);
  const [transfer, setTransfer] = useState(false);
  const [caseMask, setCaseMask] = useState(0);
  const [patrol, setPatrol] = useState(false);
  const [footer, setFooter] = useState<Element | null>(null);
  const [lostProperty, setLostProperty] = useState(false);
  const costumes = caseMask.toString(2).replaceAll('0', '').length >= 8;
  const paletteNames = {
    snow: t.snowDay,
    mysterion: t.mysterion,
    school: t.schoolDay,
    pond: t.pondDay,
    casa: t.casaDusk,
  };
  function switchMode(next: typeof palette) {
    setPalette(next);
    document.documentElement.dataset.spMode = next;
    window.dispatchEvent(new CustomEvent('sp-slate', { detail: next }));
    try {
      localStorage.setItem('south-park-mode', next);
    } catch {}
  }

  useEffect(() => {
    setFooter(document.querySelector('[data-testid="footer"]'));
    setLostProperty(false);
    const closeOnNavigation = () => {
      const next = location.pathname;
      if (lastOfficePath.current === next) return;
      lastOfficePath.current = next;
      if (!inOffice.current) return;
      fromKeep.current = false;
      inOffice.current = false;
      setOffice(null);
      window.dispatchEvent(new CustomEvent('sp-depot-room', { detail: false }));
      radioNews(false);
    };
    closeOnNavigation();
    window.addEventListener('popstate', closeOnNavigation);
    return () => window.removeEventListener('popstate', closeOnNavigation);
  }, [pathname]);

  useEffect(() => {
    if (!banner.current || !scene.current) return;
    const layer = scene.current;
    const stage = buildStage(layer, banner.current, t.chartRail, t.plotButton);
    const radio = makeRadio();
    let disposed = false,
      releaseCharts: (() => void) | undefined,
      releaseDesk: (() => void) | undefined;
    let director: ReturnType<typeof makePlotStunts> | null = null;
    function plotBeat(id: number) {
      if (director) director.play(id);
      else
        void import('./plot-stunts').then(({ makePlotStunts }) => {
          if (disposed) return;
          director ??= makePlotStunts(layer);
          director.play(id);
        });
    }
    void import('./charts').then(({ mountPaperCharts }) => {
      if (!disposed) releaseCharts = mountPaperCharts();
    });
    void import('./county-desk').then(({ mountCountyDesk }) => {
      if (!disposed)
        releaseDesk = mountCountyDesk(document.documentElement.lang.startsWith('zh'), (clip) =>
          radio.play(clip, 'sound', true),
        );
    });
    const timers = new Set<number>();
    const abort = new AbortController();
    const signal = abort.signal;
    const reduce = matchMedia('(prefers-reduced-motion: reduce)');
    const kids = [...layer.querySelectorAll<HTMLElement>('.sp-kid')];
    let count = 0;
    let directedCase = 0;
    let busy = false;
    let chain = 0;
    let signs = 0;
    let sequence = '';
    let words = '';
    let serial = 0;
    let lineId = 0;
    let outfitId = 0;
    let cameoId = 0;
    let lastInput = Date.now();
    let lastGesture = 0;
    let prankIndex = 0;
    let jinglePlayed = false;
    let idleShown = false;
    let hadDialog = false;
    let hadOffice = false;
    let lastPath = window.location.pathname;
    try {
      setKeepStamp(localStorage.getItem('south-park-keep-stamp') === '1');
      setPatrol(localStorage.getItem('south-park-patrol') === 'true');
      setTransfer(sessionStorage.getItem('south-park-transfer') === 'school');
      count = Math.max(0, Math.floor(Number(localStorage.getItem(KEY)) || 0));
      const rawPalette = localStorage.getItem('south-park-mode');
      const saved = SLATES.find((s) => s === rawPalette) ?? 'snow';
      setPalette(saved);
      radio.slate(slateSound[saved]);
      document.documentElement.dataset.spMode = saved;
      const book = JSON.parse(localStorage.getItem('south-park-dispatch-record-v1') ?? 'null');
      if (Array.isArray(book?.best)) setRecord(Math.max(0, ...book.best.filter(Number.isFinite)));
      if (Number.isInteger(book?.stage)) setRank(Math.min(5, Math.max(1, book.stage)));
      if (Number.isInteger(book?.medal)) setMedal(Math.min(3, Math.max(0, book.medal)));
    } catch {}
    let mask = (1 << Math.min(12, count)) - 1;
    try {
      const raw = localStorage.getItem('south-park-case-files');
      if (raw !== null) mask = Number(raw) & 4095;
    } catch {}
    setCaseMask(mask);
    function fileCase(id: number) {
      count++;
      mask |= 1 << id;
      setDeaths(count);
      setCaseMask(mask);
      try {
        localStorage.setItem(KEY, String(count));
        localStorage.setItem('south-park-case-files', String(mask));
      } catch {}
    }
    window.addEventListener(
      'sp-slate',
      (e) => {
        const v = (e as CustomEvent<Slate>).detail;
        radio.slate(slateSound[v] ?? 1);
      },
      { signal },
    );
    setDeaths(count);
    const later = (fn: () => void, delay: number) => {
      const id = window.setTimeout(() => {
        timers.delete(id);
        fn();
      }, delay);
      timers.add(id);
      return id;
    };
    function say(kid: number, text: string, duration = 2600) {
      const id = ++lineId;
      setLine({ kid, text, id });
      later(() => {
        if (id === lineId) setLine(null);
      }, duration);
    }
    function dress(mode: 'ski' | 'cop' | 'hero', time = 3900) {
      const id = ++outfitId;
      setOutfit(mode);
      later(() => {
        if (id === outfitId) setOutfit(null);
      }, time);
    }
    function guest(who: 'kitty' | 'towelie') {
      if (document.hidden) return;
      stage.summon();
      const id = ++cameoId;
      setCameo(who);
      if (who === 'kitty') {
        say(2, t.cat);
        radio.play('kitty', 'sound', true);
      } else if (recordLine('towel')) {
        const [en, zh] = COUNTY_LINES.towel;
        say(2, locale === 'zh' ? `${zh} ${en}` : en);
      }
      later(() => {
        if (id === cameoId) setCameo(null);
      }, 3800);
    }
    function toss(from: number, to: number, snack = false) {
      const a = stage.point(from);
      const b = stage.point(to);
      if (!a || !b) return;
      const id = ++serial;
      setPrank({ from, to, dx: b.x - a.x, dy: b.y - a.y, snack, id });
      later(() => setPrank((p) => (p?.id === id ? null : p)), 1650);
    }
    function goSki() {
      dress('ski');
      say(1, t.ski);
      stage.jump();
      radio.play('transition', 'music');
    }
    function authorize() {
      dress('cop');
      if (!recordLine('badge')) return;
      say(2, t.cop);
      radio.play('authority', 'sound', true);
    }
    function delivery() {
      stage.summon();
      setSnacks(true);
      say(2, t.snacks);
      toss(2, 1, true);
      radio.play('pie', 'sound', true);
      later(() => setSnacks(false), 3500);
    }
    function die(forcePlot = false) {
      if (busy || document.hidden) return;
      stage.summon();
      const id = (forcePlot ? directedCase++ : count) % t.cases.length;
      busy = true;
      stage.lock(true);
      fileCase(id);
      setIncident(id);
      const onPlot = forcePlot || stage.isPlot();
      let witnessed = false;
      if (onPlot) plotBeat(id);
      say(3, onPlot ? t.plotCases[id] : t.cases[id], onPlot ? 1650 : 1250);
      later(
        () => {
          witnessed = recordLine('kenny');
          if (witnessed) {
            radio.play('kenny', 'sound', true);
            say(0, locale === 'zh' ? `${t.gotHim} ${alt.gotHim}` : t.gotHim, 2350);
          }
        },
        onPlot ? 1780 : 1050,
      );
      later(
        () => {
          if (witnessed) say(1, t.reply, 1500);
          setCleanupCrew(true);
        },
        onPlot ? 3620 : 2240,
      );
      later(
        () => {
          setCleanupCrew(false);
          setIncident(null);
          stage.lock(false);
          busy = false;
          radio.play('mumble', 'sound', true);
          if (count % 4 === 0) {
            dress('hero', 2800);
            say(3, t.resurrect);
          }
          if (chain > 0) {
            chain--;
            later(die, 1650);
          }
        },
        onPlot ? 5350 : 3480,
      );
    }
    function tease() {
      if (busy || !kids.some((k) => !k.hidden) || document.hidden || reduce.matches) return;
      switch (prankIndex++ % 5) {
        case 0: {
          say(0, t.snow);
          toss(0, 2);
          radio.play('fat');
          break;
        }
        case 1: {
          goSki();
          break;
        }
        case 2: {
          delivery();
          break;
        }
        case 3: {
          if (stage.isPlot()) die();
          else guest('kitty');
          break;
        }
        default: {
          say(2, t.snow);
          toss(2, 3);
          radio.play('transition', 'music');
          break;
        }
      }
    }
    function active() {
      lastInput = Date.now();
      idleShown = false;
    }
    function gesture(e: Event) {
      active();
      radio.unlock();
      const target = e.target instanceof Element ? e.target : null;
      if (jinglePlayed || target?.closest('button,a,input,[role="dialog"],select')) return;
      jinglePlayed = true;
      radio.play('theme', 'music');
    }
    function onClick(e: MouseEvent) {
      const el = e.target instanceof Element ? e.target : null;
      if (!el) return;
      active();
      radio.unlock();
      if (el.closest('.sp-arcade')) return;
      if (el.closest('[data-sp-lost-property]')) {
        radio.cue('rustle');
        return;
      }
      if (el.closest('[data-sp-stunt]')) {
        die(true);
        return;
      }
      if (
        el.closest(
          'button,[role="tab"],[role="combobox"],select,.dot-group,canvas.canvas-point-surface',
        )
      )
        radio.cue(el.closest('.dot-group,canvas,select,[role="combobox"]') ? 'crunch' : 'snip');
      if (el.closest('[data-sp-sign]')) {
        signs++;
        if (signs % 3 === 0) {
          guest('kitty');
        } else {
          radio.play(signs === 1 ? 'theme' : 'transition', 'music');
          setReport((n) => n + 1);
        }
        return;
      }
      const kid = el.closest<HTMLElement>('[data-sp-boy]');
      if (kid) {
        if (Date.now() - lastGesture < 300) return;
        lastGesture = Date.now();
        switch (kid.dataset.spBoy) {
          case 'kenny': {
            die();
            break;
          }
          case 'stan': {
            if (stage.isPlot()) plotBeat(-1);
            say(0, t.snow);
            toss(0, 2);
            radio.play('fat');
            break;
          }
          case 'kyle': {
            goSki();
            break;
          }
          case 'cartman': {
            guest('kitty');
            break;
          }
        }
      } else if (el.closest('[data-testid="header-brand"]')) {
        authorize();
      } else if (el.closest('[data-testid="legend-advanced-toggle"]')) {
        authorize();
      }
    }
    function key(e: KeyboardEvent) {
      const target = e.target instanceof Element ? e.target : null;
      if (
        e.ctrlKey ||
        e.metaKey ||
        e.altKey ||
        e.isComposing ||
        target?.closest('input,textarea,select,[contenteditable="true"],[role="dialog"]')
      )
        return;
      radio.unlock();
      active();
      if (e.repeat) return;
      const k = e.key.toLowerCase();
      // Only consume navigation once a distinctive cheat prefix has been entered.
      if (
        (k === ' ' && words.endsWith('cheesy')) ||
        (ARROWS[e.key] &&
          ['↑↑', '↑↑↓', '↑↑↓↓', '↑↑↓↓←', '↑↑↓↓←→', '↑↑↓↓←→←'].some((prefix) =>
            sequence.endsWith(prefix),
          ))
      )
        e.preventDefault();
      sequence = (sequence + (ARROWS[e.key] ?? k)).slice(-10);
      if (sequence === KONAMI) {
        chain = 2;
        die();
        return;
      }
      if (k.length !== 1) return;
      words = (words + k).slice(-24);
      if (words.endsWith('kenny')) die();
      else if (words.endsWith('cheesy poofs')) delivery();
      else if (words.endsWith('towel')) guest('towelie');
      else if (words.endsWith('mysterion')) {
        stage.summon();
        dress('hero');
        say(3, t.resurrect);
        radio.play('mumble');
      }
    }
    const checkDialog = () => {
      const open = Boolean(
        document.querySelector(
          '[role="dialog"][data-state="open"],[role="dialog"][aria-modal="true"],dialog[open]',
        ),
      );
      if (hadOffice && !open && !inOffice.current && recordLine('home')) {
        say(
          2,
          locale === 'zh'
            ? `${COUNTY_LINES.home[1]} ${COUNTY_LINES.home[0]}`
            : COUNTY_LINES.home[0],
        );
        radio.play('home', 'sound', true);
      }
      hadDialog = open || inOffice.current;
      hadOffice = hadDialog && inOffice.current;
    };
    const dialogs = new MutationObserver((records) => {
      if (
        records.some((r) =>
          r.type === 'attributes'
            ? (r.target as Element).matches('[role="dialog"]')
            : [...r.addedNodes, ...r.removedNodes].some(
                (n) =>
                  n instanceof Element &&
                  (n.matches('[role="dialog"],dialog') ||
                    n.querySelector('[role="dialog"],dialog')),
              ),
        )
      )
        checkDialog();
    });
    dialogs.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['data-state'],
    });
    checkDialog();
    window.addEventListener(
      'sp-depot-stamp',
      (e) => {
        const d = (e as CustomEvent<{ best: number; stage: number; medal: number }>).detail;
        setRecord(d.best);
        setRank(d.stage);
        setMedal(d.medal);
      },
      { signal },
    );
    window.addEventListener(
      'sp-depot-incident',
      (e) => {
        fileCase((e as CustomEvent<number>).detail);
        radio.play('kenny', 'sound', true);
      },
      { signal },
    );
    window.addEventListener('sp-depot-voice', () => radio.play('authority', 'sound', true), {
      signal,
    });
    window.addEventListener(
      'sp-news-cue',
      (e) => {
        const id = (e as CustomEvent<string>).detail;
        if (id === 'jobs') radio.play('jobs', 'sound', true);
        else if (id === 'gnomes') radio.cue('snip');
        else radio.cue('crunch');
      },
      { signal },
    );
    window.addEventListener(
      'sp-news-room',
      (e) => radio.newsroom((e as CustomEvent<boolean>).detail),
      { signal },
    );
    window.addEventListener(
      'sp-depot-room',
      (e) => radio.room((e as CustomEvent<boolean>).detail),
      { signal },
    );
    window.addEventListener(
      'sp-case-action',
      (e) => {
        switch ((e as CustomEvent<number>).detail) {
          case 0: {
            delivery();
            break;
          }
          case 1: {
            stage.summon();
            dress('hero');
            say(3, t.resurrect);
            radio.play('mumble');
            break;
          }
          case 2: {
            chain = 2;
            die();
            break;
          }
        }
      },
      { signal },
    );
    const horizon = () => {
      const n = reduce.matches ? 0 : Math.min(28, Math.floor(scrollY / 96));
      document.documentElement.style.setProperty('--sp-range', `${n}px`);
    };
    horizon();
    window.addEventListener('scroll', horizon, { passive: true, signal });
    reduce.addEventListener('change', horizon, { signal });
    document.addEventListener(
      'pointerover',
      (e) => {
        const target =
          e.target instanceof Element
            ? e.target.closest('button,[role="tab"],select,[role="combobox"]')
            : null;
        if (
          target &&
          !target.closest('.sp-arcade') &&
          !(e.relatedTarget instanceof Node && target.contains(e.relatedTarget))
        )
          radio.cue('rustle');
      },
      { passive: true, signal },
    );
    document.addEventListener('pointerdown', gesture, { capture: true, signal });
    document.addEventListener('pointermove', active, { passive: true, signal });
    document.addEventListener('scroll', active, { passive: true, signal });
    document.addEventListener('click', onClick, { capture: true, signal });
    document.addEventListener('keydown', key, { signal });
    document.addEventListener(
      'visibilitychange',
      () => {
        if (document.hidden) radio.hide();
        else {
          active();
          radio.sync();
        }
      },
      { signal },
    );
    window.addEventListener(
      'south-park-sound-toggle',
      (e) => {
        radio.sync();
        const detail = (e as CustomEvent<{ key: string; enabled: boolean }>).detail;
        if (detail?.key === 'music' && detail.enabled) radio.play('theme', 'music', true);
      },
      { signal },
    );
    let tick = 0;
    let opening: 'waiting' | 'landed' | 'pranked' | 'done' = 'waiting';
    let landedAt = 0;
    const interval = window.setInterval(() => {
      if (document.hidden) return;
      tick++;
      if (lastPath !== location.pathname) {
        lastPath = location.pathname;
        stage.finishOpening();
        opening = 'waiting';
        radio.play('transition', 'music');
      }
      const eligible = !busy && !hadDialog && !reduce.matches;
      if ((opening === 'landed' || opening === 'pranked') && !stage.openingVisible()) {
        stage.finishOpening();
        opening = 'waiting';
      }
      if (
        eligible &&
        opening === 'waiting' &&
        banner.current?.dataset.compact &&
        stage.startOpening()
      ) {
        opening = 'landed';
        landedAt = tick;
      } else if (eligible && opening === 'landed' && tick > landedAt) {
        stage.jump();
        plotBeat(-1);
        say(0, t.snow);
        toss(0, 2);
        radio.play('fat');
        opening = 'pranked';
      } else if (eligible && opening === 'pranked' && tick >= landedAt + 3) {
        opening = 'done';
        die();
        const shotPath = lastPath;
        later(() => {
          if (location.pathname === shotPath && opening === 'done') stage.finishOpening();
        }, 5500);
      } else if (tick % 3 === 0 && eligible && !stage.openingVisible()) stage.jump();
      if (tick % 5 === 0) setReport((n) => n + 1);
      if (!hadDialog && !idleShown && Date.now() - lastInput > 46000) {
        idleShown = true;
        guest('towelie');
      } else if (tick % 9 === 0 && !hadDialog && !idleShown && !stage.openingVisible()) tease();
    }, 2300);
    return () => {
      abort.abort();
      clearInterval(interval);
      timers.forEach(clearTimeout);
      dialogs.disconnect();
      disposed = true;
      releaseCharts?.();
      releaseDesk?.();
      director?.dispose();
      delete document.documentElement.dataset.spMode;
      document.documentElement.style.removeProperty('--sp-range');
      stage.dispose();
      radio.stop();
    };
  }, [t, locale, alt]);

  return (
    <>
      <ThemeHeaderToggles>
        <SouthParkToggles />
      </ThemeHeaderToggles>
      <div className="sp-valley no-export" aria-hidden="true">
        <i />
        <i />
        <i />
      </div>
      <div
        className="sp-banner-wrap"
        data-testid="south-park-theme-banner"
        data-compact={compact || undefined}
        data-set={compact ? (pathname?.includes('about') ? 'school' : 'street') : 'stop'}
        data-fort={keepStamp || undefined}
        ref={banner}
      >
        <div className="sp-film-slate" role="group" aria-label={t.modeLabel}>
          <span className="sp-place-name">
            <MountainSnow size={14} aria-hidden="true" />
            {t.county}
          </span>
          {SLATES.map((m) => (
            <button
              key={m}
              type="button"
              data-sp-palette={m}
              aria-pressed={palette === m}
              onClick={() => switchMode(m)}
            >
              <i aria-hidden="true" />
              {paletteNames[m]}
            </button>
          ))}
          <small aria-live="polite">{t.slateCopy[palette]}</small>
        </div>
        <div className="sp-postcard">
          <div className="sp-scenery" aria-hidden="true" />
          {transfer && pathname?.includes('about') && (
            <span className="sp-transfer-slip" data-sp-arrived="">
              <img src={`${ART}crabtree.webp`} alt="" />
              {t.arrived}
            </span>
          )}
          <button
            type="button"
            className="sp-sign"
            data-sp-sign=""
            aria-label={t.sign}
            title={t.sign}
          >
            <span>{t.welcome}</span>
            <img src={`${ART}town-sign.webp`} alt={t.sign} width={206} height={210} />
          </button>
          <div className="sp-lineup" aria-hidden="true">
            {CAST.map((name) => (
              <i key={name} className="sp-home-mark" />
            ))}
          </div>
          <button
            type="button"
            className="sp-log"
            data-sp-drawer=""
            aria-haspopup="dialog"
            aria-label={t.drawer}
            onClick={() => {
              setReport((n) => n + 1);
              setOffice('cases');
            }}
          >
            <div className="sp-log-cap">
              <ClipboardList size={14} aria-hidden="true" />
              {t.bulletin}
            </div>
            <div className="sp-log-main">
              <span>{t.deaths}</span>
              <strong>{String(deaths).padStart(3, '0')}</strong>
            </div>
            <div className="sp-log-note">
              {palette === 'snow' ? t.reports[report % t.reports.length] : t.slateCopy[palette]}
            </div>
          </button>
          <div className="sp-mobile-radio">
            <SouthParkToggles compact />
          </div>
        </div>
        <div className="sp-station-row">
          {!compact && (
            <Link
              className="sp-bus-transfer"
              data-sp-transfer=""
              href={locale === 'zh' ? '/zh/about' : '/about'}
              aria-label={t.transfer}
              title={t.transfer}
              onClick={() => {
                setTransfer(true);
                try {
                  sessionStorage.setItem('south-park-transfer', 'school');
                } catch {}
              }}
            >
              <img src={`${ART}school-bus.webp`} alt="" />
              <span>
                {locale === 'zh'
                  ? '去关于页领取回忆莓换乘票'
                  : 'About stop: pick up a Member Berry transfer'}
              </span>
            </Link>
          )}
          {transfer && pathname?.includes('about') && (
            <Link
              className="sp-berry-transfer"
              data-sp-berry-ticket=""
              href={`${locale === 'zh' ? '/zh' : ''}/infx/inference?g_model=DeepSeek-R1-0528`}
              onClick={() => {
                try {
                  sessionStorage.setItem('south-park-berry-transfer', 'punched');
                } catch {}
              }}
            >
              <img src={`${ART}berries.webp`} alt="" />
              {locale === 'zh'
                ? '给票打孔：到图表服务台兑付'
                : 'Punch berry ticket: redeem at the chart desk'}
            </Link>
          )}
          <button
            className="sp-depot-ticket"
            type="button"
            data-sp-arcade=""
            aria-haspopup="dialog"
            onClick={() => {
              setOffice('arcade');
              window.dispatchEvent(new CustomEvent('sp-depot-room', { detail: true }));
            }}
          >
            {t.arcade}
            {keepStamp && <small>{t.keepStamp}</small>}
            {(rank > 1 || record > 0) && (
              <small title={`${t.passbook}: ${rank}/5 · ${t.best}: ${record}`}>
                {rank}/5{medal > 0 && ` · ${t.medal[medal - 1]}`}
              </small>
            )}
          </button>
          <button
            className="sp-station-link"
            type="button"
            data-sp-news=""
            aria-haspopup="dialog"
            onClick={() => {
              setOffice('news');
              radioNews(true);
            }}
          >
            <span className="sp-station-number">4</span>
            <img src={`${ART}farmer-randy.webp`} alt="" width="27" height="33" />
            <b>{t.news}</b>
            <span>{t.newsPromo}</span>
            <strong>{t.tune} ›</strong>
          </button>
        </div>
      </div>
      <div
        ref={scene}
        className="south-park-scene no-export"
        data-compact={compact || undefined}
        data-snacks={snacks || undefined}
      >
        <div className="sp-snow" aria-hidden="true">
          {Array.from({ length: 17 }, (_, i) => (
            <i
              key={i}
              style={
                {
                  '--n': i,
                  left: `${(i * 53 + 4) % 100}%`,
                  animationDelay: `${-(i * 1.73)}s`,
                  animationDuration: `${10 + (i % 5)}s`,
                } as CSSProperties
              }
            />
          ))}
        </div>
        {CAST.map((name, i) => {
          const file =
            outfit === 'ski' && i < 2
              ? `${name}-ski`
              : outfit === 'cop' && i === 2
                ? 'cop'
                : (outfit === 'hero' || (palette === 'mysterion' && incident === null)) && i === 3
                  ? 'mysterion'
                  : patrol && costumes && incident === null
                    ? ['toolshed', 'the-human-kite', 'the-coon', 'mysterion'][i]
                    : i === 2 && keepStamp
                      ? 'wizard'
                      : name;
          return (
            <div
              className="sp-kid"
              key={name}
              data-actor={name}
              data-hit={prank?.to === i || undefined}
              data-case={i === 3 && incident !== null ? incident : undefined}
              hidden
            >
              <div className="sp-leap">
                <div className="sp-feet">
                  <button
                    type="button"
                    className="sp-actor"
                    aria-label={t.action[i]}
                    title={t.action[i]}
                    data-sp-boy={name}
                  >
                    <img
                      className="sp-cutout"
                      src={`${ART}${file}.webp`}
                      alt=""
                      draggable="false"
                    />
                  </button>
                  {line?.kid === i && (
                    <div key={line.id} className="sp-balloon" aria-hidden="true">
                      {line.text}
                      {(['gotHim', 'reply', 'cop', 'exit', 'cat', 'towel', 'snacks'] as const).map(
                        (key) =>
                          line.text === t[key] && (
                            <small
                              key={key}
                              className="sp-subtitle"
                              lang={locale === 'en' ? 'zh' : 'en'}
                            >
                              {alt[key]}
                            </small>
                          ),
                      )}
                    </div>
                  )}
                  {i === 3 && incident !== null && <CaseProp id={incident} />}
                  {i === 3 &&
                    incident !== null &&
                    (cleanupCrew || incident === 4 || incident === 6) && (
                      <img
                        className="sp-scene-evidence"
                        data-evidence={cleanupCrew ? 'rats' : 'impact'}
                        src={`${ART}${cleanupCrew ? 'rats' : incident === 4 ? 'school-bus' : 'visitors'}.webp`}
                        alt=""
                      />
                    )}
                  {cameo && i === 2 && (
                    <img className="sp-cameo" src={`${ART}${cameo}.webp`} alt="" />
                  )}
                </div>
              </div>
              {prank?.from === i && (
                <i
                  key={prank.id}
                  className={prank.snack ? 'sp-pellet sp-puff' : 'sp-pellet'}
                  style={{ '--dx': `${prank.dx}px`, '--dy': `${prank.dy}px` } as CSSProperties}
                  aria-hidden="true"
                />
              )}
            </div>
          );
        })}
      </div>
      <span className="sr-only" role="status" aria-live="polite">
        {line?.text}
      </span>
      {office === 'arcade' && (
        <Arcade
          fromKeep={fromKeep.current}
          onKeep={() => setOffice('keep')}
          onClose={() => {
            fromKeep.current = false;
            setOffice(null);
            window.dispatchEvent(new CustomEvent('sp-depot-room', { detail: false }));
          }}
        />
      )}
      {office === 'keep' && (
        <Backyard
          onStamp={() => setKeepStamp(true)}
          onClose={() => {
            fromKeep.current = true;
            setOffice('arcade');
          }}
        />
      )}
      {footer &&
        createPortal(
          <button
            className="sp-colophon"
            type="button"
            data-sp-lost-property=""
            aria-expanded={lostProperty}
            onClick={() => setLostProperty(!lostProperty)}
          >
            <img src={`${ART}${lostProperty ? 'towelie' : 'town-sign'}.webp`} alt="" />
            <span>
              <small>{t.colophon}</small>
              <b>{lostProperty ? t.towel : t.lostProperty}</b>
              {lostProperty && <small lang={locale === 'en' ? 'zh' : 'en'}>{alt.towel}</small>}
            </span>
          </button>,
          footer,
        )}
      {office === 'cases' && (
        <Drawer
          mask={caseMask}
          patrol={patrol && costumes}
          onPatrol={() => {
            if (!costumes) return;
            setPatrol(!patrol);
            try {
              localStorage.setItem('south-park-patrol', String(!patrol));
            } catch {}
          }}
          onClose={() => setOffice(null)}
        />
      )}
      {office === 'news' && (
        <ChannelFour
          onClose={() => {
            setOffice(null);
            radioNews(false);
          }}
        />
      )}
    </>
  );
}
function radioNews(active: boolean) {
  window.dispatchEvent(new CustomEvent('sp-news-room', { detail: active }));
}
