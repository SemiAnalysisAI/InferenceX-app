'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type PointerEvent as ReactPointerEvent,
} from 'react';

import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { track } from '@/lib/analytics/analytics';
import { useLocale } from '@/lib/i18n/use-locale';
import { foodDataUri } from './orange-chicken-art';
import {
  duckOcMusic,
  playOcSfx,
  resetOcMusicParams,
  setOcMusicParams,
  startOcMusic,
  unlockOcAudio,
} from './orange-chicken-audio';
import {
  Game,
  type GameConfig,
  type GameEvent,
  type GameMode,
  type Results,
  type Sandbox,
} from './orange-chicken-engine';
import { GAME_STRINGS, type GameStrings } from './orange-chicken-game-strings';
import {
  AUDITS,
  BATCHES,
  PRECISIONS,
  UPGRADES,
  ZONES,
  clamp,
  throughput,
  upgradeLevel,
  userRate,
  type Precision,
} from './orange-chicken-model';
import {
  computeLayout,
  drawHint,
  drawPanel,
  drawTop,
  drawWorld,
  toWorld,
  type Layout,
} from './orange-chicken-render';
import {
  discoverSecret,
  calmEnabled,
  emitOcEffect,
  getOcState,
  getServerOcState,
  readSave,
  setMusicEnabled,
  setSoundEnabled,
  subscribeOc,
  writeSave,
  type OcSave,
  type TrophyId,
} from './orange-chicken-store';
import { STRINGS, fill } from './orange-chicken-strings';
import './orange-chicken-game.css';

const TROPHY_OF_ACT: TrophyId[] = ['prep', 'wok', 'courier', 'chef'];

interface RunConfig {
  key: number;
  mode: GameMode;
  act: number;
  precision: Precision;
  batch: number;
  sandbox: Sandbox;
  calm: boolean;
}

type View = 'menu' | 'howto' | 'play' | 'results';

interface Outcome {
  results: Results;
  run: RunConfig;
  earned: number;
  trophy: TrophyId | null;
  best: boolean;
}

const DEFAULT_SANDBOX: Sandbox = {
  arrival: 1,
  hw: 1,
  oil: true,
  pigeons: false,
  fire: true,
  wind: false,
};

function useOcSave(): OcSave {
  return useSyncExternalStore(
    subscribeOc,
    () => getOcState().save,
    () => getServerOcState().save,
  );
}

function effectivePrecision(act: number, precision: Precision): Precision {
  const zone = ZONES[act] ?? ZONES[0]!;
  return zone.precisions.includes(precision) ? precision : (zone.precisions[0] as Precision);
}

function buyUpgrade(id: (typeof UPGRADES)[number]['id']) {
  const spec = UPGRADES.find((u) => u.id === id);
  if (!spec) return;
  const current = readSave();
  const level = upgradeLevel(current.upgrades, id);
  const cost = spec.cost[level];
  if (cost === undefined || level >= spec.max || current.tips < cost) {
    playOcSfx('error');
    return;
  }
  writeSave({
    ...current,
    tips: current.tips - cost,
    upgrades: { ...current.upgrades, [id]: level + 1 },
  });
  playOcSfx('coin');
}

// ---------------------------------------------------------------------- menu
function Menu({
  t,
  onStart,
  onHowTo,
  onClose,
}: {
  t: GameStrings;
  onStart: (run: Omit<RunConfig, 'key'>) => void;
  onHowTo: () => void;
  onClose: () => void;
}) {
  const save = useOcSave();
  const [mode, setMode] = useState<GameMode>('campaign');
  const [act, setAct] = useState(() => Math.min(4, save.cleared));
  const [precision, setPrecision] = useState<Precision>(
    (PRECISIONS.find((p) => p === save.lastLoadout.precision) ?? 'FP8') as Precision,
  );
  const [batch, setBatch] = useState(() => clamp(save.lastLoadout.batch || 4, 1, 64));
  const [sandbox, setSandbox] = useState<Sandbox>(DEFAULT_SANDBOX);
  const zone = ZONES[act] ?? ZONES[0]!;
  const prec = effectivePrecision(act, precision);
  const slots = Math.min(batch, zone.maxBatch);
  const hw = 1 - 0.08 * upgradeLevel(save.upgrades, 'stove');
  const unlocked = (index: number) => index <= save.cleared;

  useEffect(() => {
    if (!unlocked(act)) setAct(Math.min(4, save.cleared));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [save.cleared]);

  return (
    <div className="oc-game-menu">
      <header className="oc-game-menu-head">
        <img src={foodDataUri('chicken')} alt="" width={44} height={44} />
        <div>
          <h2>{t.menu.heading}</h2>
          <p>{t.menu.sub}</p>
        </div>
        <span className="oc-game-wallet" aria-live="polite">
          {fill(t.menu.wallet, { n: save.tips })}
        </span>
      </header>

      <section aria-label={t.menu.route} className="oc-game-route">
        <ol>
          {t.menu.acts.map((a, index) => {
            const open = unlocked(index);
            const stars = save.stars[index] ?? 0;
            return (
              <li key={a.name}>
                <button
                  type="button"
                  className="oc-game-act"
                  aria-pressed={act === index}
                  aria-disabled={!open}
                  disabled={!open}
                  title={open ? a.brief : t.menu.locked}
                  onClick={() => {
                    playOcSfx('tap');
                    setAct(index);
                  }}
                >
                  <span className="oc-game-act-num">{index < save.cleared ? '✓' : index + 1}</span>
                  <span className="oc-game-act-name">{a.name}</span>
                  <span className="oc-game-act-stars" aria-label={`${stars}/3`}>
                    {'★'.repeat(stars)}
                    {'☆'.repeat(3 - stars)}
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
        <p className="oc-game-brief">
          {t.menu.acts[act]?.brief}{' '}
          <small>
            {fill(t.menu.zoneLimits, {
              woks: zone.woks,
              batch: zone.maxBatch,
              prec: zone.precisions.join(' / '),
            })}
          </small>
        </p>
      </section>

      <section className="oc-game-modes" aria-label="Mode">
        {(['campaign', 'endless', 'sandbox', 'challenge'] as const).map((id) => (
          <button
            key={id}
            type="button"
            className="oc-game-mode"
            aria-pressed={mode === id}
            data-testid={`orange-chicken-gamemode-${id}`}
            onClick={() => {
              playOcSfx('tap');
              setMode(id);
            }}
          >
            <strong>{t.menu.modes[id].name}</strong>
            <span>{t.menu.modes[id].desc}</span>
            {id === 'endless' && save.bestEndless > 0 && (
              <em>
                {t.menu.best}: {save.bestEndless}
              </em>
            )}
            {id === 'challenge' && save.bestChallenge > 0 && (
              <em>
                {t.menu.best}: {save.bestChallenge}
              </em>
            )}
          </button>
        ))}
      </section>

      <section className="oc-game-loadout" aria-label={t.menu.loadout}>
        <h3>{t.menu.loadout}</h3>
        <div className="oc-game-seg" role="group" aria-label={t.menu.precision}>
          {PRECISIONS.map((p) => {
            const allowed = zone.precisions.includes(p);
            return (
              <button
                key={p}
                type="button"
                aria-pressed={prec === p}
                disabled={!allowed}
                onClick={() => {
                  playOcSfx('tap');
                  setPrecision(p);
                }}
              >
                {p}
              </button>
            );
          })}
        </div>
        <label className="oc-game-range">
          <span>
            {t.menu.batch}: <b>{slots}</b>
          </span>
          <input
            type="range"
            min={0}
            max={BATCHES.length - 1}
            step={1}
            value={Math.max(
              0,
              BATCHES.findIndex((b) => b >= slots),
            )}
            onChange={(event) => setBatch(BATCHES[Number(event.target.value)] ?? 4)}
          />
        </label>
        <p className="oc-game-preview">
          <b>{t.menu.preview}:</b>{' '}
          {fill(t.menu.previewLine, {
            prec,
            batch: slots,
            user: userRate(prec, slots, hw).toFixed(0),
            thr: throughput(prec, slots, hw).toFixed(0),
          })}
          {zone.precisions.length === 1 && (
            <small> {fill(t.menu.previewForced, { prec: zone.precisions[0] as string })}</small>
          )}
        </p>
      </section>

      {mode === 'sandbox' && (
        <section className="oc-game-sandbox" aria-label={t.menu.sandbox.title}>
          <h3>{t.menu.sandbox.title}</h3>
          <label className="oc-game-range">
            <span>
              {t.menu.sandbox.arrival}: <b>{sandbox.arrival.toFixed(1)}×</b>
            </span>
            <input
              type="range"
              min={0}
              max={3}
              step={0.1}
              value={sandbox.arrival}
              onChange={(event) => setSandbox({ ...sandbox, arrival: Number(event.target.value) })}
            />
          </label>
          <label className="oc-game-range">
            <span>
              {t.menu.sandbox.hw}: <b>{(1 / sandbox.hw).toFixed(1)}×</b>
            </span>
            <input
              type="range"
              min={0.5}
              max={2}
              step={0.1}
              value={1 / sandbox.hw}
              onChange={(event) => setSandbox({ ...sandbox, hw: 1 / Number(event.target.value) })}
            />
          </label>
          <div className="oc-game-checks">
            {(['oil', 'pigeons', 'fire', 'wind'] as const).map((key) => (
              <label key={key}>
                <input
                  type="checkbox"
                  checked={sandbox[key]}
                  onChange={(event) => setSandbox({ ...sandbox, [key]: event.target.checked })}
                />
                {t.menu.sandbox[key]}
              </label>
            ))}
          </div>
        </section>
      )}

      <section className="oc-game-shop" aria-label={t.menu.shop}>
        <h3>{t.menu.shop}</h3>
        <ul>
          {UPGRADES.map((spec) => {
            const level = upgradeLevel(save.upgrades, spec.id);
            const cost = spec.cost[level];
            const maxed = level >= spec.max || cost === undefined;
            return (
              <li key={spec.id}>
                <div>
                  <strong>{t.menu.upgrades[spec.id].name}</strong>{' '}
                  <small>
                    {fill(t.menu.level, { n: level })}/{spec.max}
                  </small>
                  <p>{t.menu.upgrades[spec.id].desc}</p>
                </div>
                <button
                  type="button"
                  disabled={maxed || save.tips < (cost ?? 0)}
                  onClick={() => buyUpgrade(spec.id)}
                >
                  {maxed ? t.menu.maxed : fill(t.menu.buy, { cost: cost ?? 0 })}
                </button>
              </li>
            );
          })}
        </ul>
      </section>

      <footer className="oc-game-menu-foot">
        <button
          type="button"
          className="oc-game-primary"
          data-testid="orange-chicken-start"
          onClick={() => {
            unlockOcAudio();
            playOcSfx('bell');
            onStart({
              mode,
              act,
              precision: prec,
              batch: slots,
              sandbox,
              calm: calmEnabled(),
            });
          }}
        >
          {t.menu.start}
        </button>
        <button type="button" onClick={onHowTo}>
          {t.menu.howto}
        </button>
        <button type="button" onClick={onClose}>
          {t.menu.close}
        </button>
      </footer>
    </div>
  );
}

// ----------------------------------------------------------------- howto
function HowTo({ t, onBack }: { t: GameStrings; onBack: () => void }) {
  return (
    <div className="oc-game-howto">
      <h2>{t.howto.title}</h2>
      <ul>
        {t.howto.items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
      <button type="button" className="oc-game-primary" onClick={onBack}>
        {t.howto.back}
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------- play
function Play({
  run,
  t,
  onEnd,
  onQuit,
  onExit,
  onRestart,
}: {
  run: RunConfig;
  t: GameStrings;
  onEnd: (results: Results) => void;
  onQuit: () => void;
  onExit: () => void;
  onRestart: () => void;
}) {
  const locale = useLocale();
  const shell = useRef<HTMLDivElement>(null);
  const area = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<Game | null>(null);
  const [paused, setPaused] = useState(false);
  const [live, setLive] = useState('');
  const [tick, setTick] = useState(0);
  const [coarse, setCoarse] = useState(false);
  const [stick, setStick] = useState({ x: 0, y: 0 });
  const save = useOcSave();
  const sound = useSyncExternalStore(
    subscribeOc,
    () => getOcState().sound,
    () => true,
  );
  const pausedRef = useRef(false);
  const endRef = useRef(onEnd);
  endRef.current = onEnd;
  const exitRef = useRef(onExit);
  exitRef.current = onExit;

  const zone = ZONES[run.act] ?? ZONES[0]!;
  const config = useMemo<GameConfig>(
    () => ({
      mode: run.mode,
      zone,
      upgrades: { ...readSave().upgrades },
      calm: run.calm,
      loadout: { precision: run.precision, batch: run.batch },
      seed:
        run.mode === 'challenge'
          ? Math.floor(Date.now() / 86_400_000)
          : (Date.now() ^ (run.key * 2_654_435_761)) >>> 0,
      sandbox: run.mode === 'sandbox' ? run.sandbox : undefined,
    }),
    [run, zone],
  );

  const setPause = useCallback((value: boolean) => {
    const game = gameRef.current;
    if (!game || game.over) return;
    pausedRef.current = value;
    game.paused = value;
    setPaused(value);
    duckOcMusic(value ? 0.35 : 1, 400);
    if (value) setOcMusicParams({ cutoff: 800, tempo: 70 });
  }, []);

  useEffect(() => {
    setCoarse(globalThis.matchMedia?.('(pointer: coarse)').matches ?? false);
  }, []);

  useEffect(() => {
    const element = canvas.current;
    const holder = area.current;
    if (!element || !holder) return;
    const context = element.getContext('2d');
    if (!context) return;
    const ctx = context;
    const labels = t.labels;
    let layout: Layout = computeLayout(holder.clientWidth, holder.clientHeight);
    let dpr = 1;
    const resize = () => {
      dpr = Math.min(2, globalThis.devicePixelRatio || 1);
      const w = Math.max(280, holder.clientWidth);
      const h = Math.max(280, holder.clientHeight);
      element.width = Math.round(w * dpr);
      element.height = Math.round(h * dpr);
      element.style.width = `${w}px`;
      element.style.height = `${h}px`;
      layout = computeLayout(w, h);
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(holder);

    const announce = (message: string) => setLive(message);
    // Lines from the brand, each said once per shift, on the event they fit.
    const quotes = STRINGS[locale].ip.quotes;
    const said = new Set<string>();
    const quote = (key: keyof typeof quotes) => {
      if (said.has(key)) return;
      said.add(key);
      emitOcEffect({ type: 'toast', text: quotes[key] });
    };
    const events = (event: GameEvent) => {
      switch (event.type) {
        case 'pickup': {
          playOcSfx('chop');
          break;
        }
        case 'load': {
          playOcSfx('sizzle');
          break;
        }
        case 'take': {
          playOcSfx('pop');
          break;
        }
        case 'dash': {
          playOcSfx('whoosh');
          break;
        }
        case 'configure': {
          playOcSfx('clang');
          const precisions = new Set(game.woks.map((wok) => wok.prec));
          if (precisions.size > 1) quote('half');
          else if (precisions.has('FP4')) quote('bone');
          break;
        }
        case 'refuse': {
          playOcSfx('error');
          announce(t.live.refuse);
          break;
        }
        case 'ready': {
          playOcSfx('bell', { gap: 0.2 });
          break;
        }
        case 'serve': {
          playOcSfx('serve');
          playOcSfx('coin', { gap: 0.1 });
          duckOcMusic(0.55, 450);
          announce(fill(event.late ? t.live.serveLate : t.live.serve, { tip: event.tip }));
          break;
        }
        case 'walkout': {
          playOcSfx('error');
          announce(t.live.walkout);
          break;
        }
        case 'burn': {
          playOcSfx('sizzle');
          playOcSfx('error', { gap: 0.15 });
          announce(t.live.burn);
          break;
        }
        case 'oom': {
          playOcSfx('splat');
          duckOcMusic(0.3, 900);
          announce(t.live.oom);
          quote('oom');
          break;
        }
        case 'extinguish': {
          playOcSfx('pop');
          announce(t.live.extinguish);
          break;
        }
        case 'bump': {
          playOcSfx('splat', { gap: 0.2 });
          announce(t.live.bump);
          break;
        }
        case 'steal': {
          playOcSfx('error');
          announce(t.live.steal);
          break;
        }
        case 'shoo': {
          playOcSfx('pop');
          announce(t.live.shoo);
          break;
        }
        case 'rush': {
          playOcSfx(event.start ? 'bell' : 'tap');
          announce(event.start ? t.live.rushStart : t.live.rushEnd);
          if (event.start) quote('rush');
          break;
        }
        case 'audit': {
          if (event.phase === 'start') {
            playOcSfx('stamp');
            announce(
              fill(t.live.auditStart, {
                n: event.index + 1,
                user: AUDITS[event.index]?.user ?? 0,
                thr: AUDITS[event.index]?.thr ?? 0,
              }),
            );
          } else if (event.phase === 'pass') {
            playOcSfx('fanfare');
            announce(t.live.auditPass);
            quote('audit');
          } else {
            playOcSfx('error');
            announce(t.live.auditFail);
          }
          break;
        }
        case 'end': {
          playOcSfx(event.win ? 'fanfare' : 'error');
          break;
        }
        default: {
          break;
        }
      }
    };

    const game = new Game(config, events);
    gameRef.current = game;
    startOcMusic();
    track('orange_chicken_shift_started', { mode: run.mode, act: run.act + 1 });

    // Keyboard.
    const keys = new Set<string>();
    const interactive = (target: EventTarget | null) =>
      target instanceof HTMLElement &&
      Boolean(target.closest('button, input, select, textarea, a, [role="slider"]'));
    const axes = () => {
      const x = (keys.has('right') ? 1 : 0) - (keys.has('left') ? 1 : 0);
      const y = (keys.has('down') ? 1 : 0) - (keys.has('up') ? 1 : 0);
      const length = Math.hypot(x, y) || 1;
      return { x: x / length, y: y / length };
    };
    const dirOf = (key: string): string | null => {
      switch (key) {
        case 'w':
        case 'arrowup': {
          return 'up';
        }
        case 's':
        case 'arrowdown': {
          return 'down';
        }
        case 'a':
        case 'arrowleft': {
          return 'left';
        }
        case 'd':
        case 'arrowright': {
          return 'right';
        }
        default: {
          return null;
        }
      }
    };
    const pushMove = () => {
      const a = axes();
      if (a.x !== 0 || a.y !== 0) {
        game.move = a;
        game.goto = null;
      } else if (joy.active) game.move = { ...joy.vec };
      else game.move = { x: 0, y: 0 };
    };
    const joy = { active: false, vec: { x: 0, y: 0 } };
    (element as HTMLCanvasElement & { __joy?: typeof joy }).__joy = joy;

    const act = () => {
      if (game.paused || game.over) return;
      game.interact(game.chef);
    };
    (element as HTMLCanvasElement & { __act?: () => void }).__act = act;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const key = event.key.toLowerCase();
      if (key === 'escape' || key === 'p') {
        event.preventDefault();
        if (event.repeat) return;
        // Esc pauses; Esc again on the pause screen leaves the kitchen and returns focus to the page.
        if (key === 'escape' && pausedRef.current) exitRef.current();
        else setPause(!pausedRef.current);
        return;
      }
      if (key === 'm') {
        if (event.repeat) return;
        const on = getOcState().sound || getOcState().music;
        setSoundEnabled(!on);
        setMusicEnabled(!on);
        return;
      }
      const dir = dirOf(key);
      if (dir) {
        event.preventDefault();
        keys.add(dir);
        pushMove();
        return;
      }
      if (interactive(event.target) && (key === ' ' || key === 'enter')) return;
      if (key === ' ' || key === 'shift') {
        event.preventDefault();
        if (!event.repeat && !game.paused) game.dash();
        return;
      }
      if (key === 'e' || key === 'enter' || key === 'j') {
        event.preventDefault();
        game.holding = true;
        if (!event.repeat) act();
        return;
      }
      if (game.paused || game.over) return;
      const wok = game.nearestWok();
      if (!wok) return;
      if (key === '1' || key === '2' || key === '3') {
        event.preventDefault();
        game.configure(wok.id, PRECISIONS[Number(key) - 1]);
      } else if (key === '[' || key === 'z') {
        event.preventDefault();
        game.stepBatch(wok.id, -1);
      } else if (key === ']' || key === 'x') {
        event.preventDefault();
        game.stepBatch(wok.id, 1);
      }
    };
    const onKeyUp = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      const dir = dirOf(key);
      if (dir) {
        keys.delete(dir);
        pushMove();
      } else if (key === 'e' || key === 'enter' || key === 'j') game.holding = false;
    };
    const onBlur = () => {
      keys.clear();
      game.holding = false;
      pushMove();
    };
    const onVisibility = () => {
      if (document.hidden) setPause(true);
    };
    globalThis.addEventListener('keydown', onKeyDown);
    globalThis.addEventListener('keyup', onKeyUp);
    globalThis.addEventListener('blur', onBlur);
    document.addEventListener('visibilitychange', onVisibility);

    const onPointerDown = (event: PointerEvent) => {
      if (game.paused || game.over) return;
      const rect = element.getBoundingClientRect();
      const point = toWorld(layout, event.clientX - rect.left, event.clientY - rect.top);
      if (point.x < 0 || point.y < 0 || point.x > 700 || point.y > 470) return;
      game.goto = point;
      playOcSfx('tap', { gap: 0.1 });
    };
    element.addEventListener('pointerdown', onPointerDown);

    // Loop: fixed steps so the physics are frame-rate independent.
    let raf = 0;
    let last = performance.now();
    let acc = 0;
    let musicTimer = 0;
    let overTime = 0;
    let hudTimer = 0;
    const STEP = 1 / 60;
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      if (!game.paused && !game.over) {
        acc += dt;
        let guard = 0;
        while (acc >= STEP && guard++ < 5) {
          game.update(STEP);
          acc -= STEP;
        }
        if (acc > STEP * 5) acc = 0;
      }
      if (game.over) {
        overTime += dt;
        if (overTime > 0.9 && game.results) {
          cancelAnimationFrame(raf);
          endRef.current(game.results);
          return;
        }
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, layout.w, layout.h);
      drawWorld(ctx, game, layout, labels);
      drawTop(ctx, game, layout, labels, run.act, readSave().cleared);
      drawPanel(ctx, game, layout, labels);
      drawHint(ctx, game, layout, labels);
      musicTimer += dt;
      if (musicTimer > 0.3 && !game.paused) {
        musicTimer = 0;
        let queue = game.rail.length;
        let fires = 0;
        for (const wok of game.woks) {
          queue += wok.seqs.length;
          if (wok.fire > 0) fires++;
        }
        const heat = clamp(game.rail.length / 6 + (game.rushActive ? 0.5 : 0) + fires * 0.3, 0, 1);
        setOcMusicParams({
          tempo: 76 + heat * 64,
          cutoff: clamp(1400 + (game.combo - 1) * 900, 1400, 6500),
          energy: clamp(queue / 10, 0, 1),
          shift: game.audit.index >= 0 ? 5 : 0,
        });
      }
      hudTimer += dt;
      if (hudTimer > 0.25) {
        hudTimer = 0;
        setTick((n) => (n + 1) % 1_000_000);
      }
    };
    raf = requestAnimationFrame(frame);
    shell.current?.focus({ preventScroll: true });

    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
      globalThis.removeEventListener('keydown', onKeyDown);
      globalThis.removeEventListener('keyup', onKeyUp);
      globalThis.removeEventListener('blur', onBlur);
      document.removeEventListener('visibilitychange', onVisibility);
      element.removeEventListener('pointerdown', onPointerDown);
      game.paused = true;
      gameRef.current = null;
      resetOcMusicParams();
      duckOcMusic(1, 100);
    };
  }, [config, locale, run.act, run.key, run.mode, setPause, t]);

  // Touch stick: a DOM control driving the same movement axes.
  const onStick = (event: ReactPointerEvent<HTMLDivElement>, end = false) => {
    const game = gameRef.current;
    const joy = (
      canvas.current as
        | (HTMLCanvasElement & { __joy?: { active: boolean; vec: { x: number; y: number } } })
        | null
    )?.__joy;
    if (!game || !joy) return;
    if (end) {
      joy.active = false;
      joy.vec = { x: 0, y: 0 };
      game.move = { x: 0, y: 0 };
      setStick({ x: 0, y: 0 });
      return;
    }
    const rect = event.currentTarget.getBoundingClientRect();
    const dx = (event.clientX - (rect.left + rect.width / 2)) / (rect.width / 2);
    const dy = (event.clientY - (rect.top + rect.height / 2)) / (rect.height / 2);
    const length = Math.hypot(dx, dy);
    const k = length > 1 ? 1 / length : 1;
    const vx = length < 0.18 ? 0 : dx * k;
    const vy = length < 0.18 ? 0 : dy * k;
    joy.active = true;
    joy.vec = { x: vx, y: vy };
    game.move = { x: vx, y: vy };
    game.goto = null;
    setStick({ x: dx * k, y: dy * k });
  };

  const game = gameRef.current;
  void tick;
  const woks = game?.woks ?? [];

  return (
    <div className="oc-game-shell" ref={shell} tabIndex={-1} data-paused={paused || undefined}>
      <div className="oc-game-bar">
        <strong className="oc-game-bar-title">{t.menu.modes[run.mode].name}</strong>
        <span className="oc-game-bar-keys">{t.controls.keys}</span>
        <button type="button" onClick={() => setPause(!paused)} aria-pressed={paused}>
          {paused ? t.controls.resume : t.controls.pause}
        </button>
        <button type="button" onClick={onRestart}>
          {t.controls.restart}
        </button>
        <button
          type="button"
          aria-pressed={!sound}
          onClick={() => {
            const on = getOcState().sound || getOcState().music;
            setSoundEnabled(!on);
            setMusicEnabled(!on);
          }}
        >
          {sound ? t.controls.mute : t.controls.unmute}
        </button>
        <button type="button" onClick={onQuit}>
          {t.controls.quit}
        </button>
      </div>
      <div className="oc-game-area" ref={area}>
        <canvas ref={canvas} className="oc-game-canvas" role="img" aria-label={t.title} />
        {!paused && (
          <div className="oc-game-touch" data-coarse={coarse ? 'true' : 'false'}>
            {coarse && (
              <div
                className="oc-game-stick"
                role="group"
                aria-label={t.controls.stick}
                onPointerDown={(event) => {
                  event.currentTarget.setPointerCapture(event.pointerId);
                  onStick(event);
                }}
                onPointerMove={(event) => {
                  if (event.buttons > 0 || event.pointerType === 'touch') onStick(event);
                }}
                onPointerUp={(event) => onStick(event, true)}
                onPointerCancel={(event) => onStick(event, true)}
              >
                <span
                  className="oc-game-stick-knob"
                  style={{ transform: `translate(${stick.x * 28}px, ${stick.y * 28}px)` }}
                />
              </div>
            )}
            <div className="oc-game-touch-buttons">
              <button
                type="button"
                onPointerDown={(event) => {
                  // Capture so the release still reaches this button after a drag off it.
                  event.currentTarget.setPointerCapture(event.pointerId);
                  const g = gameRef.current;
                  if (g) g.holding = true;
                  (
                    canvas.current as (HTMLCanvasElement & { __act?: () => void }) | null
                  )?.__act?.();
                }}
                onPointerUp={() => {
                  if (gameRef.current) gameRef.current.holding = false;
                }}
                onPointerCancel={() => {
                  if (gameRef.current) gameRef.current.holding = false;
                }}
                onLostPointerCapture={() => {
                  if (gameRef.current) gameRef.current.holding = false;
                }}
                onClick={(event) => {
                  // Keyboard or assistive activation has no pointer-down; a real click already acted.
                  if (event.detail === 0)
                    (
                      canvas.current as (HTMLCanvasElement & { __act?: () => void }) | null
                    )?.__act?.();
                }}
              >
                {t.controls.act}
              </button>
              <button type="button" onPointerDown={() => gameRef.current?.dash()}>
                {t.controls.dash}
              </button>
            </div>
          </div>
        )}
        {paused && (
          <div className="oc-game-pause" role="group" aria-label={t.controls.paused}>
            <h2>{t.controls.paused}</h2>
            <button
              type="button"
              className="oc-game-primary"
              onClick={() => setPause(false)}
              autoFocus
            >
              {t.controls.resume}
            </button>
            <button type="button" onClick={onRestart}>
              {t.controls.restart}
            </button>
            <button type="button" onClick={onQuit}>
              {t.controls.quit}
            </button>
            <p>{t.controls.keys}</p>
            <p>{t.controls.leave}</p>
          </div>
        )}
      </div>
      <div className="oc-game-woks" role="group" aria-label={t.controls.wokPanel}>
        {woks.map((wok) => {
          const busy = wok.seqs.length > 0 || wok.fire > 0;
          const options = BATCHES.filter((b) => b <= zone.maxBatch);
          return (
            <div className="oc-game-wok" key={wok.id} data-busy={busy || undefined}>
              <span className="oc-game-wok-name">
                {t.labels.wok} {wok.id + 1}
              </span>
              <span className="oc-game-seg" role="group" aria-label={t.controls.precision}>
                {zone.precisions.map((p) => (
                  <button
                    key={p}
                    type="button"
                    aria-pressed={wok.prec === p}
                    disabled={busy}
                    onClick={() => gameRef.current?.configure(wok.id, p)}
                  >
                    {p}
                  </button>
                ))}
              </span>
              <span className="oc-game-step">
                <button
                  type="button"
                  aria-label={t.controls.batchDown}
                  disabled={busy || wok.slots <= 1}
                  onClick={() => gameRef.current?.stepBatch(wok.id, -1)}
                >
                  −
                </button>
                <output aria-label={t.menu.batch}>{wok.slots}</output>
                <button
                  type="button"
                  aria-label={t.controls.batchUp}
                  disabled={busy || wok.slots >= (options.at(-1) ?? 1)}
                  onClick={() => gameRef.current?.stepBatch(wok.id, 1)}
                >
                  +
                </button>
              </span>
            </div>
          );
        })}
        <span className="oc-game-wallet-mini">{fill(t.menu.wallet, { n: save.tips })}</span>
      </div>
      <p className="sr-only" aria-live="polite" role="status">
        {live}
      </p>
    </div>
  );
}

// -------------------------------------------------------------------- results
function ResultsView({
  t,
  locale,
  outcome,
  onRetry,
  onNext,
  onMenu,
}: {
  t: GameStrings;
  locale: 'en' | 'zh';
  outcome: Outcome;
  onRetry: () => void;
  onNext: (() => void) | null;
  onMenu: () => void;
}) {
  const { results: r, run } = outcome;
  const trophyName = outcome.trophy ? STRINGS[locale].trophies[outcome.trophy] : '';
  const rushMissed = run.mode === 'challenge' && r.inBox <= 0;
  const headline =
    r.win && !rushMissed
      ? t.results.win
      : run.mode === 'campaign'
        ? t.results.lose
        : t.results.timeUp;
  return (
    <div className="oc-game-results" data-win={r.win || undefined}>
      <h2>{headline}</h2>
      {run.mode === 'challenge' && (
        <p role="status">
          {rushMissed
            ? t.results.boxMissed
            : fill(t.results.boxMet, { n: Math.round(r.inBox * 100) })}
        </p>
      )}
      {run.mode === 'campaign' && (
        <p className="oc-game-result-stars" aria-label={`${t.results.stars}: ${r.stars}/3`}>
          {'★'.repeat(r.stars)}
          {'☆'.repeat(3 - r.stars)}
        </p>
      )}
      <dl>
        <div>
          <dt>{t.results.served}</dt>
          <dd>{r.served}</dd>
        </div>
        <div>
          <dt>{t.results.tips}</dt>
          <dd>{r.tips}</dd>
        </div>
        <div>
          <dt>{t.results.ttft}</dt>
          <dd>{r.avgTtft.toFixed(1)}s</dd>
        </div>
        <div>
          <dt>{t.results.user}</dt>
          <dd>{r.avgUser.toFixed(0)}</dd>
        </div>
        <div>
          <dt>{t.results.thr}</dt>
          <dd>{r.avgThr.toFixed(0)}</dd>
        </div>
        <div>
          <dt>{t.results.inBox}</dt>
          <dd>{Math.round(r.inBox * 100)}%</dd>
        </div>
        <div>
          <dt>{t.results.ooms}</dt>
          <dd>{r.ooms}</dd>
        </div>
        <div>
          <dt>{t.results.walkouts}</dt>
          <dd>{r.walkouts}</dd>
        </div>
        {run.act >= 3 && run.mode === 'campaign' && (
          <div>
            <dt>{t.results.audits}</dt>
            <dd>{r.audits}/3</dd>
          </div>
        )}
        {run.mode !== 'campaign' && (
          <div>
            <dt>{t.results.score}</dt>
            <dd>
              {r.score}
              {outcome.best ? ` · ${t.results.newBest}` : ''}
            </dd>
          </div>
        )}
      </dl>
      {outcome.earned > 0 && <p>{fill(t.results.earned, { n: outcome.earned })}</p>}
      {outcome.trophy && <p>{fill(t.results.trophy, { name: trophyName })}</p>}
      {r.win && run.mode === 'campaign' && run.act === 4 && (
        <p className="oc-game-finale">{t.results.finale}</p>
      )}
      <div className="oc-game-menu-foot">
        {onNext && (
          <button type="button" className="oc-game-primary" onClick={onNext}>
            {t.results.next}
          </button>
        )}
        <button type="button" className={onNext ? '' : 'oc-game-primary'} onClick={onRetry}>
          {t.results.retry}
        </button>
        <button type="button" onClick={onMenu}>
          {t.results.menu}
        </button>
      </div>
    </div>
  );
}

// ----------------------------------------------------------------------- root
export default function OrangeChickenGame({ onClose }: { onClose: () => void }) {
  const locale = useLocale();
  const t = GAME_STRINGS[locale];
  const [view, setView] = useState<View>('menu');
  const [run, setRun] = useState<RunConfig | null>(null);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const keyRef = useRef(0);

  const start = (next: Omit<RunConfig, 'key'>) => {
    keyRef.current += 1;
    setRun({ ...next, key: keyRef.current });
    setOutcome(null);
    setView('play');
  };

  const finish = (results: Results, current: RunConfig) => {
    const save = readSave();
    const next: OcSave = { ...save, stars: [...save.stars], trophies: [...save.trophies] };
    let earned = 0;
    let trophy: TrophyId | null = null;
    let best = false;
    next.orders += results.served;
    next.lastLoadout = { precision: current.precision, batch: current.batch };
    if (current.mode !== 'sandbox') {
      earned = Math.floor(results.tips * (current.mode === 'campaign' && !results.win ? 0.5 : 1));
      next.tips += earned;
    }
    if (current.mode === 'campaign' && results.win) {
      next.cleared = Math.max(next.cleared, current.act + 1);
      next.stars[current.act] = Math.max(next.stars[current.act] ?? 0, results.stars);
      const id = TROPHY_OF_ACT[current.act];
      if (id && !next.trophies.includes(id)) {
        next.trophies.push(id);
        trophy = id;
      }
    }
    if (current.mode === 'endless') {
      if (results.score > next.bestEndless) {
        next.bestEndless = results.score;
        best = true;
      }
      if (next.bestEndless >= 800 && !next.trophies.includes('golden')) {
        next.trophies.push('golden');
        trophy = 'golden';
      }
    }
    if (current.mode === 'challenge' && results.score > next.bestChallenge) {
      next.bestChallenge = results.score;
      best = true;
    }
    writeSave(next);
    if (current.mode === 'campaign' && results.win && current.act === 0) discoverSecret('chef');
    if (current.mode === 'campaign' && results.win && current.act >= 3) discoverSecret('boss');
    track('orange_chicken_shift_ended', {
      mode: current.mode,
      act: current.act + 1,
      win: results.win,
    });
    setOutcome({ results, run: current, earned, trophy, best });
    setView('results');
  };

  const title =
    view === 'menu'
      ? t.menu.heading
      : view === 'howto'
        ? t.howto.title
        : view === 'play'
          ? t.title
          : t.results.win;

  return (
    <Dialog
      open
      onOpenChange={(isOpen) => {
        if (!isOpen) onClose();
      }}
    >
      <DialogContent
        className={`oc-dialog oc-dialog-${view}`}
        overlayClassName="oc-dialog-overlay"
        onEscapeKeyDown={(event) => {
          if (view === 'play') event.preventDefault();
          else if (view !== 'menu') {
            event.preventDefault();
            setView('menu');
          }
        }}
        onInteractOutside={(event) => {
          if (view === 'play') event.preventDefault();
        }}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          document.querySelector<HTMLButtonElement>('[data-testid="orange-chicken-play"]')?.focus();
        }}
      >
        <DialogTitle className="sr-only">{title}</DialogTitle>
        <DialogDescription className="sr-only">{t.description}</DialogDescription>
        {view === 'menu' && (
          <Menu t={t} onStart={start} onHowTo={() => setView('howto')} onClose={onClose} />
        )}
        {view === 'howto' && <HowTo t={t} onBack={() => setView('menu')} />}
        {view === 'play' && run && (
          <Play
            key={run.key}
            run={run}
            t={t}
            onEnd={(results) => finish(results, run)}
            onQuit={() => setView('menu')}
            onExit={onClose}
            onRestart={() => start({ ...run })}
          />
        )}
        {view === 'results' && outcome && (
          <ResultsView
            t={t}
            locale={locale}
            outcome={outcome}
            onRetry={() => start({ ...outcome.run })}
            onNext={
              outcome.run.mode === 'campaign' && outcome.results.win && outcome.run.act < 3
                ? () => start({ ...outcome.run, act: outcome.run.act + 1 })
                : null
            }
            onMenu={() => setView('menu')}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
