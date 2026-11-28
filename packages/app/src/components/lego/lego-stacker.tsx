'use client';

import { useEffect, useRef, useState } from 'react';

import { track } from '@/lib/analytics/analytics';
import { useLocale } from '@/lib/i18n/use-locale';
import { playSfx, playSnap, playVoice } from './lego-audio';
import { addStuds, discover, noteLine, prefersReducedMotion } from './lego-store';
import { STRINGS, fill } from './lego-strings';

/** Logical playing field; the canvas is scaled to fit its container. */
const FIELD_W = 360;
const FIELD_H = 460;
const STUD = 20;
const BRICK_H = 26;
const STUD_H = 5;
const BASE_STUDS = 10;
const FLOOR = FIELD_H - 34;
const PERFECT_PX = 6;
/** How far ahead of a perfect line-up the timing cue lights, in seconds. */
const CUE_LEAD_S = 0.05;
const BEST_KEY = 'lego-stacker-best';
const LEVEL_KEY = 'lego-stacker-level';

export type StackerMode = 'endless' | 'rack';

/** Rack build: bricks to stack for each rack, and how wide its base is, in studs. */
export const RACKS = [
  { target: 8, base: 10 },
  { target: 12, base: 9 },
  { target: 16, base: 8 },
  { target: 20, base: 8 },
  { target: 24, base: 7 },
] as const;

/** Real accelerator names from the dashboard, printed on the bricks. */
const PARTS = [
  'H100',
  'H200',
  'B200',
  'GB200',
  'MI300X',
  'MI325X',
  'MI355X',
  'B300',
  'GB300',
  'L40S',
  'A100',
  'TPU',
] as const;

const COLOURS = [
  { fill: '#e3000b', dark: '#9b0008', light: '#ff5a61', ink: '#ffffff' },
  { fill: '#ffed00', dark: '#c9a800', light: '#fff78a', ink: '#181716' },
  { fill: '#006db7', dark: '#004a7d', light: '#4da3de', ink: '#ffffff' },
  { fill: '#00852b', dark: '#005a1d', light: '#49b96b', ink: '#ffffff' },
  { fill: '#f47b20', dark: '#b3540d', light: '#ffab6b', ink: '#181716' },
  { fill: '#f4f4f4', dark: '#a9adb3', light: '#ffffff', ink: '#181716' },
] as const;

interface Brick {
  x: number;
  width: number;
  level: number;
  colour: number;
  label: string;
}

interface Scrap {
  x: number;
  y: number;
  width: number;
  colour: number;
  vx: number;
  vy: number;
  spin: number;
  angle: number;
}

type Status = 'ready' | 'playing' | 'over' | 'won';

interface Game {
  status: Status;
  tower: Brick[];
  slider: { x: number; width: number; dir: number; speed: number } | null;
  scraps: Scrap[];
  camera: number;
  perfectUntil: number;
  /** Perfect snaps in this run. */
  perfects: number;
  streak: number;
  earned: number;
  /** Rack being built, counted from 0. Stays 0 in the endless tower. */
  level: number;
}

function readCount(key: string): number {
  try {
    const value = Number(localStorage.getItem(key));
    return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
  } catch {
    return 0;
  }
}

function writeCount(key: string, value: number): void {
  try {
    localStorage.setItem(key, String(value));
  } catch {
    // Blocked storage: the record just lasts for this page view.
  }
}

/** Tallest endless tower so far. */
export function readStackerBest(): number {
  return readCount(BEST_KEY);
}

/** Racks finished so far in Rack build. */
export function readStackerRacks(): number {
  return Math.min(RACKS.length, readCount(LEVEL_KEY));
}

function levelY(level: number): number {
  return FLOOR - (level + 1) * BRICK_H;
}

function drawBrick(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  colourIndex: number,
  label?: string,
) {
  const colour = COLOURS[colourIndex % COLOURS.length];
  // Studs along the top edge.
  const studs = Math.max(1, Math.round(width / STUD));
  const pitch = width / studs;
  for (let index = 0; index < studs; index++) {
    const sx = x + index * pitch + pitch / 2 - 6;
    ctx.fillStyle = colour.fill;
    ctx.fillRect(sx, y - STUD_H, 12, STUD_H + 1);
    ctx.fillStyle = colour.light;
    ctx.fillRect(sx + 1, y - STUD_H + 1, 10, 1.5);
    ctx.strokeStyle = '#181716';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(sx, y - STUD_H, 12, STUD_H + 1);
  }
  ctx.fillStyle = colour.fill;
  ctx.fillRect(x, y, width, BRICK_H);
  ctx.fillStyle = colour.light;
  ctx.fillRect(x + 2, y + 2, Math.max(0, width - 4), 3);
  ctx.fillStyle = colour.dark;
  ctx.fillRect(x + 2, y + BRICK_H - 5, Math.max(0, width - 4), 3);
  ctx.strokeStyle = '#181716';
  ctx.lineWidth = 2;
  ctx.strokeRect(x, y, width, BRICK_H);
  if (label && width > 46) {
    ctx.fillStyle = colour.ink;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, x + width / 2, y + BRICK_H / 2 + 1);
  }
}

/**
 * Provisioning for the next rack. Each choice helps one system and costs another, and the
 * choices multiply across a session; nothing is saved, so a new session starts stock.
 */
const UPGRADES = {
  // More throughput, less interactivity, and a heavier tray on a narrower footing.
  batch: { batch: 1.5, speed: 1.2, base: -1, snap: 0 },
  // Headroom: a steadier slide and a wider snap, for a little of the yield.
  cool: { batch: 0.9, speed: 0.8, base: 0, snap: 2 },
  // Capacity: a wider base that can win width back, for a little of the yield.
  power: { batch: 0.9, speed: 1, base: 2, snap: 0 },
} as const;
type UpgradeId = keyof typeof UPGRADES;
const UPGRADE_IDS = Object.keys(UPGRADES) as UpgradeId[];
const STOCK = { batch: 1, speed: 1, base: 0, snap: 0 };
interface RackRun {
  level: number;
  studs: number;
  speed: number;
  batch: number;
}

export default function LegoStacker({ mode, onExit }: { mode: StackerMode; onExit: () => void }) {
  const locale = useLocale();
  const t = STRINGS[locale].game;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dropRef = useRef<() => void>(() => {});
  const levelRef = useRef<(level: number, pick?: UpgradeId) => void>(() => {});
  const [config, setConfig] = useState(STOCK);
  const [runs, setRuns] = useState<RackRun[]>([]);
  const [level, setLevel] = useState(0);
  const [status, setStatus] = useState<Status>('ready');
  const [height, setHeight] = useState(0);
  const [best, setBest] = useState(0);
  const [earned, setEarned] = useState(0);
  const [perfect, setPerfect] = useState<'first' | 'again' | null>(null);

  useEffect(() => {
    const rack = mode === 'rack';
    // A visitor who has built every rack comes back to rack 1, not to the tallest one on
    // stock parts.
    const built = rack ? readStackerRacks() : 0;
    const firstLevel = built < RACKS.length ? built : 0;
    setBest(readStackerBest());
    setLevel(firstLevel);
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const still = prefersReducedMotion();
    const ratio = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = FIELD_W * ratio;
    canvas.height = FIELD_H * ratio;

    const game: Game = {
      status: 'ready',
      tower: [],
      slider: null,
      scraps: [],
      camera: 0,
      perfectUntil: 0,
      streak: 0,
      perfects: 0,
      earned: 0,
      level: firstLevel,
    };
    const mods = { ...STOCK };
    const baseStuds = () =>
      Math.min(FIELD_W / STUD - 2, Math.max(4, RACKS[game.level].base + mods.base));
    let bestSoFar = readStackerBest();
    let frame = 0;
    let last = performance.now();
    let perfectTimer: number | undefined;

    const spawn = () => {
      const top = game.tower.at(-1);
      if (!top) return;
      const row = game.tower.length;
      const fromLeft = row % 2 === 0;
      game.slider = {
        x: fromLeft ? -top.width : FIELD_W,
        width: top.width,
        dir: fromLeft ? 1 : -1,
        // Each rack starts a little faster than the last.
        speed: Math.min(360, 120 + game.level * 22 + row * (rack ? 7 : 9)) * mods.speed,
      };
    };

    const start = () => {
      const width = (rack ? baseStuds() : BASE_STUDS) * STUD;
      game.tower = [{ x: (FIELD_W - width) / 2, width, level: 0, colour: 5, label: 'RACK' }];
      game.scraps = [];
      game.camera = 0;
      game.streak = 0;
      game.perfects = 0;
      game.earned = 0;
      game.status = 'playing';
      setStatus('playing');
      setHeight(0);
      setEarned(0);
      spawn();
      playSfx('build', { volume: 0.5 });
    };

    const award = (stock: number, x: number, y: number) => {
      const amount = Math.round(stock * mods.batch);
      game.earned += amount;
      setEarned(game.earned);
      const box = canvas.getBoundingClientRect();
      addStuds(amount, {
        x: box.left + (x / FIELD_W) * box.width,
        y: box.top + (y / FIELD_H) * box.height,
      });
    };

    const finish = () => {
      const score = game.tower.length - 1;
      game.status = 'over';
      game.slider = null;
      setStatus('over');
      if (!rack && score > bestSoFar) {
        bestSoFar = score;
        setBest(score);
        writeCount(BEST_KEY, score);
      }
      // The tower comes apart.
      if (!still) {
        for (const brick of game.tower.slice(1)) {
          game.scraps.push({
            x: brick.x,
            y: levelY(brick.level) + game.camera,
            width: brick.width,
            colour: brick.colour,
            vx: (Math.random() - 0.5) * 320,
            vy: -120 - Math.random() * 220,
            spin: (Math.random() - 0.5) * 7,
            angle: 0,
          });
        }
        game.tower = game.tower.slice(0, 1);
        game.camera = 0;
      }
      playSfx('fall-apart', { volume: 0.7 });
      // The sound every LEGO Star Wars player knows, in place of a taunt.
      playVoice('yoda-death');
      discover('yoda');
      track('lego_game_over', { score, mode });
    };

    /** The rack reached its target height: it stays standing, and the next one unlocks. */
    const win = () => {
      game.status = 'won';
      game.slider = null;
      setStatus('won');
      writeCount(LEVEL_KEY, Math.max(readStackerRacks(), game.level + 1));
      const top = game.tower.at(-1);
      if (top) {
        award(1000 * (game.level + 1), top.x + top.width / 2, levelY(top.level) + game.camera);
      }
      const run = {
        level: game.level,
        studs: game.earned,
        speed: Math.round(mods.speed * 100),
        batch: mods.batch,
      };
      setRuns((list) => [...list, run].slice(-RACKS.length));
      playSfx('build', { volume: 0.6 });
      playVoice('awesome');
      noteLine('awesome');
      track('lego_stacker_rack_completed', { level: game.level + 1 });
    };

    levelRef.current = (next: number, pick?: UpgradeId) => {
      if (pick) {
        const up = UPGRADES[pick];
        mods.batch *= up.batch;
        mods.speed *= up.speed;
        mods.base += up.base;
        mods.snap += up.snap;
        setConfig({ ...mods });
        track('lego_stacker_upgrade_picked', { upgrade: pick, level: next + 1 });
      }
      game.level = Math.min(RACKS.length - 1, Math.max(0, next));
      if (game.level === 0 && !pick) {
        // Starting over means stock parts and a clean sheet.
        Object.assign(mods, STOCK);
        setConfig({ ...mods });
        setRuns([]);
      }
      setLevel(game.level);
      start();
    };

    const drop = () => {
      if (game.status === 'won') return;
      if (game.status !== 'playing') {
        start();
        return;
      }
      const slider = game.slider;
      const top = game.tower.at(-1);
      if (!slider || !top) return;
      const row = game.tower.length;
      const y = levelY(row) + game.camera;
      let left = Math.max(slider.x, top.x);
      let right = Math.min(slider.x + slider.width, top.x + top.width);
      const offset = slider.x - top.x;
      if (right - left < 6) {
        game.scraps.push({
          x: slider.x,
          y,
          width: slider.width,
          colour: row % COLOURS.length,
          vx: slider.dir * 60,
          vy: 0,
          spin: slider.dir * 2,
          angle: 0,
        });
        finish();
        return;
      }
      const isPerfect = Math.abs(offset) <= PERFECT_PX + mods.snap;
      if (isPerfect) {
        left = top.x;
        right = top.x + top.width;
        game.streak += 1;
        // Three perfect snaps in a row win a stud of width back.
        // A rack can win back up to its own base, however wide the power shelves made it.
        if (game.streak % 3 === 0 && right - left < (rack ? baseStuds() : BASE_STUDS) * STUD) {
          left = Math.max(0, left - STUD / 2);
          right = Math.min(FIELD_W, right + STUD / 2);
        }
      } else {
        game.streak = 0;
        const cutLeft = slider.x < top.x;
        const cutWidth = slider.width - (right - left);
        game.scraps.push({
          x: cutLeft ? slider.x : right,
          y,
          width: cutWidth,
          colour: row % COLOURS.length,
          vx: cutLeft ? -70 : 70,
          vy: -40,
          spin: cutLeft ? -3 : 3,
          angle: 0,
        });
      }
      game.tower.push({
        x: left,
        width: right - left,
        level: row,
        colour: row % COLOURS.length,
        label: PARTS[(row - 1) % PARTS.length],
      });
      setHeight(row);
      if (isPerfect) {
        playSnap(1, 1 + Math.min(0.5, game.streak * 0.08));
        award(game.streak >= 3 ? 1000 : 500, left + (right - left) / 2, y);
        game.perfects += 1;
        // Batman's line for the first perfect snap of a run, however many tries it took.
        const first = game.perfects === 1;
        if (first) playVoice('first-try');
        setPerfect(first ? 'first' : 'again');
        window.clearTimeout(perfectTimer);
        perfectTimer = window.setTimeout(() => setPerfect(null), first ? 1300 : 900);
      } else {
        playSnap(0.8, 0.9);
        playSfx('tick', { volume: 0.5, delay: 0.05 });
        award(100, left + (right - left) / 2, y);
      }
      if (rack && row >= RACKS[game.level].target) {
        win();
        return;
      }
      spawn();
    };
    dropRef.current = drop;

    const draw = (now: number) => {
      frame = requestAnimationFrame(draw);
      const elapsed = (now - last) / 1000;
      const dt = Math.min(0.05, elapsed);
      last = now;
      if (document.hidden) return;

      if (game.status === 'playing' && game.slider) {
        const slider = game.slider;
        // The sliding brick keeps wall-clock time, so a slow frame does not slow the slide and
        // a press lands where the timing says it will. Everything else uses the capped step.
        slider.x += slider.dir * slider.speed * Math.min(0.25, elapsed);
        if (slider.x + slider.width > FIELD_W + slider.width * 0.6) slider.dir = -1;
        else if (slider.x < -slider.width * 0.6) slider.dir = 1;
        const wanted = Math.max(0, (game.tower.length + 1) * BRICK_H - FIELD_H * 0.52);
        game.camera += (wanted - game.camera) * Math.min(1, dt * 6);
      }
      for (const scrap of game.scraps) {
        scrap.vy += 900 * dt;
        scrap.x += scrap.vx * dt;
        scrap.y += scrap.vy * dt;
        scrap.angle += scrap.spin * dt;
      }
      game.scraps = game.scraps.filter((scrap) => scrap.y < FIELD_H + 80);

      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      // Sky-blue backdrop with a faint stud grid, then a green baseplate.
      ctx.fillStyle = '#bfe3f7';
      ctx.fillRect(0, 0, FIELD_W, FIELD_H);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
      const shift = game.camera % STUD;
      for (let gy = -STUD; gy < FIELD_H; gy += STUD) {
        for (let gx = STUD / 2; gx < FIELD_W; gx += STUD) {
          ctx.beginPath();
          ctx.arc(gx, gy + shift + STUD / 2, 2, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      const floorY = FLOOR + game.camera;
      if (floorY < FIELD_H + STUD_H) {
        drawBrick(ctx, -4, floorY, FIELD_W + 8, 3);
        ctx.fillStyle = '#00852b';
        ctx.fillRect(-4, floorY + BRICK_H - 2, FIELD_W + 8, FIELD_H);
      }
      ctx.font = "700 12px 'LegoBody', system-ui, sans-serif";
      for (const brick of game.tower) {
        const y = levelY(brick.level) + game.camera;
        if (y > FIELD_H + STUD_H || y < -BRICK_H) continue;
        drawBrick(ctx, brick.x, y, brick.width, brick.colour, brick.label);
      }
      if (rack) {
        // The height this rack has to reach.
        const lineY = levelY(RACKS[game.level].target) + game.camera - STUD_H - 3;
        if (lineY > 8 && lineY < FIELD_H) {
          ctx.save();
          ctx.setLineDash([8, 6]);
          ctx.strokeStyle = '#e3000b';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(0, lineY);
          ctx.lineTo(FIELD_W, lineY);
          ctx.stroke();
          ctx.restore();
          ctx.fillStyle = '#e3000b';
          ctx.fillRect(FIELD_W - 34, lineY - 16, 34, 16);
          ctx.fillStyle = '#ffffff';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(String(RACKS[game.level].target), FIELD_W - 17, lineY - 7.5);
        }
      }
      const top = game.tower.at(-1);
      if (game.slider && top) {
        const slider = game.slider;
        const y = levelY(game.tower.length) + game.camera;
        drawBrick(
          ctx,
          slider.x,
          y,
          slider.width,
          game.tower.length % COLOURS.length,
          PARTS[(game.tower.length - 1) % PARTS.length],
        );
        // Landing guide: whatever hangs past the tower is washed out, because it will break
        // off, and dashed lines carry the tower's edges up through the sliding brick.
        const left = Math.max(slider.x, top.x);
        const right = Math.min(slider.x + slider.width, top.x + top.width);
        ctx.fillStyle = 'rgb(255 255 255 / 0.62)';
        const from = y - STUD_H - 1;
        const tall = BRICK_H + STUD_H + 2;
        if (right <= left) {
          ctx.fillRect(slider.x - 1, from, slider.width + 2, tall);
        } else {
          if (left > slider.x) ctx.fillRect(slider.x - 1, from, left - slider.x + 1, tall);
          if (right < slider.x + slider.width)
            ctx.fillRect(right, from, slider.x + slider.width - right + 1, tall);
        }
        // Timing cue: the guide lines go solid and bright just before the brick lines up, about
        // a reaction time ahead, and the canvas says so for anything that cannot see them.
        const offset = slider.x - top.x;
        const lined =
          Math.abs(offset) <= PERFECT_PX + mods.snap ||
          (offset * slider.dir < 0 && Math.abs(offset) <= slider.speed * CUE_LEAD_S);
        if (canvas.dataset.lined !== String(lined)) canvas.dataset.lined = String(lined);
        ctx.save();
        ctx.setLineDash(lined ? [] : [5, 4]);
        ctx.strokeStyle = lined ? '#FFD21F' : '#181716';
        ctx.lineWidth = lined ? 3 : 1.5;
        ctx.beginPath();
        ctx.moveTo(top.x, from - 12);
        ctx.lineTo(top.x, y + BRICK_H);
        ctx.moveTo(top.x + top.width, from - 12);
        ctx.lineTo(top.x + top.width, y + BRICK_H);
        ctx.stroke();
        ctx.restore();
      }
      for (const scrap of game.scraps) {
        ctx.save();
        ctx.translate(scrap.x + scrap.width / 2, scrap.y + BRICK_H / 2);
        ctx.rotate(scrap.angle);
        drawBrick(ctx, -scrap.width / 2, -BRICK_H / 2, scrap.width, scrap.colour);
        ctx.restore();
      }
    };
    frame = requestAnimationFrame(draw);

    const onKey = (event: KeyboardEvent) => {
      if (event.key !== ' ' && event.key !== 'Enter') return;
      // A finished rack waits for its own button.
      if (game.status === 'won') return;
      const target = event.target instanceof Element ? event.target : null;
      // Leave Enter and Space alone on the dialog's own buttons.
      if (target?.closest('button') && !target.closest('[data-lego-game-drop]')) return;
      event.preventDefault();
      if (!event.repeat) drop();
    };
    window.addEventListener('keydown', onKey);
    // A mouse click on the dialog's sound button must not keep the keys: the next Space
    // belongs to the brick. Keyboard focus on that button is left alone. Heard on the way
    // down, because the button swaps its icon, and the clicked one is gone on the way up.
    const onClick = (event: MouseEvent) => {
      if (event.detail === 0 || game.status !== 'playing') return;
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest('[data-testid="lego-game-mute"]')) canvas.focus({ preventScroll: true });
    };
    window.addEventListener('click', onClick, true);

    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(perfectTimer);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('click', onClick, true);
      dropRef.current = () => {};
      levelRef.current = () => {};
    };
  }, [mode]);

  const number = new Intl.NumberFormat(locale === 'zh' ? 'zh-CN' : 'en-US');
  const rack = mode === 'rack';
  const target = RACKS[level].target;
  const lastRack = level === RACKS.length - 1;
  const topStuds = Math.max(1, ...runs.map((run) => run.studs));
  const shownBase = Math.min(FIELD_W / STUD - 2, Math.max(4, RACKS[level].base + config.base));
  return (
    <div
      className="lego-game"
      data-testid="lego-game"
      data-status={status}
      data-mode={mode}
      data-level={level + 1}
    >
      <div className="lego-game-head">
        <h2 className="lego-game-title">{rack ? t.rackTitle : t.title}</h2>
        <dl className="lego-game-stats">
          <div>
            <dt>{t.height}</dt>
            <dd data-testid="lego-game-height">{rack ? `${height}/${target}` : height}</dd>
          </div>
          {rack ? (
            <div>
              <dt>{t.level}</dt>
              <dd data-testid="lego-game-level">{`${level + 1}/${RACKS.length}`}</dd>
            </div>
          ) : (
            <div>
              <dt>{t.best}</dt>
              <dd data-testid="lego-game-best">{best}</dd>
            </div>
          )}
          <div>
            <dt>{t.studs}</dt>
            <dd>{number.format(earned)}</dd>
          </div>
        </dl>
      </div>
      <p className="lego-game-description">{rack ? t.rackDescription : t.description}</p>
      {rack && (
        <p className="lego-game-config" data-testid="lego-game-config">
          {fill(t.config, {
            batch: number.format(config.batch),
            speed: Math.round(config.speed * 100),
            base: shownBase,
            snap: PERFECT_PX + config.snap,
          })}
        </p>
      )}
      <div className="lego-game-field">
        <canvas
          ref={canvasRef}
          className="lego-game-canvas"
          role="img"
          tabIndex={-1}
          aria-label={t.canvasLabel}
          data-lego-silent=""
          onPointerDown={(event) => {
            event.preventDefault();
            dropRef.current();
          }}
        />
        {perfect && (
          <p className="lego-game-perfect" role="status">
            {perfect === 'first' ? t.firstTry : t.perfect}
          </p>
        )}
        {status !== 'playing' && (
          <div className="lego-game-overlay">
            <div className="lego-game-plate">
              {status === 'over' && (
                <>
                  <p className="lego-game-over">{t.over}</p>
                  <p className="lego-game-over-hint">
                    {rack
                      ? fill(t.rackOverHint, { n: height, target, studs: number.format(earned) })
                      : fill(t.overHint, { n: height, studs: number.format(earned) })}
                  </p>
                </>
              )}
              {status === 'won' && (
                <>
                  <p className="lego-game-over-hint lego-game-line">
                    {STRINGS[locale].lines.awesome}
                  </p>
                  <p className="lego-game-over lego-game-won">
                    {lastRack ? t.rackAll : fill(t.rackDone, { level: level + 1 })}
                  </p>
                  <p className="lego-game-over-hint">
                    {fill(t.rackDoneHint, { target, studs: number.format(earned) })}
                  </p>
                  {lastRack && <p className="lego-game-over-hint">{t.rackAllHint}</p>}
                  {runs.length > 0 && (
                    <div className="lego-game-runs" data-testid="lego-game-runs">
                      <p>{t.runsTitle}</p>
                      <ol>
                        {runs.map((run, index) => (
                          <li key={`${run.level}-${index}`}>
                            <span>{fill(t.runsRack, { level: run.level + 1 })}</span>
                            <span className="lego-game-run-bar" aria-hidden="true">
                              <i
                                style={{ width: `${Math.round((run.studs / topStuds) * 100)}%` }}
                              />
                            </span>
                            <span>
                              {fill(t.runsValue, {
                                studs: number.format(run.studs),
                                speed: run.speed,
                              })}
                            </span>
                          </li>
                        ))}
                      </ol>
                    </div>
                  )}
                  {!lastRack && (
                    <div className="lego-game-upgrades" role="group" aria-label={t.upgradeTitle}>
                      <p>{t.upgradeTitle}</p>
                      {UPGRADE_IDS.map((id) => (
                        <button
                          key={id}
                          type="button"
                          className="lego-game-upgrade"
                          data-lego-silent=""
                          data-testid={`lego-upgrade-${id}`}
                          onClick={() => levelRef.current(level + 1, id)}
                        >
                          <b>{t.upgrades[id].name}</b>
                          <span>{t.upgrades[id].trade}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </>
              )}
              <button
                type="button"
                className="lego-game-button"
                data-lego-game-drop=""
                data-lego-silent=""
                data-testid="lego-game-start"
                autoFocus
                onClick={() => {
                  if (status === 'won') levelRef.current(lastRack ? 0 : level + 1);
                  else dropRef.current();
                }}
              >
                {status === 'won'
                  ? lastRack
                    ? t.rackReplay
                    : t.rackKeep
                  : status === 'over'
                    ? t.again
                    : t.start}
              </button>
            </div>
          </div>
        )}
      </div>
      <div className="lego-game-foot">
        <p className="lego-game-hint">{t.hint}</p>
        <button type="button" className="lego-game-button lego-game-quiet" onClick={onExit}>
          {t.close}
        </button>
      </div>
    </div>
  );
}
