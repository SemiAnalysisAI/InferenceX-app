'use client';

/**
 * Saved progress for "Kamaji's Boiler", the Ghibli theme's mini-game. This file is small on
 * purpose: the banner imports it for the reward badge, the game chunk imports it for everything
 * else. Everything lives under one localStorage key and survives blocked storage.
 */
import { useSyncExternalStore } from 'react';

export const BOILER_KEY = 'ghibli-boiler';
export const BOILER_EVENT = 'ghibli-boiler-change';

export const CHAPTER_IDS = [
  'boiler',
  'river',
  'bathhouse',
  'castle',
  'forest',
  'flood',
  'tower',
  'banquet',
] as const;
export type ChapterId = (typeof CHAPTER_IDS)[number];

export const UPGRADE_IDS = ['boiler', 'appetite', 'soot', 'tags', 'hearth', 'prefix'] as const;
export type UpgradeId = (typeof UPGRADE_IDS)[number];
export const UPGRADE_MAX = 3;

/** 0 none, 1 bronze, 2 silver, 3 gold. */
export type Medal = 0 | 1 | 2 | 3;

export interface SandboxSettings {
  batchCap: number;
  arrival: number;
  kvCap: number;
  mix: 'balanced' | 'fp4' | 'bf16' | 'longkv';
  autoDoor: boolean;
}

export const BLENDS = ['fp8', 'fp4', 'bf16'] as const;
export type Blend = (typeof BLENDS)[number];
export const HELPERS = ['none', 'lin', 'kamaji', 'turnip'] as const;
export type Helper = (typeof HELPERS)[number];

/** Chapter index whose medal unlocks each loadout choice. */
export const BLEND_UNLOCK: Record<Blend, number> = { fp8: -1, fp4: 0, bf16: 2 };
export const HELPER_UNLOCK: Record<Helper, number> = { none: -1, lin: 1, kamaji: 3, turnip: 5 };

export interface BoilerSave {
  medals: Partial<Record<ChapterId, Medal>>;
  /** Best goodput per chapter, tokens. */
  chapterBest: Partial<Record<ChapterId, number>>;
  upgrades: Partial<Record<UpgradeId, number>>;
  konpeito: number;
  endlessBest: number;
  endlessWave: number;
  peakThroughput: number;
  sandbox: SandboxSettings;
  /** The how-to page was seen once; later visits open on the menu. */
  seenHowTo: boolean;
  /** Bigger labels and door patterns for colour-blind players. */
  assist: boolean;
  blend: Blend;
  helper: Helper;
  /** Furthest station the sea-railway train has reached on the map. */
  station: number;
  /** Furthest No-Face phase reached in the banquet: the next banquet can resume there. */
  bossCheckpoint: number;
}

export const DEFAULT_SANDBOX: SandboxSettings = {
  batchCap: 32,
  arrival: 1,
  kvCap: 100,
  mix: 'balanced',
  autoDoor: true,
};

const EMPTY: BoilerSave = {
  medals: {},
  chapterBest: {},
  upgrades: {},
  konpeito: 0,
  endlessBest: 0,
  endlessWave: 0,
  peakThroughput: 0,
  sandbox: DEFAULT_SANDBOX,
  seenHowTo: false,
  assist: false,
  blend: 'fp8',
  helper: 'none',
  station: 0,
  bossCheckpoint: 0,
};

function clampInt(value: unknown, min: number, max: number): number {
  const number = typeof value === 'number' && Number.isFinite(value) ? Math.floor(value) : min;
  return Math.min(max, Math.max(min, number));
}

function parse(raw: string | null): BoilerSave {
  if (!raw) return EMPTY;
  try {
    const data = JSON.parse(raw) as Partial<BoilerSave>;
    const medals: BoilerSave['medals'] = {};
    const chapterBest: BoilerSave['chapterBest'] = {};
    for (const id of CHAPTER_IDS) {
      const medal = clampInt(data.medals?.[id], 0, 3) as Medal;
      if (medal) medals[id] = medal;
      const best = clampInt(data.chapterBest?.[id], 0, 1e9);
      if (best) chapterBest[id] = best;
    }
    const upgrades: BoilerSave['upgrades'] = {};
    for (const id of UPGRADE_IDS) {
      const level = clampInt(data.upgrades?.[id], 0, UPGRADE_MAX);
      if (level) upgrades[id] = level;
    }
    const sandbox = { ...DEFAULT_SANDBOX, ...data.sandbox };
    return {
      medals,
      chapterBest,
      upgrades,
      konpeito: clampInt(data.konpeito, 0, 1e6),
      endlessBest: clampInt(data.endlessBest, 0, 1e9),
      endlessWave: clampInt(data.endlessWave, 0, 1e4),
      peakThroughput: clampInt(data.peakThroughput, 0, 1e9),
      sandbox: {
        batchCap: clampInt(sandbox.batchCap, 1, 64),
        arrival: Math.min(3, Math.max(0.25, Number(sandbox.arrival) || 1)),
        kvCap: clampInt(sandbox.kvCap, 40, 200),
        mix: (['balanced', 'fp4', 'bf16', 'longkv'] as const).includes(sandbox.mix)
          ? sandbox.mix
          : 'balanced',
        autoDoor: sandbox.autoDoor !== false,
      },
      seenHowTo: data.seenHowTo === true,
      assist: data.assist === true,
      blend: BLENDS.includes(data.blend as Blend) ? (data.blend as Blend) : 'fp8',
      helper: HELPERS.includes(data.helper as Helper) ? (data.helper as Helper) : 'none',
      station: clampInt(data.station, 0, CHAPTER_IDS.length - 1),
      bossCheckpoint: clampInt(data.bossCheckpoint, 0, 3),
    };
  } catch {
    return EMPTY;
  }
}

let cachedRaw: string | null | undefined;
let cached: BoilerSave = EMPTY;

export function readBoiler(): BoilerSave {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(BOILER_KEY);
  } catch {}
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    cached = parse(raw);
  }
  return cached;
}

export function writeBoiler(update: (save: BoilerSave) => BoilerSave): BoilerSave {
  const next = update(readBoiler());
  try {
    localStorage.setItem(BOILER_KEY, JSON.stringify(next));
  } catch {
    // Blocked storage: progress lasts for this page view only.
    cachedRaw = JSON.stringify(next);
    cached = next;
  }
  window.dispatchEvent(new CustomEvent(BOILER_EVENT));
  return next;
}

function subscribe(callback: () => void) {
  window.addEventListener(BOILER_EVENT, callback);
  window.addEventListener('storage', callback);
  return () => {
    window.removeEventListener(BOILER_EVENT, callback);
    window.removeEventListener('storage', callback);
  };
}

export function useBoilerSave(): BoilerSave {
  return useSyncExternalStore(subscribe, readBoiler, () => EMPTY);
}

export function medalCount(save: BoilerSave): number {
  return CHAPTER_IDS.filter((id) => (save.medals[id] ?? 0) > 0).length;
}

export function goldCount(save: BoilerSave): number {
  return CHAPTER_IDS.filter((id) => save.medals[id] === 3).length;
}

/** Chapters open to play: the first, plus every chapter after one with a medal. */
export function chapterUnlocked(save: BoilerSave, index: number): boolean {
  if (index <= 0) return true;
  const previous = CHAPTER_IDS[index - 1];
  return (save.medals[previous] ?? 0) > 0;
}

export function unlockedByMedal(save: BoilerSave, chapterIndex: number): boolean {
  if (chapterIndex < 0) return true;
  return (save.medals[CHAPTER_IDS[chapterIndex]] ?? 0) > 0;
}

export function formatTokens(value: number, locale: 'en' | 'zh'): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  // zh keeps one unit (万) from a thousand up, so a goal and a result on one line read alike.
  if (locale === 'zh' && value >= 1000)
    return `${(value / 10_000).toFixed(value >= 10_000 ? 1 : 2)}万`;
  if (value >= 1000) return `${(value / 1000).toFixed(1)}k`;
  return String(Math.round(value));
}
