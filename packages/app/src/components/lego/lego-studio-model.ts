/**
 * Brick Studio rules, with no rendering in them: the part catalogue, the stud grid, what may be
 * placed where, the instruction sets and the saves.
 *
 * Units: one cell is one stud wide and deep, and one plate tall. A brick is three plates tall.
 */

/** Studs along each side of the baseplate. */
export const BOARD = 16;
/** Tallest build, in plates. */
export const MAX_LAYERS = 48;

export type PartKind = 'brick' | 'plate' | 'tile' | 'slope' | 'round' | 'cone';

export interface Part {
  id: string;
  kind: PartKind;
  /** Studs along x and z before any turn. */
  w: number;
  d: number;
  /** Height in plates. */
  h: number;
  /** Printed top face. */
  print?: 'gpu';
}

export const PARTS = [
  { id: 'brick-2x4', kind: 'brick', w: 4, d: 2, h: 3 },
  { id: 'brick-2x2', kind: 'brick', w: 2, d: 2, h: 3 },
  { id: 'brick-1x4', kind: 'brick', w: 4, d: 1, h: 3 },
  { id: 'brick-1x2', kind: 'brick', w: 2, d: 1, h: 3 },
  { id: 'brick-1x1', kind: 'brick', w: 1, d: 1, h: 3 },
  { id: 'plate-4x4', kind: 'plate', w: 4, d: 4, h: 1 },
  { id: 'plate-2x4', kind: 'plate', w: 4, d: 2, h: 1 },
  { id: 'plate-2x2', kind: 'plate', w: 2, d: 2, h: 1 },
  { id: 'plate-1x4', kind: 'plate', w: 4, d: 1, h: 1 },
  { id: 'plate-1x2', kind: 'plate', w: 2, d: 1, h: 1 },
  { id: 'slope-2x2', kind: 'slope', w: 2, d: 2, h: 3 },
  { id: 'slope-1x2', kind: 'slope', w: 1, d: 2, h: 3 },
  { id: 'tile-2x2', kind: 'tile', w: 2, d: 2, h: 1 },
  { id: 'tile-1x2', kind: 'tile', w: 2, d: 1, h: 1 },
  { id: 'gpu-2x2', kind: 'tile', w: 2, d: 2, h: 1, print: 'gpu' },
  { id: 'round-1x1', kind: 'round', w: 1, d: 1, h: 3 },
  { id: 'stud-1x1', kind: 'round', w: 1, d: 1, h: 1 },
  { id: 'cone-1x1', kind: 'cone', w: 1, d: 1, h: 3 },
] as const satisfies readonly Part[];

export type PartId = (typeof PARTS)[number]['id'];

export const COLOURS = [
  { id: 'red', hex: '#d01012', clear: false },
  { id: 'orange', hex: '#f47b20', clear: false },
  { id: 'yellow', hex: '#ffd400', clear: false },
  { id: 'lime', hex: '#a5ca18', clear: false },
  { id: 'green', hex: '#00852b', clear: false },
  { id: 'azure', hex: '#36aebf', clear: false },
  { id: 'blue', hex: '#0055bf', clear: false },
  { id: 'purple', hex: '#6b3fa0', clear: false },
  { id: 'white', hex: '#f4f4f4', clear: false },
  { id: 'grey', hex: '#a0a5a9', clear: false },
  { id: 'dark', hex: '#5b6066', clear: false },
  { id: 'black', hex: '#1e1e21', clear: false },
  { id: 'clear-yellow', hex: '#ffd83a', clear: true },
  { id: 'clear-blue', hex: '#6ec1f2', clear: true },
] as const;

export type ColourId = (typeof COLOURS)[number]['id'];

/** Quarter turns about the vertical axis. A slope falls towards +z at 0, +x at 1, -z at 2, -x at 3. */
export type Turn = 0 | 1 | 2 | 3;

export interface Piece {
  id: number;
  part: number;
  colour: number;
  /** Lowest corner of the box the piece fills. `y` counts plates. */
  x: number;
  y: number;
  z: number;
  turn: Turn;
}

export type PieceSpec = Omit<Piece, 'id'>;

export type PlaceResult = 'ok' | 'bounds' | 'overlap' | 'floating';

export function partIndex(id: PartId): number {
  return PARTS.findIndex((part) => part.id === id);
}

export function colourIndex(id: ColourId): number {
  return COLOURS.findIndex((colour) => colour.id === id);
}

/** Studs the part covers along x and z once turned. */
export function footprint(part: number, turn: Turn): [number, number] {
  const { w, d } = PARTS[part];
  return turn % 2 === 0 ? [w, d] : [d, w];
}

/** Whether the part has a stud above the cell `(i, j)` of its turned footprint. */
export function studAt(part: number, turn: Turn, i: number, j: number): boolean {
  const spec = PARTS[part];
  if (spec.kind === 'tile') return false;
  if (spec.kind !== 'slope') return true;
  // A slope keeps one row of studs, along its high edge.
  const [fw, fd] = footprint(part, turn);
  if (turn === 0) return j === 0;
  if (turn === 1) return i === 0;
  if (turn === 2) return j === fd - 1;
  return i === fw - 1;
}

/** Turns that leave the part looking the same do not count as different. */
export function sameTurn(part: number, a: Turn, b: Turn): boolean {
  if (a === b) return true;
  const spec = PARTS[part];
  if (spec.kind === 'slope') return false;
  if (spec.w === spec.d) return true;
  return a % 2 === b % 2;
}

function cellKey(x: number, y: number, z: number): number {
  return (y * BOARD + z) * BOARD + x;
}

export class World {
  readonly pieces = new Map<number, Piece>();
  private readonly cells = new Map<number, number>();
  private nextId = 1;

  pieceAt(x: number, y: number, z: number): Piece | undefined {
    const id = this.cells.get(cellKey(x, y, z));
    return id === undefined ? undefined : this.pieces.get(id);
  }

  /** First free layer above everything already standing in this column. */
  columnTop(x: number, z: number): number {
    for (let y = MAX_LAYERS - 1; y >= 0; y--) if (this.cells.has(cellKey(x, y, z))) return y + 1;
    return 0;
  }

  /** The layer a part comes to rest on when lowered onto these columns from above. */
  restLayer(part: number, turn: Turn, x: number, z: number): number {
    const [fw, fd] = footprint(part, turn);
    let top = 0;
    for (let i = 0; i < fw; i++)
      for (let j = 0; j < fd; j++) top = Math.max(top, this.columnTop(x + i, z + j));
    return top;
  }

  check(spec: PieceSpec): PlaceResult {
    const [fw, fd] = footprint(spec.part, spec.turn);
    const { h } = PARTS[spec.part];
    if (
      spec.x < 0 ||
      spec.z < 0 ||
      spec.y < 0 ||
      spec.x + fw > BOARD ||
      spec.z + fd > BOARD ||
      spec.y + h > MAX_LAYERS
    )
      return 'bounds';
    let held = spec.y === 0;
    for (let i = 0; i < fw; i++) {
      for (let j = 0; j < fd; j++) {
        for (let k = 0; k < h; k++)
          if (this.cells.has(cellKey(spec.x + i, spec.y + k, spec.z + j))) return 'overlap';
        if (held) continue;
        // Held by any one stud of the piece directly underneath.
        const below = this.pieceAt(spec.x + i, spec.y - 1, spec.z + j);
        if (below && studAt(below.part, below.turn, spec.x + i - below.x, spec.z + j - below.z))
          held = true;
      }
    }
    return held ? 'ok' : 'floating';
  }

  /** Puts the piece in without checking; callers check first. Pass an id to restore one. */
  add(spec: PieceSpec, id = this.nextId): Piece {
    const piece: Piece = { ...spec, id };
    this.nextId = Math.max(this.nextId, id + 1);
    this.pieces.set(id, piece);
    this.occupy(piece, id);
    return piece;
  }

  remove(id: number): Piece | undefined {
    const piece = this.pieces.get(id);
    if (!piece) return undefined;
    this.occupy(piece, undefined);
    this.pieces.delete(id);
    return piece;
  }

  /** True when another piece sits on this one, so lifting it would leave that one in the air. */
  carries(id: number): boolean {
    const piece = this.pieces.get(id);
    if (!piece) return false;
    const [fw, fd] = footprint(piece.part, piece.turn);
    const above = piece.y + PARTS[piece.part].h;
    if (above >= MAX_LAYERS) return false;
    for (let i = 0; i < fw; i++)
      for (let j = 0; j < fd; j++)
        if (this.cells.has(cellKey(piece.x + i, above, piece.z + j))) return true;
    return false;
  }

  /** Topmost piece standing in a column. */
  topPiece(x: number, z: number): Piece | undefined {
    const top = this.columnTop(x, z);
    return top === 0 ? undefined : this.pieceAt(x, top - 1, z);
  }

  clear(): void {
    this.pieces.clear();
    this.cells.clear();
  }

  /** Compact rows for storage: part, colour, x, y, z, turn. In build order. */
  serialize(): number[][] {
    return [...this.pieces.values()]
      .toSorted((a, b) => a.id - b.id)
      .map((piece) => [piece.part, piece.colour, piece.x, piece.y, piece.z, piece.turn]);
  }

  /** Loads rows written by `serialize`, skipping any row that no longer fits. */
  load(rows: unknown): void {
    this.clear();
    this.nextId = 1;
    if (!Array.isArray(rows)) return;
    for (const row of rows) {
      const spec = specFromRow(row);
      if (spec && this.check(spec) === 'ok') this.add(spec);
    }
  }

  private occupy(piece: Piece, value: number | undefined): void {
    const [fw, fd] = footprint(piece.part, piece.turn);
    const { h } = PARTS[piece.part];
    for (let i = 0; i < fw; i++)
      for (let j = 0; j < fd; j++)
        for (let k = 0; k < h; k++) {
          const key = cellKey(piece.x + i, piece.y + k, piece.z + j);
          if (value === undefined) this.cells.delete(key);
          else this.cells.set(key, value);
        }
  }
}

function whole(value: unknown, limit: number): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value < limit;
}

function specFromRow(row: unknown): PieceSpec | null {
  if (!Array.isArray(row) || row.length !== 6) return null;
  const [part, colour, x, y, z, turn] = row as unknown[];
  if (
    !whole(part, PARTS.length) ||
    !whole(colour, COLOURS.length) ||
    !whole(x, BOARD) ||
    !whole(y, MAX_LAYERS) ||
    !whole(z, BOARD) ||
    !whole(turn, 4)
  )
    return null;
  return { part, colour, x, y, z, turn: turn as Turn };
}

// ------------------------------------------------------------------ build codes

/**
 * A build as a short line of text that can be pasted somewhere else and loaded back.
 *
 * `IXB1.` and then base64url of: the piece count (two bytes), every piece packed into 25 bits
 * (part 5, colour 4, x 4, z 4, y 6, turn 2) in build order, and one check byte.
 */
const CODE_PREFIX = 'IXB1.';
const CODE_FIELDS = [5, 4, 4, 4, 6, 2] as const;
const PIECE_BITS = 25;
/** Longest code worth reading: a baseplate full of 1x1 plates is about 51,000 characters. */
const CODE_LIMIT = 60_000;
const BASE64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

function checkByte(bytes: Uint8Array, length: number): number {
  let sum = 90;
  for (let index = 0; index < length; index++) sum = (sum * 31 + bytes[index]) & 255;
  return sum;
}

/** The code for rows written by `World.serialize`. */
export function encodeBuild(rows: readonly (readonly number[])[]): string {
  const bytes = new Uint8Array(2 + Math.ceil((rows.length * PIECE_BITS) / 8) + 1);
  bytes[0] = rows.length >> 8;
  bytes[1] = rows.length & 255;
  let bit = 16;
  for (const [part, colour, x, y, z, turn] of rows) {
    const fields = [part, colour, x, z, y, turn];
    for (let field = 0; field < CODE_FIELDS.length; field++)
      for (let shift = CODE_FIELDS[field] - 1; shift >= 0; shift--, bit++)
        if ((fields[field] >> shift) & 1) bytes[bit >> 3] |= 128 >> (bit & 7);
  }
  bytes[bytes.length - 1] = checkByte(bytes, bytes.length - 1);
  let text = '';
  for (let index = 0; index < bytes.length; index += 3) {
    const chunk = (bytes[index] << 16) | ((bytes[index + 1] ?? 0) << 8) | (bytes[index + 2] ?? 0);
    const keep = Math.min(3, bytes.length - index) + 1;
    for (let digit = 0; digit < keep; digit++) text += BASE64[(chunk >> (18 - digit * 6)) & 63];
  }
  return CODE_PREFIX + text;
}

/**
 * Rows from a build code, or null when the text is not one: wrong prefix, damaged, or naming
 * a piece that cannot stand where the code puts it. Spaces and line breaks are ignored.
 */
export function decodeBuild(text: string): number[][] | null {
  if (text.length > CODE_LIMIT) return null;
  const clean = text.replaceAll(/\s+/gu, '');
  if (!clean.startsWith(CODE_PREFIX)) return null;
  const body = clean.slice(CODE_PREFIX.length);
  if (body.length % 4 === 1) return null;
  const bytes = new Uint8Array(Math.floor((body.length * 6) / 8));
  let held = 0;
  let bits = 0;
  let at = 0;
  for (const letter of body) {
    const value = BASE64.indexOf(letter);
    if (value === -1) return null;
    held = ((held << 6) | value) & 4095;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes[at++] = (held >> bits) & 255;
    }
  }
  if (bytes.length < 3) return null;
  const total = (bytes[0] << 8) | bytes[1];
  if (bytes.length !== 2 + Math.ceil((total * PIECE_BITS) / 8) + 1) return null;
  if (bytes.at(-1) !== checkByte(bytes, bytes.length - 1)) return null;
  const rows: number[][] = [];
  const world = new World();
  let bit = 16;
  for (let index = 0; index < total; index++) {
    const fields: number[] = [];
    for (const width of CODE_FIELDS) {
      let value = 0;
      for (let step = 0; step < width; step++, bit++)
        value = (value << 1) | ((bytes[bit >> 3] >> (7 - (bit & 7))) & 1);
      fields.push(value);
    }
    const [part, colour, x, z, y, turn] = fields;
    const row = [part, colour, x, y, z, turn];
    const spec = specFromRow(row);
    if (!spec || world.check(spec) !== 'ok') return null;
    world.add(spec);
    rows.push(row);
  }
  return rows;
}

// ------------------------------------------------------------------ instruction sets

export type SetId = 'rack' | 'spaceship' | 'factory' | 'superpod';

/** The four bags of the capstone set, in the order they are opened. */
export const STAGE_IDS = ['floor', 'racks', 'spine', 'cooling'] as const;
export type StageId = (typeof STAGE_IDS)[number];

export interface BuildStage {
  id: StageId;
  /** The first step of the stage. */
  from: number;
  /** Where the camera stands for this part of the build. */
  azimuth: number;
}

export interface BuildSet {
  id: SetId;
  /** Set number printed on the booklet. */
  number: string;
  steps: readonly PieceSpec[];
  /** A long set is built in stages, each on its own part of the baseplate. */
  stages?: readonly BuildStage[];
  /** Sets that have to be built once before this booklet opens. */
  needs?: readonly SetId[];
  /** The set is a rack: the studio shows what its trays and cooling add up to. */
  rack?: boolean;
}

/** Which stage a step belongs to, or -1 for a set without stages. */
export function stageAt(set: BuildSet, step: number): number {
  if (!set.stages) return -1;
  let at = 0;
  for (let index = 0; index < set.stages.length; index++)
    if (step >= set.stages[index].from) at = index;
  return at;
}

/** How many of the sets a booklet waits for are still unbuilt. */
export function setsMissing(set: BuildSet, progress: StudioProgress): number {
  return (set.needs ?? []).filter((id) => progress[id].built === 0).length;
}

interface Booklet {
  steps: PieceSpec[];
  put: (part: PartId, colour: ColourId, x: number, z: number, turn?: Turn) => Booklet;
}

/** Writes a set the way a builder would: name a part, a colour and a stud, and it is lowered on. */
function booklet(): Booklet {
  const world = new World();
  const pages: Booklet = {
    steps: [],
    put(part, colour, x, z, turn = 0) {
      const index = partIndex(part);
      const spec: PieceSpec = {
        part: index,
        colour: colourIndex(colour),
        x,
        y: world.restLayer(index, turn, x, z),
        z,
        turn,
      };
      // A step that could not be built is left out rather than shipped broken.
      if (world.check(spec) === 'ok') {
        world.add(spec);
        pages.steps.push(spec);
      }
      return pages;
    },
  };
  return pages;
}

/** A GB200 NVL72 rack: power shelves, compute trays, switch trays, with its cooling unit. */
function rackSteps(): PieceSpec[] {
  const b = booklet();
  const course = (part: PartId, colour: ColourId, across: boolean) => {
    if (across) b.put(part, colour, 5, 6).put(part, colour, 5, 8);
    else b.put(part, colour, 5, 6, 1).put(part, colour, 7, 6, 1);
  };
  course('plate-2x4', 'black', true);
  course('brick-2x4', 'dark', false);
  course('plate-2x4', 'green', true);
  course('plate-2x4', 'green', false);
  course('plate-2x4', 'green', true);
  course('plate-2x4', 'azure', false);
  course('plate-2x4', 'azure', true);
  course('plate-2x4', 'green', false);
  course('plate-2x4', 'green', true);
  course('plate-2x4', 'green', false);
  course('brick-2x4', 'dark', true);
  b.put('plate-4x4', 'black', 5, 6);
  b.put('gpu-2x2', 'green', 5, 6).put('gpu-2x2', 'green', 7, 6);
  b.put('gpu-2x2', 'green', 5, 8).put('gpu-2x2', 'green', 7, 8);
  // Raised floor in front, coolant lines to the side, then the cooling unit.
  b.put('tile-2x2', 'grey', 5, 10).put('tile-2x2', 'grey', 7, 10);
  b.put('tile-1x2', 'orange', 9, 7).put('tile-1x2', 'clear-blue', 9, 8);
  b.put('brick-2x2', 'white', 11, 7).put('brick-2x2', 'azure', 11, 7);
  b.put('brick-2x2', 'white', 11, 7).put('plate-2x2', 'grey', 11, 7);
  b.put('round-1x1', 'clear-blue', 11, 7).put('round-1x1', 'clear-blue', 12, 8);
  b.put('cone-1x1', 'grey', 12, 7);
  return b.steps;
}

/** A small take on Benny's spaceship: blue hull, grey wings, clear yellow canopy. Nose to +z. */
function spaceshipSteps(): PieceSpec[] {
  const b = booklet();
  // Landing gear, then the keel.
  b.put('plate-2x2', 'grey', 7, 3).put('plate-2x2', 'grey', 7, 7).put('plate-2x2', 'grey', 7, 11);
  b.put('plate-2x4', 'blue', 7, 2, 1).put('plate-2x4', 'blue', 7, 6, 1);
  b.put('plate-2x4', 'blue', 7, 10, 1);
  // Wings, joined across the keel.
  b.put('plate-4x4', 'grey', 4, 3).put('plate-4x4', 'grey', 8, 3);
  b.put('plate-2x4', 'grey', 7, 7, 1).put('plate-2x2', 'grey', 7, 11);
  // Hull.
  b.put('brick-2x4', 'blue', 7, 3, 1).put('brick-2x4', 'blue', 7, 7, 1);
  b.put('slope-2x2', 'blue', 7, 11, 0);
  b.put('stud-1x1', 'clear-yellow', 7, 13).put('stud-1x1', 'clear-yellow', 8, 13);
  // Swept wing tips with hazard stripes.
  b.put('plate-2x4', 'blue', 2, 4).put('plate-2x4', 'blue', 10, 4);
  b.put('brick-1x2', 'grey', 2, 4, 1).put('brick-1x2', 'grey', 13, 4, 1);
  b.put('tile-1x2', 'yellow', 4, 6).put('tile-1x2', 'yellow', 10, 6);
  // Cockpit.
  b.put('brick-2x2', 'blue', 7, 7).put('slope-2x2', 'clear-yellow', 7, 9, 0);
  // Engine deck and tail.
  b.put('plate-2x4', 'grey', 7, 3, 1);
  b.put('brick-1x2', 'blue', 7, 6);
  b.put('slope-1x2', 'blue', 7, 4, 2).put('slope-1x2', 'blue', 8, 4, 2);
  b.put('round-1x1', 'dark', 7, 3).put('round-1x1', 'dark', 8, 3);
  b.put('stud-1x1', 'clear-yellow', 7, 3).put('stud-1x1', 'clear-yellow', 8, 3);
  return b.steps;
}

/** A token factory: brick walls, a door, a sloped roof, a chimney, and tokens on the belt. */
function factorySteps(): PieceSpec[] {
  const b = booklet();
  // First course, with a gap for the door at the front.
  b.put('brick-1x4', 'white', 4, 5).put('brick-1x2', 'white', 8, 5);
  b.put('brick-1x2', 'white', 4, 6, 1).put('brick-1x2', 'white', 9, 6, 1);
  b.put('brick-1x2', 'white', 4, 8).put('brick-1x2', 'white', 8, 8);
  // Second course, joints staggered.
  b.put('brick-1x2', 'yellow', 4, 5).put('brick-1x4', 'yellow', 6, 5);
  b.put('brick-1x2', 'yellow', 4, 6, 1).put('brick-1x2', 'yellow', 9, 6, 1);
  b.put('brick-1x2', 'yellow', 4, 8).put('brick-1x2', 'yellow', 8, 8);
  // Ceiling slab, then the roof.
  b.put('plate-4x4', 'grey', 4, 5).put('plate-2x4', 'grey', 8, 5, 1);
  b.put('slope-2x2', 'red', 4, 7, 0).put('slope-2x2', 'red', 6, 7, 0);
  b.put('slope-2x2', 'red', 8, 7, 0);
  b.put('slope-2x2', 'red', 4, 5, 2).put('slope-2x2', 'red', 6, 5, 2);
  b.put('slope-2x2', 'red', 8, 5, 2);
  // Chimney and the sign on the ridge.
  b.put('round-1x1', 'dark', 4, 6).put('round-1x1', 'dark', 4, 6);
  b.put('stud-1x1', 'white', 4, 6);
  b.put('gpu-2x2', 'green', 7, 6);
  // Conveyor out of the door, with tokens on it and a crate at the end.
  b.put('plate-2x4', 'dark', 6, 9, 1);
  b.put('stud-1x1', 'clear-yellow', 6, 9).put('stud-1x1', 'clear-yellow', 7, 10);
  b.put('stud-1x1', 'clear-yellow', 6, 12);
  b.put('brick-2x2', 'orange', 6, 13);
  b.put('stud-1x1', 'clear-yellow', 6, 13).put('stud-1x1', 'clear-yellow', 7, 14);
  // The rack that feeds it.
  b.put('brick-2x2', 'black', 12, 6).put('gpu-2x2', 'green', 12, 6);
  b.put('tile-1x2', 'orange', 10, 6);
  return b.steps;
}

/**
 * The capstone: a liquid-cooled NVL72 superpod, in four stages. A raised floor with supply and
 * return manifolds, a row of three racks, the spine switch and cable trays across their tops,
 * then the cooling unit, and last the GPU tiles that bring the pod up.
 */
function superpodSet(): Pick<BuildSet, 'steps' | 'stages'> {
  const b = booklet();
  const from: number[] = [];
  const racks = [3, 7, 11];
  // Stage 1: raised floor, the pad for the cooling unit, coolant lines, walkway.
  from.push(b.steps.length);
  for (const x of [2, 6, 10]) b.put('plate-4x4', 'dark', x, 4);
  b.put('plate-4x4', 'grey', 10, 12);
  for (const x of [2, 6, 10]) b.put('plate-1x4', 'azure', x, 9);
  for (const x of [2, 6, 10]) b.put('plate-1x4', 'orange', x, 10);
  b.put('tile-2x2', 'grey', 2, 12).put('tile-2x2', 'grey', 6, 12);
  // Stage 2: three racks, each a power shelf and compute trays, twice over.
  from.push(b.steps.length);
  for (const x of racks) {
    b.put('brick-2x4', 'black', x, 4, 1);
    b.put('plate-2x4', 'green', x, 4, 1).put('plate-2x4', 'green', x, 4, 1);
    b.put('brick-2x4', 'dark', x, 4, 1);
    b.put('plate-2x4', 'green', x, 4, 1).put('plate-2x4', 'green', x, 4, 1);
  }
  // Stage 3: switch ports on every rack, cable trays from rack to rack, the spine on top.
  from.push(b.steps.length);
  for (const x of racks) b.put('plate-1x2', 'azure', x, 4).put('plate-1x2', 'azure', x, 7);
  b.put('plate-2x4', 'grey', 4, 5).put('plate-2x4', 'grey', 8, 5);
  b.put('brick-2x2', 'azure', 7, 5).put('plate-2x2', 'dark', 7, 5);
  b.put('stud-1x1', 'clear-yellow', 7, 5).put('stud-1x1', 'clear-yellow', 8, 6);
  b.put('tile-1x2', 'yellow', 5, 5).put('tile-1x2', 'yellow', 9, 6);
  // Stage 4: the cooling unit, its risers, and the GPU tiles that bring the pod up.
  from.push(b.steps.length);
  b.put('brick-2x4', 'white', 10, 12).put('brick-2x4', 'white', 10, 14);
  b.put('brick-2x4', 'azure', 10, 12).put('brick-2x4', 'azure', 10, 14);
  b.put('plate-4x4', 'white', 10, 12);
  b.put('stud-1x1', 'clear-blue', 10, 12).put('stud-1x1', 'clear-blue', 13, 12);
  b.put('stud-1x1', 'clear-blue', 10, 15).put('stud-1x1', 'clear-blue', 13, 15);
  b.put('cone-1x1', 'grey', 11, 13);
  b.put('round-1x1', 'azure', 13, 9).put('round-1x1', 'orange', 13, 10);
  // GPU tiles on every rack: the pod reads higher than the single rack of set 72001.
  b.put('gpu-2x2', 'green', 3, 4).put('gpu-2x2', 'green', 3, 6);
  b.put('gpu-2x2', 'green', 7, 5);
  b.put('gpu-2x2', 'green', 11, 4).put('gpu-2x2', 'green', 11, 6);
  b.put('stud-1x1', 'clear-yellow', 12, 14);
  // The camera walks round the pod: the floor from the front, the rack row from the left,
  // the spine from above the far side, the cooling unit from the right.
  const views = [0.35, -0.55, 2.6, 1.15];
  return {
    steps: b.steps,
    stages: STAGE_IDS.map((id, index) => ({ id, from: from[index], azimuth: views[index] })),
  };
}

let sets: readonly BuildSet[] | undefined;

export function buildSets(): readonly BuildSet[] {
  sets ??= [
    { id: 'rack', number: '72001', rack: true, steps: rackSteps() },
    { id: 'spaceship', number: '72002', steps: spaceshipSteps() },
    { id: 'factory', number: '72003', steps: factorySteps() },
    {
      id: 'superpod',
      number: '72004',
      rack: true,
      needs: ['rack', 'spaceship', 'factory'],
      ...superpodSet(),
    },
  ];
  return sets;
}

// ------------------------------------------------------------------ rack readout

/**
 * What the bricks on the baseplate add up to as a model rack. These are toy numbers for the
 * game, not benchmark results: every printed GPU tile is one compute tray, every clear blue
 * piece and every cone is one cooling piece.
 */
export interface RackStats {
  /** GPU tiles placed. */
  trays: number;
  /** Clear blue pieces and cones placed. */
  cooling: number;
  /** Trays the cooling keeps at full speed. */
  cooled: number;
  /** Tokens a second: cooled trays at full speed, the rest throttled. */
  tokS: number;
  /** Power draw in kilowatts: trays plus cooling. */
  kw: number;
}

export const RACK_RULES = {
  /** Tokens a second from one cooled tray. */
  trayTokS: 1000,
  /** A tray with no cooling left for it runs at this share of full speed. */
  hotShare: 0.4,
  trayKw: 6,
  coolingKw: 1,
  /** Trays one cooling piece keeps at full speed. */
  traysPerCooling: 2,
} as const;

const GPU_PART = PARTS.findIndex((part) => 'print' in part);
const CONE_PART = PARTS.findIndex((part) => part.kind === 'cone');
const COOLANT = COLOURS.findIndex((colour) => colour.id === 'clear-blue');

export function rackStats(pieces: Iterable<PieceSpec>): RackStats {
  let trays = 0;
  let cooling = 0;
  for (const piece of pieces) {
    if (piece.part === GPU_PART) trays += 1;
    else if (piece.part === CONE_PART || piece.colour === COOLANT) cooling += 1;
  }
  const rules = RACK_RULES;
  const cooled = Math.min(trays, cooling * rules.traysPerCooling);
  return {
    trays,
    cooling,
    cooled,
    tokS: Math.round((cooled + (trays - cooled) * rules.hotShare) * rules.trayTokS),
    kw: trays * rules.trayKw + cooling * rules.coolingKw,
  };
}

// ------------------------------------------------------------------ saves

/** Seconds as minutes and seconds, the way a stopwatch shows them. */
export function formatClock(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

const FREE_KEY = 'lego-studio-free';
const SETS_KEY = 'lego-studio-sets';

export interface SetProgress {
  /** Steps already built. */
  step: number;
  /** Times the set was finished. */
  built: number;
  /** Fastest finish in seconds, or 0. */
  best: number;
  /** Seconds spent on the build in progress. */
  seconds: number;
  /** Steps of this build already paid in studs; one past the last step once the bonus is paid. */
  paid: number;
}

export type StudioProgress = Record<SetId, SetProgress>;

const EMPTY: SetProgress = { step: 0, built: 0, best: 0, seconds: 0, paid: 0 };

/** Free Build keeps this many baseplates, each saved on its own. */
export const FREE_SLOTS = 3;
const freeKey = (slot: number) => (slot > 0 ? `${FREE_KEY}-${slot + 1}` : FREE_KEY);

export function readFreeBuild(slot = 0): unknown {
  try {
    return JSON.parse(localStorage.getItem(freeKey(slot)) ?? '[]') as unknown;
  } catch {
    return [];
  }
}

export function writeFreeBuild(rows: number[][], slot = 0): void {
  try {
    localStorage.setItem(freeKey(slot), JSON.stringify(rows));
  } catch {
    // Storage is full or blocked: the build lasts until the studio closes.
  }
}

/** A stored number as a whole count between 0 and `most`. */
function count(value: unknown, most: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? Math.min(most, Math.floor(value))
    : 0;
}

export function readProgress(): StudioProgress {
  const progress: StudioProgress = {
    rack: { ...EMPTY },
    spaceship: { ...EMPTY },
    factory: { ...EMPTY },
    superpod: { ...EMPTY },
  };
  try {
    const stored = JSON.parse(localStorage.getItem(SETS_KEY) ?? '{}') as Record<string, unknown>;
    for (const set of buildSets()) {
      const entry = stored[set.id] as Partial<SetProgress> | undefined;
      if (!entry || typeof entry !== 'object') continue;
      progress[set.id] = {
        step: count(entry.step, set.steps.length),
        built: count(entry.built, 9999),
        best: count(entry.best, 86_400),
        seconds: count(entry.seconds, 86_400),
        paid: count(entry.paid, set.steps.length + 1),
      };
    }
  } catch {
    // Unreadable save: start fresh.
  }
  return progress;
}

export function writeProgress(progress: StudioProgress): void {
  try {
    localStorage.setItem(SETS_KEY, JSON.stringify(progress));
  } catch {
    // Storage is full or blocked: progress lasts until the studio closes.
  }
}

export function clearStudioSaves(): void {
  try {
    for (let slot = 0; slot < FREE_SLOTS; slot++) localStorage.removeItem(freeKey(slot));
    localStorage.removeItem(SETS_KEY);
  } catch {
    // Nothing to clear.
  }
}
