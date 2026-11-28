import type { Clip } from './radio';

export const COUNTY_LINES = {
  kenny: ['Oh my God, they killed Kenny!', '天哪，他们杀了肯尼！', 'kenny'],
  home: ['Screw you guys, I’m going home!', '去你们的，我回家了！', 'home'],
  badge: ['Respect my authoritah!', '尊重我的权威！', 'authority'],
  scale: ['I’m not fat, I’m big-boned!', '我不是胖，我是骨架大！', 'fat'],
  okay: ['M’Kay', '好咩？', null],
  jobs: ['They took our jobs!', '他们抢走了我们的工作！', 'jobs'],
  towel: ["Don't forget to bring a towel", '别忘了带毛巾', null],
  toll: ['I need about treefiddy.', '我大概需要三块五。', null],
  foul: ["Oh, I'm sorry, I thought this was America", '噢，对不起，我还以为这里是美国呢。', null],
  lesson: ['You know, I’ve learned something today...', '你知道吗，我今天学到了点东西……', null],
} as const satisfies Record<string, readonly [string, string, Clip | null]>;
export type CountyLine = keyof typeof COUNTY_LINES;
export const LINE_FILE = 'south-park-field-lines';
const heardAt = new Map<CountyLine, number>();
export function recordLine(id: CountyLine) {
  const now = Date.now();
  if (now - (heardAt.get(id) ?? 0) < 20000) return false;
  heardAt.set(id, now);
  const found = new Set(readLines());
  if (!found.has(id)) {
    found.add(id);
    try {
      localStorage.setItem(LINE_FILE, JSON.stringify([...found]));
    } catch {}
  }
  return true;
}
export function readLines(): CountyLine[] {
  try {
    const list: unknown = JSON.parse(localStorage.getItem(LINE_FILE) ?? '[]');
    return Array.isArray(list)
      ? list.filter((s): s is CountyLine => Object.hasOwn(COUNTY_LINES, s))
      : [];
  } catch {
    return [];
  }
}
