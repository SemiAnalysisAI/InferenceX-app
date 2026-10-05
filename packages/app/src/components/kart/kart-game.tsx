'use client';

import { useEffect, useRef, useState } from 'react';
import {
  EMPTY_CONTROLS,
  lap,
  LAPS,
  newRace,
  pauseRace,
  raceText,
  startRace,
  stepRace,
  TRACK,
  TRACK_LENGTH,
  type Controls,
} from './kart-engine';
import { createKartRenderer } from './kart-renderer';
import './kart.css';

const COPY = {
  en: {
    title: 'Luigi Circuit',
    subtitle: 'Mario Kart Wii · 3-lap arcade race',
    start: 'Start race',
    resume: 'Resume race',
    pause: 'Pause',
    restart: 'New race',
    ready: 'On the grid',
    paused: 'Race paused',
    finished: 'Finish!',
    place: 'Position',
    lap: 'Lap',
    time: 'Time',
    boost: 'Boost',
    drift: 'Drift',
    accelerate: 'Accelerate',
    brake: 'Brake',
    left: 'Steer left',
    right: 'Steer right',
    loading: 'Loading Luigi Circuit and Mario…',
    error: 'The 3D race could not load. Check WebGL support and your connection, then retry.',
    retry: 'Retry',
    controls: 'WASD / arrows: drive · Space: drift · Shift: boost · P: pause',
    brief:
      'Race three opponents. Hold accelerate; steering assist follows the bends. Steer across the track, hold drift through a turn, then release for a boost.',
    assisted: 'Assisted steering',
    result: 'Your finishing position',
    close: 'Close race to return to the dashboard.',
    map: 'Course map',
    canvas: '3D race. Use WASD or arrow keys to drive.',
    go: 'GO!',
  },
  zh: {
    title: 'Luigi Circuit',
    subtitle: 'Mario Kart Wii · 三圈街机竞速',
    start: '开始比赛',
    resume: '继续比赛',
    pause: '暂停',
    restart: '重新比赛',
    ready: '准备发车',
    paused: '比赛已暂停',
    finished: '冲线！',
    place: '名次',
    lap: '圈数',
    time: '用时',
    boost: '冲刺',
    drift: '漂移',
    accelerate: '加速',
    brake: '刹车',
    left: '向左转',
    right: '向右转',
    loading: '正在加载 Luigi Circuit 和 Mario…',
    error: '无法加载 3D 比赛。请检查 WebGL 支持和网络连接，然后重试。',
    retry: '重试',
    controls: 'WASD / 方向键：驾驶 · 空格：漂移 · Shift：冲刺 · P：暂停',
    brief:
      '与三名对手竞速。按住加速，转向辅助会跟随赛道弯道。左右转向可调整横向位置；转弯时按住漂移，松开后获得短时冲刺。',
    assisted: '转向辅助已开启',
    result: '最终名次',
    close: '关闭比赛即可返回仪表板。',
    map: '赛道地图',
    canvas: '3D 比赛。使用 WASD 或方向键驾驶。',
    go: '出发！',
  },
};
type DebugWindow = Window & {
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
  ShiftLeft: 'boost',
  ShiftRight: 'boost',
};
const clock = (seconds: number) =>
  `${Math.floor(seconds / 60)}:${(seconds % 60).toFixed(2).padStart(5, '0')}`;

export function KartGame({
  locale = 'en',
  assetBase,
}: {
  locale?: 'en' | 'zh';
  assetBase?: string;
}) {
  const t = COPY[locale];
  const canvas = useRef<HTMLCanvasElement>(null);
  const map = useRef<HTMLCanvasElement>(null);
  const race = useRef(newRace());
  const input = useRef<Controls>({ ...EMPTY_CONTROLS });
  const pressed = useRef(new Set<string>());
  const touches = useRef(new Map<number, keyof Controls>());
  const [view, setView] = useState(newRace);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [attempt, setAttempt] = useState(0);
  const [stats, setStats] = useState({ fps: 0, calls: 0, triangles: 0 });
  const sync = () => setView({ ...race.current, player: { ...race.current.player } });
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
  const pause = () => {
    pauseRace(race.current);
    clear();
    sync();
  };
  const start = () => {
    clear();
    startRace(race.current);
    sync();
    canvas.current?.focus();
  };
  const restart = () => {
    clear();
    race.current = newRace();
    sync();
    canvas.current?.focus();
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
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const debug = window as DebugWindow;
    setStatus('loading');
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
      renderer = createKartRenderer(element, assetBase);
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
      if (!ctx) return;
      ctx.clearRect(0, 0, 170, 170);
      ctx.beginPath();
      for (let i = 0; i <= 100; i++) {
        const p = TRACK.getPointAt(i / 100);
        const x = (p.x + 230) * 0.32 + 15,
          y = (p.z + 90) * 0.23 + 10;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 8;
      ctx.stroke();
      [race.current.player, ...race.current.opponents].forEach((r, i) => {
        const p = TRACK.getPointAt((r.distance % TRACK_LENGTH) / TRACK_LENGTH);
        ctx.fillStyle = ['#ed263b', '#20c960', '#2588ec', '#ffd329'][i];
        ctx.beginPath();
        ctx.arc((p.x + 230) * 0.32 + 15, (p.z + 90) * 0.23 + 10, i === 0 ? 5 : 3, 0, Math.PI * 2);
        ctx.fill();
      });
    };
    const paint = (dt: number) => {
      renderer.draw(race.current, dt, reducedMotion.matches);
      paintMap();
    };
    const tick = (now: number) => {
      if (!live) return;
      const dt = Math.min((now - (last || now)) / 1000, 0.1);
      last = now;
      if (loaded) {
        if (!manualClock) {
          accumulator += dt;
          while (accumulator >= 1 / 60) {
            stepRace(race.current, input.current, 1 / 60);
            accumulator -= 1 / 60;
          }
        }
        paint(dt);
        elapsed += dt;
        hudElapsed += dt;
        frames++;
        if (hudElapsed >= 0.12) {
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
    renderer.ready
      .then(() => {
        if (!live) return;
        loaded = true;
        setStatus('ready');
        paint(1);
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
      debug.advanceTime = (ms) => {
        if (!loaded || !Number.isFinite(ms) || ms < 0) return;
        manualClock = true;
        for (let i = 0; i < Math.min(60000, Math.floor(ms / (1000 / 60))); i++)
          stepRace(race.current, input.current, 1 / 60);
        paint(1 / 60);
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
      renderer.dispose();
    };
  }, [attempt, assetBase]);

  return (
    <div className="kart-game" data-testid="kart-game" data-phase={view.phase} data-status={status}>
      <canvas
        key={attempt}
        ref={canvas}
        className="kart-canvas"
        tabIndex={['racing', 'countdown'].includes(view.phase) ? 0 : -1}
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
      <div className="kart-hud">
        <div className="kart-title">
          <span>MARIO KART</span>
          <strong>{t.title}</strong>
        </div>
        <div className="kart-metrics">
          <div>
            <span>{t.place}</span>
            <strong>
              {view.place}
              <small> / 4</small>
            </strong>
          </div>
          <div>
            <span>{t.lap}</span>
            <strong>
              {lap(view)}
              <small> / {LAPS}</small>
            </strong>
          </div>
          <div>
            <span>{t.time}</span>
            <strong>{clock(view.elapsed)}</strong>
          </div>
        </div>
      </div>
      {['racing', 'countdown'].includes(view.phase) && (
        <div className="kart-actions">
          <button
            type="button"
            data-testid="kart-pause"
            disabled={status !== 'ready' || !['racing', 'countdown'].includes(view.phase)}
            onClick={pause}
          >
            {t.pause}
          </button>
          <button type="button" data-testid="kart-reset" onClick={restart}>
            {t.restart}
          </button>
        </div>
      )}
      <canvas ref={map} width={170} height={170} className="kart-map" aria-label={t.map} />
      <div className="kart-speed">
        <strong>
          {Math.round(view.player.speed * 1.5)
            .toString()
            .padStart(3, '0')}
        </strong>
        <span>km/h</span>
      </div>
      <div className={`kart-boost ${view.turbo > 0 ? 'kart-boost-active' : ''}`}>
        <span>{t.boost} · Shift</span>
        <meter min="0" max="100" value={view.charge} aria-label={t.boost} />
      </div>
      <div className="kart-touch">
        {(['left', 'right', 'brake', 'drift', 'boost', 'throttle'] as const).map((control) => (
          <button
            key={control}
            type="button"
            aria-label={control === 'throttle' ? t.accelerate : t[control]}
            data-testid={`kart-${control}`}
            disabled={status !== 'ready' || view.phase !== 'racing'}
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
          <section className="kart-card" aria-live="polite">
            <span className="kart-kicker">MARIO KART WII</span>
            <h2>
              {status === 'loading'
                ? t.loading
                : status === 'error'
                  ? t.title
                  : view.phase === 'ready'
                    ? t.ready
                    : view.phase === 'paused'
                      ? t.paused
                      : t.finished}
            </h2>
            <p>
              {status === 'error'
                ? t.error
                : view.phase === 'finished'
                  ? `${t.result}: ${view.place} / 4 · ${clock(view.elapsed)}`
                  : t.brief}
            </p>
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
            <span className="kart-assist">{t.assisted}</span>
          </section>
        </div>
      ) : null}
      {view.phase === 'countdown' && (
        <div className="kart-countdown" aria-live="assertive">
          {Math.ceil(view.countdown)}
        </div>
      )}
      {view.phase === 'racing' && view.elapsed < 0.7 && (
        <div className="kart-countdown">{t.go}</div>
      )}
      <div className="kart-performance">
        {stats.fps} FPS · {stats.calls} draw · {Math.round(stats.triangles / 1000)}k tri
      </div>
    </div>
  );
}
