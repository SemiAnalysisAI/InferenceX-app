'use client';

import { useEffect, useRef, useState } from 'react';
import {
  changeVehicle,
  beginTour,
  cityText,
  EMPTY_CONTROLS,
  enterExit,
  interact,
  markerFor,
  newCity,
  stepCity,
  target,
  travel,
  type Controls,
  type CityState,
} from './gta-engine';
import { drawCityMap, paintOverview, paintRadar } from './gta-minimap';
import { streetRoute } from './gta-navigation';
import { objectiveStatus } from './gta-hud';
import { createCityRenderer, LOAD_STEPS, type CityRenderer } from './gta-renderer';
import {
  CITY_NAME,
  JOB_COPY,
  JOB_IDS,
  TOUR_STOPS,
  SOUTH_BAY_NAME,
  distance,
  type Point,
  type World,
} from './gta-world';
import './gta-game.css';

const COPY = {
  en: {
    explore: 'Explore Bay Area',
    destination: 'Destination',
    drive: 'Set GPS and drive',
    visit: 'Fast travel',
    free: 'Free roam · no time limit',
    arrived: 'Destination reached. Stop and explore on foot.',
    title: `${CITY_NAME.en} After Hours`,
    subtitle: 'GTA V assets · real San Francisco map data',
    brief:
      "Five stops: pick up an order at Oren's Hummus on 3rd St, deliver it to the Transamerica Pyramid, meet a contact at Coit Tower, then take US-101 south to San Jovano for NVIDIA Endeavor and AMD HQ. Stop in the gold marker and press E. Police respond to pickups and collisions; stay 140 m clear for 15 seconds to lose them.",
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
    travelCity: CITY_NAME.en,
    travelSouth: `${SOUTH_BAY_NAME.en} (South Bay)`,
    travelHelp: 'Quick travel (stop first)',
    fog: 'Karl the Fog',
    loading: 'Loading San Fierro',
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
      'San Fierro is a playable spin-off of San Francisco built from OpenStreetMap and USGS-derived elevation data, with GTA V vehicles and pedestrians. It is not the complete GTA V game. Flight explores a low-detail San Andreas model.',
    atlasHelp:
      'W / S fly · A / D turn · Shift climb · Space descend. This is an aerial explorer, not a flight simulator.',
    camera: 'Camera',
    loadingAtlas: 'Loading San Andreas',
    onFoot: 'ON FOOT',
    aim: 'Stop at the gold marker',
    blockedExit: 'No room to exit. Move the car away from the obstacle.',
    escape: 'Stay clear of police to lose your wanted level',
    sound: 'Sound',
    soundOff: 'Mute',
    loadNote:
      'City data, vehicles and street props load only after opening this game. The San Andreas map loads only when you select flight.',
    failedAtlas: 'The full map failed to load. You can keep playing the city or try flight again.',
  },
  zh: {
    explore: '自由探索湾区',
    destination: '目的地',
    drive: '设置导航并驾驶',
    visit: '快速前往',
    free: '自由探索 · 无时间限制',
    arrived: '已到达目的地。停车后可下车探索。',
    title: `${CITY_NAME.zh} 夜行`,
    subtitle: 'GTA V 资源 · 真实旧金山地图数据',
    brief:
      "共五站：在 3rd St 的 Oren's Hummus 取餐，送到 Transamerica 金字塔，在 Coit Tower 与联络人会合，再沿 US-101 南下到圣霍瓦诺的 NVIDIA Endeavor 和 AMD 总部。在金色标记内停车并按 E。取货或碰撞会引来警察；保持 140 米以上距离 15 秒即可摆脱追捕。",
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
    travelCity: CITY_NAME.zh,
    travelSouth: `${SOUTH_BAY_NAME.zh}（南湾）`,
    travelHelp: '快速前往（请先停车）',
    fog: '旧金山大雾',
    loading: '正在加载圣菲耶罗',
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
      '圣菲耶罗是以 OpenStreetMap 和 USGS 高程数据构建的旧金山衍生城市，使用 GTA V 车辆与行人模型。它并非完整的 GTA V 游戏。飞行模式使用 San Andreas 的低精度模型。',
    atlasHelp:
      'W / S 前后飞行 · A / D 转向 · Shift 上升 · 空格 下降。这是空中探索模式，并非飞行模拟器。',
    camera: '镜头',
    loadingAtlas: '正在加载 San Andreas',
    onFoot: '步行',
    aim: '在金色标记处停车',
    blockedExit: '没有下车空间，请将车辆驶离障碍物。',
    escape: '远离警察以消除通缉等级',
    sound: '声音',
    soundOff: '静音',
    loadNote:
      '打开游戏后才会加载城市数据、车辆与街景资源；选择飞行模式后才会加载 San Andreas 地图。',
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

export function GtaGame({
  locale = 'en',
  assetBase,
}: {
  locale?: 'en' | 'zh';
  /** Override for the asset root (defaults to /decorative/gta/). */
  assetBase?: string;
}) {
  const t = COPY[locale],
    state = useRef<CityState | null>(null),
    world = useRef<World | null>(null),
    cityMap = useRef<HTMLCanvasElement | null>(null),
    input = useRef<Controls>({ ...EMPTY_CONTROLS });
  const canvas = useRef<HTMLCanvasElement>(null),
    minimap = useRef<HTMLCanvasElement>(null),
    bigMap = useRef<HTMLCanvasElement>(null),
    graphics = useRef<CityRenderer | null>(null);
  const dirty = useRef(true),
    manual = useRef(false),
    map = useRef(false),
    returnState = useRef<CityState | null>(null);
  const [view, setView] = useState<CityState | null>(null),
    [loaded, setLoaded] = useState(0),
    [error, setError] = useState(false),
    [attempt, setAttempt] = useState(0),
    [atlasLoading, setAtlasLoading] = useState(false),
    [atlasError, setAtlasError] = useState(false),
    [overview, setOverview] = useState(false);
  const [destination, setDestination] = useState<string>('nvidia_endeavor');
  const [sound, setSound] = useState(false),
    audio = useRef<{ ctx: AudioContext; osc: OscillatorNode; gain: GainNode } | null>(null);
  const ready = view !== null;
  const sync = () => {
    dirty.current = true;
    if (state.current) setView({ ...state.current });
  };
  const clear = () => {
    input.current = { ...EMPTY_CONTROLS };
  };
  const focus = () => canvas.current?.focus({ preventScroll: true });
  const pause = () => {
    if (state.current?.phase === 'driving') {
      state.current.phase = 'paused';
      clear();
      sync();
    }
  };
  const fresh = () => newCity(world.current!);
  useEffect(() => {
    const ctrl = new AbortController();
    let handle: CityRenderer | null = null,
      frame = 0,
      last = 0,
      hud = 0,
      accumulator = 0;
    let routeKey = '';
    let route: Point[] = [];
    setView(null);
    setError(false);
    setLoaded(0);
    const el = canvas.current!;
    const loop = (now: number) => {
      const dt = last ? Math.min((now - last) / 1000, 0.1) : 0;
      last = now;
      const s = state.current!,
        w = world.current!;
      if (!manual.current) {
        accumulator += dt;
        while (accumulator >= 1 / 60) {
          stepCity(w, s, input.current, 1 / 60);
          accumulator -= 1 / 60;
        }
      }
      if (s.phase === 'driving' || dirty.current) {
        handle?.render(s, map.current);
        dirty.current = false;
      }
      if (now - hud > 100) {
        hud = now;
        setView({ ...s });
        const goal = target(w, s);
        const key = `${goal.id}:${Math.round(s.player.x / 50)}:${Math.round(s.player.z / 50)}`;
        if (!s.explorer && key !== routeKey) {
          routeKey = key;
          route = streetRoute(w, s.player, goal);
        }
        if (minimap.current && cityMap.current && !s.explorer)
          paintRadar(minimap.current, cityMap.current, w, {
            player: s.player,
            target: goal,
            police: s.police,
            route,
          });
      }
      const a = audio.current;
      if (a) {
        a.osc.frequency.setTargetAtTime(40 + Math.abs(s.car.speed) * 3, a.ctx.currentTime, 0.08);
        a.gain.gain.setTargetAtTime(
          s.phase === 'driving' && !s.onFoot && !s.explorer ? 0.025 : 0,
          a.ctx.currentTime,
          0.08,
        );
      }
      frame = requestAnimationFrame(loop);
    };
    void createCityRenderer(el, ctrl.signal, setLoaded, { base: assetBase })
      .then((r) => {
        if (ctrl.signal.aborted) {
          r.dispose();
          return;
        }
        handle = r;
        graphics.current = r;
        world.current = r.world;
        cityMap.current = drawCityMap(r.world);
        state.current = newCity(r.world);
        dirty.current = true;
        setView({ ...state.current });
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
      setView(null);
    };
    window.addEventListener('blur', blur);
    document.addEventListener('visibilitychange', visibility);
    el.addEventListener('webglcontextlost', contextLost);
    const debug = window as DebugWindow;
    const text = () =>
        state.current && world.current ? cityText(world.current, state.current) : '{}',
      get = () => state.current!,
      advance = (ms: number) => {
        if (!Number.isFinite(ms) || ms < 0 || !state.current || !world.current) return;
        manual.current = true;
        for (let i = 0; i < Math.min(36000, Math.floor(ms / (1000 / 60))); i++)
          stepCity(world.current, state.current, input.current, 1 / 60);
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
  useEffect(() => {
    if (!overview || !bigMap.current || !cityMap.current || !world.current || !state.current)
      return;
    const w = world.current;
    paintOverview(
      bigMap.current,
      cityMap.current,
      w,
      (state.current.tour ? TOUR_STOPS.map((stop) => stop.id) : JOB_IDS).map((id) =>
        markerFor(w, id),
      ),
      state.current.tour ? 0 : state.current.job,
      state.current.player,
      state.current.tour
        ? TOUR_STOPS.findIndex((stop) => stop.id === state.current!.tour)
        : state.current.job,
    );
  }, [overview, view?.job, view?.tour]);
  const start = (reset = false) => {
    if (!ready || atlasLoading || !state.current) return;
    if (reset) {
      state.current = fresh();
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
    if (!state.current || state.current.explorer) return;
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
  const go = (to: 'city' | 'south') => {
    if (!state.current || !world.current) return;
    if (travel(world.current, state.current, to)) graphics.current?.resetCamera();
    sync();
    focus();
  };
  const tour = (fastTravel: boolean) => {
    if (!state.current || !world.current) return;
    if (!beginTour(world.current, state.current, destination, fastTravel)) return;
    map.current = false;
    setOverview(false);
    clear();
    graphics.current?.resetCamera();
    sync();
    focus();
  };
  const flight = async () => {
    if (!ready || atlasLoading || !state.current) return;
    clear();
    if (state.current.explorer) {
      state.current = returnState.current || fresh();
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
        ...fresh(),
        phase: 'driving',
        explorer: true,
        player: { x: 0, z: 3000, y: 0, angle: Math.PI, speed: 0, stride: 0 },
        night: state.current.night,
        traffic: [],
        peds: [],
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
  const action = (key: string) => {
    const s = state.current,
      w = world.current;
    if (!s || !w) return;
    if (key === 'KeyP') {
      if (s.phase === 'driving') pause();
      else if (s.phase === 'paused') start();
    }
    if (key === 'KeyM') toggleMap();
    if (key === 'KeyF') enterExit(w, s);
    if (key === 'KeyE') interact(w, s);
    if (key === 'KeyC') s.camera = (s.camera + 1) % 3;
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
  const w = world.current;
  const seconds = Math.ceil(view?.time ?? 0),
    job = view && w ? target(w, view) : null,
    active = view?.phase === 'driving',
    jobCopy = view?.tour
      ? TOUR_STOPS.find((stop) => stop.id === view.tour)
      : JOB_COPY[JOB_IDS[Math.min(view?.job ?? 0, JOB_IDS.length - 1)]],
    objective = view && w ? objectiveStatus(w, view, t) : null,
    street = view && w && !view.explorer ? w.street(view.player.x, view.player.z) : '',
    district = view && w && !view.explorer ? w.district(view.player) : null,
    still = !view || Math.abs(view.player.speed) <= 2,
    canTour =
      view !== null && !view.explorer && ['ready', 'paused', 'driving'].includes(view.phase);
  return (
    <section className="gta-game" data-testid="heist-game" data-phase={view?.phase ?? 'loading'}>
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
        {view && (
          <div className="gta-cash">
            ${view.cash.toLocaleString('en-US')}
            <span aria-label={`${t.wanted}: ${view.heat}`}>
              {'★'.repeat(view.heat)}
              {'☆'.repeat(5 - view.heat)}
            </span>
          </div>
        )}
      </header>
      {view && (
        <div className="gta-objective">
          <small>
            {view.explorer
              ? t.atlas
              : view.tour
                ? t.free
                : `${Math.min(view.job + 1, JOB_IDS.length)} / ${JOB_IDS.length}`}
          </small>
          <strong>
            {view.explorer
              ? t.atlasHelp
              : jobCopy
                ? locale === 'zh'
                  ? jobCopy.zh
                  : jobCopy.en
                : ''}
          </strong>
          <span
            className={objective?.warning ? 'gta-warning' : undefined}
            aria-live={objective?.warning ? 'polite' : 'off'}
          >
            {objective?.text}
          </span>
        </div>
      )}
      {view && (
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
            {district && (
              <span className="gta-location" data-testid="heist-location">
                <b>{street || (locale === 'zh' ? district.zh : district.en)}</b>
                {street ? ` · ${locale === 'zh' ? district.zh : district.en}` : ''}
              </span>
            )}
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
                {view.tour
                  ? '∞'
                  : `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`}
              </b>
            </span>
          </div>
        </aside>
      )}
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
            if (state.current) changeVehicle(state.current);
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
            if (state.current) state.current.night = !state.current.night;
            sync();
            focus();
          }}
          disabled={!ready}
        >
          {t.night}
        </button>
        <button
          type="button"
          aria-pressed={view?.fog ?? false}
          data-testid="heist-fog"
          onClick={() => {
            if (state.current) state.current.fog = !state.current.fog;
            sync();
            focus();
          }}
          disabled={!ready || view.explorer}
        >
          {t.fog}
        </button>
        <button type="button" onClick={() => action('KeyC')} disabled={!ready || view.explorer}>
          {t.camera}
        </button>
        <button type="button" onClick={() => void flight()} disabled={!ready || atlasLoading}>
          {view?.explorer ? t.city : t.atlas}
        </button>
        <button type="button" onClick={toggleSound} disabled={!ready}>
          {sound ? t.soundOff : t.sound}
        </button>
        {view && !view.explorer && (
          <>
            <button
              type="button"
              data-testid="heist-travel-city"
              title={t.travelHelp}
              aria-pressed={!w?.southBay(view.player)}
              disabled={!active || !still}
              onClick={() => go('city')}
            >
              {t.travelCity}
            </button>
            <button
              type="button"
              data-testid="heist-travel-south"
              title={t.travelHelp}
              aria-pressed={Boolean(w?.southBay(view.player))}
              disabled={!active || !still}
              onClick={() => go('south')}
            >
              {t.travelSouth}
            </button>
          </>
        )}
      </div>
      {atlasError && (
        <div role="alert" className="gta-notice">
          {t.failedAtlas}
        </div>
      )}
      {overview && view && (
        <div className="gta-map-panel">
          <h3>{t.map}</h3>
          <canvas ref={bigMap} width={360} height={400} aria-label={t.map} />
          <label htmlFor="gta-destination">{t.destination}</label>
          <select
            id="gta-destination"
            value={destination}
            onChange={(event) => setDestination(event.target.value)}
          >
            {TOUR_STOPS.map((stop) => (
              <option key={stop.id} value={stop.id}>
                {locale === 'zh' ? stop.zh : stop.en}
              </option>
            ))}
          </select>
          <div className="gta-tour-actions">
            <button
              type="button"
              data-testid="tour-drive"
              disabled={!canTour}
              onClick={() => tour(false)}
            >
              {t.drive}
            </button>
            <button
              type="button"
              data-testid="tour-visit"
              title={t.travelHelp}
              disabled={!still || !canTour}
              onClick={() => tour(true)}
            >
              {t.visit}
            </button>
          </div>
          {view.tour
            ? TOUR_STOPS.map((stop, i) => (
                <p key={stop.id} data-testid="tour-map-stop">
                  {i + 1}. {locale === 'zh' ? stop.zh : stop.en}
                </p>
              ))
            : JOB_IDS.map((id, i) => (
                <p key={id}>
                  {i + 1}. {locale === 'zh' ? JOB_COPY[id].zh : JOB_COPY[id].en}{' '}
                  {i < view.job ? '✓' : ''}
                </p>
              ))}
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
            {!ready && !error && <progress value={loaded} max={LOAD_STEPS} />}
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
            {ready && !atlasLoading && view.phase === 'ready' && (
              <button type="button" onClick={toggleMap}>
                {t.explore}
              </button>
            )}
            <p className="gta-desktop-help">{t.controls}</p>
            <p className="gta-mobile-help">{t.mobile}</p>
            <small>{t.disclaimer}</small>
            {!ready && <small>{t.loadNote}</small>}
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
            !view ||
            !job ||
            view.explorer ||
            distance(view.player, job) > 14 ||
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
