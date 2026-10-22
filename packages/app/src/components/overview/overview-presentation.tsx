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

import { track } from '@/lib/analytics/analytics';
import { notifyClientSearchChange } from '@/lib/routing/client-navigation';
import {
  OVERVIEW_DEFAULT_HISTORY_WINDOW,
  type OverviewComparisonMode,
} from '@/lib/overview/overview-data';
import { overviewHref } from '@/lib/overview/overview-links';

import {
  useOverviewData,
  useOverviewNavigation,
  useOverviewReference,
} from './overview-navigation';
import type { OverviewLocale, OverviewStrings } from './overview-strings';

const PRESENTATION_LAYOUT_WIDTH = 1200;

const PRESENTATION_FILL = { width: 0.96, height: 0.94 };

const PRESENTATION_ZOOM_RANGE = { min: 0.3, max: 3 };

interface OverviewPresentationState {
  presenting: boolean;
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

export function useIsPresenting(): boolean {
  return useContext(OverviewPresentationContext)?.presenting ?? false;
}

export function OverviewPresentationProvider({
  locale,
  children,
}: {
  locale: OverviewLocale;
  children: ReactNode;
}) {
  const data = useOverviewData();
  const referenceHardware = useOverviewReference();
  const { push, replaceClientState } = useOverviewNavigation();
  const surfaceRef = useRef<HTMLDivElement>(null);
  const scalerRef = useRef<HTMLDivElement>(null);
  const [presenting, setPresenting] = useState(false);
  const [supported, setSupported] = useState(false);

  const setPresentationIntent = useCallback(
    (enabled: boolean) => {
      const target = new URL(
        `${window.location.pathname}${window.location.search}${window.location.hash}`,
        window.location.origin,
      );
      if (enabled) target.searchParams.set('present', '1');
      else target.searchParams.delete('present');
      replaceClientState(`${target.pathname}${target.search}${target.hash}`, ['present']);
    },
    [replaceClientState],
  );

  useEffect(() => {
    setSupported(document.fullscreenEnabled);
    if (!document.fullscreenEnabled) setPresentationIntent(false);
  }, [setPresentationIntent]);

  useEffect(() => {
    const syncPresenting = () => {
      const nextPresenting =
        surfaceRef.current !== null && document.fullscreenElement === surfaceRef.current;
      setPresenting(nextPresenting);
      if (!nextPresenting) setPresentationIntent(false);
    };
    document.addEventListener('fullscreenchange', syncPresenting);
    return () => document.removeEventListener('fullscreenchange', syncPresenting);
  }, [setPresentationIntent]);

  useEffect(() => {
    const preserveIntentWhileFullscreen = () => {
      const onOverview =
        window.location.pathname === '/overview' || window.location.pathname === '/zh/overview';
      if (
        onOverview &&
        surfaceRef.current !== null &&
        document.fullscreenElement === surfaceRef.current
      ) {
        const target = new URL(
          `${window.location.pathname}${window.location.search}${window.location.hash}`,
          window.location.origin,
        );
        target.searchParams.set('present', '1');
        const href = `${target.pathname}${target.search}${target.hash}`;
        History.prototype.replaceState.call(window.history, window.history.state, '', href);
        notifyClientSearchChange(href);
      }
    };
    window.addEventListener('popstate', preserveIntentWhileFullscreen, true);
    return () => window.removeEventListener('popstate', preserveIntentWhileFullscreen, true);
  }, []);

  const toggle = useCallback(() => {
    const surface = surfaceRef.current;
    if (surface === null) return;
    if (document.fullscreenElement === surface) {
      track('overview_presentation_toggled', { action: 'exit' });
      void document.exitFullscreen().catch(() => {
        setPresenting(true);
        setPresentationIntent(true);
      });
    } else {
      track('overview_presentation_toggled', { action: 'enter' });
      setPresentationIntent(true);
      void surface.requestFullscreen().catch(() => {
        setPresenting(false);
        setPresentationIntent(false);
      });
    }
  }, [setPresentationIntent]);

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

  useEffect(() => {
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, [fit, data]);

  useEffect(() => {
    if (!presenting) return undefined;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
      if (event.repeat) return;
      const eventTarget = event.target;
      if (
        eventTarget instanceof Element &&
        eventTarget.closest(
          'a, button, input, select, textarea, [contenteditable="true"], [role="button"], [role="combobox"], [role="listbox"], [role="option"], [role="menuitem"]',
        ) !== null
      ) {
        return;
      }
      const target: OverviewComparisonMode =
        data.comparisonMode === 'hardware' ? OVERVIEW_DEFAULT_HISTORY_WINDOW : 'hardware';
      event.preventDefault();
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
      className="inline-flex min-h-11 items-center gap-x-1.5 rounded-md border border-border/60 px-3 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none"
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="size-3.5"
      >
        {presenting ? (
          <path d="M6 2v4H2M10 2v4h4M6 14v-4H2M10 14v-4h4" />
        ) : (
          <path d="M6 2H2v4M10 2h4v4M6 14H2v-4M10 14h4v-4" />
        )}
      </svg>
      {presenting ? strings.presentExit : strings.presentEnter}
    </button>
  );
}
