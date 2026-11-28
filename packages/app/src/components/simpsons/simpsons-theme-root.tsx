'use client';

import { useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { createPortal } from 'react-dom';
import { Clapperboard, Play, CircleDot } from 'lucide-react';
import { useLocale } from '@/lib/i18n/use-locale';
import { broadcastAudio } from './audio';
import { useDonutMarkers } from './donut-markers';
import { beats, runPrank } from './prank-stage';
import { ChartStrips } from './chart-strips';
import { ART, STRINGS } from './strings';
import { ChannelSix } from './channel-six';
import { SpringfieldDesk } from './assignment-desk';
import { ThemeHeaderToggles } from '@/components/effects/theme-header-toggles';
import SimpsonsToggles from './simpsons-toggles';
import './simpsons-theme.css';
const FrontierGame = dynamic(() => import('./frontier-game'), { ssr: false });
const PrankFile = dynamic(() => import('./prank-file'), { ssr: false });
const eggOrder = ['doh', 'caramba', 'shorts', 'sax', 'couch', 'donuts', 'haha', 'boring'] as const;
const channels = ['day', 'plant', 'tavern'] as const;

const sequence = [
  'arrowup',
  'arrowup',
  'arrowdown',
  'arrowdown',
  'arrowleft',
  'arrowright',
  'arrowleft',
  'arrowright',
  'b',
  'a',
];
type Cameo = (typeof eggOrder)[number];
const cameoSounds = {
  couch: 'theme',
  doh: 'doh',
  boring: 'boring',
  donuts: 'donuts',
  haha: 'ha-ha',
  caramba: 'ay-caramba',
  shorts: 'shorts',
  sax: 'sax',
} as const;
const cameoArt = {
  couch: 'couch-heads',
  doh: 'homer',
  boring: 'homer',
  donuts: 'homer',
  haha: 'nelson',
  caramba: 'bart-ollie',
  shorts: 'bart-board',
  sax: 'lisa-sax',
} as const;

export default function SimpsonsTheme() {
  const copy = STRINGS[useLocale()];
  const pathname = usePathname();
  const home = /^\/(?:zh\/?)?$/.test(pathname ?? '/'),
    zh = copy === STRINGS.zh;
  const [studioRoute, setStudioRoute] = useState<string | null>(null);
  const [chartSlot, setChartSlot] = useState<HTMLDivElement | null>(null);
  const studioOpen = studioRoute === pathname;
  const inChart = !home && chartSlot?.isConnected;
  const placeTicket = (node: React.ReactNode) =>
    inChart && chartSlot ? createPortal(node, chartSlot) : node;
  const toggleStudio = () => {
    setStudioRoute(studioOpen ? null : pathname);
    if (!studioOpen && inChart)
      requestAnimationFrame(() => {
        const s = document.querySelector<HTMLElement>('#sp-studio-desk');
        s?.scrollIntoView({ block: 'center' });
        s?.querySelector<HTMLSelectElement>('select')?.focus({ preventScroll: true });
      });
  };
  const [game, setGame] = useState<string | null>(null),
    [dossier, setDossier] = useState(false),
    [badges, setBadges] = useState(0),
    [channel, setChannel] = useState(0),
    [found, setFound] = useState<string[]>([]);
  const ledger = useRef({ score: [0, 0] as [number, number], found: [] as string[] });
  useEffect(() => {
    if (!game) return;
    const leave = () => {
      if (location.pathname !== game) setGame(null);
    };
    if (game !== pathname) setGame(null);
    window.addEventListener('popstate', leave);
    return () => window.removeEventListener('popstate', leave);
  }, [game, pathname]);
  const foil = useRef<((i: number) => void) | null>(null);
  const [line, setLine] = useState(0);
  const [score, setScore] = useState<[number, number]>([0, 0]);
  const [high, setHigh] = useState(0);
  const [cameo, setCameo] = useState<Cameo | null>(null);
  const [still, setStill] = useState('');
  const [announcement, setAnnouncement] = useState('');
  const [assignment, setAssignment] = useState(0);
  const assign = (next: number) => {
    setAssignment(next);
    try {
      sessionStorage.setItem('simpsons-field-trip', String(next));
    } catch {
      /* optional */
    }
  };
  const [donutPoints, setDonutPoints] = useState(true);
  const [footer, setFooter] = useState<HTMLElement | null>(null);
  const [screen, setScreen] = useState(false);
  const stage = useRef<HTMLDivElement>(null);
  const broadcast = useRef<((clip: string) => void) | null>(null);
  const board = useRef<HTMLDivElement>(null);
  const cue = useRef<((chart?: SVGSVGElement) => void) | null>(null);
  const donut = useRef<(() => void) | null>(null);
  useEffect(() => {
    try {
      setAssignment(
        Math.min(2, Math.max(0, Number(sessionStorage.getItem('simpsons-field-trip')) || 0)),
      );
      const ls = JSON.parse(localStorage.getItem('simpsons-dossier-v1') || '{}'),
        saved = JSON.parse(localStorage.getItem('simpsons-rink-pass-v1') || '{}');
      if (
        Array.isArray(ls.score) &&
        ls.score.length === 2 &&
        ls.score.every((x: unknown) => typeof x === 'number' && Number.isFinite(x) && x >= 0)
      )
        ledger.current.score = ls.score;
      if (Array.isArray(ls.found))
        ledger.current.found = ls.found.filter(
          (v: unknown) => typeof v === 'string' && /^(?:egg[0-7]|gag[0-6])$/.test(v),
        );
      setScore(ledger.current.score);
      setFound(ledger.current.found);
      setHigh(Math.max(0, Number(saved.best?.shift) || 0));
      setBadges(Array.isArray(saved.medals) ? saved.medals.filter(Boolean).length : 0);
      setChannel(
        Math.max(
          0,
          (channels as readonly string[]).indexOf(localStorage.getItem('simpsons-channel') ?? ''),
        ),
      );
    } catch {
      /* storage optional */
    }
    const badge = (e: Event) => {
      setBadges((e as CustomEvent<number>).detail);
      try {
        const saved = JSON.parse(localStorage.getItem('simpsons-rink-pass-v1') || '{}');
        setHigh(Math.max(0, Number(saved.best?.shift) || 0));
      } catch {
        /* storage optional */
      }
    };
    window.addEventListener('simpsons-rink-badge', badge);
    return () => window.removeEventListener('simpsons-rink-badge', badge);
  }, []);
  useEffect(() => {
    document.documentElement.dataset.simpsonsChannel = channels[channel];
    return () => {
      delete document.documentElement.dataset.simpsonsChannel;
    };
  }, [channel]);
  useEffect(() => {
    const el = document.documentElement,
      mq = matchMedia('(prefers-reduced-motion: reduce)');
    let frame = 0;
    const sync = () => {
      frame = 0;
      el.style.setProperty(
        '--sp-parallax',
        mq.matches ? '0px' : `${Math.round(-window.scrollY * 0.16) % 340}px`,
      );
    };
    const change = () => {
      if (!frame && !document.hidden) frame = requestAnimationFrame(sync);
    };
    sync();
    window.addEventListener('scroll', change, { passive: true });
    mq.addEventListener('change', change);
    return () => {
      window.removeEventListener('scroll', change);
      mq.removeEventListener('change', change);
      cancelAnimationFrame(frame);
      el.style.removeProperty('--sp-parallax');
    };
  }, []);
  useDonutMarkers(donutPoints, copy);
  useEffect(() => {
    setFooter(document.querySelector<HTMLElement>('[data-testid="footer"]'));
    const deck = stage.current,
      chalk = board.current;
    if (!deck || !chalk) return;
    const motion = matchMedia('(prefers-reduced-motion: reduce)');
    const audio = broadcastAudio();
    broadcast.current = (clip) => audio.play(clip, clip === 'opening-loop' ? 'music' : 'sound');
    const log = (key?: string, winner?: 0 | 1) => {
      const v = ledger.current;
      if (key && !v.found.includes(key)) {
        v.found = [...v.found, key];
        setFound(v.found);
      }
      if (winner !== undefined) {
        v.score = winner === 0 ? [v.score[0] + 1, v.score[1]] : [v.score[0], v.score[1] + 1];
        setScore(v.score);
      }
      try {
        localStorage.setItem('simpsons-dossier-v1', JSON.stringify(v));
      } catch {
        /* optional */
      }
    };
    let round = 0,
      bites = 0,
      keys: string[] = [],
      letters = '',
      idle = 0,
      pending = 0,
      close = 0,
      flip = 0,
      reset = 0,
      poll = 0,
      lineClock = 0;
    let lastTake = -Infinity,
      lastActivity = 0;
    let cleanup: (() => void) | null = null;
    let chartTake = false;
    const canMove = () => !document.hidden && !motion.matches;
    const endTake = () => {
      clearTimeout(reset);
      cleanup?.();
      cleanup = null;
      chartTake = false;
    };
    const endCameo = () => {
      clearTimeout(close);
      clearTimeout(flip);
      setCameo(null);
      setStill('');
    };
    const show = (kind: Cameo, silent = false) => {
      if (document.hidden || document.querySelector('.simpsons-rink')) return;
      if (!silent) log(`egg${eggOrder.indexOf(kind)}`);
      clearTimeout(close);
      clearTimeout(flip);
      setScreen(false);
      setStill('');
      setCameo(kind);
      if (!silent) audio.play(cameoSounds[kind], kind === 'couch' ? 'music' : 'sound');
      if (kind === 'couch')
        flip = window.setTimeout(() => setScreen(true), motion.matches ? 0 : 880);
      close = window.setTimeout(() => setCameo(null), kind === 'couch' ? 4000 : 2400);
    };
    const chartRounds = new WeakMap<SVGSVGElement, number>();
    const take = (manual = false, chart?: SVGSVGElement) => {
      if (
        document.hidden ||
        matchMedia('(forced-colors: active)').matches ||
        (!canMove() && !(manual && chart)) ||
        cleanup ||
        (!manual && performance.now() - lastTake < 9500)
      )
        return;
      if (
        !manual &&
        document.querySelector(
          '[role="dialog"][data-state="open"],[data-chart-tooltip]:not([hidden]):hover',
        )
      )
        return;
      const chartRound = chart ? (chartRounds.get(chart) ?? 0) : round;
      const shot = runPrank(
        deck,
        chalk,
        chartRound,
        manual,
        copy,
        (winner, clip) => {
          const gag = document.querySelector('.simpsons-rider')
            ? -1
            : beats.findIndex((b) => b.clip === clip);
          log(gag < 0 ? undefined : `gag${gag}`, winner);
          if (manual) setAnnouncement(gag < 0 ? copy.ride : copy.gags[gag]);
          audio.play(clip);
        },
        chart,
      );
      if (!shot) return;
      if (chart) chartRounds.set(chart, chartRound + 1);
      round++;
      lastTake = performance.now();
      cleanup = shot.cleanup;
      chartTake = Boolean(chart);
      reset = window.setTimeout(endTake, shot.duration + 20);
    };
    cue.current = (chart) => {
      endCameo();
      if (!chart) {
        chart =
          document.querySelector<SVGSVGElement>(
            'figure svg[data-testid="d3-chart-svg"]:has(path.roofline-path)',
          ) ?? undefined;
        if (chart) chart.scrollIntoView({ block: 'center', behavior: 'instant' });
      }
      if (motion.matches && !chart) {
        const index = round++ % beats.length;
        const { winner, clip } = beats[index];
        log(`gag${index}`, winner);
        setStill(copy.gags[index]);
        audio.play(clip);
        close = window.setTimeout(() => setStill(''), 2300);
        return;
      }
      if (chart) endTake();
      take(true, chart);
    };
    donut.current = () => {
      if (++bites % 3 === 0) show('donuts');
    };
    foil.current = (i) => {
      if (eggOrder[i]) show(eggOrder[i]);
    };
    const prize = (e: Event) => {
      const n = (e as CustomEvent).detail;
      if (n === 0 || n === 1) log(undefined, n);
    };
    const rink = (e: Event) => {
      if ((e as CustomEvent).detail) {
        endTake();
        endCameo();
      }
    };
    const scroll = () => {
      // The explicit replay lives in the chart's sibling. Page anchoring or a
      // finger scroll moves both together; neither invalidates the local rail.
      if (chartTake) return;
      endTake();
      clearTimeout(pending);
      if (canMove()) pending = window.setTimeout(() => take(), 360);
    };
    const activity = () => {
      if (performance.now() - lastActivity < 500) return;
      lastActivity = performance.now();
      clearTimeout(idle);
      if (!document.hidden) idle = window.setTimeout(() => show('boring'), 65000);
    };
    const key = (e: KeyboardEvent) => {
      if (
        e.repeat ||
        e.isComposing ||
        e.ctrlKey ||
        e.metaKey ||
        e.altKey ||
        (e.target instanceof Element &&
          e.target.closest(
            'input,textarea,select,[contenteditable="true"],[role="textbox"],[role="dialog"]',
          ))
      )
        return;
      const k = e.key.toLowerCase();
      keys = [...keys.slice(-9), k];
      if (keys.join(',') === sequence.join(',')) {
        show('couch');
        keys = [];
      }
      if (/^[a-z]$/.test(k)) {
        letters = (letters + k).slice(-11);
        if (letters.endsWith('doh')) show('doh');
        else if (letters.endsWith('caramba')) show('caramba');
        else if (letters.endsWith('eatmyshorts')) show('shorts');
        else if (letters.endsWith('sax')) show('sax');
      }
    };
    const click = (e: MouseEvent) => {
      if (e.target instanceof Element && e.target.closest('[data-testid="header-brand"]'))
        show('haha');
    };
    const stopClocks = () => {
      clearInterval(poll);
      clearInterval(lineClock);
      clearTimeout(pending);
      clearTimeout(idle);
      endTake();
      endCameo();
    };
    const resume = () => {
      stopClocks();
      if (document.hidden) return;
      if (canMove()) {
        pending = window.setTimeout(() => take(), 950);
        poll = window.setInterval(() => take(), 13000);
        lineClock = window.setInterval(() => setLine((i) => (i + 1) % copy.lines.length), 11000);
      }
      idle = window.setTimeout(() => show('boring'), 65000);
    };
    resume();
    window.addEventListener('scroll', scroll, { passive: true });
    window.addEventListener('resize', scroll);
    window.addEventListener('pointermove', activity, { passive: true });
    window.addEventListener('pointerdown', activity);
    window.addEventListener('keydown', activity);
    window.addEventListener('keydown', key);
    window.addEventListener('click', click, true);
    motion.addEventListener('change', resume);
    document.addEventListener('visibilitychange', resume);
    window.addEventListener('simpsons-arcade-point', prize);
    window.addEventListener('simpsons-rink-open', rink);
    return () => {
      stopClocks();
      audio.dispose();
      broadcast.current = null;
      cue.current = null;
      donut.current = null;
      foil.current = null;
      window.removeEventListener('simpsons-arcade-point', prize);
      window.removeEventListener('simpsons-rink-open', rink);
      window.removeEventListener('scroll', scroll);
      window.removeEventListener('resize', scroll);
      window.removeEventListener('pointermove', activity);
      window.removeEventListener('pointerdown', activity);
      window.removeEventListener('keydown', activity);
      window.removeEventListener('keydown', key);
      window.removeEventListener('click', click, true);
      motion.removeEventListener('change', resume);
      document.removeEventListener('visibilitychange', resume);
    };
  }, [copy]);
  return (
    <>
      <SpringfieldDesk zh={zh} path={pathname ?? '/'} play={(clip) => broadcast.current?.(clip)} />
      <ThemeHeaderToggles>
        <SimpsonsToggles />
      </ThemeHeaderToggles>
      <div
        data-testid="simpsons-theme-banner"
        className="simpsons-shell container mx-auto px-4 lg:px-8 no-export"
      >
        {placeTicket(
          <section
            className="sp-broadcast-ticket"
            data-home={home}
            aria-label={zh ? '春田镇第六频道' : 'Springfield Channel 6'}
          >
            <div className="sp-ticket-illustration" aria-hidden="true">
              <img
                className="sp-ticket-scene"
                src={`${ART}${['terrace', 'plant-shift', 'prank-line'][channel]}.webp`}
                alt=""
              />
              {channel === 0 && (
                <img className="sp-ticket-family" src={`${ART}family-portrait.webp`} alt="" />
              )}
              <img className="sp-ticket-logo" src={`${ART}gold-title.webp`} alt="" />
            </div>
            <div className="sp-ticket-listing">
              <small>{zh ? '第六频道 · 春田镇现场' : 'CHANNEL 6  /  LIVE FROM SPRINGFIELD'}</small>
              <strong>
                {
                  (zh
                    ? ['常青台街742号', '第七区控制室', '莫酒馆的恶作剧来电']
                    : [
                        '742 Evergreen Terrace',
                        'The Sector 7G control room',
                        'A prank call to Moe’s',
                      ]
                  )[channel]
                }
              </strong>
              <span>
                {zh ? `巴特 ${score[0]} : ${score[1]} 莉萨` : `Bart ${score[0]} : ${score[1]} Lisa`}
              </span>
              {home && (
                <Link
                  prefetch={false}
                  className="sp-cable-clue"
                  href={`${zh ? '/zh' : ''}/infx/inference?g_model=DeepSeek-R1-0528&i_prec=fp4,fp8`}
                  onClick={() => {
                    try {
                      sessionStorage.setItem('sp-cable-trail', 'clue');
                    } catch {
                      /* optional */
                    }
                  }}
                >
                  {zh ? '742 号来电：追踪信号 ›' : '742 is calling: trace the signal ›'}
                </Link>
              )}
            </div>
            <div className="sp-ticket-remote">
              <div className="sp-channel-dial" role="group" aria-label={copy.dial}>
                {channels.map((v, i) => (
                  <button
                    type="button"
                    key={v}
                    aria-pressed={channel === i}
                    aria-label={copy.channels[i]}
                    title={copy.channels[i]}
                    onClick={() => {
                      setChannel(i);
                      if (i !== channel)
                        broadcast.current?.(['opening-loop', 'doh', 'bart-laugh'][i]);
                      try {
                        localStorage.setItem('simpsons-channel', v);
                      } catch {
                        /* optional */
                      }
                    }}
                  >
                    <i />
                    {copy.shortChannels[i]}
                  </button>
                ))}
              </div>
              <button
                type="button"
                className="sp-studio-open"
                aria-expanded={studioOpen}
                aria-controls="sp-studio-desk"
                onClick={toggleStudio}
              >
                <Clapperboard size={15} aria-hidden="true" />
                {studioOpen
                  ? zh
                    ? '收起演播室'
                    : 'Close studio'
                  : zh
                    ? '打开演播室'
                    : 'Open studio'}
              </button>
            </div>
          </section>,
        )}
        <div
          id="sp-studio-desk"
          className="simpsons-banner"
          hidden={!studioOpen}
          data-compact={!home}
        >
          <ChannelSix
            zh={copy === STRINGS.zh}
            home={/^\/(?:zh\/?)?$/.test(pathname ?? '/')}
            reward={found.filter((s) => s.startsWith('egg')).length === 8}
            play={(clip) => broadcast.current?.(clip)}
          />
          <div className="simpsons-board" ref={board}>
            <button
              className="sp-chalk-next"
              type="button"
              title={copy.nextLine}
              aria-label={copy.nextLine}
              onClick={() => {
                setLine((i) => (i + 1) % copy.lines.length);
                if (!assignment && /^\/(?:zh\/?)?$/.test(pathname ?? '/')) assign(1);
              }}
            />
            <div className="simpsons-board-text">
              <div className="simpsons-board-meta">
                <span>{copy.chalk}</span>
                <i aria-hidden="true" />{' '}
                <span>
                  {copy.detention} {String(line + 1).padStart(2, '0')}
                </span>
              </div>
              <p>{copy.lines[line]}</p>
              {assignment > 0 && (
                <small className="sp-field-trip" aria-live="polite">
                  {
                    (copy === STRINGS.zh
                      ? ['', '课外作业 1/2 · 去图表让巴特滑一趟。', '课外作业 2/2 · 莉萨已签字。']
                      : [
                          '',
                          'Field trip 1/2 · Cue Bart at a chart.',
                          'Field trip 2/2 · Signed by Lisa.',
                        ]
                    )[assignment]
                  }
                </small>
              )}
              <div className="simpsons-chalk-dash" aria-hidden="true" />
            </div>
            <img className="simpsons-board-marge" src={`${ART}marge.webp`} alt="" />
          </div>
          <div className="simpsons-score">
            <div className="simpsons-score-label">
              <Clapperboard size={13} aria-hidden="true" />
              {copy.score}
            </div>
            <button
              type="button"
              aria-label={`${copy.dossier}: ${score[0]} : ${score[1]}`}
              aria-haspopup="dialog"
              title={copy.dossier}
              className="simpsons-scores"
              onClick={() => setDossier(true)}
            >
              <span>
                {copy.bart} <b>{score[0]}</b>
              </span>
              <i aria-hidden="true">:</i>
              <span>
                <b>{score[1]}</b> {copy.lisa}
              </span>
            </button>
            <div className="simpsons-controls">
              <button
                type="button"
                data-simpsons-control=""
                className="simpsons-cue"
                onClick={() => cue.current?.()}
              >
                <Play size={11} fill="currentColor" aria-hidden="true" />
                {copy.cue}
              </button>
              <button
                type="button"
                className="simpsons-donut-button"
                data-simpsons-control=""
                aria-label={copy.donut}
                title={copy.donut}
                onClick={() => donut.current?.()}
              >
                <img src={`${ART}donut.webp`} alt="" />
              </button>
            </div>
          </div>
          <div className="sp-program-strip">
            <button
              type="button"
              className="sp-desk-close"
              onClick={() => {
                setStudioRoute(null);
                requestAnimationFrame(() =>
                  document.querySelector<HTMLButtonElement>('.sp-studio-open')?.focus(),
                );
              }}
            >
              {zh ? '收起演播室' : 'Close studio'}
            </button>
            <div className="sp-mobile-audio">
              <SimpsonsToggles />
            </div>
            <button
              type="button"
              className="sp-tour-ticket"
              aria-haspopup="dialog"
              onClick={() => setDossier(true)}
            >
              {copy === STRINGS.zh ? '春田镇集邮之旅' : 'Springfield stamp tour'} ·{' '}
              {found.filter((s) => s.startsWith('egg')).length}/8
            </button>
            {assignment === 1 && /^\/(?:zh\/?)?$/.test(pathname ?? '/') && (
              <Link
                className="sp-field-link"
                href={`${copy === STRINGS.zh ? '/zh' : ''}/infx/inference?g_model=DeepSeek-R1-0528`}
              >
                {copy === STRINGS.zh ? '去上实践课 →' : 'To the field trip →'}
              </Link>
            )}
            <button
              className="simpsons-arcade-open"
              type="button"
              aria-haspopup="dialog"
              onClick={() => setGame(pathname)}
            >
              <Play size={12} fill="currentColor" />
              {copy.arcade}
              <b aria-label={`${copy.rink}: ${badges}/5`}>{badges}/5</b>
              {high > 0 && (
                <strong className="sp-saved-best">
                  {copy === STRINGS.zh ? '纪录' : 'Best'} {high}
                </strong>
              )}
            </button>
          </div>
        </div>
      </div>
      {game && game === pathname && <FrontierGame onClose={() => setGame(null)} />}
      {dossier && (
        <PrankFile
          copy={copy}
          found={found}
          onClose={() => setDossier(false)}
          onTry={(i) => {
            foil.current?.(i);
          }}
        />
      )}
      <span className="sr-only" aria-live="polite">
        {still || (cameo ? (cameo === 'couch' ? copy.couch : copy[cameo]) : announcement)}
      </span>
      <ChartStrips
        onSlot={setChartSlot}
        copy={copy}
        markers={donutPoints}
        toggle={() => setDonutPoints((v) => !v)}
        cue={(chart) => {
          cue.current?.(chart);
          if (chart && assignment === 1 && /\/infx\//.test(pathname ?? '')) assign(2);
        }}
      />
      <div className="simpsons-scene no-export" aria-hidden="true">
        <div ref={stage} className="simpsons-stage" />
        {still && (
          <div className="simpsons-cameo simpsons-cutaway">
            <span>{still}</span>
          </div>
        )}
        {cameo && (
          <div
            className={`simpsons-cameo ${cameo === 'couch' ? 'simpsons-tv' : 'simpsons-cutaway'}`}
          >
            {cameo === 'couch' ? (
              <>
                <div className="simpsons-tv-screen">
                  <img src={`${ART}${screen ? cameoArt.couch : 'couch-family'}.webp`} alt="" />
                </div>
                <div className="simpsons-tv-rail">
                  <i />
                  <i />
                  <span />
                </div>
                <div className="simpsons-tv-caption">
                  <span>{copy.couch}</span>
                  {copy.couchLine}
                </div>
              </>
            ) : (
              <>
                <img src={`${ART}${cameoArt[cameo]}.webp`} alt="" />
                <span>{copy[cameo]}</span>
              </>
            )}
          </div>
        )}
      </div>
      {footer &&
        createPortal(
          <div className="simpsons-signoff no-export">
            <img src={`${ART}towers.webp`} alt="" />
            <div>
              <span>{copy.stationFoot}</span>
              <strong>{copy.signoff}</strong>
            </div>
            <button
              type="button"
              aria-pressed={donutPoints}
              onClick={() => setDonutPoints((v) => !v)}
            >
              <CircleDot size={15} aria-hidden="true" />
              {copy.markers}
            </button>
          </div>,
          footer,
        )}
    </>
  );
}
