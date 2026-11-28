import { track } from '@/lib/analytics/analytics';
import { plotBounds, type PlotBounds } from '@/lib/d3-chart/plot-bounds';
import type { GhibliAudio, GhibliSting } from './ghibli-audio';
import { asset, type GhibliFilm } from './ghibli-prefs';
import { coversContent, SafeMap, type Box } from './ghibli-lanes';
import {
  STAMPS,
  STAMP_STILLS,
  hearLine,
  onPassport,
  punchTicket,
  readPassport,
  readLines,
  readTicket,
  stampPassport,
  type Stamp,
} from './ghibli-passport';
import { paintedPointCount } from './ghibli-charts';
import type { GhibliEgg, GhibliQuote, GhibliStrings } from './ghibli-strings';

const CHART_SVG = 'svg[data-testid="d3-chart-svg"]';
const CARD = '[data-slot="card"]';
const POINTS = '.canvas-point-layer, .dot-group';
const EXPORT_BUTTON = '[data-testid="export-button"]';
const TAB_TRIGGER = '[data-testid^="tab-trigger-"], [data-testid^="mobile-tab-"], [role="tab"]';
const ACTIVE_TAB = '[data-tab-active="true"]';
const FOOTER = 'footer[data-testid="footer"]';
const LEGEND = '[data-testid="chart-legend"]';
const LEGEND_BOX = 'input.peer[type="checkbox"]';
/** The inference scatter's Pareto frontier. Hidden frontiers keep the element at opacity 0. */
const FRONTIER = 'path.roofline-path';
const LAST_VISIT_KEY = 'ghibli-last-visit';
const TRAIN_SEEN_KEY = 'ghibli-train-seen';
const RETURN_AFTER_MS = 4 * 60 * 60 * 1000;
/** Every line and note is gone within 6 s. */
const QUOTE_MS = 5800;
const HEADER_HEIGHT = 56;
const CHORUS_HEIGHT = 52;
const OFFER_WIDTH = 86;
const OFFER_HEIGHT = 76;
/** How long a line waits for a clear spot before it is dropped. */
const TOAST_WAIT_MS = 12_000;
/** What a toast may never cover: charts, their legends and tables, and every control. */
const PROTECTED = [
  'svg[data-testid="d3-chart-svg"]',
  'canvas',
  'table',
  'th',
  'td',
  'button',
  'a[href]',
  'input',
  'select',
  'textarea',
  'label',
  '[role="combobox"]',
  '[role="tab"]',
  '[role="switch"]',
  '[role="slider"]',
].join(', ');
const IDLE_MS = 45_000;
/** A film line shows at most once in this long. */
const LINE_GAP_MS = 20_000;
const EXPORT_CONTAINER = '[id$="-export"]';
const TOOLTIP = '[data-chart-tooltip]';

/** Fills {name} slots in a line. */
function fill(template: string, values: Record<string, string | number>): string {
  return template.replaceAll(/\{(?<name>\w+)\}/g, (match, name: string) =>
    name in values ? String(values[name]) : match,
  );
}

/** The highest tick label on a chart's y axis: a real number on the page. */
function topTick(svg: SVGSVGElement): string {
  const ticks = [...svg.querySelectorAll<SVGTextElement>('.y-axis .tick text')];
  return ticks.at(-1)?.textContent?.trim() ?? '';
}
const MAX_CHARTS = 4;
const MAX_CARDS = 4;
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
const WORDS = [
  'totoro',
  'calcifer',
  'ponyo',
  'haku',
  'heron',
  'ham',
  'pig',
  'howl',
  'sen',
  'bacon',
  'balse',
  'anime',
] as const;
type Word = (typeof WORDS)[number];

interface Soot {
  el: HTMLImageElement;
  x: number;
  speed: number;
  dir: 1 | -1;
  flee: number;
  width: number;
  height: number;
}

interface ChartEntry {
  svg: SVGSVGElement;
  soots: Soot[];
  bounds: PlotBounds | null;
  /** The card around the chart: soot sprites walk along its top edge, outside the plot. */
  ledge: DOMRect | null;
  surfed: boolean;
}

interface KodamaEntry {
  card: Element;
  button: HTMLButtonElement;
  second: HTMLImageElement;
  clicks: number;
  lastClick: number;
  rect: DOMRect | null;
}

interface Rider {
  chart: ChartEntry;
  el: HTMLElement;
  start: number;
  duration: number;
  path: SVGPathElement;
  length: number;
  lastX: number;
  fade: number;
  labels: SVGGraphicsElement[];
  /** Where she last rode in clear view: the ham ramen appears there when she arrives. */
}

/** Three frames of the selected film for the chart card's header, like a strip of film. */
const CARD_FRAMES: Record<GhibliFilm, string[]> = {
  spirited: ['banner-spirited', 'still-chihiro016', 'still-chihiro043'],
  heron: ['banner-heron', 'still-kimitachi044', 'still-chihiro042'],
  howl: ['banner-howl', 'still-howl048', 'still-howl023'],
  mononoke: ['banner-mononoke', 'still-mononoke025', 'still-mononoke010'],
  ponyo: ['banner-ponyo', 'still-ponyo035', 'still-ponyo005'],
};
/** Film-strip frame sizes, largest first; the strip uses the largest that fits the header gap. */
const FRAME_SIZES: readonly (readonly [number, number])[] = [
  [112, 63],
  [96, 54],
  [80, 45],
];

const random = (min: number, max: number) => min + Math.random() * (max - min);
const pick = <T>(items: readonly T[]): T => items[Math.floor(Math.random() * items.length)];

function isEditable(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.isContentEditable ||
    target.matches('input, textarea, select, [role="combobox"], [role="textbox"]')
  );
}

function sprite(name: string, className: string): HTMLImageElement {
  const img = document.createElement('img');
  img.src = asset(`sprites/${name}.webp`);
  img.alt = '';
  img.draggable = false;
  img.decoding = 'async';
  img.className = className;
  img.setAttribute('aria-hidden', 'true');
  return img;
}

function still(name: string, className: string): HTMLImageElement {
  const img = document.createElement('img');
  img.src = asset(`stills/${name}.webp`);
  img.alt = '';
  img.width = 800;
  img.height = 432;
  img.draggable = false;
  img.decoding = 'async';
  img.className = className;
  img.setAttribute('aria-hidden', 'true');
  return img;
}

/**
 * The longest visible frontier in a chart, for Ponyo to run along. The chart paints its SVG
 * curves onto a canvas underlay and hides the SVG copy, so `visibility: hidden` alone does not
 * mean the curve is off.
 */
/** Series and point labels on a chart; Ponyo stays off them. */
const SERIES_LABELS = '.line-label .ll-bg, .point-label, .parallelism-label';

function visibleFrontier(svg: SVGSVGElement): SVGPathElement | null {
  let best: SVGPathElement | null = null;
  let bestLength = 80;
  for (const path of svg.querySelectorAll<SVGPathElement>(FRONTIER)) {
    if (path.dataset.curveKind === 'roofline') continue;
    const style = getComputedStyle(path);
    const painted = Object.hasOwn(path.dataset, 'canvasUnderlay') || style.visibility !== 'hidden';
    if (style.display === 'none' || !painted || Number(style.opacity) < 0.2) continue;
    try {
      const length = path.getTotalLength();
      if (length > bestLength) {
        best = path;
        bestLength = length;
      }
    } catch {}
  }
  return best;
}

function div(className: string, parent?: HTMLElement): HTMLDivElement {
  const el = document.createElement('div');
  el.className = className;
  parent?.append(el);
  return el;
}

/**
 * Imperative character layer. Everything it creates lives inside `layer` (or one injected
 * footer strip) and is removed by `destroy()`, together with every timer, observer and listener.
 */
/** An open dialog covers the page; the theme shows nothing over it. */
function modalOpen(): boolean {
  return document.querySelector('[role="dialog"][data-state="open"], dialog[open]') !== null;
}

/** Transient art that belongs to one film; it leaves when another film is chosen. */
const FILM_CAST: Record<GhibliFilm, string> = {
  spirited: '.ghibli-haku',
  heron: '.ghibli-heron, .ghibli-parakeets, .ghibli-warawara',
  howl: '.ghibli-turnip',
  mononoke: '.ghibli-footprint',
  ponyo: '.ghibli-egg-ponyo',
};

export class GhibliStage {
  private readonly layer: HTMLElement;
  private strings: GhibliStrings;
  private film: GhibliFilm;
  private readonly audio: GhibliAudio;
  private readonly reduced: boolean;
  private readonly charts = new Map<SVGSVGElement, ChartEntry>();
  private readonly kodama = new Map<Element, KodamaEntry>();
  private readonly riders = new Set<Rider>();
  private readonly timers = new Set<number>();
  private readonly animations = new Set<Animation>();
  private readonly observer: MutationObserver;
  private frame: number | undefined;
  private scanTimer: number | undefined;
  private lastTick = 0;
  private lastMeasure = 0;
  private map: SafeMap | null = null;
  private mapAt = 0;
  private dirty = true;
  private pointer: { x: number; y: number } | null = null;
  private lastInput = performance.now();
  private gathered: HTMLImageElement[] | null = null;
  private keys: string[] = [];
  private typed = '';
  private footerSea: HTMLDivElement | null = null;
  private castle: HTMLDivElement | null = null;
  private cardStrip: HTMLDivElement;
  private stripKey = '';
  private stripAt = 0;
  private lastToastAt = -Infinity;
  private offer: {
    root: HTMLDivElement;
    button: HTMLElement;
    gold: HTMLButtonElement;
    hideAt: number;
    dx: number;
    dy: number;
  } | null = null;
  private toast: HTMLDivElement;
  private toastTimer: number | undefined;
  private toastScrollTimer: number | undefined;
  private toastPending: { ms: number; until: number } | null = null;
  private kodamaVariant = 0;
  private destroyed = false;
  private legendClicks: number[] = [];
  private footerObserver: IntersectionObserver | null = null;
  private observedFooter: Element | null = null;
  private trainCard: HTMLDivElement | null = null;
  private ponyoCited = false;
  private readonly lineAt = new Map<string, number>();
  private lastModel: string | null | undefined;
  private notFoundSeen = false;
  private exportAt = -Infinity;
  private chaseAt = -Infinity;
  private readonly exportObserver: MutationObserver;
  private readonly watchedExports = new WeakSet<Element>();

  private readonly offPassport: () => void;

  constructor(
    layer: HTMLElement,
    options: { strings: GhibliStrings; film: GhibliFilm; audio: GhibliAudio; reduced: boolean },
  ) {
    this.layer = layer;
    this.strings = options.strings;
    this.film = options.film;
    this.audio = options.audio;
    this.reduced = options.reduced;

    this.exportObserver = new MutationObserver((records) => {
      for (const record of records) {
        for (const node of record.addedNodes) {
          if (node instanceof HTMLElement) this.sealExport(node);
        }
      }
    });
    this.toast = div('ghibli-toast', layer);
    this.toast.setAttribute('role', 'status');
    this.toast.setAttribute('aria-live', 'polite');

    this.cardStrip = div('ghibli-card-strip no-export', layer);
    this.cardStrip.hidden = true;
    this.fillStrip();
    this.offPassport = onPassport(() => this.fillStrip());

    this.buildCastle();
    this.buildFilmResidents();

    this.observer = new MutationObserver(() => this.scheduleScan());
    this.observer.observe(document.body, { childList: true, subtree: true });

    window.addEventListener('scroll', this.markDirty, { capture: true, passive: true });
    window.addEventListener('scroll', this.onToastScroll, { capture: true, passive: true });
    window.addEventListener('resize', this.markDirty, { passive: true });
    window.addEventListener('pointermove', this.onPointerMove, { passive: true });
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('wheel', this.onWheel, { passive: true });
    document.addEventListener('dblclick', this.onWheel);
    window.addEventListener('inferencex:action', this.onAction);
    window.addEventListener('wheel', this.onInput, { passive: true });
    window.addEventListener('touchstart', this.onInput, { passive: true });
    document.addEventListener('pointerover', this.onPointerOver);
    document.addEventListener('focusin', this.onFocusIn);
    document.addEventListener('click', this.onClick, true);
    document.addEventListener('visibilitychange', this.onVisibility);
    this.audio.onMusicStart = () => this.later(() => this.lofi(), 2500);

    this.scan();
    this.startLoops();
    this.requestFrame();
    this.welcomeBack();
  }

  /** Zeniba's line when someone comes back after a few hours: a prefix-cache hit. */
  private welcomeBack(): void {
    let last: number;
    try {
      last = Number(localStorage.getItem(LAST_VISIT_KEY)) || 0;
      localStorage.setItem(LAST_VISIT_KEY, String(Date.now()));
    } catch {
      return;
    }
    if (last > 0 && Date.now() - last > RETURN_AFTER_MS)
      this.later(() => this.cite('zeniba'), 3500);
  }

  setStrings(strings: GhibliStrings): void {
    this.strings = strings;
    for (const entry of this.kodama.values()) {
      entry.button.setAttribute('aria-label', strings.kodama);
    }
    this.offer?.gold.setAttribute('aria-label', strings.gold);
  }

  setFilm(film: GhibliFilm): void {
    this.film = film;
    // Each film's still shows only its own cast: what the last film sent across leaves now.
    for (const [cast, selector] of Object.entries(FILM_CAST)) {
      if (cast === film) continue;
      for (const el of this.layer.querySelectorAll(selector)) el.remove();
    }
    this.fillStrip();
  }

  /** The film's own frames, led by the stills of the latest passport stamps. */
  private fillStrip(): void {
    const stamped = readPassport()
      .toReversed()
      .slice(0, 3)
      .map((id) => STAMP_STILLS[id]);
    const names = [...new Set([...stamped, ...CARD_FRAMES[this.film]])].slice(0, 4);
    this.cardStrip.replaceChildren(
      ...names.map((name, index) => {
        const frame = still(name, 'ghibli-card-frame');
        if (index < stamped.length) frame.dataset.stamp = 'true';
        return frame;
      }),
    );
    this.cardStrip.dataset.full = readPassport().length === STAMPS.length ? 'true' : '';
    this.stripKey = '';
  }

  /** Stamps the passport; the banner and the film strip pick the new stamp up. */
  private stamp(id: Stamp): void {
    if (!stampPassport(id)) return;
    track('ghibli_passport_stamped', { stamp: id, count: readPassport().length });
  }

  /**
   * The gap in the first visible chart card's header, between the title and the toolbar and
   * above the plot. The film strip lives there, and a line docks there when nothing else is free.
   */
  private headerDock(): DOMRect | null {
    const viewportHeight = window.innerHeight;
    for (const entry of this.charts.values()) {
      if (!entry.svg.isConnected) continue;
      const cardEl = entry.svg.closest(CARD);
      if (!cardEl) continue;
      // Measured now, not from the last frame: a route change or a late chart moves the card.
      const card = cardEl.getBoundingClientRect();
      if (card.width < 640) continue;
      if (card.top < HEADER_HEIGHT + 4 || card.top + 90 > viewportHeight) continue;
      const plotTop = entry.svg.getBoundingClientRect().top;
      let toolbar = card.right - 24;
      for (const button of cardEl.querySelectorAll('button')) {
        const rect = button.getBoundingClientRect();
        if (rect.width > 0 && rect.bottom < plotTop && rect.left > card.left + card.width * 0.4) {
          toolbar = Math.min(toolbar, rect.left);
        }
      }
      let title = card.left + 24;
      for (const text of cardEl.querySelectorAll('h1, h2, h3, h4, p, img, svg')) {
        if (text === entry.svg || entry.svg.contains(text)) continue;
        const rect = text.getBoundingClientRect();
        if (rect.width === 0 || rect.top >= plotTop || rect.right >= toolbar) continue;
        if (rect.bottom < card.top) continue;
        title = Math.max(title, rect.right);
      }
      const left = title + 24;
      const right = toolbar - 20;
      const top = card.top + 6;
      const bottom = plotTop - 4;
      if (right - left >= 280 && bottom - top >= 44) {
        const dock = new DOMRect(left, top, right - left, bottom - top);
        const hits = this.protectedRects().some(
          (r) =>
            r.left < dock.right &&
            r.right > dock.left &&
            r.top < dock.bottom &&
            r.bottom > dock.top,
        );
        if (!hits && !this.overProtected(dock)) return dock;
      }
    }
    return null;
  }

  /** The film strip: right-aligned in the header dock, dropping frames to fit, or hidden. */
  private placeStrip(): void {
    const now = performance.now();
    const docked =
      this.toast.classList.contains('is-docked') && this.toast.classList.contains('is-visible');
    const dock = docked ? null : this.headerDock();
    if (!dock) {
      this.cardStrip.hidden = true;
      this.stripKey = '';
      return;
    }
    const key = `${dock.left}|${dock.top}|${dock.width}|${dock.height}|${this.film}`;
    if (key === this.stripKey && now - this.stripAt < 2000) return;
    this.stripKey = key;
    this.stripAt = now;
    const frames = [...this.cardStrip.children] as HTMLElement[];
    // The largest frames that fit the gap, with as many frames as fit beside each other.
    for (const [frameWidth, frameHeight] of FRAME_SIZES) {
      const height = frameHeight + 8;
      if (dock.height < height) continue;
      const top = dock.top + (dock.height - height) / 2;
      for (let count = frames.length; count >= Math.min(2, frames.length); count -= 1) {
        const width = count * (frameWidth + 6) + 6;
        const left = dock.right - width;
        if (left < dock.left) continue;
        const box = { left, top, width, height };
        if (this.overProtected(box)) continue;
        frames.forEach((frame, index) => {
          frame.hidden = index >= count;
          frame.style.width = `${frameWidth}px`;
          frame.style.height = `${frameHeight}px`;
        });
        this.cardStrip.style.transform = `translate3d(${left}px, ${top}px, 0) rotate(-1deg)`;
        this.cardStrip.hidden = false;
        return;
      }
    }
    this.cardStrip.hidden = true;
  }

  /** A small greeting when a film chip is chosen. */
  greet(film: GhibliFilm): void {
    this.film = film;
    this.audio.play('chime', { volume: 0.3, rate: random(0.96, 1.06) });
    if (film === 'spirited') {
      this.noFacePeek();
      this.cite('sen', 'still-chihiro016');
    }
    if (film === 'heron') {
      this.heronFlight(true);
      this.cite('guide');
    }
    if (film === 'howl') {
      this.audio.play('crackle', { volume: 0.3, gap: 1500 });
      this.turnipHop();
      this.cite('bacon', 'still-howl016', 'theme-merry-go-round');
    }
    if (film === 'mononoke') {
      this.footprints();
      this.cite('gosa', undefined, 'theme-kodama');
    }
    if (film === 'ponyo') {
      const first = [...this.charts.values()].find(
        (entry) => entry.bounds && visibleFrontier(entry.svg),
      );
      if (first && !this.reduced) {
        this.ponyoCited = false;
        this.surf(first);
      } else {
        this.ponyoRise();
        this.cite('ponyo', undefined, 'theme-ponyo');
      }
    }
  }

  // ---- timers -------------------------------------------------------------------------

  private later(callback: () => void, ms: number): void {
    const id = window.setTimeout(() => {
      this.timers.delete(id);
      if (!this.destroyed) callback();
    }, ms);
    this.timers.add(id);
  }

  private loop(delay: () => [number, number], callback: () => void): void {
    const [min, max] = delay();
    this.later(
      () => {
        if (document.visibilityState === 'visible') callback();
        this.loop(delay, callback);
      },
      random(min, max),
    );
  }

  private startLoops(): void {
    if (this.reduced) return;
    // The heron flies only over its own film, so no film's still carries another film's cast.
    this.later(() => {
      if (this.film === 'heron') this.heronFlight(false);
    }, 14_000);
    this.loop(
      () => [28_000, 45_000],
      () => {
        if (this.film === 'heron') this.heronFlight(true);
      },
    );
    this.loop(
      () => [80_000, 140_000],
      () => {
        if (this.film === 'spirited') this.hakuFlight();
      },
    );
    this.loop(
      () => [45_000, 80_000],
      () => {
        if (this.film === 'spirited') this.noFacePeek();
      },
    );
    this.loop(
      () => [18_000, 32_000],
      () => {
        if (this.film === 'heron') this.warawaraRise();
      },
    );
    this.loop(
      () => [40_000, 70_000],
      () => {
        if (this.film === 'howl') this.turnipHop();
      },
    );
    this.loop(
      () => [35_000, 60_000],
      () => {
        if (this.film === 'mononoke') this.footprints();
      },
    );
  }

  private animate(
    el: Element,
    keyframes: Keyframe[],
    options: KeyframeAnimationOptions,
    onFinish?: () => void,
  ): void {
    if (typeof el.animate !== 'function') {
      onFinish?.();
      return;
    }
    const animation = el.animate(keyframes, options);
    this.animations.add(animation);
    animation.addEventListener('finish', () => {
      this.animations.delete(animation);
      if (!this.destroyed) onFinish?.();
    });
  }

  // ---- static residents ---------------------------------------------------------------

  /** The castle walks along the painted horizon, behind the cards, so it never covers text. */
  private buildCastle(): void {
    const sky = document.querySelector<HTMLElement>('.ghibli-sky');
    const walk = div('ghibli-castle-walk', sky ?? this.layer);
    const nearHills = sky?.querySelector('.ghibli-hills-near');
    nearHills?.before(walk);
    const bob = div('ghibli-castle-bob', walk);
    bob.append(sprite('castle-walk', 'ghibli-castle-img'));
    this.castle = walk;
  }

  private buildFilmResidents(): void {
    const san = div('ghibli-resident ghibli-san ghibli-only-mononoke', this.layer);
    san.append(sprite('san-wolf', ''));
    const peek = div('ghibli-resident ghibli-noface-stand ghibli-only-spirited', this.layer);
    peek.append(sprite('noface-peek', ''));
  }

  private ensureFooterSea(): void {
    const footer = document.querySelector<HTMLElement>(FOOTER);
    if (!footer) return;
    this.watchFooter(footer);
    if (this.footerSea?.isConnected && this.footerSea.parentElement === footer) return;
    this.footerSea?.remove();
    const sea = div('ghibli-footer-sea no-export');
    sea.setAttribute('aria-hidden', 'true');
    div('ghibli-wave ghibli-wave-back', sea);
    div('ghibli-wave ghibli-wave-mid', sea);
    div('ghibli-wave ghibli-wave-front', sea);
    const jellies: [string, string][] = [
      ['jellyfish', 'ghibli-jelly ghibli-jelly-a'],
      ['jellyfish', 'ghibli-jelly ghibli-jelly-b'],
      ['jellyfish', 'ghibli-jelly ghibli-jelly-c ghibli-only-ponyo'],
      ['ponyo-jelly', 'ghibli-jelly ghibli-ponyo-bubble ghibli-only-ponyo'],
    ];
    for (const [name, className] of jellies) sea.append(sprite(name, className));
    // The film's last card, in the corner of the sea.
    const end = div('ghibli-owari', sea);
    end.textContent = 'おわり';
    footer.prepend(sea);
    this.footerSea = sea;
  }

  /** No-Face on the sea railway, the first time the footer comes into view in a session. */
  private watchFooter(footer: HTMLElement): void {
    if (this.observedFooter === footer || typeof IntersectionObserver === 'undefined') return;
    this.footerObserver?.disconnect();
    this.observedFooter = footer;
    this.footerObserver = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        this.footerObserver?.disconnect();
        this.trainMoment();
      },
      { threshold: 0.25 },
    );
    this.footerObserver.observe(footer);
  }

  private trainMoment(): void {
    let seen = false;
    try {
      seen = sessionStorage.getItem(TRAIN_SEEN_KEY) === '1';
      sessionStorage.setItem(TRAIN_SEEN_KEY, '1');
    } catch {}
    const footer = document.querySelector<HTMLElement>(FOOTER);
    if (!footer || this.trainCard?.isConnected) return;
    const card = div('ghibli-train-card no-export');
    card.setAttribute('aria-hidden', 'true');
    card.append(still('still-chihiro042', ''));
    footer.append(card);
    this.trainCard = card;
    if (!seen) this.cite('oneway', undefined, 'theme-sixth-station');
  }

  // ---- scanning -----------------------------------------------------------------------

  private scheduleScan(): void {
    if (this.scanTimer !== undefined) return;
    this.scanTimer = window.setTimeout(() => {
      this.scanTimer = undefined;
      if (!this.destroyed) this.scan();
    }, 250);
  }

  private scan(): void {
    this.dirty = true;
    this.ensureFooterSea();
    this.roundFiveScan();
    // A route change or a re-render can bring content under a showing token.
    this.recheckToast();

    const svgs = [...document.querySelectorAll<SVGSVGElement>(CHART_SVG)].slice(0, MAX_CHARTS);
    for (const [svg, entry] of this.charts) {
      if (!svg.isConnected || !svgs.includes(svg)) {
        for (const soot of entry.soots) soot.el.remove();
        for (const rider of this.riders) {
          if (rider.chart === entry) {
            rider.el.remove();
            this.riders.delete(rider);
          }
        }
        this.charts.delete(svg);
      }
    }
    for (const svg of svgs) {
      let entry = this.charts.get(svg);
      if (!entry) {
        entry = { svg, soots: this.makeSoots(), bounds: null, ledge: null, surfed: false };
        this.charts.set(svg, entry);
      }
      if (!entry.surfed && svg.querySelector(POINTS)) {
        entry.surfed = true;
        this.waitForFrontier(entry, 0);
      }
    }

    const chartCards = svgs
      .map((svg) => svg.closest(CARD))
      .filter((card): card is Element => card !== null);
    const cards = [...new Set(chartCards)];
    if (cards.length < MAX_CARDS) {
      for (const card of document.querySelectorAll(CARD)) {
        if (cards.length >= MAX_CARDS) break;
        if (!cards.includes(card) && card.getBoundingClientRect().width >= 260) cards.push(card);
      }
    }
    for (const [card, entry] of this.kodama) {
      if (!card.isConnected || !cards.includes(card)) {
        entry.button.remove();
        entry.second.remove();
        this.kodama.delete(card);
      }
    }
    for (const card of cards) {
      if (!this.kodama.has(card)) this.kodama.set(card, this.makeKodama(card));
    }
  }

  /** Frontiers fade in after the points, so look a few times before giving up. */
  private waitForFrontier(entry: ChartEntry, tries: number): void {
    this.later(() => {
      if (!entry.svg.isConnected) return;
      if (visibleFrontier(entry.svg) && entry.bounds) this.surf(entry);
      else if (tries < 6) this.waitForFrontier(entry, tries + 1);
    }, 1200);
  }

  private makeSoots(): Soot[] {
    const names = ['soot-konpeito', 'soot-3', 'soot-2', 'soot-3'];
    return names.map((name, index) => {
      const el = sprite(name, 'ghibli-soot');
      el.hidden = true;
      this.layer.append(el);
      const height = name === 'soot-2' ? 30 : 22;
      el.style.height = `${height}px`;
      return {
        el,
        x: 0.12 + index * 0.24 + random(-0.05, 0.05),
        speed: random(14, 26),
        dir: Math.random() < 0.5 ? -1 : 1,
        flee: 0,
        width: name === 'soot-konpeito' ? 35 : name === 'soot-2' ? 16 : 22,
        height,
      };
    });
  }

  private makeKodama(card: Element): KodamaEntry {
    const variant = ['kodama-1', 'kodama-2', 'kodama-3'][this.kodamaVariant % 3];
    this.kodamaVariant += 1;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'ghibli-kodama';
    button.hidden = true;
    button.setAttribute('aria-label', this.strings.kodama);
    button.append(sprite(variant, ''));
    const second = sprite(variant === 'kodama-1' ? 'kodama-3' : 'kodama-1', 'ghibli-kodama-buddy');
    second.hidden = true;
    const entry: KodamaEntry = { card, button, second, clicks: 0, lastClick: 0, rect: null };
    const rattle = () => this.rattle(entry);
    button.addEventListener('pointerenter', rattle);
    button.addEventListener('focus', rattle);
    button.addEventListener('click', () => this.kodamaClick(entry));
    this.layer.append(button, second);
    return entry;
  }

  private rattle(entry: KodamaEntry): void {
    entry.button.classList.remove('is-rattling');
    void entry.button.offsetWidth;
    entry.button.classList.add('is-rattling');
    this.audio.play('kodama-rattle', { volume: 0.35, rate: random(0.92, 1.15) });
  }

  private kodamaClick(entry: KodamaEntry): void {
    const now = performance.now();
    entry.clicks = now - entry.lastClick < 1600 ? entry.clicks + 1 : 1;
    entry.lastClick = now;
    this.rattle(entry);
    if (entry.clicks >= 3) {
      entry.clicks = 0;
      this.kodamaChorus(entry.card);
    }
  }

  // ---- frame loop ---------------------------------------------------------------------

  private requestFrame(): void {
    if (this.frame === undefined && !this.destroyed) {
      this.frame = requestAnimationFrame(this.tick);
    }
  }

  private readonly markDirty = () => {
    this.dirty = true;
    this.onInput();
  };

  private readonly tick = (time: number) => {
    this.frame = undefined;
    if (this.destroyed) return;
    const dt = Math.min(0.05, (time - (this.lastTick || time)) / 1000);
    this.lastTick = time;
    if (this.dirty || time - this.lastMeasure > 500) this.measure(time);

    const viewportHeight = window.innerHeight;
    for (const entry of this.charts.values()) this.drawSoots(entry, dt, viewportHeight);
    this.drawRiders(time);
    this.drawOffer(time);

    if (!this.gathered && time - this.lastInput > IDLE_MS) this.gather();

    if (document.visibilityState === 'visible') this.requestFrame();
  };

  private measure(time: number): void {
    this.dirty = false;
    this.lastMeasure = time;
    const viewportHeight = window.innerHeight;
    const small = window.innerWidth < 640;
    for (const entry of this.charts.values()) {
      entry.bounds = entry.svg.isConnected ? plotBounds(entry.svg) : null;
      const card = entry.svg.isConnected ? entry.svg.closest(CARD) : null;
      entry.ledge = card ? card.getBoundingClientRect() : null;
    }
    for (const entry of this.kodama.values()) {
      const rect = entry.card.isConnected ? entry.card.getBoundingClientRect() : null;
      entry.rect = rect;
      const height = small ? 44 : 46;
      const visible =
        rect !== null &&
        rect.width > 0 &&
        rect.top - height > HEADER_HEIGHT - 6 &&
        rect.top < viewportHeight;
      entry.button.hidden = !visible;
      entry.second.hidden = !visible || this.film !== 'mononoke' || small;
      if (!visible || !rect) continue;
      // Perch on the card's top edge where nothing sits behind it: a table control, a chip or a
      // tab beside the card would otherwise be covered. No clear spot: the kodama stays away.
      const y = rect.top - height * 0.86;
      const width = 44;
      const spots = small
        ? [rect.right - 52, rect.right - 96, rect.left + 24]
        : [rect.right - 132, rect.right - 220, rect.right - 320, rect.left + 160, rect.left + 28];
      const x = spots.find(
        (spot) => !this.overProtected(new DOMRect(spot - 4, y - 4, width + 8, height * 0.86 + 2)),
      );
      if (x === undefined) {
        entry.button.hidden = true;
        entry.second.hidden = true;
        continue;
      }
      entry.button.style.transform = `translate3d(${x}px, ${y}px, 0)`;
      const buddy = new DOMRect(rect.left + 24, rect.top - 38 * 0.86 - 4, 36, 38 * 0.86 + 2);
      if (!entry.second.hidden && this.overProtected(buddy)) entry.second.hidden = true;
      entry.second.style.transform = `translate3d(${rect.left + 28}px, ${rect.top - 38 * 0.86}px, 0)`;
    }
    // San and the No-Face peek live at the screen's edges; they step out of view while a
    // chart, a table or a control sits behind them.
    for (const resident of this.layer.querySelectorAll<HTMLElement>('.ghibli-resident')) {
      const rect = resident.getBoundingClientRect();
      if (rect.width === 0) continue;
      const covered = this.overProtected(rect);
      if (covered !== resident.classList.contains('is-tucked'))
        resident.classList.toggle('is-tucked', covered);
    }
    // A scroll can bring content under a flight or a peek: it steps out of view until clear.
    for (const el of this.layer.querySelectorAll<HTMLElement>('.ghibli-transient')) {
      const rect = el.getBoundingClientRect();
      if (rect.width === 0) continue;
      el.classList.toggle('is-ducked', this.overProtected(rect));
    }
    // The walking castle is painted behind the page; where page text sits in front of it (an
    // article page, say) it waits out of sight.
    if (this.castle) {
      const rect = this.castle.getBoundingClientRect();
      if (rect.width > 0) this.castle.classList.toggle('is-ducked', this.overProtected(rect));
    }
    this.placeStrip();
  }

  /** Hit-tests a grid of points; the sprite layer ignores the pointer, so it is not hit. */
  private overProtected(rect: { left: number; top: number; width: number; height: number }) {
    return coversContent(rect, this.layer);
  }

  /** The viewport's free cells, cached briefly: several placements often happen together. */
  private safeMap(): SafeMap {
    const now = performance.now();
    if (!this.map || now - this.mapAt > 300) {
      const art = this.layer.querySelectorAll(
        '.ghibli-card-strip:not([hidden]), .ghibli-kodama:not([hidden]), .ghibli-resident:not(.is-tucked)',
      );
      this.map = new SafeMap(this.layer, HEADER_HEIGHT, [...art]);
      this.mapAt = now;
    }
    return this.map;
  }

  /**
   * Places a peek or a pop-up on free cells near `prefer`, fading in where it lands; returns
   * false (and removes it) when no free box exists.
   */
  private placeStatic(el: HTMLElement, width: number, aspect: number, prefer: Box): boolean {
    if (modalOpen()) {
      el.remove();
      return false;
    }
    const map = this.safeMap();
    for (const scale of [1, 0.75, 0.55]) {
      const w = Math.round(width * scale);
      const h = Math.round(w * aspect) + 8;
      const spot = map.box(w, h, { x: prefer.x - w / 2, y: prefer.y - h });
      if (!spot) continue;
      Object.assign(el.style, {
        left: `${spot.x}px`,
        top: `${spot.y}px`,
        right: 'auto',
        bottom: 'auto',
        width: `${w}px`,
        translate: 'none',
        animation: 'ghibli-fade-in 0.6s ease-out both',
      });
      el.classList.add('ghibli-transient');
      return true;
    }
    el.remove();
    return false;
  }

  private drawSoots(entry: ChartEntry, dt: number, viewportHeight: number): void {
    // They walk the card's top edge, never the plot floor, so no point or axis is behind them.
    const ledge = entry.ledge;
    const bounds = ledge && {
      left: ledge.left + 24,
      right: ledge.right - 24,
      bottom: ledge.top + 1,
    };
    const visible =
      bounds !== null &&
      bounds.bottom > HEADER_HEIGHT + 30 &&
      bounds.bottom < viewportHeight - 4 &&
      bounds.right - bounds.left > 120;
    for (const soot of entry.soots) {
      if (!visible || !bounds || this.gathered) {
        soot.el.hidden = true;
        continue;
      }
      soot.el.hidden = false;
      const width = bounds.right - bounds.left;
      let px = bounds.left + soot.x * width;
      const py = bounds.bottom - soot.height + 3;
      if (!this.reduced) {
        const pointer = this.pointer;
        if (pointer) {
          const dx = px - pointer.x;
          const dy = py + soot.height / 2 - pointer.y;
          if (dx * dx + dy * dy < 85 * 85) {
            soot.dir = dx >= 0 ? 1 : -1;
            if (soot.flee <= 0) {
              soot.el.classList.add('is-hopping');
              this.audio.play('soot-rustle', { volume: 0.22, rate: random(1.05, 1.3) });
            }
            soot.flee = 0.6;
          }
        }
        const speed = soot.flee > 0 ? 260 : soot.speed;
        soot.flee = Math.max(0, soot.flee - dt);
        if (soot.flee === 0) soot.el.classList.remove('is-hopping');
        if (soot.flee === 0 && Math.random() < dt * 0.25) soot.dir = soot.dir === 1 ? -1 : 1;
        soot.x += (soot.dir * speed * dt) / width;
        if (soot.x < 0.02) {
          soot.x = 0.02;
          soot.dir = 1;
        } else if (soot.x > 0.98) {
          soot.x = 0.98;
          soot.dir = -1;
        }
        px = bounds.left + soot.x * width;
      }
      const flip = soot.dir === -1 ? -1 : 1;
      soot.el.style.transform = `translate3d(${px - soot.width / 2}px, ${py}px, 0) scaleX(${flip})`;
    }
  }

  /**
   * Ponyo runs along the real frontier line. She stands on top of it, on the empty side of the
   * envelope, so the line and the points under it stay visible.
   */
  private drawRiders(time: number): void {
    for (const rider of this.riders) {
      const bounds = rider.chart.bounds;
      const progress = (time - rider.start) / rider.duration;
      const matrix = rider.path.isConnected ? rider.path.getScreenCTM() : null;
      if (progress >= 1 || !bounds || !matrix) {
        rider.el.remove();
        this.riders.delete(rider);
        if (progress >= 1) {
          this.hamReveal(rider);
          this.ponyoArrived();
        }
        continue;
      }
      const eased = progress < 0.5 ? 2 * progress * progress : 1 - (-2 * progress + 2) ** 2 / 2;
      const at = eased * rider.length;
      const toScreen = (length: number) => {
        const local = rider.path.getPointAtLength(Math.max(0, Math.min(rider.length, length)));
        return new DOMPoint(local.x, local.y).matrixTransform(matrix);
      };
      const point = toScreen(at);
      const ahead = toScreen(at + 6);
      const behind = toScreen(at - 6);
      const height = rider.el.offsetHeight || 54;
      const width = rider.el.offsetWidth || 60;
      // Sit on the open side of the frontier (up and to the right), clear of the line itself:
      // the distance is the box's reach along the normal, so its edge never crosses the tangent.
      const tx = ahead.x - behind.x;
      const ty = ahead.y - behind.y;
      const span = Math.hypot(tx, ty) || 1;
      let nx = ty / span;
      let ny = -tx / span;
      if (nx - ny < 0) {
        nx = -nx;
        ny = -ny;
      }
      const reach = (width / 2) * Math.abs(nx) + (height / 2) * Math.abs(ny) + 6;
      // Hidden labels (parallelism off, faded series) keep their boxes; skip them.
      const labels = rider.labels
        .filter(
          (label) =>
            label.getBBox().width > 0 &&
            label.checkVisibility({ opacityProperty: true, visibilityProperty: true }),
        )
        .map((label) => label.getBoundingClientRect());
      const clear = (x: number, y: number) =>
        !labels.some(
          (rect) =>
            rect.left < x + width / 2 &&
            rect.right > x - width / 2 &&
            rect.top < y + height / 2 &&
            rect.bottom > y - height / 2,
        );
      // Where a series label sits on the line, she rides further out along the normal, so
      // she keeps following the frontier's shape instead of vanishing.
      let cx = point.x + nx * reach;
      let cy = point.y + ny * reach;
      let overLabel = true;
      for (let push = 0; push <= 96; push += 8) {
        const x = point.x + nx * (reach + push);
        const y = point.y + ny * (reach + push);
        if (clear(x, y)) {
          cx = x;
          cy = y;
          overLabel = false;
          break;
        }
      }
      const flip = point.x < rider.lastX - 0.5 ? -1 : 1;
      rider.lastX = point.x;
      const inside =
        cx - width / 2 >= bounds.left - 4 &&
        cx + width / 2 <= bounds.right + 4 &&
        cy - height / 2 >= bounds.top - 8 &&
        cy - height / 2 > HEADER_HEIGHT;
      const target = inside && !overLabel ? Math.min(1, progress * 8, (1 - progress) * 6) : 0;
      // Ease toward the target so she ducks behind a series label instead of blinking.
      rider.fade += (target - rider.fade) * 0.35;
      rider.el.style.opacity = String(rider.fade);
      rider.el.style.transform = `translate3d(${cx - width / 2}px, ${cy - height / 2}px, 0) scaleX(${flip})`;
    }
  }

  /**
   * Ponyo's ham ramen, on the open side of the frontier where she last rode in view: a framed
   * still from the film, clear of the line, every series label and the plot's edges.
   */
  private hamReveal(rider: Rider): void {
    const bounds = rider.chart.bounds;
    const matrix = rider.path.isConnected ? rider.path.getScreenCTM() : null;
    // A small plot has no open space this size: the toast carries the scene instead.
    if (!bounds || !matrix || bounds.right - bounds.left < 560) return;
    const width = 108;
    const height = 76;
    const labels = rider.labels
      .filter((label) => label.checkVisibility({ opacityProperty: true, visibilityProperty: true }))
      .map((label) => label.getBoundingClientRect());
    const toScreen = (length: number) => {
      const local = rider.path.getPointAtLength(Math.max(0, Math.min(rider.length, length)));
      return new DOMPoint(local.x, local.y).matrixTransform(matrix);
    };
    // Any point, line or label of any series under the box rules the spot out.
    const coversData = (box: { left: number; top: number; right: number; bottom: number }) => {
      for (let i = 0; i <= 12; i += 1) {
        for (let j = 0; j <= 8; j += 1) {
          const hit = document.elementFromPoint(
            box.left - 6 + ((box.right - box.left + 12) * i) / 12,
            box.top - 6 + ((box.bottom - box.top + 12) * j) / 8,
          );
          if (!hit || this.layer.contains(hit)) continue;
          if (hit.matches('circle, text, use, foreignObject *, path:not([class*="grid"])'))
            return true;
        }
      }
      return false;
    };
    // From where she stopped, back along the frontier: the first open spot beside the line.
    for (let back = 0; back <= rider.length * 0.6; back += 24) {
      const at = rider.length - back;
      const point = toScreen(at);
      const ahead = toScreen(at + 6);
      const behind = toScreen(at - 6);
      const tx = ahead.x - behind.x;
      const ty = ahead.y - behind.y;
      const span = Math.hypot(tx, ty) || 1;
      let nx = ty / span;
      let ny = -tx / span;
      if (nx - ny < 0) {
        nx = -nx;
        ny = -ny;
      }
      const reach = (width / 2) * Math.abs(nx) + (height / 2) * Math.abs(ny) + 10;
      for (let push = 0; push <= 160; push += 16) {
        const cx = point.x + nx * (reach + push);
        const cy = point.y + ny * (reach + push);
        const box = {
          left: cx - width / 2,
          top: cy - height / 2,
          right: cx + width / 2,
          bottom: cy + height / 2,
        };
        if (box.left < bounds.left + 4 || box.right > bounds.right - 4) continue;
        if (box.top < bounds.top + 4 || box.bottom > bounds.bottom - 4 || box.top < HEADER_HEIGHT)
          continue;
        const hit = labels.some(
          (r) =>
            r.left < box.right && r.right > box.left && r.top < box.bottom && r.bottom > box.top,
        );
        if (hit || coversData(box)) continue;
        const el = div('ghibli-ponyo-ham', this.layer);
        el.append(still('still-ponyo035', ''));
        const tag = document.createElement('span');
        tag.textContent = this.strings.hamTag;
        el.append(tag);
        el.style.transform = `translate3d(${box.left}px, ${box.top}px, 0)`;
        this.later(() => el.remove(), 5200);
        this.audio.play('chime', { volume: 0.3, rate: 1.2, gap: 500 });
        return;
      }
    }
  }

  private ponyoArrived(): void {
    this.stamp('ponyo');
    if (this.ponyoCited) return;
    this.ponyoCited = true;
    // Another line is showing or waiting: it keeps the token.
    if (this.toastPending || this.toast.classList.contains('is-visible')) return;
    // At the frontier's end: the ham ramen scene.
    this.cite('ponyo', 'still-ponyo035');
  }

  // ---- characters ---------------------------------------------------------------------

  private surf(entry: ChartEntry): void {
    if (this.reduced || !entry.bounds || !entry.svg.isConnected) return;
    const path = visibleFrontier(entry.svg);
    if (!path) return;
    for (const rider of this.riders) if (rider.chart === entry) return;
    const el = div('ghibli-ponyo-surf');
    el.style.opacity = '0';
    el.append(sprite('ponyo-wave', ''));
    this.layer.append(el);
    const length = path.getTotalLength();
    this.riders.add({
      chart: entry,
      el,
      start: performance.now(),
      duration: Math.max(5200, Math.min(8000, length * 9)),
      path,
      length,
      lastX: -Infinity,
      fade: 0,
      labels: [...entry.svg.querySelectorAll<SVGGraphicsElement>(SERIES_LABELS)],
    });
    if (this.film === 'ponyo') this.audio.sting('theme-ponyo');
    else this.audio.play('wave', { volume: 0.28 });
    this.requestFrame();
  }

  /**
   * Flies a sprite along the widest free horizontal lane on screen, fading in and out inside
   * it. It shrinks to fit a narrower lane, and stays home if no lane is clear.
   */
  private flyAcross(
    name: string,
    className: string,
    width: number,
    aspect: number,
    direction: 'left' | 'right',
    prefer: 'top' | 'bottom' = 'top',
  ): boolean {
    if (modalOpen()) return false;
    const map = this.safeMap();
    for (const scale of [1, 0.7, 0.5, 0.36]) {
      const w = Math.round(width * scale);
      const h = Math.round(w * aspect) + 16;
      const lane = map.lane(h, w * 2.4, prefer);
      if (!lane) continue;
      const el = div(`ghibli-flight ghibli-transient ${className}`, this.layer);
      el.style.width = `${w}px`;
      el.append(sprite(name, ''));
      const y = lane.y + 8;
      const from = direction === 'left' ? lane.x1 - w : lane.x0;
      const to = direction === 'left' ? lane.x0 : lane.x1 - w;
      const duration = Math.max(5000, (Math.abs(to - from) / 90) * 1000);
      this.animate(
        el,
        [
          { transform: `translate3d(${from}px, ${y}px, 0)`, opacity: 0 },
          {
            transform: `translate3d(${from + (to - from) * 0.1}px, ${y}px, 0)`,
            opacity: 1,
            offset: 0.1,
          },
          {
            transform: `translate3d(${from + (to - from) * 0.9}px, ${y}px, 0)`,
            opacity: 1,
            offset: 0.9,
          },
          { transform: `translate3d(${to}px, ${y}px, 0)`, opacity: 0 },
        ],
        { duration, easing: 'linear' },
        () => el.remove(),
      );
      return true;
    }
    return false;
  }

  private heronFlight(withParakeets: boolean): void {
    if (this.reduced) return;
    if (!this.flyAcross('heron-wings', 'ghibli-heron', 170, 0.589, 'left')) return;
    this.audio.play('wingflap', { volume: 0.22 });
    if (withParakeets) {
      this.later(() => {
        if (this.film !== 'heron') return;
        this.map = null;
        if (this.flyAcross('parakeets', 'ghibli-parakeets', 230, 0.544, 'left')) {
          this.audio.play('parakeet', { volume: 0.18 });
        }
      }, 2600);
    }
  }

  private hakuFlight(): void {
    if (this.reduced) return;
    if (this.flyAcross('haku', 'ghibli-haku', 300, 0.592, 'left')) {
      this.audio.play('wind', { volume: 0.2 });
    }
  }

  private noFacePeek(): void {
    const stand = this.layer.querySelector<HTMLElement>('.ghibli-noface-stand');
    if (!stand) return;
    stand.classList.add('is-visible');
    this.later(() => stand.classList.remove('is-visible'), 11_000);
  }

  private warawaraRise(): void {
    // Each one drifts up inside a free column of the screen, or stays home.
    if (this.reduced) return;
    const map = this.safeMap();
    const width = window.innerWidth;
    for (let index = 0; index < 3; index += 1) {
      const spot = map.box(60, 220, { x: random(0.08, 0.92) * width, y: window.innerHeight });
      if (!spot) continue;
      const el = div('ghibli-warawara ghibli-transient', this.layer);
      el.append(sprite(index === 1 ? 'warawara-2' : 'warawara-1', ''));
      const x = spot.x + 6;
      this.animate(
        el,
        [
          { transform: `translate3d(${x}px, ${spot.y + 170}px, 0)`, opacity: 0 },
          {
            transform: `translate3d(${x + 4}px, ${spot.y + 110}px, 0)`,
            opacity: 0.95,
            offset: 0.3,
          },
          { transform: `translate3d(${x - 4}px, ${spot.y + 40}px, 0)`, opacity: 0.85, offset: 0.7 },
          { transform: `translate3d(${x}px, ${spot.y}px, 0)`, opacity: 0 },
        ],
        {
          duration: random(9000, 12_000),
          delay: index * 1200,
          easing: 'ease-in-out',
          fill: 'backwards',
        },
        () => el.remove(),
      );
    }
  }

  private turnipHop(): void {
    // Turnip Head hops along a free lane near the bottom of the screen, or not at all.
    if (this.reduced) return;
    const lane = this.safeMap().lane(96, 320, 'bottom');
    if (!lane) return;
    const el = div('ghibli-turnip ghibli-transient', this.layer);
    const hop = div('ghibli-turnip-hop', el);
    hop.append(sprite('turnip', ''));
    el.style.bottom = 'auto';
    el.style.top = '0px';
    const y = lane.y + 10;
    const from = lane.x0;
    const to = lane.x1 - 90;
    this.animate(
      el,
      [
        { transform: `translate3d(${from}px, ${y}px, 0)`, opacity: 0 },
        {
          transform: `translate3d(${from + (to - from) * 0.08}px, ${y}px, 0)`,
          opacity: 1,
          offset: 0.08,
        },
        {
          transform: `translate3d(${from + (to - from) * 0.92}px, ${y}px, 0)`,
          opacity: 1,
          offset: 0.92,
        },
        { transform: `translate3d(${to}px, ${y}px, 0)`, opacity: 0 },
      ],
      { duration: Math.max(5000, ((to - from) / 90) * 1000), easing: 'linear' },
      () => el.remove(),
    );
  }

  private footprints(): void {
    const width = window.innerWidth;
    const count = Math.max(6, Math.min(12, Math.floor(width / 120)));
    const start = random(0.04, 0.2) * width;
    const step = (width * 0.7) / count;
    for (let index = 0; index < count; index += 1) {
      this.later(
        () => {
          const x = start + index * step;
          if (!this.safeMap().free(x - 8, window.innerHeight - 64, 32, 58)) return;
          const print = div(`ghibli-footprint${index % 2 ? ' is-right' : ''}`, this.layer);
          print.style.left = `${x}px`;
          const flower = div(`ghibli-flower ghibli-flower-${index % 3}`, print);
          flower.setAttribute('aria-hidden', 'true');
          this.later(() => print.remove(), 9000);
        },
        this.reduced ? 0 : index * 420,
      );
    }
  }

  private ponyoRise(): void {
    const el = div('ghibli-egg-ponyo', this.layer);
    el.append(sprite('ponyo-jelly', ''));
    this.placeStatic(el, 220, 0.519, { x: window.innerWidth / 2, y: window.innerHeight - 20 });
    this.later(() => el.remove(), 8200);
    this.audio.play('wave', { volume: 0.3, gap: 1000 });
  }

  private kodamaChorus(card: Element): void {
    // The chorus stands on the chart card's top edge, like the lone kodama, and leaves out any
    // spot where it would sit on a chart, an axis or a control.
    const rect = card.getBoundingClientRect();
    const onCard = rect.top - CHORUS_HEIGHT > HEADER_HEIGHT && rect.top < window.innerHeight;
    const base = onCard ? rect.top + 4 : window.innerHeight + 4;
    const left = onCard ? rect.left : 0;
    const span = onCard ? rect.width : window.innerWidth;
    const count = span < 640 ? 6 : 11;
    const map = this.safeMap();
    const chorus = div('ghibli-chorus', this.layer);
    let placed = 0;
    for (let index = 0; index < count; index += 1) {
      const x = left + ((index + 0.5) / count) * span;
      const box = { left: x - 24, top: base - CHORUS_HEIGHT };
      if (!map.free(box.left, box.top, 48, CHORUS_HEIGHT)) continue;
      const kodama = sprite(pick(['kodama-1', 'kodama-2', 'kodama-3']), 'ghibli-chorus-kodama');
      kodama.style.left = `${x}px`;
      kodama.style.top = `${box.top}px`;
      kodama.style.animationDelay = `${placed * 90}ms, ${600 + placed * 90}ms`;
      chorus.append(kodama);
      placed += 1;
    }
    for (let index = 0; index < 3; index += 1) {
      this.later(
        () =>
          this.audio.play('kodama-rattle', { volume: 0.3, rate: 0.85 + index * 0.15, gap: 250 }),
        index * 380,
      );
    }
    this.footprints();
    this.later(() => chorus.remove(), 6500);
    this.cite('live', 'still-mononoke025', 'theme-kodama');
    this.stamp('kodama');
  }

  private gather(): void {
    // The pile sits at the bottom centre of the screen; skip the moment if a chart or control is there.
    const zone = {
      left: window.innerWidth / 2 - 110,
      right: window.innerWidth / 2 + 110,
      top: window.innerHeight - 64,
      bottom: window.innerHeight,
    };
    const blocked = this.protectedRects().some(
      (r) =>
        r.left < zone.right && r.right > zone.left && r.top < zone.bottom && r.bottom > zone.top,
    );
    if (blocked) {
      this.lastInput = performance.now();
      return;
    }
    const pile: HTMLImageElement[] = [];
    const names = [
      'soot-3',
      'soot-konpeito',
      'soot-2',
      'soot-3',
      'soot-konpeito',
      'soot-3',
      'soot-2',
    ];
    names.forEach((name, index) => {
      const el = sprite(name, 'ghibli-soot-pile');
      el.style.setProperty('--ghibli-pile-x', `${(index - names.length / 2) * 24}px`);
      el.style.setProperty('--ghibli-pile-y', `${index % 2 ? -10 : 0}px`);
      el.style.animationDelay = `${index * 160}ms`;
      this.layer.append(el);
      pile.push(el);
    });
    this.gathered = pile;
    this.cite('gosa');
  }

  private scatter(): void {
    const pile = this.gathered;
    if (!pile) return;
    this.gathered = null;
    this.audio.play('soot-rustle', { volume: 0.25, gap: 300 });
    for (const el of pile) {
      el.classList.add('is-scattering');
      el.style.setProperty('--ghibli-run', `${random(-60, 60)}vw`);
      this.later(() => el.remove(), 900);
    }
  }

  // ---- No-Face and the export button ------------------------------------------------

  private showOffer(button: HTMLElement): void {
    if (this.offer && this.offer.button === button) {
      this.offer.hideAt = performance.now() + 6000;
      return;
    }
    this.offer?.root.remove();
    const root = div('ghibli-offer');
    root.append(sprite('noface-offer', 'ghibli-offer-noface'));
    const gold = document.createElement('button');
    gold.type = 'button';
    gold.className = 'ghibli-gold';
    gold.setAttribute('aria-label', this.strings.gold);
    gold.addEventListener('click', () => this.takeGold());
    root.append(gold);
    // No-Face stands where he covers no chart or control: above the button, else to its left.
    const rect = button.getBoundingClientRect();
    const blocked = this.protectedRects();
    const candidates: [number, number][] = [
      [rect.width / 2 - OFFER_WIDTH / 2, -OFFER_HEIGHT - 4],
      ...Array.from({ length: 14 }, (_, k): [number, number] => [
        -OFFER_WIDTH - 4 - k * 24,
        rect.height - OFFER_HEIGHT,
      ]),
      [rect.width / 2 - OFFER_WIDTH / 2, rect.height + 4],
    ];
    const spot = candidates.find(([dx, dy]) => {
      const box = {
        left: rect.left + dx,
        right: rect.left + dx + OFFER_WIDTH,
        top: rect.top + dy,
        bottom: rect.top + dy + OFFER_HEIGHT,
      };
      if (box.left < 0 || box.right > window.innerWidth || box.top < HEADER_HEIGHT) return false;
      if (box.bottom > window.innerHeight) return false;
      return !blocked.some(
        (r) => r.left < box.right && r.right > box.left && r.top < box.bottom && r.bottom > box.top,
      );
    });
    if (!spot) return;
    this.layer.append(root);
    this.offer = { root, button, gold, hideAt: performance.now() + 6000, dx: spot[0], dy: spot[1] };
    this.requestFrame();
  }

  private drawOffer(time: number): void {
    const offer = this.offer;
    if (!offer) return;
    const hovered = offer.root.matches(':hover') || offer.root.contains(document.activeElement);
    if (hovered) offer.hideAt = Math.max(offer.hideAt, time + 1500);
    const rect = offer.button.isConnected ? offer.button.getBoundingClientRect() : null;
    if (!rect || rect.width === 0 || time > offer.hideAt) {
      offer.root.remove();
      this.offer = null;
      return;
    }
    offer.root.style.transform = `translate3d(${rect.left + offer.dx}px, ${rect.top + offer.dy}px, 0)`;
  }

  private takeGold(): void {
    const offer = this.offer;
    if (!offer) return;
    this.audio.play('coin', { volume: 0.4 });
    const rect = offer.gold.getBoundingClientRect();
    for (let index = 0; index < 9; index += 1) {
      const nugget = div('ghibli-nugget', this.layer);
      nugget.style.left = `${rect.left + rect.width / 2}px`;
      nugget.style.top = `${rect.top}px`;
      nugget.style.setProperty('--ghibli-dx', `${random(-90, 90)}px`);
      nugget.style.animationDelay = `${index * 45}ms`;
      this.later(() => nugget.remove(), 1600);
    }
    if (offer.root.contains(document.activeElement)) offer.button.focus();
    offer.root.remove();
    this.offer = null;
    this.say('gold');
    this.audio.sting('theme-noface');
  }

  // ---- eggs -----------------------------------------------------------------------------

  /** A short line; with `frame`, an official still from the scene the joke points at. */
  private say(egg: GhibliEgg, frame?: string): void {
    if (frame) {
      const picture = div('ghibli-toast-frame');
      picture.append(still(frame, ''));
      const body = div('ghibli-toast-body');
      const line = document.createElement('span');
      line.className = 'ghibli-toast-line';
      line.textContent = this.strings.eggs[egg];
      body.append(line);
      this.toast.replaceChildren(picture, body);
      this.toast.classList.add('is-quote');
      this.showToast(QUOTE_MS);
      return;
    }
    this.toast.textContent = this.strings.eggs[egg];
    this.toast.classList.remove('is-quote');
    this.showToast(5200);
  }

  /**
   * Shows the token only where it covers no chart, axis or control. If the screen has no such
   * spot right now it waits for a scroll that opens one, and gives up after a while.
   */
  private showToast(ms: number): void {
    if (this.toastTimer !== undefined) window.clearTimeout(this.toastTimer);
    this.toast.classList.remove('is-visible');
    this.toastPending = { ms, until: performance.now() + TOAST_WAIT_MS };
    // Let the click that triggered it re-render the page first, then look for a clear spot.
    this.later(() => this.tryToast(), 350);
  }

  private tryToast(): void {
    const pending = this.toastPending;
    if (!pending) return;
    // A dialog's backdrop hides the page from the hit test: nothing is placed over it.
    if (modalOpen() || performance.now() > pending.until) {
      this.toastPending = null;
      return;
    }
    // Full token first; if nothing is clear, the compact token (speaker and line only), then
    // the slim token in the chart card's header.
    this.toast.classList.remove('is-compact', 'is-docked');
    this.toast.style.maxWidth = '';
    let spot = this.freeSpot(false);
    if (!spot && this.toast.classList.contains('is-quote')) {
      this.toast.classList.add('is-compact');
      spot = this.freeSpot(true);
      if (!spot) this.toast.classList.remove('is-compact');
    }
    spot ??= this.dockSpot();
    if (!spot) return;
    this.toastPending = null;
    this.toast.style.left = `${spot.x}px`;
    this.toast.style.top = `${spot.y}px`;
    this.toast.classList.add('is-visible');
    this.lastToastAt = performance.now();
    this.toastTimer = window.setTimeout(
      () => this.toast.classList.remove('is-visible'),
      pending.ms,
    );
    this.watchToast(performance.now() + pending.ms);
  }

  /**
   * Charts and tables re-render after a click, so content can grow under a token that was clear
   * when placed. Check about once a second while it shows; move it or put it away.
   */
  private watchToast(hideAt: number): void {
    this.later(() => {
      if (!this.toast.classList.contains('is-visible') || performance.now() > hideAt) return;
      if (this.recheckToast()) this.watchToast(hideAt);
    }, 900);
  }

  /** Moves a showing token off anything that came up under it, or puts it away at once. */
  private recheckToast(): boolean {
    if (!this.toast.classList.contains('is-visible') || !this.toastCovers()) return true;
    const spot = this.toast.classList.contains('is-docked')
      ? this.dockSpot()
      : this.freeSpot(this.toast.classList.contains('is-compact'));
    if (!spot) {
      this.toast.classList.remove('is-visible');
      this.toast.classList.add('is-gone');
      this.later(() => this.toast.classList.remove('is-gone'), 400);
      return false;
    }
    this.toast.style.left = `${spot.x}px`;
    this.toast.style.top = `${spot.y}px`;
    return true;
  }

  private toastCovers(): boolean {
    const box = this.toast.getBoundingClientRect();
    if (box.width === 0) return false;
    if (this.overProtected(box)) return true;
    return this.protectedRects().some(
      (r) => r.left < box.right && r.right > box.left && r.top < box.bottom && r.bottom > box.top,
    );
  }

  private protectedRects(): DOMRect[] {
    const rects: DOMRect[] = [];
    for (const el of document.querySelectorAll(PROTECTED)) {
      if (this.layer.contains(el)) continue;
      const rect = el.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) continue;
      if (rect.bottom < 0 || rect.top > window.innerHeight) continue;
      rects.push(rect);
    }
    return rects;
  }

  /**
   * A spot that covers no text, art or control. The theme banner's painted side comes first,
   * then the free cell nearest the lower right corner; `anywhere` also allows the upper half.
   */
  private freeSpot(anywhere: boolean): { x: number; y: number } | null {
    // Measure at the origin: an absolutely placed box near the right edge shrinks to fit.
    this.toast.style.left = '0px';
    this.toast.style.top = '0px';
    const width = this.toast.offsetWidth;
    const height = this.toast.offsetHeight;
    if (!width || !height) return null;
    this.map = null;
    const map = this.safeMap();
    const pad = 8;
    const banner = document.querySelector('[data-testid="ghibli-theme-banner"]');
    const art = banner?.getBoundingClientRect();
    if (art && art.width > 0 && art.bottom > HEADER_HEIGHT + height) {
      const spot = map.box(
        width + pad * 2,
        height + pad * 2,
        { x: art.right - width - 24, y: art.bottom - height - 24 },
        art,
      );
      if (spot) return { x: spot.x + pad, y: spot.y + pad };
    }
    const corner = { x: window.innerWidth - width - 16, y: window.innerHeight - height - 24 };
    const spot = map.box(width + pad * 2, height + pad * 2, corner);
    if (spot && (anywhere || spot.y >= window.innerHeight * 0.35)) {
      return { x: spot.x + pad, y: spot.y + pad };
    }
    return null;
  }

  /** The chart card's header gap, for a slim one-row token. */
  private dockSpot(): { x: number; y: number } | null {
    const dock = this.headerDock();
    if (!dock) return null;
    this.toast.classList.add('is-docked');
    this.toast.style.left = '0px';
    this.toast.style.top = '0px';
    this.toast.style.maxWidth = `${Math.min(560, dock.width)}px`;
    const width = this.toast.offsetWidth;
    const height = this.toast.offsetHeight;
    if (!width || height > dock.height) {
      this.toast.classList.remove('is-docked');
      this.toast.style.maxWidth = '';
      return null;
    }
    const x = dock.right - width;
    const y = dock.top + (dock.height - height) / 2;
    if (this.overProtected({ left: x, top: y, width, height })) {
      this.toast.classList.remove('is-docked');
      this.toast.style.maxWidth = '';
      return null;
    }
    this.cardStrip.hidden = true;
    return { x, y };
  }

  /** Scrolling moves content under the token: wait for a free spot, or step aside. */
  private readonly onToastScroll = () => {
    if (this.toastScrollTimer !== undefined) return;
    this.toastScrollTimer = window.setTimeout(() => {
      this.toastScrollTimer = undefined;
      if (this.toastPending) {
        this.tryToast();
        return;
      }
      if (this.toast.classList.contains('is-visible') && this.toastCovers()) {
        this.toast.classList.remove('is-visible');
      }
    }, 200);
  };

  /**
   * A film line on a bath token: who said it, the line as spoken, and what it means for the
   * benchmark. An optional still from the same scene sits on the token like a film frame.
   */
  private cite(
    key: GhibliQuote,
    frame?: string,
    sting?: GhibliSting,
    values: Record<string, string | number> = {},
  ): void {
    const now = performance.now();
    if (now - (this.lineAt.get(key) ?? -Infinity) < LINE_GAP_MS) return;
    this.lineAt.set(key, now);
    hearLine(key);
    const quote = this.strings.quotes[key];
    const parts: HTMLElement[] = [];
    if (frame) {
      const picture = div('ghibli-toast-frame');
      picture.append(still(frame, ''));
      parts.push(picture);
    }
    const body = div('ghibli-toast-body');
    const who = document.createElement('span');
    who.className = 'ghibli-toast-who';
    who.textContent = quote.who;
    const line = document.createElement('q');
    line.className = 'ghibli-toast-line';
    line.textContent = quote.line;
    const note = document.createElement('span');
    note.className = 'ghibli-toast-note';
    note.textContent = fill(quote.note, {
      model: '',
      point: '',
      n: paintedPointCount(),
      ...values,
    });
    body.append(who, line, note);
    parts.push(body);
    this.toast.replaceChildren(...parts);
    this.toast.classList.remove('is-meme');
    this.toast.classList.add('is-quote');
    this.showToast(QUOTE_MS);
    if (sting) this.audio.sting(sting);
    track('ghibli_quote_shown', { quote: key });
  }

  // ---- legend -----------------------------------------------------------------------------

  /** Many legend toggles in a row is the pig pen; a chart left with nothing is Howl's tantrum. */
  private legendClick(legend: Element): void {
    const now = performance.now();
    const recent = this.legendClicks.filter((at) => now - at < 10_000);
    // A label click also fires a click on its checkbox; count the pair once.
    if (recent.length > 0 && now - (recent.at(-1) ?? 0) < 80) return;
    recent.push(now);
    this.legendClicks = recent;
    if (recent.length >= 6) {
      this.legendClicks = [];
      this.cite('pigs', 'still-chihiro006');
      return;
    }
    this.later(() => {
      if (!legend.isConnected) return;
      const boxes = [...legend.querySelectorAll<HTMLInputElement>(LEGEND_BOX)];
      if (boxes.length > 0 && boxes.every((box) => !box.checked)) {
        this.cite('howl', 'still-howl023');
      }
    }, 400);
  }

  /** Laputa's word, typed by a whole country at once. The soot sprites bolt; nothing breaks. */
  private balse(): void {
    if (this.gathered) this.scatter();
    if (!this.reduced) {
      for (const entry of this.charts.values()) {
        for (const soot of entry.soots) {
          soot.dir = Math.random() < 0.5 ? -1 : 1;
          soot.flee = 0.9;
        }
      }
    }
    this.audio.play('soot-rustle', { volume: 0.3, gap: 300 });
    this.say('balse', 'still-laputa024');
    this.stamp('balse');
  }

  /** Once per session, when the loop starts: the Lofi Girl nod, after any greeting has gone. */
  private lofi(attempt = 0): void {
    try {
      if (sessionStorage.getItem('ghibli-once-lofi') === '1') return;
    } catch {}
    // It waits for any line that is showing, or was asked for, to finish first.
    const busy =
      this.toastPending !== null ||
      this.toast.classList.contains('is-visible') ||
      performance.now() - this.lastToastAt < 8000;
    if (busy && attempt < 6) {
      this.later(() => this.lofi(attempt + 1), 4000);
      return;
    }
    this.once('lofi', () => this.say('lofi', 'still-mimi037'));
    this.stamp('lofi');
  }

  /** Runs `callback` once per session for `key`. */
  private once(key: string, callback: () => void): void {
    const storageKey = `ghibli-once-${key}`;
    try {
      if (sessionStorage.getItem(storageKey) === '1') return;
      sessionStorage.setItem(storageKey, '1');
    } catch {}
    callback();
  }

  private heronManPeek(): void {
    const el = div('ghibli-heron-man', this.layer);
    el.append(sprite('heron-man', ''));
    if (!this.placeStatic(el, 150, 0.905, { x: window.innerWidth, y: window.innerHeight * 0.8 }))
      return;
    this.later(() => el.remove(), 8000);
  }

  private summonCastle(): void {
    this.audio.play('wind', { volume: 0.3, gap: 1000 });
    this.say('konami');
    this.stamp('castle');
    if (!this.reduced) {
      // The arrow keys of the code scroll the page smoothly: wait until it settles, then map.
      this.later(() => {
        this.map = null;
        this.flyAcross('castle-fly', 'ghibli-egg-castle', 250, 1.169, 'right');
      }, 700);
      return;
    }
    const el = div('ghibli-egg-static', this.layer);
    el.append(sprite('castle-fly', ''));
    if (
      this.placeStatic(el, 200, 1.169, { x: window.innerWidth * 0.7, y: window.innerHeight * 0.6 })
    ) {
      this.later(() => el.remove(), 5000);
    }
  }

  private word(word: Word): void {
    if (word === 'totoro') {
      const el = div('ghibli-egg-totoro', this.layer);
      el.append(sprite('totoro-nod', ''));
      this.placeStatic(el, 170, 1.114, { x: window.innerWidth * 0.88, y: window.innerHeight });
      this.audio.play('wind', { volume: 0.25, gap: 1000 });
      this.later(() => el.remove(), 7000);
    } else if (word === 'calcifer') {
      const el = div('ghibli-egg-calcifer', this.layer);
      el.append(sprite('calcifer', ''));
      this.placeStatic(el, 230, 0.4, { x: window.innerWidth / 2, y: window.innerHeight - 24 });
      this.audio.play('crackle', { volume: 0.4, gap: 500 });
      this.later(() => el.remove(), 4600);
      this.cite('calcifer', 'still-howl016');
      return;
    } else if (word === 'ham') {
      this.audio.play('chime', { volume: 0.3, rate: 1.2, gap: 500 });
      this.cite('ham', 'still-ponyo035');
      return;
    } else if (word === 'pig') {
      this.cite('pigs', 'still-chihiro006');
      return;
    } else if (word === 'howl') {
      this.cite('howl', 'still-howl023');
      return;
    } else if (word === 'sen') {
      this.cite('sen', 'still-chihiro016');
      return;
    } else if (word === 'bacon') {
      this.cite('bacon', 'still-howl016');
      return;
    } else if (word === 'balse') {
      this.balse();
      return;
    } else if (word === 'anime') {
      this.say('anime');
      return;
    } else if (word === 'ponyo') {
      this.ponyoRise();
    } else if (word === 'haku') {
      if (this.reduced) {
        const el = div('ghibli-egg-static', this.layer);
        el.append(sprite('haku', ''));
        this.placeStatic(el, 260, 0.592, { x: window.innerWidth / 2, y: window.innerHeight * 0.6 });
        this.later(() => el.remove(), 4000);
      } else this.hakuFlight();
      this.cite('haku');
      this.stamp('haku');
      return;
    } else {
      if (this.reduced) {
        const el = div('ghibli-egg-static', this.layer);
        el.append(sprite('heron-head', ''));
        this.placeStatic(el, 260, 0.57, { x: window.innerWidth / 2, y: window.innerHeight * 0.6 });
        this.later(() => el.remove(), 4000);
      } else this.heronFlight(true);
      this.audio.play('wingflap', { volume: 0.25, gap: 1000 });
      this.heronManPeek();
      this.cite('kiriko');
      this.stamp('heron');
      return;
    }
    this.say(word);
  }

  // ---- round 5: lines bound to events, two memes, the Sea Railway ticket ----------------

  /** Events found by looking at the page: the 404, a model picked, the empty state. */
  private roundFiveScan(): void {
    const notFound = [...document.querySelectorAll('main p, p')].some(
      (p) => p.textContent?.trim() === '404' && p.nextElementSibling?.tagName === 'H1',
    );
    if (notFound && !this.notFoundSeen) {
      this.notFoundSeen = true;
      this.later(() => {
        if (punchTicket(3)) {
          this.showNote(this.strings.r5.ticket3, 'still-chihiro043');
          this.later(() => this.cite('haku', 'still-chihiro016'), QUOTE_MS + 400);
        } else this.cite('haku', 'still-chihiro016');
      }, 900);
    } else if (!notFound) this.notFoundSeen = false;

    // ?ghibli_hold=loading keeps the painted loading state on screen for a capture: the chart
    // stays mounted underneath, hidden, and comes back when the flag is gone.
    const hold = new URLSearchParams(location.search).get('ghibli_hold') === 'loading';
    const root = document.documentElement;
    if (hold) {
      root.dataset.ghibliHold = 'loading';
      const svg = document.querySelector(CHART_SVG);
      const card = svg?.closest(CARD);
      if (card && !card.querySelector('.ghibli-hold-skeleton')) {
        const skeleton = div('ghibli-hold-skeleton h-[600px] w-full');
        skeleton.dataset.slot = 'skeleton';
        skeleton.setAttribute('aria-hidden', 'true');
        const caption = document.createElement('p');
        caption.className = 'ghibli-hold-caption';
        caption.textContent = this.strings.r5.loading;
        skeleton.append(caption);
        svg?.parentElement?.before(skeleton);
      }
    } else if (root.dataset.ghibliHold) {
      delete root.dataset.ghibliHold;
      for (const el of document.querySelectorAll('.ghibli-hold-skeleton')) el.remove();
    }

    // The model picker's own label: the URL can carry the model in the path or the query.
    const model = document.querySelector(CHART_SVG)
      ? document.querySelector('[data-testid="model-selector"]')?.textContent?.trim() ||
        new URLSearchParams(location.search).get('g_model')
      : null;
    if (this.lastModel && model && model !== this.lastModel) {
      this.later(
        () => this.cite('job', 'still-chihiro006', undefined, { model: model.slice(0, 40) }),
        1400,
      );
    }
    if (model || this.lastModel === undefined) this.lastModel = model;

    for (const empty of document.querySelectorAll<HTMLElement>(
      '[data-testid="scatter-empty-state"]',
    )) {
      if (empty.querySelector('.ghibli-empty-art')) continue;
      const art = div('ghibli-empty-art');
      art.setAttribute('aria-hidden', 'true');
      art.append(sprite('soot-3', ''), sprite('soot-2', ''), sprite('soot-konpeito', ''));
      const note = document.createElement('p');
      note.className = 'ghibli-empty-note';
      note.textContent = this.strings.r5.emptyNote;
      empty.append(art, note);
    }

    for (const container of document.querySelectorAll(EXPORT_CONTAINER)) {
      if (this.watchedExports.has(container)) continue;
      this.watchedExports.add(container);
      this.exportObserver.observe(container, { childList: true });
    }

    const footer = document.querySelector<HTMLElement>(FOOTER);
    const step = readTicket();
    const punch = document.querySelector('.ghibli-train-punch');
    // The ticket and the lines heard live in the footer, so the home heading is not pushed down.
    const heard = readLines().length;
    const want = `${step === 1 ? 'punch' : step === 2 ? 'ride' : 'clue'}-${heard}`;
    if (punch && (punch as HTMLElement).dataset.step !== want) punch.remove();
    if (footer && !document.querySelector('.ghibli-train-punch')) {
      const kind = want.split('-')[0];
      const el =
        kind === 'punch'
          ? document.createElement('button')
          : kind === 'ride'
            ? document.createElement('a')
            : document.createElement('p');
      if (el instanceof HTMLButtonElement) el.type = 'button';
      else if (el instanceof HTMLAnchorElement) el.href = this.strings.r5.swampHref;
      el.className = 'ghibli-train-punch ghibli-ticket no-export';
      el.dataset.testid = 'ghibli-train-punch';
      el.dataset.step = want;
      const r5 = this.strings.r5;
      const label = kind === 'punch' ? r5.punch : kind === 'ride' ? r5.ride : '';
      const hint = step === 0 ? r5.ticketHint : step >= 3 ? r5.ticket3 : '';
      el.textContent = [
        fill(r5.ticket, { n: step }),
        label || hint,
        fill(r5.linesHeard, { n: heard }),
      ]
        .filter(Boolean)
        .join(' · ');
      footer.append(el);
    }
  }

  /** The PNG export: a seal row under the chart, in the clone only, clear of the data. */
  private sealExport(clone: HTMLElement): void {
    if (clone.querySelector('.ghibli-export-seal')) return;
    const n = paintedPointCount();
    const seal = div('ghibli-export-seal');
    const mark = document.createElement('b');
    mark.textContent = '油屋';
    const text = document.createElement('span');
    text.textContent = fill(this.strings.r5.exportSeal, { n });
    seal.append(sprite('soot-konpeito', ''), text, mark);
    clone.append(seal);
  }

  /** The export finished: Kiriko's line, and the generator meme with the real point count. */
  private readonly onAction = () => {
    if (performance.now() - this.exportAt > 60_000) return;
    this.exportAt = -Infinity;
    const n = paintedPointCount();
    this.cite('kiriko', 'still-kimitachi044', undefined, { n });
    this.later(
      () => this.showNote(fill(this.strings.r5.aiMeme, { n }), 'still-ponyo005'),
      QUOTE_MS + 400,
    );
  };

  /** A point was pinned: Ashitaka's line names it. */
  private pinned(): void {
    const panel = document.querySelector<HTMLElement>('[data-testid="point-details-panel"] p');
    const named = panel?.textContent?.replaceAll(/\s+/g, ' ').trim();
    if (named) {
      this.cite('ashitaka', 'still-mononoke010', undefined, { point: named.slice(0, 60) });
      return;
    }
    const tip = [...document.querySelectorAll<HTMLElement>(TOOLTIP)].find((el) => {
      const rect = el.getBoundingClientRect();
      return rect.width > 0 && getComputedStyle(el).visibility !== 'hidden' && el.textContent;
    });
    if (!tip) return;
    const text = [...tip.querySelectorAll('div, span, strong, b, p')]
      .map((el) => (el.children.length === 0 ? el.textContent : ''))
      .join('\n')
      .split('\n')
      .map((line) => line.trim());
    const point = text.find((line) => line && !/click|dismiss|点击/i.test(line)) ?? '';
    if (!point) return;
    this.cite('ashitaka', 'still-mononoke010', undefined, { point: point.slice(0, 60) });
  }

  /** Zooming a chart starts the No-Face chase, labelled with the axis the zoom left on top. */
  private readonly onWheel = (event: WheelEvent | MouseEvent) => {
    if (event.type === 'wheel' && !event.shiftKey && !event.ctrlKey && !event.metaKey) return;
    const target = event.target instanceof Element ? event.target : null;
    const svg = target?.closest<SVGSVGElement>(CHART_SVG);
    if (!svg) return;
    const now = performance.now();
    if (now - this.chaseAt < LINE_GAP_MS) return;
    this.chaseAt = now;
    // After the zoom has settled, so the axis shows the zoomed range.
    this.later(() => this.chase(svg), 700);
  };

  private chase(svg: SVGSVGElement): void {
    const top = topTick(svg);
    const zoom =
      svg.querySelector('.zoom-group, [transform*="scale"]')?.getAttribute('transform') ?? '';
    const scale = /scale\((?<k>[\d.]+)/.exec(zoom)?.groups?.k;
    const card = div('ghibli-meme-chase');
    const faceless = document.createElement('figure');
    faceless.append(sprite('noface-offer', ''));
    const label1 = document.createElement('figcaption');
    label1.textContent = `${this.strings.r5.noFace}: ${scale ? `${Number(scale).toFixed(1)}×` : 'zoom'}`;
    faceless.append(label1);
    const girl = document.createElement('figure');
    girl.append(still('still-chihiro042', ''));
    const label2 = document.createElement('figcaption');
    label2.textContent = `${this.strings.r5.chihiro}: ${top}`;
    girl.append(label2);
    card.append(faceless, girl);
    // Built like a film line, so it can fall back to the compact or docked token.
    const frame = div('ghibli-toast-frame is-meme-frame');
    frame.append(card);
    const who = document.createElement('span');
    who.className = 'ghibli-toast-who';
    who.textContent = this.strings.r5.chaseWho;
    const line = document.createElement('span');
    line.className = 'ghibli-toast-line';
    line.textContent = fill(this.strings.r5.noFaceMeme, {
      zoom: scale ? `${Number(scale).toFixed(1)}×` : '1.0×',
      top,
    });
    const body = div('ghibli-toast-body');
    body.append(who, line);
    this.toast.replaceChildren(frame, body);
    this.toast.classList.add('is-quote');
    this.showToast(QUOTE_MS);
    this.audio.play('chime', { volume: 0.25, rate: 0.9, gap: 500 });
    track('ghibli_meme_shown', { meme: 'no_face_chase' });
    if (punchTicket(1)) this.later(() => this.showNote(this.strings.r5.ticket1), QUOTE_MS + 400);
  }

  private punchTrain(): void {
    if (!punchTicket(2)) return;
    document.querySelector('.ghibli-train-punch')?.remove();
    this.roundFiveScan();
    this.showNote(this.strings.r5.ticket2, 'still-chihiro042');
  }

  /** A plain note on the token, with an optional still. */
  private showNote(text: string, frame?: string): void {
    const parts: HTMLElement[] = [];
    if (frame) {
      const picture = div('ghibli-toast-frame');
      picture.append(still(frame, ''));
      parts.push(picture);
    }
    const body = div('ghibli-toast-body');
    const note = document.createElement('span');
    note.className = 'ghibli-toast-note';
    note.textContent = text;
    body.append(note);
    parts.push(body);
    this.toast.replaceChildren(...parts);
    this.toast.classList.remove('is-quote', 'is-meme');
    this.showToast(QUOTE_MS);
  }

  // ---- input ----------------------------------------------------------------------------

  private readonly onInput = () => {
    this.lastInput = performance.now();
    if (this.gathered) this.scatter();
  };

  private readonly onPointerMove = (event: PointerEvent) => {
    this.pointer = { x: event.clientX, y: event.clientY };
    this.onInput();
  };

  private readonly onKeyDown = (event: KeyboardEvent) => {
    this.onInput();
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
    this.keys = [...this.keys, key].slice(-KONAMI.length);
    if (this.keys.length === KONAMI.length && this.keys.every((value, i) => value === KONAMI[i])) {
      this.keys = [];
      this.summonCastle();
      return;
    }
    if (isEditable(event.target) || key.length !== 1) return;
    this.typed = (this.typed + key).slice(-12);
    const match = WORDS.find((word) => this.typed.endsWith(word));
    if (match) {
      this.typed = '';
      this.word(match);
    }
  };

  private readonly onPointerOver = (event: PointerEvent) => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;
    const exportButton = target.closest<HTMLElement>(EXPORT_BUTTON);
    if (exportButton) this.showOffer(exportButton);
    if (target.closest(ACTIVE_TAB)) this.audio.play('crackle', { volume: 0.22 });
  };

  private readonly onFocusIn = (event: FocusEvent) => {
    const target = event.target instanceof Element ? event.target : null;
    const exportButton = target?.closest<HTMLElement>(EXPORT_BUTTON);
    if (exportButton) this.showOffer(exportButton);
  };

  private readonly onClick = (event: MouseEvent) => {
    const target = event.target instanceof Element ? event.target : null;
    if (target?.closest(TAB_TRIGGER)) {
      this.audio.play('chime', { volume: 0.28, rate: random(0.94, 1.08) });
    }
    // After the Submissions page has drawn, so the line lands on that page, not the last one.
    if (target?.closest('[data-testid$="submissions"]'))
      this.once('job', () => this.later(() => this.cite('job'), 1600));
    const lantern = target?.closest('[data-testid="ghibli-lantern-toggle"]');
    if (lantern) {
      this.later(() => {
        if (lantern.getAttribute('aria-pressed') === 'true') this.cite('heart');
      }, 120);
    }
    const legend = target?.closest(LEGEND);
    if (legend && target?.closest('label, input, button')) this.legendClick(legend);
    if (target?.closest(EXPORT_BUTTON)) this.exportAt = performance.now();
    const chart = target?.closest<SVGSVGElement>(CHART_SVG);
    if (chart) this.later(() => this.pinned(), 700);
    if (target?.closest('button.ghibli-train-punch')) this.punchTrain();
  };

  private readonly onVisibility = () => {
    if (document.visibilityState === 'visible') {
      this.lastTick = 0;
      this.dirty = true;
      this.requestFrame();
    }
  };

  destroy(): void {
    this.destroyed = true;
    this.offPassport();
    this.observer.disconnect();
    this.footerObserver?.disconnect();
    this.footerObserver = null;
    this.trainCard?.remove();
    this.trainCard = null;
    window.removeEventListener('scroll', this.markDirty, { capture: true });
    window.removeEventListener('scroll', this.onToastScroll, { capture: true });
    window.removeEventListener('resize', this.markDirty);
    window.removeEventListener('pointermove', this.onPointerMove);
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('wheel', this.onWheel);
    document.removeEventListener('dblclick', this.onWheel);
    window.removeEventListener('inferencex:action', this.onAction);
    this.exportObserver.disconnect();
    for (const el of document.querySelectorAll(
      '.ghibli-empty-art, .ghibli-empty-note, .ghibli-train-punch, .ghibli-wash-in',
    ))
      el.remove();
    window.removeEventListener('wheel', this.onInput);
    window.removeEventListener('touchstart', this.onInput);
    document.removeEventListener('pointerover', this.onPointerOver);
    document.removeEventListener('focusin', this.onFocusIn);
    document.removeEventListener('click', this.onClick, true);
    document.removeEventListener('visibilitychange', this.onVisibility);
    this.audio.onMusicStart = null;
    if (this.frame !== undefined) cancelAnimationFrame(this.frame);
    if (this.scanTimer !== undefined) window.clearTimeout(this.scanTimer);
    if (this.toastTimer !== undefined) window.clearTimeout(this.toastTimer);
    if (this.toastScrollTimer !== undefined) window.clearTimeout(this.toastScrollTimer);
    for (const id of this.timers) window.clearTimeout(id);
    this.timers.clear();
    for (const animation of this.animations) animation.cancel();
    this.animations.clear();
    this.footerSea?.remove();
    this.footerSea = null;
    this.castle?.remove();
    this.castle = null;
    this.charts.clear();
    this.kodama.clear();
    this.riders.clear();
    this.offer = null;
    this.layer.replaceChildren();
  }
}
