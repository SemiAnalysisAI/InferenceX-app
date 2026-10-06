'use client';

import { useEffect, useRef, useState } from 'react';
import { createKartAudio, type KartAudio } from './kart-audio';
import {
  CHARACTERS,
  EMPTY_CONTROLS,
  ENGINE_CLASSES,
  lap,
  LAPS,
  newRace,
  pauseRace,
  raceText,
  standings,
  startRace,
  STEP,
  stepRace,
  type CharacterId,
  type Controls,
  type EngineClass,
  type ItemKind,
  type Race,
} from './kart-engine';
import { createKartRenderer } from './kart-renderer';
import { parseSurface, type SurfaceMap } from './kart-surface';
import { paintMapBase } from './kart-minimap';
import './kart.css';

const COPY = {
  en: {
    title: 'Luigi Circuit',
    start: 'Start race',
    resume: 'Resume race',
    pause: 'Pause',
    restart: 'New race',
    ready: 'Choose your racer',
    paused: 'Race paused',
    finished: 'Finish!',
    place: 'Position',
    lap: 'Lap',
    time: 'Time',
    item: 'Item',
    drift: 'Drift',
    accelerate: 'Accelerate',
    brake: 'Brake',
    left: 'Steer left',
    right: 'Steer right',
    loading: 'Loading Luigi Circuit, racers, and items…',
    error: 'The 3D race could not load. Check WebGL support and your connection, then retry.',
    retry: 'Retry',
    controls:
      'W/↑ accelerate · S/↓ brake & reverse · A/D or ←/→ steer · Space hop & drift · Shift/E item (hold to drag behind, hold S to throw back) · C look back · P pause',
    brief:
      'Eight racers, three laps, full item roulette. You steer: nothing follows the road for you. Drift through corners until the sparks turn blue, then orange, and release for a mini-turbo. Press accelerate just after the 2 for a rocket start.',
    racer: 'Racer',
    engine: 'Engine class',
    finalLap: 'FINAL LAP!',
    wrongWay: 'WRONG WAY',
    result: 'Results',
    lapTimes: 'Your laps',
    mute: 'Mute',
    unmute: 'Sound on',
    map: 'Course map',
    canvas: '3D race. Use WASD or arrow keys to drive, Space to drift, Shift to use items.',
    go: 'GO!',
    standings: 'Standings',
    rocket: 'ROCKET START!',
    stats: {
      light: 'Light · quick acceleration',
      medium: 'Medium · balanced',
      heavy: 'Heavy · top speed',
    },
  },
  zh: {
    title: 'Luigi Circuit',
    start: '开始比赛',
    resume: '继续比赛',
    pause: '暂停',
    restart: '重新比赛',
    ready: '选择赛车手',
    paused: '比赛已暂停',
    finished: '冲线！',
    place: '名次',
    lap: '圈数',
    time: '用时',
    item: '道具',
    drift: '漂移',
    accelerate: '加速',
    brake: '刹车',
    left: '向左转',
    right: '向右转',
    loading: '正在加载 Luigi Circuit、赛车手和道具…',
    error: '无法加载 3D 比赛。请检查 WebGL 支持和网络连接，然后重试。',
    retry: '重试',
    controls:
      'W/↑ 加速 · S/↓ 刹车与倒车 · A/D 或 ←/→ 转向 · 空格 跳跃并漂移 · Shift/E 道具（按住拖在车后，按住 S 向后扔）· C 回看 · P 暂停',
    brief:
      '八名赛车手、三圈、完整道具轮盘。需要你自己转向，赛道不会替你转弯。弯道中保持漂移，火花变蓝再变橙后松开即可获得迷你加速。倒计时 2 出现后按加速可获得火箭起步。',
    racer: '赛车手',
    engine: '排量',
    finalLap: '最后一圈！',
    wrongWay: '方向错误',
    result: '比赛结果',
    lapTimes: '你的单圈',
    mute: '静音',
    unmute: '开启声音',
    map: '赛道地图',
    canvas: '3D 比赛。使用 WASD 或方向键驾驶，空格漂移，Shift 使用道具。',
    go: '出发！',
    standings: '排名',
    rocket: '火箭起步！',
    stats: { light: '轻量级 · 加速快', medium: '中量级 · 均衡', heavy: '重量级 · 极速高' },
  },
};
type DebugWindow = Window & {
  kart_race?: () => Race;
  render_game_to_text?: () => string;
  advanceTime?: (ms: number) => void;
};
const KEYS: Record<string, keyof Controls> = {
  KeyW: 'throttle',
  ArrowUp: 'throttle',
  KeyS: 'brake',
  ArrowDown: 'brake',
  KeyA: 'left',
  ArrowLeft: 'left',
  KeyD: 'right',
  ArrowRight: 'right',
  Space: 'drift',
  KeyX: 'drift',
  ShiftLeft: 'item',
  ShiftRight: 'item',
  KeyE: 'item',
  KeyC: 'lookBack',
};
const ITEM_ICON: Record<ItemKind, string> = {
  mushroom: 'mushroom',
  'triple-mushroom': 'triple-mushroom',
  'golden-mushroom': 'golden-mushroom',
  banana: 'banana',
  'triple-banana': 'triple-banana',
  'green-shell': 'green-shell',
  'triple-green-shell': 'triple-green-shell',
  'red-shell': 'red-shell',
  star: 'star',
  bobomb: 'bobomb',
  lightning: 'lightning',
};
const ROULETTE: ItemKind[] = [
  'mushroom',
  'banana',
  'green-shell',
  'star',
  'red-shell',
  'bobomb',
  'golden-mushroom',
  'lightning',
];
const nameOf = (id: CharacterId) => CHARACTERS.find((c) => c.id === id)?.name ?? id;
const clock = (seconds: number) =>
  `${Math.floor(seconds / 60)}:${(seconds % 60).toFixed(3).padStart(6, '0')}`;
const ordinal = (n: number, locale: 'en' | 'zh') =>
  locale === 'zh' ? `第${n}` : `${n}${n === 1 ? 'st' : n === 2 ? 'nd' : n === 3 ? 'rd' : 'th'}`;

interface View {
  phase: Race['phase'];
  countdown: number;
  elapsed: number;
  place: number;
  lap: number;
  speed: number;
  item: ItemKind | null;
  itemCount: number;
  roulette: boolean;
  driftStage: number;
  boosting: boolean;
  wrongWay: boolean;
  finalLap: number;
  rocket: number;
  lapTimes: number[];
  order: { character: CharacterId; human: boolean; time: number; finished: boolean }[];
}
const snapshot = (race: Race, prev?: View): View => {
  const p = race.player;
  let finalLap = prev?.finalLap ?? 0;
  let rocket = prev?.rocket ?? 0;
  for (const e of race.events) {
    if (e.kart !== p.index) continue;
    if (e.type === 'final-lap') finalLap = race.elapsed;
    if (e.type === 'rocket-start') rocket = race.elapsed + 0.001;
  }
  return {
    phase: race.phase,
    countdown: race.countdown,
    elapsed: race.elapsed,
    place: race.place,
    lap: lap(race),
    speed: p.speed,
    item: p.item,
    itemCount: p.itemCount,
    roulette: p.roulette > 0,
    driftStage: p.driftDir === 0 ? -1 : p.driftStage,
    boosting: p.boost > 0 || p.star > 0,
    wrongWay: p.wrongWay > 1,
    finalLap,
    rocket,
    lapTimes: [...p.lapTimes],
    order: standings(race).map(({ kart, time }) => ({
      character: kart.character,
      human: kart.human,
      time,
      finished: kart.finishedAt !== null,
    })),
  };
};

export function KartGame({
  locale = 'en',
  assetBase = '/decorative/kart',
}: {
  locale?: 'en' | 'zh';
  assetBase?: string;
}) {
  const t = COPY[locale];
  const canvas = useRef<HTMLCanvasElement>(null);
  const map = useRef<HTMLCanvasElement>(null);
  const surface = useRef<SurfaceMap | null>(null);
  const [character, setCharacter] = useState<CharacterId>('mario');
  const [engineClass, setEngineClass] = useState<EngineClass>(150);
  const race = useRef<Race>(undefined as unknown as Race);
  if (!race.current) race.current = newRace();
  const input = useRef<Controls>({ ...EMPTY_CONTROLS });
  const pressed = useRef(new Set<string>());
  const touches = useRef(new Map<number, keyof Controls>());
  const audio = useRef<KartAudio | null>(null);
  const [muted, setMuted] = useState(false);
  const [view, setView] = useState<View>(() => snapshot(race.current));
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [progress, setProgress] = useState(0);
  const [attempt, setAttempt] = useState(0);
  const [stats, setStats] = useState({ fps: 0, calls: 0, triangles: 0 });
  const viewRef = useRef(view);
  const sync = () => {
    viewRef.current = snapshot(race.current, viewRef.current);
    setView(viewRef.current);
  };
  const clear = () => {
    pressed.current.clear();
    touches.current.clear();
    input.current = { ...EMPTY_CONTROLS };
  };
  const rebuildInput = () => {
    input.current = { ...EMPTY_CONTROLS };
    pressed.current.forEach((code) => {
      if (KEYS[code]) input.current[KEYS[code]] = true;
    });
    touches.current.forEach((control) => {
      input.current[control] = true;
    });
  };
  const fresh = (c = character, e = engineClass) =>
    newRace({
      character: c,
      engineClass: e,
      surface: surface.current ?? undefined,
      seed: Date.now() % 65_536 || 7,
    });
  const pause = () => {
    pauseRace(race.current);
    clear();
    sync();
  };
  const ensureAudio = () => {
    if (!audio.current) audio.current = createKartAudio();
    audio.current?.resume();
    audio.current?.setMuted(muted);
  };
  const start = () => {
    clear();
    ensureAudio();
    startRace(race.current);
    sync();
    canvas.current?.focus();
  };
  const restart = () => {
    clear();
    race.current = fresh();
    sync();
    canvas.current?.focus();
  };
  const choose = (c: CharacterId, e: EngineClass) => {
    setCharacter(c);
    setEngineClass(e);
    if (race.current.phase === 'ready') {
      race.current = fresh(c, e);
      sync();
    }
  };

  useEffect(() => {
    const element = canvas.current;
    if (!element) return;
    let renderer: ReturnType<typeof createKartRenderer>;
    let live = true;
    let frame = 0;
    let last = 0;
    let elapsed = 0;
    let hudElapsed = 0;
    let frames = 0;
    let accumulator = 0;
    let manualClock = false;
    let loaded = false;
    let mapBase: ReturnType<typeof paintMapBase> | null = null;
    const icons = new Map<string, HTMLImageElement>();
    for (const c of CHARACTERS) {
      const img = new Image();
      img.src = `${assetBase}/icons/icon-${c.id}.png`;
      icons.set(c.id, img);
    }
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const debug = window as DebugWindow;
    setStatus('loading');
    setProgress(0);
    const onBlur = () => {
      pauseRace(race.current);
      clear();
      sync();
    };
    const onVisibility = () => {
      if (document.hidden) onBlur();
    };
    const onContextLost = (e: Event) => {
      e.preventDefault();
      onBlur();
      setStatus('error');
      loaded = false;
    };
    try {
      renderer = createKartRenderer(element, {
        assetBase,
        onProgress: (n, total) => live && setProgress(Math.round((n / total) * 100)),
      });
    } catch {
      setStatus('error');
      return;
    }
    const resize = () => renderer.resize(element.clientWidth, element.clientHeight);
    const observer = new ResizeObserver(resize);
    observer.observe(element);
    resize();
    const paintMap = () => {
      const ctx = map.current?.getContext('2d');
      if (!ctx || !mapBase) return;
      const size = map.current!.width;
      ctx.clearRect(0, 0, size, size);
      ctx.drawImage(mapBase.canvas, 0, 0, size, size);
      const r = race.current;
      for (const b of r.boxes) {
        if (b.respawn > 0) continue;
        const [x, y] = mapBase.toMap(b.x, b.z);
        ctx.fillStyle = '#ffcf33';
        ctx.fillRect(x - 1.5, y - 1.5, 3, 3);
      }
      for (const p of r.projectiles) {
        const [x, y] = mapBase.toMap(p.x, p.z);
        ctx.fillStyle =
          p.kind === 'banana'
            ? '#ffe14a'
            : p.kind === 'red-shell'
              ? '#ff3b30'
              : p.kind === 'green-shell'
                ? '#34c759'
                : '#111';
        ctx.beginPath();
        ctx.arc(x, y, 2.4, 0, Math.PI * 2);
        ctx.fill();
      }
      const order = [...r.karts].sort(
        (a, b) => Number(a.human) - Number(b.human) || b.place - a.place,
      );
      for (const k of order) {
        const [x, y] = mapBase.toMap(k.x, k.z);
        const s = k.human ? 22 : 16;
        const img = icons.get(k.character);
        ctx.fillStyle = k.human ? '#ffd640' : '#0b1830cc';
        ctx.beginPath();
        ctx.arc(x, y, s / 2 + 1.5, 0, Math.PI * 2);
        ctx.fill();
        if (img?.complete && img.naturalWidth) ctx.drawImage(img, x - s / 2, y - s / 2, s, s);
      }
    };
    const paint = (dt: number) => {
      renderer.draw(race.current, dt, reducedMotion.matches, input.current.lookBack);
      paintMap();
    };
    const tick = (now: number) => {
      if (!live) return;
      const dt = Math.min((now - (last || now)) / 1000, 0.1);
      last = now;
      if (loaded) {
        if (!manualClock) {
          accumulator += dt;
          while (accumulator >= STEP) {
            stepRace(race.current, input.current, STEP);
            renderer.events(race.current);
            audio.current?.update(race.current, STEP, true);
            if (race.current.events.length > 0) {
              viewRef.current = snapshot(race.current, viewRef.current);
              race.current.events.length = 0;
            }
            accumulator -= STEP;
          }
        }
        if (race.current.phase === 'paused' || race.current.phase === 'ready')
          audio.current?.update(race.current, dt, false);
        paint(dt);
        elapsed += dt;
        hudElapsed += dt;
        frames++;
        if (hudElapsed >= 0.1) {
          sync();
          hudElapsed = 0;
        }
        if (elapsed >= 1) {
          setStats({ fps: Math.round(frames / elapsed), ...renderer.stats() });
          elapsed = 0;
          frames = 0;
        }
      }
      frame = requestAnimationFrame(tick);
    };
    const surfaceLoad = fetch(`${assetBase}/luigi-circuit-surface.bin`)
      .then((r) => {
        if (!r.ok) throw new Error(`Surface load failed: ${r.status}`);
        return r.arrayBuffer();
      })
      .then((buffer) => {
        surface.current = parseSurface(buffer);
        mapBase = paintMapBase(surface.current, 360);
      });
    Promise.all([renderer.ready, surfaceLoad])
      .then(() => {
        if (!live) return;
        if (race.current.phase === 'ready' || race.current.surface !== surface.current) {
          race.current = newRace({
            character: race.current.playerCharacter,
            engineClass: race.current.engineClass,
            surface: surface.current!,
            seed: Date.now() % 65_536 || 7,
          });
        }
        renderer.setup(race.current);
        loaded = true;
        setStatus('ready');
        sync();
        paint(1 / 60);
      })
      .catch((error) => {
        if (!live) return;
        if (process.env.NODE_ENV !== 'production')
          console.error('Kart asset loading failed', error);
        setStatus('error');
      });
    window.addEventListener('blur', onBlur);
    document.addEventListener('visibilitychange', onVisibility);
    element.addEventListener('webglcontextlost', onContextLost);
    if (process.env.NODE_ENV !== 'production') {
      debug.render_game_to_text = () => raceText(race.current);
      debug.kart_race = () => race.current;
      debug.advanceTime = (ms) => {
        if (!loaded || !Number.isFinite(ms) || ms < 0) return;
        manualClock = true;
        for (let i = 0; i < Math.min(60000, Math.floor(ms / (1000 / 60))); i++) {
          stepRace(race.current, input.current, STEP);
          renderer.events(race.current);
          viewRef.current = snapshot(race.current, viewRef.current);
          race.current.events.length = 0;
        }
        paint(STEP);
        sync();
      };
    }
    frame = requestAnimationFrame(tick);
    return () => {
      live = false;
      cancelAnimationFrame(frame);
      observer.disconnect();
      clear();
      window.removeEventListener('blur', onBlur);
      document.removeEventListener('visibilitychange', onVisibility);
      element.removeEventListener('webglcontextlost', onContextLost);
      delete debug.render_game_to_text;
      delete debug.advanceTime;
      delete debug.kart_race;
      renderer.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt, assetBase]);

  useEffect(
    () => () => {
      audio.current?.dispose();
      audio.current = null;
    },
    [],
  );

  const racing = ['racing', 'countdown'].includes(view.phase);
  const rouletteIcon = ROULETTE[Math.floor(view.elapsed * 14) % ROULETTE.length];
  const shownItem = view.roulette ? rouletteIcon : view.item;

  return (
    <div className="kart-game" data-testid="kart-game" data-phase={view.phase} data-status={status}>
      <canvas
        key={attempt}
        ref={canvas}
        className="kart-canvas"
        tabIndex={racing ? 0 : -1}
        aria-label={t.canvas}
        data-testid="kart-canvas"
        onBlur={clear}
        onKeyDown={(e) => {
          if (KEYS[e.code]) {
            e.preventDefault();
            pressed.current.add(e.code);
            rebuildInput();
          }
          if (e.code === 'KeyP' && !e.repeat) {
            e.preventDefault();
            if (race.current.phase === 'paused') start();
            else pause();
          }
        }}
        onKeyUp={(e) => {
          if (KEYS[e.code]) {
            e.preventDefault();
            pressed.current.delete(e.code);
            rebuildInput();
          }
        }}
      />
      {status === 'ready' && view.phase !== 'ready' && (
        <>
          <div className="kart-hud">
            <div
              className={`kart-place kart-place-${Math.min(view.place, 4)}`}
              data-testid="kart-place"
            >
              <strong>{view.place}</strong>
              <span>
                {locale === 'zh'
                  ? '名'
                  : ordinal(view.place, 'en').slice(String(view.place).length)}
              </span>
            </div>
            <div className="kart-item-slot" aria-label={t.item} data-testid="kart-item">
              {shownItem && (
                <img
                  src={`${assetBase}/icons/icon-${ITEM_ICON[shownItem]}.png`}
                  alt={view.roulette ? '' : shownItem}
                  width={80}
                  height={80}
                />
              )}
              {!view.roulette && view.item?.startsWith('triple') && view.itemCount < 3 && (
                <small>×{view.itemCount}</small>
              )}
            </div>
            <div className="kart-metrics">
              <div>
                <span>{t.lap}</span>
                <strong>
                  {view.lap}
                  <small> / {LAPS}</small>
                </strong>
              </div>
              <div>
                <span>{t.time}</span>
                <strong>{clock(view.elapsed)}</strong>
              </div>
            </div>
          </div>
          <ol className="kart-standings" aria-label={t.standings}>
            {view.order.map((r, i) => (
              <li key={r.character} className={r.human ? 'kart-me' : undefined}>
                <span>{i + 1}</span>
                <img
                  src={`${assetBase}/icons/icon-${r.character}.png`}
                  alt=""
                  width={28}
                  height={28}
                />
                <em>{nameOf(r.character)}</em>
              </li>
            ))}
          </ol>
        </>
      )}
      {racing && (
        <div className="kart-actions">
          <button
            type="button"
            data-testid="kart-pause"
            disabled={status !== 'ready'}
            onClick={pause}
          >
            {t.pause}
          </button>
          <button type="button" data-testid="kart-reset" onClick={restart}>
            {t.restart}
          </button>
          <button
            type="button"
            aria-pressed={muted}
            onClick={() => {
              const next = !muted;
              setMuted(next);
              audio.current?.setMuted(next);
              canvas.current?.focus();
            }}
          >
            {muted ? t.unmute : t.mute}
          </button>
        </div>
      )}
      <canvas ref={map} width={360} height={360} className="kart-map" aria-label={t.map} />
      {status === 'ready' && view.phase !== 'ready' && (
        <div className={`kart-speed ${view.boosting ? 'kart-speed-boost' : ''}`}>
          <strong>
            {Math.round(Math.abs(view.speed) * 1.3)
              .toString()
              .padStart(3, '0')}
          </strong>
          <span>km/h</span>
          {view.driftStage >= 0 && (
            <i className={`kart-spark kart-spark-${view.driftStage}`} aria-hidden="true" />
          )}
        </div>
      )}
      {view.phase === 'racing' && view.finalLap > 0 && view.elapsed - view.finalLap < 2.4 && (
        <div className="kart-banner">{t.finalLap}</div>
      )}
      {view.phase === 'racing' && view.rocket > 0 && view.elapsed - view.rocket < 1.4 && (
        <div className="kart-banner kart-banner-small">{t.rocket}</div>
      )}
      {view.phase === 'racing' && view.wrongWay && (
        <div className="kart-banner kart-wrong">{t.wrongWay}</div>
      )}
      <div className="kart-touch">
        {(['left', 'right', 'drift', 'item', 'brake', 'throttle'] as const).map((control) => (
          <button
            key={control}
            type="button"
            aria-label={control === 'throttle' ? t.accelerate : t[control]}
            data-testid={`kart-${control}`}
            className={`kart-touch-${control}`}
            disabled={status !== 'ready' || !racing}
            onPointerDown={(e) => {
              e.preventDefault();
              e.currentTarget.setPointerCapture(e.pointerId);
              touches.current.set(e.pointerId, control);
              rebuildInput();
            }}
            onPointerUp={(e) => {
              touches.current.delete(e.pointerId);
              rebuildInput();
            }}
            onPointerCancel={(e) => {
              touches.current.delete(e.pointerId);
              rebuildInput();
            }}
            onLostPointerCapture={(e) => {
              touches.current.delete(e.pointerId);
              rebuildInput();
            }}
            onKeyDown={(e) => {
              if (e.code === 'Space' || e.code === 'Enter') {
                e.preventDefault();
                touches.current.set(-1, control);
                rebuildInput();
              }
            }}
            onKeyUp={(e) => {
              if (e.code === 'Space' || e.code === 'Enter') {
                touches.current.delete(-1);
                rebuildInput();
              }
            }}
            onBlur={() => {
              touches.current.delete(-1);
              rebuildInput();
            }}
          >
            {control === 'left'
              ? '←'
              : control === 'right'
                ? '→'
                : control === 'throttle'
                  ? t.accelerate
                  : t[control]}
          </button>
        ))}
      </div>
      {status !== 'ready' || ['ready', 'paused', 'finished'].includes(view.phase) ? (
        <div className="kart-overlay">
          <section
            className={`kart-card ${view.phase === 'ready' && status === 'ready' ? 'kart-card-wide' : ''}`}
            aria-live="polite"
          >
            <span className="kart-kicker">MARIO KART WII · {t.title.toUpperCase()}</span>
            <h2>
              {status === 'loading'
                ? t.loading
                : status === 'error'
                  ? t.title
                  : view.phase === 'ready'
                    ? t.ready
                    : view.phase === 'paused'
                      ? t.paused
                      : `${t.finished} ${ordinal(view.place, locale)}`}
            </h2>
            {status === 'loading' && (
              <meter
                className="kart-progress"
                min={0}
                max={100}
                value={progress}
                aria-label={t.loading}
              />
            )}
            {status === 'error' && <p>{t.error}</p>}
            {status === 'ready' && view.phase === 'ready' && (
              <>
                <p>{t.brief}</p>
                <fieldset className="kart-picker">
                  <legend>{t.racer}</legend>
                  {CHARACTERS.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      className="kart-pick"
                      aria-pressed={character === c.id}
                      data-testid={`kart-pick-${c.id}`}
                      title={`${c.name} · ${t.stats[c.weight]}`}
                      onClick={() => choose(c.id, engineClass)}
                    >
                      <img
                        src={`${assetBase}/icons/icon-${c.id}.png`}
                        alt=""
                        width={64}
                        height={64}
                      />
                      <span>{c.name}</span>
                    </button>
                  ))}
                </fieldset>
                <fieldset className="kart-picker kart-cc">
                  <legend>{t.engine}</legend>
                  {ENGINE_CLASSES.map((cc) => (
                    <button
                      key={cc}
                      type="button"
                      className="kart-pick"
                      aria-pressed={engineClass === cc}
                      onClick={() => choose(character, cc)}
                    >
                      {cc}cc
                    </button>
                  ))}
                </fieldset>
              </>
            )}
            {status === 'ready' && view.phase === 'finished' && (
              <>
                <ol className="kart-results">
                  {view.order.map((r, i) => (
                    <li key={r.character} className={r.human ? 'kart-me' : undefined}>
                      <span>{i + 1}</span>
                      <img
                        src={`${assetBase}/icons/icon-${r.character}.png`}
                        alt=""
                        width={32}
                        height={32}
                      />
                      <em>{nameOf(r.character)}</em>
                      <time>{r.finished ? clock(r.time) : `~${clock(r.time)}`}</time>
                    </li>
                  ))}
                </ol>
                <p className="kart-laps">
                  {t.lapTimes}: {view.lapTimes.map((s) => clock(s)).join(' · ')}
                </p>
              </>
            )}
            {status === 'error' ? (
              <button
                onClick={() => {
                  restart();
                  setAttempt((n) => n + 1);
                }}
              >
                {t.retry}
              </button>
            ) : (
              status === 'ready' &&
              (view.phase === 'finished' ? (
                <button data-testid="kart-finish-reset" onClick={restart}>
                  {t.restart}
                </button>
              ) : (
                <button data-testid="kart-start" onClick={start}>
                  {view.phase === 'paused' ? t.resume : t.start}
                </button>
              ))
            )}
            {status === 'ready' && view.phase === 'paused' && (
              <button className="kart-secondary" onClick={restart}>
                {t.restart}
              </button>
            )}
            <p className="kart-controls">{t.controls}</p>
          </section>
        </div>
      ) : null}
      {view.phase === 'countdown' && (
        <div className="kart-countdown" aria-live="assertive">
          {Math.ceil(view.countdown)}
        </div>
      )}
      {view.phase === 'racing' && view.elapsed < 0.8 && (
        <div className="kart-countdown">{t.go}</div>
      )}
      <div className="kart-performance">
        {stats.fps} FPS · {stats.calls} draw · {Math.round(stats.triangles / 1000)}k tri
      </div>
    </div>
  );
}
