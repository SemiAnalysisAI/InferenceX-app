/**
 * One sitting in Brick Studio: joins the rules, the 3D view, the saves, the sounds and the studs.
 * The React component only forwards input to it and draws the snapshot it hands back.
 */
import { track } from '@/lib/analytics/analytics';

import { playSfx, playSnap, playVoice } from './lego-audio';
import { addStuds } from './lego-store';
import {
  BOARD,
  COLOURS,
  PARTS,
  World,
  buildSets,
  decodeBuild,
  encodeBuild,
  footprint,
  readFreeBuild,
  readProgress,
  sameTurn,
  writeFreeBuild,
  writeProgress,
  type BuildSet,
  type Piece,
  type PieceSpec,
  type RackStats,
  type SetId,
  type StageId,
  rackStats,
  stageAt,
  type StudioProgress,
  type Turn,
} from './lego-studio-model';
import { StudioRenderer, type Pick } from './lego-studio-render';

export type StudioMode = 'free' | SetId;

export type MessageKey =
  | 'placed'
  | 'removed'
  | 'overlap'
  | 'floating'
  | 'bounds'
  | 'carries'
  | 'wrongSpot'
  | 'wrongTurn'
  | 'nothing'
  | 'undone'
  | 'redone'
  | 'cleared'
  | 'cursor'
  | 'separatorOn'
  | 'separatorOff'
  | 'turned'
  | 'copied'
  | 'copyFailed'
  | 'loaded'
  | 'badCode'
  | 'pictured'
  | 'pictureFailed'
  | 'stageDone'
  | 'stagePassed'
  | 'poweredOn';

export interface StudioMessage {
  /** Changes with every message so the same text can be announced twice. */
  serial: number;
  key: MessageKey;
  part?: number;
  colour?: number;
  x?: number;
  y?: number;
  z?: number;
  /** How many pieces the message is about. */
  count?: number;
  /** The stage of a long set the message is about. */
  stage?: StageId;
}

export interface StudioSnapshot {
  part: number;
  colour: number;
  turn: Turn;
  separator: boolean;
  pieces: number;
  step: number;
  total: number;
  /** The piece the booklet asks for next, when building a set. */
  next: PieceSpec | null;
  done: boolean;
  /** The stage of a long set being built, or -1. */
  stage: number;
  /** What the placed GPU tiles and cooling pieces add up to. */
  rack: RackStats;
  newBest: boolean;
  /** The power-on show of a staged set is running: the finished card waits for it. */
  showing: boolean;
  earned: number;
  seconds: number;
  canUndo: boolean;
  canRedo: boolean;
  busy: boolean;
  lost: boolean;
  /** The 3D view dropped shadows and resolution because frames stayed slow. */
  lowDetail: boolean;
  message: StudioMessage | null;
}

type Change =
  | { kind: 'add'; piece: Piece }
  | { kind: 'remove'; piece: Piece }
  | { kind: 'clear'; pieces: Piece[] }
  /** A pasted build code took the place of what stood on the baseplate. */
  | { kind: 'swap'; before: Piece[]; after: Piece[] };

const STEP_STUDS = 100;
const SET_BONUS = 2000;
const STAGE_BONUS = 500;

/** The snap rings higher the further up the build a piece goes, and higher again for a plate. */
function snapRate(spec: PieceSpec): number {
  return (PARTS[spec.part].h === 1 ? 1.15 : 1) * (1 + Math.min(0.3, spec.y * 0.018));
}
const FREE_STUDS = 10;
const HELP_SECONDS = 20;

export class StudioSession {
  readonly view: StudioRenderer;
  readonly mode: StudioMode;
  /** Which Free Build baseplate this sitting loads and saves. */
  private readonly slot: number;
  private readonly onChange: (snapshot: StudioSnapshot) => void;
  private readonly world = new World();
  private readonly set: BuildSet | undefined;
  private readonly progress: StudioProgress;
  private readonly undone: Change[] = [];
  private readonly history: Change[] = [];
  private readonly stepIds: number[] = [];
  private readonly pictures = new Map<number, string[]>();
  private readonly stopLost: () => void;
  private readonly clock: number;
  private part = 0;
  private colour = 0;
  private turn: Turn = 0;
  private separator = false;
  private cursor = { x: BOARD / 2 - 1, z: BOARD / 2 - 1 };
  private cursorShown = false;
  private hovered: number | undefined;
  private step = 0;
  private redoTo = 0;
  private done = false;
  private newBest = false;
  private show: number | undefined;
  private earned = 0;
  private busy = false;
  private lost = false;
  private lowDetail = false;
  private message: StudioMessage | null = null;
  private serial = 0;
  private disposed = false;

  constructor(
    canvas: HTMLCanvasElement,
    mode: StudioMode,
    still: boolean,
    onChange: (snapshot: StudioSnapshot) => void,
    slot = 0,
  ) {
    this.mode = mode;
    this.slot = slot;
    this.onChange = onChange;
    this.view = new StudioRenderer(canvas, still);
    this.stopLost = this.view.onLost(() => {
      this.lost = true;
      this.emit();
    });
    this.view.onLowDetail(() => {
      this.lowDetail = true;
      this.emit();
    });
    this.progress = readProgress();
    this.set = buildSets().find((entry) => entry.id === mode);
    if (this.set) {
      const saved = this.progress[this.set.id];
      for (const spec of this.set.steps.slice(0, saved.step)) this.stepIds.push(this.put(spec));
      this.step = this.stepIds.length;
      this.redoTo = this.step;
      this.done = this.step === this.set.steps.length;
      if (this.done && this.set.stages) this.view.power(true);
      this.faceStage();
      this.takeStepPiece();
    } else {
      this.world.load(readFreeBuild(this.slot));
      for (const piece of this.world.pieces.values()) this.view.addPiece(piece, false);
    }
    this.clock = window.setInterval(() => this.tick(), 1000);
    this.refresh();
    playSfx('pour', { volume: 0.45 });
    track('lego_studio_opened', { mode });
  }

  snapshot(): StudioSnapshot {
    const saved = this.set ? this.progress[this.set.id] : undefined;
    return {
      part: this.part,
      colour: this.colour,
      turn: this.turn,
      separator: this.separator,
      pieces: this.world.pieces.size,
      step: this.step,
      total: this.set?.steps.length ?? 0,
      next: this.target(),
      done: this.done,
      stage: this.set ? stageAt(this.set, Math.min(this.step, this.set.steps.length - 1)) : -1,
      newBest: this.newBest,
      showing: this.show !== undefined,
      rack: rackStats(this.world.pieces.values()),
      earned: this.earned,
      seconds: saved?.seconds ?? 0,
      canUndo: this.set ? this.step > 0 : this.history.length > 0,
      canRedo: this.set ? this.step < this.redoTo : this.undone.length > 0,
      busy: this.busy,
      lost: this.lost,
      lowDetail: this.lowDetail,
      message: this.message,
    };
  }

  /**
   * Pictures of parts in a colour, by part index. Only the listed parts are drawn, and only
   * once each: drawing every part at one go holds the page for seconds on a slow GPU.
   */
  thumbnails(colour: number, parts: readonly number[]): string[] {
    const pictures = this.pictures.get(colour) ?? [];
    const missing = parts.filter((part) => !pictures[part]);
    if (missing.length > 0) {
      const drawn = this.view.thumbnails(colour, missing);
      for (const part of missing) if (drawn[part]) pictures[part] = drawn[part];
      this.pictures.set(colour, pictures);
    }
    return Array.from(pictures, (picture) => picture ?? '');
  }

  // ------------------------------------------------------------------ pointer

  /** The pointer moved over the baseplate, or left it. */
  hover(pick: Pick | null): void {
    this.cursorShown = pick !== null;
    this.hovered = pick?.piece;
    if (pick) this.cursor = { x: pick.x, z: pick.z };
    this.refresh(false);
  }

  /** A click or tap landed here. */
  act(pick: Pick | null, touch = false): void {
    if (!pick || this.busy || this.lost) return;
    this.cursor = { x: pick.x, z: pick.z };
    // A finger does not hover, so nothing is left in hand on the plate after a tap.
    this.cursorShown = !touch;
    this.hovered = touch ? undefined : pick.piece;
    this.use(pick);
  }

  // ------------------------------------------------------------------ keyboard

  /** Moves the piece in hand one stud. `right` and `away` follow the camera. */
  move(right: number, away: number): void {
    const quarter = this.view.quarter();
    const sin = [0, 1, 0, -1][quarter];
    const cos = [1, 0, -1, 0][quarter];
    const x = this.cursor.x + right * cos - away * sin;
    const z = this.cursor.z - right * sin - away * cos;
    this.cursor = {
      x: Math.min(BOARD - 1, Math.max(0, x)),
      z: Math.min(BOARD - 1, Math.max(0, z)),
    };
    this.cursorShown = true;
    this.hovered = undefined;
    this.say('cursor', {
      x: this.cursor.x + 1,
      z: this.cursor.z + 1,
      y: this.world.columnTop(this.cursor.x, this.cursor.z),
    });
    this.refresh();
  }

  actAtCursor(): void {
    if (this.busy || this.lost) return;
    this.cursorShown = true;
    this.hovered = undefined;
    this.use({ x: this.cursor.x, z: this.cursor.z });
  }

  /** Lifts the top piece under the cursor. Free Build only. */
  liftAtCursor(): void {
    if (this.busy || this.lost || this.set) return;
    this.lift(this.world.topPiece(this.cursor.x, this.cursor.z));
  }

  // ------------------------------------------------------------------ tools

  choosePart(part: number): void {
    if (this.set || part < 0 || part >= PARTS.length) return;
    this.part = part;
    this.separator = false;
    this.refresh();
  }

  chooseColour(colour: number): void {
    if (this.set || colour < 0 || colour >= COLOURS.length) return;
    this.colour = colour;
    this.separator = false;
    this.refresh();
  }

  rotate(): void {
    if (this.busy || this.done) return;
    this.turn = ((this.turn + 1) % 4) as Turn;
    this.separator = false;
    playSfx('tick', { volume: 0.35, rate: 1.5 });
    this.say('turned');
    this.refresh();
  }

  toggleSeparator(): void {
    if (this.set || this.busy) return;
    this.separator = !this.separator;
    this.say(this.separator ? 'separatorOn' : 'separatorOff');
    this.refresh();
  }

  undo(): void {
    if (this.busy || this.lost) return;
    if (this.set) {
      const id = this.stepIds.pop();
      if (id === undefined) return;
      this.take(id);
      this.step -= 1;
      this.done = false;
      this.endShow();
      this.view.power(false);
      this.newBest = false;
      this.saveSet();
      this.takeStepPiece();
    } else {
      const change = this.history.pop();
      if (!change) return;
      this.revert(change);
      this.undone.push(change);
      this.saveFree();
    }
    playSnap(0.6, 0.75);
    this.say('undone');
    this.refresh();
  }

  redo(): void {
    if (this.busy || this.lost) return;
    if (this.set) {
      if (this.step >= this.redoTo) return;
      this.placeStep('redo');
    } else {
      const change = this.undone.pop();
      if (!change) return;
      this.apply(change);
      this.history.push(change);
      this.saveFree();
      playSnap(0.8);
    }
    this.say('redone');
    this.refresh();
  }

  /** Everything comes apart. A set starts over; a free build can still be undone. */
  reset(): void {
    if (this.busy || this.lost) return;
    const pieces = [...this.world.pieces.values()];
    if (pieces.length === 0 && this.step === 0) return;
    this.busy = true;
    this.separator = false;
    this.world.clear();
    if (this.set) {
      const saved = this.progress[this.set.id];
      saved.step = 0;
      saved.seconds = 0;
      saved.paid = 0;
      this.stepIds.length = 0;
      this.step = 0;
      this.redoTo = 0;
      this.done = false;
      this.endShow();
      this.view.power(false);
      this.newBest = false;
      this.saveSet();
      this.takeStepPiece();
    } else {
      this.history.push({ kind: 'clear', pieces });
      this.undone.length = 0;
      this.saveFree();
    }
    playSfx('fall-apart', { volume: 0.6 });
    track('lego_studio_reset', { mode: this.mode });
    this.view.setGhost(null);
    this.view.setTarget(null);
    this.view.mark(null);
    this.say('cleared');
    this.emit();
    this.view.crumble(() => {
      this.busy = false;
      this.refresh();
    });
  }

  /** The free build as a line of text that `loadCode` reads back. */
  buildCode(): string {
    return encodeBuild(this.world.serialize());
  }

  /**
   * Swaps the free build for the one a pasted code describes. One undo brings the old build
   * back. Returns false, and changes nothing, when the text is not a build code.
   */
  loadCode(text: string): boolean {
    if (this.set || this.busy || this.lost) return false;
    const rows = decodeBuild(text);
    if (!rows) {
      this.say('badCode');
      this.emit();
      return false;
    }
    const before = [...this.world.pieces.values()];
    for (const piece of before) this.take(piece.id);
    // The code was checked against an empty baseplate, which is what is here now. New ids, so
    // nothing in the undo history is mistaken for one of these.
    const after = rows.map(([part, colour, x, y, z, turn]) =>
      this.world.add({ part, colour, x, y, z, turn: turn as Turn }),
    );
    for (const piece of after) this.view.addPiece(piece, false);
    this.history.push({ kind: 'swap', before, after });
    this.undone.length = 0;
    this.separator = false;
    this.saveFree();
    playSfx('pour', { volume: 0.45 });
    track('lego_studio_code_loaded', { pieces: after.length });
    this.say('loaded', { count: after.length });
    this.refresh();
    return true;
  }

  /**
   * The build as a picture: the baseplate and what stands on it, seen from where the camera
   * is now, with a caption strip underneath. Null when the canvas cannot be read.
   */
  picture(caption: string): HTMLCanvasElement | null {
    if (this.lost) return null;
    let top = 0;
    for (const piece of this.world.pieces.values())
      top = Math.max(top, piece.y + PARTS[piece.part].h);
    return this.view.picture(top, caption);
  }

  /** Says how sharing went, in the status line. */
  note(key: 'copied' | 'copyFailed' | 'pictured' | 'pictureFailed'): void {
    if (key === 'copied' || key === 'pictured')
      track('lego_studio_shared', { kind: key === 'copied' ? 'code' : 'picture' });
    this.say(key, { count: this.world.pieces.size });
    this.emit();
  }

  /** Puts the cursor on the spot the booklet is asking for. */
  jump(): void {
    const target = this.target();
    if (!target) return;
    const [fw, fd] = footprint(target.part, target.turn);
    this.cursor = {
      x: target.x + Math.floor((fw - 1) / 2),
      z: target.z + Math.floor((fd - 1) / 2),
    };
    this.cursorShown = true;
    this.hovered = undefined;
    this.say('cursor', { x: this.cursor.x + 1, z: this.cursor.z + 1, y: target.y });
    this.refresh();
  }

  /** Snaps the next booklet piece on for the builder: no studs, and time on the clock. */
  help(): void {
    if (this.busy || this.lost || !this.target()) return;
    this.placeStep('help');
    this.refresh();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    window.clearInterval(this.clock);
    this.endShow();
    this.stopLost();
    if (this.set) this.saveSet();
    else this.saveFree();
    this.view.dispose();
  }

  // ------------------------------------------------------------------ internals

  private target(): PieceSpec | null {
    return this.set && !this.done ? (this.set.steps[this.step] ?? null) : null;
  }

  /** Holds the part the booklet asks for next, in its colour and already turned. */
  private takeStepPiece(): void {
    const target = this.target();
    if (!target) return;
    this.part = target.part;
    this.colour = target.colour;
    // The booklet hands the piece over the way it goes on, so nobody has to guess the turns.
    this.turn = target.turn;
  }

  /** The piece in hand, lowered onto the columns around a stud. */
  private specAt(x: number, z: number): PieceSpec {
    const [fw, fd] = footprint(this.part, this.turn);
    const px = Math.min(BOARD - fw, Math.max(0, x - Math.floor((fw - 1) / 2)));
    const pz = Math.min(BOARD - fd, Math.max(0, z - Math.floor((fd - 1) / 2)));
    return {
      part: this.part,
      colour: this.colour,
      x: px,
      y: this.world.restLayer(this.part, this.turn, px, pz),
      z: pz,
      turn: this.turn,
    };
  }

  /** Whether a stud, or the piece in hand lowered around it, lands on the booklet's outline. */
  private onTarget(pick: Pick, target: PieceSpec): boolean {
    if (pick.onTarget) return true;
    const [fw, fd] = footprint(target.part, target.turn);
    if (
      pick.x >= target.x &&
      pick.x < target.x + fw &&
      pick.z >= target.z &&
      pick.z < target.z + fd
    )
      return true;
    const spec = this.specAt(pick.x, pick.z);
    return spec.x === target.x && spec.y === target.y && spec.z === target.z;
  }

  private use(pick: Pick): void {
    const target = this.target();
    if (this.set) {
      if (!target) return;
      if (!this.onTarget(pick, target)) this.refuse('wrongSpot');
      else if (sameTurn(target.part, this.turn, target.turn)) this.placeStep('hand');
      else this.refuse('wrongTurn');
    } else if (this.separator) {
      const piece =
        pick.piece === undefined ? undefined : (this.world.pieces.get(pick.piece) ?? undefined);
      this.lift(piece ?? this.world.topPiece(pick.x, pick.z));
    } else {
      const spec = this.specAt(pick.x, pick.z);
      const result = this.world.check(spec);
      if (result === 'ok') {
        const piece = this.world.add(spec);
        this.view.addPiece(piece, true);
        this.history.push({ kind: 'add', piece });
        this.undone.length = 0;
        this.saveFree();
        this.pay(FREE_STUDS, spec);
        playSnap(1, snapRate(spec));
        this.say('placed', { part: spec.part, colour: spec.colour });
      } else {
        this.refuse(result);
      }
    }
    this.refresh();
  }

  private lift(piece: Piece | undefined): void {
    if (!piece) {
      this.refuse('nothing');
    } else if (this.world.carries(piece.id)) {
      this.refuse('carries');
    } else {
      this.take(piece.id);
      this.history.push({ kind: 'remove', piece });
      this.undone.length = 0;
      this.saveFree();
      playSnap(0.7, 0.72);
      this.say('removed', { part: piece.part, colour: piece.colour });
    }
    this.refresh();
  }

  private placeStep(by: 'hand' | 'help' | 'redo'): void {
    const set = this.set;
    const target = set?.steps[this.step];
    if (!set || !target) return;
    const saved = this.progress[set.id];
    this.stepIds.push(this.put(target, true));
    this.step += 1;
    if (by !== 'redo') this.redoTo = this.step;
    if (by === 'help') saved.seconds += HELP_SECONDS;
    // The last piece of a stage: a bonus the first time, and the camera moves on.
    const closed = set.stages?.findIndex((stage) => stage.from === this.step) ?? -1;
    const bonus = closed > 0 && by === 'hand' && this.step > saved.paid;
    if (this.step > saved.paid) {
      if (by === 'hand') this.pay(bonus ? STEP_STUDS + STAGE_BONUS : STEP_STUDS, target);
      saved.paid = this.step;
    }
    playSnap(1, snapRate(target));
    this.say('placed', { part: target.part, colour: target.colour });
    if (closed > 0 && set.stages) {
      playSfx('build', { volume: 0.4, rate: 1 + closed * 0.08, delay: 0.1 });
      this.say(bonus ? 'stageDone' : 'stagePassed', {
        stage: set.stages[closed - 1].id,
        count: closed,
      });
      this.faceStage();
    }
    if (this.step === set.steps.length) {
      this.done = true;
      if (set.stages) {
        // The last piece brings the pod up: the lights come on, one rising tick per stage.
        const seconds = this.view.power(true, true);
        if (seconds > 0) {
          this.show = window.setTimeout(() => {
            this.show = undefined;
            this.emit();
          }, seconds * 1000);
        }
        set.stages.forEach((_, index) =>
          playSfx('tick', {
            volume: 0.5,
            rate: 1 + index * 0.25,
            delay: 0.25 + index * 0.22,
            gap: 0,
          }),
        );
        this.say('poweredOn');
      }
      if (saved.paid <= set.steps.length) {
        // First time over the line for this build: the bonus, the tally, the clock.
        saved.paid = set.steps.length + 1;
        saved.built += 1;
        this.newBest = saved.best > 0 && saved.seconds < saved.best;
        if (saved.best === 0 || saved.seconds < saved.best) saved.best = saved.seconds;
        this.pay(SET_BONUS, target);
        playSfx('build', { volume: 0.6, delay: 0.12 });
        playVoice('awesome');
        track('lego_set_completed', { set_id: set.id, seconds: saved.seconds });
      }
    }
    this.saveSet();
    this.takeStepPiece();
  }

  private endShow(): void {
    window.clearTimeout(this.show);
    this.show = undefined;
  }

  /** Turns the camera to the part of the baseplate the stage in hand is built on. */
  private faceStage(): void {
    const stages = this.set?.stages;
    if (!this.set || !stages || this.done) return;
    this.view.face(stages[stageAt(this.set, this.step)].azimuth);
  }

  private refuse(key: MessageKey): void {
    playSfx('tick', { volume: 0.4, rate: 0.7 });
    this.say(key);
  }

  private pay(amount: number, spec: PieceSpec): void {
    this.earned += amount;
    addStuds(amount, this.view.screenOf(spec));
  }

  private put(spec: PieceSpec, animate = false): number {
    const piece = this.world.add(spec);
    this.view.addPiece(piece, animate);
    return piece.id;
  }

  private take(id: number): void {
    this.world.remove(id);
    this.view.removePiece(id);
  }

  private apply(change: Change): void {
    if (change.kind === 'add') {
      this.world.add(change.piece, change.piece.id);
      this.view.addPiece(change.piece, true);
    } else if (change.kind === 'remove') {
      this.take(change.piece.id);
    } else if (change.kind === 'clear') {
      for (const piece of change.pieces) this.take(piece.id);
    } else {
      this.exchange(change.before, change.after);
    }
  }

  private exchange(from: Piece[], to: Piece[]): void {
    for (const piece of from) this.take(piece.id);
    for (const piece of to) {
      this.world.add(piece, piece.id);
      this.view.addPiece(piece, false);
    }
  }

  private revert(change: Change): void {
    if (change.kind === 'add') {
      this.take(change.piece.id);
    } else if (change.kind === 'remove') {
      this.world.add(change.piece, change.piece.id);
      this.view.addPiece(change.piece, true);
    } else if (change.kind === 'clear') {
      for (const piece of change.pieces) {
        this.world.add(piece, piece.id);
        this.view.addPiece(piece, false);
      }
    } else {
      this.exchange(change.after, change.before);
    }
  }

  private tick(): void {
    if (!this.set || this.done || this.step === 0 || this.busy || document.hidden) return;
    const saved = this.progress[this.set.id];
    saved.seconds += 1;
    if (saved.seconds % 5 === 0) this.saveSet();
    this.emit();
  }

  private saveSet(): void {
    if (!this.set) return;
    this.progress[this.set.id].step = this.step;
    writeProgress(this.progress);
  }

  private saveFree(): void {
    writeFreeBuild(this.world.serialize(), this.slot);
  }

  private say(key: MessageKey, values: Omit<StudioMessage, 'serial' | 'key'> = {}): void {
    this.serial += 1;
    this.message = { serial: this.serial, key, ...values };
  }

  /** Redraws the helpers in the 3D view and hands the component a new snapshot. */
  private refresh(emit = true): void {
    const target = this.busy ? null : this.target();
    this.view.setTarget(target);
    const topPiece = this.world.topPiece(this.cursor.x, this.cursor.z) ?? null;
    const hovered = this.hovered === undefined ? undefined : this.world.pieces.get(this.hovered);
    this.view.mark(this.separator && this.cursorShown ? (hovered ?? topPiece) : null);
    if (this.busy || this.done || this.separator || !this.cursorShown) {
      this.view.setGhost(null);
    } else {
      const spec = this.specAt(this.cursor.x, this.cursor.z);
      const snapsOn =
        target !== null &&
        this.onTarget({ x: this.cursor.x, z: this.cursor.z }, target) &&
        sameTurn(target.part, this.turn, target.turn);
      if (snapsOn) this.view.setGhost(target, true);
      else this.view.setGhost(spec, this.world.check(spec) === 'ok');
    }
    if (emit) this.emit();
  }

  private emit(): void {
    if (!this.disposed) this.onChange(this.snapshot());
  }
}
