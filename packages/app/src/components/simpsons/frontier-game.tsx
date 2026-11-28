'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { useLocale } from '@/lib/i18n/use-locale';
import { ART } from './strings';
import { STRINGS as TEXT } from './frontier-copy';
import { STRINGS as GUIDE } from './frontier-levels';
import {
  advanceStage,
  districtPassed,
  batches,
  input,
  limit,
  metrics,
  newRun,
  tick,
  upgrade,
  type Action,
  type Mode,
} from './frontier-model';
import { drawRink, loadDeckArt, releaseRink } from './frontier-render';
import { readPass, writePass, kinds } from './frontier-save';
import { rinkRadio } from './frontier-radio';
import { courseSeed } from './frontier-course';
import SimpsonsToggles from './simpsons-toggles';
import './frontier-game.css';

export default function FrontierGame({ onClose }: { onClose: () => void }) {
  const locale = useLocale(),
    t = TEXT[locale],
    book = GUIDE[locale];
  const canvas = useRef<HTMLCanvasElement>(null),
    closeFocus = useRef<HTMLElement | null>(null);
  const [surface, setSurface] = useState<HTMLCanvasElement | null>(null);
  const attach = useCallback((el: HTMLCanvasElement | null) => {
    canvas.current = el;
    setSurface(el);
  }, []);
  const course = useRef<number[] | null>(null);
  const [firstRun] = useState(() => newRun('shift', 0));
  const [initial] = useState(readPass),
    pass = useRef(initial),
    s = useRef(firstRun);
  const [, bump] = useState(0),
    refresh = useCallback(() => bump((v) => v + 1), []);
  const [steps, setSteps] = useState(initial.steps),
    [reduce, setReduce] = useState(false);
  const [help, setHelp] = useState(false);
  const [leave, setLeave] = useState(false);
  const low = useRef(false),
    resumeAt = useRef(0),
    exchangeInput = useRef<HTMLInputElement>(null);
  const [exchange, setExchange] = useState(''),
    [receipt, setReceipt] = useState('');
  const art = useRef<ReturnType<typeof loadDeckArt> | null>(null),
    audio = useRef<ReturnType<typeof rinkRadio> | null>(null);
  const [mode, setMode] = useState<Mode>('shift'),
    [startAt, setStartAt] = useState(0);
  const stepped = reduce || steps,
    run = s.current,
    p = pass.current,
    lvl = book.levels[run.stage % 5],
    m = metrics(run);
  const speak = useCallback((name: string) => audio.current?.clip(name), []);
  const draw = useCallback(() => {
    const r = s.current;
    if (r.status === 'ready') return;
    audio.current?.drive((r.gear * 14 + r.momentum + (r.boost > 0 ? 30 : 0) + 30) / 100, r.heat);
    if (canvas.current && art.current)
      drawRink(canvas.current, s.current, art.current, t, stepped, low.current);
  }, [stepped, t]);
  const finish = useCallback(() => {
    const r = s.current,
      v = pass.current;
    const grade = r.grades.at(-1) ?? 0,
      place = grade >= 8.1 ? 3 : grade >= 6.4 ? 2 : 1;
    const passed = districtPassed(r);
    if (r.mode === 'shift' && passed) {
      v.open = Math.min(5, Math.max(v.open, r.stage + 2));
      v.medals[r.stage] = Math.max(place, v.medals[r.stage]);
    }
    if (r.mode !== 'lab' && r.controlled && r.tricks + r.donuts > 0) {
      v.wallet = r.tickets;
      v.tunes = [...r.tune];
    } else if (r.mode !== 'lab') r.tickets = v.wallet;
    if (r.controlled) v.best[r.mode] = Math.max(v.best[r.mode], r.score);
    writePass(v);
    if (
      r.controlled &&
      (r.mode === 'shift' || (r.mode === 'endless' && r.status === 'card' && passed))
    )
      window.dispatchEvent(
        new CustomEvent('simpsons-arcade-point', { detail: passed && grade >= 6 ? 0 : 1 }),
      );
    audio.current?.stop(false);
    refresh();
  }, [refresh]);
  const reset = useCallback(
    (kind: Mode, stage: number) => {
      audio.current?.stop();
      const v = pass.current,
        r = newRun(
          kind,
          stage,
          kind === 'endless' ? Math.floor(Math.random() * 65536) : 601 + stage * 103,
        );
      if (kind === 'lab')
        r.items.forEach((it, i) => {
          it.kind = kinds[v.builds[v.slot].gates[i]];
        });
      r.precision = v.precision;
      r.samples = course.current;
      r.profile = kind === 'lab' ? v.builds[v.slot].profile : 0;
      r.tickets = kind === 'lab' ? 6 : v.wallet;
      r.tune = [...v.tunes];
      s.current = r;
      draw();
      refresh();
    },
    [draw, refresh],
  );
  const act = useCallback(
    (a: Action) => {
      const r = s.current;
      if (r.status !== 'live' || document.hidden) return;
      input(r, a, speak);
      if (stepped) {
        for (let i = 0; i < 14; i++) tick(r, 1 / 42, speak);
        if (s.current.status !== 'live') finish();
      }
      draw();
      refresh();
    },
    [draw, speak, finish, refresh, stepped],
  );
  const play = () => {
    const r = s.current;
    resumeAt.current = performance.now();
    if (!art.current) art.current = loadDeckArt();
    if (!course.current) course.current = courseSeed();
    r.samples = course.current;
    if (r.status === 'card') advanceStage(r);
    else r.status = 'live';
    audio.current?.start();
    setHelp(false);
    setLeave(false);
    refresh();
    canvas.current?.focus();
  };
  const pause = useCallback(() => {
    const r = s.current;
    if (r.status === 'live') {
      r.status = 'pause';
      audio.current?.stop();
      refresh();
    }
  }, [refresh]);
  useEffect(() => {
    const playingCanvas = canvas.current;
    closeFocus.current = document.querySelector<HTMLElement>('.simpsons-arcade-open');
    audio.current = rinkRadio();
    s.current.tickets = pass.current.wallet;
    s.current.tune = [...pass.current.tunes];
    s.current.precision = pass.current.precision;
    const motion = matchMedia('(prefers-reduced-motion: reduce)');
    const mq = () => {
      setReduce(motion.matches);
      if (motion.matches) pause();
    };
    mq();
    const hidden = () => {
      if (document.hidden) pause();
    };
    window.dispatchEvent(new CustomEvent('simpsons-rink-open', { detail: true }));
    motion.addEventListener('change', mq);
    document.addEventListener('visibilitychange', hidden);
    return () => {
      if (playingCanvas && document.pointerLockElement === playingCanvas)
        document.exitPointerLock();
      motion.removeEventListener('change', mq);
      document.removeEventListener('visibilitychange', hidden);
      audio.current?.dispose();
      if (playingCanvas) releaseRink(playingCanvas);
      art.current = null;
      window.dispatchEvent(new CustomEvent('simpsons-rink-open', { detail: false }));
    };
  }, [pause]);
  const state = run.status;
  useEffect(() => {
    const c = canvas.current,
      images = Object.values(art.current ?? {});
    if (!c || state === 'ready') return;
    let frame = 0;
    const queue = () => {
      if (!frame)
        frame = requestAnimationFrame(() => {
          frame = 0;
          draw();
        });
    };
    images.forEach((i) => i.addEventListener('load', queue));
    const ro = new ResizeObserver(queue);
    ro.observe(c);
    draw();
    return () => {
      images.forEach((i) => i.removeEventListener('load', queue));
      cancelAnimationFrame(frame);
      ro.disconnect();
    };
  }, [draw, surface, state]);
  useEffect(() => {
    if (state !== 'live' || stepped) return;
    let frame = 0,
      last = resumeAt.current || performance.now(),
      ui = 0,
      accumulator = 0,
      slowFrames = 0;
    const render = (now: number) => {
      if (s.current.status !== 'live' || document.hidden) return;
      const dt = Math.max(0, (now - last) / 1000);
      last = now;
      slowFrames = dt > 0.055 ? slowFrames + 1 : Math.max(0, slowFrames - 1);
      if (slowFrames >= 3) low.current = true;
      accumulator = Math.min(3, accumulator + dt);
      let ticks = 0;
      while (accumulator >= 1 / 60 && s.current.status === 'live' && ticks++ < 32) {
        tick(s.current, 1 / 60, speak);
        accumulator -= 1 / 60;
      }
      draw();
      if (s.current.status !== 'live') {
        finish();
        return;
      }
      if (now - ui > 100) {
        ui = now;
        refresh();
      }
      frame = requestAnimationFrame(render);
    };
    frame = requestAnimationFrame(render);
    return () => cancelAnimationFrame(frame);
  }, [state, stepped, speak, draw, finish, refresh]);
  function switchMode(kind: Mode, stage = 0) {
    setMode(kind);
    setStartAt(stage);
    reset(kind, stage);
  }
  function setGear(a: Action) {
    if (state === 'ready' && typeof a === 'number') {
      s.current.gear = a;
      refresh();
    } else act(a);
  }
  const live = state === 'live',
    result = state === 'over' || state === 'card',
    setup = state === 'ready';
  const heading = result
    ? state === 'card'
      ? book.card
      : mode === 'lab'
        ? book.practiced
        : mode === 'endless'
          ? t.over
          : !districtPassed(run) && (run.stage % 5 !== 4 || run.boss.armor === 0)
            ? locale === 'zh'
              ? '本区尚未达标：请重试'
              : 'District not qualified: retry'
            : run.stage % 5 === 4 && run.boss.armor > 0
              ? book.retryCore
              : t.cleared
    : lvl[1];
  const actionLabel =
    state === 'card' ? t.next : state === 'pause' ? t.resume : state === 'over' ? t.again : t.deck;
  return (
    <Dialog
      open
      onOpenChange={(v) => {
        if (!v) {
          if (s.current.status === 'live' || s.current.status === 'pause') {
            pause();
            setLeave(true);
          } else onClose();
        }
      }}
    >
      <DialogContent
        className="simpsons-rink"
        overlayClassName="sp-rink-backdrop"
        onEscapeKeyDown={(e) => {
          if (leave) {
            e.preventDefault();
            play();
          }
        }}
        onCloseAutoFocus={(e) => {
          e.preventDefault();
          const opener = closeFocus.current;
          const dest =
            opener?.isConnected && opener.getClientRects().length > 0
              ? opener
              : document.querySelector<HTMLElement>('main a[href],header a[href="/"],main button');
          dest?.focus({ preventScroll: true });
        }}
        onKeyDown={(e) => {
          if (e.altKey || e.ctrlKey || e.metaKey || e.key === 'Escape') return;
          if (leave) return;
          const k = e.key.toLowerCase();
          if (k === 'p' && (live || state === 'pause')) {
            e.preventDefault();
            if (live) pause();
            else play();
            return;
          }
          if (
            !live ||
            e.repeat ||
            ((k === ' ' || k === 'enter') &&
              e.target instanceof HTMLElement &&
              e.target.closest('button,select,input'))
          )
            return;
          const keys: Record<string, Action> = {
            ' ': 'ollie',
            arrowup: 'ollie',
            w: 'ollie',
            x: 'horn',
            s: 'horn',
            arrowleft: 'less',
            a: 'less',
            arrowright: 'more',
            d: 'more',
            n: 'step',
            '1': 0,
            '2': 1,
            '3': 2,
            '4': 3,
          };
          if (k in keys) {
            e.preventDefault();
            act(keys[k]);
          }
        }}
      >
        <header className="sp-rink-title">
          <div>
            <span className="sp-rink-label">{t.station}</span>
            <DialogTitle>{t.title}</DialogTitle>
            <DialogDescription>{t.sub}</DialogDescription>
          </div>
          <img alt="" src={`${ART}bart-ollie.webp`} />
        </header>
        <div className="sp-rink-inner">
          {setup && (
            <div className="sp-modes" aria-label={book.chapter}>
              {(['shift', 'endless', 'lab'] as const).map((v, i) => (
                <button
                  key={v}
                  type="button"
                  aria-pressed={mode === v}
                  onClick={() => switchMode(v)}
                >
                  <small>0{i + 1}</small>
                  {[t.guide, t.jam, book.lab][i]}
                </button>
              ))}
            </div>
          )}
          <div className="sp-track-head">
            <span>{lvl[0]}</span>
            <b>{heading}</b>
            <span>
              {mode === 'shift'
                ? `${run.stage + 1} / 5`
                : mode === 'endless'
                  ? `∞ / ${run.stage + 1}`
                  : book.lab}
            </span>
          </div>
          <div className="sp-route-map" aria-label={book.map}>
            {book.places.map((name, i) => (
              <button
                type="button"
                key={name}
                data-current={run.stage % 5 === i}
                data-visited={p.medals[i] > 0}
                aria-label={`${book.map}: ${name}`}
                disabled={!setup || mode === 'endless' || (mode === 'shift' && i >= p.open)}
                onClick={() => switchMode(mode, i)}
              >
                <i />
                {name}
              </button>
            ))}
          </div>
          <div className="sp-rink-screen">
            {setup && (
              <img
                className="sp-rink-poster"
                src={`${ART}${['terrace', 'studio', 'gorge', 'market', 'plant-shift'][run.stage % 5]}.webp`}
                alt=""
              />
            )}
            <canvas
              hidden={setup}
              ref={attach}
              tabIndex={0}
              aria-label={t.track}
              onClick={() => act('ollie')}
            />
            <div className="sp-track-bug">
              {t.tv} <i /> {Math.round(Math.min(100, (run.x / limit) * 100))}%
            </div>
            {state === 'pause' && (
              <div className="sp-judge">
                <b>{t.paused}</b>
              </div>
            )}
            {result && (
              <div className="sp-judge">
                <img src={`${ART}lisa.webp`} alt="" />
                <div>
                  <small>{t.rate}</small>
                  <b>{(run.grades.at(-1) ?? 0).toFixed(1)} / 10</b>
                  <span>
                    {t.score} {run.score}
                  </span>
                </div>
              </div>
            )}
          </div>
          {run.stage % 5 === 4 && (
            <div className="sp-reactor">
              <b>{book.crane}</b>
              <span>
                {run.boss.phase === 'track' || run.boss.phase === 'drop'
                  ? book.circuits[run.boss.armor - 1]
                  : run.boss.phase === 'vent' && !run.boss.clean
                    ? locale === 'zh'
                      ? '护盾未开：躲过下一击'
                      : 'Shield held: dodge the next pass'
                    : book.phases[run.boss.phase]}
              </span>
              <strong>{run.boss.armor}/3</strong>
            </div>
          )}
          <div className="sp-simulation-tag">{t.measure}</div>
          <div className="sp-hud" aria-label={t.measure}>
            {[
              [t.through, m.throughput, book.unit],
              [t.inter, m.inter, book.perUnit],
              [run.stage % 5 === 4 ? 'P99' : 'TTFT', run.stage % 5 === 4 ? m.p99 : m.ttft, book.ms],
              [book.kv, run.cache, '/ 4'],
            ].map(([label, val, u]) => (
              <div key={label}>
                <small>{label}</small>
                <b>{val}</b>
                <span>{u}</span>
              </div>
            ))}
          </div>
          {setup && mode !== 'endless' && (
            <div className="sp-chapter">
              <label>
                {book.choose}{' '}
                <select value={startAt} onChange={(e) => switchMode(mode, Number(e.target.value))}>
                  {book.levels.map((ch, i) => (
                    <option key={ch[0]} value={i} disabled={mode === 'shift' && i >= p.open}>
                      {ch[0]}
                      {p.medals[i] ? ` • ${t.medals[p.medals[i] - 1]}` : ''}
                    </option>
                  ))}
                </select>
              </label>
              <span>{mode === 'lab' ? book.labReady : book.stash}</span>
            </div>
          )}
          {setup && mode === 'lab' && (
            <div className="sp-lab-tray">
              <small>{book.labtools}</small>
              <div className="sp-blueprints">
                <label>
                  {book.slot}{' '}
                  <select
                    value={p.slot}
                    onChange={(e) => {
                      p.slot = Number(e.target.value);
                      writePass(p);
                      reset(mode, startAt);
                    }}
                  >
                    {[0, 1, 2].map((i) => (
                      <option key={i} value={i}>
                        {String(i + 1).padStart(2, '0')}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  {book.curve}{' '}
                  <select
                    value={p.builds[p.slot].profile}
                    onChange={(e) => {
                      p.builds[p.slot].profile = Number(e.target.value);
                      writePass(p);
                      reset(mode, startAt);
                    }}
                  >
                    {book.profiles.map((v, i) => (
                      <option key={v} value={i}>
                        {v}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              {p.builds[p.slot].gates.map((g, i) => (
                <button
                  type="button"
                  key={i}
                  aria-label={`${book.cycle} ${i + 1}: ${book.tools[g]}`}
                  onClick={() => {
                    p.builds[p.slot].gates[i] = (g + 1) % 4;
                    writePass(p);
                    s.current.items[i].kind = kinds[p.builds[p.slot].gates[i]];
                    draw();
                    refresh();
                  }}
                >
                  {i + 1} {book.tools[g]}
                </button>
              ))}
              <div className="sp-pass-exchange">
                <label>
                  {locale === 'zh' ? '线路交换码' : 'Course exchange code'}
                  <input
                    ref={exchangeInput}
                    value={exchange}
                    maxLength={16}
                    spellCheck={false}
                    onChange={(e) => {
                      setExchange(e.target.value);
                      setReceipt('');
                    }}
                  />
                </label>
                <button
                  type="button"
                  className="sp-code-out"
                  onClick={async () => {
                    const spec = p.builds[p.slot];
                    const code = `7G-${spec.profile}-${spec.gates.join('')}`;
                    setExchange(code);
                    try {
                      await navigator.clipboard.writeText(code);
                      setReceipt(locale === 'zh' ? '线路代码已复制。' : 'Course code copied.');
                    } catch {
                      setReceipt(
                        locale === 'zh'
                          ? '请选择文本框中的代码并复制。'
                          : 'Select and copy the code in the text box.',
                      );
                      requestAnimationFrame(() => {
                        exchangeInput.current?.focus();
                        exchangeInput.current?.select();
                      });
                    }
                  }}
                >
                  {locale === 'zh' ? '导出' : 'Export'}
                </button>
                <button
                  type="button"
                  className="sp-code-in"
                  onClick={() => {
                    const parsed = /^7G-(?<profile>[012])-(?<gates>[0-3]{8})$/i.exec(
                      exchange.trim(),
                    );
                    if (!parsed) {
                      setReceipt(locale === 'zh' ? '交换码无效。' : 'Invalid course code.');
                      return;
                    }
                    p.builds[p.slot] = {
                      profile: Number(parsed[1]),
                      gates: [...parsed[2]].map(Number),
                    };
                    writePass(p);
                    reset(mode, startAt);
                    setReceipt(
                      locale === 'zh'
                        ? '线路已还原，可以开滑。'
                        : 'Course restored. Ready to skate.',
                    );
                  }}
                >
                  {locale === 'zh' ? '导入' : 'Import'}
                </button>
                <output aria-live="polite">{receipt}</output>
              </div>
            </div>
          )}
          <div className="sp-delivery" data-state={run.delivery}>
            <img src={`${ART}first-route.webp`} alt="" />
            <div>
              <small>
                {locale === 'zh' ? '春田镇快递 · 可选任务' : 'Springfield courier · Side mission'}
              </small>
              <b>
                {
                  (locale === 'zh'
                    ? {
                        pickup: '跃起拿嗡嗡可乐，7 秒内送到检查点。',
                        carrying: `检查点交货 · ${Math.ceil(run.timeLeft)} 秒`,
                        paid: `已送达 · +${run.alley ? 2 : 3} 奖券`,
                        late: '错过送货时间，继续滑。',
                        busted: '警车追上了！可乐已没收，继续滑。',
                      }
                    : {
                        pickup: 'Ollie for Buzz Cola. Deliver at a clear checkpoint within 7s.',
                        carrying: `Clear a checkpoint · ${Math.ceil(run.timeLeft)}s left`,
                        paid: `Delivered · +${run.alley ? 2 : 3} tickets`,
                        late: 'Delivery timed out. Keep skating.',
                        busted: 'Busted! Cola impounded. Keep skating.',
                      }
                  )[run.delivery]
                }
              </b>
              {run.delivery === 'carrying' && (
                <div className="sp-pursuit">
                  <span>
                    {locale === 'zh' ? '警戒' : 'Patrol alert'} {Math.round(run.alert)}% ·{' '}
                    {locale === 'zh'
                      ? run.alley
                        ? '小巷'
                        : '大街'
                      : run.alley
                        ? 'Back alley'
                        : 'Main street'}
                  </span>
                  <meter
                    min="0"
                    max="100"
                    value={run.alert}
                    aria-label={locale === 'zh' ? '警戒' : 'Patrol alert'}
                  />
                  <small>
                    {locale === 'zh'
                      ? '高批次和碰撞会引来警车；警戒达到 100% 即被追上。'
                      : 'High batch and collisions draw the cruiser. At 100% you lose the can.'}
                  </small>
                  <button
                    disabled={run.alley || run.status !== 'live'}
                    type="button"
                    className="sp-alley"
                    onClick={() => act('alley')}
                  >
                    {locale === 'zh'
                      ? '抄小巷：降低警戒，少一张券'
                      : 'Take the alley: lose heat, forfeit one ticket'}
                  </button>
                </div>
              )}
            </div>
          </div>
          <div className="sp-race-line">
            <b data-met={m.met}>
              {book.pace}: {lvl[3]}
            </b>
            <span>
              {book.misses} {run.hits}
              {mode === 'endless' ? '/3' : ''}
            </span>
            <span>
              {book.bank} {run.tickets}
            </span>
            <span>
              {book.memory} {m.memory}/{m.capacity}
            </span>
          </div>
          {leave ? (
            <div
              className="sp-game-actions sp-exit-check"
              role="group"
              aria-label={locale === 'zh' ? '退出本局？' : 'Leave this run?'}
            >
              <strong>
                {locale === 'zh'
                  ? '退出并放弃本局未结算的奖券？'
                  : 'Leave and discard unbanked tickets?'}
              </strong>
              <button
                type="button"
                className="sp-drop"
                ref={(el) => el?.focus({ preventScroll: true })}
                onClick={play}
              >
                {locale === 'zh' ? '继续滑行' : 'Keep skating'}
              </button>
              <button type="button" onClick={onClose}>
                {locale === 'zh' ? '放弃并退出' : 'Discard and leave'}
              </button>
            </div>
          ) : live ? (
            <div className="sp-game-actions">
              <button type="button" className="sp-drop" onClick={() => act('ollie')}>
                {t.ollie}
                <span className="sp-key-how"> ↑</span>
              </button>
              <button type="button" onClick={() => act('horn')} disabled={run.cooldown > 0}>
                {t.horn}
                {run.cooldown > 0 ? (
                  ` ${Math.ceil(run.cooldown)}`
                ) : (
                  <span className="sp-key-how"> X</span>
                )}
              </button>
              {stepped && (
                <button type="button" onClick={() => act('step')}>
                  {t.step}
                </button>
              )}
              <button type="button" onClick={pause}>
                {t.pause}
              </button>
            </div>
          ) : (
            <div className="sp-game-actions">
              <button
                className="sp-drop"
                type="button"
                onClick={() => {
                  if (state === 'over') {
                    const next = mode === 'shift' && !districtPassed(run) ? run.stage : startAt;
                    setStartAt(next);
                    reset(mode, next);
                  } else play();
                }}
              >
                {actionLabel} ▸
              </button>
              {!setup && (
                <button type="button" onClick={() => switchMode(mode, startAt)}>
                  {book.back}
                </button>
              )}
              <button type="button" onClick={() => setHelp(!help)} aria-expanded={help}>
                {book.help}
              </button>
              <label>
                <input
                  type="checkbox"
                  disabled={reduce}
                  checked={stepped}
                  onChange={(e) => {
                    setSteps(e.target.checked);
                    p.steps = e.target.checked;
                    writePass(p);
                  }}
                />
                {book.steps}
              </label>
            </div>
          )}
          <div className="sp-gears">
            <span>{t.batch}</span>
            {batches.map((b, i) => (
              <button
                type="button"
                key={b}
                disabled={!live && !setup}
                aria-pressed={run.gear === i}
                onClick={() => setGear(i as 0 | 1 | 2 | 3)}
              >
                {b}×
              </button>
            ))}
            <span className="sp-gag-status" role="status">
              {t.feedback[run.message]}
            </span>
          </div>
          {(setup || state === 'card' || state === 'pause') && (
            <details className="sp-pit">
              <summary>
                {book.workshop} · {book.ticketCost}
              </summary>
              <label className="sp-wheel-picker">
                {book.deck}{' '}
                <select
                  value={run.precision}
                  onChange={(e) => {
                    run.precision = Number(e.target.value) as 0 | 1 | 2;
                    p.precision = run.precision;
                    writePass(p);
                    refresh();
                  }}
                >
                  {['FP4', 'FP8', 'BF16'].map((v, i) => (
                    <option key={v} value={i}>
                      {v}
                    </option>
                  ))}
                </select>
              </label>
              <p>{book.fit}</p>
              <div className="sp-pit-sound">
                <SimpsonsToggles />
              </div>
              <p>{book.pit}</p>
              <p className="sp-tune-receipt">
                {locale === 'zh' ? '当前改装' : 'Fitted this run'}:{' '}
                {book.tunes.map((n, i) => `${n} ${run.tune[i]}/3`).join(' · ')} · {book.memory}{' '}
                {m.capacity} GB · TTFT {m.ttft} {book.ms}
              </p>
              {book.tunes.map((n, i) => (
                <button
                  type="button"
                  key={n}
                  disabled={run.tickets < 2 || run.tune[i] >= 3}
                  onClick={() => {
                    upgrade(run, i as 0 | 1 | 2);
                    if (mode !== 'lab') {
                      p.wallet = run.tickets;
                      p.tunes = [...run.tune];
                      writePass(p);
                    }
                    refresh();
                  }}
                >
                  {n} {run.tune[i]}/3
                </button>
              ))}
            </details>
          )}
          <div className="sp-rink-foot">
            <span>{t.source}</span>
            <strong>
              {t.best} {p.best[mode]} · {book.reward} {p.medals.filter(Boolean).length}/5
            </strong>
          </div>
          {(help || setup) && (
            <p className="sp-how">
              {setup ? lvl[2] : t.help} {help && setup ? t.help : ''}{' '}
              {stepped ? (
                t.stepped
              ) : (
                <>
                  <span className="sp-key-how">{t.keys}</span>
                  <span className="sp-touch-how">
                    {locale === 'zh'
                      ? '轻点赛道或“跳跃”按钮起跳；轻点萨克斯加速；用批次按钮换挡。'
                      : 'Tap the rink or Ollie to jump. Tap Sax for a burst; tap a batch to shift.'}
                  </span>
                </>
              )}
            </p>
          )}
          {(setup || result) && mode === 'shift' && (
            <p className="sp-how">
              {locale === 'zh'
                ? '晋级条件：完成一次操作过关或接住甜甜圈，达标时间满 20%，且评分至少 5.5。7G 还需熔断三根保险丝。'
                : 'To qualify: land a controlled gate or catch a donut, hold the district target for 20% of the run, and grade at least 5.5. Sector 7G also needs all three fuses.'}
            </p>
          )}
          {live && <span className="sr-only">{t.keys}</span>}
        </div>
      </DialogContent>
    </Dialog>
  );
}
