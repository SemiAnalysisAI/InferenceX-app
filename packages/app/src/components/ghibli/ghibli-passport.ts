/**
 * The film passport: eight stamps, one per moment found on the site. Stamps persist in
 * localStorage. The banner shows the passport, and each stamp's still joins the film strip in
 * the chart card's header, so what a visitor has found changes what the site shows.
 */

import { useSyncExternalStore } from 'react';

export const STAMPS = [
  'castle',
  'balse',
  'lofi',
  'kodama',
  'ponyo',
  'haku',
  'heron',
  'boiler',
] as const;
export type Stamp = (typeof STAMPS)[number];

/** The official still each stamp carries (public/decorative/ghibli/stills). */
export const STAMP_STILLS: Record<Stamp, string> = {
  castle: 'still-howl048',
  balse: 'still-laputa024',
  lofi: 'still-mimi037',
  kodama: 'still-mononoke025',
  ponyo: 'still-ponyo035',
  haku: 'still-chihiro016',
  heron: 'still-kimitachi044',
  boiler: 'still-chihiro043',
};

export const PASSPORT_KEY = 'ghibli-passport';
const PASSPORT_EVENT = 'ghibli-passport';
const EMPTY: readonly Stamp[] = [];

let cachedRaw: string | null | undefined;
let cached: readonly Stamp[] = EMPTY;

/** Stamps in the order they were earned. */
export function readPassport(): readonly Stamp[] {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(PASSPORT_KEY);
  } catch {}
  if (raw === cachedRaw) return cached;
  cachedRaw = raw;
  try {
    const data: unknown = raw ? JSON.parse(raw) : [];
    const list = Array.isArray(data) ? data : [];
    cached = STAMPS.filter((id) => list.includes(id)).toSorted(
      (a, b) => list.indexOf(a) - list.indexOf(b),
    );
  } catch {
    cached = EMPTY;
  }
  return cached;
}

/** Adds a stamp; returns true when it is new. */
export function stampPassport(id: Stamp): boolean {
  const current = readPassport();
  if (current.includes(id)) return false;
  const next = [...current, id];
  try {
    localStorage.setItem(PASSPORT_KEY, JSON.stringify(next));
  } catch {
    cachedRaw = JSON.stringify(next);
    cached = next;
  }
  window.dispatchEvent(new CustomEvent(PASSPORT_EVENT));
  return true;
}

export function onPassport(callback: () => void): () => void {
  window.addEventListener(PASSPORT_EVENT, callback);
  window.addEventListener('storage', callback);
  return () => {
    window.removeEventListener(PASSPORT_EVENT, callback);
    window.removeEventListener('storage', callback);
  };
}

export function usePassport(): readonly Stamp[] {
  return useSyncExternalStore(onPassport, readPassport, () => EMPTY);
}

/** The film lines a visitor has heard, in the order heard: the index the passport shows. */
export const LINES = [
  'haku',
  'job',
  'bacon',
  'heart',
  'howl',
  'ashitaka',
  'live',
  'ham',
  'ponyo',
  'kiriko',
] as const;
export type Line = (typeof LINES)[number];
const LINES_KEY = 'ghibli-lines';
let linesRaw: string | null | undefined;
let linesCached: readonly Line[] = [];

export function readLines(): readonly Line[] {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(LINES_KEY);
  } catch {}
  if (raw === linesRaw) return linesCached;
  linesRaw = raw;
  try {
    const data: unknown = raw ? JSON.parse(raw) : [];
    const list = Array.isArray(data) ? data : [];
    linesCached = LINES.filter((id) => list.includes(id));
  } catch {
    linesCached = [];
  }
  return linesCached;
}

/** Records a line as heard; any other quote key is ignored. */
export function hearLine(id: string): void {
  if (!(LINES as readonly string[]).includes(id)) return;
  const current = readLines();
  if (current.includes(id as Line)) return;
  try {
    localStorage.setItem(LINES_KEY, JSON.stringify([...current, id]));
  } catch {}
  window.dispatchEvent(new CustomEvent(PASSPORT_EVENT));
}

export function useLines(): readonly Line[] {
  return useSyncExternalStore(onPassport, readLines, () => EMPTY_LINES);
}
const EMPTY_LINES: readonly Line[] = [];

/** The Sea Railway ticket: three punches across three pages, kept for this visit only. */
const TICKET_KEY = 'ghibli-ticket';

export function readTicket(): number {
  try {
    return Math.min(3, Math.max(0, Number(sessionStorage.getItem(TICKET_KEY)) || 0));
  } catch {
    return 0;
  }
}

/** Punches the ticket to `step` if it is the next punch; returns true when it was. */
export function punchTicket(step: number): boolean {
  if (readTicket() !== step - 1) return false;
  try {
    sessionStorage.setItem(TICKET_KEY, String(step));
  } catch {
    return false;
  }
  window.dispatchEvent(new CustomEvent(PASSPORT_EVENT));
  return true;
}

export function useTicket(): number {
  return useSyncExternalStore(onPassport, readTicket, () => 0);
}
