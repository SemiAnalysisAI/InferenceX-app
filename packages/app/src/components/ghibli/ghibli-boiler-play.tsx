'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { BoilerAudio } from './ghibli-boiler-audio';
import {
  BATCH_STEPS,
  BoilerEngine,
  FIELD_H,
  FIELD_W,
  type BoilerEvent,
  type Mode,
  type Result,
  type Sample,
} from './ghibli-boiler-engine';
import { CHAPTERS, tuningFor } from './ghibli-boiler-levels';
import { BoilerPainter, DOOR_COLOURS } from './ghibli-boiler-render';
import {
  CHAPTER_IDS,
  formatTokens,
  writeBoiler,
  type BoilerSave,
  type SandboxSettings,
} from './ghibli-boiler-store';
import { fill, type BoilerStrings } from './ghibli-boiler-strings';

interface Hud {
  goodput: number;
  goal: number;
  timeLeft: number;
  lanterns: number;
  tags: number;
  maxTags: number;
  stars: number;
  batch: number;
  limit: number;
  kv: number;
  kvCap: number;
  heat: number;
  heatLine: number;
  interactivity: number;
  throughput: number;
  p50: number;
  p99: number;
  slo: number;
  walk: number;
  wave: number;
  night: number;
  door: number;
  lanes: number;
  queued: number;
  boss: { hp: number; max: number; phase: number } | null;
  samples: Sample[];
  pinned: Sample[];
  frontier: [number, number][];
  castle: boolean;
  parakeets: boolean;
}

function snapshot(engine: BoilerEngine): Hud {
  const frontier: [number, number][] = [];
  for (let batch = 1; batch <= Math.max(8, engine.batchCap); batch += batch < 8 ? 1 : 4) {
    const rate = engine.rateAt(batch);
    frontier.push([rate, rate * batch]);
  }
  return {
    goodput: engine.goodput,
    goal: engine.goal,
    timeLeft: engine.timeLeft,
    lanterns: engine.lanterns,
    tags: engine.tags,
    maxTags: engine.tuning.tags,
    stars: engine.stars,
    batch: engine.batch,
    limit: engine.batchLimit,
    kv: engine.kv,
    kvCap: engine.kvCap,
    heat: engine.heat,
    heatLine: engine.heatLine,
    interactivity: engine.interactivity,
    throughput: engine.throughput,
    p50: engine.p50(),
    p99: engine.p99(),
    slo: engine.slo,
    walk: engine.walk,
    wave: engine.wave,
    night: engine.night,
    door: engine.door,
    lanes: engine.lanes,
    queued: Array.from({ length: engine.lanes }, (_, lane) => engine.queue(lane).length).reduce(
      (sum, n) => sum + n,
      0,
    ),
    boss: engine.boss
      ? { hp: engine.boss.hp, max: engine.boss.max, phase: engine.boss.phase }
      : null,
    samples: engine.samples.slice(-60),
    pinned: [...engine.pinned],
    frontier,
    castle: Boolean(engine.hazards.castle),
    parakeets: Boolean(engine.hazards.parakeets),
  };
}

/** Events worth a line of text; the rest are heard and seen only. */
const TOLD: BoilerEvent[] = [
  'oom',
  'out',
  'warn-kv',
  'gold',
  'surge',
  'kodama',
  'night',
  'day',
  'wave',
  'parakeet',
  'stolen',
  'wave-up',
  'boss-phase',
  'boss-eat',
  'boss-hit',
  'tag-empty',
  'helper',
];

function Meter({
  label,
  value,
  max,
  text,
  tone,
  marker,
}: {
  label: string;
  value: number;
  max: number;
  text: string;
  tone: 'kv' | 'heat' | 'goal' | 'boss' | 'walk';
  marker?: number;
}) {
  const share = Math.max(0, Math.min(1, value / Math.max(1, max)));
  return (
    <div
      className="ghibli-boiler-meter"
      data-tone={tone}
      data-hot={share > 0.86 ? 'true' : undefined}
    >
      <div className="ghibli-boiler-meter-head">
        <span>{label}</span>
        <span className="ghibli-boiler-num">{text}</span>
      </div>
      <div
        className="ghibli-boiler-meter-track"
        role="meter"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={Math.round(max)}
        aria-valuenow={Math.round(value)}
        aria-valuetext={text}
      >
        <span className="ghibli-boiler-meter-fill" style={{ width: `${share * 100}%` }} />
        {marker !== undefined && (
          <span className="ghibli-boiler-meter-mark" style={{ left: `${(marker / max) * 100}%` }} />
        )}
      </div>
    </div>
  );
}

function Pareto({ hud, t }: { hud: Hud; t: BoilerStrings }) {
  const width = 220;
  const height = 132;
  const pad = 22;
  const maxX = 70;
  const maxY = Math.max(
    600,
    ...hud.frontier.map(([, y]) => y),
    ...hud.samples.map((sample) => sample.throughput),
    ...hud.pinned.map((sample) => sample.throughput),
  );
  const sx = (value: number) => pad + (Math.min(maxX, value) / maxX) * (width - pad - 6);
  const sy = (value: number) => height - pad - (value / maxY) * (height - pad - 8);
  const frontier = hud.frontier
    .map(([x, y], index) => `${index ? 'L' : 'M'}${sx(x).toFixed(1)},${sy(y).toFixed(1)}`)
    .join('');
  return (
    <figure className="ghibli-boiler-pareto">
      <figcaption>{t.hud.pareto}</figcaption>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={`${t.hud.pareto}. ${t.hud.paretoNote}`}
      >
        <rect
          x={pad}
          y={8}
          width={width - pad - 6}
          height={height - pad - 8}
          className="ghibli-boiler-pareto-paper"
        />
        <line
          x1={sx(hud.slo)}
          x2={sx(hud.slo)}
          y1={8}
          y2={height - pad}
          className="ghibli-boiler-pareto-slo"
        />
        <path d={frontier} className="ghibli-boiler-pareto-frontier" />
        {hud.samples.map((sample, index) => (
          <circle
            key={index}
            cx={sx(sample.interactivity)}
            cy={sy(sample.throughput)}
            r={2.4}
            className="ghibli-boiler-pareto-dot"
            style={{ opacity: 0.25 + (index / Math.max(1, hud.samples.length)) * 0.75 }}
          />
        ))}
        {hud.pinned.map((sample, index) => (
          <g
            key={`pin-${index}`}
            transform={`translate(${sx(sample.interactivity)},${sy(sample.throughput)})`}
          >
            <path
              d="M0,-5 L1.5,-1.5 L5,0 L1.5,1.5 L0,5 L-1.5,1.5 L-5,0 L-1.5,-1.5Z"
              className="ghibli-boiler-pareto-pin"
            />
          </g>
        ))}
        {hud.batch > 0 && (
          <circle
            cx={sx(hud.interactivity)}
            cy={sy(hud.throughput)}
            r={4.5}
            className="ghibli-boiler-pareto-now"
          />
        )}
        <text x={width - 6} y={height - 6} textAnchor="end" className="ghibli-boiler-pareto-axis">
          {t.hud.perUser}
        </text>
        <text x={4} y={14} className="ghibli-boiler-pareto-axis">
          {t.hud.perGpu}
        </text>
        <text x={sx(hud.slo) + 3} y={height - pad - 4} className="ghibli-boiler-pareto-axis">
          {fill(t.hud.slo, { n: hud.slo })}
        </text>
      </svg>
    </figure>
  );
}

export interface PlayProps {
  mode: Mode;
  chapterIndex: number;
  save: BoilerSave;
  t: BoilerStrings;
  locale: 'en' | 'zh';
  audio: BoilerAudio | null;
  reduced: boolean;
  onMenu: () => void;
  onFinish: (result: Result) => void;
  onNext: () => void;
}

export function BoilerPlay({
  mode,
  chapterIndex,
  save,
  t,
  locale,
  audio,
  reduced,
  onMenu,
  onFinish,
  onNext,
}: PlayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<BoilerEngine | null>(null);
  const painterRef = useRef<BoilerPainter | null>(null);
  const unitsRef = useRef(1);
  const [run, setRun] = useState(0);
  const [paused, setPaused] = useState(false);
  const pausedRef = useRef(false);
  const [hud, setHud] = useState<Hud | null>(null);
  const [toast, setToast] = useState('');
  const [result, setResult] = useState<Result | null>(null);
  const [sandbox, setSandbox] = useState<SandboxSettings>(save.sandbox);
  const loopRef = useRef<() => void>(() => {});
  const saveRef = useRef(save);
  saveRef.current = save;
  const callbacks = useRef({ onFinish, t });
  callbacks.current = { onFinish, t };
  const chapter = CHAPTERS[chapterIndex];

  const labels = useMemo(() => ({ kinds: t.kinds, doors: t.doors }), [t]);

  const setPause = useCallback((next: boolean) => {
    pausedRef.current = next;
    setPaused(next);
    if (!next) loopRef.current();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const current = saveRef.current;
    const engine = new BoilerEngine({
      mode,
      chapterIndex,
      tuning: tuningFor(current.upgrades),
      sandbox: mode === 'sandbox' ? { ...current.sandbox } : undefined,
      blend: current.blend,
      helper: current.helper,
      bossPhase:
        mode === 'campaign' && current.bossCheckpoint >= 2
          ? (Math.min(3, current.bossCheckpoint) as 2 | 3)
          : undefined,
    });
    engineRef.current = engine;
    setResult(null);
    pausedRef.current = false;
    setPaused(false);
    const painter = new BoilerPainter(canvas, { reduced, assist: current.assist, labels });
    painterRef.current = painter;
    unitsRef.current = painter.resize();
    let toastTimer: number | undefined;
    if (engine.boss && engine.boss.phase > 1) {
      const copy = callbacks.current.t;
      setToast(
        `${fill(copy.bossResume, { n: engine.boss.phase })} ${copy.bossPhases[engine.boss.phase - 1]}`,
      );
      toastTimer = window.setTimeout(() => setToast(''), 4200);
    }
    engine.on((event) => {
      const detail =
        event === 'door'
          ? engine.door / Math.max(1, engine.lanes - 1)
          : event === 'lever'
            ? engine.lever / (BATCH_STEPS.length - 1)
            : event === 'admit'
              ? Math.min(1, engine.batch / 64)
              : event === 'complete'
                ? Math.min(1, engine.interactivity / 60)
                : 0;
      audio?.cue(event, detail);
      if (TOLD.includes(event)) {
        const copy = callbacks.current.t;
        let line = copy.events[event as keyof typeof copy.events] ?? '';
        if (event === 'wave-up') line = fill(line, { n: engine.wave });
        if (event === 'boss-phase' && engine.boss) {
          line = `${line} ${copy.bossPhases[engine.boss.phase - 1]}`;
          const phase = engine.boss.phase;
          writeBoiler((stored) =>
            stored.bossCheckpoint >= phase ? stored : { ...stored, bossCheckpoint: phase },
          );
        }
        setToast(line);
        window.clearTimeout(toastTimer);
        toastTimer = window.setTimeout(() => setToast(''), 3200);
      }
      if (event === 'end') {
        const final = engine.result();
        setResult(final);
        setHud(snapshot(engine));
        callbacks.current.onFinish(final);
      }
    });

    let frame: number | undefined;
    let last = performance.now();
    const tick = (now: number) => {
      frame = undefined;
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (!pausedRef.current) engine.step(dt);
      painter.draw(engine, now / 1000);
      if (!pausedRef.current && !engine.over) frame = requestAnimationFrame(tick);
    };
    const start = () => {
      if (frame !== undefined || engine.over) return;
      last = performance.now();
      frame = requestAnimationFrame(tick);
    };
    loopRef.current = start;
    start();

    const hudTimer = window.setInterval(() => {
      if (pausedRef.current || engine.over) return;
      setHud(snapshot(engine));
      audio?.update({
        heat: engine.heat,
        batch: engine.batch,
        pressure: engine.kv / Math.max(1, engine.kvCap),
        night: engine.night,
        mood: engine.boss ? 5 : mode === 'campaign' ? chapter.act : mode === 'endless' ? 2 : 1,
        paused: false,
      });
    }, 250);
    setHud(snapshot(engine));

    const observer = new ResizeObserver(() => {
      unitsRef.current = painter.resize();
      painter.draw(engine, performance.now() / 1000);
    });
    observer.observe(canvas);
    const onVisibility = () => {
      if (document.hidden && !engine.over) {
        pausedRef.current = true;
        setPaused(true);
      }
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      if (frame !== undefined) cancelAnimationFrame(frame);
      window.clearInterval(hudTimer);
      window.clearTimeout(toastTimer);
      observer.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
      engineRef.current = null;
      painterRef.current = null;
      loopRef.current = () => {};
    };
    // A new run restarts everything; strings and audio are read through refs or stay stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run, mode, chapterIndex]);

  useEffect(() => {
    painterRef.current?.setOptions({ reduced, assist: save.assist, labels });
    const engine = engineRef.current;
    if (engine) painterRef.current?.draw(engine, performance.now() / 1000);
  }, [reduced, save.assist, labels]);

  useEffect(() => {
    audio?.update({ paused });
  }, [audio, paused]);

  const act = useCallback(
    (action: 'tag' | 'shoo' | 'up' | 'down' | 'left' | 'right' | 'pin' | number) => {
      const engine = engineRef.current;
      if (!engine || engine.over) return;
      if (pausedRef.current) return;
      if (typeof action === 'number') engine.setDoor(action);
      else if (action === 'tag') engine.useTag();
      else if (action === 'shoo') engine.shoo();
      else if (action === 'up') engine.setLever(1);
      else if (action === 'down') engine.setLever(-1);
      else if (action === 'left') engine.moveDoor(-1);
      else if (action === 'right') engine.moveDoor(1);
      else if (action === 'pin') engine.pin();
      painterRef.current?.draw(engine, performance.now() / 1000);
      setHud(snapshot(engine));
    },
    [],
  );

  const restart = useCallback(() => setRun((value) => value + 1), []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest('input, select, textarea')) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const key = event.key.toLowerCase();
      const engine = engineRef.current;
      let handled = true;
      if (/^[1-4]$/.test(key)) act(Number(key) - 1);
      else if (key === 'arrowleft' || key === 'a') act('left');
      else if (key === 'arrowright' || key === 'd') act('right');
      else if (key === 'arrowup' || key === 'w') act('up');
      else if (key === 'arrowdown' || key === 's') act('down');
      else if (key === ' ' || key === 'spacebar') act('tag');
      else if (key === 'e') act('shoo');
      else if (key === 'p') {
        if (engine && !engine.over) setPause(!pausedRef.current);
      } else if (key === 'r') restart();
      else if (key === 'enter' && engine?.over) {
        if (target?.closest('button')) handled = false;
        else restart();
      } else handled = false;
      if (handled) event.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [act, restart, setPause]);

  const onPointer = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const engine = engineRef.current;
    const canvas = canvasRef.current;
    if (!engine || !canvas || engine.over) return;
    if (pausedRef.current) {
      setPause(false);
      return;
    }
    const rect = canvas.getBoundingClientRect();
    const x = (event.clientX - rect.left) * (FIELD_W / rect.width);
    const y = (event.clientY - rect.top) * (FIELD_H / rect.height);
    if (engine.shoo(x, y)) return;
    const lane = engine.laneAt(x, y);
    if (lane >= 0) act(lane);
  };

  const updateSandbox = (patch: Partial<SandboxSettings>) => {
    const next = { ...sandbox, ...patch };
    setSandbox(next);
    if (engineRef.current) engineRef.current.sandbox = next;
    writeBoiler((current) => ({ ...current, sandbox: next }));
  };

  const h = hud;
  const kvShare = h ? Math.round((h.kv / Math.max(1, h.kvCap)) * 100) : 0;
  const title =
    mode === 'campaign'
      ? `${fill(t.map.act, { n: chapter.act })} · ${t.chapters[CHAPTER_IDS[chapterIndex]].name}`
      : mode === 'endless'
        ? `${t.modes.endless} · ${fill(t.hud.wave, { n: h?.wave ?? 1 })}`
        : t.modes.sandbox;

  const medalName = result ? t.end.medal[result.medal] : '';
  let endTitle = '';
  if (result?.failed) endTitle = t.end.fail;
  else if (result && chapter.hazards.boss && mode === 'campaign')
    endTitle = result.medal > 0 ? t.end.bossDown : t.end.timeUp;
  else if (result)
    endTitle = mode === 'campaign' && result.medal === 0 ? t.end.timeUp : t.end.clear;

  return (
    <div className="ghibli-boiler-play" data-mode={mode}>
      {h && !result && (
        // Phone only: the four cues that matter mid-shift, pinned at the top of the dialog.
        // The full HUD below stays the readable version, so this row is hidden from assistive tech.
        <div className="ghibli-boiler-chips" aria-hidden="true" data-testid="ghibli-boiler-chips">
          <span>
            {t.hud.queue} <b className="ghibli-boiler-num">{h.queued}</b>
          </span>
          <span data-warn={kvShare >= 85 ? 'true' : undefined}>
            {t.hud.kv} <b className="ghibli-boiler-num">{kvShare}%</b>
          </span>
          {h.boss ? (
            <span>
              {t.hud.hunger}{' '}
              <b className="ghibli-boiler-num">
                {Math.round((h.boss.hp / Math.max(1, h.boss.max)) * 100)}%
              </b>
            </span>
          ) : (
            <span>
              {t.hud.goodput}{' '}
              <b className="ghibli-boiler-num">
                {formatTokens(h.goodput, locale)}
                {mode === 'campaign' && h.goal ? `/${formatTokens(h.goal, locale)}` : ''}
              </b>
            </span>
          )}
          {mode === 'sandbox' ? (
            <span>
              {t.hud.batch} <b className="ghibli-boiler-num">{h.batch}</b>
            </span>
          ) : (
            <span>
              {t.hud.lanterns} <b className="ghibli-boiler-num">{h.lanterns}/3</b>
            </span>
          )}
        </div>
      )}
      <div className="ghibli-boiler-stage">
        <div className="ghibli-boiler-stage-head">
          <p className="ghibli-boiler-stage-title">{title}</p>
          {mode === 'campaign' && (
            <ol className="ghibli-boiler-route" aria-label={t.map.route}>
              {CHAPTER_IDS.map((id, index) => (
                <li
                  key={id}
                  data-current={index === chapterIndex ? 'true' : undefined}
                  data-medal={save.medals[id] ?? 0}
                  title={t.chapters[id].name}
                >
                  <span className="sr-only">
                    {t.chapters[id].name}
                    {index === chapterIndex ? ` (${t.hud.door})` : ''}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </div>
        <div className="ghibli-boiler-canvas-wrap">
          <canvas
            ref={canvasRef}
            className="ghibli-boiler-canvas"
            tabIndex={0}
            aria-label={t.canvasLabel}
            aria-describedby="ghibli-boiler-keys"
            onPointerDown={onPointer}
            data-testid="ghibli-boiler-canvas"
          />
          {paused && !result && (
            <div className="ghibli-boiler-veil">
              <p>{t.controls.paused}</p>
              <button
                type="button"
                className="ghibli-boiler-btn"
                data-tone="primary"
                onClick={() => setPause(false)}
              >
                {t.controls.resume}
              </button>
            </div>
          )}
          {result && (
            <div
              className="ghibli-boiler-veil ghibli-boiler-result"
              role="status"
              data-testid="ghibli-boiler-result"
            >
              <p className="ghibli-boiler-result-title">{endTitle}</p>
              {mode === 'campaign' && (
                <p className="ghibli-boiler-medal" data-medal={result.medal}>
                  {medalName}
                </p>
              )}
              {mode === 'endless' && <p>{fill(t.end.wave, { n: result.wave })}</p>}
              <dl className="ghibli-boiler-stats">
                <dt>{t.end.goodput}</dt>
                <dd>
                  {formatTokens(result.goodput, locale)}
                  {result.goal ? ` / ${formatTokens(result.goal, locale)}` : ''}
                </dd>
                <dt>{t.end.peak}</dt>
                <dd>
                  {result.peakThroughput} {t.hud.perGpu}
                </dd>
                <dt>{t.end.ttft}</dt>
                <dd>
                  {result.p50.toFixed(1)}s / {result.p99.toFixed(1)}s
                </dd>
                <dt>{t.end.stars}</dt>
                <dd>{result.stars}</dd>
              </dl>
              {mode === 'campaign' && (
                <p className="ghibli-boiler-small">
                  {chapter.hazards.boss ? t.end.bossRule : t.end.medalRule}
                </p>
              )}
              <div className="ghibli-boiler-row">
                <button type="button" className="ghibli-boiler-btn" onClick={restart}>
                  {t.end.again}
                </button>
                {mode === 'campaign' && result.medal > 0 && chapterIndex < CHAPTERS.length - 1 && (
                  <button
                    type="button"
                    className="ghibli-boiler-btn"
                    data-tone="primary"
                    onClick={onNext}
                  >
                    {t.end.next}
                  </button>
                )}
                <button type="button" className="ghibli-boiler-btn" onClick={onMenu}>
                  {t.controls.menu}
                </button>
              </div>
            </div>
          )}
        </div>
        <div className="ghibli-boiler-pad" role="group" aria-label={t.hud.door}>
          {Array.from({ length: h?.lanes ?? chapter.lanes }, (_, lane) => (
            <button
              key={lane}
              type="button"
              className="ghibli-boiler-door"
              style={{ '--door': DOOR_COLOURS[lane] } as React.CSSProperties}
              aria-pressed={h?.door === lane}
              aria-label={`${t.doors[lane]} (${lane + 1})`}
              onClick={() => act(lane)}
            >
              <span aria-hidden="true">{lane + 1}</span>
            </button>
          ))}
        </div>
        <div className="ghibli-boiler-pad" role="group">
          {mode !== 'sandbox' && (
            <>
              <button
                type="button"
                className="ghibli-boiler-btn"
                onClick={() => act('down')}
                aria-label={t.controls.down}
              >
                <span aria-hidden="true">−</span> {t.hud.batch}
              </button>
              <button
                type="button"
                className="ghibli-boiler-btn"
                onClick={() => act('up')}
                aria-label={t.controls.up}
              >
                <span aria-hidden="true">+</span> {t.hud.batch}
              </button>
            </>
          )}
          <button
            type="button"
            className="ghibli-boiler-btn"
            data-tone="tag"
            onClick={() => act('tag')}
          >
            {t.controls.tag} · {h?.tags ?? 0}
          </button>
          {h?.parakeets && (
            <button type="button" className="ghibli-boiler-btn" onClick={() => act('shoo')}>
              {t.controls.shoo}
            </button>
          )}
          {mode === 'sandbox' && (
            <button type="button" className="ghibli-boiler-btn" onClick={() => act('pin')}>
              {t.sandbox.pin}
            </button>
          )}
          <button
            type="button"
            className="ghibli-boiler-btn"
            onClick={() => setPause(!paused)}
            disabled={Boolean(result)}
            data-testid="ghibli-boiler-pause"
          >
            {paused ? t.controls.resume : t.controls.pause}
          </button>
          <button type="button" className="ghibli-boiler-btn" onClick={restart}>
            {t.controls.restart}
          </button>
          <button type="button" className="ghibli-boiler-btn" onClick={onMenu}>
            {t.controls.menu}
          </button>
        </div>
        <p id="ghibli-boiler-keys" className="ghibli-boiler-small">
          {t.controls.keys}
        </p>
      </div>

      <aside className="ghibli-boiler-hud" aria-label={t.hud.goodput}>
        {h && (
          <>
            <p
              className="ghibli-boiler-toast"
              aria-live="polite"
              data-empty={toast ? undefined : 'true'}
            >
              {toast}
            </p>
            {h.boss ? (
              <>
                <Meter
                  label={t.hud.hunger}
                  value={h.boss.hp}
                  max={h.boss.max}
                  text={fill(t.hud.phase, { n: h.boss.phase })}
                  tone="boss"
                />
              </>
            ) : mode === 'campaign' ? (
              <Meter
                label={t.hud.goodput}
                value={h.goodput}
                max={h.goal * 1.5}
                text={`${formatTokens(h.goodput, locale)} · ${fill(t.hud.goal, { n: formatTokens(h.goal, locale) })}`}
                tone="goal"
                marker={h.goal}
              />
            ) : (
              <div className="ghibli-boiler-stat-line">
                <span>{t.hud.goodput}</span>
                <span className="ghibli-boiler-num">{formatTokens(h.goodput, locale)}</span>
              </div>
            )}
            {h.castle && (
              <Meter
                label={t.hud.walk}
                value={h.walk}
                max={100}
                text={`${Math.round(h.walk)}%`}
                tone="walk"
              />
            )}
            <Meter label={t.hud.kv} value={h.kv} max={h.kvCap} text={`${kvShare}%`} tone="kv" />
            <Meter
              label={t.hud.heat}
              value={h.heat}
              max={100}
              text={`${Math.round(h.heat)}°`}
              tone="heat"
              marker={h.castle ? h.heatLine : undefined}
            />
            <dl className="ghibli-boiler-grid">
              <div>
                <dt>{t.hud.throughput}</dt>
                <dd className="ghibli-boiler-num">
                  {Math.round(h.throughput)} <small>{t.hud.perGpu}</small>
                </dd>
              </div>
              <div data-low={h.batch > 0 && h.interactivity < h.slo ? 'true' : undefined}>
                <dt>{t.hud.interactivity}</dt>
                <dd className="ghibli-boiler-num">
                  {Math.round(h.interactivity)} <small>{t.hud.perUser}</small>
                </dd>
              </div>
              <div>
                <dt>{t.hud.batch}</dt>
                <dd className="ghibli-boiler-num">
                  {h.batch} <small>{fill(t.hud.limit, { n: h.limit })}</small>
                </dd>
              </div>
              <div>
                <dt>{t.hud.ttft}</dt>
                <dd className="ghibli-boiler-num">
                  {h.p50.toFixed(1)} / {h.p99.toFixed(1)}s
                </dd>
              </div>
              {mode !== 'sandbox' && (
                <div>
                  <dt>{t.hud.lanterns}</dt>
                  <dd className="ghibli-boiler-lanterns" aria-label={`${h.lanterns} / 3`}>
                    {[0, 1, 2].map((index) => (
                      <span
                        key={index}
                        data-lit={index < h.lanterns ? 'true' : undefined}
                        aria-hidden="true"
                      />
                    ))}
                  </dd>
                </div>
              )}
              {mode === 'campaign' && (
                <div>
                  <dt>{t.hud.time}</dt>
                  <dd className="ghibli-boiler-num">{Math.ceil(h.timeLeft)}s</dd>
                </div>
              )}
              <div>
                <dt>{t.hud.stars}</dt>
                <dd className="ghibli-boiler-num">{h.stars}</dd>
              </div>
            </dl>
            <Pareto hud={h} t={t} />
            {mode === 'sandbox' && (
              <div className="ghibli-boiler-bench">
                <label>
                  <span>
                    {t.sandbox.batch}: {sandbox.batchCap}
                  </span>
                  <input
                    type="range"
                    min={1}
                    max={64}
                    value={sandbox.batchCap}
                    onChange={(event) => updateSandbox({ batchCap: Number(event.target.value) })}
                  />
                </label>
                <label>
                  <span>
                    {t.sandbox.arrival}: ×{sandbox.arrival.toFixed(2)}
                  </span>
                  <input
                    type="range"
                    min={0.25}
                    max={3}
                    step={0.25}
                    value={sandbox.arrival}
                    onChange={(event) => updateSandbox({ arrival: Number(event.target.value) })}
                  />
                </label>
                <label>
                  <span>
                    {t.sandbox.kv}: {sandbox.kvCap}
                  </span>
                  <input
                    type="range"
                    min={40}
                    max={200}
                    step={10}
                    value={sandbox.kvCap}
                    onChange={(event) => updateSandbox({ kvCap: Number(event.target.value) })}
                  />
                </label>
                <label>
                  <span>{t.sandbox.mix}</span>
                  <select
                    value={sandbox.mix}
                    onChange={(event) =>
                      updateSandbox({ mix: event.target.value as SandboxSettings['mix'] })
                    }
                  >
                    {(['balanced', 'fp4', 'bf16', 'longkv'] as const).map((mix) => (
                      <option key={mix} value={mix}>
                        {t.sandbox.mixes[mix]}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="ghibli-boiler-check">
                  <input
                    type="checkbox"
                    checked={sandbox.autoDoor}
                    onChange={(event) => updateSandbox({ autoDoor: event.target.checked })}
                  />
                  <span>{t.sandbox.auto}</span>
                </label>
                <p className="ghibli-boiler-small">{t.sandbox.note}</p>
              </div>
            )}
            <p className="sr-only" aria-live="off">
              {fill(t.status, {
                g: formatTokens(h.goodput, locale),
                goal: formatTokens(h.goal, locale),
                b: h.batch,
                k: kvShare,
              })}
            </p>
          </>
        )}
      </aside>
    </div>
  );
}
