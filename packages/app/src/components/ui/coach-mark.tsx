'use client';

import { X } from 'lucide-react';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

import {
  computeCoachMarkPlacement,
  isAnchorOnScreen,
  viewportSize,
  type CoachMarkPlacement,
  type Size,
} from '@/lib/nudges/anchor';
import type { NudgeAnchor } from '@/lib/nudges/types';
import { useLocale } from '@/lib/use-locale';

const STRINGS = {
  en: { close: 'Dismiss tip' },
  zh: { close: '关闭提示' },
} as const;

/** Card width in px. Mirrors the `w-72` utility so placement can use it before paint. */
const CARD_WIDTH = 288;
/** Stop the pointer short of the anchor so the arrowhead doesn't cover the point. */
const ARROW_STANDOFF = 13;

interface CoachMarkProps {
  anchor: NudgeAnchor;
  icon: React.ReactNode;
  title: string;
  description: string;
  /** Fired by the X button and by Escape. */
  onDismiss: () => void;
  /** Fired when the user clicks something matching `anchor.actionSelector`. */
  onAction?: () => void;
  testId?: string;
}

function samePlacement(a: CoachMarkPlacement | null, b: CoachMarkPlacement | null): boolean {
  if (a === null || b === null) return a === b;
  return (
    Math.abs(a.left - b.left) < 0.5 &&
    Math.abs(a.top - b.top) < 0.5 &&
    Math.abs(a.arrowX1 - b.arrowX1) < 0.5 &&
    Math.abs(a.arrowY1 - b.arrowY1) < 0.5 &&
    Math.abs(a.arrowX2 - b.arrowX2) < 0.5 &&
    Math.abs(a.arrowY2 - b.arrowY2) < 0.5 &&
    a.side === b.side
  );
}

/**
 * A non-modal callout pinned to a live element: a small card plus a pointer
 * drawn to the anchor's centre.
 *
 * Deliberately *not* a focus trap and not backed by a scrim — the whole point
 * is to teach an interaction the user then performs on the element underneath,
 * so everything except the card itself stays `pointer-events: none`. The card
 * hides (without dismissing) whenever the anchor is missing or scrolled out of
 * view, and re-appears when it comes back.
 */
export function CoachMark({
  anchor,
  icon,
  title,
  description,
  onDismiss,
  onAction,
  testId,
}: CoachMarkProps) {
  const locale = useLocale();
  const strings = STRINGS[locale];
  const cardRef = useRef<HTMLDivElement>(null);
  const anchorRef = useRef<Element | null>(null);
  const [placement, setPlacement] = useState<CoachMarkPlacement | null>(null);

  const resolve = anchor.resolve;
  const getRect = anchor.getRect;
  const getMutationRoot = anchor.getMutationRoot;
  const repositionEvents = anchor.repositionEvents;
  const actionSelector = anchor.actionSelector;

  // ── Placement, kept in sync with the live chart ──────────────────────────
  useLayoutEffect(() => {
    let frame = 0;

    const measure = () => {
      frame = 0;
      const card = cardRef.current;
      if (!card) return;

      let element = getRect && anchorRef.current?.isConnected ? anchorRef.current : null;
      let rect = element && getRect ? getRect(element) : null;
      if (!element || !rect) {
        element = resolve();
        rect = element ? (getRect ? getRect(element) : element.getBoundingClientRect()) : null;
      }
      anchorRef.current = element && rect ? element : null;

      if (!element || !rect) {
        setPlacement((prev) => (prev === null ? prev : null));
        return;
      }
      const viewport = viewportSize();
      if (!isAnchorOnScreen(rect, viewport)) {
        setPlacement((prev) => (prev === null ? prev : null));
        return;
      }
      const size: Size = {
        width: card.offsetWidth || CARD_WIDTH,
        height: card.offsetHeight,
      };
      const next = computeCoachMarkPlacement(rect, size, viewport);
      setPlacement((prev) => (samePlacement(prev, next) ? prev : next));
    };

    const schedule = () => {
      if (frame !== 0) return;
      frame = requestAnimationFrame(measure);
    };

    measure();

    window.addEventListener('resize', schedule);
    // Capture phase so scrolling inside any container (not just the document)
    // repositions the pointer.
    window.addEventListener('scroll', schedule, { capture: true, passive: true });
    for (const event of repositionEvents ?? []) window.addEventListener(event, schedule);

    // D3 coordinate transitions rewrite `transform` on every point each
    // frame. Keep the selected anchor for those mutations and validate just
    // that point. Structural, visibility, and trace-availability changes can
    // change which point is eligible, so they invalidate the cached choice.
    const observer = new MutationObserver((records) => {
      if (
        records.some(
          (record) => record.type === 'childList' || record.attributeName !== 'transform',
        )
      ) {
        anchorRef.current = null;
      }
      schedule();
    });
    observer.observe(getMutationRoot?.(anchorRef.current) ?? document.body, {
      attributes: true,
      attributeFilter: [
        'transform',
        'style',
        'data-has-trace',
        'data-trace-availability',
        'data-benchmark-type',
      ],
      childList: true,
      subtree: true,
    });

    return () => {
      if (frame !== 0) cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener('resize', schedule);
      window.removeEventListener('scroll', schedule, { capture: true });
      for (const event of repositionEvents ?? []) window.removeEventListener(event, schedule);
    };
  }, [resolve, getRect, getMutationRoot, repositionEvents]);

  /**
   * Whether the callout is actually on screen. The card stays mounted while
   * hidden — it has to be in the DOM to be measured, and it re-appears when
   * its point comes back — so every input handler below is gated on this.
   * Dismissal is permanent: reacting to a keypress or a click while nothing
   * is visible would burn the first-visit tip the user never saw.
   */
  const visible = placement !== null;

  // ── Escape to dismiss ────────────────────────────────────────────────────
  const onDismissRef = useRef(onDismiss);
  onDismissRef.current = onDismiss;
  useEffect(() => {
    if (!visible) return;
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onDismissRef.current();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [visible]);

  // ── Clicking the thing the tip is about counts as taking the action ──────
  const onActionRef = useRef(onAction);
  onActionRef.current = onAction;
  useEffect(() => {
    if (!actionSelector || !visible) return;
    const handler = (event: MouseEvent) => {
      const target = event.target as Element | null;
      if (target?.closest?.(actionSelector)) onActionRef.current?.();
    };
    // Capture phase: d3's own point handler calls stopPropagation().
    document.addEventListener('click', handler, true);
    return () => document.removeEventListener('click', handler, true);
  }, [actionSelector, visible]);

  const handleDismiss = useCallback(() => onDismissRef.current(), []);

  const titleId = testId ? `${testId}-title` : undefined;
  const descriptionId = testId ? `${testId}-description` : undefined;

  return (
    <div
      className="pointer-events-none fixed inset-0 z-50"
      // The card is measured before it is ever placed, so it must be in the
      // DOM from the first paint — `aria-hidden` keeps that measuring pass out
      // of the accessibility tree.
      aria-hidden={visible ? undefined : 'true'}
      data-testid={testId ? `${testId}-layer` : undefined}
    >
      {visible && (
        <svg
          className="pointer-events-none absolute inset-0 size-full overflow-visible"
          aria-hidden="true"
        >
          <defs>
            <marker
              id="coach-mark-arrowhead"
              markerWidth="7"
              markerHeight="7"
              refX="5.5"
              refY="3"
              orient="auto"
            >
              <path d="M0,0 L6,3 L0,6 Z" fill="var(--brand)" />
            </marker>
          </defs>
          {(() => {
            const dx = placement.arrowX2 - placement.arrowX1;
            const dy = placement.arrowY2 - placement.arrowY1;
            const length = Math.hypot(dx, dy) || 1;
            const scale = Math.max(0, length - ARROW_STANDOFF) / length;
            return (
              <line
                data-testid={testId ? `${testId}-pointer` : undefined}
                x1={placement.arrowX1}
                y1={placement.arrowY1}
                x2={placement.arrowX1 + dx * scale}
                y2={placement.arrowY1 + dy * scale}
                stroke="var(--brand)"
                strokeWidth={2}
                strokeLinecap="round"
                markerEnd="url(#coach-mark-arrowhead)"
              />
            );
          })()}
          {/* Pulsing ring on the anchor itself. Unlike the pointer line —
              which stops short so its arrowhead doesn't cover the point — this
              is centred exactly on what the tip is about. */}
          <circle
            data-testid={testId ? `${testId}-target` : undefined}
            cx={placement.arrowX2}
            cy={placement.arrowY2}
            r={11}
            fill="none"
            stroke="var(--brand)"
            strokeWidth={2}
            className="animate-ping"
            style={{ transformBox: 'fill-box', transformOrigin: 'center' }}
          />
        </svg>
      )}

      <div
        ref={cardRef}
        data-testid={testId}
        role="dialog"
        aria-modal="false"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        className={`pointer-events-auto absolute w-72 rounded-lg border border-brand/50 bg-card p-4 shadow-lg transition-opacity duration-200 ${
          visible ? 'opacity-100' : 'opacity-0'
        }`}
        style={{
          left: placement?.left ?? 0,
          top: placement?.top ?? 0,
          visibility: visible ? undefined : 'hidden',
        }}
      >
        <button
          type="button"
          onClick={handleDismiss}
          className="absolute right-2 top-2 rounded-sm text-muted-foreground transition-colors hover:text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          aria-label={strings.close}
          data-testid={testId ? `${testId}-dismiss` : undefined}
        >
          <X className="size-3.5" />
        </button>
        <div className="flex items-start gap-3 pr-4">
          <span className="mt-0.5 shrink-0 [&_svg]:size-4">{icon}</span>
          <div className="flex flex-col gap-1">
            <p id={titleId} className="text-sm font-semibold text-foreground">
              {title}
            </p>
            <p id={descriptionId} className="text-xs text-muted-foreground">
              {description}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
