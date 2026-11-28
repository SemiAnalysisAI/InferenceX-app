/**
 * Shared state for the GTA theme outside the 3D game: the character sub-palette, the sound and
 * radio preferences, the cash counter, the wanted level and the cheats that have been found.
 * Everything persists in localStorage under `gta-*` keys and is read with useSyncExternalStore.
 */

export const CHARACTERS = ['franklin', 'michael', 'trevor'] as const;
export type GtaCharacter = (typeof CHARACTERS)[number];

/** `theme` and `welcome` loop the two theme recordings; the other three are step-sequenced. */
export const STATIONS = ['theme', 'welcome', 'lossantos', 'nonstop', 'blaine'] as const;
export type GtaStation = (typeof STATIONS)[number];

export const WEATHERS = ['clear', 'rain', 'smog'] as const;
export type GtaWeather = (typeof WEATHERS)[number];

/** Secrets listed in the phone, in the order they are shown. */
export const FIND_IDS = [
  'activate',
  'switch',
  'radio',
  'fugitive',
  'lawyerup',
  'makeitrain',
  'slowmo',
  'liquor',
  'buzzoff',
  'skyfall',
  'konami',
  'export',
  'frontier',
  'busted',
  'heist',
  'wordmark',
  'train',
  'order',
  'herewego',
  'hesoyam',
  'respray',
] as const;
export type SecretId = (typeof FIND_IDS)[number];

export interface HeistRecord {
  /** Heists finished in the 3D game. */
  passed: number;
  /** Fastest finished heist in seconds, or 0 when none. */
  best: number;
  /** Largest take from one heist. */
  take: number;
}

export interface GtaState {
  character: GtaCharacter;
  station: GtaStation;
  weather: GtaWeather;
  sound: boolean;
  music: boolean;
  cash: number;
  wanted: number;
  found: SecretId[];
  heist: HeistRecord;
}

/** Quoted lines that play as a subtitled cutscene strip. */
export const LINE_IDS = [
  'hereWeGo',
  'grove',
  'train',
  'order',
  'wrongHouse',
  'forget',
  'yeeyee',
  'surviving',
  'weather',
  'crib',
  'kifflom',
  'hipster',
  'dark',
] as const;
export type LineId = (typeof LINE_IDS)[number];

/** Pictures under `/decorative/gta/art/` a cutscene strip or a feed entry can show. */
export type GtaArt =
  | 'cj-alley'
  | 'grove-street'
  | 'big-smoke'
  | 'michael-face'
  | 'franklin-face'
  | 'trevor-face'
  | 'lamar-face';

export type GtaEffect =
  | { type: 'phone' }
  | { type: 'overlay'; kind: 'passed' | 'busted' | 'wasted'; sub?: string }
  | { type: 'chopper' }
  | { type: 'scene'; line: LineId }
  | { type: 'zone'; name: string; id?: string }
  | { type: 'feed'; title: string; body: string; tone?: 'cash' | 'wanted' | 'info'; art?: GtaArt };

const KEYS = {
  character: 'gta-character',
  station: 'gta-station',
  sound: 'gta-sound',
  music: 'gta-music',
  cash: 'gta-cash',
  found: 'gta-found',
  heist: 'gta-heist-record',
} as const;

export const HEIST_RECORD_KEY = KEYS.heist;
export const HEIST_RECORD_EVENT = 'gta-heist-record';
export const MAX_WANTED = 5;

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
    // Storage may be blocked; the in-memory state still changes for this page view.
  }
}

function pick<T extends string>(options: readonly T[], value: string | null, fallback: T): T {
  return options.find((option) => option === value) ?? fallback;
}

const number = (value: unknown) =>
  typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0;

function readHeist(): HeistRecord {
  try {
    const parsed = JSON.parse(read(KEYS.heist) ?? '{}') as Partial<HeistRecord>;
    return {
      passed: Math.floor(number(parsed.passed)),
      best: number(parsed.best),
      take: Math.floor(number(parsed.take)),
    };
  } catch {
    return { passed: 0, best: 0, take: 0 };
  }
}

function load(): GtaState {
  const cash = Number(read(KEYS.cash));
  let found: SecretId[] = [];
  try {
    const parsed: unknown = JSON.parse(read(KEYS.found) ?? '[]');
    if (Array.isArray(parsed)) found = FIND_IDS.filter((id) => parsed.includes(id));
  } catch {
    found = [];
  }
  return {
    character: pick(CHARACTERS, read(KEYS.character), 'franklin'),
    station: pick(STATIONS, read(KEYS.station), 'theme'),
    weather: 'clear',
    sound: read(KEYS.sound) !== 'false',
    music: read(KEYS.music) !== 'false',
    cash: Number.isFinite(cash) && cash > 0 ? Math.floor(cash) : 0,
    wanted: 0,
    found,
    heist: readHeist(),
  };
}

const SERVER_STATE: GtaState = {
  character: 'franklin',
  station: 'theme',
  weather: 'clear',
  sound: true,
  music: true,
  cash: 0,
  wanted: 0,
  found: [],
  heist: { passed: 0, best: 0, take: 0 },
};

let state: GtaState | null = null;
const listeners = new Set<() => void>();
const effectListeners = new Set<(effect: GtaEffect) => void>();

export function getGtaState(): GtaState {
  state ??= load();
  return state;
}

export function getServerGtaState(): GtaState {
  return SERVER_STATE;
}

export function subscribeGta(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function update(patch: Partial<GtaState>) {
  state = { ...getGtaState(), ...patch };
  for (const listener of listeners) listener();
}

export function onGtaEffect(listener: (effect: GtaEffect) => void): () => void {
  effectListeners.add(listener);
  return () => {
    effectListeners.delete(listener);
  };
}

export function emitGtaEffect(effect: GtaEffect) {
  for (const listener of effectListeners) listener(effect);
}

export function setCharacter(character: GtaCharacter) {
  write(KEYS.character, character);
  update({ character });
}

export function setStation(station: GtaStation) {
  write(KEYS.station, station);
  update({ station });
}

export function setWeather(weather: GtaWeather) {
  update({ weather });
}

export function setSoundEnabled(sound: boolean) {
  write(KEYS.sound, String(sound));
  update({ sound });
  window.dispatchEvent(new CustomEvent('gta-sound-toggle'));
}

export function setMusicEnabled(music: boolean) {
  write(KEYS.music, String(music));
  update({ music });
  window.dispatchEvent(new CustomEvent('gta-music-toggle'));
}

/** Re-read the two media preferences: another tab or the other header copy may have changed them. */
export function syncGtaPreferences() {
  const current = getGtaState();
  const sound = read(KEYS.sound) !== 'false';
  const music = read(KEYS.music) !== 'false';
  if (sound !== current.sound || music !== current.music) update({ sound, music });
}

export function addCash(amount: number) {
  const cash = Math.max(0, Math.min(999_999_999, getGtaState().cash + Math.round(amount)));
  write(KEYS.cash, String(cash));
  update({ cash });
}

export function setWanted(wanted: number) {
  const next = Math.max(0, Math.min(MAX_WANTED, Math.round(wanted)));
  if (next !== getGtaState().wanted) update({ wanted: next });
}

/** Marks a secret as found. Returns true the first time. */
export function findSecret(id: SecretId): boolean {
  const current = getGtaState();
  if (current.found.includes(id)) return false;
  const found = FIND_IDS.filter((secret) => secret === id || current.found.includes(secret));
  write(KEYS.found, JSON.stringify(found));
  update({ found });
  return true;
}

/** Picks up a heist the 3D game has just written to localStorage. */
export function syncHeistRecord(): HeistRecord {
  const heist = readHeist();
  const current = getGtaState().heist;
  if (heist.passed !== current.passed || heist.best !== current.best || heist.take !== current.take)
    update({ heist });
  return heist;
}

/** Called by the 3D game when a heist is passed; safe to call without the site theme mounted. */
export function recordHeist(seconds: number, take: number): HeistRecord {
  const previous = readHeist();
  const next: HeistRecord = {
    passed: previous.passed + 1,
    best: previous.best > 0 ? Math.min(previous.best, seconds) : seconds,
    take: Math.max(previous.take, Math.floor(take)),
  };
  write(KEYS.heist, JSON.stringify(next));
  window.dispatchEvent(new CustomEvent(HEIST_RECORD_EVENT, { detail: { seconds, take } }));
  return next;
}

export function resetGtaSession() {
  state = null;
}

export function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

/** Rank shown in the phone and on the banner, from the cash on hand. */
export function rankIndex(cash: number): number {
  const steps = [0, 5_000, 50_000, 250_000, 1_000_000, 10_000_000];
  let rank = 0;
  for (let index = 0; index < steps.length; index++) if (cash >= steps[index]) rank = index;
  return rank;
}
