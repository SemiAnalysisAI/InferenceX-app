'use client';

import { useEffect, useRef, useState } from 'react';
import {
  changeVehicle,
  beginTour,
  cityText,
  EMPTY_CONTROLS,
  enterExit,
  interact,
  newCity,
  stepCity,
  target,
  type Controls,
  type CityState,
} from './gta-engine';
import { createCityRenderer, CITY_ASSET_COUNT, type CityRenderer } from './gta-renderer';
import { BUILDINGS, DESTINATIONS, distance } from './gta-world';
import { STREETS_SF, streetRoute } from './gta-geography';
import './gta-game.css';

const COPY = {
  en: {
    title: 'San Paloma After Hours',
    explore: 'Explore Bay Area',
    destination: 'Destination',
    drive: 'Set GPS and drive',
    visit: 'Fast travel',
    free: 'Free roam · no time limit',
    arrived: 'Destination reached. Stop and explore on foot.',
    subtitle: 'SF street geometry · Bay Area sandbox',
    brief:
      'Collect four packages across the city, then return to the garage. Stop in a gold ring and press E. Police respond to pickups and collisions. Stay more than 110 m away for 15 seconds to lose them.',
    start: 'Start engine',
    resume: 'Resume',
    restart: 'New run',
    pause: 'Pause',
    map: 'City map',
    back: 'Back',
    foot: 'Enter / exit',
    vehicle: 'Change car',
    night: 'Day / night',
    atlas: 'San Andreas flight',
    city: 'Return to city',
    loading: 'Loading GTA V models',
    error: 'The 3D scene could not load. Check WebGL and your connection, then retry.',
    retry: 'Retry',
    collect: 'Collect / deliver',
    health: 'Health',
    time: 'Time',
    cash: 'Cash',
    wanted: 'Wanted',
    won: 'Mission passed',
    busted: 'Run ended',
    paused: 'Paused',
    controls:
      'WASD / arrows drive · Space brake · F enter/exit · E collect · C camera · P pause · M map · Shift sprint / climb',
    mobile: 'Hold arrows to drive or walk. Stop before entering, exiting or changing a car.',
    accelerate: 'Accelerate / walk',
    reverse: 'Reverse / back',
    left: 'Left',
    right: 'Right',
    brake: 'Brake / descend',
    sprint: 'Sprint / climb',
    disclaimer:
      'A fictional Bay Area city using SF street and building footprints. Façades and landmarks are interpretations; the South Bay route is compressed. Not the complete GTA V game.',
    atlasHelp:
      'W / S fly · A / D turn · Shift climb · Space descend. This is an aerial explorer, not a flight simulator.',
    camera: 'Camera',
    loadingAtlas: 'Loading San Andreas',
    onFoot: 'ON FOOT',
    repair: 'GARAGE: stop here to repair',
    aim: 'Stop at the gold marker',
    blockedExit: 'No room to exit. Move the car away from the obstacle.',
    escape: 'Stay clear of police to lose your wanted level',
    sound: 'Sound',
    soundOff: 'Mute',
    loadNote:
      'Vehicles and street props load only after opening this game. The full map loads only when you select flight.',
    failedAtlas: 'The full map failed to load. You can keep playing the city or try flight again.',
  },
  zh: {
    title: 'San Paloma 夜行',
    explore: '探索湾区',
    destination: '目的地',
    drive: '设置导航并驾车前往',
    visit: '快速旅行',
    free: '自由探索 · 无时间限制',
    arrived: '已到达目的地，可停车下车探索。',
    subtitle: '旧金山街道数据 · 湾区沙盒',
    brief:
      '在城内收集四个包裹，再返回车库。在金色圆圈内停车并按 E。取货或碰撞会引来警察；保持 110 米以上距离 15 秒即可摆脱追捕。',
    start: '发动引擎',
    resume: '继续',
    restart: '重新开始',
    pause: '暂停',
    map: '城市地图',
    back: '返回',
    foot: '上车 / 下车',
    vehicle: '更换车辆',
    night: '白天 / 夜晚',
    atlas: 'San Andreas 飞行',
    city: '返回城市',
    loading: '正在加载 GTA V 模型',
    error: '无法加载 3D 场景。请检查 WebGL 支持和网络连接后重试。',
    retry: '重试',
    collect: '收集 / 交付',
    health: '生命值',
    time: '时间',
    cash: '现金',
    wanted: '通缉',
    won: '任务完成',
    busted: '本次游戏结束',
    paused: '已暂停',
    controls:
      'WASD / 方向键驾驶 · 空格 刹车 · F 上下车 · E 收集 · C 镜头 · P 暂停 · M 地图 · Shift 冲刺 / 上升',
    mobile: '按住方向按钮驾驶或步行。上下车或更换车辆前请先停车。',
    accelerate: '加速 / 前进',
    reverse: '倒车 / 后退',
    left: '左转',
    right: '右转',
    brake: '刹车 / 下降',
    sprint: '冲刺 / 上升',
    disclaimer:
      '基于旧金山街道和建筑轮廓的虚构湾区城市。立面与地标为艺术改编，南湾路线经过压缩。并非完整 GTA V。',
    atlasHelp:
      'W / S 前后飞行 · A / D 转向 · Shift 上升 · 空格 下降。这是空中探索模式，并非飞行模拟器。',
    camera: '镜头',
    loadingAtlas: '正在加载 San Andreas',
    onFoot: '步行',
    repair: '车库：停车维修',
    aim: '在金色标记处停车',
    blockedExit: '没有下车空间，请将车辆驶离障碍物。',
    escape: '远离警察以消除通缉等级',
    sound: '声音',
    soundOff: '静音',
    loadNote: '打开游戏后才会加载车辆与街景资源；选择飞行模式后才会加载完整地图。',
    failedAtlas: '完整地图加载失败。可以继续玩城市模式，或重新尝试飞行模式。',
  },
};
type DebugWindow = Window & {
  render_game_to_text?: () => string;
  advanceTime?: (ms: number) => void;
  gta_state?: () => CityState;
};
const KEYS: Record<string, keyof Controls> = {
  KeyW: 'forward',
  ArrowUp: 'forward',
  KeyS: 'reverse',
  ArrowDown: 'reverse',
  KeyA: 'left',
  ArrowLeft: 'left',
  KeyD: 'right',
  ArrowRight: 'right',
  Space: 'brake',
  ShiftLeft: 'sprint',
  ShiftRight: 'sprint',
};

let cachedRoute = { key: '', points: [] as { x: number; z: number }[] };
function paintMap(canvas: HTMLCanvasElement, s: CityState) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const scale = 180 / 1000,
    cx = (v: number) => (v - s.player.x) * scale + 90,
    cz = (v: number) => (v - s.player.z) * scale + 90;
  ctx.fillStyle = '#274747';
  ctx.fillRect(0, 0, 180, 180);
  ctx.fillStyle = '#a3a29a';
  ctx.fillRect(0, 0, 180, 180);
  ctx.strokeStyle = '#e1ded3';
  for (const street of STREETS_SF) {
    ctx.lineWidth = street.width * scale;
    ctx.beginPath();
    street.points.forEach((p, i) =>
      i ? ctx.lineTo(cx(p.x), cz(p.z)) : ctx.moveTo(cx(p.x), cz(p.z)),
    );
    ctx.stroke();
  }
  ctx.fillStyle = '#606365';
  for (const b of BUILDINGS) {
    if (Math.abs(b.x - s.player.x) > 600 || Math.abs(b.z - s.player.z) > 600) continue;
    ctx.beginPath();
    b.ring.forEach((p, i) => (i ? ctx.lineTo(cx(p.x), cz(p.z)) : ctx.moveTo(cx(p.x), cz(p.z))));
    ctx.closePath();
    ctx.fill();
  }
  const t = target(s);
  ctx.strokeStyle = '#b774d2';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(90, 90);
  const routeKey = `${Math.floor(s.player.x / 25)},${Math.floor(s.player.z / 25)},${t.x},${t.z}`;
  if (routeKey !== cachedRoute.key)
    cachedRoute = { key: routeKey, points: streetRoute(s.player, t) };
  for (const p of cachedRoute.points) ctx.lineTo(cx(p.x), cz(p.z));
  ctx.lineTo(cx(t.x), cz(t.z));
  ctx.stroke();
  ctx.fillStyle = '#ffe17e';
  ctx.beginPath();
  ctx.arc(
    Math.max(5, Math.min(175, cx(t.x))),
    Math.max(5, Math.min(175, cz(t.z))),
    4,
    0,
    Math.PI * 2,
  );
  ctx.fill();
  for (const p of s.police) {
    ctx.fillStyle = '#ef5c68';
    ctx.fillRect(cx(p.x) - 2, cz(p.z) - 2, 4, 4);
  }
  ctx.save();
  ctx.translate(90, 90);
  ctx.rotate(-s.player.angle);
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.moveTo(0, 6);
  ctx.lineTo(-4, -4);
  ctx.lineTo(4, -4);
  ctx.fill();
  ctx.restore();
}
export function GtaGame({ locale = 'en' }: { locale?: 'en' | 'zh' }) {
  const [destination, setDestination] = useState(6);
  const t = COPY[locale],
    state = useRef(newCity()),
    input = useRef<Controls>({ ...EMPTY_CONTROLS });
  const canvas = useRef<HTMLCanvasElement>(null),
    minimap = useRef<HTMLCanvasElement>(null),
    graphics = useRef<CityRenderer | null>(null);
  const performanceHud = useRef<HTMLOutputElement>(null);
  const dirty = useRef(true),
    manual = useRef(false),
    map = useRef(false),
    returnState = useRef<CityState | null>(null);
  const [view, setView] = useState(() => newCity()),
    [loaded, setLoaded] = useState(0),
    [ready, setReady] = useState(false),
    [error, setError] = useState(false),
    [attempt, setAttempt] = useState(0),
    [atlasLoading, setAtlasLoading] = useState(false),
    [atlasError, setAtlasError] = useState(false),
    [overview, setOverview] = useState(false);
  const [sound, setSound] = useState(false),
    audio = useRef<{ ctx: AudioContext; osc: OscillatorNode; gain: GainNode } | null>(null);
  const sync = () => {
    dirty.current = true;
    setView({ ...state.current });
  };
  const clear = () => {
    input.current = { ...EMPTY_CONTROLS };
  };
  const focus = () => canvas.current?.focus({ preventScroll: true });
  const pause = () => {
    if (state.current.phase === 'driving') {
      state.current.phase = 'paused';
      clear();
      sync();
    }
  };
  useEffect(() => {
    const ctrl = new AbortController();
    let handle: CityRenderer | null = null,
      frame = 0,
      last = 0,
      hud = 0,
      accumulator = 0;
    setReady(false);
    setError(false);
    setLoaded(0);
    const el = canvas.current!;
    const loop = (now: number) => {
      const frameDuration = last ? now - last : 0;
      const dt = last ? Math.min((now - last) / 1000, 0.1) : 0;
      last = now;
      if (!manual.current) {
        accumulator += dt;
        while (accumulator >= 1 / 60) {
          stepCity(state.current, input.current, 1 / 60);
          accumulator -= 1 / 60;
        }
      }
      if ((!manual.current && state.current.phase === 'driving') || dirty.current) {
        handle?.render(state.current, map.current);
        dirty.current = false;
      }
      if (now - hud > 100) {
        hud = now;
        setView({ ...state.current });
        if (minimap.current) paintMap(minimap.current, state.current);
        const stats = handle?.stats();
        if (performanceHud.current && stats) {
          const fps =
            manual.current || state.current.phase !== 'driving'
              ? '--'
              : (1000 / Math.max(frameDuration, 1)).toFixed(0);
          performanceHud.current.textContent = `${fps} FPS · ${stats.calls} draws · ${(stats.triangles / 1000000).toFixed(2)}M tris`;
        }
      }
      const a = audio.current;
      if (a) {
        a.osc.frequency.setTargetAtTime(
          40 + Math.abs(state.current.car.speed) * 3,
          a.ctx.currentTime,
          0.08,
        );
        a.gain.gain.setTargetAtTime(
          state.current.phase === 'driving' && !state.current.onFoot && !state.current.explorer
            ? 0.025
            : 0,
          a.ctx.currentTime,
          0.08,
        );
      }
      frame = requestAnimationFrame(loop);
    };
    void createCityRenderer(el, ctrl.signal, setLoaded)
      .then((r) => {
        if (ctrl.signal.aborted) {
          r.dispose();
          return;
        }
        handle = r;
        graphics.current = r;
        setReady(true);
        dirty.current = true;
        frame = requestAnimationFrame(loop);
      })
      .catch(() => {
        if (!ctrl.signal.aborted) setError(true);
      });
    const resize = new ResizeObserver(() => {
      dirty.current = true;
    });
    resize.observe(el);
    const blur = () => pause(),
      visibility = () => {
        if (document.hidden) pause();
      };
    const contextLost = (e: Event) => {
      e.preventDefault();
      cancelAnimationFrame(frame);
      pause();
      setError(true);
      setReady(false);
    };
    window.addEventListener('blur', blur);
    document.addEventListener('visibilitychange', visibility);
    el.addEventListener('webglcontextlost', contextLost);
    const debug = window as DebugWindow;
    const text = () => cityText(state.current),
      get = () => state.current,
      advance = (ms: number) => {
        if (!Number.isFinite(ms) || ms < 0) return;
        manual.current = true;
        for (let i = 0; i < Math.min(36000, Math.floor(ms / (1000 / 60))); i++)
          stepCity(state.current, input.current, 1 / 60);
        handle?.render(state.current, map.current);
        sync();
      };
    if (process.env.NODE_ENV !== 'production') {
      debug.render_game_to_text = text;
      debug.advanceTime = advance;
      debug.gta_state = get;
    }
    return () => {
      ctrl.abort();
      cancelAnimationFrame(frame);
      resize.disconnect();
      window.removeEventListener('blur', blur);
      document.removeEventListener('visibilitychange', visibility);
      el.removeEventListener('webglcontextlost', contextLost);
      handle?.dispose();
      graphics.current = null;
      clear();
      if (debug.render_game_to_text === text) delete debug.render_game_to_text;
      if (debug.advanceTime === advance) delete debug.advanceTime;
      if (debug.gta_state === get) delete debug.gta_state;
    };
    // The renderer owns one lifetime, independent of HUD state updates.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt]);
  useEffect(
    () => () => {
      if (audio.current) {
        audio.current.osc.stop();
        void audio.current.ctx.close();
        audio.current = null;
      }
    },
    [],
  );
  const start = (reset = false) => {
    if (!ready || atlasLoading) return;
    if (reset) {
      state.current = newCity();
      returnState.current = null;
      setAtlasError(false);
    }
    state.current.phase = 'driving';
    map.current = false;
    setOverview(false);
    clear();
    manual.current = false;
    graphics.current?.resetCamera();
    sync();
    focus();
  };
  const toggleMap = () => {
    if (state.current.explorer) return;
    if (map.current) {
      map.current = false;
      setOverview(false);
    } else {
      pause();
      map.current = true;
      setOverview(true);
    }
    graphics.current?.resetCamera();
    sync();
    focus();
  };
  const flight = async () => {
    if (!ready || atlasLoading) return;
    clear();
    if (state.current.explorer) {
      state.current = returnState.current || newCity();
      returnState.current = null;
      state.current.phase = 'paused';
      graphics.current?.resetCamera();
      sync();
      return;
    }
    pause();
    setAtlasLoading(true);
    setAtlasError(false);
    try {
      const r = graphics.current;
      await r?.loadAtlas();
      if (!r || graphics.current !== r) return;
      returnState.current = state.current;
      state.current = {
        ...newCity(),
        phase: 'driving',
        explorer: true,
        player: { x: 0, z: 3000, angle: Math.PI, speed: 0 },
        night: state.current.night,
      };
      map.current = false;
      setOverview(false);
      manual.current = false;
      graphics.current.resetCamera();
      sync();
      focus();
    } catch {
      setAtlasError(true);
    } finally {
      setAtlasLoading(false);
    }
  };
  const toggleSound = () => {
    if (!audio.current) {
      const ctx = new AudioContext(),
        osc = ctx.createOscillator(),
        gain = ctx.createGain();
      osc.type = 'sawtooth';
      gain.gain.value = 0;
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      audio.current = { ctx, osc, gain };
    }
    const next = !sound;
    setSound(next);
    if (next) void audio.current.ctx.resume();
    else void audio.current.ctx.suspend();
    focus();
  };
  const explore = (fast: boolean) => {
    clear();
    if (!beginTour(state.current, destination, fast)) return;
    map.current = false;
    setOverview(false);
    manual.current = false;
    graphics.current?.resetCamera();
    sync();
    focus();
  };
  const action = (key: string) => {
    if (key === 'KeyP') {
      if (state.current.phase === 'driving') pause();
      else if (state.current.phase === 'paused') start();
    }
    if (key === 'KeyM') toggleMap();
    if (key === 'KeyF') enterExit(state.current);
    if (key === 'KeyE') interact(state.current);
    if (key === 'KeyC') {
      state.current.camera = (state.current.camera + 1) % 3;
      graphics.current?.resetCamera();
    }
    sync();
    focus();
  };
  const pedal = (control: keyof Controls, label: string, glyph: string) => (
    <button
      type="button"
      aria-label={label}
      title={label}
      data-testid={`heist-${control}`}
      disabled={!ready || view.phase !== 'driving'}
      onPointerDown={(e) => {
        e.preventDefault();
        e.currentTarget.setPointerCapture(e.pointerId);
        input.current[control] = true;
        focus();
      }}
      onPointerUp={() => {
        input.current[control] = false;
      }}
      onPointerCancel={() => {
        input.current[control] = false;
      }}
      onLostPointerCapture={() => {
        input.current[control] = false;
      }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {glyph}
    </button>
  );
  const seconds = Math.ceil(view.time),
    job = target(view),
    active = view.phase === 'driving';
  return (
    <section className="gta-game" data-testid="heist-game" data-phase={view.phase}>
      <canvas
        ref={canvas}
        className="gta-canvas"
        data-testid="heist-canvas"
        aria-label={`${t.title}. ${t.controls}`}
        tabIndex={0}
        onKeyDown={(e) => {
          if (KEYS[e.code]) {
            e.preventDefault();
            input.current[KEYS[e.code]] = true;
          } else if (!e.repeat) {
            action(e.code);
          }
        }}
        onKeyUp={(e) => {
          if (KEYS[e.code]) {
            e.preventDefault();
            input.current[KEYS[e.code]] = false;
          }
        }}
        onBlur={clear}
        onPointerDown={focus}
      />
      <header className="gta-game-top">
        <div>
          <span>INFERENCEX / GTA V</span>
          <h2>{t.title}</h2>
        </div>
        <div className="gta-cash">
          ${view.cash.toLocaleString('en-US')}
          <span aria-label={`${t.wanted}: ${view.heat}`}>
            {'★'.repeat(view.heat)}
            {'☆'.repeat(5 - view.heat)}
          </span>
        </div>
      </header>
      {process.env.NODE_ENV !== 'production' && (
        <output
          ref={performanceHud}
          className="gta-performance"
          aria-label={locale === 'zh' ? '渲染性能' : 'Rendering performance'}
        />
      )}
      <div className="gta-objective">
        <small>
          {view.explorer
            ? t.atlas
            : view.tour === null
              ? `${Math.min(view.job + 1, 5)} / 5`
              : t.free}
        </small>
        <strong>{view.explorer ? t.atlasHelp : locale === 'zh' ? job.zh : job.en}</strong>
        <span>
          {view.explorer
            ? `${Math.round(view.altitude)} m`
            : view.tour === null
              ? view.message === 'blocked'
                ? t.blockedExit
                : view.heat
                  ? t.escape
                  : t.aim
              : distance(view.player, job) < 18
                ? t.arrived
                : `${Math.round(distance(view.player, job))} m · GPS`}
        </span>
      </div>
      <aside className="gta-bottom-hud">
        {!view.explorer && (
          <div className="gta-radar">
            <canvas ref={minimap} width={180} height={180} aria-label={t.map} />
            <div className="gta-health">
              <i style={{ width: `${view.health}%` }} />
            </div>
          </div>
        )}
        <div className="gta-telemetry">
          <strong data-testid="heist-speed">
            {view.onFoot
              ? t.onFoot
              : Math.round(Math.abs(view.car.speed) * 3.6)
                  .toString()
                  .padStart(3, '0')}
            <small>{!view.onFoot && !view.explorer ? ' KM/H' : ''}</small>
          </strong>
          <span>
            {view.explorer ? 'SAN ANDREAS' : view.onFoot ? 'MICHAEL' : view.vehicle.toUpperCase()}
          </span>
          <span>
            {t.health} {Math.ceil(view.health)}% ·{' '}
            <b data-testid="heist-timer">
              {view.tour === null
                ? `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
                : '∞'}
            </b>
          </span>
        </div>
      </aside>
      <div className="gta-tools">
        <button
          type="button"
          onClick={() => (active ? pause() : start())}
          disabled={!ready || ['won', 'busted'].includes(view.phase)}
          data-testid="heist-pause"
        >
          {active ? t.pause : t.resume}
        </button>
        <button
          type="button"
          onClick={toggleMap}
          disabled={!ready || view.explorer}
          data-testid="heist-map"
        >
          {overview ? t.back : t.map}
        </button>
        <button
          type="button"
          onClick={() => action('KeyF')}
          disabled={!ready || !active || view.explorer}
        >
          {t.foot}
        </button>
        <button
          type="button"
          onClick={() => {
            changeVehicle(state.current);
            sync();
            focus();
          }}
          disabled={!active || view.onFoot || view.explorer || Math.abs(view.car.speed) > 2}
        >
          {t.vehicle}
        </button>
        <button
          type="button"
          onClick={() => {
            state.current.night = !state.current.night;
            sync();
            focus();
          }}
          disabled={!ready}
        >
          {t.night}
        </button>
        <button type="button" onClick={() => action('KeyC')} disabled={!ready || view.explorer}>
          {t.camera}
        </button>
        <button type="button" onClick={() => void flight()} disabled={!ready || atlasLoading}>
          {view.explorer ? t.city : t.atlas}
        </button>
        <button type="button" onClick={toggleSound} disabled={!ready}>
          {sound ? t.soundOff : t.sound}
        </button>
      </div>
      {atlasError && (
        <div role="alert" className="gta-notice">
          {t.failedAtlas}
        </div>
      )}
      {overview && (
        <div className="gta-map-panel">
          <h3>{t.map}</h3>
          <p>{t.free}</p>
          <label htmlFor="gta-destination">{t.destination}</label>
          <select
            id="gta-destination"
            value={destination}
            onChange={(e) => setDestination(Number(e.target.value))}
          >
            {DESTINATIONS.map((p, i) => (
              <option value={i} key={p.en}>
                {locale === 'zh' ? p.zh : p.en}
              </option>
            ))}
          </select>
          <button type="button" data-testid="tour-drive" onClick={() => explore(false)}>
            {t.drive}
          </button>
          <button type="button" data-testid="tour-visit" onClick={() => explore(true)}>
            {t.visit}
          </button>
          <button type="button" onClick={() => start()}>
            {t.resume}
          </button>
        </div>
      )}
      {(!ready || atlasLoading || (!active && !overview)) && (
        <div className="gta-game-cover">
          <div>
            <p className="gta-kicker">{t.subtitle}</p>
            <h3>
              {error
                ? t.error
                : !ready || atlasLoading
                  ? atlasLoading
                    ? t.loadingAtlas
                    : t.loading
                  : view.phase === 'won'
                    ? t.won
                    : view.phase === 'busted'
                      ? t.busted
                      : view.phase === 'paused'
                        ? t.paused
                        : t.title}
            </h3>
            {!ready && !error && <progress value={loaded} max={CITY_ASSET_COUNT} />}
            {ready && !atlasLoading && <p>{t.brief}</p>}
            {error ? (
              <button type="button" onClick={() => setAttempt((n) => n + 1)}>
                {t.retry}
              </button>
            ) : (
              ready &&
              !atlasLoading && (
                <button
                  type="button"
                  data-testid="heist-start"
                  onClick={() => start(view.phase === 'won' || view.phase === 'busted')}
                >
                  {view.phase === 'ready'
                    ? t.start
                    : view.phase === 'paused'
                      ? t.resume
                      : t.restart}
                </button>
              )
            )}
            <p className="gta-desktop-help">{t.controls}</p>
            {ready && !atlasLoading && !view.explorer && (
              <button type="button" onClick={toggleMap}>
                {t.explore}
              </button>
            )}
            <p className="gta-mobile-help">{t.mobile}</p>
            <small>{t.disclaimer}</small>
          </div>
        </div>
      )}
      <footer className="gta-game-controls">
        <div className="gta-pad">
          {pedal('left', t.left, '←')}
          {pedal('right', t.right, '→')}
          {pedal('brake', t.brake, '▣')}
          {pedal('sprint', t.sprint, '⇧')}
        </div>
        <button
          type="button"
          className="gta-interact"
          data-testid="heist-collect"
          onClick={() => action('KeyE')}
          disabled={
            !active ||
            view.explorer ||
            distance(view.player, job) > 13 ||
            Math.abs(view.player.speed) > 3
          }
        >
          {t.collect}
        </button>
        <div className="gta-pad">
          {pedal('reverse', t.reverse, '↓')}
          {pedal('forward', t.accelerate, '↑')}
        </div>
        <button
          type="button"
          data-testid="heist-reset"
          onClick={() => start(true)}
          disabled={!ready}
        >
          {t.restart}
        </button>
      </footer>
    </section>
  );
}
