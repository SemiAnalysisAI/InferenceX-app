'use client';

import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react';
import {
  CRATE_GOAL,
  EMPTY_CONTROLS,
  gameText,
  interact,
  nearbyStop,
  newHeist,
  objective,
  stepHeist,
  type Controls,
} from './heist-engine';
import { camera, makeMap, renderHeist } from './heist-renderer';
import { distance, OFFICES } from './heist-world';
import './heist.css';

const COPY = {
  en: {
    title: 'Bay Area Heist',
    subtitle: 'A fictional compute-crate getaway',
    brief:
      'Hit any three office stops. Park in the glowing ring, collect a compute crate, and get back to the safehouse before time runs out.',
    start: 'Start engine',
    resume: 'Resume getaway',
    restart: 'New run',
    pause: 'Pause',
    map: 'Route map',
    drive: 'Back to driving',
    health: 'Vehicle',
    cargo: 'Crates',
    timer: 'Time left',
    target: 'GPS destination',
    stops: 'Office stops',
    safehouse: 'Safehouse',
    controls: 'WASD / arrows: drive · Space: handbrake · E: collect · P: pause · M: map',
    mobileControls: 'Hold the pedals and steering buttons. Stop in a ring to collect.',
    collect: 'Collect crate',
    finish: 'Deliver cargo',
    park: 'Slow down in a pickup ring',
    forward: 'Accelerate',
    reverse: 'Brake / reverse',
    left: 'Steer left',
    right: 'Steer right',
    brake: 'Handbrake',
    won: 'Heist passed',
    busted: 'Busted',
    paused: 'Getaway paused',
    wonBody: 'Three compute crates delivered. The Bay is yours.',
    bustedBody: 'Your getaway ended. Start a fresh run and try another route.',
    disclaimer:
      'Fictional arcade map. Office placement and roads are stylized, not navigation data.',
    select: 'Select an office on the map or in the list.',
    wanted: 'Wanted level',
    unavailable:
      'This browser could not start the canvas. You can close heist mode and keep using the dashboard.',
  },
  zh: {
    title: '湾区劫案',
    subtitle: '虚构的算力货箱逃脱游戏',
    brief: '任选三个办公室停靠点，在发光圆圈内停车并收集算力货箱，然后在倒计时结束前返回安全屋。',
    start: '发动引擎',
    resume: '继续驾驶',
    restart: '重新开始',
    pause: '暂停',
    map: '路线地图',
    drive: '返回驾驶',
    health: '车况',
    cargo: '货箱',
    timer: '剩余时间',
    target: 'GPS 目的地',
    stops: '办公室停靠点',
    safehouse: '安全屋',
    controls: 'WASD / 方向键：驾驶 · 空格：手刹 · E：收集 · P：暂停 · M：地图',
    mobileControls: '按住踏板和转向按钮驾驶，在圆圈内停车收集。',
    collect: '收集货箱',
    finish: '交付货箱',
    park: '在停靠圆圈内减速',
    forward: '加速',
    reverse: '刹车 / 倒车',
    left: '左转',
    right: '右转',
    brake: '手刹',
    won: '任务完成',
    busted: '逃脱失败',
    paused: '驾驶已暂停',
    wonBody: '三个算力货箱已送达，任务完成。',
    bustedBody: '本次逃脱结束。重新开始，试试另一条路线。',
    disclaimer: '虚构街机地图。办公室位置与道路均经过简化，不可用于导航。',
    select: '点击地图或列表中的办公室选择目的地。',
    wanted: '通缉等级',
    unavailable: '当前浏览器无法启动画布。可关闭游戏，继续使用仪表板。',
  },
};

type DebugWindow = Window & {
  render_game_to_text?: () => string;
  advanceTime?: (ms: number) => void;
};

export function HeistGame({ locale = 'en' }: { locale?: 'en' | 'zh' }) {
  const t = COPY[locale];
  const engine = useRef(newHeist());
  const input = useRef<Controls>({ ...EMPTY_CONTROLS });
  const canvas = useRef<HTMLCanvasElement>(null);
  const manualClock = useRef(false);
  const mapWasDriving = useRef(false);
  const [view, setView] = useState(() => newHeist());
  const [overview, setOverview] = useState(false);
  const [fps, setFps] = useState(0);
  const [unavailable, setUnavailable] = useState(false);
  const sync = useCallback(() => {
    const state = engine.current;
    setView({ ...state, car: { ...state.car }, collected: [...state.collected] });
  }, []);
  const clearInput = useCallback(() => {
    input.current = { ...EMPTY_CONTROLS };
  }, []);
  const focusCanvas = () => canvas.current?.focus({ preventScroll: true });

  const pause = useCallback(() => {
    if (engine.current.phase === 'driving') {
      engine.current.phase = 'paused';
      clearInput();
      sync();
    }
  }, [clearInput, sync]);

  useEffect(() => {
    const onVisibility = () => {
      if (document.hidden) pause();
    };
    window.addEventListener('blur', pause);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('blur', pause);
      document.removeEventListener('visibilitychange', onVisibility);
      clearInput();
    };
  }, [pause, clearInput]);

  useEffect(() => {
    const element = canvas.current;
    const ctx = element?.getContext('2d');
    if (!element || !ctx) {
      setUnavailable(true);
      return;
    }
    const map = makeMap();
    let width = 1;
    let height = 1;
    let frame = 0;
    let last = 0;
    let lastHud = 0;
    let accumulator = 0;
    let frames = 0;
    let fpsSince = 0;
    const paint = () => renderHeist(ctx, map, engine.current, width, height, overview);
    const resize = () => {
      const rect = element.getBoundingClientRect();
      width = Math.max(1, rect.width);
      height = Math.max(1, rect.height);
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      element.width = Math.round(width * dpr);
      element.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      paint();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(element);
    resize();
    const tick = (now: number) => {
      const elapsed = last ? Math.min((now - last) / 1000, 0.1) : 0;
      last = now;
      if (!manualClock.current) {
        accumulator += elapsed;
        while (accumulator >= 1 / 60) {
          stepHeist(engine.current, input.current, 1 / 60);
          accumulator -= 1 / 60;
        }
      }
      paint();
      frames++;
      if (!fpsSince) fpsSince = now;
      if (now - fpsSince > 1000) {
        setFps(Math.round((frames * 1000) / (now - fpsSince)));
        frames = 0;
        fpsSince = now;
      }
      if (now - lastHud > 100 || engine.current.phase !== 'driving') {
        sync();
        lastHud = now;
      }
      if (engine.current.phase === 'driving') frame = requestAnimationFrame(tick);
    };
    if (engine.current.phase === 'driving') frame = requestAnimationFrame(tick);

    // Development-only deterministic hooks, owned and removed by this mounted game.
    const debug = window as DebugWindow;
    const text = () => gameText(engine.current);
    const advance = (ms: number) => {
      if (!Number.isFinite(ms) || ms < 0) return;
      manualClock.current = true;
      const steps = Math.min(36000, Math.floor(ms / (1000 / 60)));
      for (let i = 0; i < steps; i++) stepHeist(engine.current, input.current, 1 / 60);
      paint();
      sync();
    };
    if (process.env.NODE_ENV !== 'production') {
      debug.render_game_to_text = text;
      debug.advanceTime = advance;
    }
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      if (debug.render_game_to_text === text) delete debug.render_game_to_text;
      if (debug.advanceTime === advance) delete debug.advanceTime;
    };
  }, [view.phase, overview, sync]);

  const start = (restart = false) => {
    if (restart) engine.current = newHeist();
    engine.current.phase = 'driving';
    manualClock.current = false;
    clearInput();
    setOverview(false);
    sync();
    focusCanvas();
  };
  const toggleMap = () => {
    clearInput();
    if (!overview) {
      mapWasDriving.current = engine.current.phase === 'driving';
      pause();
    } else if (mapWasDriving.current) {
      engine.current.phase = 'driving';
    }
    setOverview(!overview);
    sync();
    focusCanvas();
  };
  const collect = () => {
    interact(engine.current);
    sync();
    focusCanvas();
  };
  const onKey = (event: KeyboardEvent<HTMLCanvasElement>, down: boolean) => {
    const key: Record<string, keyof Controls> = {
      ArrowUp: 'forward',
      KeyW: 'forward',
      ArrowDown: 'reverse',
      KeyS: 'reverse',
      ArrowLeft: 'left',
      KeyA: 'left',
      ArrowRight: 'right',
      KeyD: 'right',
      Space: 'brake',
    };
    if (key[event.code]) {
      event.preventDefault();
      input.current[key[event.code]] = down;
    } else if (down && !event.repeat) {
      if (event.code === 'KeyE') {
        event.preventDefault();
        collect();
      }
      if (event.code === 'KeyP') {
        event.preventDefault();
        if (engine.current.phase === 'driving') pause();
        else if (engine.current.phase === 'paused' && !overview) start();
      }
      if (event.code === 'KeyM') {
        event.preventDefault();
        toggleMap();
      }
    }
  };
  const target = objective(view);
  const canCollect =
    view.phase === 'driving' && nearbyStop(view) !== null && Math.abs(view.car.speed) <= 55;
  const remainingSeconds = Math.ceil(view.time);
  const minutes = Math.floor(remainingSeconds / 60);
  const seconds = String(remainingSeconds % 60).padStart(2, '0');
  const selectedName = target.id === 'safehouse' ? t.safehouse : target.name;
  const chooseTarget = (id: string) => {
    if (view.collected.length >= CRATE_GOAL || view.collected.includes(id)) return;
    engine.current.target = id;
    sync();
    if (overview) toggleMap();
    else focusCanvas();
  };
  const pedal = (control: keyof Controls, label: string, content: string) => (
    <button
      type="button"
      className={`heist-pedal heist-pedal-${control}`}
      aria-label={label}
      data-testid={`heist-${control}`}
      disabled={view.phase !== 'driving'}
      onPointerDown={(event) => {
        event.preventDefault();
        event.currentTarget.setPointerCapture(event.pointerId);
        input.current[control] = true;
        focusCanvas();
      }}
      onPointerUp={(event) => {
        input.current[control] = false;
        if (event.currentTarget.hasPointerCapture(event.pointerId))
          event.currentTarget.releasePointerCapture(event.pointerId);
      }}
      onPointerCancel={() => {
        input.current[control] = false;
      }}
      onLostPointerCapture={() => {
        input.current[control] = false;
      }}
      onContextMenu={(event) => event.preventDefault()}
    >
      {content}
    </button>
  );

  return (
    <section className="heist" data-testid="heist-game" data-phase={view.phase}>
      <header className="heist-header">
        <div>
          <span className="heist-eyebrow">INFERENCEX / GTA V</span>
          <h2>{t.title}</h2>
        </div>
        <div className="heist-wanted" aria-label={`${t.wanted}: ${view.heat}`}>
          {[1, 2, 3, 4, 5].map((level) => (
            <span key={level} className={level <= view.heat ? 'is-lit' : ''} aria-hidden="true">
              ★
            </span>
          ))}
        </div>
      </header>
      <div className="heist-stats">
        <div>
          <span>{t.cargo}</span>
          <strong data-testid="heist-cargo">
            {view.collected.length} / {CRATE_GOAL}
          </strong>
        </div>
        <div>
          <span>{t.health}</span>
          <strong>{Math.ceil(view.health)}%</strong>
          <meter min="0" max="100" value={view.health} aria-label={t.health} />
        </div>
        <div>
          <span>{t.timer}</span>
          <strong data-testid="heist-timer">
            {minutes}:{seconds}
          </strong>
        </div>
        <div>
          <span>MPH</span>
          <strong data-testid="heist-speed">
            {Math.round(Math.abs(view.car.speed) * 0.22)
              .toString()
              .padStart(3, '0')}
          </strong>
        </div>
      </div>
      <div className="heist-body">
        <div className="heist-viewport">
          <canvas
            ref={canvas}
            tabIndex={0}
            data-testid="heist-canvas"
            aria-label={`${t.title}. ${t.controls}`}
            onKeyDown={(event) => onKey(event, true)}
            onKeyUp={(event) => onKey(event, false)}
            onBlur={clearInput}
            onPointerDown={() => focusCanvas()}
            onClick={(event) => {
              if (!overview) return;
              const rect = event.currentTarget.getBoundingClientRect();
              const transform = camera(engine.current, rect.width, rect.height, true);
              const point = {
                x: (event.clientX - rect.left - transform.x) / transform.scale,
                y: (event.clientY - rect.top - transform.y) / transform.scale,
              };
              const office = OFFICES.find((stop) => distance(stop, point) < 110);
              if (office) chooseTarget(office.id);
            }}
          >
            {t.unavailable}
          </canvas>
          <div className="heist-gps" aria-live="polite">
            <span>{overview ? t.select : t.target}</span>
            {overview && view.collected.length < CRATE_GOAL && (
              <select
                className="heist-mobile-destination"
                aria-label={t.target}
                value={view.target}
                onChange={(event) => chooseTarget(event.target.value)}
                data-testid="heist-mobile-destination"
              >
                {OFFICES.filter((office) => !view.collected.includes(office.id)).map((office) => (
                  <option key={office.id} value={office.id}>
                    {office.name}
                  </option>
                ))}
              </select>
            )}
            {!overview && (
              <strong>
                {selectedName} <small>{Math.round(distance(view.car, target))} u</small>
              </strong>
            )}
          </div>
          <div className="heist-performance">
            {view.phase === 'driving' ? fps : '—'} FPS · CANVAS 2D
          </div>
          {((view.phase !== 'driving' && !overview) || unavailable) && (
            <div className="heist-cover">
              <div className="heist-cover-card">
                <span className="heist-eyebrow">{t.subtitle}</span>
                <h3>
                  {view.phase === 'ready'
                    ? t.title
                    : view.phase === 'won'
                      ? t.won
                      : view.phase === 'busted'
                        ? t.busted
                        : t.paused}
                </h3>
                <p>
                  {unavailable
                    ? t.unavailable
                    : view.phase === 'won'
                      ? t.wonBody
                      : view.phase === 'busted'
                        ? t.bustedBody
                        : t.brief}
                </p>
                {!unavailable && (
                  <button
                    type="button"
                    className="heist-primary"
                    data-testid="heist-start"
                    onClick={() => start(view.phase === 'won' || view.phase === 'busted')}
                  >
                    {view.phase === 'ready'
                      ? t.start
                      : view.phase === 'paused'
                        ? t.resume
                        : t.restart}
                  </button>
                )}
                <p className="heist-desktop-help">{t.controls}</p>
                <p className="heist-mobile-help">{t.mobileControls}</p>
              </div>
            </div>
          )}
        </div>
        <aside className="heist-stops" aria-label={t.stops}>
          <span className="heist-eyebrow">{t.stops}</span>
          {OFFICES.map((office, index) => (
            <button
              type="button"
              key={office.id}
              onClick={() => chooseTarget(office.id)}
              aria-pressed={target.id === office.id}
              disabled={view.collected.includes(office.id) || view.collected.length >= CRATE_GOAL}
              data-testid={`heist-stop-${office.id}`}
            >
              <b style={{ color: office.color }}>
                {view.collected.includes(office.id) ? '✓' : `0${index + 1}`}
              </b>
              <span>
                {office.name}
                <small>{office.city}</small>
              </span>
            </button>
          ))}
          <p>{t.disclaimer}</p>
        </aside>
      </div>
      <div className="heist-actions">
        <div className="heist-steering">
          {pedal('left', t.left, '←')}
          {pedal('right', t.right, '→')}
          {pedal('brake', t.brake, '⏸')}
        </div>
        <button
          type="button"
          className="heist-collect"
          data-testid="heist-collect"
          disabled={!canCollect}
          onClick={collect}
          title={canCollect ? undefined : t.park}
        >
          {view.collected.length >= CRATE_GOAL ? t.finish : t.collect}
        </button>
        <div className="heist-pedals">
          {pedal('reverse', t.reverse, '↓')}
          {pedal('forward', t.forward, '↑')}
        </div>
      </div>
      <footer className="heist-footer">
        <span className="heist-desktop-help">{t.controls}</span>
        <span className="heist-mobile-help">{t.mobileControls}</span>
        <div>
          <button type="button" onClick={toggleMap} data-testid="heist-map">
            {overview ? t.drive : t.map}
          </button>
          <button
            type="button"
            onClick={() => (view.phase === 'driving' ? pause() : start())}
            disabled={overview || view.phase === 'won' || view.phase === 'busted'}
            data-testid="heist-pause"
          >
            {view.phase === 'ready' ? t.start : view.phase === 'driving' ? t.pause : t.resume}
          </button>
          <button type="button" onClick={() => start(true)} data-testid="heist-reset">
            {t.restart}
          </button>
        </div>
      </footer>
    </section>
  );
}
