/**
 * Minecraft site runtime: advancements with toasts, dimension sub-palettes, interface sounds for
 * the chart creeper and toasts, and typed easter eggs. Loaded only inside the lazy theme chunk;
 * `mountMinecraftSite` returns a teardown that removes every node, listener, timer and attribute.
 */

import { mountMinecraftCharts } from './minecraft-charts';

export type Locale = 'en' | 'zh';
export type Dimension = 'overworld' | 'nether' | 'end';

export const DIMENSIONS: readonly Dimension[] = ['overworld', 'nether', 'end'];
export const DIMENSION_KEY = 'minecraft-dimension';
export const ADVANCEMENTS_KEY = 'minecraft-advancements';
export const ADVANCEMENT_EVENT = 'minecraft-advancement';
export const DIMENSION_EVENT = 'minecraft-dimension-change';
const GRANT_EVENT = 'minecraft-grant';
/** React code (the banner mobs) asks the runtime to say a line through this event. */
export const LINE_EVENT = 'minecraft-line';

const SITE = '/decorative/minecraft/site/';
const SOUNDS = '/decorative/minecraft/game/sounds/';
const IP = '/decorative/minecraft/ip/';
const IP_AUDIO = `${IP}audio/`;

interface Advancement {
  icon: string;
  kind?: 'challenge';
  en: [title: string, description: string];
  zh: [title: string, description: string];
}

export const ADVANCEMENTS = {
  place: {
    icon: 'grass-side',
    en: ['Minecraft', 'Load a chart and watch it get placed'],
    zh: ['我的世界', '加载一张图表，看它被放置出来'],
  },
  tooltip: {
    icon: 'diamond-ore',
    en: ['Eye Spy', 'Inspect a data point'],
    zh: ['隔墙有眼', '查看一个数据点'],
  },
  export: {
    icon: 'crafting-table',
    en: ['Getting an Upgrade', 'Export a chart as a PNG'],
    zh: ['获得升级', '将图表导出为 PNG'],
  },
  creeper: {
    icon: 'tnt-side',
    en: ['Monster Hunter', 'Make the chart creeper go off'],
    zh: ['怪物猎人', '让图表上的苦力怕爆炸'],
  },
  nether: {
    icon: 'netherrack',
    en: ['We Need to Go Deeper', 'Enter the Nether palette'],
    zh: ['勇往直下', '进入下界配色'],
  },
  end: {
    icon: `${IP}ender-pearl.webp`,
    en: ['The End?', 'Enter the End palette'],
    zh: ['结束了？', '进入末地配色'],
  },
  game: {
    icon: 'oak-planks',
    en: ['Stone Age', 'Open the game from the banner'],
    zh: ['石器时代', '从横幅打开游戏'],
  },
  language: {
    icon: 'bookshelf',
    en: ['Hello, World', 'Switch the site language'],
    zh: ['你好，世界', '切换网站语言'],
  },
  konami: {
    icon: 'diamond-block',
    kind: 'challenge',
    en: ['Cover Me with Diamonds', 'Enter the old cheat code'],
    zh: ['钻石护体', '输入古老的秘籍'],
  },
  diamonds: {
    icon: `${IP}diamond.webp`,
    en: ['Diamonds!', 'Find the top of the Pareto frontier'],
    zh: ['钻石！', '找到帕累托前沿的最高点'],
  },
  respawn: {
    icon: `${IP}totem.webp`,
    kind: 'challenge',
    en: ['Postmortal', 'Respawn from a page that does not exist'],
    zh: ['超越生死', '从不存在的页面重生'],
  },
  herobrine: {
    icon: `${IP}herobrine.webp`,
    kind: 'challenge',
    en: ['Removed Herobrine', 'Follow his eyes, his name and his last page'],
    zh: ['移除了 Herobrine', '跟着他的眼睛、他的名字和他最后的页面'],
  },
  aw_man: {
    icon: 'creeper-face',
    kind: 'challenge',
    en: ['Aw Man', 'Type the word that summons a creeper'],
    zh: ['完了', '打出召唤苦力怕的那个词'],
  },
} satisfies Record<string, Advancement>;

export type AdvancementId = keyof typeof ADVANCEMENTS;
export const ADVANCEMENT_COUNT = Object.keys(ADVANCEMENTS).length;

const HEAD = {
  en: { normal: 'Advancement Made!', challenge: 'Challenge Complete!' },
  zh: { normal: '进度已达成！', challenge: '挑战已完成！' },
};

/**
 * Lines the game itself shows (action bar, death screen, chat), in the game's own en_us and
 * zh_cn wording, plus film and community lines remixed with benchmark context. `%s` is filled in.
 */
export const LINES = {
  notSafe: {
    en: 'You may not rest now; there are monsters nearby',
    zh: '你现在不能休息，周围有怪物在游荡',
  },
  noSleep: {
    en: 'You can sleep only at night or during thunderstorms',
    zh: '你只能在夜间或雷暴中入眠',
  },
  nowPlaying: { en: 'Now Playing: %s', zh: '正在播放：%s' },
  screenshot: { en: 'Saved screenshot as %s', zh: '已将截图保存为%s' },
  blownUp: { en: 'Steve was blown up by Creeper', zh: 'Steve被苦力怕炸死了' },
  awMan: {
    en: 'Creeper? Aw man. So we back in the mine, swinging from %s.',
    zh: '苦力怕？完了。我们又回到矿里，镐子从 %s 来回挥。',
  },
  crater: {
    en: 'The blast hit %s blocks on this chart. Every one of them is still there.',
    zh: '爆炸波及了这张图上的 %s 个方块，它们一个都没少。',
  },
  terraria: { en: 'Also try Terraria!', zh: '也试试泰拉瑞亚吧！（Also try Terraria!）' },
  awwMan: { en: 'Aww man!', zh: '完了！（Aww man!）' },
  exploding: { en: 'Exploding creepers!', zh: '爆炸的苦力怕！（Exploding creepers!）' },
  jeb: { en: 'Made by Jeb!', zh: 'Jeb 制作！（Made by Jeb!）' },
  ground: { en: 'Steve hit the ground too hard', zh: 'Steve落地过猛' },
  lava: { en: 'Steve tried to swim in lava', zh: 'Steve试图在熔岩里游泳' },
  stole: {
    en: 'You looked it in the eyes. The Enderman took the %s block.',
    zh: '你和它对视了。末影人拿走了 %s 这个方块。',
  },
  clueEyes: {
    en: 'Two white eyes in the dark. Type his name on a chart page.',
    zh: '黑暗里有两只白眼睛。在图表页面上打出他的名字。',
  },
  clueGone: {
    en: 'Removed Herobrine. He left for a page that does not exist.',
    zh: '移除了 Herobrine。他去了一个不存在的页面。',
  },
  slain: { en: 'Steve was slain by Herobrine', zh: 'Steve被Herobrine杀死了' },
  portal: {
    en: 'Flint and steel! The Nether. Series colors stay the same.',
    zh: '打火石！下界。数据系列颜色保持不变。',
  },
  steve: {
    en: 'I am Steve. As a child, I yearned for the GPUs.',
    zh: '我是 Steve。（I am Steve.）小时候，我向往 GPU。',
  },
  villager: {
    en: 'Hmm. Throughput or interactivity? A fair trade sits on the frontier.',
    zh: '嗯……吞吐还是交互性？公平的交易在前沿上。',
  },
  jockey: {
    en: 'Chicken jockey! Concurrency %s riding one deployment.',
    zh: '鸡骑士！（Chicken jockey!）并发 %s 骑在同一个部署上。',
  },
  dig: {
    en: 'Never dig straight down. Below %s on this axis there is only bedrock.',
    zh: '永远不要垂直向下挖。这条轴上 %s 以下只有基岩。',
  },
  herobrine: { en: 'Removed Herobrine', zh: '移除了 Herobrine' },
  punch: {
    en: 'Punching trees gives me wood. First chart placed: %s blocks.',
    zh: '徒手撸树得木头。第一张图表已放置：%s 个方块。',
  },
  badRespawn: {
    en: 'Steve was killed by [Intentional Game Design]',
    zh: 'Steve被[刻意的游戏设计]杀死了',
  },
  poemOpen: {
    en: 'I see the player you mean.',
    zh: '我看见你说的那个玩家了。（I see the player you mean.）',
  },
  poemClose: {
    en: 'and the universe said I love you',
    zh: '然后宇宙说，我爱你（and the universe said I love you）',
  },
  enderman: {
    en: 'You looked it in the eyes. It teleports like a p99 TTFT spike.',
    zh: '你和它对视了。它像 p99 首令牌延迟尖峰一样瞬移了。',
  },
} satisfies Record<string, { en: string; zh: string }>;

export type LineId = keyof typeof LINES;

/** Item icons shown before a line in the action bar. */
const LINE_ICONS: Partial<Record<LineId, string>> = {
  portal: 'flint-and-steel',
  dig: 'diamond-pickaxe',
  ground: 'water-bucket',
  stole: 'enderman',
  slain: 'herobrine',
  clueGone: 'herobrine',
};

/** The brief's lines in the order the banner's index lists them. */
export const LINE_INDEX = [
  'terraria',
  'awwMan',
  'exploding',
  'jeb',
  'lava',
  'blownUp',
  'ground',
  'poemOpen',
  'poemClose',
  'steve',
  'jockey',
] as const satisfies readonly LineId[];
export const LINES_HEARD_KEY = 'minecraft-lines';
export const LINES_EVENT = 'minecraft-lines-heard';
const CHAIN_KEY = 'minecraft-herobrine';

export function readLinesHeard(): Set<string> {
  try {
    const list = JSON.parse(localStorage.getItem(LINES_HEARD_KEY) ?? '[]') as unknown;
    return new Set(Array.isArray(list) ? list.filter((v) => typeof v === 'string') : []);
  } catch {
    return new Set();
  }
}

function hearLine(id: string) {
  if (!(LINE_INDEX as readonly string[]).includes(id)) return;
  const heard = readLinesHeard();
  if (heard.has(id)) return;
  heard.add(id);
  try {
    localStorage.setItem(LINES_HEARD_KEY, JSON.stringify([...heard]));
  } catch {}
  window.dispatchEvent(new CustomEvent(LINES_EVENT));
}

/** Egg chain stage for this tab: 1 eyes seen, 2 Herobrine removed, 3 slain on a 404. */
function chainStage(): number {
  try {
    return Number(sessionStorage.getItem(CHAIN_KEY)) || 0;
  } catch {
    return 0;
  }
}
function setChainStage(stage: number) {
  try {
    sessionStorage.setItem(CHAIN_KEY, String(stage));
  } catch {}
}

/** First and last tick labels of a chart axis, e.g. "120" and "4,800". */
function axisEnds(svg: SVGSVGElement | null, axis: 'x' | 'y'): [string, string] | null {
  const ticks = [...(svg?.querySelectorAll(`g.${axis}-axis .tick text`) ?? [])]
    .map((node) => node.textContent?.trim() ?? '')
    .filter(Boolean);
  if (ticks.length < 2) return null;
  return [ticks[0], ticks.at(-1) ?? ''];
}

/** Points the chart's canvas layer holds, or the SVG point count. */
function pointCount(svg: SVGSVGElement): number {
  const layer = svg.querySelector<SVGElement & { scatterPoints?: () => unknown[] }>(
    '[data-points-joined]',
  );
  try {
    const list = layer?.scatterPoints?.();
    if (Array.isArray(list)) return list.length;
  } catch {}
  return svg.querySelectorAll('.visible-shape').length;
}

const firstChart = () =>
  document.querySelector<SVGSVGElement>("main svg[data-testid='d3-chart-svg']");

export function readAdvancements(): Set<string> {
  try {
    const raw = localStorage.getItem(ADVANCEMENTS_KEY);
    const list = raw ? (JSON.parse(raw) as unknown) : [];
    return new Set(Array.isArray(list) ? list.filter((v) => typeof v === 'string') : []);
  } catch {
    return new Set();
  }
}

export function readDimension(): Dimension {
  try {
    const value = localStorage.getItem(DIMENSION_KEY);
    return DIMENSIONS.includes(value as Dimension) ? (value as Dimension) : 'overworld';
  } catch {
    return 'overworld';
  }
}

function soundOn(): boolean {
  // Never before the visitor has interacted with the page.
  if (navigator.userActivation && !navigator.userActivation.hasBeenActive) return false;
  try {
    return localStorage.getItem('minecraft-sound') !== 'false';
  } catch {
    return false;
  }
}

function reducedMotion(): boolean {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
}

/** Small sound bank: the game's own SFX files, played only when the sound toggle is on. */
function createSounds() {
  const cache = new Map<string, HTMLAudioElement>();
  const play = (file: string, volume = 0.5) => {
    if (!soundOn()) return;
    let audio = cache.get(file);
    if (!audio) {
      audio = new Audio(file.startsWith('/') ? file : SOUNDS + file);
      audio.preload = 'auto';
      cache.set(file, audio);
    }
    audio.volume = volume;
    audio.currentTime = 0;
    void audio.play().catch(() => {});
  };
  /** The game's own toast sounds: the slide-in for advancements, the fanfare for challenges. */
  const chime = (challenge: boolean) =>
    play(`${IP_AUDIO}${challenge ? 'challenge-complete' : 'toast-in'}.mp3`, challenge ? 0.35 : 0.5);
  return {
    play,
    chime,
    dispose() {
      for (const audio of cache.values()) {
        audio.pause();
        audio.removeAttribute('src');
      }
      cache.clear();
    },
  };
}

/** Wait for the place-in animation before reading chart geometry. */
const PLACE_SETTLE_MS = 1400;
const JOCKEY_CONCURRENCY = 256;
const LINE_GAP_MS = 20_000;
const STARE_MS = 2500;
const CART_CLASS = 'mc-minecart';
const DIAMOND_CLASS = 'mc-diamond-find';

const DEATH = {
  en: {
    title: 'You Died!',
    lava: 'Steve tried to swim in lava',
    slain: 'Steve was slain by Herobrine',
    score: 'Score: ',
    respawn: 'Respawn',
    titleScreen: 'Title Screen',
  },
  zh: {
    title: '你死了！',
    lava: 'Steve试图在熔岩里游泳',
    slain: 'Steve被Herobrine杀死了',
    score: '分数：',
    respawn: '重生',
    titleScreen: '标题屏幕',
  },
};

/**
 * Turns the app's 404 content into the game's death screen. The page's own heading stays in the
 * document for assistive tech; the original link is replaced by the two death-screen buttons.
 */
function mountDeathScreen(
  getLocale: () => Locale,
  onRespawn: () => void,
  onDied: (slain: boolean) => void,
): () => void {
  let frame: number | undefined;
  const scan = () => {
    frame = undefined;
    const eyebrow = [...document.querySelectorAll('p')].find(
      (node) => node.textContent?.trim() === '404' && node.nextElementSibling?.tagName === 'H1',
    );
    const host = eyebrow?.parentElement;
    if (!host) return;
    const locale = getLocale();
    if (host.dataset.mcDied === locale) return;
    host.querySelector(':scope > .mc-died')?.remove();
    host.dataset.mcDied = locale;
    const t = DEATH[locale];
    const home = locale === 'zh' ? '/zh' : '/';
    const panel = document.createElement('div');
    panel.className = 'mc-died';
    const title = document.createElement('p');
    title.className = 'mc-died-title';
    title.setAttribute('aria-hidden', 'true');
    title.textContent = t.title;
    const message = document.createElement('p');
    message.className = 'mc-died-message';
    // A missing page is lava. At the end of the Herobrine chain, it is Herobrine.
    const slain = chainStage() >= 2;
    message.textContent = slain ? t.slain : t.lava;
    if (slain) panel.dataset.slain = '';
    onDied(slain);
    const score = document.createElement('p');
    score.className = 'mc-died-score';
    score.append(t.score);
    const value = document.createElement('b');
    value.textContent = '404';
    score.append(value);
    const respawn = document.createElement('button');
    respawn.type = 'button';
    respawn.className = 'mc-died-button';
    respawn.textContent = t.respawn;
    respawn.addEventListener('click', () => {
      onRespawn();
      window.setTimeout(() => {
        if (window.history.length > 1) window.history.back();
        else window.location.assign(home);
      }, 500);
    });
    const titleScreen = document.createElement('a');
    titleScreen.className = 'mc-died-button';
    titleScreen.href = home;
    titleScreen.textContent = t.titleScreen;
    panel.append(title, message, score, respawn, titleScreen);
    host.append(panel);
  };
  const schedule = () => {
    frame ??= window.requestAnimationFrame(scan);
  };
  schedule();
  const observer = new MutationObserver(schedule);
  observer.observe(document.body, { childList: true, subtree: true });
  return () => {
    observer.disconnect();
    if (frame !== undefined) window.cancelAnimationFrame(frame);
    document.querySelectorAll<HTMLElement>('[data-mc-died]').forEach((host) => {
      host.querySelector(':scope > .mc-died')?.remove();
      delete host.dataset.mcDied;
    });
  };
}

/**
 * The best point on a chart's Pareto frontiers (the per-series roofline paths and the global
 * frontier), in the path's own user space: the sample nearest the top of the plot. Returns null
 * when the chart draws no frontier.
 */
function isGem(node: Node): boolean {
  return node instanceof Element && node.classList.contains(DIAMOND_CLASS);
}

/** True when a path is actually painted: hidden series keep their paths with no opacity or stroke. */
function drawn(path: SVGPathElement, svg: SVGSVGElement): boolean {
  for (let node: Element | null = path; node && node !== svg; node = node.parentElement) {
    const style = getComputedStyle(node);
    if (style.display === 'none') return false;
    // Canvas-drawn lines keep their SVG path hidden for geometry; ancestors still count.
    if (style.visibility === 'hidden' && node !== path) return false;
    if (Number.parseFloat(style.opacity) < 0.05) return false;
  }
  const style = getComputedStyle(path);
  return style.stroke !== 'none' && Number.parseFloat(style.strokeOpacity) >= 0.05;
}

function frontierPeak(svg: SVGSVGElement): { path: SVGPathElement; x: number; y: number } | null {
  let best: { path: SVGPathElement; x: number; y: number } | null = null;
  const { width, height } = svg.getBoundingClientRect();
  for (const path of svg.querySelectorAll<SVGPathElement>(
    'path:is(.global-pareto-frontier, .roofline-path, .line-path)',
  )) {
    if (!drawn(path, svg)) continue;
    let length: number;
    try {
      length = path.getTotalLength();
    } catch {
      continue;
    }
    if (!(length > 0)) continue;
    const steps = Math.min(80, Math.max(8, Math.round(length / 6)));
    for (let i = 0; i <= steps; i++) {
      const point = path.getPointAtLength((length * i) / steps);
      // Frontier and roofline paths run past the plot and are clipped; only count what is drawn.
      if (point.x < 0 || point.y < 0 || point.x > width || point.y > height) continue;
      if (!best || point.y < best.y) best = { path, x: point.x, y: point.y };
    }
  }
  return best;
}

/** The strip's nine slots: the brief's tools and blocks, first slot selected like a fresh world. */
const HOTBAR = [
  `${IP}diamond-pickaxe.webp`,
  `${IP}diamond.webp`,
  '/decorative/minecraft/site/crafting-table.png',
  '/decorative/minecraft/site/tnt-side.png',
  '/decorative/minecraft/site/redstone-ore.png',
  `${IP}flint-and-steel.webp`,
  `${IP}water-bucket.webp`,
  `${IP}ender-pearl.webp`,
  '/decorative/minecraft/site/grass-side.png',
];

const KONAMI = [
  'ArrowUp',
  'ArrowUp',
  'ArrowDown',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'ArrowLeft',
  'ArrowRight',
  'b',
  'a',
];

export function mountMinecraftSite(getLocale: () => Locale): () => void {
  const root = document.documentElement;
  const sounds = createSounds();
  const timers = new Set<number>();
  const later = (fn: () => void, ms: number) => {
    const id = window.setTimeout(() => {
      timers.delete(id);
      fn();
    }, ms);
    timers.add(id);
  };

  // Toast stack plus a polite live region for screen readers.
  const toasts = document.createElement('div');
  toasts.className = 'mc-toasts';
  toasts.setAttribute('aria-hidden', 'true');
  const live = document.createElement('div');
  live.className = 'sr-only';
  live.setAttribute('role', 'status');
  live.setAttribute('aria-live', 'polite');
  // The action bar: one short line above the bottom edge, like the game's text over the hotbar.
  const actionBar = document.createElement('div');
  actionBar.className = 'mc-actionbar';
  actionBar.setAttribute('aria-hidden', 'true');
  document.body.append(live);
  // Toasts and the action bar live in a hotbar strip inside the sticky site header, so they never
  // sit on charts, legends, headings or controls. Without a header they fall back to the body.
  const hud = document.createElement('div');
  hud.className = 'mc-site-hud';
  hud.setAttribute('aria-hidden', 'true');
  hud.dataset.mcSilent = '';
  const hotbar = document.createElement('div');
  hotbar.className = 'mc-hud-bar';
  for (const icon of HOTBAR) {
    const slot = document.createElement('span');
    const img = document.createElement('img');
    img.src = icon;
    img.alt = '';
    img.width = 16;
    img.height = 16;
    slot.append(img);
    hotbar.append(slot);
  }
  hud.append(actionBar, hotbar, toasts);
  const siteHeader = document.querySelector('header.vt-site-header');
  if (siteHeader) siteHeader.append(hud);
  else document.body.append(toasts, actionBar);
  let actionTimer: number | undefined;
  // Each line at most once per 20 s; the action bar shows one line at a time.
  const lastSaid = new Map<LineId, number>();
  const say = (id: LineId, arg = '') => {
    const now = performance.now();
    if (now - (lastSaid.get(id) ?? -Infinity) < LINE_GAP_MS) return;
    lastSaid.set(id, now);
    hearLine(id);
    const text = LINES[id][getLocale()].replace('%s', arg);
    actionBar.textContent = text;
    const icon = LINE_ICONS[id];
    if (icon) {
      const img = document.createElement('img');
      img.src = `${IP}${icon}.webp`;
      img.alt = '';
      img.width = 16;
      img.height = 16;
      actionBar.prepend(img);
    }
    actionBar.dataset.show = 'true';
    live.textContent = text;
    if (actionTimer !== undefined) {
      window.clearTimeout(actionTimer);
      timers.delete(actionTimer);
    }
    actionTimer = window.setTimeout(() => {
      if (actionTimer !== undefined) timers.delete(actionTimer);
      actionTimer = undefined;
      delete actionBar.dataset.show;
    }, 3200);
    timers.add(actionTimer);
  };
  const said = new Set<LineId>();
  const sayOnce = (id: LineId, arg = '') => {
    if (said.has(id)) return false;
    said.add(id);
    say(id, arg);
    return true;
  };

  const grant = (id: AdvancementId) => {
    const have = readAdvancements();
    if (have.has(id)) return;
    have.add(id);
    try {
      localStorage.setItem(ADVANCEMENTS_KEY, JSON.stringify([...have]));
    } catch {}
    const locale = getLocale();
    const adv: Advancement = ADVANCEMENTS[id];
    const head = HEAD[locale][adv.kind === 'challenge' ? 'challenge' : 'normal'];
    const [title, description] = adv[locale];
    const toast = document.createElement('div');
    toast.className = 'mc-toast';
    if (adv.kind) toast.dataset.kind = adv.kind;
    const icon = document.createElement('span');
    icon.className = 'mc-toast-icon';
    icon.style.backgroundImage = `url('${adv.icon.startsWith('/') ? adv.icon : `${SITE}${adv.icon}.png`}')`;
    const headEl = document.createElement('span');
    headEl.className = 'mc-toast-head';
    headEl.textContent = head;
    const titleEl = document.createElement('span');
    titleEl.className = 'mc-toast-title';
    titleEl.textContent = title;
    toast.title = description;
    toast.append(icon, headEl, titleEl);
    toasts.append(toast);
    live.textContent = `${head} ${title}. ${description}`;
    sounds.chime(adv.kind === 'challenge');
    later(() => toast.remove(), reducedMotion() ? 4000 : 5200);
    window.dispatchEvent(new CustomEvent(ADVANCEMENT_EVENT, { detail: id }));
  };

  // Dimension sub-palette.
  const applyDimension = (dim: Dimension) => {
    if (dim === 'overworld') delete root.dataset.minecraftDimension;
    else root.dataset.minecraftDimension = dim;
  };
  applyDimension(readDimension());
  const onDimension = (event: Event) => {
    const dim = (event as CustomEvent<Dimension>).detail;
    if (!DIMENSIONS.includes(dim)) return;
    try {
      localStorage.setItem(DIMENSION_KEY, dim);
    } catch {}
    applyDimension(dim);
    if (dim === 'nether') {
      sounds.play('fire-ignite.mp3', 0.5);
      later(() => sounds.play(`${IP_AUDIO}portal.mp3`, 0.35), 150);
      if (!reducedMotion()) {
        const portal = document.createElement('div');
        portal.className = 'mc-portal';
        portal.setAttribute('aria-hidden', 'true');
        // The swirl stays inside the banner, away from the nav, the launch button and the charts.
        const banner = document.querySelector('.mc-play-banner');
        if (banner) {
          banner.append(portal);
          later(() => portal.remove(), 1500);
        }
      }
      say('portal');
      grant('nether');
    } else if (dim === 'end') {
      sounds.play('random-orb.mp3', 0.5);
      say('poemOpen');
      later(() => {
        if (readDimension() === 'end') say('poemClose');
      }, 3600);
      grant('end');
    } else {
      sounds.play('step-grass1.mp3', 0.6);
    }
  };
  window.addEventListener(DIMENSION_EVENT, onDimension);
  const onGrant = (event: Event) => {
    const id = (event as CustomEvent<string>).detail;
    if (id in ADVANCEMENTS) grant(id as AdvancementId);
  };
  window.addEventListener(GRANT_EVENT, onGrant);

  // Charts: textured points and bars, the creeper, and the chart advancements.
  const boom = (button: HTMLElement) => {
    const rect = button.getBoundingClientRect();
    const fx = document.createElement('div');
    fx.className = 'mc-boom';
    fx.style.left = `${rect.left + rect.width / 2}px`;
    fx.style.top = `${rect.top + rect.height / 2}px`;
    document.body.append(fx);
    later(() => fx.remove(), 700);
  };
  let firstPlaceAt: number | undefined;
  const placedSvgs = new WeakSet<SVGSVGElement>();
  // A minecart with a creeper in it rides the drawn frontier to its top, where the diamond is.
  // Pointer-transparent, kept out of exports, gone after the ride.
  const rideFrontier = (svg: SVGSVGElement) => {
    if (reducedMotion() || svg.querySelector(`.${CART_CLASS}`)) return;
    const peak = frontierPeak(svg);
    if (!peak?.path.parentNode) return;
    const { path } = peak;
    let length: number;
    try {
      length = path.getTotalLength();
    } catch {
      return;
    }
    if (!(length > 0)) return;
    // Find the length along the path where the peak sits.
    let peakAt = 0;
    let best = Infinity;
    for (let i = 0; i <= 60; i++) {
      const point = path.getPointAtLength((length * i) / 60);
      const d = Math.hypot(point.x - peak.x, point.y - peak.y);
      if (d < best) {
        best = d;
        peakAt = (length * i) / 60;
      }
    }
    const ns = 'http://www.w3.org/2000/svg';
    const cart = document.createElementNS(ns, 'g');
    cart.setAttribute('class', `${CART_CLASS} no-export`);
    cart.setAttribute('aria-hidden', 'true');
    cart.setAttribute('pointer-events', 'none');
    const transform = path.getAttribute('transform');
    if (transform) cart.setAttribute('transform', transform);
    const body = document.createElementNS(ns, 'g');
    body.innerHTML =
      '<image href="/decorative/minecraft/site/creeper-face.png" x="-4" y="-15" width="8" height="8" image-rendering="pixelated"/>' +
      '<rect x="-7" y="-9" width="14" height="6" fill="#6b6b6b" stroke="#000" stroke-width="1"/>' +
      '<rect x="-6" y="-8" width="12" height="1" fill="#9a9a9a"/>' +
      '<rect x="-6" y="-3" width="3" height="3" fill="#222"/>' +
      '<rect x="3" y="-3" width="3" height="3" fill="#222"/>';
    cart.append(body);
    path.parentNode?.append(cart);
    // Longer frontiers take longer: 1.2 s plus 4 ms per drawn pixel, at most 3.2 s.
    const duration = Math.min(3200, 1200 + peakAt * 4);
    const start = performance.now();
    let rideFrame = 0;
    const step = (now: number) => {
      if (!cart.isConnected || !root.classList.contains('minecraft')) {
        cart.remove();
        return;
      }
      const progress = Math.min(1, (now - start) / duration);
      const at = peakAt * (1 - (1 - progress) ** 2);
      const point = path.getPointAtLength(at);
      body.setAttribute('transform', `translate(${point.x.toFixed(1)} ${point.y.toFixed(1)})`);
      if (progress < 1) rideFrame = requestAnimationFrame(step);
      else {
        gemPopped.delete(svg);
        findDiamonds(svg);
        later(() => cart.remove(), 600);
      }
    };
    rideFrame = requestAnimationFrame(step);
    rides.add(() => cancelAnimationFrame(rideFrame));
  };
  const rides = new Set<() => void>();
  const gemWatchers = new Map<SVGSVGElement, MutationObserver>();
  const gemPopped = new WeakSet<SVGSVGElement>();
  // Finding diamonds: a gem and sparkle beside the top of the frontier, never on the point.
  // Series toggles and hovers restyle the paths; re-find the peak when the drawing changes.
  const watchGems = (svg: SVGSVGElement) => {
    if (!gemWatchers.has(svg)) {
      let pending: number | undefined;
      const watcher = new MutationObserver((records) => {
        const ours = records.every((record) =>
          record.type === 'attributes'
            ? isGem(record.target)
            : [...record.addedNodes, ...record.removedNodes].every(isGem),
        );
        // The chart's own redraw can drop the gem; that removal alone still needs a re-find.
        if ((ours && svg.querySelector(`.${DIAMOND_CLASS}`)) || pending !== undefined) return;
        pending = window.setTimeout(() => {
          pending = undefined;
          if (svg.isConnected) findDiamonds(svg);
          else {
            watcher.disconnect();
            gemWatchers.delete(svg);
          }
        }, 120);
      });
      watcher.observe(svg, {
        subtree: true,
        childList: true,
        attributeFilter: ['d', 'transform', 'style'],
      });
      gemWatchers.set(svg, watcher);
    }
  };
  const findDiamonds = (svg: SVGSVGElement) => {
    if (!svg.isConnected) return;
    watchGems(svg);
    svg.querySelectorAll(`.${DIAMOND_CLASS}`).forEach((node) => node.remove());
    const peak = frontierPeak(svg);
    if (!peak?.path.parentNode) return;
    // The gem sits in a group that carries the series transform, so the image itself can
    // animate: on the first find per chart it pops in at three times its size beside the peak
    // and settles to 12px within four seconds.
    const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    group.setAttribute('class', `${DIAMOND_CLASS} no-export`);
    group.setAttribute('aria-hidden', 'true');
    group.setAttribute('pointer-events', 'none');
    const transform = peak.path.getAttribute('transform');
    if (transform) group.setAttribute('transform', transform);
    const gem = document.createElementNS('http://www.w3.org/2000/svg', 'image');
    gem.setAttribute('class', gemPopped.has(svg) ? 'mc-gem' : 'mc-gem mc-gem-pop');
    gem.setAttribute('href', `${IP}diamond.webp`);
    gem.setAttribute('width', '12');
    gem.setAttribute('height', '12');
    gem.setAttribute('x', String(peak.x + 7));
    gem.setAttribute('y', String(peak.y - 19));
    gem.setAttribute('image-rendering', 'pixelated');
    group.append(gem);
    gemPopped.add(svg);
    peak.path.parentNode.append(group);
    grant('diamonds');
  };

  const unmountCharts = mountMinecraftCharts({
    onPlace: (layerSvg) => {
      grant('place');
      // The point layer may sit in its own SVG; the frontier paths are in the chart's.
      const svg =
        layerSvg
          .closest("[data-slot='card'], figure")
          ?.querySelector<SVGSVGElement>("svg[data-testid='d3-chart-svg']") ?? layerSvg;
      const now = performance.now();
      firstPlaceAt ??= now;
      // A chart placed again, or placed well after the page's first one, is an update.
      const update = placedSvgs.has(svg) || now - firstPlaceAt > 5000;
      placedSvgs.add(svg);
      later(() => {
        if (!svg.isConnected) return;
        if (update) {
          // A new model or metric: the chart is placed again and a minecart rides the frontier.
          say('terraria');
          rideFrontier(svg);
        } else {
          sayOnce('punch', pointCount(svg).toLocaleString());
        }
        findDiamonds(svg);
      }, PLACE_SETTLE_MS);
    },
    onHoverFace: (face) => {
      if (face === 'creeper') say('exploding');
    },
    stampLabel: () =>
      getLocale() === 'zh' ? '我的世界版 · InferenceX' : 'Minecraft edition · InferenceX',
    onTooltip: () => grant('tooltip'),
    creeperLabel: () => (getLocale() === 'zh' ? '苦力怕（点一下试试）' : 'Creeper (poke it)'),
    onCreeperHiss: () => {
      sounds.play('random-fuse.mp3', 0.6);
      const ends = axisEnds(firstChart(), 'x');
      say('awMan', ends ? `${ends[0]} → ${ends[1]}` : '←→');
    },
    onCreeperPop: (count) => {
      const button = document.querySelector<HTMLElement>('.mc-creeper');
      if (button && !reducedMotion()) boom(button);
      sounds.play(`random-explode${1 + Math.floor(Math.random() * 4)}.mp3`, 0.5);
      later(() => say('blownUp'), 300);
      if (count > 0) later(() => say('crater', count.toLocaleString()), 3600);
      grant('creeper');
    },
  });

  // SVG-only charts (historical lines) never go through the canvas point placing, so look for
  // them as they mount.
  let chartScan: number | undefined;
  const scanCharts = () => {
    chartScan = undefined;
    for (const svg of document.querySelectorAll<SVGSVGElement>(
      "main svg[data-testid='d3-chart-svg']",
    )) {
      if (!gemWatchers.has(svg) && svg.querySelector('path.line-path')) findDiamonds(svg);
    }
  };
  // Capture aid: `?mc_loading=1` holds a copy of the stock loading card (the same Skeleton
  // markup ChartDisplay renders while data loads) above the first chart, so the themed loading
  // state can be photographed. The live loading state passes before the theme chunk arrives.
  let holdFrame: number | undefined;
  const holdLoading = () => {
    holdFrame = undefined;
    if (!new URLSearchParams(window.location.search).has('mc_loading')) return;
    if (document.querySelector('.mc-loading-hold')) return;
    const card = firstChart()?.closest("[data-slot='card']");
    if (!card) return;
    const hold = document.createElement('div');
    hold.className = 'mc-loading-hold';
    hold.dataset.slot = 'card';
    hold.setAttribute('aria-hidden', 'true');
    for (const size of ['h-7 w-2/4 mb-1', 'h-5 w-3/4 mb-2', 'h-[600px] w-full']) {
      const bar = document.createElement('div');
      bar.dataset.slot = 'skeleton';
      bar.className = `bg-accent animate-pulse rounded-md ${size}`;
      hold.append(bar);
    }
    card.before(hold);
  };

  // Empty charts: the stock message stays; a line is added under it.
  let emptyFrame: number | undefined;
  const markEmpty = () => {
    emptyFrame = undefined;
    for (const empty of document.querySelectorAll<HTMLElement>(
      "[data-testid='chart-empty-state'], [data-testid='scatter-empty-state'], [data-testid='agentic-chart-empty']",
    )) {
      const text = LINES.awwMan[getLocale()];
      let note = empty.querySelector<HTMLElement>(':scope > .mc-empty-line');
      if (note?.textContent === text) continue;
      if (!note) {
        note = document.createElement('p');
        note.className = 'mc-empty-line';
        note.setAttribute('aria-hidden', 'true');
        empty.append(note);
        say('awwMan');
        sounds.play(`${IP_AUDIO}oof.mp3`, 0.3);
      }
      note.textContent = text;
    }
  };
  const chartObserver = new MutationObserver(() => {
    if (chartScan === undefined) chartScan = window.setTimeout(scanCharts, PLACE_SETTLE_MS);
    emptyFrame ??= requestAnimationFrame(markEmpty);
    holdFrame ??= requestAnimationFrame(holdLoading);
  });
  chartObserver.observe(document.body, { childList: true, subtree: true });

  const onClick = (event: MouseEvent) => {
    const target = event.target as Element | null;
    if (!target?.closest) return;
    const exportButton = target.closest("[data-testid='export-button']");
    if (exportButton) {
      sounds.play('random-chestopen.mp3', 0.4);
      const card = exportButton.closest("[data-slot='card']") ?? document;
      pendingShot = card.querySelector("[id$='-export']")?.id.replace(/-export$/, '') || 'chart';
      grant('export');
      say('jeb');
    } else if (target.closest("[data-testid='zoom-reset-button']")) {
      sounds.play(`${IP_AUDIO}bucket-empty.mp3`, 0.5);
      say('ground');
    } else if (target.closest('.mc-herobrine-eyes')) {
      if (chainStage() < 1) setChainStage(1);
      sounds.play(`${IP_AUDIO}cave.mp3`, 0.4);
      say('clueEyes');
    } else if (target.closest("[data-testid='minecraft-launch']")) {
      grant('game');
    }
  };
  document.addEventListener('click', onClick, true);

  // A finished PNG export reports through the app's own action event.
  let pendingShot = '';
  const onAction = () => {
    if (!pendingShot) return;
    say('screenshot', `${pendingShot}-….png`);
    pendingShot = '';
  };
  window.addEventListener('inferencex:action', onAction);

  // The first wheel zoom on a chart gets the oldest rule in the game.
  const onWheel = (event: WheelEvent) => {
    const target = event.target as Element | null;
    if (target?.closest?.('.chart-root, [data-chart-tooltip]') && event.deltaY < 0) {
      const svg =
        target.closest('.chart-root')?.querySelector<SVGSVGElement>('svg') ?? firstChart();
      const ends = axisEnds(svg, 'y');
      sayOnce('dig', ends?.[0] ?? '0');
    }
  };
  window.addEventListener('wheel', onWheel, { passive: true });

  // Enderman: hold the pointer on one point for 2.5 s and it takes that block.
  let stareText = '';
  let stareTimer: number | undefined;
  const stare = (text: string) => {
    if (text === stareText) return;
    stareText = text;
    window.clearTimeout(stareTimer);
    if (!text) return;
    stareTimer = window.setTimeout(() => {
      const tip = document.querySelector('[data-chart-tooltip]')?.textContent ?? '';
      if (!tip || tip !== stareText) return;
      const value =
        /\d[\d,.]*\s*(?:tok\/s(?:\/\w+)?|ms|s|W|\$)/i.exec(tip)?.[0] ??
        /\d[\d,.]*/.exec(tip)?.[0] ??
        '';
      if (!value) return;
      sounds.play(`${IP_AUDIO}enderman-teleport.mp3`, 0.5);
      say('stole', value.trim());
    }, STARE_MS);
  };
  // Chicken jockey: a tooltip for a point run at very high concurrency.
  let lastTooltipCheck = 0;
  const onPointer = () => {
    const now = performance.now();
    if (now - lastTooltipCheck < 300) return;
    lastTooltipCheck = now;
    const text = document.querySelector('[data-chart-tooltip]')?.textContent ?? '';
    stare(text);
    if (said.has('jockey')) return;
    const match = /\bconc(?:urrency)?\s*[:=]?\s*(?<conc>\d{3,5})\b/i.exec(text);
    if (match?.groups && Number(match.groups.conc) >= JOCKEY_CONCURRENCY) {
      sayOnce('jockey', match.groups.conc);
      sounds.play(`${IP_AUDIO}chicken.mp3`, 0.5);
    }
  };
  document.addEventListener('pointermove', onPointer, { passive: true });

  // Coming back to the tab: the bed message, which one depends on the local hour.
  let hiddenAt = 0;
  const onVisibility = () => {
    if (document.hidden) {
      hiddenAt = Date.now();
      return;
    }
    if (!hiddenAt || Date.now() - hiddenAt < 60_000) return;
    hiddenAt = 0;
    // Beds explode outside the Overworld; the game blames [Intentional Game Design].
    if (readDimension() !== 'overworld') {
      say('badRespawn');
      return;
    }
    const hour = new Date().getHours();
    say(hour >= 19 || hour < 6 ? 'notSafe' : 'noSleep');
  };
  document.addEventListener('visibilitychange', onVisibility);

  // React code (banner mobs, music) asks for a line by id.
  let lastHmm = -Infinity;
  const onLine = (event: Event) => {
    const detail = (event as CustomEvent<{ id: string; arg?: string }>).detail;
    if (!detail || !(detail.id in LINES)) return;
    const id = detail.id as LineId;
    // Music starts on the same gesture that fires a mob or palette line; let that line finish first.
    if (id === 'nowPlaying' && actionBar.dataset.show) {
      later(() => onLine(event), 3300);
      return;
    }
    if (id === 'villager') {
      const now = performance.now();
      if (now - lastHmm < 4000) return;
      lastHmm = now;
      sounds.play(`${IP_AUDIO}villager-hmm.mp3`, 0.6);
    } else if (id === 'enderman') {
      sounds.play(`${IP_AUDIO}enderman-teleport.mp3`, 0.5);
    }
    say(id, detail.arg ?? '');
  };
  window.addEventListener(LINE_EVENT, onLine);

  // Herobrine: typed, he shows at the edge for a moment, then the changelog line.
  const herobrine = () => {
    if (document.querySelector('.mc-herobrine')) return;
    sounds.play(`${IP_AUDIO}cave.mp3`, 0.4);
    const node = document.createElement('img');
    node.className = 'mc-herobrine';
    node.src = `${IP}herobrine.webp`;
    node.alt = '';
    node.setAttribute('aria-hidden', 'true');
    document.body.append(node);
    later(() => node.remove(), reducedMotion() ? 600 : 1400);
    later(() => say('herobrine'), 900);
  };

  // His trail: a sign over the hotbar pointing to a page that does not exist, for 15 s.
  const leaveTrail = () => {
    document.querySelector('.mc-herobrine-trail')?.remove();
    const zh = getLocale() === 'zh';
    const sign = document.createElement('a');
    sign.className = 'mc-herobrine-trail';
    sign.dataset.testid = 'minecraft-herobrine-trail';
    sign.href = zh ? '/zh/herobrine' : '/herobrine';
    sign.textContent = zh ? '跟着他 →' : 'Follow him →';
    (document.querySelector('header.vt-site-header') ?? document.body).append(sign);
    later(() => sign.remove(), 15_000);
  };

  // The 404 page becomes the death screen.
  const deathScreen = mountDeathScreen(
    getLocale,
    () => {
      sounds.play(`${IP_AUDIO}oof.mp3`, 0.5);
      grant('respawn');
    },
    (slain) => {
      hearLine('lava');
      if (slain) {
        setChainStage(3);
        grant('herobrine');
      }
    },
  );

  // Typed eggs: the Konami code, and typing "creeper" anywhere outside a field.
  let keys: string[] = [];
  let typed = '';
  const onKey = (event: KeyboardEvent) => {
    const target = event.target as HTMLElement | null;
    if (target?.closest?.('input, textarea, select, [contenteditable="true"]')) return;
    if (document.querySelector("[data-testid='minecraft-game']")) return;
    keys = [...keys, event.key.length === 1 ? event.key.toLowerCase() : event.key].slice(-10);
    if (keys.join(',') === KONAMI.join(',')) {
      keys = [];
      sounds.play('random-orb.mp3', 0.6);
      grant('konami');
    }
    if (event.key.length === 1) {
      typed = (typed + event.key.toLowerCase()).slice(-9);
      if (typed === 'herobrine') {
        typed = '';
        herobrine();
        // On a chart page, the chain moves on: he leaves for a page that does not exist.
        if (firstChart() || /\/infx\//.test(location.pathname)) {
          if (chainStage() < 2) setChainStage(2);
          later(() => {
            say('clueGone');
            leaveTrail();
          }, 1600);
        }
      }
      if (typed.endsWith('creeper')) {
        typed = '';
        const creeper = document.querySelector<HTMLButtonElement>('.mc-creeper');
        if (creeper) creeper.click();
        else sounds.play('random-fuse.mp3', 0.6);
        grant('aw_man');
      }
    }
  };
  window.addEventListener('keydown', onKey);

  return () => {
    unmountCharts();
    chartObserver.disconnect();
    window.clearTimeout(chartScan);
    deathScreen();
    for (const watcher of gemWatchers.values()) watcher.disconnect();
    gemWatchers.clear();
    window.removeEventListener('inferencex:action', onAction);
    window.clearTimeout(stareTimer);
    if (emptyFrame !== undefined) cancelAnimationFrame(emptyFrame);
    if (holdFrame !== undefined) cancelAnimationFrame(holdFrame);
    document.querySelectorAll('.mc-loading-hold').forEach((node) => node.remove());
    for (const stop of rides) stop();
    rides.clear();
    document.querySelectorAll('.mc-empty-line').forEach((node) => node.remove());
    window.removeEventListener('wheel', onWheel);
    document.removeEventListener('pointermove', onPointer);
    document.removeEventListener('visibilitychange', onVisibility);
    window.removeEventListener(LINE_EVENT, onLine);
    actionBar.remove();
    document
      .querySelectorAll(
        `.mc-portal, .mc-herobrine, .mc-herobrine-trail, .mc-diamond-find, .${CART_CLASS}`,
      )
      .forEach((node) => node.remove());
    window.removeEventListener(DIMENSION_EVENT, onDimension);
    window.removeEventListener(GRANT_EVENT, onGrant);
    document.removeEventListener('click', onClick, true);
    window.removeEventListener('keydown', onKey);
    for (const id of timers) window.clearTimeout(id);
    timers.clear();
    toasts.remove();
    hud.remove();
    live.remove();
    document.querySelectorAll('.mc-boom').forEach((node) => node.remove());
    delete root.dataset.minecraftDimension;
    sounds.dispose();
  };
}

/** Grant from React code (banner language switch) through the same store. */
export function grantAdvancementEvent(id: AdvancementId) {
  window.dispatchEvent(new CustomEvent(GRANT_EVENT, { detail: id }));
}
