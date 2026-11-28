/**
 * Everything the LEGO theme does outside React: sound on real interactions, the stud economy,
 * the easter eggs and the brick separator. `mountLegoRuntime` returns a cleanup that removes
 * every listener, timer, attribute and sound it created.
 */
import { track } from '@/lib/analytics/analytics';
import { isEmbedPathname } from '@/lib/embed/embed-route';
import {
  disposeLegoAudio,
  hasUserGesture,
  legoAudioReady,
  playSfx,
  playSnap,
  playVoice,
  startLegoMusic,
  stopLegoMusic,
  unlockLegoAudio,
} from './lego-audio';
import { countLegoPieces, legoChartFacts, legoPointHovered, mountLegoCharts } from './lego-charts';
import {
  FIND_IDS,
  TRUE_BUILDER_GOAL,
  addStuds,
  discover,
  emitLegoEffect,
  getLegoState,
  noteLine,
  onLegoEffect,
  onStudAward,
  prefersReducedMotion,
  resetLegoSession,
  setSeparatorActive,
  setSleeping,
  subscribeLego,
  syncLegoPreferences,
  type LineId,
  type SecretId,
} from './lego-store';
import { fill, type LegoStrings } from './lego-strings';

const INTERACTIVE =
  "button, a[href], [role='button'], [role='tab'], [role='option'], [role='menuitem'], [role='switch'], [role='checkbox'], [role='radio'], [role='combobox'], summary, select, label, input[type='checkbox'], input[type='radio'], input[type='range']";
const OPENERS =
  "[data-slot='select-trigger'], [role='combobox'], [aria-haspopup='listbox'], [aria-haspopup='menu'], [aria-haspopup='dialog'], select";
const HOVER_TICK = "[role='option'], [data-slot='select-item'], [role='menuitem']";
const CHART_POINT = '.dot-hit-area, .dot-group, .unofficial-overlay-pt, rect.bar';
/** Menus, disclosures and the theme's own switches: they make a sound but earn no studs. */
const NO_STUDS =
  "[aria-expanded], [aria-haspopup], [data-slot='select-trigger'], [data-testid='mobile-menu-toggle'], [data-testid='mobile-menu-backdrop'], [data-lego-stud-counter], .lego-toggle, [data-lego-tool], [data-slot='dialog-close']";
// The box art and the control panels stay put: they hold the way out of the tool.
const PRYABLE = "main [data-slot='card'], [data-slot='badge'], footer [data-testid='footer-brand']";
const SEPARATOR_SAFE =
  "[data-lego-tool], header, [role='dialog'], [data-testid='lego-theme-banner'], [data-slot='control-panel'], .lego-scene";
const ARROWS = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);
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
const WORDS: Record<string, SecretId> = {
  awesome: 'awesome',
  spaceship: 'spaceship',
  kragle: 'kragle',
  pants: 'pants',
  toy: 'toy',
  lego: 'toy',
  city: 'city',
  river: 'city',
  helicopter: 'city',
  yoda: 'yoda',
  '26047': 'sus',
  batman: 'batman',
};
/** How long after "lego" a typed "s" still counts as the plural. */
const PLURAL_MS = 1500;
const LONGEST_WORD = Math.max(...Object.keys(WORDS).map((word) => word.length));
const IDLE_MS = 45_000;
/** A line is not repeated sooner than this. */
const LINE_GAP_MS = 20_000;
const CHAIN_SLOT = 'lego-chain';
const LEGEND_ITEM = "[data-testid='chart-legend'] label";
const LEGEND_RESET =
  "[data-testid='legend-toolbar'] button:not([data-testid='legend-close-button'], [data-testid='legend-open-button'], [data-testid='legend-advanced-toggle'])";
const CHART_SVG = "svg[data-testid='d3-chart-svg']";
const SECRET_STUDS = 10_000;
const REPEAT_STUDS = 1000;

export interface LegoRuntime {
  /** Runs an easter egg by id (used by the banner, the scene and the mini-game). */
  egg: (id: SecretId, origin?: { x: number; y: number }) => void;
  toggleSeparator: () => void;
  dispose: () => void;
}

function isEditable(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || target.matches('input, textarea, select, [role="textbox"]'))
  );
}

function toast(text: string, tone: 'shout' | 'note' = 'note', topic?: string, ms?: number): void {
  emitLegoEffect({ type: 'toast', text, tone, topic, ms });
}

function center(): { x: number; y: number } {
  return { x: window.innerWidth / 2, y: window.innerHeight / 2 };
}

function wake(): void {
  if (!unlockLegoAudio()) return;
  startLegoMusic();
}

function onPreference(): void {
  syncLegoPreferences();
  if (!getLegoState().music) stopLegoMusic();
  else if (legoAudioReady()) startLegoMusic();
}

function separatorTarget(event: Event): HTMLElement | null {
  if (!getLegoState().separator || !(event.target instanceof Element)) return null;
  if (event.target.closest(SEPARATOR_SAFE)) return null;
  return event.target.closest<HTMLElement>(PRYABLE);
}

export function mountLegoRuntime(strings: () => LegoStrings): LegoRuntime {
  const root = document.documentElement;
  const timers = new Set<number>();
  const pried = new Map<HTMLElement, number>();
  const cleanups: (() => void)[] = [];
  let disposed = false;
  let typed = '';
  let konamiAt = 0;
  let konamiScroll = 0;
  let lastSilver = 0;
  let lastHover: Element | null = null;
  let idleTimer: number | undefined;
  let lastActivity = 0;
  let fxBusy = false;
  let pluralUntil = 0;
  /** True while a secret runs from its button in the set instructions rather than the keyboard. */
  let tapped = false;
  let lastMat = getLegoState().mat;

  const later = (fn: () => void, ms: number) => {
    const id = window.setTimeout(() => {
      timers.delete(id);
      if (!disposed) fn();
    }, ms);
    timers.add(id);
    return id;
  };

  const listen = <K extends keyof DocumentEventMap>(
    type: K,
    handler: (event: DocumentEventMap[K]) => void,
    options?: AddEventListenerOptions,
  ) => {
    document.addEventListener(type, handler, options);
    cleanups.push(() => document.removeEventListener(type, handler, options));
  };

  // ------------------------------------------------------------ audio lifecycle
  if (hasUserGesture()) {
    // The theme was just picked from the menu: that click is the gesture.
    wake();
    playSfx('pour', { volume: 0.7 });
  }
  window.addEventListener('lego-sound-toggle', onPreference);
  window.addEventListener('lego-music-toggle', onPreference);
  window.addEventListener('storage', onPreference);
  cleanups.push(() => {
    window.removeEventListener('lego-sound-toggle', onPreference);
    window.removeEventListener('lego-music-toggle', onPreference);
    window.removeEventListener('storage', onPreference);
  });
  listen('visibilitychange', () => {
    if (document.hidden) stopLegoMusic();
    else if (legoAudioReady()) startLegoMusic();
  });

  cleanups.push(
    onStudAward((award) => {
      if (award.tier === 'silver') return;
      const rate = award.tier === 'gold' ? 1 : award.tier === 'blue' ? 1.19 : 1.5;
      playSfx('stud', { volume: 0.55, rate, gap: 140 });
    }),
  );

  // ------------------------------------------------------------ lines
  // One line per event, each at most once in LINE_GAP_MS, each added to the index.
  const lineAt = new Map<LineId, number>();
  const say = (id: LineId, voice?: Parameters<typeof playVoice>[0], ms = 4200): boolean => {
    const now = performance.now();
    if (now - (lineAt.get(id) ?? -Infinity) < LINE_GAP_MS) return false;
    lineAt.set(id, now);
    toast(strings().lines[id], 'note', `line-${id}`, ms);
    if (voice) playVoice(voice);
    if (!getLegoState().lines.includes(id)) track('lego_line_heard', { line_id: id });
    noteLine(id);
    return true;
  };

  // ------------------------------------------------------------ secrets
  const reward = (id: SecretId, origin = center()) => {
    const first = discover(id);
    addStuds(first ? SECRET_STUDS : REPEAT_STUDS, origin);
    if (!first) return;
    track('lego_easter_egg_found', { egg_id: id });
    const t = strings();
    // Count now: another secret may be found before the delayed toast shows.
    const found = getLegoState().found.length;
    // The collectible chime of the LEGO video games, as the toast arrives.
    playSfx('minikit', { volume: 0.7, delay: 1.6 });
    later(
      () =>
        toast(
          fill(t.scene.secret, {
            found,
            total: FIND_IDS.length,
            name: t.secretNames[id],
          }),
        ),
      1600,
    );
  };

  const fx = (name: string | null) => {
    if (name) root.dataset.legoFx = name;
    else delete root.dataset.legoFx;
  };

  const egg: LegoRuntime['egg'] = (id, origin) => {
    const t = strings().scene;
    const still = prefersReducedMotion();
    switch (id) {
      case 'konami': {
        if (fxBusy) return;
        fxBusy = true;
        // The line, with how much of the chart came down with it.
        const { points } = legoChartFacts();
        toast(points > 0 ? fill(strings().r5.restCount, { points }) : t.restInPieces, 'shout');
        emitLegoEffect({ type: 'cameo', who: 'badcop' });
        playSfx('breaking', { volume: 0.9 });
        playVoice('rest-in-pieces');
        if (!still) fx('collapse');
        later(() => {
          if (!still) fx('rebuild');
          playSfx('build', { volume: 0.8 });
        }, 2100);
        later(() => {
          fx(null);
          fxBusy = false;
          toast(t.rebuilt);
        }, 3500);
        break;
      }
      case 'awesome': {
        toast(t.awesome, 'shout');
        playVoice('awesome', 'music');
        emitLegoEffect({ type: 'stud-rain' });
        emitLegoEffect({ type: 'crew-hop' });
        break;
      }
      case 'spaceship': {
        toast(t.spaceshipShout, 'shout');
        playVoice('spaceship');
        emitLegoEffect({ type: 'spaceship' });
        break;
      }
      case 'kragle': {
        if (fxBusy) return;
        fxBusy = true;
        toast(fill(strings().r5.kragleCount, { pieces: countLegoPieces() }), 'shout');
        emitLegoEffect({ type: 'cameo', who: 'glue' });
        playSfx('shake-2', { volume: 0.8 });
        fx('kragle');
        later(() => {
          fx(null);
          fxBusy = false;
          playSnap(1, 0.8);
          toast(t.kragleOff);
        }, 4200);
        break;
      }
      case 'pants': {
        toast(t.pants);
        playVoice('pants');
        emitLegoEffect({ type: 'crew-hop' });
        break;
      }
      case 'toy': {
        toast(t.toy);
        playVoice('brick-system');
        break;
      }
      case 'city': {
        // The line runs 6.8 s; the helicopter is timed to it in the scene.
        lineAt.set('city', performance.now());
        noteLine('city');
        toast(strings().lines.city, 'shout', 'city', 3400);
        playVoice('lego-city');
        const { low } = legoChartFacts();
        emitLegoEffect({
          type: 'rescue',
          seek: tapped,
          riff: low ? fill(strings().r5.cityFall, low) : undefined,
        });
        break;
      }
      case 'yoda': {
        const { slow } = legoChartFacts();
        toast(slow ? fill(strings().r5.yodaTtft, slow) : t.yodaLine);
        playVoice('yoda-death');
        emitLegoEffect({ type: 'cameo', who: 'yoda' });
        break;
      }
      case 'sus': {
        const { points } = legoChartFacts();
        toast(points > 0 ? fill(strings().r5.susCount, { points }) : t.susLine);
        playSnap(1, 0.6);
        emitLegoEffect({ type: 'cameo', who: 'sus' });
        break;
      }
      case 'batman': {
        say('black', 'batman-black');
        emitLegoEffect({ type: 'cameo', who: 'batman' });
        break;
      }
      case 'logo': {
        toast(t.logo);
        playVoice('touch-that');
        if (origin) emitLegoEffect({ type: 'burst', ...origin });
        break;
      }
      case 'footbrick': {
        toast(t.ow, 'shout');
        toast(fill(strings().r5.footCount, { pieces: countLegoPieces() }));
        playSfx('fall-apart', { volume: 0.9 });
        if (!still && !fxBusy) {
          fx('shake');
          later(() => {
            if (root.dataset.legoFx === 'shake') fx(null);
          }, 420);
        }
        break;
      }
      case 'idle': {
        toast(t.goodMorning);
        playVoice('good-morning');
        break;
      }
      case 'shatter': {
        say('pants', 'pants');
        toast(t.shatter);
        playSfx('breaking', { volume: 0.5, gap: 4000 });
        break;
      }
      default: {
        break;
      }
    }
    reward(id, origin);
  };

  // Tap alternatives in the set instructions run a secret without the keyboard.
  cleanups.push(
    onLegoEffect((effect) => {
      if (effect.type !== 'egg') return;
      tapped = true;
      egg(effect.id);
      tapped = false;
    }),
    // True Builder: the meter filled up.
    subscribeLego(() => {
      const state = getLegoState();
      if (state.studs < TRUE_BUILDER_GOAL || state.found.includes('builder')) return;
      discover('builder');
      track('lego_easter_egg_found', { egg_id: 'builder' });
      emitLegoEffect({
        type: 'toast',
        text: strings().scene.trueBuilder,
        tone: 'shout',
        ms: 1700,
        rush: true,
      });
      say('prophecy', undefined, 2600);
      toast(strings().scene.special, 'note', undefined, 4200);
      emitLegoEffect({ type: 'cameo', who: 'vitruvius' });
      playVoice('awesome', 'music');
      emitLegoEffect({ type: 'stud-rain' });
      emitLegoEffect({ type: 'crew-hop' });
    }),
    // Batman's table mat: he only works in black, and sometimes very, very dark grey.
    subscribeLego(() => {
      const { mat } = getLegoState();
      if (mat === lastMat) return;
      lastMat = mat;
      if (mat === 'space') egg('batman');
    }),
  );

  // ------------------------------------------------------------ brick separator
  const restore = (element: HTMLElement, snap = true) => {
    window.clearTimeout(pried.get(element));
    pried.delete(element);
    delete element.dataset.legoPried;
    element.style.removeProperty('--lego-tilt');
    if (snap) playSnap(0.9, 0.85);
  };

  const pry = (element: HTMLElement, x: number, y: number) => {
    if (pried.has(element)) {
      restore(element);
      return;
    }
    // Big pieces lift by a corner, not by a quarter turn: the far edge moves about 40px.
    const box = element.getBoundingClientRect();
    const most = Math.min(9, Math.max(1.2, (44 / Math.max(box.width, box.height, 1)) * 57.3));
    const tilt = most * (0.7 + Math.random() * 0.3) * (Math.random() < 0.5 ? -1 : 1);
    element.style.setProperty('--lego-tilt', `${tilt.toFixed(1)}deg`);
    element.dataset.legoPried = '';
    playSfx('fall-apart', { volume: 0.7, rate: 1.25, gap: 120 });
    addStuds(100, { x, y });
    pried.set(
      element,
      window.setTimeout(() => {
        if (!disposed && pried.has(element)) restore(element);
      }, 2800),
    );
  };

  const setSeparator = (active: boolean) => {
    if (getLegoState().separator === active) return;
    setSeparatorActive(active);
    track('lego_separator_toggled', { enabled: active });
    const t = strings().scene;
    if (active) {
      root.dataset.legoSeparator = '';
      const touch = window.matchMedia('(hover: none), (pointer: coarse)').matches;
      toast(touch ? t.separatorOnTouch : t.separatorOn, 'note', 'separator');
      playSnap(1, 1.3);
      reward('separator');
    } else {
      delete root.dataset.legoSeparator;
      for (const element of pried.keys()) restore(element, false);
      playSnap(1, 0.8);
      toast(t.separatorOff, 'note', 'separator');
    }
  };

  // ------------------------------------------------------------ pointer input
  const activity = () => {
    lastActivity = performance.now();
    if (getLegoState().sleeping) {
      setSleeping(false);
      egg('idle');
    }
  };
  const armIdle = () => {
    window.clearInterval(idleTimer);
    lastActivity = performance.now();
    idleTimer = window.setInterval(() => {
      if (document.hidden || getLegoState().sleeping) return;
      if (performance.now() - lastActivity >= IDLE_MS) setSleeping(true);
    }, 5000);
  };
  armIdle();
  cleanups.push(() => window.clearInterval(idleTimer));

  listen(
    'pointerdown',
    (event) => {
      wake();
      activity();
      const target = event.target instanceof Element ? event.target : null;
      if (!target) return;
      if (separatorTarget(event)) {
        // Keep menus and links from reacting while the tool is in hand.
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      if (target.closest('[data-lego-silent]')) return;
      const interactive = target.closest(INTERACTIVE);
      if (!interactive) return;
      if (interactive.matches(OPENERS)) {
        playSfx(Math.random() < 0.5 ? 'shake-1' : 'shake-2', { volume: 0.45, gap: 250 });
      } else {
        playSnap(0.8);
      }
      // Opening a menu is not an achievement; choosing something in it is.
      if (interactive.matches(NO_STUDS)) return;
      const now = performance.now();
      if (now - lastSilver > 400) {
        lastSilver = now;
        addStuds(10, { x: event.clientX, y: event.clientY });
      }
    },
    { capture: true },
  );

  listen(
    'click',
    (event) => {
      const element = separatorTarget(event);
      if (element) {
        event.preventDefault();
        event.stopPropagation();
        pry(element, event.clientX, event.clientY);
        return;
      }
      const target = event.target instanceof Element ? event.target : null;
      if (!target) return;
      const plot = target.closest(CHART_SVG);
      const picked = plot !== null && legoPointHovered(plot);
      if (picked || target.closest(CHART_POINT)) {
        // Pinning a data point collects a gold stud.
        addStuds(100, { x: event.clientX, y: event.clientY });
        emitLegoEffect({ type: 'crew-hop' });
        say('best');
      } else if (target.closest(LEGEND_RESET)) {
        say('couch');
      } else if (target.closest(LEGEND_ITEM)) {
        say('batman');
      } else if (
        target.closest(
          "[data-testid='export-png-button'], [data-testid='export-csv-button'], [data-testid='export-mp4-button'], [data-testid^='share-']",
        )
      ) {
        addStuds(1000, { x: event.clientX, y: event.clientY });
      }
    },
    { capture: true },
  );

  listen(
    'pointerover',
    (event) => {
      const target = event.target instanceof Element ? event.target.closest(HOVER_TICK) : null;
      if (!target || target === lastHover) return;
      lastHover = target;
      playSfx('tick', { volume: 0.35, gap: 60 });
    },
    { capture: true, passive: true },
  );

  let lastMove = 0;
  listen(
    'pointermove',
    () => {
      const now = performance.now();
      if (now - lastMove < 500) return;
      lastMove = now;
      activity();
    },
    { passive: true },
  );
  listen(
    'scroll',
    () => {
      lastActivity = performance.now();
    },
    { passive: true, capture: true },
  );

  // ------------------------------------------------------------ keyboard
  listen(
    'keydown',
    (event) => {
      wake();
      activity();
      if (event.key === 'Escape' && getLegoState().separator) {
        setSeparator(false);
        return;
      }
      // Brick Studio has its own keys; building there never spells a secret.
      if (event.target instanceof Element && event.target.closest('[data-lego-keys]')) {
        typed = '';
        konamiAt = 0;
        return;
      }
      if (isEditable(event.target)) {
        if (event.key.length === 1) playSfx('tick', { volume: 0.25, gap: 70, rate: 1.2 });
        typed = '';
        konamiAt = 0;
        return;
      }
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
      if (key === KONAMI[konamiAt]) {
        if (konamiAt === 0) konamiScroll = window.scrollY;
        konamiAt += 1;
        // Two ups in: this is the code, so the arrows stop scrolling the page.
        if (konamiAt > 2 && ARROWS.has(key)) event.preventDefault();
        if (konamiAt === KONAMI.length) {
          konamiAt = 0;
          typed = '';
          const scrollBack = konamiScroll;
          window.scrollTo({ top: scrollBack, behavior: 'instant' });
          // A keyboard scroll that was still easing when the code landed would win otherwise.
          later(() => window.scrollTo({ top: scrollBack, behavior: 'instant' }), 280);
          egg('konami');
          return;
        }
      } else {
        konamiAt = key === KONAMI[0] ? (konamiAt >= 2 ? 2 : 1) : 0;
        if (konamiAt === 1) konamiScroll = window.scrollY;
      }
      if (!/^[a-z0-9]$/u.test(key)) return;
      if (key === 's' && performance.now() < pluralUntil) {
        // "legos": the correction every fan has typed at least once.
        pluralUntil = 0;
        typed = '';
        toast(strings().scene.legos, 'note', 'plural', 4200);
        return;
      }
      pluralUntil = 0;
      typed = (typed + key).slice(-LONGEST_WORD);
      if (typed.endsWith('bionicle')) {
        // Not a secret brick: the fan who types it gets the legend back, retold for GPUs.
        typed = '';
        const series = document.querySelectorAll(LEGEND_ITEM).length;
        toast(
          series > 0 ? fill(strings().r5.bionicleCount, { series }) : strings().scene.bionicle,
          'note',
          'legend',
          5600,
        );
        return;
      }
      // Two more words that are not secret bricks: Emmet's couch and the company motto.
      if (typed.endsWith('couch') || typed.endsWith('motto')) {
        const who = typed.endsWith('couch') ? 'emmet' : 'wyldstyle';
        typed = '';
        const line = strings().quips[who].at(-1);
        if (line) toast(line, 'note', who, 4600);
        return;
      }
      for (const [word, id] of Object.entries(WORDS)) {
        if (typed.endsWith(word)) {
          typed = '';
          if (word === 'lego') pluralUntil = performance.now() + PLURAL_MS;
          egg(id);
          break;
        }
      }
    },
    { capture: true },
  );

  // ------------------------------------------------------------ charts
  const embedded =
    Object.hasOwn(root.dataset, 'inferencexEmbed') || isEmbedPathname(window.location.pathname);
  if (!embedded) {
    cleanups.push(
      mountLegoCharts({
        onBuild: (_svg, rebuilt) => {
          playSfx('rattle', { volume: 0.5, gap: 1800, rate: 1.4 });
          emitLegoEffect({ type: 'crew-busy', ms: 1600 });
          // Benny builds fast: the chart was rebuilt for a new model or metric.
          if (rebuilt) say('spaceship', 'spaceship');
        },
        buildLabel: (step, pieces) => fill(strings().r5.buildStep, { step, pieces }),
        exportStamp: (pieces) => {
          const { banner } = strings();
          return [banner.setNumber, fill(banner.pieces, { n: pieces }), banner.ages];
        },
        onExport: () => later(() => say('firstTry', 'first-try'), 1400),
        onEmpty: (element) => {
          const hole = element.getBoundingClientRect();
          const box = (
            element.closest("[data-testid='scatter-graph'], figure") ??
            element.parentElement ??
            element
          ).getBoundingClientRect();
          emitLegoEffect({
            type: 'rubble',
            left: box.left,
            top: hole.top,
            width: box.width,
            height: hole.height,
            holeLeft: hole.left,
            holeRight: hole.right,
          });
          egg('shatter', { x: box.left + box.width / 2, y: box.top + box.height / 2 });
        },
        stepLabel: (step) => fill(strings().scene.step, { n: step }),
        hangerLabel: () => strings().scene.hanger,
        onHangerFall: () => playSfx('fall-apart', { volume: 0.7, rate: 1.15 }),
        onHangerBack: () => playSnap(0.9),
      }),
    );
  }

  // ------------------------------------------------------------ held loading state
  // `?lego_hold=loading` keeps a stand-in for the chart skeleton on screen for a few seconds,
  // styled by the same rule as the stock one, so the loading look can be photographed.
  if (new URLSearchParams(window.location.search).get('lego_hold') === 'loading') {
    let tries = 0;
    const place = () => {
      const figure = document.querySelector<HTMLElement>("[data-testid='chart-figure']");
      if (!figure) {
        // The chart can mount late on a slow load: keep looking for a while.
        tries += 1;
        if (tries < 40) later(place, 400);
        return;
      }
      const hold = document.createElement('div');
      hold.className = 'lego-hold';
      hold.dataset.slot = 'skeleton';
      hold.setAttribute('role', 'status');
      const label = document.createElement('span');
      label.textContent = strings().r5.loading;
      hold.append(label);
      figure.append(hold);
      // The nine seconds run from the moment it is first on screen, so a slow load or a
      // long scroll does not use them up. It never outstays half a minute.
      let timed = false;
      const start = () => {
        if (timed) return;
        timed = true;
        later(() => hold.remove(), 9000);
      };
      const seen = new IntersectionObserver((entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        seen.disconnect();
        start();
      });
      seen.observe(hold);
      later(() => {
        seen.disconnect();
        start();
      }, 20_000);
      cleanups.push(() => {
        seen.disconnect();
        hold.remove();
      });
    };
    later(place, 600);
  }

  // ------------------------------------------------------------ pages that do not exist
  // The last stop of the clue chain (home, dashboard, here), and Vitruvius owning up.
  const missing = () => {
    const entry = performance.getEntriesByType('navigation')[0] as
      | { responseStatus?: number }
      | undefined;
    const lost =
      entry?.responseStatus === 404 || document.querySelector("meta[name='next-error']") !== null;
    if (!lost) return;
    let stage: string | null;
    try {
      stage = sessionStorage.getItem(CHAIN_SLOT);
      sessionStorage.removeItem(CHAIN_SLOT);
    } catch {
      stage = null;
    }
    say('prophecy');
    emitLegoEffect({ type: 'cameo', who: 'glue' });
    if (stage === 'piece') {
      toast(fill(strings().r5.clueEnd, { pieces: countLegoPieces() }), 'shout', 'chain', 4600);
      emitLegoEffect({ type: 'stud-rain' });
      addStuds(SECRET_STUDS);
      track('lego_clue_chain_finished');
    } else if (/\/kragle\/?$/u.test(window.location.pathname)) {
      toast(strings().r5.clueEndCold, 'note', 'chain', 4600);
    }
  };
  later(missing, 900);

  return {
    egg,
    toggleSeparator: () => setSeparator(!getLegoState().separator),
    dispose: () => {
      disposed = true;
      for (const id of timers) window.clearTimeout(id);
      timers.clear();
      for (const element of pried.keys()) restore(element, false);
      for (const cleanup of cleanups.splice(0)) cleanup();
      delete root.dataset.legoFx;
      delete root.dataset.legoSeparator;
      resetLegoSession();
      disposeLegoAudio();
    },
  };
}
