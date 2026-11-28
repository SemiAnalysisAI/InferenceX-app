/**
 * Preferences, secrets and game progress for the Orange Chicken theme. A small external store:
 * the header toggles, the banner and the game all read the same snapshot, and everything is
 * persisted in localStorage (with in-memory fallbacks when storage is blocked).
 */

export type OcMode = 'glaze' | 'jade' | 'chili' | 'night';
export const MODES: readonly OcMode[] = ['glaze', 'jade', 'chili', 'night'];

export const SECRET_IDS = [
  'wok',
  'konami',
  'sesame',
  'fortune',
  'seal',
  'bell',
  'idle',
  'chef',
  'boss',
  'box',
] as const;
export type SecretId = (typeof SECRET_IDS)[number];

export const TROPHY_IDS = ['prep', 'wok', 'courier', 'chef', 'golden'] as const;
export type TrophyId = (typeof TROPHY_IDS)[number];

export type GameModeId = 'campaign' | 'endless' | 'sandbox' | 'challenge';

export interface OcSave {
  v: 1;
  /** Orders served across every mode: the number on the banner and in the header. */
  orders: number;
  /** Highest act cleared in the campaign, 0 to 5. */
  cleared: number;
  /** Stars (0 to 3) per act. */
  stars: number[];
  bestEndless: number;
  bestChallenge: number;
  trophies: TrophyId[];
  /** Permanent upgrades bought with tips, by id. */
  upgrades: Record<string, number>;
  tips: number;
  lastLoadout: { precision: string; batch: number };
}

export interface OcState {
  sound: boolean;
  music: boolean;
  mode: OcMode;
  found: SecretId[];
  /** Menu board lines shown so far (ids from orange-chicken-lines). */
  lines: string[];
  save: OcSave;
}

export type OcEffect =
  | { type: 'wok' }
  | { type: 'rain' }
  | { type: 'sesame' }
  | { type: 'fortune' }
  | { type: 'seal' }
  | { type: 'bell' }
  | { type: 'idle' }
  | { type: 'journal' }
  | { type: 'line'; id: string; sub?: { en: string; zh: string } }
  | { type: 'meme'; id: string; sub: { en: string; zh: string } }
  | { type: 'toast'; text: string; tone?: 'fortune' | 'plain' | 'slip' };

const PREF = {
  sound: 'orange-chicken-sound',
  music: 'orange-chicken-music',
  mode: 'orange-chicken-mode',
  secrets: 'orange-chicken-secrets',
  lines: 'orange-chicken-lines',
  save: 'orange-chicken-save',
} as const;

const num = (value: unknown, fallback = 0) =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : fallback;

export function emptySave(): OcSave {
  return {
    v: 1,
    orders: 0,
    cleared: 0,
    stars: [0, 0, 0, 0, 0],
    bestEndless: 0,
    bestChallenge: 0,
    trophies: [],
    upgrades: {},
    tips: 0,
    lastLoadout: { precision: 'FP8', batch: 8 },
  };
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
    // Storage may be blocked; the in-memory state still changes.
  }
}

function parseSave(raw: string | null): OcSave {
  const base = emptySave();
  if (!raw) return base;
  try {
    const data = JSON.parse(raw) as Partial<OcSave>;
    return {
      v: 1,
      orders: Math.floor(num(data.orders)),
      cleared: Math.min(5, Math.floor(num(data.cleared))),
      stars: base.stars.map((_, index) => Math.min(3, Math.floor(num(data.stars?.[index])))),
      bestEndless: Math.floor(num(data.bestEndless)),
      bestChallenge: Math.floor(num(data.bestChallenge)),
      trophies: (Array.isArray(data.trophies) ? data.trophies : []).filter((id): id is TrophyId =>
        (TROPHY_IDS as readonly string[]).includes(id),
      ),
      upgrades:
        data.upgrades && typeof data.upgrades === 'object'
          ? Object.fromEntries(
              Object.entries(data.upgrades).map(([key, value]) => [
                key,
                Math.min(5, Math.floor(num(value))),
              ]),
            )
          : {},
      tips: Math.floor(num(data.tips)),
      lastLoadout: {
        precision: ['FP4', 'FP8', 'BF16'].includes(data.lastLoadout?.precision ?? '')
          ? (data.lastLoadout?.precision as string)
          : 'FP8',
        batch: [1, 2, 4, 8, 16, 32, 64].includes(data.lastLoadout?.batch ?? 0)
          ? (data.lastLoadout?.batch as number)
          : 8,
      },
    };
  } catch {
    return base;
  }
}

function readState(): OcState {
  const mode = read(PREF.mode) as OcMode | null;
  let found: SecretId[] = [];
  try {
    const parsed = JSON.parse(read(PREF.secrets) ?? '[]') as unknown;
    if (Array.isArray(parsed)) {
      found = parsed.filter((id): id is SecretId => (SECRET_IDS as readonly string[]).includes(id));
    }
  } catch {
    found = [];
  }
  let lines: string[] = [];
  try {
    const parsed = JSON.parse(read(PREF.lines) ?? '[]') as unknown;
    if (Array.isArray(parsed)) lines = parsed.filter((id): id is string => typeof id === 'string');
  } catch {
    lines = [];
  }
  return {
    sound: read(PREF.sound) !== 'false',
    music: read(PREF.music) === 'true',
    mode: mode && MODES.includes(mode) ? mode : 'glaze',
    found,
    lines,
    save: parseSave(read(PREF.save)),
  };
}

const SERVER_STATE: OcState = {
  sound: true,
  music: false,
  mode: 'glaze',
  found: [],
  lines: [],
  save: emptySave(),
};

let state: OcState = SERVER_STATE;
let loaded = false;
const listeners = new Set<() => void>();
const effectListeners = new Set<(effect: OcEffect) => void>();

function ensureLoaded() {
  if (loaded || typeof window === 'undefined') return;
  loaded = true;
  state = readState();
}

function commit(next: OcState) {
  state = next;
  for (const listener of listeners) listener();
}

export function getOcState(): OcState {
  ensureLoaded();
  return state;
}

export function getServerOcState(): OcState {
  return SERVER_STATE;
}

export function subscribeOc(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Re-read storage after another tab or the other header copy changed something. */
export function syncOcPreferences() {
  loaded = true;
  commit(readState());
}

export function setSoundEnabled(sound: boolean) {
  ensureLoaded();
  write(PREF.sound, String(sound));
  commit({ ...state, sound });
}

export function setMusicEnabled(music: boolean) {
  ensureLoaded();
  write(PREF.music, String(music));
  commit({ ...state, music });
}

export function setMode(mode: OcMode) {
  ensureLoaded();
  write(PREF.mode, mode);
  commit({ ...state, mode });
}

/** Returns true the first time a secret is found. */
export function discoverSecret(id: SecretId): boolean {
  ensureLoaded();
  if (state.found.includes(id)) return false;
  const found = [...state.found, id];
  write(PREF.secrets, JSON.stringify(found));
  commit({ ...state, found });
  return true;
}

/** Logs a menu board line the first time it is shown. */
export function discoverLine(id: string): boolean {
  ensureLoaded();
  if (state.lines.includes(id)) return false;
  const lines = [...state.lines, id];
  write(PREF.lines, JSON.stringify(lines));
  commit({ ...state, lines });
  return true;
}

export function readSave(): OcSave {
  ensureLoaded();
  return state.save;
}

/** Saves game progress and refreshes the banner and the header counter. */
export function writeSave(save: OcSave) {
  ensureLoaded();
  write(PREF.save, JSON.stringify(save));
  commit({ ...state, save });
}

export function resetSave() {
  writeSave(emptySave());
}

export function emitOcEffect(effect: OcEffect) {
  for (const listener of effectListeners) listener(effect);
}

export function subscribeOcEffects(listener: (effect: OcEffect) => void): () => void {
  effectListeners.add(listener);
  return () => effectListeners.delete(listener);
}

export function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches)
  );
}

/** The persisted "calm" switch: the game and the scene slow down even without the OS setting. */
export function calmEnabled(): boolean {
  return prefersReducedMotion() || read('orange-chicken-calm') === 'true';
}

export function setCalm(calm: boolean) {
  write('orange-chicken-calm', String(calm));
  document.documentElement.toggleAttribute('data-oc-still', calm);
}
