'use client';

import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import {
  CHAPTERS,
  BATCHES,
  PRECISIONS,
  inTransmitRange,
  restartStage,
  HEIGHT,
  WIDTH,
  createAttempt,
  step,
  transmit,
  upgrade,
  upgradeCost,
  type Attempt,
  type Controls,
  type Mode,
} from './halo-relay-engine';
import { haloSynth } from './halo-sound';
import { haloRead, haloWrite, useHaloValue } from './halo-state';
import { relayEngineAudio } from './halo-relay-audio';
import { drawBulkhead, drawSentinel, drawSkiff, drawTerrain } from './halo-relay-art';
import { HALO_ART, lines, playHaloClip, stopHaloClip } from './halo-archive';
import { haloMusicEnabled, HALO_MUSIC_KEY } from './halo-music';

const modalModes: [Mode, string, string][] = [
  ['campaign', 'Campaign', '战役'],
  ['endless', 'Endless', '无尽'],
  ['sandbox', 'Sandbox', '沙盒'],
];
const direction = [
  ['↑', 0, -1],
  ['←', -1, 0],
  ['↓', 0, 1],
  ['→', 1, 0],
] as const;
const scoreKey = (mode: Mode) => `halo-relay-best-${mode}`;

function paintBackdrop(canvas: HTMLCanvasElement, chapter: number, scene?: HTMLImageElement) {
  const c = canvas.getContext('2d', { alpha: false });
  if (!c) return;
  drawTerrain(c, chapter);
  if (scene?.complete && scene.naturalWidth > 0) {
    const scale = Math.max(WIDTH / scene.naturalWidth, HEIGHT / scene.naturalHeight);
    const sw = WIDTH / scale;
    const sh = HEIGHT / scale;
    c.save();
    c.globalAlpha = 0.32;
    c.drawImage(
      scene,
      (scene.naturalWidth - sw) / 2,
      (scene.naturalHeight - sh) / 2,
      sw,
      sh,
      0,
      0,
      WIDTH,
      HEIGHT,
    );
    c.restore();
  }
  for (const block of CHAPTERS[chapter].blocks) {
    drawBulkhead(c, block, chapter);
  }
}

function paint(
  canvas: HTMLCanvasElement,
  run: Attempt,
  clock: number,
  reduced: boolean,
  pelican: HTMLImageElement | null,
  warthog: HTMLImageElement | null,
  warden: HTMLImageElement | null,
) {
  const c = canvas.getContext('2d');
  if (!c) return;
  c.clearRect(0, 0, WIDTH, HEIGHT);
  const sector = CHAPTERS[run.chapter];
  if (run.flash > 0 && !reduced) {
    const progress = 1 - run.flash / 0.6;
    c.save();
    c.strokeStyle = '#ffb480';
    c.globalAlpha = Math.max(0, 1 - progress);
    c.lineWidth = 2;
    for (let i = 0; i < 7; i++) {
      const angle = (i * Math.PI * 2) / 7;
      const x = Math.cos(angle);
      const y = Math.sin(angle);
      const reach = 23 + 27 * progress;
      c.beginPath();
      c.moveTo(run.ship.x + x * reach, run.ship.y + y * reach);
      c.lineTo(run.ship.x + x * (reach + 7), run.ship.y + y * (reach + 7));
      c.stroke();
    }
    c.restore();
  }
  if (run.chapter === 4) {
    const phase = run.boss.phase;
    const stance = reduced ? 0 : Math.sin(clock * (phase + 1));
    const color = [null, '#ffb3df', '#ff9f75', '#ffc76f'][phase] ?? '#ffb3df';
    c.save();
    c.translate(360, 170 + stance * 3);
    if (warden?.complete && warden.naturalWidth > 0) {
      const height = 88 + phase * 6 + stance * 2;
      const width = (height * warden.naturalWidth) / warden.naturalHeight;
      c.shadowColor = color;
      c.shadowBlur = 5 + phase * 3;
      c.drawImage(warden, -width / 2, -height * 0.58, width, height);
    } else {
      // Angular head, floating pauldrons and tapered plating while the raster decodes.
      c.fillStyle = '#29313d';
      c.strokeStyle = color;
      c.beginPath();
      c.moveTo(-7, -28);
      c.lineTo(0, -34);
      c.lineTo(7, -28);
      c.lineTo(5, -19);
      c.lineTo(0, -15);
      c.lineTo(-5, -19);
      c.closePath();
      c.moveTo(-26, -15);
      c.lineTo(-13, -20);
      c.lineTo(-8, -10);
      c.lineTo(0, -5);
      c.lineTo(8, -10);
      c.lineTo(13, -20);
      c.lineTo(26, -15);
      c.lineTo(21, 5);
      c.lineTo(11, 2);
      c.lineTo(9, 15);
      c.lineTo(15, 32);
      c.lineTo(5, 27);
      c.lineTo(0, 15);
      c.lineTo(-5, 27);
      c.lineTo(-15, 32);
      c.lineTo(-9, 15);
      c.lineTo(-11, 2);
      c.lineTo(-21, 5);
      c.closePath();
      c.fill();
      c.stroke();
    }
    c.restore();
    c.strokeStyle = color;
    c.lineWidth = 2.4;
    c.setLineDash(phase === 1 ? [6, 5] : phase === 2 ? [13, 4, 2, 4] : [17, 3]);
    c.beginPath();
    if (run.boss.radius > 0) {
      c.arc(360, 170, run.boss.radius, 0, Math.PI * 2);
      c.stroke();
      if (phase === 3 && run.boss.radius > 22) {
        c.beginPath();
        c.arc(360, 170, run.boss.radius - 11, 0, Math.PI * 2);
        c.stroke();
      }
    } else {
      c.ellipse(360, 202, 32, 9, 0, 0, Math.PI * 2);
      c.stroke();
    }
    c.setLineDash([]);
  }
  c.save();
  c.translate(run.relay.x, run.relay.y);
  if (run.escape) {
    c.fillStyle = '#ff906f';
    c.beginPath();
    c.moveTo(0, -34);
    c.lineTo(8, -46);
    c.lineTo(-8, -46);
    c.fill();
  }
  c.strokeStyle = sector.color;
  c.fillStyle = `${sector.color}28`;
  c.beginPath();
  c.arc(0, 0, 32, 0, Math.PI * 2);
  c.fill();
  c.stroke();
  c.lineWidth = 3;
  c.beginPath();
  c.arc(0, 0, 42, reduced ? 0 : clock, (reduced ? 0 : clock) + 4.9);
  c.stroke();
  c.beginPath();
  c.moveTo(0, -18);
  c.lineTo(12, -5);
  c.lineTo(9, 12);
  c.lineTo(0, 16);
  c.lineTo(-9, 12);
  c.lineTo(-12, -5);
  c.closePath();
  c.fillStyle = '#203646';
  c.fill();
  c.stroke();
  c.beginPath();
  c.moveTo(0, -12);
  c.lineTo(0, 10);
  c.moveTo(-5, 1);
  c.lineTo(5, 1);
  c.stroke();
  c.restore();
  for (const packet of run.packets) {
    c.save();
    c.translate(packet.x, packet.y);
    c.fillStyle =
      packet.kind === 'token' ? '#9ef6ff' : packet.kind === 'cache' ? '#c8adff' : '#b4ef86';
    c.strokeStyle = c.fillStyle;
    c.lineWidth = 1.4;
    c.beginPath();
    if (packet.kind === 'token') {
      c.moveTo(0, -7);
      c.lineTo(6, 0);
      c.lineTo(0, 7);
      c.lineTo(-6, 0);
      c.closePath();
      c.fill();
    } else if (packet.kind === 'cache') {
      c.rect(-5, -5, 10, 10);
      c.fill();
      c.strokeRect(-8, -8, 16, 16);
    } else {
      c.moveTo(-6, 0);
      c.lineTo(6, 0);
      c.moveTo(0, -6);
      c.lineTo(0, 6);
    }
    c.stroke();
    c.restore();
  }
  for (const [index, sentinel] of run.sentinels.entries()) {
    c.save();
    c.translate(sentinel.x, sentinel.y);
    drawSentinel(c, index % 3 === 2);
    c.restore();
  }
  c.save();
  c.translate(run.ship.x, run.ship.y);
  if (Math.hypot(run.velocity.x, run.velocity.y) > 1)
    c.rotate(Math.atan2(run.velocity.y, run.velocity.x));
  const thrust = Math.min(1, Math.hypot(run.velocity.x, run.velocity.y) / 120);
  if (thrust > 0.2 && !reduced && !run.escape) {
    c.fillStyle = sector.color;
    c.globalAlpha = 0.7;
    for (const y of [-7, 7]) {
      c.beginPath();
      c.moveTo(-17, y - 3);
      c.lineTo(-21 - thrust * (12 + 4 * Math.sin(clock * 25)), y);
      c.lineTo(-17, y + 3);
      c.closePath();
      c.fill();
    }
    c.globalAlpha = 1;
  }
  if (run.escape && warthog?.complete && warthog.naturalWidth > 0) {
    c.drawImage(warthog, -25, -18, 50, 36);
  } else if (pelican?.complete && pelican.naturalWidth > 0) {
    if (run.flash && !reduced) {
      c.fillStyle = '#ffb37640';
      c.beginPath();
      c.arc(0, 0, 24, 0, Math.PI * 2);
      c.fill();
    }
    c.drawImage(pelican, -23, -14, 46, 28);
  } else drawSkiff(c, sector.color, Boolean(run.flash) && !reduced);
  c.restore();
}

export default function HaloRelay({ zh }: { zh: boolean }) {
  const [mode, setMode] = useState<Mode>('campaign');
  const [chapter, setChapter] = useState(() =>
    Math.min(4, Math.max(0, Math.trunc(Number(haloRead('halo-relay-chapter', '0'))) || 0)),
  );
  const [state, setState] = useState<'brief' | 'play' | 'pause' | 'clear' | 'lost'>('brief');
  const [view, setView] = useState(() => createAttempt('campaign', chapter));
  const [guide, setGuide] = useState(true);
  const [calm, setCalm] = useState(() => matchMedia('(prefers-reduced-motion: reduce)').matches);
  const [frameKey, setFrameKey] = useState(0);
  const quiet = useHaloValue(HALO_MUSIC_KEY, 'true') === 'false';
  const [waypoint, setWaypoint] = useState('');
  const best = useHaloValue(scoreKey(mode), '0');
  const cleared = Number(useHaloValue('halo-relay-chapter', '0'));
  const data = useRef(view);
  const canvas = useRef<HTMLCanvasElement>(null);
  const terrain = useRef<HTMLCanvasElement>(null);
  const controls = useRef<Controls>({ x: 0, y: 0 });
  const held = useRef(new Set<string>());
  const sound = useRef<ReturnType<typeof haloSynth> | null>(null);
  const bed = useRef<ReturnType<typeof relayEngineAudio> | null>(null);
  const simClock = useRef(0);
  const precision = useRef(1);
  const channel = useRef<HTMLAudioElement>(null);
  const pelican = useRef<HTMLImageElement>(null);
  const warthog = useRef<HTMLImageElement | null>(null);
  const warden = useRef<HTMLImageElement | null>(null);
  const charged = useRef(false);
  const deposits = useRef(0);
  const [pair, setPair] = useState(false);
  const cue = (name: Parameters<ReturnType<typeof haloSynth>['play']>[0]) =>
    sound.current?.play(name);
  const setFrame = () => setView({ ...data.current, upgrades: [...data.current.upgrades] });
  const copy = (en: string, chinese: string) => (zh ? chinese : en);

  function start(stage = restartStage(mode, chapter), wave = 1, carry?: Attempt) {
    const previous = data.current;
    data.current = createAttempt(mode, stage, wave, carry);
    if (mode === 'sandbox' && previous.mode === 'sandbox')
      data.current.upgrades = previous.upgrades;
    data.current.precision = precision.current;
    if (mode === 'campaign' && !carry && stage > 0) {
      try {
        const save: unknown = JSON.parse(haloRead(`halo-relay-loadout-${stage}`, 'null'));
        if (
          Array.isArray(save) &&
          save.length === 3 &&
          save.every((n) => Number.isInteger(n) && n >= 0 && n <= 3)
        ) {
          data.current.upgrades = save as Attempt['upgrades'];
        }
      } catch {}
    }
    controls.current = { x: 0, y: 0 };
    setWaypoint('');
    held.current.clear();
    simClock.current = 0;
    charged.current = false;
    deposits.current = 0;
    setPair(false);
    setChapter(stage);
    setFrame();
    setState('play');
    setFrameKey((value) => value + 1);
    cue('relay');
    bed.current?.start();
    canvas.current?.focus({ preventScroll: true });
  }

  useEffect(() => {
    const synth = haloSynth(0.058);
    const engine = relayEngineAudio();
    const image = new Image();
    const onArtLoad = () => {
      if (canvas.current)
        paint(
          canvas.current,
          data.current,
          simClock.current,
          true,
          image,
          warthog.current,
          warden.current,
        );
    };
    image.addEventListener('load', onArtLoad, { once: true });
    image.src = `${HALO_ART}pelican-skiff.webp`;
    pelican.current = image;
    sound.current = synth;
    bed.current = engine;
    return () => {
      synth.close();
      engine.close();
      stopHaloClip(channel);
      image.removeEventListener('load', onArtLoad);
      pelican.current = null;
      sound.current = null;
      bed.current = null;
    };
  }, []);
  useEffect(() => {
    if (chapter !== 4) return;
    const image = new Image();
    const bossImage = new Image();
    const draw = () => {
      if (canvas.current)
        paint(
          canvas.current,
          data.current,
          simClock.current,
          true,
          pelican.current,
          image,
          bossImage,
        );
    };
    image.src = `${HALO_ART}m12-warthog.webp`;
    bossImage.addEventListener('load', draw, { once: true });
    bossImage.src = `${HALO_ART}warden-eternal.webp`;
    warthog.current = image;
    warden.current = bossImage;
    return () => {
      bossImage.removeEventListener('load', draw);
      warthog.current = null;
      warden.current = null;
    };
  }, [chapter]);
  useEffect(() => {
    if (quiet) {
      stopHaloClip(channel);
      bed.current?.stop();
    }
  }, [quiet]);

  useEffect(() => {
    if (terrain.current) paintBackdrop(terrain.current, chapter);
    const art = ['cartographer-beach', 'noble-six', 'map-room', 'flood-containment'][chapter];
    if (!art) return;
    const scene = new Image();
    const draw = () => {
      if (terrain.current) paintBackdrop(terrain.current, chapter, scene);
    };
    scene.addEventListener('load', draw, { once: true });
    scene.src = `${HALO_ART}${art}.webp`;
    return () => scene.removeEventListener('load', draw);
  }, [chapter]);

  useEffect(() => {
    let last = performance.now();
    let sync = 0;
    let lastDraw = last;
    const run = data.current;
    const draw = () => {
      if (canvas.current)
        paint(
          canvas.current,
          run,
          simClock.current,
          calm,
          pelican.current,
          warthog.current,
          warden.current,
        );
    };
    draw();
    if (state !== 'play') {
      bed.current?.stop();
      return;
    }
    const tick = (time: number) => {
      const wallTime = Math.min((time - last) / 1000, 1);
      let elapsed = Math.min(wallTime, 0.2);
      last = time;
      // Keep the countdown honest even when a late frame exceeds the catch-up budget.
      if (run.mode !== 'sandbox' && !run.ended) run.time -= wallTime - elapsed;
      const keys = held.current;
      const move = controls.current;
      const x =
        Number(keys.has('arrowright') || keys.has('d')) -
        Number(keys.has('arrowleft') || keys.has('a'));
      const y =
        Number(keys.has('arrowdown') || keys.has('s')) -
        Number(keys.has('arrowup') || keys.has('w'));
      const input = x || y ? { x, y } : move;
      const hadTarget = Boolean(input.target);
      // Bound collision steps without letting dropped render frames slow the flight clock.
      while (elapsed > 0 && !run.ended) {
        const dt = Math.min(elapsed, 1 / 60);
        simClock.current += dt;
        step(run, input, dt, simClock.current, (name) => sound.current?.play(name));
        elapsed -= dt;
      }
      if (hadTarget && !input.target) {
        setWaypoint('');
        setView({ ...run });
      }
      if (run.ended) {
        if (run.mode !== 'sandbox' && run.score > Number(haloRead(scoreKey(run.mode), '0'))) {
          haloWrite(scoreKey(run.mode), String(run.score));
        }
        if (
          run.mode === 'campaign' &&
          run.ended === 'clear' &&
          run.chapter + 1 > Number(haloRead('halo-relay-chapter', '0'))
        ) {
          haloWrite('halo-relay-chapter', String(run.chapter + 1));
        }
        if (run.mode === 'campaign' && run.ended === 'clear') {
          const medalKey = `halo-relay-medal-${run.chapter}`;
          if (run.score > Number(haloRead(medalKey, '0'))) {
            haloWrite(medalKey, String(run.score));
            haloWrite(`halo-relay-loadout-${run.chapter + 1}`, JSON.stringify(run.upgrades));
          }
        }
        if (run.mode !== 'sandbox' && run.delivered > 0) {
          haloWrite('halo-relay-last-bank', String(run.delivered));
        }
        setView({ ...run });
        setState(run.ended);
      } else if (time - sync > 180) {
        sync = time;
        if (run.rechargeDelay > 0) charged.current = false;
        else if (!charged.current && run.shield < 99) {
          charged.current = true;
          if (haloMusicEnabled()) {
            playHaloClip('shield-recharge', channel);
          }
        }
        bed.current?.update(run);
        setView({ ...run });
      }
      const drawInterval = 1000 / 40;
      if (run.ended || time - lastDraw >= drawInterval) {
        lastDraw = time - ((time - lastDraw) % drawInterval);
        draw();
      }
      if (!run.ended) drawFrame = requestAnimationFrame(tick);
    };
    let drawFrame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(drawFrame);
  }, [calm, frameKey, state]);

  useEffect(() => {
    const blur = () => {
      held.current.clear();
      controls.current = { x: 0, y: 0 };
    };
    const visibility = () => {
      if (!document.hidden) return;
      blur();
      setState((old) => (old === 'play' ? 'pause' : old));
    };
    window.addEventListener('blur', blur);
    document.addEventListener('visibilitychange', visibility);
    return () => {
      window.removeEventListener('blur', blur);
      document.removeEventListener('visibilitychange', visibility);
    };
  }, []);

  const sector = CHAPTERS[chapter];
  const campaignComplete = state === 'clear' && mode === 'campaign' && chapter === 4;
  const target = controls.current.target;
  const arrived =
    state === 'play' &&
    target &&
    Math.hypot(view.ship.x - target.x, view.ship.y - target.y) < 18 &&
    Math.hypot(view.velocity.x, view.velocity.y) < 24;
  const batch = () => {
    data.current.batch = (data.current.batch + 1) % BATCHES.length;
    setFrame();
    cue('collect');
  };
  const send = () => {
    if (state === 'play') {
      if (transmit(data.current, cue) && ++deposits.current === 2) {
        setPair(true);
        if (!quiet) playHaloClip('double-kill', channel);
      }
      setFrame();
    }
  };
  const selectStage = (index: number, selectedMode = mode) => {
    const previous = data.current;
    data.current = createAttempt(selectedMode, index);
    if (selectedMode === 'sandbox' && previous.mode === 'sandbox')
      data.current.upgrades = previous.upgrades;
    setWaypoint('');
    data.current.precision = precision.current;
    setChapter(index);
    setFrame();
    setFrameKey((value) => value + 1);
  };
  const togglePause = () => {
    if (state === 'play') {
      stopHaloClip(channel);
      held.current.clear();
      controls.current = { x: 0, y: 0 };
      setState('pause');
    } else if (state === 'pause') {
      bed.current?.start();
      setState('play');
      canvas.current?.focus({ preventScroll: true });
    }
  };
  const handleFlightKey = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
    if (state !== 'play' && state !== 'pause') return;
    const key = event.key.toLowerCase();
    if (key === ' ' && event.target !== canvas.current) return;
    if (
      ![
        'arrowleft',
        'arrowright',
        'arrowup',
        'arrowdown',
        'w',
        'a',
        's',
        'd',
        ' ',
        'b',
        'p',
      ].includes(key)
    )
      return;
    event.preventDefault();
    if (event.repeat) return;
    if (key === 'p') togglePause();
    else if (state === 'play') {
      if (key === ' ') send();
      else if (key === 'b') batch();
      else held.current.add(key);
    }
  };
  const notices = {
    cache: copy('Cache core required.', '需要缓存核心。'),
    empty: copy('No shards aboard.', '没有令牌碎片。'),
    heat: copy('Relay rejected the hot batch. Collect coolant.', '批次过热。请收集冷却剂。'),
    bank: copy('Batch accepted.', '批次已接收。'),
    blocked: copy(
      'Waypoint blocked by a bulkhead. Steer around it or choose another waypoint.',
      '航点被舱壁挡住。请绕行或另选航点。',
    ),
    escape: copy(
      'Drive to the navigation marker before the ring collapses.',
      '在环带崩解前驶向导航标记。',
    ),
  };
  let quote: readonly [string, string] | null = null;
  if (state === 'pause') quote = lines.sleep;
  else if (state === 'clear') quote = chapter === 4 ? lines.finish : lines.fight;
  else if (state === 'brief' && chapter === 3) quote = lines.flood;
  else if (state === 'brief' && chapter === 4) quote = lines.bomb;
  else if (state === 'play') {
    if (view.escape) quote = lines.drive;
    else if (chapter === 4 && view.boss.phase === 3) quote = lines.light;
    else if (view.shield < 55 || (chapter === 0 && view.cache > 0 && view.delivered === 0))
      quote = lines.together;
  }
  const waypoints: [string, string, number, number][] =
    chapter === 0
      ? [
          ['Beach approach', '滩头航点', 122, 173],
          ['Inland trail', '内陆小径', 142, 115],
          ['Squad rally', '小队集结点', 212, 84],
          ['Cliff pass', '峭壁通道', 424, 81],
        ]
      : chapter === 4
        ? [
            ['West supply', '西侧补给', 181, view.delivered === 0 ? 170 : 265],
            ['West gate', '西侧门', 320, 103],
            ['East gate', '东侧门', 437, 101],
          ]
        : [];
  const radar = (
    <svg className="halo-relay-radar" viewBox="0 0 64 64" aria-hidden="true">
      <circle cx="32" cy="32" r="30" />
      <circle cx="32" cy="32" r="15" />
      <path d="M32 2v60M2 32h60" />
      {view.sentinels.map(({ x, y }, index) => {
        const dx = (x - view.ship.x) / 6;
        const dy = (y - view.ship.y) / 6;
        return Math.hypot(dx, dy) < 28 ? (
          <circle key={index} className="halo-radar-contact" cx={32 + dx} cy={32 + dy} r="2" />
        ) : null;
      })}
      <circle className="halo-radar-self" cx="32" cy="32" r="2" />
    </svg>
  );
  return (
    <div
      className="halo-relay"
      data-halo-game
      onKeyDown={handleFlightKey}
      onKeyUp={(event) => held.current.delete(event.key.toLowerCase())}
      onClickCapture={(event) => {
        if (state !== 'play' || event.detail === 0 || !(event.target instanceof Element)) return;
        if (event.target.closest('button')) canvas.current?.focus({ preventScroll: true });
      }}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) held.current.clear();
      }}
    >
      <div className="halo-relay-toolbar">
        <div role="group" aria-label={copy('Game mode', '游戏模式')}>
          {modalModes.map(([id, en, cn]) => (
            <button
              key={id}
              type="button"
              aria-pressed={mode === id}
              onClick={() => {
                setMode(id);
                setState('brief');
                selectStage(0, id);
              }}
            >
              {copy(en, cn)}
            </button>
          ))}
        </div>
        <button type="button" aria-pressed={calm} onClick={() => setCalm(!calm)}>
          {copy('Reduced motion', '减少动画')}
        </button>
        <button
          type="button"
          aria-pressed={quiet}
          onClick={() => {
            haloWrite(HALO_MUSIC_KEY, String(quiet));
            if (quiet && state === 'play') bed.current?.start();
            else bed.current?.stop();
          }}
        >
          {copy('Mute Halo audio', '静音光环音频')}
        </button>
      </div>
      <div className="halo-relay-stage">
        <span>
          {copy('SECTOR', '扇区')} {String(chapter + 1).padStart(2, '0')} / 05
        </span>
        <strong>{zh ? sector.zh : sector.name}</strong>
        <span>
          {mode === 'endless' ? `${copy('Wave', '波次')} ${view.wave} · ` : ''}
          {copy('Best', '最佳')} {Number(best).toLocaleString()}
        </span>
      </div>
      <p className="halo-relay-rule">
        {view.escape && state === 'play'
          ? notices.escape
          : mode === 'endless'
            ? `${copy('Current Objective: Survive', '当前目标：生存')} · ${zh ? sector.zhRule : sector.rule}`
            : zh
              ? sector.zhRule
              : sector.rule}
      </p>
      {((state === 'brief' && (chapter === 0 || chapter === 3 || chapter === 4)) ||
        (chapter === 0 && state === 'play' && view.delivered === 0)) && (
        <div className="halo-relay-intel" data-sector={chapter}>
          <img
            src={`${HALO_ART}${chapter === 0 ? (view.cache > 0 ? 'map-room' : 'cartographer-beach') : chapter === 3 ? 'flood-containment' : 'm12-warthog'}.webp`}
            alt=""
            width={190}
            height={51}
          />
          <strong>
            {chapter === 0
              ? view.cache > 0
                ? copy('CORTANA · MAP ROOM ACQUIRED', '科塔娜 · 已找到地图室')
                : copy('ECHO 419 · BEACHHEAD · ADVANCE INLAND', '回声 419 · 滩头 · 向内陆推进')
              : chapter === 3
                ? copy('CONTAINMENT BREACH · FLOOD CONTACT', '隔离失效 · 已接触洪魔')
                : copy('CAIRO DIRECTIVE · M12 EXTRACTION', '开罗指令 · M12 撤离')}
          </strong>
        </div>
      )}
      {quote && (
        <p className="halo-quote" lang={zh ? 'zh' : 'en'}>
          <q>{copy(quote[0], quote[1])}</q>
          {zh && <small lang="en">{quote[0]}</small>}
        </p>
      )}
      {mode !== 'endless' && (
        <div className="halo-relay-route" role="group" aria-label={copy('Sector map', '扇区地图')}>
          {CHAPTERS.map((item, index) => (
            <button
              key={item.name}
              type="button"
              aria-pressed={chapter === index}
              disabled={mode !== 'sandbox' && (index > cleared || state !== 'brief')}
              onClick={() => {
                setState('brief');
                selectStage(index);
              }}
            >
              <span>
                {index < cleared ? '◆' : '◇'} {index + 1}
              </span>{' '}
              <span className="halo-relay-route-label">{zh ? item.zh : item.name}</span>
            </button>
          ))}
        </div>
      )}
      <div className="halo-relay-hud">
        {radar}
        <span>
          {copy('Shield', '护盾')} <b>{Math.max(0, Math.round(view.shield))}%</b>
          <meter
            aria-label={copy('Shield strength', '护盾强度')}
            min={0}
            max={100}
            value={Math.max(0, view.shield)}
          />
        </span>
        <span>
          {copy('Heat', '温度')} <b>{Math.round(view.heat)}%</b>
        </span>
        <span>
          {copy('Cargo', '货物')} <b>{view.cargo}</b> · KV <b>{view.cache}</b>
        </span>
        <span>
          {copy('Relay', '已提交')}{' '}
          <b>
            {view.delivered}
            {mode !== 'sandbox' && `/${view.quota}`}
          </b>
        </span>
        <span>
          {copy('Time', '时间')}{' '}
          <b>{mode === 'sandbox' ? '∞' : `${Math.max(0, Math.ceil(view.time))}s`}</b>
        </span>
        {chapter === 4 && (
          <span data-halo-warden-phase={view.boss.phase}>
            {copy('Warden phase', '守卫阶段')} <b>{view.boss.phase}/3</b>
          </span>
        )}
        {view.flash > 0 && (
          <span className="halo-relay-impact" role="status">
            {copy('Shield hit', '护盾受击')}
          </span>
        )}
      </div>
      <div
        className="halo-relay-board"
        data-impact={view.flash > 0 ? (calm ? 'steady' : 'pulse') : undefined}
        data-halo-waypoint-arrived={
          arrived
            ? `${Math.round(target.x / 10) * 10},${Math.round(target.y / 10) * 10}`
            : undefined
        }
      >
        <canvas
          ref={canvas}
          className="halo-relay-actors"
          width={WIDTH}
          height={HEIGHT}
          tabIndex={0}
          aria-label={copy(
            'Relay flight map. Arrow keys or WASD move, Space transmits, B changes batch size, P pauses.',
            '中继地图。方向键或 WASD 移动；空格提交；B 更改批次；P 暂停。',
          )}
          onPointerDown={(event) => {
            if (state !== 'play') return;
            const bounds = event.currentTarget.getBoundingClientRect();
            controls.current = {
              x: 0,
              y: 0,
              target: {
                x: ((event.clientX - bounds.left) / bounds.width) * WIDTH,
                y: ((event.clientY - bounds.top) / bounds.height) * HEIGHT,
              },
            };
            event.currentTarget.focus({ preventScroll: true });
          }}
        >
          {copy('Canvas flight map', '飞行地图')}
        </canvas>
        <canvas
          ref={terrain}
          className="halo-relay-terrain"
          width={WIDTH}
          height={HEIGHT}
          aria-hidden="true"
        />
        {state !== 'play' && (
          <div className="halo-relay-status" role="status">
            <strong>
              {state === 'brief'
                ? copy('Relay online', '中继在线')
                : state === 'pause'
                  ? copy('Flight paused', '飞行暂停')
                  : campaignComplete
                    ? copy('Campaign complete · Ring reclaimed', '战役完成 · 已收复环带')
                    : state === 'clear'
                      ? copy('Relay secured', '中继已稳定')
                      : copy('Signal lost', '信号中断')}
            </strong>
            {campaignComplete && (
              <span>
                {copy('Final score', '最终得分')}: {view.score.toLocaleString()}
              </span>
            )}
            {state === 'pause' ? (
              <button type="button" onClick={togglePause}>
                {copy('Resume', '继续')}
              </button>
            ) : state === 'clear' && (mode === 'endless' || chapter < 4) ? (
              <button
                type="button"
                onClick={() =>
                  start((chapter + 1) % 5, mode === 'endless' ? view.wave + 1 : 1, data.current)
                }
              >
                {copy('Next sector', '下一扇区')}
              </button>
            ) : (
              <button type="button" onClick={() => start(campaignComplete ? 0 : undefined)}>
                {state === 'brief'
                  ? copy('Launch skiff', '启动飞船')
                  : campaignComplete
                    ? copy('Replay campaign', '重玩战役')
                    : copy('Fly again', '再次飞行')}
              </button>
            )}
          </div>
        )}
      </div>
      {pair && (
        <p className="halo-relay-medal" role="status">
          <img src={`${HALO_ART}double-kill-medal.webp`} alt="" width={28} height={28} />
          {copy('DOUBLE RELAY · Two successful batch deliveries', '双重中继 · 两次批次提交成功')}
        </p>
      )}
      <div className="halo-relay-tools">
        <div className="halo-relay-buttons" role="group" aria-label={copy('Steering', '方向控制')}>
          {direction.map(([label, x, y], index) => (
            <button
              key={label}
              type="button"
              aria-label={
                zh ? ['上', '左', '下', '右'][index] : ['Up', 'Left', 'Down', 'Right'][index]
              }
              onPointerDown={(event) => {
                event.currentTarget.setPointerCapture(event.pointerId);
                controls.current = { x, y };
              }}
              onLostPointerCapture={() => {
                controls.current = { x: 0, y: 0 };
              }}
              onKeyDown={(event) => {
                if (event.key === ' ' || event.key === 'Enter') controls.current = { x, y };
              }}
              onKeyUp={() => {
                controls.current = { x: 0, y: 0 };
              }}
              onBlur={() => {
                controls.current = { x: 0, y: 0 };
              }}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="halo-relay-buttons">
          <button type="button" onClick={batch}>
            {copy('Batch', '批次')} {BATCHES[view.batch]}×
          </button>
          <button
            type="button"
            onClick={send}
            data-halo-relay-ready={
              state === 'play' &&
              !view.ended &&
              !view.escape &&
              inTransmitRange(view) &&
              view.cargo > 0 &&
              (chapter !== 2 || view.cache > 0) &&
              view.heat < 89
            }
          >
            {copy('Transmit', '提交')}
          </button>
          <button type="button" onClick={togglePause}>
            {state === 'pause' ? copy('Resume', '继续') : copy('Pause', '暂停')}
          </button>
          <button type="button" onClick={() => start()}>
            {copy('Restart', '重启')}
          </button>
        </div>
      </div>
      {state === 'play' && waypoints.length > 0 && (
        <div
          className="halo-relay-buttons halo-relay-waypoints"
          role="group"
          aria-label={copy('Chart a flight waypoint', '设置飞行航点')}
        >
          {[
            ...waypoints,
            ['Relay beacon', '中继信标', view.relay.x, view.relay.y] as [
              string,
              string,
              number,
              number,
            ],
          ].map(([en, cn, x, y]) => (
            <button
              key={en}
              type="button"
              aria-pressed={waypoint === en}
              onClick={() => {
                controls.current = { x: 0, y: 0, target: { x, y } };
                setWaypoint(en);
              }}
            >
              {copy(en, cn)}
            </button>
          ))}
        </div>
      )}
      <div className="halo-relay-hud">
        <span>
          TTFT <b>{view.firstToken} ms</b>
          {view.kvCost > 0 && (
            <span
              title={copy('Last batch KV footprint, relative units', '上一批 KV 占用，相对单位')}
            >
              {' · KV '}
              {view.kvCost}u
            </span>
          )}
        </span>
        <span>
          {copy('Throughput', '吞吐量')} <b>{view.efficiency} tok/s</b>
        </span>
        <span>
          {copy('Interactivity', '交互性')} <b>{view.interactivity} tok/s/user</b>
        </span>
        <span>
          {copy('Score', '积分')} <b>{view.score}</b>
        </span>
        <span>
          {copy('Energy', '能量')} <b>{view.energy}</b>
        </span>
      </div>
      <div className="halo-relay-buttons">
        <button
          type="button"
          onClick={() => {
            precision.current = (precision.current + 1) % PRECISIONS.length;
            data.current.precision = precision.current;
            setFrame();
          }}
        >
          {copy('Precision', '精度')} {PRECISIONS[view.precision]}
        </button>
        {(['Thrusters', 'Cooling', 'Shields'] as const).map((label, index) => {
          const kind = index as 0 | 1 | 2;
          const cost = upgradeCost(view, kind);
          return (
            <button
              key={label}
              type="button"
              disabled={state === 'lost' || view.energy < cost || view.upgrades[kind] >= 3}
              data-halo-upgrade={`${label.toLowerCase()}-${view.upgrades[kind]}`}
              onClick={() => {
                if (upgrade(data.current, kind)) {
                  if (state === 'play') canvas.current?.focus({ preventScroll: true });
                  if (mode === 'campaign' && state === 'clear')
                    haloWrite(
                      `halo-relay-loadout-${chapter + 1}`,
                      JSON.stringify(data.current.upgrades),
                    );
                  cue('relay');
                  setFrame();
                }
              }}
            >
              {copy(label, ['推进器', '冷却', '护盾'][kind])} {view.upgrades[kind]}/3 · {cost} E
            </button>
          );
        })}
        <button type="button" aria-expanded={guide} onClick={() => setGuide(!guide)}>
          {copy('How to play', '操作说明')}
        </button>
      </div>
      <div className="halo-relay-rule" role="status">
        {view.notice ? notices[view.notice] : '\u00A0'}
      </div>
      {guide && (
        <p className="halo-relay-guide">
          {copy(
            'WASD / arrows to steer, or tap the map to set a waypoint. ◆ Token shards, ■ KV cache, + coolant. Avoid orange sentinels. Fly into the relay circle and hit Space / Transmit. B changes the batch: larger batches boost throughput but cost heat and first-token time. P pauses. Earn energy and upgrade between deliveries.',
            'WASD / 方向键移动，或点击地图设定航点。◆ 令牌碎片、■ KV 缓存、+ 冷却剂。避开橙色哨兵。飞入中继圈并按空格或“提交”。B 更改批次：批次越大，吞吐量越高，但温度和首词元时延也会增加。P 暂停。收集能量可升级。',
          )}
        </p>
      )}
    </div>
  );
}
