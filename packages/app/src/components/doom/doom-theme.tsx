'use client';
import dynamic from 'next/dynamic';
import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { Volume2, VolumeX, Radio, ChevronRight, ScanLine, KeyRound } from 'lucide-react';
import { ThemeHeaderToggles } from '@/components/effects/theme-header-toggles';
import { useLocale } from '@/lib/i18n/use-locale';
import { mixer, type Mixer } from './signals';
import { changePass, fresh, readPass } from './pass';
import { useTelemetry } from './telemetry';
import { logs } from './logbook';
import { FieldGuide } from './field-guide';
import { Intermission } from './intermission';
import Link from 'next/link';
import './doom-theme.css';
const Cartridge = dynamic(() => import('./sector-game'), { ssr: false });
const pals = ['hangar', 'argent', 'inferno'] as const;
export default function DoomTheme() {
  const zh = useLocale() === 'zh',
    i = Number(zh),
    L = (en: string, cn: string) => (zh ? cn : en),
    path = usePathname(),
    compact = path !== '/' && path !== '/zh';
  const [radio, setRadio] = useState<Mixer | null>(null),
    [flags, setFlags] = useState([true, true]),
    [pass, setPass] = useState(fresh),
    [game, setGame] = useState<Mixer | null>(null),
    [page, setPage] = useState(0),
    [pal, setPal] = useState(0),
    [keypad, setKeypad] = useState(false),
    [marks, setMarks] = useState(true),
    [face, setFace] = useState(0),
    [caption, setCaption] = useState(''),
    [melt, setMelt] = useState(false);
  const open = useRef<HTMLButtonElement>(null),
    cartridgeAudio = useRef<Mixer | null>(null),
    timer = useRef(0),
    pad = useRef<(n: number) => void>(() => {}),
    scene = useRef<HTMLDivElement>(null);
  const [consoleRoute, setConsoleRoute] = useState<string | null>(null);
  const expanded = consoleRoute === path;
  const launchPath = useRef<string | null>(null);
  useEffect(() => {
    if (!game) return;
    const leave = () => {
      if (location.pathname === launchPath.current) return;
      const surface = document.querySelector('.uac-game');
      if (document.pointerLockElement && surface?.contains(document.pointerLockElement))
        document.exitPointerLock();
      cartridgeAudio.current?.close();
      cartridgeAudio.current = null;
      launchPath.current = null;
      setGame(null);
      requestAnimationFrame(() =>
        document
          .querySelector<HTMLElement>('main a[href],header a[href="/"],main button')
          ?.focus({ preventScroll: true }),
      );
    };
    leave();
    window.addEventListener('popstate', leave);
    return () => window.removeEventListener('popstate', leave);
  }, [game, path]);
  const returnTo = useRef<HTMLElement | null>(null);
  const reveal = (trigger: HTMLElement | null) => {
    returnTo.current = trigger;
    setConsoleRoute(path);
    requestAnimationFrame(() => {
      const controls = document.querySelector<HTMLElement>('#uac-field-console');
      controls?.scrollIntoView({ block: 'center' });
      controls?.querySelector('select')?.focus({ preventScroll: true });
    });
  };
  useEffect(() => {
    const onOpen = (e: Event) => {
      returnTo.current = (e as CustomEvent<HTMLElement>).detail;
      setConsoleRoute(path);
      requestAnimationFrame(() => {
        const controls = document.querySelector<HTMLElement>('#uac-field-console');
        controls?.scrollIntoView({ block: 'center' });
        controls?.querySelector('select')?.focus({ preventScroll: true });
      });
    };
    window.addEventListener('doom-field-open', onOpen);
    return () => window.removeEventListener('doom-field-open', onOpen);
  }, [path]);
  const closeConsole = () => {
    setConsoleRoute(null);
    requestAnimationFrame(() => returnTo.current?.focus());
  };
  useTelemetry(marks, zh);
  const secret = (n: number) => {
    radio?.arm();
    radio?.cue('secret');
    setPass(
      changePass((p) => {
        p.cheats |= 1 << n;
        if (n) p.keys = 7;
      }),
    );
    setFace(n ? 3 : 4);
    setCaption(
      n
        ? L('IDKFA accepted. Three keycard trophies online.', 'IDKFA 已接受。三张门卡已上线。')
        : L('IDDQD accepted. Gold visor online.', 'IDDQD 已接受。金色面罩已上线。'),
    );
    clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      setCaption('');
      setFace(0);
    }, 3200);
  };
  pad.current = secret;
  useEffect(() => {
    const a = mixer();
    setRadio(a);
    setFlags(a.flags());
    setPass(readPass());
    let initPal = 0;
    try {
      initPal = Math.max(
        0,
        pals.indexOf(localStorage.getItem('doom-channel') as (typeof pals)[number]),
      );
      setMarks(localStorage.getItem('doom-marks') !== 'false');
      if (
        !sessionStorage.getItem('doom-entry') &&
        !matchMedia('(prefers-reduced-motion: reduce)').matches
      ) {
        setMelt(true);
        sessionStorage.setItem('doom-entry', '1');
      }
    } catch {
      /* optional */
    }
    setPal(initPal);
    document.documentElement.dataset.uacChannel = pals[initPal];
    const meltTimer = window.setTimeout(() => setMelt(false), 740);
    const sync = () => setPass(readPass());
    const syncMix = () => {
      a.sync();
      setFlags(a.flags());
    };
    window.addEventListener('doom-mix', syncMix);
    window.addEventListener('doom-pass', sync);
    const trace = () => {
      a.cue('secret');
      setFace(3);
      clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setFace(0), 1700);
    };
    window.addEventListener('doom-peak', trace);
    let cheat = '',
      frame = 0,
      last = 0;
    const gestures = (ev: Event) => {
      if (!ev.isTrusted || document.hidden || cartridgeAudio.current) return;
      // These controls decide for themselves whether and which mix should start.
      if (ev.target instanceof Element && ev.target.closest('.uac-audio,.uac-dials,.uac-launch'))
        return;
      if (
        ev instanceof KeyboardEvent &&
        ['Shift', 'Control', 'Alt', 'Meta', 'Tab', 'Escape'].includes(ev.key)
      )
        return;
      a.arm();
    };
    const click = (e: Event) => {
      const el = e.target instanceof Element ? e.target : null;
      if (!el || cartridgeAudio.current || el.closest('.uac-game,.uac-audio')) return;
      if (el.closest('button,a,[role="tab"],[role="switch"],select')) a.cue('door');
      if (
        el.closest(
          '.dot-group,.unofficial-overlay-pt,canvas.canvas-point-surface,[data-testid*="pin"]',
        )
      ) {
        setFace(3);
        clearTimeout(timer.current);
        timer.current = window.setTimeout(() => setFace(0), 1400);
      }
    };
    const hover = (e: Event) => {
      if (cartridgeAudio.current) return;
      if (
        !matchMedia('(hover: hover)').matches ||
        !(e.target instanceof Element) ||
        !e.target.closest('button,[role="tab"]') ||
        performance.now() - last < 220
      )
        return;
      last = performance.now();
      a.cue('tick');
    };
    const type = (e: KeyboardEvent) => {
      if (
        e.metaKey ||
        e.ctrlKey ||
        e.altKey ||
        (e.target instanceof Element &&
          e.target.closest('input,textarea,select,[contenteditable="true"],[role="dialog"]'))
      )
        return;
      if (e.key.length === 1) {
        cheat = (cheat + e.key.toLowerCase()).slice(-5);
        if (cheat === 'iddqd') pad.current(0);
        if (cheat === 'idkfa') pad.current(1);
      }
    };
    const offset = () => {
      frame = 0;
      if (scene.current && !matchMedia('(prefers-reduced-motion: reduce)').matches)
        scene.current.style.setProperty('--uac-depth', `${Math.min(96, scrollY * 0.085)}px`);
    };
    const scroll = () => {
      if (!frame) frame = requestAnimationFrame(offset);
    };
    const vis = () => {
      if (document.hidden) a.sleep();
    };
    window.addEventListener('scroll', scroll, { passive: true });
    document.addEventListener('pointerdown', gestures, true);
    document.addEventListener('keydown', gestures, true);
    document.addEventListener('keydown', type);
    document.addEventListener('click', click);
    document.addEventListener('pointerover', hover);
    document.addEventListener('visibilitychange', vis);
    return () => {
      window.removeEventListener('scroll', scroll);
      window.removeEventListener('doom-pass', sync);
      window.removeEventListener('doom-peak', trace);
      window.removeEventListener('doom-mix', syncMix);
      document.removeEventListener('pointerdown', gestures, true);
      document.removeEventListener('keydown', gestures, true);
      document.removeEventListener('keydown', type);
      document.removeEventListener('click', click);
      document.removeEventListener('pointerover', hover);
      document.removeEventListener('visibilitychange', vis);
      clearTimeout(timer.current);
      clearTimeout(meltTimer);
      cancelAnimationFrame(frame);
      a.close();
      cartridgeAudio.current?.close();
      cartridgeAudio.current = null;
      delete document.documentElement.dataset.uacChannel;
    };
  }, []);
  const channel = (n: number) => {
    setPal(n);
    radio?.station((['gate', 'division', 'complex'] as const)[n]);
    radio?.arm();
    document.documentElement.dataset.uacChannel = pals[n];
    try {
      localStorage.setItem('doom-channel', pals[n]);
    } catch {
      /* optional */
    }
  };
  const toggle = () => {
    radio?.switch();
    if (radio) setFlags(radio.flags());
  };
  const audio = (
    <div className="uac-audio">
      <button
        aria-label={L('DOOM audio', 'DOOM 声音')}
        title={L('DOOM audio', 'DOOM 声音')}
        aria-pressed={flags[0]}
        onClick={toggle}
      >
        {flags[0] ? <Volume2 size={15} /> : <VolumeX size={15} />}
      </button>
    </div>
  );
  const names = [L('Hangar', '机库'), L('Argent lab', '银色实验室'), L('Inferno', '炼狱')];
  const runCartridge = (button: HTMLButtonElement) => {
    if (cartridgeAudio.current) return;
    open.current = button;
    radio?.sleep();
    const cart = mixer('doom-game-beat');
    launchPath.current = location.pathname;
    cartridgeAudio.current = cart;
    cart.arm();
    setGame(cart);
  };
  return (
    <>
      <div ref={scene} className="doom-scene" data-testid="doom-scene" aria-hidden="true">
        <picture>
          <source media="(max-width:640px)" srcSet="/decorative/doom/doom-hell-mobile.webp" />
          <img src="/decorative/doom/doom-hell.webp" alt="" />
        </picture>
        <div className="uac-ridge" />
        <div className="uac-embers" />
      </div>
      <ThemeHeaderToggles>{audio}</ThemeHeaderToggles>
      <Intermission path={path ?? '/'} zh={zh} />
      <section
        data-testid="doom-theme-banner"
        className="uac-wrap container mx-auto px-4 lg:px-8"
        data-subroute={compact}
        data-folded={!expanded}
        aria-label={L('UAC control station', 'UAC 控制站')}
      >
        <section
          className="uac-briefing"
          data-compact={compact}
          aria-label={L('UAC mission briefing', 'UAC 任务简报')}
        >
          <div className="uac-briefing-window">
            <img
              className="uac-window-scene"
              src={`/decorative/doom/${['zigzag', 'mars', 'babel'][pal]}.webp`}
              alt=""
            />
            <img className="uac-window-mark" src="/decorative/doom/doom-logo.webp" alt="" />
            {!compact && !expanded && (
              <button
                type="button"
                className="uac-launch uac-direct-launch"
                onClick={(e) => runCartridge(e.currentTarget)}
              >
                {L('Run DOOM', '运行 DOOM')} <ChevronRight size={14} aria-hidden="true" />
              </button>
            )}
          </div>
          <div className="uac-briefing-text">
            <small>
              {L('UNION AEROSPACE  /  FIELD TRANSMISSION', '联合航天集团  /  战地通讯')}
            </small>
            <strong>
              {
                [
                  L('E1M1: Hangar', 'E1M1：机库'),
                  L('Mars Core', '火星核心'),
                  L('Tower of Babel', '通天塔'),
                ][pal]
              }
            </strong>
            <span>
              {
                [
                  L('Knee-Deep in the Dead', '深入尸海'),
                  L('Argent delivery channel', '银色能量运输频道'),
                  L('The Shores of Hell', '地狱海岸'),
                ][pal]
              }
            </span>
            {!compact && (
              <Link
                className="uac-freight-clue"
                href={`${zh ? '/zh' : ''}/infx/inference?g_model=DeepSeek-R1-0528&i_prec=fp4,fp8&i_linelabel=0`}
                onClick={() => {
                  try {
                    sessionStorage.setItem('doom-freight', 'ticket');
                  } catch {
                    /* optional */
                  }
                }}
              >
                {L('E1M1 freight slip → Deliver to Mars Core', 'E1M1 货运单 → 送往火星核心')}
              </Link>
            )}
          </div>
          <button
            type="button"
            className="uac-field-open uac-ticket-open"
            aria-expanded={expanded}
            aria-controls="uac-field-console"
            onClick={(e) => (expanded ? closeConsole() : reveal(e.currentTarget))}
          >
            <Radio size={15} aria-hidden="true" />
            {expanded ? L('Close console', '收起控制台') : L('Field console', '战地控制台')}
          </button>
        </section>
        <div
          id="uac-field-console"
          className="doom-theme-banner"
          hidden={!expanded}
          data-compact={compact ? 'true' : 'false'}
        >
          <div className="uac-guide-frame">
            <FieldGuide zh={zh} radio={radio} />
            {melt && (
              <div className="uac-melt" aria-hidden="true">
                {Array.from({ length: 18 }, (_, j) => (
                  <i key={j} style={{ animationDelay: `${(j * 71) % 183}ms` }} />
                ))}
              </div>
            )}
          </div>
          <div className="uac-console">
            <div className="uac-portrait" data-god={Boolean(pass.cheats & 1)}>
              <div
                role="img"
                aria-label={L('Marine status portrait', '陆战队员状态头像')}
                className="uac-face"
                style={{
                  backgroundPosition: `${(face || (pass.cheats & 1 ? 4 : page % 3)) * 20}% bottom`,
                }}
              />
            </div>
            <button
              className="uac-log"
              title={L('Next station log', '下一条站点日志')}
              onClick={() => {
                setPage((v) => (v + 1) % logs.length);
                radio?.cue('tick');
              }}
            >
              <small>
                <Radio size={11} /> {L('STATION LOG', '站点日志')} /{' '}
                {String(page + 1).padStart(2, '0')}
              </small>
              <span>
                {caption ||
                  (!page && pass.rank > 0
                    ? L(
                        `E1M${pass.rank} secure · ${pass.scrap} salvage · armory ${pass.upgrades.join('/')}`,
                        `E1M${pass.rank} 已通关 · ${pass.scrap} 零件 · 军械库 ${pass.upgrades.join('/')}`,
                      )
                    : logs[page][i])}{' '}
                <ChevronRight size={12} />
              </span>
            </button>
            <div className="uac-cards" aria-label={L('Saved keycard trophies', '已保存的门卡奖杯')}>
              {[0, 1, 2].map((n) => (
                <i key={n} data-on={Boolean(pass.keys & (1 << n))} title={names[n]} />
              ))}
            </div>
            <button className="uac-launch" onClick={(e) => runCartridge(e.currentTarget)}>
              <span>
                {L('Run DOOM', '运行 DOOM')} <ChevronRight size={18} />
              </span>
              <small>
                {L('SECTORS', '扇区')} {pass.rank}/5
              </small>
            </button>
          </div>
          <div className="uac-rail">
            <div className="uac-dials">
              {names.map((n, j) => (
                <button
                  key={n}
                  aria-pressed={pal === j}
                  onClick={() => channel(j)}
                  title={
                    [
                      L('Hangar radio: At Doom’s Gate', '机库广播：毁灭之门'),
                      L('Argent radio: BFG Division', '银色广播：BFG 部门'),
                      L(
                        'Inferno radio: The Only Thing They Fear Is You',
                        '炼狱广播：他们唯一畏惧的就是你',
                      ),
                    ][j]
                  }
                >
                  <i />
                  {n}
                </button>
              ))}
            </div>
            <div className="uac-aux">
              <button type="button" className="uac-field-close" onClick={closeConsole}>
                {L('Close console', '收起控制台')}
              </button>
              <button
                aria-pressed={marks}
                aria-label={L('Chart stencils', '图表模板')}
                title={L('Chart stencils', '图表模板')}
                onClick={() => {
                  setMarks(!marks);
                  try {
                    localStorage.setItem('doom-marks', String(!marks));
                  } catch {
                    /* optional */
                  }
                }}
              >
                <ScanLine size={13} />
              </button>
              <button aria-expanded={keypad} onClick={() => setKeypad(!keypad)}>
                <KeyRound size={12} />
                {L('Keypad', '键盘')}
              </button>
              <span className="uac-mobile-audio">{audio}</span>
            </div>
          </div>
          {keypad && (
            <div className="uac-keypad">
              <span>{L('Service codes', '维护代码')}</span>
              <button onClick={() => secret(0)}>IDDQD</button>
              <button onClick={() => secret(1)}>IDKFA</button>
              <span>
                {L('Record', '纪录')} {pass.best} · {L('Surges', '浪潮')} {pass.waves}
              </span>
            </div>
          )}
        </div>
        <span role="status" className="sr-only">
          {caption}
        </span>
      </section>
      {game && (
        <Cartridge
          radio={game}
          onClose={() => {
            cartridgeAudio.current?.close();
            cartridgeAudio.current = null;
            setGame(null);
            radio?.arm();
            requestAnimationFrame(() => open.current?.focus());
          }}
        />
      )}
    </>
  );
}
