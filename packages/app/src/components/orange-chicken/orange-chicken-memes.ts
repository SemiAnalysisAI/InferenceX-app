/**
 * The jokes of the Panda Express brief. Each one has its own trigger and its own visible payoff,
 * and the payoff quotes a number or a name that is on the page at that moment (the series count,
 * the point count, the model in the address bar, the batch on the plate card, the round-up count).
 * Found jokes are logged in the journal with the menu board lines. The egg chain runs across
 * three routes: a clue on Home, a step on the chart that stores one real data point, and the
 * payoff on About. Everything is read-only against the page; nothing here takes pointer input.
 */
import { playOcSfx } from './orange-chicken-audio';
import { discoverLine, emitOcEffect, getOcState, setMode } from './orange-chicken-store';

export const MEME_IDS = ['scoop', 'third', 'hot', 'wok', 'roast', 'bell', 'egg'] as const;
export type MemeId = (typeof MEME_IDS)[number];

export interface Bilingual {
  en: string;
  zh: string;
}

export interface MemeEntry {
  name: Bilingual;
  /** How to trigger it, for the journal index. */
  event: Bilingual;
  trigger: 'click' | 'typed word' | 'data state' | 'route';
}

export const MEMES: Record<MemeId, MemeEntry> = {
  scoop: {
    name: { en: 'The scoop: online versus in person', zh: '一勺：线上与现场' },
    event: { en: 'Scoop the plate card twice', zh: '在餐盘卡上连点两次“再来一勺”' },
    trigger: 'click',
  },
  third: {
    name: { en: 'About a third of every entrée', zh: '每份主菜约三分之一' },
    event: {
      en: 'Leave a chart with about a quarter of its series switched on',
      zh: '让图表只开着约四分之一的曲线，停几秒',
    },
    trigger: 'data state',
  },
  hot: {
    name: { en: 'Hot Orange Chicken is back', zh: '辣味陈皮鸡回归' },
    event: { en: 'Type “hot” anywhere on the page', zh: '在页面任意处输入 hot' },
    trigger: 'typed word',
  },
  wok: {
    name: { en: 'What goes in the wok', zh: '锅里放了什么' },
    event: { en: 'Type “wok” anywhere on the page', zh: '在页面任意处输入 wok' },
    trigger: 'typed word',
  },
  roast: {
    name: { en: 'Fortune Cookie Roasted Me', zh: '签语饼把我吐槽了' },
    event: { en: 'Crack the second fortune cookie', zh: '打开第二块签语饼' },
    trigger: 'click',
  },
  bell: {
    name: { en: 'The Panda Cares bell', zh: '熊猫关爱铃' },
    event: { en: 'Press Round up at the register', zh: '在收银台点“凑整”' },
    trigger: 'click',
  },
  egg: {
    name: { en: 'Order chit: Home, chart, About', zh: '订单小票：首页、图表、关于页' },
    event: { en: 'Follow the chit clue from Home', zh: '顺着首页的小票线索走' },
    trigger: 'route',
  },
};

const COOLDOWN_MS = 20_000;
const lastShown = new Map<string, number>();
const CHIT_STORE = 'orange-chicken-chit';

export interface PageFacts {
  model: string;
  /** Series switched on in the legend, and every series the legend lists. */
  series: number;
  total: number;
  /** Data points drawn on the plot. */
  points: number;
  leader: string;
  stars: number;
}

export function readFacts(): PageFacts {
  const facts: PageFacts = { model: '', series: 0, total: 0, points: 0, leader: '', stars: 0 };
  if (typeof document === 'undefined') return facts;
  const params = new URLSearchParams(window.location.search);
  facts.model = params.get('g_model')?.replaceAll(/[_-]/gu, ' ') ?? '';
  const legend = document.querySelector('[data-testid="chart-legend"]');
  if (legend) {
    const boxes = [...legend.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')];
    facts.total = boxes.length;
    facts.series = boxes.filter((box) => box.checked).length;
    const label = legend.querySelector('li label');
    facts.leader = (label?.getAttribute('title') || label?.textContent || '')
      .trim()
      .replaceAll(/\s+/gu, ' ');
  }
  for (const hit of document.querySelectorAll('path.dot-hit-area')) {
    facts.points += ((hit.getAttribute('d') ?? '').match(/a/gu) ?? []).length;
  }
  const star = document.body.textContent?.match(/Star\s+(?<n>[\d,]+)/u);
  if (star?.groups?.n) facts.stars = Number(star.groups.n.replaceAll(',', ''));
  return facts;
}

const pair = (en: string, zh: string): Bilingual => ({ en, zh });

/** The chart numbers as one phrase in both languages, or null when no chart is on the page. */
export function chartPhrase(facts: PageFacts): Bilingual | null {
  if (facts.total === 0) return null;
  const model = facts.model || 'this model';
  return pair(
    `${facts.series} of ${facts.total} series, ${facts.points} points, on ${model}`,
    `${facts.model || '这个模型'} 上 ${facts.series}/${facts.total} 条曲线、${facts.points} 个点`,
  );
}

/** Shows a joke once per 20 seconds. `sub` is the payoff sentence with the real number. */
export function emitMeme(id: MemeId, sub: Bilingual, sfx?: 'bell' | 'sizzle' | 'pop'): boolean {
  const now = performance.now();
  const before = lastShown.get(id);
  if (before !== undefined && now - before < COOLDOWN_MS) return false;
  lastShown.set(id, now);
  discoverLine(`meme-${id}`);
  if (sfx) playOcSfx(sfx);
  emitOcEffect({ type: 'meme', id, sub });
  return true;
}

export function resetMemeCooldowns() {
  lastShown.clear();
}

// Payoffs, so the effect layer and the triggers share one set of words.

export function scoopPayoff(batch: number, kv: number): Bilingual {
  const chart = chartPhrase(readFacts());
  return pair(
    `Online the plate stops at batch ${batch} and KV cache ${kv}%. In person the scoop is whatever the server decides.${chart ? ` This page: ${chart.en}.` : ''}`,
    `线上这盘停在批量 ${batch}、KV 缓存 ${kv}%；现场的一勺全看店员心情。${chart ? `本页：${chart.zh}。` : ''}`,
  );
}

export function hotPayoff(): Bilingual {
  const facts = readFacts();
  if (facts.total > 0) {
    return pair(
      `Hot Orange Chicken is back on the menu. ${facts.leader || 'The leader'} runs hot at the top of ${facts.series} series.`,
      `辣味陈皮鸡回来了。${facts.leader || '榜首'} 在 ${facts.series} 条曲线里领跑。`,
    );
  }
  const stars = facts.stars > 0 ? facts.stars.toLocaleString('en-US') : '';
  return pair(
    stars
      ? `Hot Orange Chicken is back on the menu. ${stars} stars say it was worth the wait.`
      : 'Hot Orange Chicken is back on the menu.',
    stars ? `辣味陈皮鸡回来了。${stars} 个星标说，等得值。` : '辣味陈皮鸡回来了。',
  );
}

export function wokPayoff(): Bilingual {
  const facts = readFacts();
  const chart = chartPhrase(facts);
  if (chart) return pair(`In the wok today: ${chart.en}.`, `今天下锅的：${chart.zh}。`);
  return pair(
    'In the wok today: whatever the charts hand over. Open a chart to see the count.',
    '今天下锅的：图表给什么就炒什么。打开图表看数量。',
  );
}

export function roastPayoff(): Bilingual {
  const facts = readFacts();
  const chart = chartPhrase(facts);
  return chart
    ? pair(`The cookie counted: ${chart.en}.`, `签语饼数过了：${chart.zh}。`)
    : pair('The cookie read the whole page and kept quiet.', '签语饼把整页看完，一声不吭。');
}

export function thirdPayoff(series: number, total: number): Bilingual {
  const pct = Math.round((series / total) * 100);
  return pair(
    `${series} of ${total} series are on the plate: ${pct}%. Orange chicken is about a third of every entrée sold.`,
    `${total} 条曲线里只开了 ${series} 条，占 ${pct}%。陈皮鸡约占每份主菜的三分之一。`,
  );
}

// The egg chain: clue on Home, a step on the chart, payoff on About.

export interface Chit {
  name: string;
  date: string;
  model: string;
  paid: boolean;
}

export function readChit(): Chit | null {
  try {
    const raw = window.localStorage.getItem(CHIT_STORE);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<Chit>;
    if (typeof parsed.name !== 'string' || typeof parsed.date !== 'string') return null;
    return {
      name: parsed.name,
      date: parsed.date,
      model: typeof parsed.model === 'string' ? parsed.model : '',
      paid: parsed.paid === true,
    };
  } catch {
    return null;
  }
}

function writeChit(chit: Chit) {
  try {
    window.localStorage.setItem(CHIT_STORE, JSON.stringify(chit));
  } catch {
    // Storage can be blocked; the chain just starts over next time.
  }
  window.dispatchEvent(new Event('oc-chit'));
}

/** The pinned point's own header: hardware, stack and the run date, read from the open panel. */
function readPinned(): { name: string; date: string } | null {
  for (const button of document.querySelectorAll('button[aria-label]')) {
    if (!/close|关闭/iu.test(button.getAttribute('aria-label') ?? '')) continue;
    const head = button.closest('.flex.items-start');
    const text = head?.textContent ?? '';
    const date = text.match(/\d{4}-\d{2}-\d{2}/u)?.[0];
    const name = head?.querySelector('p')?.textContent?.trim().replaceAll(/\s+/gu, ' ');
    if (date && name) return { name, date };
  }
  return null;
}

export function chitPayoffStep2(chit: Chit): Bilingual {
  const where = chit.model ? ` on ${chit.model}` : '';
  return pair(
    `Chit 2 of 3 stamped: ${chit.name}${where}, run of ${chit.date}. Take it to the About page.`,
    `小票 2/3 已盖章：${chit.name}${chit.model ? `（${chit.model}）` : ''}，${chit.date} 的运行。拿去关于页。`,
  );
}

export function chitPayoffStep3(chit: Chit): Bilingual {
  return pair(
    `Chit 3 of 3: order up. ${chit.name}${chit.model ? ` on ${chit.model}` : ''}, run of ${chit.date}, is on the line.`,
    `小票 3/3：出餐。${chit.name}${chit.model ? `（${chit.model}）` : ''}，${chit.date} 的运行，已上桌。`,
  );
}

/** Called on a route change: the About page pays the chit out once. */
export function payChitOnAbout(): boolean {
  const chit = readChit();
  if (!chit || chit.paid) return false;
  writeChit({ ...chit, paid: true });
  // Step 3 is its own beat: the step 2 stamp must not hold it back with the shared 20 s rest.
  lastShown.delete('egg');
  emitMeme('egg', chitPayoffStep3(chit), 'bell');
  return true;
}

export interface MemeHooks {
  /** Typed word "hot": a sub-palette switch plus a payoff. */
  dispose: () => void;
}

function typingTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable ||
      target.matches(
        'textarea, select, input:not([type="checkbox"], [type="radio"], [type="button"])',
      ))
  );
}

const thirdDone = () => getOcState().lines.includes('meme-third');

/** Page-wide listeners for the jokes that watch the page: the typed word, the pin and the share. */
export function mountChickenMemes(): MemeHooks {
  let typed = '';
  let thirdSeen = 0;
  // The one-third joke answers a change the visitor made, never the state the page loaded with.
  let baseline: { series: number; total: number } | null = null;
  let clicks = 0;

  const onKeyDown = (event: KeyboardEvent) => {
    if (
      !document.documentElement.classList.contains('orange-chicken') ||
      event.key.length !== 1 ||
      typingTarget(event.target) ||
      event.metaKey ||
      event.ctrlKey ||
      event.altKey
    )
      return;
    typed = (typed + event.key.toLowerCase()).slice(-3);
    if (typed === 'hot') {
      typed = '';
      setMode('chili');
      emitMeme('hot', hotPayoff(), 'sizzle');
    }
  };

  // Pinning a point on a chart stamps chit 2 with that point's own header.
  let pinTimer: number | undefined;
  const onClick = (event: MouseEvent) => {
    if (!(event.target instanceof Element)) return;
    clicks++;
    if (!event.target.closest('[data-testid="chart-figure"], figure, svg')) return;
    window.clearTimeout(pinTimer);
    pinTimer = window.setTimeout(() => {
      const pinned = readPinned();
      if (!pinned) return;
      const chit = readChit();
      if (chit?.paid) return;
      const next: Chit = { ...pinned, model: readFacts().model, paid: false };
      if (chit && chit.name === next.name && chit.date === next.date) return;
      writeChit(next);
      emitMeme('egg', chitPayoffStep2(next), 'pop');
    }, 700);
  };

  // A chart left with about a quarter of its series on the plate (data state, once).
  const poll = window.setInterval(() => {
    if (thirdDone() || document.hidden) return;
    if (!document.documentElement.classList.contains('orange-chicken')) return;
    const { series, total } = readFacts();
    const share = total > 0 ? series / total : 0;
    if (total === 0) return;
    if (!baseline || baseline.total !== total) {
      baseline = { series, total };
      clicks = 0;
      thirdSeen = 0;
      return;
    }
    if (total >= 6 && clicks > 0 && series !== baseline.series && share >= 0.15 && share <= 0.45)
      thirdSeen++;
    else thirdSeen = 0;
    if (thirdSeen >= 3) {
      emitMeme('third', thirdPayoff(series, total), 'bell');
    }
  }, 1500);

  document.addEventListener('keydown', onKeyDown);
  document.addEventListener('click', onClick, true);
  return {
    dispose() {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('click', onClick, true);
      window.clearInterval(poll);
      window.clearTimeout(pinTimer);
    },
  };
}
