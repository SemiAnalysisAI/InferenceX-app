'use client';

import { useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { usePathname } from 'next/navigation';

import { useLocale } from '@/lib/i18n/use-locale';

import { playClip } from './csgo-audio';
import { CsgoToggles } from './csgo-toggles';
import {
  CSGO_LINE_EVENT,
  CSGO_LINES,
  CSGO_MAPS,
  CSGO_MEMES,
  chartMemeNote,
  cueCsgoLine,
  lineText,
  pairText,
  type CsgoLineId,
} from './csgo-radio';
import { csgoCopy } from './csgo-strings';
import {
  CSGO_SAVE_EVENT,
  CSGO_SIDES,
  type CsgoSide,
  mergeSave,
  prefersReducedMotion,
  rankOf,
  readSave,
  readSide,
  writeSide,
} from './csgo-store';

const CsgoGameDialog = dynamic(() => import('./csgo-game'), { ssr: false });

function clockLabel(seconds: number) {
  const mins = Math.floor(seconds / 60);
  const rest = String(seconds % 60).padStart(2, '0');
  return `${mins}:${rest}`;
}

export function CsgoBanner({ toast }: { toast: string }) {
  const locale = useLocale();
  const pathname = usePathname();
  const copy = csgoCopy(locale);
  const home = pathname === '/' || pathname === '/zh';
  const [open, setOpen] = useState(false);
  const [radio, setRadio] = useState(false);
  const [side, setSide] = useState<CsgoSide>('ct');
  const [save, setSave] = useState(readSave);
  const [splash, setSplash] = useState(0);
  const [clock, setClock] = useState(115);
  const [line, setLine] = useState('');
  const [pairs, setPairs] = useState<string[]>([]);
  const [found, setFound] = useState<string[]>([]);
  const [payoff, setPayoff] = useState('');
  const [drawer, setDrawer] = useState(false);
  const [defuse, setDefuse] = useState(false);
  const [eggNext, setEggNext] = useState(false);
  const [lost, setLost] = useState(false);
  const [eggDone, setEggDone] = useState(false);
  const [poseLock, setPoseLock] = useState(0);
  const [tPose, setTPose] = useState<'idle' | 'aim' | 'plant'>('idle');

  const pathRef = useRef(pathname);
  useEffect(() => {
    if (pathRef.current !== pathname) {
      setOpen(false);
      document.body.style.overflow = '';
      if (document.pointerLockElement) void document.exitPointerLock();
    }
    pathRef.current = pathname;
  }, [pathname]);

  useEffect(() => {
    const onPop = () => {
      setOpen(false);
      document.body.style.overflow = '';
      if (document.pointerLockElement) void document.exitPointerLock();
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  useEffect(() => {
    setSide(readSide());
    const sync = () => setSave(readSave());
    window.addEventListener(CSGO_SAVE_EVENT, sync);
    return () => window.removeEventListener(CSGO_SAVE_EVENT, sync);
  }, []);

  useEffect(() => {
    try {
      const saved = sessionStorage.getItem('csgo-lines-found');
      if (saved) setFound(saved.split(',').filter(Boolean));
      setEggDone(sessionStorage.getItem('csgo-egg') === 'defused');
    } catch {
      /* private mode */
    }
  }, [pathname]);

  useEffect(() => {
    let tries = 0;
    const mark = window.setInterval(() => {
      tries += 1;
      const text = document.body.textContent ?? '';
      const missing = text.includes('Page Not Found') || text.includes('页面不存在');
      if (!missing && tries < 16) return;
      window.clearInterval(mark);
      setLost(missing);
      if (!missing) return;
      setPairs((current) =>
        ['fallback', ...current.filter((item) => item !== 'fallback')].slice(0, 2),
      );
      cueCsgoLine('fallback');
      window.setTimeout(() => {
        setPairs((current) => current.filter((item) => item !== 'fallback'));
      }, 5500);
    }, 300);
    return () => window.clearInterval(mark);
  }, [pathname]);

  useEffect(() => {
    const onMeme = (event: Event) => {
      const id = (event as CustomEvent<string>).detail;
      const meme = CSGO_MEMES.find((row) => row.id === id);
      if (!meme) return;
      const note = chartMemeNote(id);
      const text = locale === 'zh' ? meme.zh : meme.en;
      const other = locale === 'zh' ? meme.en : meme.zh;
      setLine(note ? `${text} ${other} ${note}` : `${text} ${other}`);
      setPayoff(id);
    };
    window.addEventListener('csgo-meme', onMeme);
    return () => {
      window.removeEventListener('csgo-meme', onMeme);
    };
  }, [locale]);

  useEffect(() => {
    const onLine = (event: Event) => {
      const id = (event as CustomEvent<string>).detail;
      if (!pairText(id)) return;
      setPairs((current) => [id, ...current.filter((item) => item !== id)].slice(0, 2));
      setFound((current) => {
        if (current.includes(id)) return current;
        const next = [...current, id];
        try {
          sessionStorage.setItem('csgo-lines-found', next.join(','));
        } catch {
          /* private mode */
        }
        return next;
      });
      window.setTimeout(() => {
        setPairs((current) => current.filter((item) => item !== id));
      }, 5500);
    };
    window.addEventListener(CSGO_LINE_EVENT, onLine);
    return () => window.removeEventListener(CSGO_LINE_EVENT, onLine);
  }, []);

  useEffect(() => {
    if (prefersReducedMotion()) return;
    const timer = window.setInterval(
      () => setSplash((index) => (index + 1) % copy.splash.length),
      5200,
    );
    return () => window.clearInterval(timer);
  }, [copy.splash.length]);

  useEffect(() => {
    if (prefersReducedMotion()) return;
    const timer = window.setInterval(
      () => setClock((value) => (value <= 0 ? 115 : value - 1)),
      1000,
    );
    return () => window.clearInterval(timer);
  }, []);

  const rank = rankOf(save);
  const rankLabel = locale === 'zh' ? rank.zh : rank.en;
  const [pose, setPose] = useState<'idle' | 'aim' | 'fire'>('idle');
  const [react, setReact] = useState('');
  const medals = [
    { id: 'silver', en: 'Silver', zh: '白银' },
    { id: 'ace', en: 'Ace', zh: '五杀' },
    { id: 'rushb', en: 'Rush B', zh: 'Rush B' },
    { id: 'plant', en: 'Plant', zh: '下包' },
    { id: 'defuse', en: 'Defuse', zh: '拆包' },
    { id: 'awp', en: 'AWP', zh: 'AWP' },
    { id: 'major', en: 'Major', zh: 'Major' },
    { id: 'global', en: 'Global', zh: '全球精英' },
  ];

  useEffect(() => {
    if (prefersReducedMotion()) return;
    const order = ['idle', 'aim', 'fire'] as const;
    const tOrder = ['idle', 'aim', 'plant'] as const;
    const timer = window.setInterval(() => {
      if (Date.now() < poseLock) return;
      setPose((current) => order[(order.indexOf(current) + 1) % order.length] ?? 'idle');
      setTPose((current) => tOrder[(tOrder.indexOf(current) + 1) % tOrder.length] ?? 'idle');
    }, 1800);
    return () => window.clearInterval(timer);
  }, [poseLock]);
  const say = (id: CsgoLineId, clip?: 'accept' | 'ez' | 'ten' | 'bombpl') => {
    setLine(lineText(id, locale));
    cueCsgoLine(id);
    if (clip) playClip(clip);
  };

  return (
    <div className="container mx-auto px-4 lg:px-8" data-testid="csgo-theme-banner">
      <div
        className="csgo-theme-banner"
        data-compact={home ? 'false' : 'true'}
        data-open={drawer ? 'true' : 'false'}
      >
        <div className="csgo-banner-top csgo-brand">
          <img
            src="/decorative/csgo/csgo-logo.webp"
            alt="Counter-Strike: Global Offensive"
            width={243}
            height={69}
            decoding="async"
          />
          <div className="csgo-brand-copy">
            <div className="csgo-word">{copy.word}</div>
            <div className="csgo-tag text-sm">{copy.tag}</div>
          </div>
        </div>
        <div className="csgo-glance">
          <img
            className="csgo-glance-still"
            src="/decorative/csgo/fp-hud.webp"
            alt={
              locale === 'zh'
                ? '第一人称步枪、雷达和计分板'
                : 'First-person rifle, radar and scoreboard'
            }
            width={1280}
            height={720}
            decoding="async"
          />
          <span className="csgo-sticker" data-testid="csgo-sticker-iwnl">
            IWNL
          </span>
          <div className="csgo-figures" data-testid="csgo-figures">
            <figure
              className="csgo-fig"
              data-side="ct"
              data-pose={pose}
              data-testid="csgo-fig-ct"
              onClick={() => {
                setPose('fire');
                setReact('duck');
                setTPose('plant');
                setPoseLock(Date.now() + 3200);
                window.setTimeout(() => setReact(''), 2400);
              }}
            >
              <img
                src="/decorative/csgo/fig-ct.webp"
                alt={
                  locale === 'zh'
                    ? '反恐精英，海豹突击队士兵'
                    : 'Counter-Terrorist, Seal Team 6 soldier'
                }
                width={297}
                height={663}
              />
              <figcaption>CT</figcaption>
            </figure>
            <figure
              className="csgo-fig"
              data-side="t"
              data-pose={react === 'duck' ? 'duck' : tPose}
              data-react={react}
              data-testid="csgo-fig-t"
              onClick={() => {
                setTPose((current) =>
                  current === 'idle' ? 'aim' : current === 'aim' ? 'plant' : 'idle',
                );
                setPose('aim');
                setPoseLock(Date.now() + 3200);
              }}
            >
              <img
                src="/decorative/csgo/fig-t.webp"
                alt={locale === 'zh' ? '恐怖分子，精英小队' : 'Terrorist, Elite Crew'}
                width={242}
                height={640}
              />
              <figcaption>T</figcaption>
            </figure>
          </div>
        </div>
        <div className="csgo-score" aria-label={locale === 'zh' ? '比分' : 'Score'}>
          <span data-side="ct">CT 0</span>
          <strong>{clockLabel(clock)}</strong>
          <span data-side="t">T 0</span>
          <span className="csgo-score-extra">$800</span>
          <span className="csgo-score-extra">HP 100</span>
          <span className="csgo-score-extra">{locale === 'zh' ? '护甲' : 'ARMOR'}</span>
          <span data-testid="csgo-kits">
            {copy.kits} {save.kits.length}
          </span>
          <div className="csgo-line-stack">
            {pairs.map((id) => {
              const pair = pairText(id);
              if (!pair) return null;
              return (
                <p key={id} className="csgo-line" data-testid="csgo-line" data-line={id}>
                  <span>{pair.en}</span>
                  <span lang="zh">{pair.zh}</span>
                </p>
              );
            })}
          </div>
        </div>
        <div className="csgo-rank">
          <div className="text-3xs">{copy.rank}</div>
          <strong>{rankLabel}</strong>
          <div className="text-3xs">
            {'★'.repeat(Math.min(5, rank.stars)) || '—'} {rank.stars} {copy.stars}
          </div>
          <div className="text-3xs">
            {copy.best} {save.bestEndless}
          </div>
        </div>
        <div className="csgo-medals" data-testid="csgo-medals">
          {medals.map((medal) => (
            <span
              key={medal.id}
              data-earned={save.medals[medal.id] || medal.id === 'silver' ? 'true' : 'false'}
            >
              {locale === 'zh' ? medal.zh : medal.en}
            </span>
          ))}
        </div>
        <div className="csgo-cast">
          <img src="/decorative/csgo/loc-b.webp" alt="" width={180} height={100} />
          <img
            src="/decorative/csgo/loc-mirage.webp"
            alt=""
            width={180}
            height={100}
            data-testid="csgo-still-mirage"
          />
          <img
            src="/decorative/csgo/loc-overpass.webp"
            alt=""
            width={180}
            height={100}
            data-testid="csgo-still-overpass"
          />
        </div>
        <p className="csgo-splash">{copy.splash[splash] ?? copy.splash[0]}</p>
        <div className="csgo-banner-actions">
          <div className="csgo-side-row" role="group" aria-label={copy.sides.ct}>
            {CSGO_SIDES.map((id) => (
              <button
                key={id}
                type="button"
                data-side={id}
                data-testid={`csgo-side-${id}`}
                aria-pressed={side === id}
                onClick={() => {
                  setSide(id);
                  writeSide(id);
                  say(
                    id === 't' ? 'go' : id === 'night' ? 'hold' : id === 'day' ? 'clear' : 'roger',
                    'accept',
                  );
                }}
              >
                {copy.sides[id]}
              </button>
            ))}
          </div>
          <div className="csgo-maps" role="group" aria-label={locale === 'zh' ? '地图' : 'Maps'}>
            {CSGO_MAPS.map((map) => (
              <button
                key={map.id}
                type="button"
                data-testid={`csgo-map-${map.id.toLowerCase().replaceAll(' ', '-')}`}
                onClick={() => {
                  setLine(locale === 'zh' ? map.zh : map.en);
                  document.documentElement.dataset.csgoMap = map.id;
                }}
              >
                {map.id}
              </button>
            ))}
          </div>
          <button
            type="button"
            data-testid="csgo-play"
            onClick={() => {
              say('follow', 'accept');
              setOpen(true);
            }}
          >
            {copy.play}
          </button>
          <button
            type="button"
            data-testid="csgo-jump-btn"
            onClick={() => {
              document.documentElement.dataset.csgoJump = String(Date.now());
              window.dispatchEvent(new Event('csgo-jump'));
              say('coldzera');
            }}
          >
            {locale === 'zh' ? '冷神跳枪' : 'Coldzera'}
          </button>
          <button
            type="button"
            data-testid="csgo-radio"
            aria-expanded={radio}
            onClick={() => setRadio((value) => !value)}
          >
            {locale === 'zh' ? '无线电' : 'Radio'}
          </button>
          <button
            type="button"
            data-csgo-silent
            data-testid="csgo-defuse-btn"
            aria-label={copy.eggBomb}
            onClick={() => {
              if (pathname.includes('/inference')) {
                setDefuse(true);
                setEggNext(true);
                document.documentElement.dataset.csgoDefuse = String(Date.now());
                try {
                  sessionStorage.setItem('csgo-egg', 'defused');
                } catch {
                  /* private mode */
                }
                setEggDone(true);
                window.setTimeout(() => setDefuse(false), 5500);
                return;
              }
              const next = mergeSave({ xp: readSave().xp + 80, medal: { id: 'defuse', tier: 1 } });
              setSave(next);
              say('backup', 'bombpl');
            }}
          >
            C4
          </button>
          <button
            type="button"
            data-testid="csgo-loadout"
            aria-expanded={drawer}
            onClick={() => setDrawer((value) => !value)}
          >
            {locale === 'zh' ? '装备' : 'Loadout'}
          </button>
          <CsgoToggles placement="banner" />
        </div>
        {radio ? (
          <div className="csgo-radio">
            {CSGO_LINES.map((row) => (
              <button key={row.id} type="button" onClick={() => say(row.id, 'accept')}>
                {row.en} / {row.zh}
              </button>
            ))}
            {CSGO_MEMES.map((meme) => (
              <button
                key={meme.id}
                type="button"
                data-testid={`csgo-meme-${meme.id}`}
                onClick={() => {
                  const note = chartMemeNote(meme.id);
                  const text = locale === 'zh' ? meme.zh : meme.en;
                  const other = locale === 'zh' ? meme.en : meme.zh;
                  setLine(note ? `${text} ${other} ${note}` : `${text} ${other}`);
                  setPayoff(meme.id);
                  if (meme.id === 'ez') playClip('ez');
                  if (meme.id === 'redraw') {
                    const root = document.documentElement;
                    if (root.dataset.csgoRedraw) delete root.dataset.csgoRedraw;
                    else root.dataset.csgoRedraw = '1';
                  }
                }}
              >
                {meme.label}
              </button>
            ))}
          </div>
        ) : null}
        {payoff ? (
          <p className="csgo-payoff" data-testid="csgo-payoff" data-meme={payoff}>
            {line}
          </p>
        ) : null}
        {home ? (
          <a
            className="csgo-egg-clue"
            data-testid="csgo-egg-clue"
            href="/infx/inference?g_model=DeepSeek-R1-0528"
            onClick={() => {
              try {
                sessionStorage.setItem('csgo-egg', 'clue');
              } catch {
                /* private mode */
              }
            }}
          >
            {locale === 'zh'
              ? '炸弹在图表上。去拆。 The bomb is on the chart. Defuse it there.'
              : 'The bomb is on the chart. Defuse it there. 炸弹在图表上。去拆。'}
          </a>
        ) : null}
        {home ? (
          <ul className="csgo-line-index" data-testid="csgo-line-index">
            {CSGO_LINES.filter((row) => row.id !== 'coldzera').map((row) => (
              <li
                key={row.id}
                data-found={found.includes(row.id) ? 'true' : 'false'}
                data-line={row.id}
              >
                {row.en} / {row.zh}
              </li>
            ))}
          </ul>
        ) : null}
        {defuse ? (
          <div className="csgo-defuse" data-testid="csgo-defuse">
            <img src="/decorative/csgo/loc-overpass.webp" alt="" width={180} height={100} />
            <p>
              {locale === 'zh'
                ? `奥拉夫。火里拆包。死亡游乐园。${clockLabel(clock)}`
                : `Olofmeister. Defuse in the flames. Overpass. ${clockLabel(clock)}`}
            </p>
            <p lang="zh">
              {locale === 'zh'
                ? `Olofmeister. Defuse in the flames. Overpass. ${clockLabel(clock)}`
                : `奥拉夫。火里拆包。死亡游乐园。${clockLabel(clock)}`}
            </p>
          </div>
        ) : null}
        {eggNext ? (
          <a
            className="csgo-egg-next"
            data-testid="csgo-egg-next"
            href="/this-route-does-not-exist"
          >
            {locale === 'zh' ? '这一回合在缺失页结束。' : 'The round ends on a missing page.'}
          </a>
        ) : null}
        {lost && eggDone ? (
          <p className="csgo-egg-payoff" data-testid="csgo-egg-payoff">
            {locale === 'zh'
              ? '区域安全。波士顿是翻盘。这一页不是。 Sector clear.'
              : 'Sector clear. Boston was the comeback. This page is not. 区域安全。'}
          </p>
        ) : null}
        {toast ? <p className="csgo-splash">{toast}</p> : null}
      </div>
      {open ? (
        <CsgoGameDialog
          locale={locale}
          onClose={() => {
            setOpen(false);
            window.setTimeout(() => {
              document.querySelector<HTMLButtonElement>('[data-testid="csgo-play"]')?.focus();
            }, 0);
          }}
        />
      ) : null}
    </div>
  );
}
