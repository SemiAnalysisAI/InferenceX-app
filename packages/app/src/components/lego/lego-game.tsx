'use client';

import dynamic from 'next/dynamic';
import { Volume2, VolumeOff } from 'lucide-react';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';

import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { track } from '@/lib/analytics/analytics';
import { useLocale } from '@/lib/i18n/use-locale';
import LegoStacker, {
  RACKS,
  readStackerBest,
  readStackerRacks,
  type StackerMode,
} from './lego-stacker';
import {
  getLegoState,
  getServerLegoState,
  setMusicEnabled,
  setSoundEnabled,
  subscribeLego,
} from './lego-store';
import { STRINGS, fill } from './lego-strings';
import {
  COLOURS,
  FREE_SLOTS,
  PARTS,
  buildSets,
  footprint,
  formatClock,
  readFreeBuild,
  readProgress,
  setsMissing,
  type BuildSet,
  type PieceSpec,
  type SetId,
  type StudioProgress,
} from './lego-studio-model';

function StudioLoading() {
  const locale = useLocale();
  return (
    <div className="lego-studio-loading" role="status">
      <span className="lego-studio-loading-bricks" aria-hidden="true">
        <i />
        <i />
        <i />
      </span>
      {STRINGS[locale].hub.loading}
    </div>
  );
}

// The 3D studio, and three.js with it, is fetched only when a build is opened.
const LegoStudio = dynamic(() => import('./lego-studio'), {
  ssr: false,
  loading: () => <StudioLoading />,
});

type View =
  | { kind: 'hub' }
  | { kind: 'studio'; mode: 'free' | SetId }
  | { kind: 'stacker'; mode: StackerMode };

const PREVIEW_W = 132;
const PREVIEW_H = 112;

function shade(hex: string, factor: number): string {
  const channel = (at: number) =>
    Math.max(0, Math.min(255, Math.round(Number.parseInt(hex.slice(at, at + 2), 16) * factor)));
  return `rgb(${channel(1)} ${channel(3)} ${channel(5)})`;
}

/** Layers a part fills above one stud of its footprint: a slope steps down from its high edge. */
function layersAt(spec: PieceSpec, i: number, j: number): number {
  const part = PARTS[spec.part];
  if (part.kind !== 'slope') return part.h;
  const [fw, fd] = footprint(spec.part, spec.turn);
  const fromHigh = [j, i, fd - 1 - j, fw - 1 - i][spec.turn];
  return fromHigh === 0 ? part.h : 1;
}

/** Box art: the finished set as small blocks seen from a corner. Drawn from the booklet data. */
function SetPreview({ set, label }: { set: BuildSet; label: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const ratio = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = PREVIEW_W * ratio;
    canvas.height = PREVIEW_H * ratio;
    const cells: { x: number; y: number; z: number; hex: string }[] = [];
    for (const spec of set.steps) {
      const [fw, fd] = footprint(spec.part, spec.turn);
      for (let i = 0; i < fw; i++)
        for (let j = 0; j < fd; j++)
          for (let k = 0; k < layersAt(spec, i, j); k++)
            cells.push({
              x: spec.x + i,
              y: spec.y + k,
              z: spec.z + j,
              hex: COLOURS[spec.colour].hex,
            });
    }
    // Far cells first, lower cells first: nearer and higher ones paint over them.
    cells.sort((a, b) => a.x + a.z - (b.x + b.z) || a.y - b.y);
    const RISE = 0.42;
    const flat = (x: number, y: number, z: number) => [x - z, (x + z) / 2 - y * RISE] as const;
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const cell of cells) {
      minX = Math.min(minX, cell.x - cell.z - 1);
      maxX = Math.max(maxX, cell.x - cell.z + 1);
      minY = Math.min(minY, (cell.x + cell.z) / 2 - (cell.y + 1) * RISE);
      maxY = Math.max(maxY, (cell.x + cell.z) / 2 + 1 - cell.y * RISE);
    }
    const scale = Math.min((PREVIEW_W - 12) / (maxX - minX), (PREVIEW_H - 12) / (maxY - minY));
    const left = (PREVIEW_W - (maxX - minX) * scale) / 2 - minX * scale;
    const top = (PREVIEW_H - (maxY - minY) * scale) / 2 - minY * scale;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, PREVIEW_W, PREVIEW_H);
    const face = (points: (readonly [number, number])[], colour: string) => {
      ctx.fillStyle = colour;
      ctx.strokeStyle = colour;
      ctx.lineWidth = 0.6;
      ctx.beginPath();
      for (const [index, [px, py]] of points.entries()) {
        if (index === 0) ctx.moveTo(left + px * scale, top + py * scale);
        else ctx.lineTo(left + px * scale, top + py * scale);
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    };
    for (const { x, y, z, hex } of cells) {
      face(
        [
          flat(x, y + 1, z + 1),
          flat(x + 1, y + 1, z + 1),
          flat(x + 1, y, z + 1),
          flat(x, y, z + 1),
        ],
        shade(hex, 0.86),
      );
      face(
        [
          flat(x + 1, y + 1, z),
          flat(x + 1, y + 1, z + 1),
          flat(x + 1, y, z + 1),
          flat(x + 1, y, z),
        ],
        shade(hex, 0.68),
      );
      face(
        [
          flat(x, y + 1, z),
          flat(x + 1, y + 1, z),
          flat(x + 1, y + 1, z + 1),
          flat(x, y + 1, z + 1),
        ],
        shade(hex, 1.08),
      );
    }
  }, [set]);
  return <canvas ref={canvasRef} className="lego-hub-preview" role="img" aria-label={label} />;
}

function Hub({ onOpen, onClose }: { onOpen: (view: View) => void; onClose: () => void }) {
  const locale = useLocale();
  const t = STRINGS[locale].hub;
  const [progress, setProgress] = useState<StudioProgress | null>(null);
  const [freeCount, setFreeCount] = useState(0);
  const [best, setBest] = useState(0);
  const [racks, setRacks] = useState(0);

  useEffect(() => {
    setProgress(readProgress());
    // Every baseplate counts, not only the first.
    let pieces = 0;
    for (let slot = 0; slot < FREE_SLOTS; slot++) {
      const rows = readFreeBuild(slot);
      if (Array.isArray(rows)) pieces += rows.length;
    }
    setFreeCount(pieces);
    setBest(readStackerBest());
    setRacks(readStackerRacks());
  }, []);

  return (
    <div className="lego-hub" data-testid="lego-hub">
      <h2 className="lego-game-title">{t.title}</h2>
      <p className="lego-game-description">{t.description}</p>
      {/* The set shelf is a level-select hub, so it borrows the best known one. */}
      <figure className="lego-hub-diner" data-testid="lego-hub-diner">
        <img
          src="/decorative/lego/img/place-dexters-diner.webp"
          alt=""
          width={648}
          height={240}
          decoding="async"
          draggable={false}
        />
        <figcaption>{t.diner}</figcaption>
      </figure>
      <div className="lego-hub-scroll">
        <h3 className="lego-studio-label">{t.booklets}</h3>
        <ul className="lego-hub-sets">
          {buildSets().map((set) => {
            const saved = progress?.[set.id];
            const total = set.steps.length;
            const complete = saved !== undefined && saved.step >= total;
            const started = saved !== undefined && saved.step > 0 && !complete;
            const name = t.setNames[set.id];
            // A capstone booklet stays shut until the sets it builds on are done.
            const missing = progress ? setsMissing(set, progress) : (set.needs?.length ?? 0);
            const locked = missing > 0 && !started && !complete;
            return (
              <li
                key={set.id}
                className="lego-hub-set"
                data-set={set.id}
                data-locked={locked ? 'true' : undefined}
              >
                <SetPreview set={set} label={fill(t.previewAlt, { name })} />
                <div className="lego-hub-text">
                  <p className="lego-hub-number">
                    {fill(t.setNumber, { n: set.number })} · {fill(t.pieces, { n: total })}
                    {set.stages && ` · ${fill(t.stageCount, { n: set.stages.length })}`}
                  </p>
                  <h4 className="lego-hub-name">{name}</h4>
                  <p className="lego-hub-blurb">{t.setBlurbs[set.id]}</p>
                  <p className="lego-hub-state">
                    {locked
                      ? fill(t.locked, { n: missing })
                      : started
                        ? fill(t.progress, { step: (saved?.step ?? 0) + 1, total })
                        : saved && saved.built > 0
                          ? `${fill(t.built, { n: saved.built })} · ${fill(t.bestTime, {
                              time: formatClock(saved.best),
                            })}`
                          : t.notStarted}
                  </p>
                </div>
                <button
                  type="button"
                  className="lego-game-button"
                  data-testid={`lego-hub-${set.id}`}
                  data-hub-entry={`studio-${set.id}`}
                  aria-label={`${locked ? t.lockedButton : started ? t.resume : complete ? t.again : t.start}: ${name}`}
                  disabled={locked}
                  onClick={() => onOpen({ kind: 'studio', mode: set.id })}
                >
                  {locked ? t.lockedButton : started ? t.resume : complete ? t.again : t.start}
                </button>
              </li>
            );
          })}
        </ul>
        <ul className="lego-hub-more">
          <li className="lego-hub-card">
            <h3 className="lego-hub-name">{t.free}</h3>
            <p className="lego-hub-blurb">{t.freeBlurb}</p>
            <p className="lego-hub-state">
              {freeCount > 0 ? fill(t.freeCount, { n: freeCount }) : t.freeEmpty}
            </p>
            <button
              type="button"
              className="lego-game-button"
              data-testid="lego-hub-free"
              data-hub-entry="studio-free"
              aria-label={`${t.open}: ${t.free}`}
              onClick={() => onOpen({ kind: 'studio', mode: 'free' })}
            >
              {t.open}
            </button>
          </li>
          <li className="lego-hub-card">
            <h3 className="lego-hub-name">
              {t.stacker}: {t.endless}
            </h3>
            <p className="lego-hub-blurb">{t.endlessBlurb}</p>
            <p className="lego-hub-state">{fill(t.endlessBest, { n: best })}</p>
            <button
              type="button"
              className="lego-game-button"
              data-testid="lego-hub-endless"
              data-hub-entry="stacker-endless"
              aria-label={`${t.play}: ${t.endless}`}
              onClick={() => onOpen({ kind: 'stacker', mode: 'endless' })}
            >
              {t.play}
            </button>
          </li>
          <li className="lego-hub-card">
            <h3 className="lego-hub-name">
              {t.stacker}: {t.rack}
            </h3>
            <p className="lego-hub-blurb">{t.rackBlurb}</p>
            <p className="lego-hub-state">
              {racks >= RACKS.length
                ? fill(t.rackDone, { total: RACKS.length })
                : fill(t.rackLevel, { n: racks + 1, total: RACKS.length })}
            </p>
            <button
              type="button"
              className="lego-game-button"
              data-testid="lego-hub-rack-build"
              data-hub-entry="stacker-rack"
              aria-label={`${t.play}: ${t.rack}`}
              onClick={() => onOpen({ kind: 'stacker', mode: 'rack' })}
            >
              {t.play}
            </button>
          </li>
        </ul>
      </div>
      <div className="lego-game-foot">
        <span />
        <button type="button" className="lego-game-button lego-game-quiet" onClick={onClose}>
          {t.close}
        </button>
      </div>
    </div>
  );
}

/**
 * One mute inside the game, so sound can be stopped without leaving the dialog. It writes the
 * same two preferences as the header switches: muting turns brick sounds and the song off,
 * unmuting brings the brick sounds back and leaves the song to its own switch.
 */
function GameMute() {
  const locale = useLocale();
  const t = STRINGS[locale].toggles;
  const state = useSyncExternalStore(subscribeLego, getLegoState, getServerLegoState);
  const audible = state.sound || state.music;
  const label = audible ? t.muteAll : t.unmuteSound;
  const toggle = () => {
    const sound = !audible;
    if (audible) setMusicEnabled(false);
    setSoundEnabled(sound);
    track('lego_game_mute_toggled', { muted: audible });
  };
  return (
    <button
      type="button"
      className="lego-game-mute"
      data-testid="lego-game-mute"
      data-muted={audible ? undefined : 'true'}
      onClick={toggle}
      title={label}
      aria-label={label}
      aria-pressed={!audible}
    >
      {audible ? <Volume2 className="size-5" /> : <VolumeOff className="size-5" />}
    </button>
  );
}

export default function LegoGameDialog({ onClose }: { onClose: () => void }) {
  const locale = useLocale();
  const strings = STRINGS[locale];
  const [view, setView] = useState<View>({ kind: 'hub' });
  const cameFrom = useRef('');

  const open = (next: View) => {
    if (next.kind === 'hub') return;
    cameFrom.current = `${next.kind}-${next.mode}`;
    track('lego_game_mode_selected', { mode: `${next.kind}_${next.mode}` });
    setView(next);
  };
  const back = () => setView({ kind: 'hub' });

  // Coming back to the menu, focus returns to the entry that was opened.
  useEffect(() => {
    if (view.kind !== 'hub' || !cameFrom.current) return;
    document
      .querySelector<HTMLButtonElement>(`[data-hub-entry="${cameFrom.current}"]`)
      ?.focus({ preventScroll: true });
  }, [view]);

  const title =
    view.kind === 'hub'
      ? strings.hub.title
      : view.kind === 'stacker'
        ? view.mode === 'rack'
          ? strings.game.rackTitle
          : strings.game.title
        : view.mode === 'free'
          ? strings.hub.free
          : strings.hub.setNames[view.mode];
  const description =
    view.kind === 'hub'
      ? strings.hub.description
      : view.kind === 'stacker'
        ? view.mode === 'rack'
          ? strings.game.rackDescription
          : strings.game.description
        : strings.studio.pointerHint;

  return (
    <Dialog
      open
      onOpenChange={(isOpen) => {
        if (!isOpen) onClose();
      }}
    >
      <DialogContent
        className={`lego-dialog lego-dialog-${view.kind}`}
        overlayClassName="lego-dialog-overlay"
        onInteractOutside={(event) => {
          // A stray click beside the baseplate must not throw the build away.
          if (view.kind !== 'hub') event.preventDefault();
        }}
        onEscapeKeyDown={(event) => {
          // Escape answers an open "Sure?" first; the studio cancels it.
          if (document.querySelector('.lego-studio-confirm')) event.preventDefault();
        }}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          // The launcher is gone when the theme itself was switched off mid-game.
          (
            document.querySelector<HTMLElement>('[data-testid="lego-launch"]') ??
            document.querySelector<HTMLElement>('main a, main button')
          )?.focus();
        }}
      >
        <GameMute />
        <DialogTitle className="sr-only">{title}</DialogTitle>
        <DialogDescription className="sr-only">{description}</DialogDescription>
        {view.kind === 'hub' && <Hub onOpen={open} onClose={onClose} />}
        {view.kind === 'studio' && <LegoStudio key={view.mode} mode={view.mode} onBack={back} />}
        {view.kind === 'stacker' && <LegoStacker key={view.mode} mode={view.mode} onExit={back} />}
      </DialogContent>
    </Dialog>
  );
}
