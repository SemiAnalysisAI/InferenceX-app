/** Valve radio table phrases, plus fan calls remixed onto inference terms. */

import { canvasPointLayerOf } from '@/lib/d3-chart/layers/canvas-point-registry';

export const CSGO_LINE_EVENT = 'csgo-line';

export const CSGO_LINES = [
  { id: 'spotted', en: 'Enemy spotted.', zh: '发现敌人。' },
  { id: 'go', en: 'Go go go!', zh: '冲冲冲！' },
  { id: 'backup', en: 'Need backup.', zh: '需要支援。' },
  { id: 'fallback', en: 'Team, fall back!', zh: '全体，撤退！' },
  { id: 'hold', en: 'Hold This Position.', zh: '守住这个位置。' },
  { id: 'follow', en: 'Follow Me.', zh: '跟我来。' },
  { id: 'roger', en: 'Roger that.', zh: '收到。' },
  { id: 'clear', en: 'Sector clear.', zh: '区域安全。' },
  { id: 'position', en: "I'm in position.", zh: '我已就位。' },
  { id: 'nice', en: 'Nice!', zh: '漂亮！' },
  {
    id: 'coldzera',
    en: 'Coldzera. Jumping the frontier, not the axis.',
    zh: '冷神。跳的是前沿，不是坐标轴。',
  },
] as const;

export type CsgoLineId = (typeof CSGO_LINES)[number]['id'];

export const CSGO_MEMES = [
  {
    id: 'rushb',
    label: 'Rush B',
    en: 'Rush B. Batch site. Do not stop.',
    zh: 'Rush B。批处理点。别停。',
  },
  {
    id: 'shots',
    label: 'Shots 1-5',
    en: 'Shots 1-5: clearly missed. The batch never landed.',
    zh: '第 1–5 枪：明显打空。这一批没有落地。',
  },
  {
    id: 'door',
    label: 'DOOR STUCK',
    en: 'DOOR STUCK. Mid doors. KV will not open.',
    zh: 'DOOR STUCK。中路门。KV 开不了。',
  },
  {
    id: 'sideways',
    label: 'Sideways',
    en: 'Admin, he is doing it sideways. The batch is the strafe.',
    zh: '管理员，他在横着走。批处理就是这下平移。',
  },
  {
    id: 'ez',
    label: 'EZ4ENCE',
    en: 'EZ4ENCE. The chant, not the scoreboard.',
    zh: 'EZ4ENCE。是口号，不是计分板。',
  },
  {
    id: 'iwnl',
    label: 'IWNL',
    en: 'IWNL. Hold the p99. Do not drop the round.',
    zh: 'IWNL。守住 p99。这一回合别丢。',
  },
  {
    id: 'fnatic',
    label: 'Fnatic',
    en: 'Fnatic manager here. Please delete this outlier.',
    zh: 'Fnatic 经理来了。请删掉这个离群点。',
  },
  {
    id: 'redraw',
    label: 'Dust redraw',
    en: 'Dust II redraw. B tunnels, fan geometry.',
    zh: '沙城重画。B 通道，粉丝几何。',
  },
] as const;

export const CSGO_MAPS = [
  {
    id: 'Dust II',
    en: 'Dust II. Long, mid doors, B tunnels.',
    zh: '炙热沙城 II。长廊、中路门、B 通道。',
  },
  { id: 'Mirage', en: 'Mirage. Connector, window, palace.', zh: '荒漠迷城。连接、窗户、包点楼。' },
  { id: 'Inferno', en: 'Inferno. Banana, apartments, pit.', zh: '炼狱小镇。香蕉道、公寓、坑。' },
  { id: 'Nuke', en: 'Nuke. Outside, ramp, heaven.', zh: '核子危机。外场、斜坡、天堂。' },
  {
    id: 'Overpass',
    en: 'Overpass. Monster, connector, long.',
    zh: '死亡游乐园。水管、连接、长廊。',
  },
] as const;

export function lineText(id: string, locale: string): string {
  const row = CSGO_LINES.find((line) => line.id === id);
  if (!row) return '';
  return locale === 'zh' ? row.zh : row.en;
}

type LoosePoint = { x?: number; y?: number } & Record<string, unknown>;

function asNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function formatNum(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 100) return Math.round(value).toLocaleString('en-US');
  if (abs >= 10) return value.toFixed(1);
  return value.toPrecision(3);
}

function axisText(selector: string): string {
  if (typeof document === 'undefined') return '';
  return document.querySelector(selector)?.textContent?.replaceAll(/\s+/g, ' ').trim() ?? '';
}

function lowerBetter(label: string): boolean {
  return /cost|latency|ttft|joule|time to|seconds|\(s\)|\bms\b/i.test(label);
}

function better(left: number, right: number, low: boolean): boolean {
  return low ? left <= right : left >= right;
}

function stricter(left: number, right: number, low: boolean): boolean {
  return low ? left < right : left > right;
}

function chartPoints(): LoosePoint[] {
  if (typeof document === 'undefined') return [];
  const svg = document.querySelector('[data-testid="d3-chart-svg"]');
  const data = svg instanceof Element ? canvasPointLayerOf(svg)?.data : undefined;
  if (!data) return [];
  return data.filter(
    (row) => asNumber(row.x) !== null && asNumber(row.y) !== null,
  ) as unknown as LoosePoint[];
}

function nameOf(point: LoosePoint): string {
  const hw = point.hw;
  return typeof hw === 'string' && hw ? hw : 'point';
}

/** A live chart number for a meme payoff. Empty when the point layer has no points. */
export function chartMemeNote(id: string): string {
  const points = chartPoints();
  if (points.length === 0) return '';
  const yLabel = axisText('.y-axis-label');
  const xLabel = axisText('.x-axis-label');
  const yLow = lowerBetter(yLabel);
  const xLow = lowerBetter(xLabel);
  let below = 0;
  for (const point of points) {
    const x = point.x ?? 0;
    const y = point.y ?? 0;
    const dominated = points.some((other) => {
      if (other === point) return false;
      const ox = other.x ?? 0;
      const oy = other.y ?? 0;
      return (
        better(ox, x, xLow) &&
        better(oy, y, yLow) &&
        (stricter(ox, x, xLow) || stricter(oy, y, yLow))
      );
    });
    if (dominated) below += 1;
  }
  const concs = points
    .map((point) => asNumber(point.conc))
    .filter((value): value is number => value !== null);
  const maxConc = concs.length > 0 ? Math.max(...concs) : null;
  const tputKey = points.some((point) => asNumber(point.tput_per_gpu) !== null)
    ? 'tput_per_gpu'
    : 'output_tput_per_gpu';
  let leader = points[0];
  let leaderTput = leader ? asNumber(leader[tputKey]) : null;
  for (const point of points) {
    const tput = asNumber(point[tputKey]);
    if (tput !== null && (leaderTput === null || tput > leaderTput)) {
      leader = point;
      leaderTput = tput;
    }
  }
  let lowest = points[0];
  for (const point of points) {
    const y = point.y ?? 0;
    const current = lowest?.y ?? 0;
    if (yLow ? y > current : y < current) lowest = point;
  }
  const p99s = points
    .map((point) => asNumber(point.p99_ttft))
    .filter((value): value is number => value !== null && value > 0);
  const ttfts = points
    .map((point) => asNumber(point.median_ttft))
    .filter((value): value is number => value !== null && value > 0);
  const worstP99 = p99s.length > 0 ? Math.max(...p99s) : null;
  const worstTtft = ttfts.length > 0 ? Math.max(...ttfts) : null;
  if (id === 'rushb' && maxConc !== null) {
    const conc = formatNum(maxConc);
    return `Concurrency ${conc}. 并发 ${conc}。`;
  }
  if (id === 'shots') {
    return `${below} points below the frontier. 前沿之下 ${below} 个点。`;
  }
  if (id === 'sideways' && leader && leaderTput !== null) {
    const who = nameOf(leader);
    const tput = formatNum(leaderTput);
    return `Leader ${who} ${tput} tok/s/GPU. 领先 ${who} ${tput} tok/s/GPU。`;
  }
  if (id === 'fnatic' && lowest) {
    const who = nameOf(lowest);
    const y = formatNum(lowest.y ?? 0);
    const metric = yLabel || 'y';
    return `Lowest ${who} ${y} (${metric}). 最低点 ${who} ${y}。`;
  }
  if (id === 'iwnl' && worstP99 !== null) {
    const ttft = formatNum(worstP99);
    return `Worst p99 TTFT ${ttft}s. 最差 p99 TTFT ${ttft}s。`;
  }
  if (id === 'iwnl' && worstTtft !== null) {
    const ttft = formatNum(worstTtft);
    return `Worst TTFT ${ttft}s. 最差 TTFT ${ttft}s。`;
  }
  if (id === 'ez') {
    return `${points.length} points plotted. 图上 ${points.length} 个点。`;
  }
  return '';
}

export function pairText(id: string): { en: string; zh: string } | null {
  const row = CSGO_LINES.find((line) => line.id === id);
  if (!row) return null;
  return { en: row.en, zh: row.zh };
}

const lastCue = new Map<string, number>();

export function emitCsgoLine(id: CsgoLineId) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(CSGO_LINE_EVENT, { detail: id }));
}

/** Event captions, not the radio picker. Each line at most once per 20s. */
export function cueCsgoLine(id: CsgoLineId) {
  const now = Date.now();
  if (now - (lastCue.get(id) ?? 0) < 20000) return;
  lastCue.set(id, now);
  emitCsgoLine(id);
}
