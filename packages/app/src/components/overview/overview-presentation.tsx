'use client';

import {
  createContext,
  type ReactNode,
  type RefObject,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';

import type { OverviewComparisonMode } from '@/lib/overview-data';
import { overviewHref } from '@/lib/overview-links';

import {
  useOverviewData,
  useOverviewNavigation,
  useOverviewReference,
} from './overview-navigation';
import type { OverviewLocale, OverviewStrings } from './overview-scorecard';

/**
 * Width the matrix is laid out at while presenting, before `zoom` magnifies it.
 * Fixing it keeps the column proportions identical to the on-page matrix, so a
 * projected slide reads the same as the page the audience visits afterwards.
 */
const PRESENTATION_LAYOUT_WIDTH = 1200;

/** Room left around the matrix so it never runs into the bezel. */
const PRESENTATION_FILL = { width: 0.96, height: 0.94 };

const PRESENTATION_ZOOM_RANGE = { min: 0.3, max: 3 };

interface OverviewPresentationState {
  presenting: boolean;
  /** False until mounted, and on browsers that refuse the Fullscreen API. */
  supported: boolean;
  toggle: () => void;
}

interface OverviewPresentationContextValue extends OverviewPresentationState {
  surfaceRef: RefObject<HTMLDivElement | null>;
  scalerRef: RefObject<HTMLDivElement | null>;
}

const OverviewPresentationContext = createContext<OverviewPresentationContextValue | null>(null);

function usePresentationContext(): OverviewPresentationContextValue {
  const value = useContext(OverviewPresentationContext);
  if (value === null) throw new Error('Presentation controls require OverviewPresentationProvider');
  return value;
}

export function useOverviewPresentation(): OverviewPresentationState {
  return usePresentationContext();
}

/**
 * For leaves that only need to adapt if a presentation happens to be running.
 * Unlike the controls, they are reusable outside the overview page, where "not
 * presenting" is the honest answer rather than a wiring mistake.
 */
export function useIsPresenting(): boolean {
  return useContext(OverviewPresentationContext)?.presenting ?? false;
}

/**
 * Owns the fullscreen state for the whole page, not just the surface: the page
 * body has to know it is presenting so it can drop the chrome that lives
 * outside the surface from the DOM rather than leaving it for the browser to
 * merely stop painting.
 */
export function OverviewPresentationProvider({
  locale,
  children,
}: {
  locale: OverviewLocale;
  children: ReactNode;
}) {
  const data = useOverviewData();
  // Same reason the matrix reads it here: the reference follows the URL, so a
  // payload still cached from another reference must not rewrite it.
  const referenceHardware = useOverviewReference();
  const { push } = useOverviewNavigation();
  const surfaceRef = useRef<HTMLDivElement>(null);
  const scalerRef = useRef<HTMLDivElement>(null);
  const [presenting, setPresenting] = useState(false);
  const [supported, setSupported] = useState(false);

  useEffect(() => setSupported(document.fullscreenEnabled), []);

  useEffect(() => {
    const syncPresenting = () =>
      setPresenting(
        surfaceRef.current !== null && document.fullscreenElement === surfaceRef.current,
      );
    document.addEventListener('fullscreenchange', syncPresenting);
    return () => document.removeEventListener('fullscreenchange', syncPresenting);
  }, []);

  const toggle = useCallback(() => {
    const surface = surfaceRef.current;
    if (surface === null) return;
    if (document.fullscreenElement === surface) void document.exitFullscreen();
    else void surface.requestFullscreen().catch(() => setPresenting(false));
  }, []);

  // Magnify rather than restyle: one `zoom` scales type, padding and rules
  // together, so the projected matrix cannot drift from the page's own layout.
  const fit = useCallback(() => {
    const surface = surfaceRef.current;
    const scaler = scalerRef.current;
    if (surface === null || scaler === null) return;
    scaler.style.removeProperty('zoom');
    if (!presenting) return;

    const { width, height } = scaler.getBoundingClientRect();
    if (width === 0 || height === 0) return;
    const factor = Math.min(
      (surface.clientWidth * PRESENTATION_FILL.width) / width,
      (surface.clientHeight * PRESENTATION_FILL.height) / height,
    );
    scaler.style.zoom = String(
      Math.min(Math.max(factor, PRESENTATION_ZOOM_RANGE.min), PRESENTATION_ZOOM_RANGE.max),
    );
  }, [presenting]);

  // `data` is the dependency that matters beyond resizing: changing the view or
  // the SLO mid presentation changes the row count, and the matrix has to be
  // refitted.
  useEffect(() => {
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, [fit, data]);

  useEffect(() => {
    if (!presenting) return undefined;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
      // Two views, so either arrow means "the other one" — the audience reads
      // it as paging through slides.
      const target: OverviewComparisonMode =
        data.comparisonMode === 'history' ? 'hardware' : 'history';
      event.preventDefault();
      // Only `compare` is merged out of this href, so both row scopes stay on
      // the URL as they are and there is nothing to pass for them here.
      push(
        overviewHref(
          locale,
          data.tier,
          data.engineScope,
          target,
          referenceHardware,
          data.modelScope,
        ),
        ['compare'],
      );
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [presenting, data, referenceHardware, locale, push]);

  return (
    <OverviewPresentationContext.Provider
      value={{ presenting, supported, toggle, surfaceRef, scalerRef }}
    >
      {children}
    </OverviewPresentationContext.Provider>
  );
}

/**
 * The element handed to the Fullscreen API. Everything outside it stops
 * rendering while it is fullscreen, which is what strips the page down to the
 * matrix.
 *
 * Switching views or SLO while presenting is safe: `OverviewNavigationProvider`
 * swaps the data client-side without a route change, so this element is never
 * unmounted and the browser keeps it fullscreen.
 */
export function OverviewPresentationSurface({ children }: { children: ReactNode }) {
  const { presenting, surfaceRef, scalerRef } = usePresentationContext();
  return (
    <div
      ref={surfaceRef}
      data-testid="overview-presentation-surface"
      data-presenting={presenting}
      className={
        presenting
          ? 'flex h-full w-full items-center justify-center overflow-auto bg-background'
          : undefined
      }
    >
      {/* The toolbar needs more air from the matrix once it is the only chrome
          on a projector than it does as one strip among many on the page. */}
      <div
        ref={scalerRef}
        className={`flex flex-col ${presenting ? 'gap-6' : 'gap-4'}`}
        style={presenting ? { width: PRESENTATION_LAYOUT_WIDTH } : undefined}
      >
        {children}
      </div>
    </div>
  );
}

export function OverviewPresentToggle({ strings }: { strings: OverviewStrings }) {
  const { presenting, supported, toggle } = useOverviewPresentation();
  if (!supported) return null;
  return (
    <button
      type="button"
      data-testid="overview-present-toggle"
      onClick={toggle}
      aria-pressed={presenting}
      aria-label={presenting ? strings.presentExitAria : strings.presentEnterAria}
      title={strings.presentShortcutHint}
      className="inline-flex min-h-11 items-center rounded-md border border-border/60 px-3 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
    >
      {presenting ? strings.presentExit : strings.presentEnter}
    </button>
  );
}
