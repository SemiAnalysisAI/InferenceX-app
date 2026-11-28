/**
 * Page-level behaviour for the Orange Chicken theme: delegated interface sounds, the music bed,
 * the scroll parallax variable and the hidden secrets (typed words, the classic code, a triple
 * click on a chart title, and a minute of idling). One set of passive listeners, all removed by
 * the returned cleanup.
 */
import { isEmbedPathname } from '@/lib/embed/embed-route';
import {
  playOcSfx,
  startOcMusic,
  stopOcMusic,
  unlockOcAudio,
  disposeOcAudio,
} from './orange-chicken-audio';
import { emitLine } from './orange-chicken-lines';
import { calmEnabled, getOcState, subscribeOc, type SecretId } from './orange-chicken-store';

const INTERACTIVE =
  "button, a[href], [role='button'], [role='tab'], [role='option'], [role='menuitem'], [role='switch'], [role='checkbox'], summary, select, input[type='checkbox'], input[type='radio']";
const TITLE_SELECTOR = "main h2, main h3, [data-slot='card-title']";
const WORDS: Record<string, SecretId> = { wok: 'wok', sesame: 'sesame' };
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
const IDLE_MS = 60_000;

function isActive(): boolean {
  const root = document.documentElement;
  return (
    root.classList.contains('orange-chicken') &&
    !Object.hasOwn(root.dataset, 'inferencexEmbed') &&
    !isEmbedPathname(window.location.pathname)
  );
}

function typingTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || target.matches('input, textarea, select'))
  );
}

export interface ChickenRuntime {
  dispose: () => void;
}

function unlock() {
  if (!isActive()) return;
  unlockOcAudio();
  if (getOcState().music) startOcMusic();
}

function onVisibility() {
  if (document.hidden) stopOcMusic();
  else if (isActive() && getOcState().music) startOcMusic();
}

export function mountChickenRuntime(onSecret: (id: SecretId) => void): ChickenRuntime {
  let typed = '';
  let konami = 0;
  let idleTimer: number | undefined;
  let scrollFrame: number | undefined;
  let titleClicks = { count: 0, at: 0, target: null as Element | null };
  const root = document.documentElement;

  const armIdle = () => {
    window.clearTimeout(idleTimer);
    idleTimer = window.setTimeout(() => {
      if (isActive() && !document.hidden) onSecret('idle');
    }, IDLE_MS);
  };

  const onPointerDown = () => {
    unlock();
    armIdle();
  };

  const onKeyDown = (event: KeyboardEvent) => {
    armIdle();
    if (!isActive()) return;
    unlock();
    if (typingTarget(event.target) || event.metaKey || event.ctrlKey || event.altKey) return;
    const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
    // The classic code.
    if (key === KONAMI[konami]) {
      konami++;
      if (konami === KONAMI.length) {
        konami = 0;
        onSecret('konami');
      }
    } else konami = key === KONAMI[0] ? 1 : 0;
    // Typed words.
    if (event.key.length === 1) {
      typed = (typed + key).slice(-8);
      for (const [word, id] of Object.entries(WORDS)) {
        if (typed.endsWith(word)) {
          typed = '';
          onSecret(id);
        }
      }
    }
  };

  const onClick = (event: MouseEvent) => {
    if (!isActive() || !(event.target instanceof Element)) return;
    const title = event.target.closest(TITLE_SELECTOR);
    if (title) {
      const now = performance.now();
      titleClicks =
        titleClicks.target === title && now - titleClicks.at < 600
          ? { count: titleClicks.count + 1, at: now, target: title }
          : { count: 1, at: now, target: title };
      if (titleClicks.count >= 3) {
        titleClicks.count = 0;
        onSecret('bell');
      }
    }
    const control = event.target.closest(INTERACTIVE);
    if (!control || (control as HTMLButtonElement).disabled) return;
    if (control.matches('[data-testid="scatter-reset-filter"]')) {
      // Every series is back on the legend: the whole table is served.
      window.setTimeout(() => {
        const n = document.querySelectorAll('[data-testid^="legend-points-"]').length;
        emitLine('family', {
          en:
            n > 0 ? `All ${n} series are back at the table.` : 'Every series is back at the table.',
          zh: n > 0 ? `全部 ${n} 条曲线都回到了桌上。` : '所有曲线都回到了桌上。',
        });
      }, 350);
    }
    if (control.matches("[role='tab'], [data-slot='tabs-trigger']"))
      playOcSfx('bell', { rate: 0.8 });
    else if (control.matches("[role='switch'], [role='checkbox'], input[type='checkbox']")) {
      playOcSfx('pop');
    } else if (control.matches("[role='option'], [role='menuitem']"))
      playOcSfx('tap', { rate: 1.2 });
    else if (control.matches("[data-slot='button'][class~='bg-primary']")) playOcSfx('clang');
    else if (control.matches('a[href]')) playOcSfx('tap', { rate: 0.8 });
    else playOcSfx('chop');
  };

  let lastHover: Element | null = null;
  const onPointerOver = (event: PointerEvent) => {
    if (!isActive() || event.pointerType === 'touch' || !(event.target instanceof Element)) return;
    const control = event.target.closest(INTERACTIVE);
    if (!control || control === lastHover) return;
    lastHover = control;
    playOcSfx('hover');
  };

  const onScroll = () => {
    if (scrollFrame !== undefined || calmEnabled()) return;
    scrollFrame = requestAnimationFrame(() => {
      scrollFrame = undefined;
      root.style.setProperty('--oc-scroll', String(Math.round(window.scrollY)));
    });
  };

  // The music bed follows the toggle from anywhere.
  let wasMusic = getOcState().music;
  const unsubscribe = subscribeOc(() => {
    const { music } = getOcState();
    if (music === wasMusic) return;
    wasMusic = music;
    if (music && isActive()) startOcMusic();
    else stopOcMusic();
  });

  document.addEventListener('pointerdown', onPointerDown, { passive: true });
  document.addEventListener('keydown', onKeyDown);
  document.addEventListener('click', onClick);
  document.addEventListener('pointerover', onPointerOver, { passive: true });
  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('scroll', onScroll, { passive: true });
  armIdle();
  onScroll();

  return {
    dispose() {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('click', onClick);
      document.removeEventListener('pointerover', onPointerOver);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('scroll', onScroll);
      unsubscribe();
      window.clearTimeout(idleTimer);
      if (scrollFrame !== undefined) cancelAnimationFrame(scrollFrame);
      root.style.removeProperty('--oc-scroll');
      disposeOcAudio();
    },
  };
}
