'use client';

import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';

import { useLocale } from '@/lib/i18n/use-locale';
import { playVoice } from './lego-audio';
import { prefersReducedMotion } from './lego-store';
import { STRINGS, fill } from './lego-strings';
import {
  COLOURS,
  FREE_SLOTS,
  PARTS,
  RACK_RULES,
  buildSets,
  formatClock,
} from './lego-studio-model';
import { StudioSession, type StudioMode, type StudioSnapshot } from './lego-studio-session';

const TURN_STEP = Math.PI / 8;

/** Runs a studio key. Returns false for keys the studio has no use for. */
function runKey(session: StudioSession, key: string, snapshot: StudioSnapshot | null): boolean {
  const free = session.mode === 'free';
  switch (key) {
    case 'ArrowLeft': {
      session.move(-1, 0);
      return true;
    }
    case 'ArrowRight': {
      session.move(1, 0);
      return true;
    }
    case 'ArrowUp': {
      session.move(0, 1);
      return true;
    }
    case 'ArrowDown': {
      session.move(0, -1);
      return true;
    }
    case 'Enter':
    case ' ': {
      session.actAtCursor();
      return true;
    }
    case 'r': {
      session.rotate();
      return true;
    }
    case 'q': {
      session.view.orbit(-TURN_STEP, 0);
      return true;
    }
    case 'e': {
      session.view.orbit(TURN_STEP, 0);
      return true;
    }
    case '+':
    case '=': {
      session.view.zoom(0.88);
      return true;
    }
    case '-':
    case '_': {
      session.view.zoom(1.14);
      return true;
    }
    case 'z': {
      session.undo();
      return true;
    }
    case 'y': {
      session.redo();
      return true;
    }
    case 'g': {
      session.jump();
      return !free;
    }
    case 'x': {
      session.toggleSeparator();
      return free;
    }
    case 'Delete':
    case 'Backspace': {
      session.liftAtCursor();
      return free;
    }
    case '[':
    case ']': {
      if (!free || !snapshot) return false;
      session.choosePart((snapshot.part + (key === ']' ? 1 : PARTS.length - 1)) % PARTS.length);
      return true;
    }
    case 'c': {
      if (!free || !snapshot) return false;
      session.chooseColour((snapshot.colour + 1) % COLOURS.length);
      return true;
    }
    default: {
      return false;
    }
  }
}

export default function LegoStudio({ mode, onBack }: { mode: StudioMode; onBack: () => void }) {
  const locale = useLocale();
  const t = STRINGS[locale].studio;
  const hub = STRINGS[locale].hub;
  const stageRef = useRef<HTMLDivElement>(null);
  const sessionRef = useRef<StudioSession | null>(null);
  const [snapshot, setSnapshot] = useState<StudioSnapshot | null>(null);
  const [failed, setFailed] = useState(false);
  const [pictures, setPictures] = useState<string[]>([]);
  const [confirming, setConfirming] = useState(false);
  const [looking, setLooking] = useState(false);
  const [slot, setSlot] = useState(0);
  const [code, setCode] = useState('');
  const codeRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    // Each sitting gets a canvas of its own: a 3D context that was let go cannot be reused.
    const canvas = document.createElement('canvas');
    canvas.className = 'lego-studio-canvas';
    canvas.setAttribute('aria-hidden', 'true');
    stage.prepend(canvas);
    let session: StudioSession;
    try {
      session = new StudioSession(canvas, mode, prefersReducedMotion(), setSnapshot, slot);
    } catch {
      canvas.remove();
      setSnapshot(null);
      setFailed(true);
      // The Infomaniac's line from LEGO Island, for a computer with a piece missing.
      playVoice('whoops-cd');
      return;
    }
    setFailed(false);
    sessionRef.current = session;
    setSnapshot(session.snapshot());
    const fit = () => session.view.resize(stage.clientWidth, stage.clientHeight);
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(stage);
    stage.focus({ preventScroll: true });

    // One pointer that does not travel is a click; one that travels turns the view; two zoom.
    const pointers = new Map<number, { x: number; y: number }>();
    let dragged = false;
    let pinch = 0;
    const spread = () => {
      const [a, b] = [...pointers.values()];
      return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
    };
    const onDown = (event: PointerEvent) => {
      if (event.pointerType === 'mouse' && event.button !== 0) return;
      canvas.setPointerCapture(event.pointerId);
      if (pointers.size === 0) dragged = false;
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (pointers.size > 1) {
        dragged = true;
        pinch = spread();
      }
      stage.focus({ preventScroll: true });
    };
    const onMove = (event: PointerEvent) => {
      const held = pointers.get(event.pointerId);
      if (!held) {
        if (event.pointerType === 'mouse')
          session.hover(session.view.pick(event.clientX, event.clientY));
        return;
      }
      if (pointers.size === 1) {
        const dx = event.clientX - held.x;
        const dy = event.clientY - held.y;
        if (!dragged && Math.hypot(dx, dy) < 6) return;
        if (!dragged) session.hover(null);
        dragged = true;
        session.view.orbit(-dx * 0.008, -dy * 0.006);
        pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      } else {
        pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
        const now = spread();
        if (pinch > 0 && now > 0) session.view.zoom(pinch / now);
        pinch = now;
      }
    };
    const onUp = (event: PointerEvent) => {
      if (!pointers.delete(event.pointerId)) return;
      if (event.type === 'pointerup' && !dragged && pointers.size === 0)
        session.act(session.view.pick(event.clientX, event.clientY), event.pointerType !== 'mouse');
    };
    const onLeave = () => {
      if (pointers.size === 0) session.hover(null);
    };
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      session.view.zoom(Math.exp(event.deltaY * 0.0012));
    };
    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('pointercancel', onUp);
    canvas.addEventListener('pointerleave', onLeave);
    canvas.addEventListener('wheel', onWheel, { passive: false });

    return () => {
      observer.disconnect();
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointercancel', onUp);
      canvas.removeEventListener('pointerleave', onLeave);
      canvas.removeEventListener('wheel', onWheel);
      sessionRef.current = null;
      session.dispose();
      canvas.remove();
    };
  }, [mode, slot]);

  // Part pictures are drawn by the 3D view itself: a booklet needs only its next piece, and
  // the part bin fills in one picture at a time between frames.
  const colour = snapshot?.colour;
  const nextPart = snapshot?.next?.part;
  useEffect(() => {
    const current = sessionRef.current;
    if (colour === undefined || !current) return;
    if (mode !== 'free') {
      setPictures(nextPart === undefined ? [] : current.thumbnails(colour, [nextPart]));
      return;
    }
    let part = 0;
    let timer: number | undefined;
    const draw = () => {
      if (sessionRef.current !== current) return;
      const have = current.thumbnails(colour, []);
      while (part < PARTS.length && have[part]) part += 1;
      if (part >= PARTS.length) {
        setPictures(have);
        return;
      }
      setPictures(current.thumbnails(colour, [part]));
      timer = window.setTimeout(draw, 40);
    };
    timer = window.setTimeout(draw, 0);
    return () => window.clearTimeout(timer);
  }, [colour, mode, nextPart]);

  const done = snapshot?.done ?? false;
  useEffect(() => {
    if (!done) setLooking(false);
  }, [done]);

  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const session = sessionRef.current;
    if (!session || event.ctrlKey || event.metaKey || event.altKey) return;
    // Buttons that sit on the stage keep Enter and Space for themselves.
    if (event.target !== event.currentTarget) return;
    const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
    if (runKey(session, key, snapshot)) event.preventDefault();
  };

  const number = new Intl.NumberFormat(locale === 'zh' ? 'zh-CN' : 'en-US');
  const free = mode === 'free';
  const title = free ? hub.free : hub.setNames[mode];
  const session = sessionRef.current;
  const pieceName = (part: number, tint: number) =>
    fill(t.pieceName, {
      colour: t.colourNames[COLOURS[tint].id],
      part: t.partNames[PARTS[part].id],
    });
  const message = snapshot?.message;
  const messageText = message
    ? fill(t.messages[message.key], {
        piece:
          message.part === undefined || message.colour === undefined
            ? ''
            : pieceName(message.part, message.colour),
        x: message.x ?? 0,
        y: message.y ?? 0,
        z: message.z ?? 0,
        count: number.format(message.count ?? 0),
        stage: message.stage ? t.stageNames[message.stage] : '',
      })
    : t.pointerHint;
  const next = snapshot?.next ?? null;
  const booklet = free ? undefined : buildSets().find((set) => set.id === mode);
  const stages = booklet?.stages;
  const racked = free || booklet?.rack === true;
  const hot = (snapshot?.rack.trays ?? 0) > (snapshot?.rack.cooled ?? 0);
  const stage = snapshot?.stage ?? -1;
  const keys = free
    ? [t.keyMove, t.keyPlace, t.keyTurn, t.keyLift, t.keySeparator, t.keyPick, t.keyUndo, t.keyView]
    : [t.keyMove, t.keyPlace, t.keyTurn, t.keyJump, t.keyUndo, t.keyView];
  const refocus = () => stageRef.current?.focus({ preventScroll: true });
  // Escape cancels an open "Sure?" instead of closing the game.
  useEffect(() => {
    if (!confirming) return;
    const cancel = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      // Stopped here, ahead of the dialog: by the time the dialog hears the key the
      // question is already gone, and it would close the game.
      event.preventDefault();
      event.stopImmediatePropagation();
      setConfirming(false);
      stageRef.current?.focus({ preventScroll: true });
    };
    window.addEventListener('keydown', cancel, true);
    return () => window.removeEventListener('keydown', cancel, true);
  }, [confirming]);
  const copyCode = () => {
    if (!session) return;
    const text = session.buildCode();
    setCode(text);
    const settle = (copied: boolean) => {
      if (sessionRef.current !== session) return;
      session.note(copied ? 'copied' : 'copyFailed');
      // No clipboard here: the code is in the box, selected, ready to copy by hand.
      if (!copied) codeRef.current?.select();
    };
    if (navigator.clipboard?.writeText)
      navigator.clipboard.writeText(text).then(
        () => settle(true),
        () => settle(false),
      );
    else settle(false);
  };
  const loadCode = () => {
    if (!session || code.trim() === '') return;
    if (session.loadCode(code)) {
      setCode('');
      refocus();
    }
  };
  const savePicture = () => {
    if (!session || !snapshot) return;
    const picture = session.picture(
      fill(t.pictureCaption, { count: number.format(snapshot.pieces) }),
    );
    if (!picture) {
      session.note('pictureFailed');
      return;
    }
    picture.toBlob((blob) => {
      if (sessionRef.current !== session) return;
      if (!blob) {
        session.note('pictureFailed');
        return;
      }
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `inferencex-brick-build-${slot + 1}.png`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
      session.note('pictured');
    }, 'image/png');
  };
  const viewButtons = [
    { label: t.viewLeft, glyph: '↺', run: () => session?.view.orbit(-TURN_STEP, 0) },
    { label: t.viewRight, glyph: '↻', run: () => session?.view.orbit(TURN_STEP, 0) },
    { label: t.viewUp, glyph: '↑', run: () => session?.view.orbit(0, -0.14) },
    { label: t.viewDown, glyph: '↓', run: () => session?.view.orbit(0, 0.14) },
    { label: t.zoomIn, glyph: '+', run: () => session?.view.zoom(0.86) },
    { label: t.zoomOut, glyph: '−', run: () => session?.view.zoom(1.16) },
    { label: t.viewReset, glyph: '⌂', run: () => session?.view.resetView() },
  ];

  return (
    <div
      className="lego-studio"
      data-testid="lego-studio"
      data-mode={mode}
      data-step={snapshot?.step ?? 0}
      data-pieces={snapshot?.pieces ?? 0}
      data-done={done ? '' : undefined}
    >
      <div className="lego-studio-head">
        <button
          type="button"
          className="lego-game-button lego-game-quiet"
          data-testid="lego-studio-back"
          onClick={onBack}
        >
          {t.back}
        </button>
        <h2 className="lego-game-title">{title}</h2>
        <dl className="lego-game-stats">
          {free ? (
            <div>
              <dt>{t.pieces}</dt>
              <dd data-testid="lego-studio-pieces">{snapshot?.pieces ?? 0}</dd>
            </div>
          ) : (
            <>
              <div>
                <dt>{t.step}</dt>
                <dd data-testid="lego-studio-step">
                  {fill(t.stepOf, {
                    step: Math.min((snapshot?.step ?? 0) + 1, snapshot?.total ?? 0),
                    total: snapshot?.total ?? 0,
                  })}
                </dd>
              </div>
              <div>
                <dt>{t.time}</dt>
                <dd>{formatClock(snapshot?.seconds ?? 0)}</dd>
              </div>
            </>
          )}
          <div>
            <dt>{t.studs}</dt>
            <dd data-testid="lego-studio-earned">{number.format(snapshot?.earned ?? 0)}</dd>
          </div>
          {racked && (
            <>
              <div data-rack={hot ? 'hot' : 'ok'} title={hot ? t.rackHot : undefined}>
                <dt>{t.rackTokS}</dt>
                <dd data-testid="lego-studio-rack-toks">
                  {number.format(snapshot?.rack.tokS ?? 0)}
                  {hot && <span className="sr-only"> {t.rackHot}</span>}
                </dd>
              </div>
              <div>
                <dt>{t.rackPower}</dt>
                <dd data-testid="lego-studio-rack-kw">
                  {fill(t.rackKw, { n: number.format(snapshot?.rack.kw ?? 0) })}
                </dd>
              </div>
            </>
          )}
        </dl>
      </div>

      <div className="lego-studio-body">
        <div
          ref={stageRef}
          className="lego-studio-stage"
          data-testid="lego-studio-stage"
          data-lego-keys=""
          data-lego-silent=""
          data-separator={snapshot?.separator ? '' : undefined}
          role="application"
          tabIndex={0}
          aria-label={t.stageLabel}
          onKeyDown={onKeyDown}
        >
          {!failed && (
            <div className="lego-studio-view" role="group" aria-label={t.view}>
              {viewButtons.map((button) => (
                <button
                  key={button.label}
                  type="button"
                  className="lego-studio-view-button"
                  aria-label={button.label}
                  title={button.label}
                  onClick={button.run}
                >
                  <span aria-hidden="true">{button.glyph}</span>
                </button>
              ))}
            </div>
          )}
          {snapshot?.lowDetail && !failed && (
            <p className="lego-studio-low" data-testid="lego-studio-low">
              {t.lowDetail}
            </p>
          )}
          {(failed || snapshot?.lost) && (
            <div className="lego-game-overlay" role="alert">
              <div className="lego-game-plate">
                <p className="lego-game-over-hint">{failed ? t.noWebgl : t.lost}</p>
                <button type="button" className="lego-game-button" onClick={onBack}>
                  {t.back}
                </button>
              </div>
            </div>
          )}
          {done && !snapshot?.showing && !looking && !free && (
            <div className="lego-game-overlay lego-studio-done" data-testid="lego-studio-done">
              <div className="lego-game-plate">
                <p className="lego-game-over">{t.done}</p>
                {snapshot?.newBest && <p className="lego-game-perfect">{t.newBest}</p>}
                <p className="lego-game-over-hint">
                  {fill(t.doneHint, {
                    name: title,
                    time: formatClock(snapshot?.seconds ?? 0),
                    studs: number.format(snapshot?.earned ?? 0),
                  })}
                </p>
                <div className="lego-studio-row">
                  <button
                    type="button"
                    className="lego-game-button lego-game-quiet"
                    data-testid="lego-studio-look"
                    onClick={() => {
                      setLooking(true);
                      refocus();
                    }}
                  >
                    {t.doneLook}
                  </button>
                  <button
                    type="button"
                    className="lego-game-button lego-game-quiet"
                    data-testid="lego-studio-again"
                    onClick={() => {
                      session?.reset();
                      refocus();
                    }}
                  >
                    {t.doneAgain}
                  </button>
                  <button type="button" className="lego-game-button" autoFocus onClick={onBack}>
                    {t.back}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="lego-studio-side">
          {free ? (
            <>
              <h3 className="lego-studio-label">{t.parts}</h3>
              <div className="lego-studio-bin" role="group" aria-label={t.parts}>
                {PARTS.map((part, index) => (
                  <button
                    key={part.id}
                    type="button"
                    className="lego-studio-part"
                    aria-pressed={snapshot?.part === index && !snapshot.separator}
                    aria-label={t.partNames[part.id]}
                    title={t.partNames[part.id]}
                    data-part={part.id}
                    onClick={() => {
                      session?.choosePart(index);
                      refocus();
                    }}
                  >
                    {pictures[index] ? (
                      // eslint-disable-next-line @next/next/no-img-element -- a data URL drawn by the studio
                      <img src={pictures[index]} alt="" width={56} height={42} draggable={false} />
                    ) : (
                      <span className="lego-studio-part-text">{t.partNames[part.id]}</span>
                    )}
                  </button>
                ))}
              </div>
              <h3 className="lego-studio-label">{t.colours}</h3>
              <div className="lego-studio-swatches" role="group" aria-label={t.colours}>
                {COLOURS.map((tint, index) => (
                  <button
                    key={tint.id}
                    type="button"
                    className="lego-studio-swatch"
                    aria-pressed={snapshot?.colour === index}
                    aria-label={t.colourNames[tint.id]}
                    title={t.colourNames[tint.id]}
                    data-clear={tint.clear ? '' : undefined}
                    style={{ backgroundColor: tint.hex }}
                    onClick={() => {
                      session?.chooseColour(index);
                      refocus();
                    }}
                  />
                ))}
              </div>
              {snapshot && (
                <p className="lego-studio-hand">
                  {t.inHand}: <strong>{pieceName(snapshot.part, snapshot.colour)}</strong>
                </p>
              )}
              <h3 className="lego-studio-label">{t.slots}</h3>
              <div className="lego-studio-row" role="group" aria-label={t.slots}>
                {Array.from({ length: FREE_SLOTS }, (_, index) => (
                  <button
                    key={index}
                    type="button"
                    className="lego-game-button lego-game-quiet"
                    aria-pressed={slot === index}
                    aria-label={fill(t.slot, { n: index + 1 })}
                    data-testid={`lego-studio-slot-${index + 1}`}
                    onClick={() => setSlot(index)}
                  >
                    {index + 1}
                  </button>
                ))}
              </div>
              <h3 className="lego-studio-label">{t.share}</h3>
              <div className="lego-studio-row" role="group" aria-label={t.share}>
                <button
                  type="button"
                  className="lego-game-button lego-game-quiet"
                  data-testid="lego-studio-copy"
                  disabled={!snapshot || snapshot.busy}
                  onClick={copyCode}
                >
                  {t.copyCode}
                </button>
                <button
                  type="button"
                  className="lego-game-button lego-game-quiet"
                  data-testid="lego-studio-picture"
                  disabled={!snapshot || snapshot.busy}
                  onClick={savePicture}
                >
                  {t.savePicture}
                </button>
              </div>
              <form
                className="lego-studio-code"
                onSubmit={(event) => {
                  event.preventDefault();
                  loadCode();
                }}
              >
                <input
                  ref={codeRef}
                  type="text"
                  className="lego-studio-code-box"
                  data-testid="lego-studio-code"
                  aria-label={t.codeLabel}
                  placeholder={t.codeHint}
                  value={code}
                  spellCheck={false}
                  autoComplete="off"
                  autoCapitalize="off"
                  autoCorrect="off"
                  onChange={(event) => setCode(event.target.value)}
                />
                <button
                  type="submit"
                  className="lego-game-button lego-game-quiet"
                  data-testid="lego-studio-load"
                  disabled={!snapshot || snapshot.busy || code.trim() === ''}
                >
                  {t.loadCode}
                </button>
              </form>
            </>
          ) : (
            <div className="lego-studio-booklet" data-testid="lego-studio-booklet">
              {stages && (
                <ol
                  className="lego-studio-stages"
                  aria-label={t.stages}
                  data-testid="lego-studio-stages"
                >
                  {stages.map((entry, index) => {
                    const state =
                      done || index < stage ? 'built' : index === stage ? 'now' : 'next';
                    return (
                      <li
                        key={entry.id}
                        className="lego-studio-stage-stop"
                        data-state={state}
                        aria-current={state === 'now' ? 'step' : undefined}
                      >
                        <span className="lego-studio-stage-number" aria-hidden="true">
                          {state === 'built' ? '✓' : index + 1}
                        </span>
                        <span className="lego-studio-stage-name">{t.stageNames[entry.id]}</span>
                        <span className="sr-only">
                          {state === 'built'
                            ? t.stageBuilt
                            : state === 'now'
                              ? t.stageNow
                              : t.stageNext}
                        </span>
                      </li>
                    );
                  })}
                </ol>
              )}
              <div
                className="lego-studio-progress"
                role="progressbar"
                aria-label={t.step}
                aria-valuemin={0}
                aria-valuemax={snapshot?.total ?? 0}
                aria-valuenow={snapshot?.step ?? 0}
              >
                <span
                  style={{
                    width: `${((snapshot?.step ?? 0) / Math.max(1, snapshot?.total ?? 1)) * 100}%`,
                  }}
                />
              </div>
              {next ? (
                <>
                  <h3 className="lego-studio-label">{t.next}</h3>
                  <div className="lego-studio-callout">
                    <span className="lego-studio-step-number" aria-hidden="true">
                      {(snapshot?.step ?? 0) + 1}
                    </span>
                    {pictures[next.part] && (
                      // eslint-disable-next-line @next/next/no-img-element -- a data URL drawn by the studio
                      <img
                        src={pictures[next.part]}
                        alt=""
                        width={112}
                        height={84}
                        draggable={false}
                      />
                    )}
                    <p className="lego-studio-callout-name">
                      1× {pieceName(next.part, next.colour)}
                    </p>
                  </div>
                  <p className="lego-studio-note">{t.nextHint}</p>
                  <div className="lego-studio-row">
                    <button
                      type="button"
                      className="lego-game-button lego-game-quiet"
                      data-testid="lego-studio-jump"
                      onClick={() => {
                        session?.jump();
                        refocus();
                      }}
                    >
                      {t.jump}
                    </button>
                    <button
                      type="button"
                      className="lego-game-button lego-game-quiet"
                      data-testid="lego-studio-help"
                      onClick={() => session?.help()}
                    >
                      {t.help}
                    </button>
                  </div>
                  <p className="lego-studio-note">{t.helpNote}</p>
                </>
              ) : (
                <p className="lego-studio-note">{t.done}</p>
              )}
            </div>
          )}
          {racked && (
            <details className="lego-studio-about" data-testid="lego-studio-rack-how">
              <summary>{t.rackHow}</summary>
              <p>
                {fill(t.rackRule, {
                  tokS: number.format(RACK_RULES.trayTokS),
                  trayKw: RACK_RULES.trayKw,
                  coolingKw: RACK_RULES.coolingKw,
                  trays: RACK_RULES.traysPerCooling,
                  hot: Math.round(RACK_RULES.hotShare * 100),
                })}
              </p>
              {hot && <p className="lego-studio-about-hot">{t.rackHot}</p>}
            </details>
          )}
          <details className="lego-studio-keys">
            <summary>{t.keys}</summary>
            <ul>
              {keys.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </details>
        </div>
      </div>

      <div className="lego-studio-tools" role="toolbar" aria-label={title}>
        <button
          type="button"
          className="lego-game-button lego-game-quiet"
          data-testid="lego-studio-undo"
          disabled={!snapshot?.canUndo}
          onClick={() => session?.undo()}
        >
          {t.undo}
        </button>
        <button
          type="button"
          className="lego-game-button lego-game-quiet"
          data-testid="lego-studio-redo"
          disabled={!snapshot?.canRedo}
          onClick={() => session?.redo()}
        >
          {t.redo}
        </button>
        <button
          type="button"
          className="lego-game-button lego-game-quiet"
          data-testid="lego-studio-rotate"
          disabled={done}
          onClick={() => {
            session?.rotate();
            refocus();
          }}
        >
          {t.rotate}
        </button>
        {free && (
          <button
            type="button"
            className="lego-game-button lego-game-quiet lego-studio-separator"
            data-testid="lego-studio-separator"
            aria-pressed={snapshot?.separator ?? false}
            onClick={() => {
              session?.toggleSeparator();
              refocus();
            }}
          >
            {snapshot?.separator ? t.separatorOff : t.separatorOn}
          </button>
        )}
        {confirming ? (
          <span className="lego-studio-confirm" role="group" aria-label={t.resetConfirm}>
            <span>{t.resetConfirm}</span>
            <button
              type="button"
              className="lego-game-button"
              data-testid="lego-studio-reset-yes"
              onClick={() => {
                setConfirming(false);
                session?.reset();
                refocus();
              }}
            >
              {t.resetYes}
            </button>
            <button
              type="button"
              className="lego-game-button lego-game-quiet"
              autoFocus
              onClick={() => setConfirming(false)}
            >
              {t.resetNo}
            </button>
          </span>
        ) : (
          <button
            type="button"
            className="lego-game-button lego-game-quiet"
            data-testid="lego-studio-reset"
            disabled={!snapshot || snapshot.busy || (snapshot.pieces === 0 && snapshot.step === 0)}
            onClick={() => setConfirming(true)}
          >
            {t.reset}
          </button>
        )}
      </div>
      <p
        className="lego-studio-status"
        role="status"
        aria-live="polite"
        data-testid="lego-studio-status"
      >
        {messageText}
      </p>
    </div>
  );
}
