'use client';

import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';

import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { useLocale } from '@/lib/i18n/use-locale';
import { foodDataUri } from './orange-chicken-art';
import { duckOcMusic, playOcSfx } from './orange-chicken-audio';
import { ringBestOrder } from './orange-chicken-charts';
import { readBench } from './orange-chicken-bench';
import { laneIsClear, pickLane } from './orange-chicken-lane';
import { LINE_IDS, LINES, type LineId } from './orange-chicken-lines';
import { MENU } from './orange-chicken-menu-strings';
import { MEME_IDS, MEMES, roastPayoff, wokPayoff, type MemeId } from './orange-chicken-memes';
import {
  SECRET_IDS,
  discoverLine,
  TROPHY_IDS,
  calmEnabled,
  getOcState,
  getServerOcState,
  subscribeOc,
  subscribeOcEffects,
  type OcEffect,
} from './orange-chicken-store';
import { STRINGS, fill } from './orange-chicken-strings';

interface Toast {
  id: number;
  text: string;
  tone: 'fortune' | 'plain' | 'slip' | 'line';
  /** Optional photo shown beside a slip toast. */
  image?: string;
  /** One short sentence about the event a menu board line answers. */
  sub?: string;
}

const COOKIE_PHOTO = '/decorative/orange-chicken/oc-fortune-cookie.webp';
let slipsSeen = 0;

const FOOD_URIS = {
  chicken: foodDataUri('chicken'),
  box: foodDataUri('box'),
  dumpling: foodDataUri('dumpling'),
  cookie: foodDataUri('cookie'),
};
const FOOD_LIST = Object.values(FOOD_URIS);
const TROPHY_FOOD = {
  prep: FOOD_URIS.dumpling,
  wok: FOOD_URIS.chicken,
  courier: FOOD_URIS.box,
  chef: FOOD_URIS.cookie,
  golden: FOOD_URIS.chicken,
} as const;

function Cat() {
  return (
    <svg className="oc-cat" viewBox="0 0 92 110" role="img" aria-label="Lucky cat">
      <path d="M12 108V62Q12 30 46 30T80 62V108Z" fill="#fff8ed" stroke="#4a1e0a" strokeWidth="3" />
      <path
        d="M20 34 18 8l20 14M72 34 74 8 54 22"
        fill="#fff8ed"
        stroke="#4a1e0a"
        strokeWidth="3"
        strokeLinejoin="round"
      />
      <circle cx="36" cy="50" r="3.5" fill="#4a1e0a" />
      <circle cx="56" cy="50" r="3.5" fill="#4a1e0a" />
      <path
        d="M42 60q4 4 8 0"
        fill="none"
        stroke="#4a1e0a"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      <path d="M26 66h40" stroke="#a82a14" strokeWidth="6" strokeLinecap="round" />
      <circle cx="46" cy="76" r="7" fill="#f6b93b" stroke="#4a1e0a" strokeWidth="2.5" />
      <g className="oc-paw">
        <path
          d="M68 62q14-6 12-30"
          fill="none"
          stroke="#4a1e0a"
          strokeWidth="14"
          strokeLinecap="round"
        />
        <path
          d="M68 62q14-6 12-30"
          fill="none"
          stroke="#fff8ed"
          strokeWidth="9"
          strokeLinecap="round"
        />
      </g>
    </svg>
  );
}

/** Full-screen flourishes, toasts and the journal. Listens for effects from the store. */
export default function OrangeChickenFx({
  onJournalChange,
}: {
  onJournalChange?: (open: boolean) => void;
}) {
  const locale = useLocale();
  const t = STRINGS[locale];
  const layer = useRef<HTMLDivElement>(null);
  const back = useRef<HTMLDivElement>(null);
  const lane = useRef<HTMLDivElement>(null);
  const [laneMode, setLaneMode] = useState<'open' | 'quiet' | 'rail'>('open');
  const [rail, setRail] = useState<HTMLElement | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [journal, setJournal] = useState(false);
  const [cat, setCat] = useState(false);
  const state = useSyncExternalStore(subscribeOc, getOcState, getServerOcState);
  const serial = useRef(0);
  const timers = useRef(new Set<number>());

  useEffect(() => {
    const pending = timers.current;
    const later = (fn: () => void, ms: number) => {
      const id = window.setTimeout(() => {
        pending.delete(id);
        fn();
      }, ms);
      pending.add(id);
    };
    const toast = (text: string, tone: Toast['tone'] = 'plain', image?: string, sub?: string) => {
      const id = ++serial.current;
      setToasts((list) => [...list.slice(-1), { id, text, tone, image, sub }]);
      later(() => setToasts((list) => list.filter((item) => item.id !== id)), 3800);
    };
    const spawn = (node: HTMLElement, ms: number, behind = false) => {
      (behind ? back.current : layer.current)?.append(node);
      later(() => node.remove(), ms);
    };
    const shower = (count: number, images: string[], calm: boolean) => {
      const total = calm ? Math.ceil(count / 4) : count;
      for (let index = 0; index < total; index++) {
        const img = document.createElement('img');
        img.className = 'oc-rain';
        img.src = images[index % images.length] ?? '';
        img.alt = '';
        img.style.left = `${Math.random() * 96}%`;
        img.style.animationDuration = `${calm ? 4 : 2.2 + Math.random() * 2.4}s`;
        img.style.animationDelay = `${Math.random() * 1.2}s`;
        img.style.setProperty('--oc-spin', `${Math.round(Math.random() * 720 - 360)}deg`);
        spawn(img, 6200, true);
      }
    };

    return subscribeOcEffects((effect: OcEffect) => {
      const calm = calmEnabled();
      switch (effect.type) {
        case 'wok': {
          const flames = document.createElement('div');
          flames.className = 'oc-flames';
          spawn(flames, 1700, true);
          playOcSfx('sizzle');
          playOcSfx('clang');
          duckOcMusic();
          discoverLine('meme-wok');
          toast(t.toasts.wok, 'plain', undefined, wokPayoff()[locale]);
          break;
        }
        case 'rain': {
          shower(46, FOOD_LIST, calm);
          playOcSfx('fanfare');
          duckOcMusic(0.3, 1400);
          toast(t.toasts.konami);
          break;
        }
        case 'sesame': {
          shower(60, [FOOD_URIS.cookie], calm);
          playOcSfx('sizzle');
          toast(t.toasts.sesame);
          break;
        }
        case 'seal': {
          // The stamp only lands where it covers no text, control or chart; otherwise it is skipped.
          const spot = pickLane(132, 132);
          if (spot) {
            const stamp = document.createElement('div');
            stamp.className = 'oc-stamp';
            stamp.textContent = '鸡';
            stamp.style.left = `${spot.left}px`;
            stamp.style.top = `${spot.top}px`;
            spawn(stamp, 1700);
          }
          playOcSfx('stamp');
          toast(t.toasts.seal);
          break;
        }
        case 'bell': {
          playOcSfx('bell');
          ringBestOrder();
          toast(t.toasts.bell);
          break;
        }
        case 'fortune': {
          // Cookie 1 carries the slip that was printed in a real Panda Express cookie. Cookie 2 is
          // always the roast, naming the model on screen ("Fortune Cookie Roasted Me"). After that
          // the cookies mix real slips, roasts and the theme's own benchmark fortunes.
          const slips = t.slips;
          const roasts = MENU[locale].roasts;
          const n = slipsSeen++;
          const bench = readBench(locale === 'zh' ? '这个模型' : 'this model', '');
          const roast = (index: number) =>
            (roasts[index % roasts.length] ?? '').replaceAll('{model}', bench.model);
          playOcSfx('pop');
          playOcSfx('bell', { rate: 0.7, gap: 0 });
          const roastSub = () => {
            discoverLine('meme-roast');
            return roastPayoff()[locale];
          };
          if (n === 0) {
            toast(slips[0] ?? '', 'slip', COOKIE_PHOTO);
          } else if (n === 1) {
            toast(roast(0), 'slip', COOKIE_PHOTO, roastSub());
          } else {
            const roll = Math.random();
            if (roll < 0.34)
              toast(
                roast(Math.floor(Math.random() * roasts.length)),
                'slip',
                COOKIE_PHOTO,
                roastSub(),
              );
            else if (roll < 0.67)
              toast(slips[Math.floor(Math.random() * slips.length)] ?? '', 'slip', COOKIE_PHOTO);
            else toast(t.fortunes[Math.floor(Math.random() * t.fortunes.length)] ?? '', 'fortune');
          }
          break;
        }
        case 'idle': {
          setCat(true);
          playOcSfx('bell');
          toast(t.toasts.idle);
          break;
        }
        case 'journal': {
          setJournal(true);
          onJournalChange?.(true);
          break;
        }
        case 'line': {
          const entry = LINES[effect.id as LineId];
          if (!entry) break;
          const text = locale === 'zh' ? `${entry.zh} · “${entry.en}”` : `“${entry.en}”`;
          if (entry.sfx) playOcSfx(entry.sfx);
          toast(text, 'line', undefined, effect.sub?.[locale]);
          break;
        }
        case 'meme': {
          const entry = MEMES[effect.id as MemeId];
          if (!entry) break;
          toast(entry.name[locale], 'line', undefined, effect.sub[locale]);
          break;
        }
        case 'toast': {
          toast(
            effect.text,
            effect.tone ?? 'plain',
            effect.tone === 'slip' ? COOKIE_PHOTO : undefined,
          );
          break;
        }
      }
    });
  }, [t, locale, onJournalChange]);

  // Toasts sit in a lane that covers nothing readable; with no lane they stay as live-region text only.
  useLayoutEffect(() => {
    const el = lane.current;
    if (!el || toasts.length === 0) return;
    let frame = 0;
    const place = () => {
      frame = 0;
      // Measure the toasts at their natural size, even when they were last hidden.
      el.dataset.lane = 'open';
      const rect = el.getBoundingClientRect();
      // Keep a spot that is still clear; layout moves (a panel opening, a dialog mounting, the page
      // scrolling) are caught by the interval below and the toast moves or hides.
      if (laneIsClear(rect, el)) {
        setLaneMode('open');
        setRail(null);
        return;
      }
      const spot = pickLane(rect.width, rect.height, el);
      if (spot) {
        el.style.left = `${spot.left}px`;
        el.style.top = `${spot.top}px`;
        setLaneMode('open');
        setRail(null);
        return;
      }
      // No free spot on screen: use the banner's own ticket rail (a reserved row in the layout) when
      // it is in view; otherwise the words stay in the live region only.
      const target = document.querySelector<HTMLElement>('[data-oc-rail]');
      const box = (target?.parentElement ?? target)?.getBoundingClientRect();
      const inView = Boolean(target && box && box.bottom > 0 && box.top < window.innerHeight);
      setRail(inView ? target : null);
      const mode = inView ? 'rail' : 'quiet';
      el.dataset.lane = mode;
      setLaneMode(mode);
    };
    place();
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(place);
    };
    const watch = window.setInterval(onScroll, 150);
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      window.clearInterval(watch);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [toasts]);

  useEffect(() => {
    const pending = timers.current;
    return () => {
      for (const id of pending) window.clearTimeout(id);
      pending.clear();
    };
  }, []);

  // The lucky cat leaves as soon as the reader comes back.
  useEffect(() => {
    if (!cat) return;
    const leave = () => setCat(false);
    const id = window.setTimeout(() => {
      document.addEventListener('pointerdown', leave, { once: true });
      document.addEventListener('keydown', leave, { once: true });
    }, 2500);
    const stop = window.setTimeout(leave, 20_000);
    return () => {
      window.clearTimeout(id);
      window.clearTimeout(stop);
      document.removeEventListener('pointerdown', leave);
      document.removeEventListener('keydown', leave);
    };
  }, [cat]);

  const toastItems = toasts.map((toast) => (
    <div key={toast.id} className="oc-toast" data-tone={toast.tone}>
      {toast.image && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={toast.image} alt="" aria-hidden="true" width={64} height={48} />
      )}
      <span>
        {toast.text}
        {toast.sub && <small className="oc-toast-sub">{toast.sub}</small>}
      </span>
    </div>
  ));

  return (
    <>
      <div className="oc-fx" ref={layer} aria-hidden="true">
        {cat && <Cat />}
      </div>
      <div className="oc-fx-back" ref={back} aria-hidden="true" />
      <div className="oc-toasts" ref={lane} role="status" aria-live="polite" data-lane={laneMode}>
        {toastItems}
      </div>
      {rail && laneMode === 'rail' && toasts.length > 0
        ? createPortal(
            <div className="oc-rail-toasts" aria-hidden="true">
              {toastItems}
            </div>,
            rail,
          )
        : null}
      {journal && (
        <Dialog
          open
          onOpenChange={(open) => {
            if (!open) {
              setJournal(false);
              onJournalChange?.(false);
            }
          }}
        >
          <DialogContent className="oc-dialog max-h-[88vh] overflow-y-auto">
            <DialogTitle className="oc-dialog-title">{t.journal.title}</DialogTitle>
            <DialogDescription>{t.journal.intro}</DialogDescription>
            <ul className="oc-banner-trophies" aria-label={t.banner.trophies}>
              <li className="oc-trophy" data-earned={state.save.orders > 0 ? 'true' : 'false'}>
                {fill(t.banner.orders, {
                  n: new Intl.NumberFormat(locale === 'zh' ? 'zh-CN' : 'en-US').format(
                    state.save.orders,
                  ),
                })}
              </li>
              {TROPHY_IDS.map((id) => {
                const earned = state.save.trophies.includes(id);
                return (
                  <li key={id} className="oc-trophy" data-earned={earned ? 'true' : 'false'}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={TROPHY_FOOD[id]} alt="" aria-hidden="true" />
                    {t.trophies[id]}
                    <span className="sr-only">{earned ? ' ✓' : ''}</span>
                  </li>
                );
              })}
            </ul>
            <h3 className="oc-journal-sub">
              {fill(t.journal.linesTitle, {
                n: LINE_IDS.filter((id) => state.lines.includes(id)).length,
                total: LINE_IDS.length,
              })}
            </h3>
            <ul className="oc-lines" aria-label={t.journal.linesTitle}>
              {LINE_IDS.map((id) => {
                const found = state.lines.includes(id);
                const entry = LINES[id];
                return (
                  <li key={id} data-found={found ? 'true' : 'false'}>
                    <strong>
                      {found ? (locale === 'zh' ? `${entry.zh} · ${entry.en}` : entry.en) : '???'}
                    </strong>
                    <span>{entry.event[locale]}</span>
                  </li>
                );
              })}
            </ul>
            <h3 className="oc-journal-sub">
              {fill(t.journal.memesTitle, {
                n: MEME_IDS.filter((id) => state.lines.includes(`meme-${id}`)).length,
                total: MEME_IDS.length,
              })}
            </h3>
            <ul className="oc-lines" aria-label={t.journal.memesTitle}>
              {MEME_IDS.map((id) => {
                const found = state.lines.includes(`meme-${id}`);
                const entry = MEMES[id];
                return (
                  <li key={id} data-found={found ? 'true' : 'false'}>
                    <strong>{found ? entry.name[locale] : '???'}</strong>
                    <span>{entry.event[locale]}</span>
                  </li>
                );
              })}
            </ul>
            <ul className="oc-journal">
              {SECRET_IDS.map((id) => {
                const found = state.found.includes(id);
                const entry = t.journal.secrets[id];
                return (
                  <li key={id} data-found={found ? 'true' : 'false'}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={FOOD_URIS.cookie} alt="" aria-hidden="true" />
                    <strong>{found ? entry.name : '???'}</strong>
                    <span>{found ? entry.hint : t.journal.unknown}</span>
                  </li>
                );
              })}
            </ul>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
