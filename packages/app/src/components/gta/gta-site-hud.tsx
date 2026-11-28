'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { onGtaEffect, prefersReducedMotion, type GtaArt, type LineId } from './gta-store';
import { QUOTES, type GtaStrings } from './gta-strings';

interface FeedItem {
  id: number;
  title: string;
  body: string;
  tone: 'cash' | 'wanted' | 'info';
  art?: GtaArt;
}

type OverlayKind = 'passed' | 'busted' | 'wasted';

const FEED_MS = 4200;
const OVERLAY_MS = 3200;
const CHOPPER_MS = 6500;
const SCENE_MS = 6000;
/** Big Smoke's order is two recordings long: the order as spoken, then the benchmark remix. */
const ORDER_SCENE_MS = 16_000;
const ORDER_REMIX_AT_MS = 7800;
const MAX_FEED = 2;
const ART_BASE = '/decorative/gta/art/';
/** The scene shown beside the district name; districts without their own use the map. */
const ZONE_ART: Record<string, string> = {
  home: 'zone-grove',
  inference: 'zone-downtown',
  rankings: 'zone-downtown',
  quality: 'zone-vinewood',
  about: 'zone-vinewood',
  overview: 'zone-sandy',
  glossary: 'zone-pier',
  notFound: 'zone-alley',
};

/**
 * Screen furniture of the site theme, kept in one lane of its own: the middle of the banner's
 * bottom bar, between the character chips and the phone, which is in the page flow and scrolls
 * with it. The district the page is in (with its scene), the notification feed with the
 * sender's portrait, the "Mission passed!", "Wasted" and "Busted" titles, the subtitled lines
 * and the Buzzard fly-by all play inside the lane. It takes its own room, so nothing here is
 * ever drawn over a chart, a table, a heading or a control; a long line makes the bar taller
 * and moves the page down instead.
 */
export function GtaSiteHud({
  strings,
  slot,
}: {
  strings: GtaStrings;
  /** The element in the banner's bottom bar the lane is drawn into; nothing shows without it. */
  slot: HTMLElement | null;
}) {
  const [feed, setFeed] = useState<FeedItem[]>([]);
  const [overlay, setOverlay] = useState<{ id: number; kind: OverlayKind; sub?: string } | null>(
    null,
  );
  const [chopper, setChopper] = useState(0);
  const [scene, setScene] = useState<{ id: number; line: LineId; part: 0 | 1 } | null>(null);
  const [zone, setZone] = useState<{ id: number; name: string; zone: string } | null>(null);
  const nextId = useRef(1);

  useEffect(() => {
    const timers = new Set<number>();
    const later = (callback: () => void, ms: number) => {
      const id = window.setTimeout(() => {
        timers.delete(id);
        callback();
      }, ms);
      timers.add(id);
    };
    const off = onGtaEffect((effect) => {
      const id = nextId.current++;
      // With reduced motion nothing leaves on a timer: an entry stays until the next one
      // replaces it, so the page holds still between the visitor's own actions.
      const hold = prefersReducedMotion();
      if (effect.type === 'feed') {
        const item: FeedItem = {
          id,
          title: effect.title,
          body: effect.body,
          tone: effect.tone ?? 'info',
          art: effect.art,
        };
        if (hold) {
          setOverlay(null);
          setFeed([item]);
          return;
        }
        setFeed((current) => [...current.slice(-(MAX_FEED - 1)), item]);
        later(() => setFeed((current) => current.filter((entry) => entry.id !== id)), FEED_MS);
      } else if (effect.type === 'overlay') {
        setOverlay({ id, kind: effect.kind, sub: effect.sub });
        if (hold) {
          setScene(null);
          return;
        }
        later(() => setOverlay((current) => (current?.id === id ? null : current)), OVERLAY_MS);
      } else if (effect.type === 'scene') {
        setScene({ id, line: effect.line, part: 0 });
        if (effect.line === 'order') {
          later(
            () => setScene((current) => (current?.id === id ? { ...current, part: 1 } : current)),
            ORDER_REMIX_AT_MS,
          );
        }
        if (hold) {
          setOverlay(null);
          return;
        }
        later(
          () => setScene((current) => (current?.id === id ? null : current)),
          effect.line === 'order' ? ORDER_SCENE_MS : SCENE_MS,
        );
      } else if (effect.type === 'zone') {
        setZone({ id, name: effect.name, zone: effect.id ?? 'other' });
      } else if (effect.type === 'chopper') {
        if (hold) return;
        setChopper(id);
        later(() => setChopper((current) => (current === id ? 0 : current)), CHOPPER_MS);
      }
    });
    return () => {
      off();
      for (const id of timers) window.clearTimeout(id);
    };
  }, []);

  const overlayText: Record<OverlayKind, { main: string; sub: string }> = {
    passed: { main: strings.overlay.passed, sub: strings.overlay.passedSub },
    busted: { main: strings.overlay.busted, sub: strings.overlay.bustedSub },
    wasted: { main: strings.overlay.wasted, sub: strings.overlay.wastedSub },
  };
  const line = scene ? { ...QUOTES[scene.line], ...strings.lines[scene.line] } : null;
  // One thing at a time in the middle of the bar: a title, else a line, else the feed. The
  // feed moves to the side slot while a title is up.
  const busy = overlay ? 'title' : scene && line ? 'line' : feed.length > 0 ? 'feed' : 'idle';
  const shown = busy === 'feed' ? feed : busy === 'title' ? feed.slice(-1) : [];

  if (!slot) return null;
  return createPortal(
    <div className="gta-site-hud no-export" data-testid="gta-site-hud" data-busy={busy}>
      <div className="gta-lane">
        <div className="gta-lane-bar">
          {zone && (
            <p className="gta-zone" data-testid="gta-zone" data-zone={zone.zone} key={zone.id}>
              {/* eslint-disable-next-line @next/next/no-img-element -- small local decorative art */}
              <img
                className="gta-zone-art"
                src={`${ART_BASE}${ZONE_ART[zone.zone] ?? 'zone-map'}.webp`}
                alt=""
                width={110}
                height={48}
                decoding="async"
              />
              <span className="gta-zone-name">{zone.name}</span>
            </p>
          )}
          <div className="gta-lane-live" role="status" aria-live="polite">
            {overlay && (
              <div
                className="gta-title-card"
                data-testid="gta-title-card"
                data-kind={overlay.kind}
                key={overlay.id}
              >
                <p className="gta-title-card-main">{overlayText[overlay.kind].main}</p>
                {overlay.kind === 'passed' && (
                  <p className="gta-title-card-respect">{strings.overlay.respect}</p>
                )}
                <p className="gta-title-card-sub">{overlay.sub ?? overlayText[overlay.kind].sub}</p>
              </div>
            )}
            {!overlay && scene && line && (
              <div
                className="gta-cutscene"
                data-testid="gta-cutscene"
                data-line={scene.line}
                data-art={line.art ? 'true' : 'false'}
                key={scene.id}
              >
                {line.art && (
                  // eslint-disable-next-line @next/next/no-img-element -- small local decorative art
                  <img
                    className="gta-cut-art"
                    src={`${ART_BASE}${line.art}.webp`}
                    alt=""
                    width={64}
                    height={48}
                    decoding="async"
                  />
                )}
                <div className="gta-cut-text">
                  {(scene.line !== 'order' || scene.part === 0) && (
                    <>
                      <p className="gta-cut-quote">
                        <span className="gta-cut-speaker">{line.speaker}</span>{' '}
                        <span lang="en">{line.quote}</span>
                      </p>
                      {line.gloss && <p className="gta-cut-gloss">{line.gloss}</p>}
                    </>
                  )}
                  {scene.line === 'order' && scene.part === 1 && (
                    <p className="gta-cut-quote">
                      <span className="gta-cut-speaker">{line.speaker}</span>
                    </p>
                  )}
                  {(scene.line !== 'order' || scene.part === 1) && (
                    <p className="gta-cut-remix">{line.remix}</p>
                  )}
                </div>
              </div>
            )}
            {shown.length > 0 && (
              <div className="gta-feed" data-slot-side={busy === 'title' ? 'true' : undefined}>
                {shown.map((item) => (
                  <div
                    key={item.id}
                    className="gta-feed-item"
                    data-tone={item.tone}
                    data-art={item.art ? 'true' : undefined}
                  >
                    {item.art ? (
                      // eslint-disable-next-line @next/next/no-img-element -- small local decorative art
                      <img
                        className="gta-feed-face"
                        src={`${ART_BASE}${item.art}.webp`}
                        alt=""
                        width={36}
                        height={36}
                        decoding="async"
                      />
                    ) : (
                      <span className="gta-feed-icon" aria-hidden="true" />
                    )}
                    <p className="gta-feed-title">{item.title}</p>
                    <p className="gta-feed-body">{item.body}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
          {chopper > 0 && (
            <div className="gta-buzzard" key={chopper} aria-hidden="true">
              <svg viewBox="0 0 120 48" width="100" height="40">
                <path className="gta-buzzard-rotor" d="M8 6h92" />
                <path d="M54 6v8" />
                <path
                  className="gta-buzzard-body"
                  d="M30 14h40c12 0 20 8 20 16 0 6-6 10-14 10H44c-10 0-18-6-18-14 0-6 2-12 4-12z"
                />
                <path className="gta-buzzard-body" d="M30 20 4 16v6l24 6z" />
                <path d="M2 10v18M40 44h44M48 40v4M76 40v4" />
                <path className="gta-buzzard-glass" d="M68 18c8 0 14 5 15 11H62V18z" />
              </svg>
            </div>
          )}
        </div>
      </div>
    </div>,
    slot,
  );
}
