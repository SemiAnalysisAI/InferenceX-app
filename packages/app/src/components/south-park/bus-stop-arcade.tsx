'use client';
import { useEffect, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { useLocale } from '@/lib/i18n/use-locale';
import { ARCADE } from './arcade-copy';
import { COUNTY_LINES, recordLine } from './county-lines';
import {
  BATCHES,
  begin,
  buy,
  cycleAim,
  depart,
  fitRig,
  fire,
  leadBus,
  dispatchBlock,
  bellCost,
  ringIn,
  purge,
  rehearseProfiler,
  detour,
  dispatch,
  draw,
  loadArt,
  medal,
  quota,
  step,
  type Run,
} from './defense-engine';
import { readBook, saveBook, SHOP, type Mode, type RecordBook } from './defense-routes';
import { paperSynth } from './paper-synth';
import { CaseProp } from './case-prop';
import { DepotBuilder, RouteAtlas } from './route-atlas';
import { STRINGS } from './strings';
import './arcade.css';
import SouthParkToggles from './south-park-toggles';

const MODES: Mode[] = ['episode', 'endless', 'lab'];
function ready(): Run {
  const r = begin('episode');
  r.phase = 'ready';
  return r;
}
export default function BusStopArcade({
  onClose,
  onKeep,
  fromKeep,
}: {
  onClose: () => void;
  onKeep: () => void;
  fromKeep: boolean;
}) {
  const locale = useLocale(),
    t = ARCADE[locale],
    site = STRINGS[locale];
  const canvas = useRef<HTMLCanvasElement>(null),
    desk = useRef<HTMLDivElement>(null);
  const run = useRef<Run>(ready()),
    engine = useRef<ReturnType<typeof paperSynth> | null>(null);
  const [book, setBook] = useState<RecordBook>(readBook),
    bookRef = useRef(book);
  const [mode, setMode] = useState<Mode>('episode'),
    [startStop, setStartStop] = useState(1);
  const [view, refresh] = useState<Run>(() => ({ ...run.current })),
    done = useRef(false);
  const [info, setInfo] = useState(false);
  const [citation, setCitation] = useState<number | null>(null);
  useEffect(() => {
    if (citation === null) return;
    const expiry = window.setTimeout(() => setCitation(null), 4700);
    return () => window.clearTimeout(expiry);
  }, [citation]);
  const leavingForKeep = useRef(false);
  const art = useRef<ReturnType<typeof loadArt> | null>(null);
  function updateBook(next: RecordBook) {
    bookRef.current = next;
    saveBook(next);
    setBook(next);
    window.dispatchEvent(
      new CustomEvent('sp-depot-stamp', {
        detail: { medal: next.medal, stage: next.stage, best: Math.max(...next.best) },
      }),
    );
  }
  function repaint() {
    const r = run.current;
    refresh({ ...r, buses: [...r.buses], gear: { ...r.gear } });
    if (canvas.current && art.current)
      draw(canvas.current, art.current, r, matchMedia('(prefers-reduced-motion: reduce)').matches);
    const unlocked = Math.min(5, r.wave + (r.phase === 'shop' ? 1 : 0));
    if (
      ['running', 'shop'].includes(r.phase) &&
      r.mode === 'episode' &&
      unlocked > bookRef.current.stage
    )
      updateBook({
        ...bookRef.current,
        stage: unlocked,
        stamps: r.stamps.map((n, i) => Math.max(bookRef.current.stamps[i], n)),
      });
    if (r.mode === 'endless' && r.score > bookRef.current.best[1]) {
      const best = [...bookRef.current.best];
      best[1] = r.score;
      updateBook({ ...bookRef.current, best });
    }
    if (done.current || !['won', 'lost'].includes(r.phase)) return;
    done.current = true;
    if (r.rehearsal) {
      engine.current?.cue(r.phase === 'won' ? 'wave' : 'miss');
      return;
    }
    const old = bookRef.current,
      best = [...old.best],
      index = MODES.indexOf(r.mode);
    best[index] = Math.max(best[index], r.score);
    const win = r.phase === 'won',
      stamp = win && r.mode === 'episode' ? medal(r) : 0;
    updateBook({
      ...old,
      best,
      medal: Math.max(stamp, old.medal),
      wins: old.wins + (stamp ? 1 : 0),
      stamps:
        r.mode === 'episode' ? r.stamps.map((n, i) => Math.max(old.stamps[i], n)) : old.stamps,
    });
    engine.current?.cue(win ? 'wave' : 'miss');
    if (!win) window.dispatchEvent(new CustomEvent('sp-depot-incident', { detail: r.lostCase }));
    if (!win) engine.current?.duck();
  }
  const paint = useRef(repaint);
  paint.current = repaint;
  useEffect(() => {
    art.current = loadArt();
    const audio = paperSynth(true);
    engine.current = audio;
    const reduced = matchMedia('(prefers-reduced-motion: reduce)');
    let raf = 0,
      last = 0,
      drawAt = 0,
      hudAt = 0;
    function frame(now: number) {
      const r = run.current;
      const delta = Math.min(0.12, Math.max(0, (now - last) / 1000));
      if (!reduced.matches && r.impactHold > 0) r.impactHold = Math.max(0, r.impactHold - delta);
      else if (!document.hidden && r.phase === 'running')
        step(r, delta * (reduced.matches || bookRef.current.slow ? 0.67 : 1));
      if (
        !document.hidden &&
        now - drawAt > (reduced.matches ? 130 : 32) &&
        art.current &&
        canvas.current
      ) {
        draw(canvas.current, art.current, r, reduced.matches);
        drawAt = now;
      }
      if (now - hudAt > 200) {
        audio.drive(r.load, r.streak, r.wave);
        paint.current();
        hudAt = now;
      }
      last = now;
      raf = requestAnimationFrame(frame);
    }
    function hidden() {
      if (document.hidden && run.current.phase === 'running') {
        run.current.phase = 'paused';
        audio.pause();
        paint.current();
      }
    }
    const sync = () => audio.sync();
    window.addEventListener('south-park-sound-toggle', sync);
    document.addEventListener('visibilitychange', hidden);
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      audio.dispose();
      engine.current = null;
      art.current = null;
      window.removeEventListener('south-park-sound-toggle', sync);
      document.removeEventListener('visibilitychange', hidden);
    };
  }, []);
  function start(rehearsal = false) {
    done.current = false;
    setCitation(null);
    setInfo(false);
    run.current = begin(
      mode,
      mode === 'lab' ? book.labStop : mode === 'episode' ? startStop : 1,
      mode === 'lab' ? book.seed : Math.floor(Math.random() * 9999),
    );
    const r = run.current;
    if (rehearsal) rehearseProfiler(r);
    if (mode === 'lab') r.stations = [...book.layouts[book.slot]];
    else {
      if (book.kit === 1 && book.stage >= 2) r.gear.plow = 1;
      if (book.kit === 2 && book.stage >= 3) r.gear.cache = 1;
    }
    try {
      if (mode !== 'lab' && localStorage.getItem('south-park-keep-stamp') === '1') r.tickets += 2;
      const deaths = Number(localStorage.getItem('south-park-kenny-deaths'));
      if (deaths > 0 && deaths % 4 === 0) r.overdrive = 12;
    } catch {}
    engine.current?.activate();
    engine.current?.cue('wave');
    repaint();
    desk.current?.focus();
  }
  function serve(lane: number) {
    const r = run.current;
    if (dispatch(r, lane)) {
      engine.current?.cue(r.notice === 'stage' || r.notice === 'hero' ? 'wave' : 'dispatch');
      if (lane === 2 && r.served % 3 === 1) {
        engine.current?.duck();
        window.dispatchEvent(new CustomEvent('sp-depot-voice', { detail: 'authority' }));
      }
    } else if (r.notice === 'gate' && recordLine('foul')) setCitation(Math.round(r.load));
    repaint();
  }
  function pause() {
    const r = run.current;
    if (r.phase === 'paused') {
      r.phase = 'running';
      engine.current?.activate();
    } else if (r.phase === 'running') {
      r.phase = 'paused';
      engine.current?.pause();
      // A lane becomes disabled on pause. Keep P/Escape in the dialog even if it had focus.
      if (!document.activeElement?.closest('.sp-game-footer'))
        desk.current?.focus({ preventScroll: true });
    }
    repaint();
  }
  function batch(n: number) {
    run.current.batch = Math.min(3, Math.max(0, n));
    engine.current?.cue('snip');
    repaint();
  }
  function throwBall(x?: number, y?: number) {
    if (fire(run.current, x, y)) engine.current?.cue('crunch');
    repaint();
  }
  const live = view.phase === 'running',
    active = live || view.phase === 'paused',
    playing = view.phase !== 'ready',
    ended = view.phase === 'won' || view.phase === 'lost';
  const chapter = (view.wave - 1) % 5,
    mi = MODES.indexOf(mode);
  function travel(n: number) {
    if (mode === 'lab') updateBook({ ...book, labStop: n });
    else setStartStop(n);
    run.current.wave = n;
    repaint();
  }
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent
        className="sp-arcade"
        onOpenAutoFocus={(e) => {
          if (fromKeep) {
            e.preventDefault();
            document.querySelector<HTMLButtonElement>('[data-sp-keep]')?.focus();
          }
        }}
        onCloseAutoFocus={(e) => {
          e.preventDefault();
          if (!leavingForKeep.current)
            document.querySelector<HTMLButtonElement>('[data-sp-arcade]')?.focus();
        }}
      >
        <div
          className="sp-desk"
          tabIndex={-1}
          ref={desk}
          onKeyDown={(e) => {
            if (
              !active ||
              e.ctrlKey ||
              e.metaKey ||
              e.altKey ||
              (e.target as Element).closest('input,select,textarea')
            )
              return;
            if (e.key === ' ' && (e.target as Element).closest('button')) return;
            const k = e.key.toLowerCase(),
              r = run.current;
            if (k === 'p') {
              e.preventDefault();
              pause();
              return;
            }
            if (!live) return;
            if (['i', 'j', 'k', 'l'].includes(k)) {
              r.locked = -1;
              r.aimX = Math.max(
                0.03,
                Math.min(0.96, r.aimX + (k === 'l' ? 0.018 : k === 'j' ? -0.018 : 0)),
              );
              r.aimY = Math.max(
                0.13,
                Math.min(0.98, r.aimY + (k === 'k' ? 0.027 : k === 'i' ? -0.027 : 0)),
              );
              e.preventDefault();
              repaint();
              return;
            }
            if (e.repeat) return;
            if (/^[1-4]$/.test(k)) serve(Number(k) - 1);
            else if (k === 'arrowup' || k === 'w') r.lane = (r.lane + 3) % 4;
            else if (k === 'arrowdown' || k === 's') r.lane = (r.lane + 1) % 4;
            else if (k === 'arrowleft' || k === 'a') batch(r.batch - 1);
            else if (k === 'arrowright' || k === 'd') batch(r.batch + 1);
            else if (k === ' ') serve(r.lane);
            else if (k === 'r') detour(r);
            else if (k === 'q') cycleAim(r);
            else if (k === 'f') throwBall();
            else if (k === 'n') ringIn(r);
            else return;
            e.preventDefault();
            repaint();
          }}
        >
          <header className="sp-depot-head">
            <div className="sp-office-code">SP / 285</div>
            <div>
              <small>{t.dept}</small>
              <DialogTitle>{t.title}</DialogTitle>
            </div>
            <span>{t.sub}</span>
            <SouthParkToggles room />
          </header>
          <DialogDescription className="sr-only">{t.helpText}</DialogDescription>
          {playing && (
            <div className="sp-live-board">
              <div className="sp-dispatch-meta">
                <span>{t.modes[mi]}</span>
                <div className="sp-route-hud">
                  <RouteAtlas t={t} current={chapter + 1} limit={5} book={book} />
                </div>
                <b>
                  {t.stop} {view.wave} / {t.stops[chapter]}
                </b>
                <span>
                  {t.tickets} {view.tickets}
                </span>
              </div>
              {view.buses.some((b) => b.boss) && (
                <div className="sp-profiler-panel" data-shields={view.shield} role="status">
                  <img src="/decorative/south-park/art/visitors.webp" alt="" />
                  <div>
                    <b>
                      {t.profiler} · {3 - view.shield}/3
                    </b>
                    <span>{t.shields[2 - view.shield]}</span>
                  </div>
                  <i aria-hidden="true">{'◆'.repeat(view.shield) || '○'}</i>
                </div>
              )}
            </div>
          )}
          <div className="sp-desk-body" data-transfer={view.phase === 'shop' || undefined}>
            {!playing && (
              <div className="sp-mode-row" aria-label={t.modesLabel}>
                {MODES.map((m, i) => (
                  <button
                    key={m}
                    type="button"
                    aria-pressed={mode === m}
                    onClick={() => {
                      setMode(m);
                      run.current.wave =
                        m === 'lab' ? book.labStop : m === 'episode' ? startStop : 1;
                      repaint();
                    }}
                  >
                    <small>0{i + 1}</small>
                    {t.modes[i]}
                  </button>
                ))}
              </div>
            )}
            <div className="sp-chartroom">
              {!playing && (
                <div className="sp-dispatch-meta">
                  <span>{t.ready}</span>
                  <b>{t.sub}</b>
                  <span>CO / 285</span>
                </div>
              )}
              <canvas
                ref={canvas}
                aria-label={t.access}
                tabIndex={live ? 0 : -1}
                onPointerMove={(e) => {
                  if (!live || e.pointerType !== 'mouse') return;
                  const box = e.currentTarget.getBoundingClientRect();
                  run.current.aimX = (e.clientX - box.left) / box.width;
                  run.current.aimY = (e.clientY - box.top) / box.height;
                  run.current.locked = -1;
                }}
                onPointerDown={(e) => {
                  if (!live) return;
                  const box = e.currentTarget.getBoundingClientRect();
                  throwBall((e.clientX - box.left) / box.width, (e.clientY - box.top) / box.height);
                }}
              />
              {view.phase === 'shop' && (
                <div className="sp-game-intro sp-transfer-title">
                  <small>{t.between}</small>
                  <strong>{t.stops[chapter]} ✓</strong>
                  <p>
                    {t.stop} {view.wave + 1} · {t.stops[(chapter + 1) % 5]}
                  </p>
                </div>
              )}
              {!playing && (
                <div className="sp-game-intro">
                  <small>
                    {t.modesLabel} / 0{mi + 1}
                  </small>
                  <strong>{t.modes[mi]}</strong>
                  <p>{t.briefs[mi]}</p>
                </div>
              )}
              {(ended || view.phase === 'paused') && (
                <div className="sp-game-intro sp-result">
                  {view.phase === 'lost' && (
                    <span className="sp-result-prop">
                      <CaseProp id={view.lostCase} />
                    </span>
                  )}
                  <small>
                    {ended ? t.score : t.stop} {ended ? view.score : view.wave}
                  </small>
                  <strong>
                    {view.phase === 'won' ? t.done : view.phase === 'lost' ? t.lost : t.paused}
                  </strong>
                  <p>
                    {view.phase === 'won'
                      ? mode === 'lab'
                        ? view.rehearsal
                          ? t.rehearsed
                          : view.peak >= 130 && view.strikes === 0
                            ? t.pass
                            : t.retry
                        : t.medals[medal(view)]
                      : view.phase === 'lost'
                        ? site.cases[view.lostCase]
                        : t.rules[chapter]}
                  </p>
                </div>
              )}
            </div>
            {playing ? (
              <>
                <div className="sp-hud">
                  {[
                    [t.throughput, `${view.throughput} tok/s`],
                    [t.pace, `${view.pace} tok/s/user`],
                    [t.cache, `${Math.round(view.load)}%`],
                    [t.ttft, `${view.ttft} ms`],
                  ].map(([k, v]) => (
                    <div key={k}>
                      <small>{k}</small>
                      <strong>{v}</strong>
                    </div>
                  ))}
                </div>
                <div className="sp-runline">
                  <b data-sp-groups={view.groups}>
                    {t.progress} {view.groups}/{quota(view)}
                  </b>
                  <span>
                    {t.miss} {view.strikes}/3
                  </span>
                  <span>
                    {t.score} {view.score}
                  </span>
                </div>
                <div className="sp-channel-row" aria-label={t.access}>
                  {t.lanes.map((name, i) => {
                    const bus = leadBus(view, i),
                      blocked = dispatchBlock(view, bus);
                    const readable =
                      blocked === null
                        ? t.oneReady
                        : blocked === 'early'
                          ? `0 ${t.waiting}`
                          : blocked === 'boss'
                            ? t.shields[2 - view.shield]
                            : t.notice[blocked];
                    return (
                      <button
                        key={name}
                        type="button"
                        disabled={!live}
                        aria-pressed={view.lane === i}
                        data-queued={blocked ? 0 : 1}
                        data-sp-blocked={bus && blocked ? blocked : undefined}
                        title={readable}
                        aria-label={`${i + 1} ${name}: ${readable}`}
                        onClick={() => serve(i)}
                      >
                        <b>{i + 1}</b> {name}
                        {bus && blocked && blocked !== 'early' && (
                          <small className="sp-lane-reason">{t.blockedLabels[blocked]}</small>
                        )}
                      </button>
                    );
                  })}
                </div>
                <div className="sp-aim-panel">
                  <span>
                    <b>{t.clearing}</b> · {t.targets} {view.obstacles.length} · {t.hits}{' '}
                    <output data-sp-cleared={view.cleared}>{view.cleared}</output>
                  </span>
                  <button
                    type="button"
                    disabled={!live || view.obstacles.length === 0}
                    onClick={() => {
                      cycleAim(run.current);
                      repaint();
                    }}
                  >
                    {t.nextTarget} [Q]
                  </button>
                  <button type="button" disabled={!live} onClick={() => throwBall()}>
                    {t.toss} [F]
                  </button>
                  <small>{t.aimHelp}</small>
                </div>
                {live && (
                  <div className="sp-dispatch-bell">
                    <button
                      type="button"
                      data-sp-ring=""
                      disabled={view.buses.length > 0 || view.groups >= quota(view)}
                      onClick={() => {
                        if (ringIn(run.current)) {
                          engine.current?.cue('rustle');
                          desk.current?.focus({ preventScroll: true });
                        }
                        repaint();
                      }}
                    >
                      {t.ring} · +{bellCost(view)}% KV
                    </button>
                    <small>{t.ringTip}</small>
                    {view.gear.cache >= 2 && (
                      <button
                        type="button"
                        data-sp-purge=""
                        disabled={view.reserveUsed}
                        onClick={() => {
                          if (purge(run.current)) engine.current?.cue('dispatch');
                          repaint();
                        }}
                      >
                        {view.reserveUsed ? t.purged : t.purge}
                      </button>
                    )}
                  </div>
                )}
                <div className="sp-transmission">
                  <strong>{t.batch}</strong>
                  {BATCHES.map((s, i) => (
                    <button
                      key={s}
                      type="button"
                      disabled={!live}
                      aria-pressed={view.batch === i}
                      onClick={() => batch(i)}
                    >
                      {s}×
                    </button>
                  ))}
                  <button
                    type="button"
                    disabled={!live}
                    onClick={() => {
                      detour(run.current);
                      repaint();
                    }}
                  >
                    {t.detour}
                  </button>
                </div>
                <div className="sp-precision">
                  <b>{t.precision}</b>
                  {['FP4', 'FP8', 'BF16'].map((s, i) => (
                    <button
                      type="button"
                      key={s}
                      disabled={!live}
                      aria-pressed={view.precision === i}
                      onClick={() => {
                        run.current.precision = i;
                        repaint();
                      }}
                    >
                      {s}
                    </button>
                  ))}
                  <span
                    className="sp-dispatch-risk"
                    title={`${t.hazard}: ${site.cases[view.lastHazard]}`}
                  >
                    <CaseProp id={view.lastHazard} />
                    {site.props[view.lastHazard]}
                  </span>
                </div>
                <div className="sp-brief" role="status">
                  {view.notice === 'boss' ? t.shields[2 - view.shield] : t.notice[view.notice]}
                  {citation !== null && live && (
                    <span className="sp-randy-ticket" data-sp-traffic-ticket="">
                      <img src="/decorative/south-park/art/randy-foul.webp" alt="" />
                      <span>
                        <b>
                          {locale === 'zh' ? '兰迪的红灯罚单' : 'Randy’s red-light ticket'} · KV{' '}
                          {citation}%
                        </b>
                        {locale === 'zh' && <span lang="zh">{COUNTY_LINES.foul[1]} </span>}
                        <span lang="en">{COUNTY_LINES.foul[0]}</span>
                      </span>
                    </span>
                  )}
                </div>
                <div className="sp-hints">
                  {live &&
                  view.wave === 1 &&
                  view.served < 3 &&
                  view.strikes === 0 &&
                  (view.firstReceipt || dispatchBlock(view, leadBus(view, 0)) === null) ? (
                    <span data-sp-first-guide="">
                      <b>{t.firstGuide}</b> ·{' '}
                      {view.firstReceipt === null ? (
                        t.firstReady
                      ) : (
                        <>
                          {t.firstSlip} {view.firstReceipt.lane + 1}: {view.firstReceipt.throughput}{' '}
                          tok/s · KV {view.firstReceipt.load}%.{' '}
                          {view.cleared === 0 ? t.firstBlock : t.firstBell}
                        </>
                      )}
                    </span>
                  ) : (
                    <>
                      <b>{t.stops[chapter]}</b> · {t.rules[chapter]}
                    </>
                  )}
                </div>
                <details
                  key={view.phase === 'shop' ? 'transfer' : 'work'}
                  className="sp-workshop"
                  open={view.phase === 'shop' || undefined}
                >
                  <summary>
                    {view.phase === 'shop' ? t.between : t.shop} · {t.tickets} {view.tickets}
                  </summary>
                  <p>{t.shopHint}</p>
                  <div>
                    {SHOP.map((g, i) => (
                      <button
                        type="button"
                        key={g.id}
                        data-sp-buy={g.id}
                        data-rank={view.gear[g.id]}
                        disabled={
                          (!live && view.phase !== 'shop') ||
                          view.gear[g.id] >= 2 ||
                          view.tickets < g.cost
                        }
                        onClick={() => {
                          if (buy(run.current, g.id)) engine.current?.cue('shop');
                          repaint();
                        }}
                      >
                        <b>
                          {t.tools[i]} {view.gear[g.id]}/2
                        </b>
                        <span>
                          {g.cost} {t.tickets} · {t.tooltips[i]}
                        </span>
                      </button>
                    ))}
                  </div>
                </details>
                {(view.phase === 'shop' || view.depotRig !== 0) && (
                  <fieldset className="sp-rig-bay">
                    <legend>{view.depotRig ? t.installed : t.fitout}</legend>
                    {view.depotRig === 0 ? (
                      ([1, 2] as const).map((rig) => (
                        <button
                          type="button"
                          key={rig}
                          data-sp-rig={rig}
                          onClick={() => {
                            if (fitRig(run.current, rig)) engine.current?.cue('shop');
                            repaint();
                          }}
                        >
                          <b>{t.rigs[rig - 1]}</b> <span>{t.trades[rig - 1]}</span>
                        </button>
                      ))
                    ) : (
                      <output data-sp-fitted={view.depotRig}>
                        <b>{t.rigs[view.depotRig - 1]}</b> · {t.trades[view.depotRig - 1]}
                      </output>
                    )}
                  </fieldset>
                )}
                {view.phase === 'shop' && (
                  <button
                    className="sp-depart"
                    type="button"
                    onClick={() => {
                      if (depart(run.current)) {
                        engine.current?.cue('wave');
                        repaint();
                        desk.current?.focus();
                      }
                    }}
                  >
                    {t.onward} → {t.stops[(chapter + 1) % 5]}
                  </button>
                )}
              </>
            ) : (
              <>
                <div className="sp-setup">
                  <div>
                    <b>{t.viewMap}</b>
                    <RouteAtlas
                      t={t}
                      current={mode === 'lab' ? book.labStop : mode === 'episode' ? startStop : 1}
                      limit={mode === 'lab' ? 5 : mode === 'episode' ? book.stage : 1}
                      book={book}
                      select={travel}
                    />
                    <ol>
                      {t.stops.map((s, i) => (
                        <li key={s} data-visited={i < book.stage || undefined}>
                          {i + 1} {s}
                        </li>
                      ))}
                    </ol>
                  </div>
                  <div>
                    <b>{t.settings}</b>
                    {mode === 'episode' ? (
                      <label>
                        {t.from}
                        <select value={startStop} onChange={(e) => travel(Number(e.target.value))}>
                          {t.stops.slice(0, book.stage).map((s, i) => (
                            <option key={s} value={i + 1}>
                              {i + 1}. {s}
                            </option>
                          ))}
                        </select>
                      </label>
                    ) : mode === 'lab' ? (
                      <>
                        <label>
                          {t.from}
                          <select
                            value={book.labStop}
                            onChange={(e) => travel(Number(e.target.value))}
                          >
                            {t.stops.map((s, i) => (
                              <option key={s} value={i + 1}>
                                {i + 1}. {s}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label>
                          {t.lab}
                          <input
                            type="number"
                            min={0}
                            max={9999}
                            value={book.seed}
                            onChange={(e) =>
                              updateBook({
                                ...book,
                                seed: Math.max(
                                  0,
                                  Math.min(9999, Math.floor(Number(e.target.value))),
                                ),
                              })
                            }
                          />
                        </label>
                      </>
                    ) : null}
                    {mode !== 'lab' && (
                      <label title={t.permit}>
                        {t.kit}
                        <select
                          value={book.kit}
                          onChange={(e) => updateBook({ ...book, kit: Number(e.target.value) })}
                        >
                          {t.kits.map((s, i) => (
                            <option key={s} value={i} disabled={book.stage <= i}>
                              {s}
                            </option>
                          ))}
                        </select>
                      </label>
                    )}
                    <label>
                      <input
                        type="checkbox"
                        checked={book.slow}
                        onChange={(e) => updateBook({ ...book, slow: e.target.checked })}
                      />
                      {t.slow}
                    </label>
                  </div>
                </div>
                {mode === 'lab' && <DepotBuilder t={t} book={book} save={updateBook} />}
                <p className="sp-brief">{mode === 'lab' ? t.labVerdict : t.helpText}</p>
                <button
                  className="sp-friend-invite"
                  type="button"
                  data-sp-keep=""
                  aria-haspopup="dialog"
                  onClick={() => {
                    leavingForKeep.current = true;
                    onKeep();
                  }}
                >
                  <img
                    src="/decorative/south-park/art/cartman.webp"
                    width="34"
                    height="36"
                    alt=""
                  />
                  <span>
                    <small>
                      {locale === 'zh' ? '来自卡特曼的任务邀请' : 'Quest invite from Cartman'}
                    </small>
                    <b>
                      {locale === 'zh'
                        ? '游玩库帕堡回合制任务'
                        : 'Play the Kupa Keep turn-based quest'}
                    </b>
                  </span>
                  <span aria-hidden="true">›</span>
                </button>
              </>
            )}
            <footer className="sp-game-footer">
              <div>
                <b>
                  {t.record} {book.best[mi]}
                </b>
                <small>{mode === 'endless' ? t.endlessBank : t.series}</small>
              </div>
              <div>
                <button type="button" aria-expanded={info} onClick={() => setInfo(!info)}>
                  {t.help}
                </button>
                {active && (
                  <button type="button" onClick={pause}>
                    {live ? t.pause : t.resume}
                  </button>
                )}
                {playing && (
                  <button
                    type="button"
                    onClick={() => {
                      run.current = ready();
                      engine.current?.pause();
                      repaint();
                    }}
                  >
                    {t.choose}
                  </button>
                )}
                {!playing && mode === 'lab' && book.labStop === 5 && (
                  <button type="button" data-sp-rehearse="" onClick={() => start(true)}>
                    {t.rehearse}
                  </button>
                )}
                <button type="button" data-sp-start="" onClick={() => start()}>
                  {playing ? t.replay : t.start}
                </button>
              </div>
            </footer>
            {info && (
              <div className="sp-manual">
                <p>{t.helpText}</p>
                <p>{t.keys}</p>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
