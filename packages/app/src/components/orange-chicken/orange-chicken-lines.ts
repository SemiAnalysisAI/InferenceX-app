/**
 * The ten lines of the Panda Express brief, each bound to the one event it fits. A line shows as a
 * short caption (the toast lane, never over a control, the plot or the legend), at most once per
 * 20 seconds, and is logged in the journal's "Menu board" index. The wording is the brief's.
 * Chinese: the established in-store words where there are any, otherwise a plain translation with
 * the English original kept next to it.
 */
import { discoverLine, emitOcEffect } from './orange-chicken-store';

export const LINE_IDS = [
  'kitchen',
  'original',
  'bowl',
  'plate',
  'bigger',
  'family',
  'wokon',
  'better',
  'fortune',
  'roundup',
] as const;
export type LineId = (typeof LINE_IDS)[number];

export interface LineEntry {
  /** Exactly as the brief words it. */
  en: string;
  zh: string;
  /** The event that fires it, for the journal index. */
  event: { en: string; zh: string };
  /** A short voice clip that already exists in the assets, played with the caption. */
  sfx?: 'bell' | 'sizzle';
}

export const LINES: Record<LineId, LineEntry> = {
  kitchen: {
    en: 'Panda Express Chinese Kitchen',
    zh: '熊猫快餐 中式厨房',
    event: { en: 'Press the roundel', zh: '点按红色标志' },
  },
  original: {
    en: 'The Original Orange Chicken®',
    zh: '原味陈皮鸡®',
    event: { en: 'Pick The Original palette', zh: '选择“原味”配色' },
  },
  bowl: {
    en: 'Bowl',
    zh: '碗装',
    event: { en: 'Pick Bowl on the plate card', zh: '在餐盘卡选“碗装”' },
  },
  plate: {
    en: 'Plate',
    zh: '盘装',
    event: { en: 'Pick Plate on the plate card', zh: '在餐盘卡选“盘装”' },
  },
  bigger: {
    en: 'Bigger Plate',
    zh: '大盘装',
    event: { en: 'Pick Bigger Plate on the plate card', zh: '在餐盘卡选“大盘装”' },
  },
  family: {
    en: 'Family Meal',
    zh: '家庭套餐',
    event: { en: 'Reset the legend filter', zh: '重置图例筛选' },
  },
  wokon: {
    en: 'Wok On',
    zh: '继续开火',
    event: {
      en: 'Open the Wok Kitchen, or filter to no results',
      zh: '打开炒锅厨房，或筛选后没有结果',
    },
    sfx: 'sizzle',
  },
  better: {
    en: 'no best, only better',
    zh: '没有最好，只有更好',
    event: { en: 'The leader of a chart changes', zh: '图表的领先者换人' },
  },
  fortune: {
    en: 'sharing good fortune and giving',
    zh: '分享好运，乐于给予',
    event: { en: 'Export a chart as a PNG', zh: '把图表导出为 PNG' },
  },
  roundup: {
    en: 'Would you like to round up for Panda Cares?',
    zh: '要为“熊猫关怀”凑个整吗？',
    event: { en: 'Ring the Panda Cares bell', zh: '按下“熊猫关怀”铃' },
    sfx: 'bell',
  },
};

const COOLDOWN_MS = 20_000;
const lastShown = new Map<LineId, number>();

/** Shows a line for the event that just happened. `sub` is one short sentence about what happened. */
export function emitLine(id: LineId, sub?: { en: string; zh: string }): boolean {
  const now = performance.now();
  const before = lastShown.get(id);
  if (before !== undefined && now - before < COOLDOWN_MS) return false;
  lastShown.set(id, now);
  discoverLine(id);
  emitOcEffect({ type: 'line', id, sub });
  return true;
}

export function resetLineCooldowns() {
  lastShown.clear();
}
