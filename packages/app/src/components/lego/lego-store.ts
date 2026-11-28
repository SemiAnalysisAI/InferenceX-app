/**
 * Shared state for the LEGO theme: the stud counter, discovered secrets, and the sound and
 * music preferences. Lives in the lazy theme chunk only; nothing here runs for other themes.
 */

export type StudTier = 'silver' | 'gold' | 'blue' | 'purple';

export const STUD_VALUES: Record<StudTier, number> = {
  silver: 10,
  gold: 100,
  blue: 1000,
  purple: 10_000,
};

/** Studs needed to fill the meter, in the spirit of the LEGO video games. */
export const TRUE_BUILDER_GOAL = 100_000;

export const FIND_IDS = [
  'konami',
  'awesome',
  'spaceship',
  'kragle',
  'pants',
  'toy',
  'logo',
  'idle',
  'footbrick',
  'separator',
  'shatter',
  'minifig',
  'game',
  'builder',
  'city',
  'yoda',
  'sus',
  'batman',
] as const;
export type SecretId = (typeof FIND_IDS)[number];

/** Secrets that need a keyboard; the set instructions offer a button for them on phones. */
export const TAPPABLE_SECRETS: readonly SecretId[] = [
  'konami',
  'awesome',
  'spaceship',
  'kragle',
  'pants',
  'toy',
  'city',
  'yoda',
  'sus',
];

/**
 * The minifigure (or set, or part) each secret adds to the collection. Cutouts live in
 * public/decorative/lego/img; `height` is 176 unless given.
 */
export const SECRET_FIGURES: Record<SecretId, { file: string; width: number; height?: number }> = {
  konami: { file: 'badcop.webp', width: 108 },
  awesome: { file: 'emmet.webp', width: 105 },
  spaceship: { file: 'benny.webp', width: 107 },
  kragle: { file: 'business.webp', width: 104 },
  pants: { file: 'pantsguy.webp', width: 101 },
  toy: { file: 'spaceman.webp', width: 104 },
  logo: { file: 'gail.webp', width: 106 },
  idle: { file: 'pajamas.webp', width: 107 },
  footbrick: { file: 'angrykitty.webp', width: 94 },
  separator: { file: 'builder.webp', width: 105 },
  shatter: { file: 'wyldstyle.webp', width: 104 },
  minifig: { file: 'unikitty.webp', width: 163 },
  game: { file: 'foreman.webp', width: 105 },
  builder: { file: 'vitruvius.webp', width: 156 },
  city: { file: 'rescue-helicopter.webp', width: 420, height: 269 },
  yoda: { file: 'yoda.webp', width: 137 },
  sus: { file: 'piece-26047.webp', width: 180, height: 125 },
  batman: { file: 'batman.webp', width: 147 },
};

/** The table the page sits on. Classic is the green baseplate. */
export const MAT_IDS = ['classic', 'space', 'blueprint'] as const;
export type MatId = (typeof MAT_IDS)[number];

/** Film and brand lines, each bound to one thing that happens on the page. */
export const LINE_IDS = [
  'firstTry',
  'pants',
  'spaceship',
  'best',
  'black',
  'batman',
  'prophecy',
  'awesome',
  'couch',
  'city',
] as const;
export type LineId = (typeof LINE_IDS)[number];

export interface LegoState {
  studs: number;
  found: readonly SecretId[];
  /** Lines heard so far, for the index in the set instructions. */
  lines: readonly LineId[];
  sound: boolean;
  music: boolean;
  mat: MatId;
  /** Instruction booklets finished in Brick Studio, out of `BOOKLETS`. */
  sets: number;
  /** The brick separator tool is in hand. Not persisted. */
  separator: boolean;
  /** Nobody has touched the page for a while. Not persisted. */
  sleeping: boolean;
}

export interface StudAward {
  amount: number;
  tier: StudTier;
  x?: number;
  y?: number;
}

const STUDS_KEY = 'lego-studs';
const FOUND_KEY = 'lego-found';
const LINES_SLOT = 'lego-lines';
const SOUND_KEY = 'lego-sound';
const MUSIC_KEY = 'lego-music';
const MAT_KEY = 'lego-mat';
/** Written by Brick Studio, which is not loaded here: only the tally is read. */
const SETS_KEY = 'lego-studio-sets';
const BOOKLET_IDS = ['rack', 'spaceship', 'factory', 'superpod'];
export const BOOKLETS = BOOKLET_IDS.length;

function readSetsBuilt(): number {
  try {
    const saved = JSON.parse(read(SETS_KEY) ?? '{}') as Record<string, { built?: unknown }> | null;
    if (!saved || typeof saved !== 'object') return 0;
    return BOOKLET_IDS.filter((id) => {
      const built = saved[id]?.built;
      return typeof built === 'number' && built > 0;
    }).length;
  } catch {
    return 0;
  }
}

function readLines(): LineId[] {
  try {
    const parsed: unknown = JSON.parse(read(LINES_SLOT) ?? '[]');
    return Array.isArray(parsed) ? LINE_IDS.filter((id) => parsed.includes(id)) : [];
  } catch {
    return [];
  }
}

function readMat(): MatId {
  const saved = read(MAT_KEY);
  return MAT_IDS.find((id) => id === saved) ?? 'classic';
}

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Private mode or blocked storage: the counter still works for this page view.
  }
}

function load(): LegoState {
  const studs = Number(read(STUDS_KEY));
  let found: SecretId[] = [];
  try {
    const parsed: unknown = JSON.parse(read(FOUND_KEY) ?? '[]');
    if (Array.isArray(parsed)) {
      found = FIND_IDS.filter((id) => parsed.includes(id));
    }
  } catch {
    found = [];
  }
  return {
    studs: Number.isFinite(studs) && studs > 0 ? Math.floor(studs) : 0,
    found,
    sound: read(SOUND_KEY) !== 'false',
    music: read(MUSIC_KEY) !== 'false',
    mat: readMat(),
    lines: readLines(),
    sets: readSetsBuilt(),
    separator: false,
    sleeping: false,
  };
}

const SERVER_STATE: LegoState = {
  studs: 0,
  found: [],
  sound: true,
  music: true,
  mat: 'classic',
  lines: [],
  sets: 0,
  separator: false,
  sleeping: false,
};
let state: LegoState = SERVER_STATE;
let loaded = false;
const listeners = new Set<() => void>();
const awardListeners = new Set<(award: StudAward) => void>();

function ensureLoaded() {
  if (loaded || typeof window === 'undefined') return;
  loaded = true;
  state = load();
}

function set(next: LegoState) {
  state = next;
  for (const listener of listeners) listener();
}

export function getLegoState(): LegoState {
  ensureLoaded();
  return state;
}

export function getServerLegoState(): LegoState {
  return SERVER_STATE;
}

export function subscribeLego(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function onStudAward(listener: (award: StudAward) => void): () => void {
  awardListeners.add(listener);
  return () => awardListeners.delete(listener);
}

export function tierFor(amount: number): StudTier {
  if (amount >= STUD_VALUES.purple) return 'purple';
  if (amount >= STUD_VALUES.blue) return 'blue';
  if (amount >= STUD_VALUES.gold) return 'gold';
  return 'silver';
}

/** Adds studs and tells the scene where they came from so it can fly a stud to the counter. */
export function addStuds(amount: number, origin?: { x: number; y: number }): void {
  ensureLoaded();
  if (!(amount > 0)) return;
  const studs = state.studs + Math.floor(amount);
  write(STUDS_KEY, String(studs));
  set({ ...state, studs });
  const award: StudAward = { amount, tier: tierFor(amount), x: origin?.x, y: origin?.y };
  for (const listener of awardListeners) listener(award);
}

/** Records a secret. Returns true the first time it is found. */
export function discover(id: SecretId): boolean {
  ensureLoaded();
  if (state.found.includes(id)) return false;
  const found = [...state.found, id];
  write(FOUND_KEY, JSON.stringify(found));
  set({ ...state, found });
  return true;
}

/** Adds a line to the index. */
export function noteLine(id: LineId): void {
  ensureLoaded();
  if (state.lines.includes(id)) return;
  const lines = [...state.lines, id];
  write(LINES_SLOT, JSON.stringify(lines));
  set({ ...state, lines });
}

export function resetLegoProgress(): void {
  ensureLoaded();
  write(STUDS_KEY, '0');
  write(FOUND_KEY, '[]');
  write(LINES_SLOT, '[]');
  set({ ...state, studs: 0, found: [], lines: [] });
}

export function setSoundEnabled(enabled: boolean): void {
  ensureLoaded();
  write(SOUND_KEY, String(enabled));
  set({ ...state, sound: enabled });
  window.dispatchEvent(new CustomEvent('lego-sound-toggle'));
}

export function setMusicEnabled(enabled: boolean): void {
  ensureLoaded();
  write(MUSIC_KEY, String(enabled));
  set({ ...state, music: enabled });
  window.dispatchEvent(new CustomEvent('lego-music-toggle'));
}

export function setMat(mat: MatId): void {
  ensureLoaded();
  if (state.mat === mat) return;
  write(MAT_KEY, mat);
  set({ ...state, mat });
}

/** Brick Studio has closed: pick up any booklet finished in it. */
export function syncBuiltSets(): void {
  ensureLoaded();
  const sets = readSetsBuilt();
  if (sets !== state.sets) set({ ...state, sets });
}

export function setSeparatorActive(separator: boolean): void {
  ensureLoaded();
  if (state.separator !== separator) set({ ...state, separator });
}

export function setSleeping(sleeping: boolean): void {
  ensureLoaded();
  if (state.sleeping !== sleeping) set({ ...state, sleeping });
}

/** Clears the per-visit flags when the theme unmounts. */
export function resetLegoSession(): void {
  if (loaded) set({ ...state, separator: false, sleeping: false });
}

/** Re-reads the two preferences after another tab or component changed them. */
export function syncLegoPreferences(): void {
  ensureLoaded();
  const sound = read(SOUND_KEY) !== 'false';
  const music = read(MUSIC_KEY) !== 'false';
  const mat = readMat();
  if (sound !== state.sound || music !== state.music || mat !== state.mat)
    set({ ...state, sound, music, mat });
}

export function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true
  );
}

// ---------------------------------------------------------------- effects bus
// Easter eggs and sounds run outside React; the scene component listens here to draw them.

export type CrewId = 'emmet' | 'benny' | 'wyldstyle' | 'unikitty' | 'builder';
export type CameoId = 'business' | 'badcop' | 'vitruvius' | 'yoda' | 'batman' | 'sus' | 'glue';

export type LegoEffect =
  /** `ms` holds a long line on screen for longer than the default. */
  | {
      type: 'toast';
      text: string;
      tone?: 'shout' | 'note';
      topic?: string;
      ms?: number;
      /** Shown next, ahead of anything waiting. */
      rush?: boolean;
    }
  | { type: 'spaceship' }
  /** The LEGO City rescue helicopter flies to the lowest point of a chart in view. */
  /** `seek` scrolls to a chart first when none is in view (the tap alternative, used on phones). */
  | { type: 'rescue'; seek?: boolean; riff?: string }
  | { type: 'stud-rain' }
  | { type: 'crew-hop' }
  | { type: 'crew-busy'; ms: number }
  | { type: 'cameo'; who: CameoId }
  | { type: 'burst'; x: number; y: number }
  /** Loose bricks tumble down inside this viewport rectangle. */
  /** `holeLeft` to `holeRight` is the stock message: nothing falls across it. */
  | {
      type: 'rubble';
      left: number;
      top: number;
      width: number;
      height: number;
      holeLeft?: number;
      holeRight?: number;
    }
  /** Open the set instructions (the secrets journal and minifigure collection). */
  | { type: 'journal' }
  /** Ask the runtime to run a secret, for the tap alternatives in the set instructions. */
  | { type: 'egg'; id: SecretId };

const effectListeners = new Set<(effect: LegoEffect) => void>();

export function onLegoEffect(listener: (effect: LegoEffect) => void): () => void {
  effectListeners.add(listener);
  return () => effectListeners.delete(listener);
}

export function emitLegoEffect(effect: LegoEffect): void {
  for (const listener of effectListeners) listener(effect);
}
