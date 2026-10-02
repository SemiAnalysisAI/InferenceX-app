'use client';

import { ChevronDown } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  type ReactNode,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { track } from '@/lib/analytics';
import {
  DASHBOARD_ROUTES,
  dashboardRouteForPathname,
  getDashboardRoute,
  type DashboardRoute,
  type DashboardRouteKey,
} from '@/lib/dashboard-routes';
import { localePath } from '@/lib/i18n';
import { TAB_LABELS_ZH } from '@/lib/tab-meta-zh';
import { useFeatureGate } from '@/lib/use-feature-gate';
import { Card } from '@/components/ui/card';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useClientSearchParams } from '@/hooks/useClientSearch';
import { cn } from '@/lib/utils';

const TAB_LABELS_EN: Record<DashboardRouteKey, string> = {
  inference: 'Inference Performance',
  evaluation: 'Accuracy Evals',
  historical: 'Historical Trends',
  calculator: 'TCO Calculator',
  fleet: 'Fleet Lifecycle',
  'first-token': 'First-Token Limits',
  'cache-reuse': 'Prefix Cache Reuse',
  'profit-estimator': 'Profit Estimator',
  'profit-estimator-per-gigawatt': 'Profit Estimator per GW',
  reliability: 'Reliability',
  'gpu-specs': 'Chip Specs',
  submissions: 'Submissions',
  operatorx: 'OperatorX',
  collectivex: 'CollectiveX',
  'ai-chart': 'AI Chart',
  'gpu-metrics': 'PowerX',
  'current-inferencex-image': 'Images',
  video: 'Video',
  feedback: 'Feedback',
};

const PRIMARY_TABS = DASHBOARD_ROUTES.filter((route) => route.navGroup === 'primary');
const GATED_TABS = DASHBOARD_ROUTES.filter((route) => route.navGroup === 'feature-gated');

const tabLinkClass = cn(
  'relative inline-flex items-center justify-center',
  'text-base font-medium whitespace-nowrap',
  'text-muted-foreground',
  'border-b-2 border-transparent',
  'transition-colors duration-200',
  'focus-visible:outline-none',
);

const currentTabClass = (active: boolean) =>
  active
    ? 'border-secondary dark:border-primary text-secondary dark:text-primary'
    : 'hover:border-muted-foreground/30';

function handleMobileSelect(tab: DashboardRouteKey) {
  window.dispatchEvent(new CustomEvent('inferencex:tab-change'));
  track('tab_changed', { tab, surface: 'mobile_strip' });
}

function handleDesktopClick(tab: DashboardRouteKey) {
  window.dispatchEvent(new CustomEvent('inferencex:tab-change'));
  track('tab_changed', { tab });
}

/**
 * Sliding active-tab indicator. Measures the active link and translates a
 * 2px bar under it (transform + width on an absolutely positioned element,
 * so no layout impact on the tabs themselves). While unmeasured — first
 * paint, no-JS, or a gated tab active in the popover — each link's static
 * `border-b` fallback renders instead, so the active state is never lost.
 */
function useTabIndicator(current: DashboardRouteKey, gateUnlocked: boolean) {
  const navRef = useRef<HTMLElement>(null);
  const hasAnimatedRef = useRef(false);
  const [indicator, setIndicator] = useState<{ left: number; width: number } | null>(null);

  const measure = useCallback(() => {
    const nav = navRef.current;
    if (!nav) return;
    const active = nav.querySelector<HTMLElement>('[data-tab-active="true"]');
    if (!active) {
      setIndicator(null);
      return;
    }
    setIndicator({ left: active.offsetLeft, width: active.offsetWidth });
  }, []);

  useLayoutEffect(measure, [measure, current]);

  // The gated "Hidden" trigger mounts a tick after hydration (the feature
  // gate reads localStorage in an effect), which shifts every sibling under
  // `justify-evenly` WITHOUT resizing the nav box — the ResizeObserver below
  // stays silent, so the indicator would keep pre-unlock coordinates.
  // Reposition without animating, exactly as for a resize.
  useLayoutEffect(() => {
    hasAnimatedRef.current = false;
    measure();
  }, [measure, gateUnlocked]);

  // Only slide between positions after the first measurement has painted;
  // the initial placement (and any resize reflow) must not animate.
  useLayoutEffect(() => {
    if (indicator) {
      const id = requestAnimationFrame(() => {
        hasAnimatedRef.current = true;
      });
      return () => cancelAnimationFrame(id);
    }
    hasAnimatedRef.current = false;
  }, [indicator]);

  useEffect(() => {
    const nav = navRef.current;
    if (!nav || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => {
      hasAnimatedRef.current = false;
      measure();
    });
    observer.observe(nav);
    return () => observer.disconnect();
  }, [measure]);

  return { navRef, indicator, animate: hasAnimatedRef.current };
}

export function TabNav({ footer }: { footer?: ReactNode }) {
  const pathname = usePathname();
  const featureGateUnlocked = useFeatureGate();
  const locale = pathname === '/zh' || pathname.startsWith('/zh/') ? 'zh' : 'en';
  const current = dashboardRouteForPathname(pathname)?.key ?? 'inference';
  const currentRoute = getDashboardRoute(current);
  const lockedCurrentGatedTab =
    !featureGateUnlocked && currentRoute.navGroup === 'feature-gated' ? currentRoute : null;
  const tabLabel = (route: DashboardRoute) =>
    locale === 'zh' ? TAB_LABELS_ZH[route.key] : TAB_LABELS_EN[route.key];

  const { navRef, indicator, animate } = useTabIndicator(current, featureGateUnlocked);
  const searchParams = useClientSearchParams();
  const unofficialIds = useMemo(() => {
    for (const [key, value] of searchParams) {
      if (/^unofficialruns?$/iu.test(key) && value) return value;
    }
    return '';
  }, [searchParams]);
  const tabHref = (path: string) =>
    unofficialIds ? `${path}?unofficialruns=${unofficialIds}` : path;

  return (
    <div className="mb-1 pt-3 lg:mb-4 lg:pt-0">
      <Card className="vt-dashboard-tabs p-0 md:p-0" data-slot="dashboard-navigation">
        {/* Mobile: one-tap, horizontally scrollable chart tabs. Every primary
            chart is visible as a pill (no dropdown round-trip), the active one
            is scrolled into view, and edge fades hint at overflow. */}
        <MobileTabStrip
          ariaLabel={locale === 'zh' ? '选择图表' : 'Select Chart'}
          current={current}
          routes={[...PRIMARY_TABS, ...(lockedCurrentGatedTab ? [lockedCurrentGatedTab] : [])]}
          gatedRoutes={featureGateUnlocked ? GATED_TABS : []}
          gatedLabel={locale === 'zh' ? '隐藏' : 'Hidden'}
          tabLabel={tabLabel}
          tabHref={(path) => tabHref(localePath(path, locale))}
          onSelect={handleMobileSelect}
        />

        {/* Desktop: Nav links */}
        <div className="hidden overflow-x-auto p-6 lg:block">
          <nav
            ref={navRef}
            data-testid="chart-section-tabs"
            className="relative flex items-center justify-evenly min-w-0"
          >
            {PRIMARY_TABS.map((route) => (
              <Link
                key={route.key}
                href={tabHref(localePath(route.path, locale))}
                data-testid={`tab-trigger-${route.key}`}
                data-ph-capture-attribute-tab={route.key}
                data-tab-active={current === route.key || undefined}
                onClick={() => handleDesktopClick(route.key)}
                className={cn(
                  tabLinkClass,
                  // The static border is the no-JS/unmeasured fallback; once the
                  // sliding indicator is live it owns the underline.
                  currentTabClass(current === route.key && !indicator),
                  current === route.key && 'text-secondary dark:text-primary',
                )}
              >
                {tabLabel(route)}
              </Link>
            ))}
            {indicator && (
              <span
                aria-hidden
                className="tab-indicator bg-secondary dark:bg-primary"
                style={{
                  width: indicator.width,
                  transform: `translateX(${indicator.left}px)`,
                  ...(animate ? null : { transition: 'none' }),
                }}
              />
            )}
            {featureGateUnlocked && (
              <HiddenTabsPopover
                current={current}
                tabHref={(path) => tabHref(localePath(path, locale))}
                onSelect={handleDesktopClick}
                tabLabel={tabLabel}
                locale={locale}
              />
            )}
          </nav>
        </div>
        {footer}
      </Card>
    </div>
  );
}

function HiddenTabsPopover({
  current,
  tabHref,
  onSelect,
  tabLabel,
  locale,
}: {
  current: DashboardRouteKey;
  tabHref: (path: string) => string;
  onSelect: (tab: DashboardRouteKey) => void;
  tabLabel: (route: DashboardRoute) => string;
  locale: 'en' | 'zh';
}) {
  const [open, setOpen] = useState(false);
  const active = getDashboardRoute(current).navGroup === 'feature-gated';

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        data-testid="tab-trigger-hidden"
        data-ph-capture-attribute-tab="hidden"
        className={cn(tabLinkClass, currentTabClass(active), 'gap-1 cursor-pointer')}
      >
        {locale === 'zh' ? '隐藏' : 'Hidden'}
        <ChevronDown
          className={cn('size-4 transition-transform', open && 'rotate-180')}
          aria-hidden
        />
      </PopoverTrigger>
      <PopoverContent align="center" className="w-44 p-1" data-testid="tab-hidden-popover">
        <ul className="flex flex-col">
          {GATED_TABS.map((route) => {
            const isActive = current === route.key;
            return (
              <li key={route.key}>
                <Link
                  href={tabHref(route.path)}
                  data-testid={`tab-trigger-${route.key}`}
                  data-ph-capture-attribute-tab={route.key}
                  onClick={() => {
                    setOpen(false);
                    onSelect(route.key);
                  }}
                  className={cn(
                    'block rounded-sm px-2 py-1.5 text-sm',
                    'transition-colors',
                    isActive
                      ? 'bg-accent text-secondary dark:text-primary font-medium'
                      : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                  )}
                >
                  {tabLabel(route)}
                </Link>
              </li>
            );
          })}
        </ul>
      </PopoverContent>
    </Popover>
  );
}

/**
 * Mobile chart navigation: every primary chart as a one-tap pill in a
 * horizontally scrollable strip. Replaces the old Select dropdown, which hid
 * the five destinations behind an extra tap and a full-screen listbox.
 * The active pill is scrolled into view on mount and on route change, and the
 * strip fades at whichever edge has more content.
 */
function MobileTabStrip({
  ariaLabel,
  current,
  routes,
  gatedRoutes,
  gatedLabel,
  tabLabel,
  tabHref,
  onSelect,
}: {
  ariaLabel: string;
  current: DashboardRouteKey;
  routes: readonly DashboardRoute[];
  gatedRoutes: readonly DashboardRoute[];
  gatedLabel: string;
  tabLabel: (route: DashboardRoute) => string;
  tabHref: (path: string) => string;
  onSelect: (tab: DashboardRouteKey) => void;
}) {
  const scrollerRef = useRef<HTMLElement>(null);
  const [edges, setEdges] = useState({ start: false, end: false });

  const updateEdges = useCallback(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const start = el.scrollLeft > 4;
    const end = el.scrollLeft + el.clientWidth < el.scrollWidth - 4;
    setEdges((prev) => (prev.start === start && prev.end === end ? prev : { start, end }));
  }, []);

  useLayoutEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const active = el.querySelector<HTMLElement>('[aria-current="page"]');
    if (active) {
      // Centre the active pill without moving the page vertically.
      const target = active.offsetLeft - (el.clientWidth - active.offsetWidth) / 2;
      el.scrollLeft = Math.max(0, target);
    }
    updateEdges();
  }, [current, updateEdges, gatedRoutes.length]);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(updateEdges);
    observer.observe(el);
    return () => observer.disconnect();
  }, [updateEdges]);

  const renderPill = (route: DashboardRoute) => {
    const active = current === route.key;
    return (
      <Link
        key={route.key}
        href={tabHref(route.path)}
        aria-current={active ? 'page' : undefined}
        data-testid={`mobile-tab-${route.key}`}
        data-ph-capture-attribute-tab={route.key}
        onClick={() => onSelect(route.key)}
        className={cn(
          'inline-flex min-h-10 shrink-0 items-center rounded-full border px-4 text-sm font-medium whitespace-nowrap',
          'transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          active
            ? 'border-secondary bg-secondary text-secondary-foreground dark:border-primary dark:bg-primary dark:text-primary-foreground'
            : 'border-border/60 bg-background/40 text-muted-foreground active:bg-accent',
        )}
      >
        {tabLabel(route)}
      </Link>
    );
  };

  return (
    <div className="relative lg:hidden">
      <nav
        ref={scrollerRef}
        id="chart-select"
        aria-label={ariaLabel}
        data-testid="mobile-chart-select"
        onScroll={updateEdges}
        className="no-scrollbar flex gap-2 overflow-x-auto overscroll-x-contain p-3"
      >
        {routes.map(renderPill)}
        {gatedRoutes.length > 0 && (
          <>
            <span
              aria-hidden
              className="shrink-0 self-center px-1 text-2xs font-medium uppercase tracking-eyebrow text-muted-foreground/70"
            >
              {gatedLabel}
            </span>
            {gatedRoutes.map(renderPill)}
          </>
        )}
      </nav>
      <span
        aria-hidden
        className={cn(
          'pointer-events-none absolute inset-y-0 left-0 w-6 rounded-l-xl bg-gradient-to-r from-background to-transparent transition-opacity',
          edges.start ? 'opacity-100' : 'opacity-0',
        )}
      />
      <span
        aria-hidden
        className={cn(
          'pointer-events-none absolute inset-y-0 right-0 w-8 rounded-r-xl bg-gradient-to-l from-background to-transparent transition-opacity',
          edges.end ? 'opacity-100' : 'opacity-0',
        )}
      />
    </div>
  );
}
