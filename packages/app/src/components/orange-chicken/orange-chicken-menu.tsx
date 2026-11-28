'use client';

import { useState } from 'react';

import { useLocale } from '@/lib/i18n/use-locale';
import { PEI_PEI_URI, foodDataUri } from './orange-chicken-art';
import { playOcSfx } from './orange-chicken-audio';
import { readBench } from './orange-chicken-bench';
import { MENU } from './orange-chicken-menu-strings';
import { emitOcEffect } from './orange-chicken-store';
import { fill } from './orange-chicken-strings';

const BASE = '/decorative/orange-chicken/';
const PHOTOS: Record<string, string | undefined> = {
  '1983': `${BASE}oc-glendale-galleria.webp`,
  '1987': `${BASE}oc-ala-moana-counter.webp`,
  now: `${BASE}oc-panda-storefront.webp`,
};

const say = (text: string) => emitOcEffect({ type: 'toast', text });

/** "Where it started": real places in the order they happened, shown in the banner's open space. */
export function BannerPlaces() {
  const locale = useLocale();
  const m = MENU[locale].places;
  return (
    <ul className="oc-places" aria-label={m.title}>
      {m.items.map((item, index) => {
        const photo = index === 0 ? undefined : PHOTOS[index === 3 ? 'now' : item.year];
        return (
          <li key={item.year}>
            <button
              type="button"
              className="oc-place"
              onClick={() => {
                playOcSfx('tap');
                say(`${item.year}, ${item.place}. ${item.fact}`);
              }}
            >
              {photo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={photo} alt={item.alt} width={280} height={160} loading="lazy" />
              ) : (
                <span className="oc-place-card" role="img" aria-label={item.alt}>
                  <span>PANDA</span>
                  <span>INN</span>
                </span>
              )}
              <span className="oc-place-year">{item.year}</span>
              <span className="oc-place-name">{item.place}</span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

export type Tab = 'plate' | 'wok' | 'orders' | 'box';
const TABS: readonly Tab[] = ['plate', 'wok', 'orders', 'box'];

export function MenuTabBar({ tab, onTab }: { tab: Tab; onTab: (next: Tab) => void }) {
  const locale = useLocale();
  const m = MENU[locale];
  return (
    <div className="oc-tabs" role="tablist" aria-label={m.tablist}>
      {TABS.map((id) => (
        <button
          key={id}
          type="button"
          role="tab"
          id={`oc-tab-${id}`}
          aria-selected={tab === id}
          aria-controls={`oc-panel-${id}`}
          tabIndex={tab === id ? 0 : -1}
          className="oc-tab"
          onClick={() => {
            playOcSfx('tap');
            onTab(id);
          }}
          onKeyDown={(event) => {
            const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
            if (!step) return;
            event.preventDefault();
            const next = TABS[(TABS.indexOf(id) + step + TABS.length) % TABS.length] ?? id;
            onTab(next);
            requestAnimationFrame(() =>
              document.querySelector<HTMLElement>(`#oc-tab-${next}`)?.focus(),
            );
          }}
        >
          {m.tabs[id]}
        </button>
      ))}
    </div>
  );
}

/** "What goes in the wok?" and the at-home recipe order: fry, toss, glaze. */
export function WokPanel() {
  const locale = useLocale();
  const w = MENU[locale].wok;
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const done = step >= w.steps.length;

  const advance = () => {
    if (done) return;
    const next = step + 1;
    setStep(next);
    playOcSfx(step === 0 ? 'sizzle' : step === 1 ? 'chop' : 'serve');
    say(next >= w.steps.length ? w.done : (w.quotes[step] ?? w.quotes[0] ?? ''));
  };

  return (
    <div className="oc-panel-body">
      <button
        type="button"
        className="oc-chip oc-chip-caps"
        aria-expanded={open}
        onClick={() => {
          setOpen(!open);
          playOcSfx('pop');
        }}
      >
        {open ? w.hide : w.reveal}
      </button>
      {open && (
        <ul className="oc-wok-items">
          {w.items.map((item) => (
            <li key={item.name}>
              <strong>{item.name}</strong>
              <span>{item.role}</span>
            </li>
          ))}
        </ul>
      )}
      <ol className="oc-wok-steps" aria-label={w.title}>
        {w.steps.map((name, index) => (
          <li key={name} data-state={index < step ? 'done' : index === step ? 'next' : 'wait'}>
            <button
              type="button"
              className="oc-chip oc-chip-caps"
              disabled={index !== step}
              onClick={advance}
            >
              {index + 1}. {name}
            </button>
          </li>
        ))}
      </ol>
      {done && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          className="oc-wok-result"
          src={`${BASE}oc-takeout-combo.webp`}
          alt={w.resultAlt}
          width={300}
          height={225}
        />
      )}
      <p className="oc-plate-status" role="status">
        {done ? w.done : (w.quotes[Math.min(step, w.quotes.length - 1)] ?? '')}
      </p>
      <div className="oc-plate-row">
        <button
          type="button"
          className="oc-chip oc-chip-caps"
          onClick={() => {
            setStep(0);
            playOcSfx('pop');
          }}
        >
          {w.again}
        </button>
      </div>
      <p className="oc-plate-note">{w.homeNote}</p>
    </div>
  );
}

/** "Who is keeping Panda Express in business?": name an exact order, defend it with the page's own chart. */
export function OrdersPanel() {
  const locale = useLocale();
  const o = MENU[locale].orders;
  const [picked, setPicked] = useState<number | null>(null);
  const [count, setCount] = useState(0);
  const [reply, setReply] = useState('');

  const pick = (index: number) => {
    const bench = readBench(locale === 'zh' ? '这个模型' : 'this model', '');
    const pickText = o.picks[index] ?? '';
    const text = bench.legend
      ? fill(o.defended, { pick: pickText, legend: bench.legend })
      : fill(o.defendedPlain, { pick: pickText });
    setPicked(index);
    setCount((n) => n + 1);
    setReply(text);
    playOcSfx('coin');
    say(text);
  };

  return (
    <div className="oc-panel-body">
      <p className="oc-plate-note">{o.prompt}</p>
      <div className="oc-orders" role="group" aria-label={o.title}>
        {o.picks.map((name, index) => (
          <button
            key={name}
            type="button"
            className="oc-chip"
            aria-pressed={picked === index}
            onClick={() => pick(index)}
          >
            {name}
          </button>
        ))}
      </div>
      <p className="oc-plate-status" role="status">
        {reply || fill(o.tally, { n: count })}
      </p>
      {reply && <p className="oc-plate-note">{fill(o.tally, { n: count })}</p>}
      <p className="oc-plate-note">{o.note}</p>
    </div>
  );
}

const FIGURES = [
  foodDataUri('chicken'),
  foodDataUri('box'),
  foodDataUri('dumpling'),
  foodDataUri('cookie'),
  PEI_PEI_URI,
] as const;

/** Blind-box unboxing: five collectible figures, one of them the panda. */
export function BoxPanel() {
  const locale = useLocale();
  const b = MENU[locale].box;
  const [found, setFound] = useState<readonly number[]>([]);
  const [last, setLast] = useState<number | null>(null);
  const [shake, setShake] = useState(0);

  const open = () => {
    // Weighted: the panda is rare, the rest are even.
    const roll = Math.random();
    const index = roll < 0.12 ? 4 : Math.floor(Math.random() * 4);
    setLast(index);
    setShake((n) => n + 1);
    setFound((list) => (list.includes(index) ? list : [...list, index]));
    playOcSfx(index === 4 ? 'fanfare' : 'pop');
    say(index === 4 ? b.secret : (b.figures[index]?.name ?? ''));
  };

  return (
    <div className="oc-panel-body">
      <div className="oc-box-stage" data-reveal={last === null ? 'closed' : 'open'} key={shake}>
        {last === null ? (
          <p className="oc-plate-status">{b.closed}</p>
        ) : (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={FIGURES[last]} alt="" aria-hidden="true" width={64} height={80} />
            <p className="oc-plate-status" role="status">
              {last === 4 ? b.secret : `${b.figures[last]?.name} (${b.figures[last]?.rarity})`}
            </p>
          </>
        )}
      </div>
      <ul
        className="oc-box-shelf"
        aria-label={fill(b.found, { n: found.length, total: FIGURES.length })}
      >
        {FIGURES.map((src, index) => (
          <li key={src} data-found={found.includes(index) ? 'true' : 'false'}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={src} alt="" aria-hidden="true" width={28} height={28} />
          </li>
        ))}
      </ul>
      <div className="oc-plate-row">
        <button type="button" className="oc-chip oc-chip-caps" onClick={open}>
          {last === null ? b.open : b.again}
        </button>
        <span className="oc-plate-note">
          {fill(b.found, { n: found.length, total: FIGURES.length })}
        </span>
      </div>
      <p className="oc-plate-note">{b.note}</p>
    </div>
  );
}
