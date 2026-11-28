/**
 * Site-wide behaviour of the GTA theme outside React: the sub-palette attributes on <html>,
 * delegated interface sounds, the radio, cheat codes, the wanted level, the cash counter, the
 * scroll parallax of the scene and the chart integration. `mountGtaRuntime` returns a handle
 * whose `dispose` removes every listener, timer, attribute and custom property again.
 */
import {
  disposeGtaAudio,
  gtaAudioStarted,
  playGtaClip,
  playGtaSfx,
  reviveGtaAudio,
  setGtaRadioHeat,
  syncGtaRadio,
  unlockGtaAudio,
} from './gta-audio';
import { countGtaBlips, mountGtaCharts, runGtaTrain } from './gta-charts';
import {
  CHARACTERS,
  HEIST_RECORD_EVENT,
  MAX_WANTED,
  FIND_IDS,
  STATIONS,
  WEATHERS,
  addCash,
  emitGtaEffect,
  findSecret,
  getGtaState,
  onGtaEffect,
  prefersReducedMotion,
  setCharacter,
  setStation,
  setWanted,
  setWeather,
  subscribeGta,
  syncGtaPreferences,
  syncHeistRecord,
  type GtaArt,
  type GtaCharacter,
  type GtaStation,
  type LineId,
  type SecretId,
} from './gta-store';
import { fill, type GtaStrings, type ZoneId } from './gta-strings';

export interface GtaRuntime {
  /** Runs a cheat or secret by id, as if its code had been typed. */
  cheat: (id: SecretId) => void;
  switchCharacter: (character: GtaCharacter) => void;
  tune: (station: GtaStation) => void;
  wordmark: () => void;
  /** Tells the theme which page is showing, for the area name and the page's own moment. */
  route: (pathname: string) => void;
  /** How far Lester's stash has got: 0 or 1 tip out, 2 blips tagged, 3 drop paid. */
  stashStage: () => number;
  dispose: () => void;
}

const INTERACTIVE =
  "button, a[href], [role='tab'], [role='option'], [role='menuitem'], [role='switch'], [role='checkbox'], [role='combobox'], summary, input[type='checkbox'], input[type='radio'], input[type='range'], select, label[for]";
const CODES: Partial<Record<SecretId, string>> = {
  fugitive: 'FUGITIVE',
  lawyerup: 'LAWYERUP',
  makeitrain: 'MAKEITRAIN',
  slowmo: 'SLOWMO',
  liquor: 'LIQUOR',
  buzzoff: 'BUZZOFF',
  skyfall: 'SKYFALL',
  train: 'DAMNTRAIN',
  order: 'NUMBERNINE',
  hesoyam: 'HESOYAM',
};
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
const LONGEST_CODE = Math.max(...Object.values(CODES).map((code) => code.length));
const WANTED_DECAY_MS = 22_000;
const FX_ATTRIBUTE = 'data-gta-fx';
/** A quoted line is not repeated sooner than this, and two lines never overlap. */
const LINE_REPEAT_MS = 45_000;
const LINE_GAP_MS = 6500;
const ORDER_LINE_MS = 16_500;
const WASTED_REPEAT_MS = 30_000;
/** This many setting changes inside the window is an order long enough for Big Smoke. */
const ORDER_CHANGES = 5;
const ORDER_WINDOW_MS = 40_000;
const NOT_FOUND =
  ".gta div.items-center.justify-center.text-center > [data-slot='eyebrow'].tabular-nums:first-child";
const FRONTIER_SWITCH = "#scatter-hide-non-optimal, [data-testid='scatter-hide-non-optimal']";
const SETTING = "[role='option'], [role='menuitemradio'], [role='menuitemcheckbox']";
const ROOT_PROPERTIES = [
  '--gta-scroll',
  '--gta-progress',
  '--gta-empty-title',
  '--gta-empty-sub',
  '--gta-404',
  '--gta-loading',
];

const money = (amount: number) => `$${new Intl.NumberFormat('en-US').format(amount)}`;
const quote = (text: string) => `"${text.replaceAll(/["\\]/gu, '')}"`;

const feed = (
  title: string,
  body: string,
  tone: 'cash' | 'wanted' | 'info' = 'info',
  art?: GtaArt,
) => emitGtaEffect({ type: 'feed', title, body, tone, art });

function zoneOf(pathname: string): ZoneId {
  const parts = pathname.split('/').filter(Boolean);
  if (parts[0] === 'zh') parts.shift();
  const [first] = parts;
  if (!first) return 'home';
  if (first === 'compare-per-dollar') return 'strip';
  if (first.startsWith('compare')) return 'compare';
  switch (first) {
    case 'infx': {
      return 'inference';
    }
    case 'pwx': {
      return 'power';
    }
    case 'vgx': {
      return 'quality';
    }
    case 'ubx': {
      return 'micro';
    }
    case 'hardware':
    case 'chips': {
      return 'hardware';
    }
    case 'rankings': {
      return 'rankings';
    }
    case 'overview': {
      return 'overview';
    }
    case 'blog':
    case 'quotes': {
      return 'press';
    }
    case 'about':
    case 'land-acknowledgement': {
      return 'about';
    }
    case 'glossary': {
      return 'glossary';
    }
    case 'whitepaper': {
      return 'whitepaper';
    }
    case 'model':
    case 'run': {
      return 'model';
    }
    default: {
      return 'other';
    }
  }
}

function onPreference() {
  syncGtaPreferences();
  if (gtaAudioStarted()) syncGtaRadio();
}

function isTyping(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable ||
      target.matches(
        "input:not([type='checkbox'], [type='radio'], [type='range']), textarea, select",
      ))
  );
}

export function mountGtaRuntime(getStrings: () => GtaStrings): GtaRuntime {
  const root = document.documentElement;
  const mountedAt = performance.now();
  let disposed = false;
  let typed = '';
  let konami = 0;
  let inspected = 0;
  // Lester's stash, one chain across routes within a visit: the tip on the home page (1),
  // three blips tagged on a chart (2), the drop paid on coming home (3).
  let chain = 0;
  let chainTagged = 0;
  let chainBlips = 0;
  let wordmarkClicks = 0;
  let wordmarkAt = 0;
  let scrollFrame: number | undefined;
  let decayTimer: number | undefined;
  let lastHover: Element | null = null;
  let lastCashAt = 0;
  let lineBusyUntil = 0;
  let lineShowing: LineId | null = null;
  let lastWastedAt = -Infinity;
  let lastPath: string | null = null;
  const lineAt = new Map<LineId, number>();
  const settingChanges: number[] = [];
  const timers = new Set<number>();
  reviveGtaAudio();

  const later = (callback: () => void, ms: number) => {
    const id = window.setTimeout(() => {
      timers.delete(id);
      if (!disposed) callback();
    }, ms);
    timers.add(id);
  };

  const pageFx = (name: string, ms: number) => {
    root.setAttribute(FX_ATTRIBUTE, name);
    later(() => {
      if (root.getAttribute(FX_ATTRIBUTE) === name) root.removeAttribute(FX_ATTRIBUTE);
    }, ms);
  };

  // ------------------------------------------------------------ quoted lines
  // A line plays as a subtitled strip with its recording where one exists. `force` is for a
  // line the visitor asked for (a cheat), which skips the repeat limit but never overlaps.
  const say = (line: LineId, force = false): boolean => {
    const now = performance.now();
    // The Epsilon greeting is filler: any line tied to what the visitor just did may replace it.
    const yields = lineShowing === 'kifflom' && line !== 'kifflom';
    if (now < lineBusyUntil && !yields) return false;
    if (!force && now - (lineAt.get(line) ?? -Infinity) < LINE_REPEAT_MS) return false;
    lineAt.set(line, now);
    lineShowing = line;
    lineBusyUntil = now + (line === 'order' ? ORDER_LINE_MS : LINE_GAP_MS);
    emitGtaEffect({ type: 'scene', line });
    if (line === 'hereWeGo') playGtaClip('here-we-go-again');
    else if (line === 'train') playGtaClip('follow-the-train');
    else if (line === 'wrongHouse') playGtaClip('wrong-house', { fallback: 'error' });
    else if (line === 'order') playGtaClip('smokes-order-1', { next: 'smokes-order-2' });
    return true;
  };

  const wasted = (sub: string) => {
    const now = performance.now();
    if (now - lastWastedAt < WASTED_REPEAT_MS) return false;
    lastWastedAt = now;
    emitGtaEffect({ type: 'overlay', kind: 'wasted', sub });
    playGtaSfx('busted');
    pageFx('wasted', 3400);
    return true;
  };

  // ------------------------------------------------------------ root attributes
  const applyState = () => {
    const state = getGtaState();
    if (root.dataset.gtaChar !== state.character) root.dataset.gtaChar = state.character;
    if (root.dataset.gtaWeather !== state.weather) root.dataset.gtaWeather = state.weather;
    const wanted = String(state.wanted);
    if (root.dataset.gtaWanted !== wanted) root.dataset.gtaWanted = wanted;
    setGtaRadioHeat(state.wanted);
  };
  const applyStrings = () => {
    const t = getStrings();
    root.style.setProperty('--gta-empty-title', quote(t.charts.empty));
    root.style.setProperty('--gta-empty-sub', quote(t.charts.emptySub));
    root.style.setProperty('--gta-404', quote(t.notFound));
    root.style.setProperty('--gta-loading', quote(t.charts.loading));
  };
  applyState();
  applyStrings();
  const unsubscribe = subscribeGta(applyState);
  const langObserver = new MutationObserver(applyStrings);
  langObserver.observe(root, { attributes: true, attributeFilter: ['lang'] });

  // ------------------------------------------------------------ scroll parallax
  const applyScroll = () => {
    scrollFrame = undefined;
    if (disposed) return;
    const max = Math.max(1, root.scrollHeight - window.innerHeight);
    const progress = Math.min(1, Math.max(0, window.scrollY / max));
    root.style.setProperty('--gta-progress', progress.toFixed(3));
    // Reduced motion keeps the scene planes where they are.
    root.style.setProperty(
      '--gta-scroll',
      prefersReducedMotion() ? '0' : String(Math.round(window.scrollY)),
    );
  };
  const onScroll = () => {
    if (scrollFrame === undefined) scrollFrame = requestAnimationFrame(applyScroll);
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll, { passive: true });
  applyScroll();

  // ------------------------------------------------------------ wanted level
  const scheduleDecay = () => {
    window.clearTimeout(decayTimer);
    decayTimer = undefined;
    if (disposed || getGtaState().wanted === 0) return;
    decayTimer = window.setTimeout(() => {
      const next = getGtaState().wanted - 1;
      setWanted(next);
      if (next === 0) {
        playGtaSfx('clear');
        feed(getStrings().feed.wantedTitle, getStrings().feed.wantedClear, 'wanted');
        say('surviving');
      }
      scheduleDecay();
    }, WANTED_DECAY_MS);
  };

  const bust = () => {
    const t = getStrings();
    const fine = Math.min(getGtaState().cash, Math.max(500, Math.round(getGtaState().cash * 0.1)));
    findSecret('busted');
    emitGtaEffect({ type: 'overlay', kind: 'busted' });
    playGtaSfx('busted');
    later(() => {
      setWanted(0);
      addCash(-fine);
      feed(t.feed.bustedTitle, fill(t.feed.bustedBody, { fine: money(fine) }), 'wanted');
      scheduleDecay();
    }, 2600);
  };

  const raiseWanted = (by = 1) => {
    const current = getGtaState().wanted;
    if (current >= MAX_WANTED) return;
    const next = Math.min(MAX_WANTED, current + by);
    setWanted(next);
    playGtaSfx('star');
    feed(getStrings().feed.wantedTitle, fill(getStrings().feed.wantedUp, { n: next }), 'wanted');
    if (next >= MAX_WANTED) bust();
    else scheduleDecay();
  };

  const lowerWanted = () => {
    const current = getGtaState().wanted;
    if (current === 0) return;
    setWanted(current - 1);
    playGtaSfx('clear');
    if (current - 1 === 0) {
      feed(getStrings().feed.wantedTitle, getStrings().feed.wantedClear, 'wanted');
      say('surviving');
    }
    scheduleDecay();
  };

  // ------------------------------------------------------------ rewards
  const reward = (id: SecretId, amount: number, greet = true) => {
    const first = findSecret(id);
    if (first) {
      addCash(amount);
      playGtaSfx('cash');
      // Every secret is a tract found; the Epsilon Program says hello when no one else is talking.
      if (greet) later(() => say('kifflom'), 2600);
      if (getGtaState().found.length === FIND_IDS.length) {
        later(() => {
          emitGtaEffect({
            type: 'overlay',
            kind: 'passed',
            sub: getStrings().overlay.completeSub,
          });
          playGtaSfx('passed');
          feed(getStrings().feed.cheatTitle, getStrings().feed.foundAll, 'cash');
        }, 900);
      }
    }
    return first;
  };

  const switchCharacter = (character: GtaCharacter) => {
    if (character === getGtaState().character) return;
    setCharacter(character);
    playGtaSfx('switch');
    pageFx('switch', 1500);
    const t = getStrings();
    feed(
      t.feed.switchTitle,
      `${t.characters[character].name}: ${t.characters[character].mood}`,
      'info',
      `${character}-face`,
    );
    reward('switch', 500);
    // GTA logic: a respray and the police forget the whole chase.
    if (getGtaState().wanted > 0) {
      setWanted(0);
      scheduleDecay();
      later(() => {
        playGtaSfx('clear');
        feed(t.feed.resprayTitle, t.feed.resprayBody, 'wanted');
        reward('respray', 1000);
      }, 700);
    }
    // Lamar has something to say every time Franklin is back in play, and Michael has a word
    // for Trevor.
    if (character === 'franklin') {
      later(() => {
        if (say('yeeyee')) feed(t.feed.lamar, t.feed.lamarBody, 'info', 'lamar-face');
      }, 1600);
    } else if (character === 'trevor') {
      later(() => say('hipster'), 1600);
    }
  };

  // The freight train runs a frontier line of the chart on screen; Big Smoke has the last word.
  const runTrain = (): boolean => {
    const t = getStrings();
    const started = runGtaTrain(() => {
      if (!disposed) say('train', true);
    });
    if (!started) {
      playGtaSfx('error');
      feed(t.feed.trainTitle, t.feed.trainNone, 'wanted');
      return false;
    }
    feed(t.feed.trainTitle, t.secrets.train.hint, 'info', 'big-smoke');
    reward('train', 2000, false);
    return true;
  };

  const tune = (station: GtaStation) => {
    if (station === getGtaState().station) return;
    setStation(station);
    playGtaSfx('tune');
    syncGtaRadio();
    const t = getStrings();
    feed(t.feed.radioTitle, `${t.stations[station].name}: ${t.stations[station].genre}`);
    reward('radio', 500);
  };

  const cheat = (id: SecretId) => {
    const t = getStrings();
    const secret = t.secrets[id];
    switch (id) {
      case 'fugitive': {
        raiseWanted();
        break;
      }
      case 'lawyerup': {
        lowerWanted();
        break;
      }
      case 'makeitrain': {
        const weather = WEATHERS[(WEATHERS.indexOf(getGtaState().weather) + 1) % WEATHERS.length];
        setWeather(weather);
        feed(t.feed.weatherTitle, t.weather[weather]);
        later(() => say('weather'), 600);
        break;
      }
      case 'slowmo': {
        pageFx('slowmo', 9000);
        break;
      }
      case 'liquor': {
        pageFx('drunk', 5200);
        break;
      }
      case 'buzzoff': {
        emitGtaEffect({ type: 'chopper' });
        playGtaSfx('chopper');
        break;
      }
      case 'skyfall': {
        window.scrollTo({ top: 0, behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
        pageFx('skyfall', 1400);
        break;
      }
      case 'konami': {
        addCash(250_000);
        break;
      }
      case 'hesoyam': {
        addCash(250_000);
        if (getGtaState().wanted > 0) lowerWanted();
        playGtaSfx('cheat');
        feed(secret.name, fill(t.feed.hesoyamBody, { amount: money(250_000) }), 'cash');
        reward(id, 1000);
        return;
      }
      case 'activate': {
        emitGtaEffect({ type: 'overlay', kind: 'passed' });
        playGtaSfx('passed');
        break;
      }
      case 'train': {
        if (!runTrain()) return;
        break;
      }
      case 'order': {
        if (!say('order', true)) return;
        break;
      }
      case 'herewego': {
        if (!say('hereWeGo', true)) return;
        break;
      }
      case 'switch': {
        const { character } = getGtaState();
        switchCharacter(CHARACTERS[(CHARACTERS.indexOf(character) + 1) % CHARACTERS.length]);
        return;
      }
      case 'radio': {
        const { station } = getGtaState();
        tune(STATIONS[(STATIONS.indexOf(station) + 1) % STATIONS.length]);
        return;
      }
      case 'busted': {
        setWanted(MAX_WANTED);
        bust();
        return;
      }
      case 'wordmark': {
        pageFx('vinewood', 2600);
        break;
      }
      default: {
        // Secrets that are earned on the dashboard itself only show their hint.
        feed(secret.name, secret.hint);
        return;
      }
    }
    playGtaSfx('cheat');
    feed(t.feed.cheatTitle, secret.name);
    reward(id, 1000);
  };

  const wordmark = () => {
    const now = performance.now();
    wordmarkClicks = now - wordmarkAt < 1600 ? wordmarkClicks + 1 : 1;
    wordmarkAt = now;
    playGtaSfx('nav');
    if (wordmarkClicks >= 5) {
      wordmarkClicks = 0;
      cheat('wordmark');
    }
  };

  // ------------------------------------------------------------ input
  const onFirstGesture = unlockGtaAudio;
  const gestureOptions = { capture: true, passive: true } as const;
  window.addEventListener('pointerdown', onFirstGesture, gestureOptions);
  window.addEventListener('keydown', onFirstGesture, gestureOptions);

  const onPointerDown = (event: PointerEvent) => {
    const target = event.target instanceof Element ? event.target.closest(INTERACTIVE) : null;
    if (!target || target.closest('.gta-game, .heist-dialog')) return;
    // A site dialog closed with its close button is the thing to forget
    // (a popover or menu is not one, and neither is a button that does something else on the
    // way out, such as an export).
    const dialog = target.closest<HTMLElement>('[role="dialog"]:not([data-side])');
    const closes =
      target.matches('[data-slot="dialog-close"], [aria-label="Close"], [aria-label="关闭"]') ||
      ['Close', '关闭'].includes(target.textContent?.trim() ?? '');
    if (dialog && closes && !dialog.closest('.gta-dialog')) {
      later(() => {
        if (!dialog.isConnected || dialog.dataset.state === 'closed') say('forget');
      }, 450);
    }
    if (target.matches(':disabled, [aria-disabled="true"]')) {
      // A locked control is the wrong house; between lines it is the plain error sound.
      if (!say('wrongHouse')) playGtaSfx('error');
      return;
    }
    if (target.matches("[role='tab'], [role='switch'], input, [aria-pressed]"))
      playGtaSfx('toggle');
    else if (target.matches('[data-slot="dialog-close"], [aria-label="Close"]')) {
      playGtaSfx('back');
      if (!target.closest('.gta-dialog')) later(() => say('forget'), 250);
    } else playGtaSfx('select');
    if (target.matches(SETTING) && !target.closest('.gta-dialog')) {
      // Enough settings changed in a row is an order long enough for Big Smoke.
      const at = performance.now();
      settingChanges.push(at);
      while (settingChanges.length > 0 && at - settingChanges[0] > ORDER_WINDOW_MS)
        settingChanges.shift();
      if (settingChanges.length >= ORDER_CHANGES) {
        settingChanges.length = 0;
        later(() => {
          if (say('order')) reward('order', 1500);
        }, 400);
      }
    }
    // Using the dashboard pays a little, at most once a second.
    const now = performance.now();
    if (now - lastCashAt > 1000 && target.closest('main')) {
      lastCashAt = now;
      addCash(25);
    }
  };
  const onPointerOver = (event: PointerEvent) => {
    if (event.pointerType !== 'mouse') return;
    const target = event.target instanceof Element ? event.target.closest(INTERACTIVE) : null;
    if (target === lastHover) return;
    lastHover = target;
    if (target && !target.closest('.gta-game, .heist-dialog')) playGtaSfx('nav');
  };
  const onClick = (event: MouseEvent) => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;
    if (target.closest("[data-testid='zoom-reset-button']")) {
      if (say('hereWeGo')) reward('herewego', 750);
      return;
    }
    const frontier = target.closest(FRONTIER_SWITCH);
    if (frontier) {
      // "Optimal only" leaves the frontier on the chart: the train's cue, once it is drawn.
      later(() => {
        const on =
          frontier.getAttribute('aria-checked') === 'true' ||
          (frontier instanceof HTMLInputElement && frontier.checked);
        if (on && frontier.isConnected) runTrain();
      }, 650);
      return;
    }
    if (!target.closest("[data-testid='export-png-button']")) return;
    const t = getStrings();
    const amount = 5000;
    addCash(amount);
    findSecret('export');
    emitGtaEffect({ type: 'overlay', kind: 'passed', sub: t.overlay.exportSub });
    playGtaClip('mission-passed-v', { fallback: 'passed' });
    feed(t.secrets.export.name, fill(t.feed.exportBody, { amount: money(amount) }), 'cash');
    later(() => raiseWanted(), 3600);
    later(() => say('dark'), 4400);
  };
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) return;
    if (event.key === 'Escape') {
      if (document.querySelector("[role='dialog'], [data-slot='popover-content']"))
        playGtaSfx('back');
      return;
    }
    if (event.key === 'Tab') {
      playGtaSfx('nav');
      return;
    }
    if (isTyping(event.target) || document.querySelector('.gta-game')) {
      typed = '';
      konami = 0;
      return;
    }
    const expected = KONAMI[konami];
    if (event.key === expected || event.key.toLowerCase() === expected) {
      konami++;
      if (konami === KONAMI.length) {
        konami = 0;
        cheat('konami');
      }
    } else {
      konami = event.key === KONAMI[0] ? 1 : 0;
    }
    if (event.key.length !== 1 || !/[a-z]/iu.test(event.key)) return;
    typed = (typed + event.key.toUpperCase()).slice(-LONGEST_CODE);
    for (const [id, code] of Object.entries(CODES)) {
      if (typed.endsWith(code)) {
        typed = '';
        cheat(id as SecretId);
        break;
      }
    }
  };
  document.addEventListener('pointerdown', onPointerDown, { passive: true });
  document.addEventListener('pointerover', onPointerOver, { passive: true });
  document.addEventListener('click', onClick, { passive: true });
  document.addEventListener('keydown', onKeyDown);

  window.addEventListener('gta-sound-toggle', onPreference);
  window.addEventListener('gta-music-toggle', onPreference);
  window.addEventListener('storage', onPreference);

  const onHeist = (event: Event) => {
    const detail = (event as CustomEvent<{ take?: number }>).detail;
    syncHeistRecord();
    const take = Math.max(0, Math.round(detail?.take ?? 0));
    addCash(take);
    findSecret('heist');
    feed(
      getStrings().secrets.heist.name,
      fill(getStrings().feed.heistBody, { amount: money(take) }),
      'cash',
    );
  };
  window.addEventListener(HEIST_RECORD_EVENT, onHeist);
  syncHeistRecord();

  // `?gta_hold=loading` on the address the visit starts at holds the site's data requests for
  // eight seconds each, so the stock loading placeholders stay up long enough for a still.
  // Nothing else reads the flag and the stock `fetch` is put back on unmount.
  let releaseHold: (() => void) | undefined;
  if (new URLSearchParams(window.location.search).get('gta_hold') === 'loading') {
    const stock = window.fetch;
    const held: typeof window.fetch = async (input, init) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      if (url.includes('/api/')) {
        await new Promise<void>((done) => {
          window.setTimeout(done, 8000);
        });
      }
      return stock.call(window, input, init);
    };
    window.fetch = held;
    releaseHold = () => {
      if (window.fetch === held) window.fetch = stock;
    };
  }

  // ------------------------------------------------------------ charts
  const disposeCharts = mountGtaCharts({
    blipLabel: (count) => `${getStrings().charts.tooltip} ${String(count).padStart(2, '0')}`,
    sweepLabel: (count) => fill(getStrings().charts.sweep, { count: String(count) }),
    exportStamp: (count) => {
      const t = getStrings().charts;
      return [t.stamp, fill(t.stampSub, { count: String(count) })];
    },
    onInspect: () => {
      inspected++;
      playGtaSfx('blip');
      if (chain === 1 && ++chainTagged === 3) {
        chain = 2;
        chainBlips = countGtaBlips();
        const t = getStrings();
        feed(t.feed.stashTitle, fill(t.feed.stashTagged, { count: String(chainBlips) }), 'info');
      }
      if (inspected === 25) {
        const t = getStrings();
        const amount = 2500;
        if (reward('frontier', amount))
          feed(
            t.secrets.frontier.name,
            fill(t.feed.frontierBody, { amount: money(amount) }),
            'cash',
          );
      }
    },
    onEmpty: () => {
      const t = getStrings();
      if (!wasted(t.overlay.wastedEmptySub)) playGtaSfx('error');
      feed(t.feed.emptyTitle, t.feed.emptyBody, 'wanted');
    },
  });

  // ------------------------------------------------------------ pages
  const route = (pathname: string) => {
    if (disposed || pathname === lastPath) return;
    const arrived = lastPath !== null;
    lastPath = pathname;
    // The page needs a moment to render before the not-found screen can be told apart.
    later(() => {
      const t = getStrings();
      if (document.querySelector(NOT_FOUND)) {
        emitGtaEffect({ type: 'zone', name: t.zones.notFound, id: 'notFound' });
        if (wasted(t.overlay.wastedSub)) later(() => say('wrongHouse'), 3600);
        return;
      }
      const zone = zoneOf(pathname);
      emitGtaEffect({ type: 'zone', name: t.zones[zone], id: zone });
      if (arrived && zone === 'home') later(() => say('grove'), 500);
      if (zone === 'home' && chain === 0) {
        chain = 1;
        later(() => feed(t.feed.stashTitle, t.feed.stashClue, 'info'), arrived ? 1800 : 7600);
      } else if (zone === 'home' && chain === 2) {
        chain = 3;
        // The drop pays a hundred dollars for every blip that was on the radar when the
        // third one was tagged.
        const amount = chainBlips * 100;
        later(() => {
          addCash(amount);
          playGtaSfx('cash');
          feed(
            t.feed.stashTitle,
            fill(t.feed.stashPaid, { count: String(chainBlips), amount: money(amount) }),
            'cash',
          );
        }, 1800);
      }
    }, 700);
  };

  // The phone comes out with its notification tone; Lamar's text is waiting inside it.
  const offEffects = onGtaEffect((effect) => {
    if (effect.type === 'phone') playGtaSfx('phone');
  });

  // ------------------------------------------------------------ activation
  // The first time ever, or whenever the theme is picked from the toggle (not on a page load
  // with the theme already saved), the unlock plays once.
  const firstEver = !getGtaState().found.includes('activate');
  if (firstEver) {
    later(() => {
      const t = getStrings();
      findSecret('activate');
      emitGtaEffect({ type: 'overlay', kind: 'passed' });
      playGtaSfx('passed');
      // With reduced motion the title holds, so nothing follows it on a timer.
      if (!prefersReducedMotion()) {
        later(() => feed(t.feed.welcomeTitle, t.feed.welcomeBody), 3400);
      }
    }, 350);
  } else if (mountedAt > 4000) {
    // Back in the theme: CJ steps into the alley again.
    later(() => {
      if (say('hereWeGo')) reward('herewego', 750);
    }, 350);
  }

  return {
    cheat,
    switchCharacter,
    tune,
    wordmark,
    route,
    stashStage: () => chain,
    dispose: () => {
      disposed = true;
      unsubscribe();
      offEffects();
      langObserver.disconnect();
      disposeCharts();
      releaseHold?.();
      for (const id of timers) window.clearTimeout(id);
      timers.clear();
      window.clearTimeout(decayTimer);
      if (scrollFrame !== undefined) cancelAnimationFrame(scrollFrame);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      window.removeEventListener('pointerdown', onFirstGesture, gestureOptions);
      window.removeEventListener('keydown', onFirstGesture, gestureOptions);
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('pointerover', onPointerOver);
      document.removeEventListener('click', onClick);
      document.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('gta-sound-toggle', onPreference);
      window.removeEventListener('gta-music-toggle', onPreference);
      window.removeEventListener('storage', onPreference);
      window.removeEventListener(HEIST_RECORD_EVENT, onHeist);
      delete root.dataset.gtaChar;
      delete root.dataset.gtaWeather;
      delete root.dataset.gtaWanted;
      root.removeAttribute(FX_ATTRIBUTE);
      for (const property of ROOT_PROPERTIES) root.style.removeProperty(property);
      setWanted(0);
      disposeGtaAudio();
    },
  };
}
