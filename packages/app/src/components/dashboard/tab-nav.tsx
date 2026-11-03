'use client';

import { ChevronDown } from 'lucide-react';
import { usePathname } from 'next/navigation';
import {
  type ReactNode,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';

import { track } from '@/lib/analytics/analytics';
import {
  DASHBOARD_ROUTES,
  dashboardRouteForPathname,
  getDashboardRoute,
  type DashboardRoute,
  type DashboardRouteKey,
} from '@/lib/routing/dashboard-routes';
import { localePath } from '@/lib/i18n/i18n';
import { TAB_LABELS_ZH } from '@/lib/routing/tab-meta-zh';
import { useFeatureGate } from '@/lib/runtime/use-feature-gate';
import { IntentPrefetchLink } from '@/components/ui/intent-prefetch-link';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useClientRouteSearch } from '@/hooks/useClientSearch';
import { profitRoutePathname } from '@/lib/routing/profit-estimator-routes';
import {
  getInferenceNavigationModel,
  subscribeInferenceNavigationModel,
} from '@/lib/routing/inference-navigation-state';
import { cn } from '@/lib/shared/utils';

const TAB_LABELS_EN: Record<DashboardRouteKey, string> = {
  inference: 'Inference performance',
  powerx: 'PowerX',
  evaluation: 'Accuracy evals',
  historical: 'Historical trends',
  calculator: 'TCO calculator',
  fleet: 'Fleet lifecycle',
  'first-token': 'First-token limits',
  'cache-reuse': 'Prefix cache reuse',
  'profit-estimator': 'Profit estimator',
  'profit-estimator-per-gigawatt': 'Profit estimator per GW',
  reliability: 'Reliability',
  'gpu-specs': 'Chip specs',
  submissions: 'Submissions',
  operatorx: 'OperatorX',
  collectivex: 'CollectiveX',
  'agentic-workload-explorer': 'Agentic workloads',
  'ai-chart': 'AI chart',
  'current-inferencex-image': 'Images',
  video: 'Video',
  feedback: 'Feedback',
};

const PRIMARY_TABS = DASHBOARD_ROUTES.filter((route) => route.navGroup === 'primary');
const GATED_TABS = DASHBOARD_ROUTES.filter((route) => route.navGroup === 'feature-gated');

const tabLinkClass = cn(
  'relative inline-flex items-center justify-center py-3',
  'text-sm font-medium whitespace-nowrap',
  'text-muted-foreground',
  'border-b-2 border-transparent',
  'transition-colors duration-200',
  'focus-visible:outline-none focus-visible:text-foreground',
);

const currentTabClass = (active: boolean) =>
  active ? 'border-brand text-foreground' : 'hover:text-foreground';

function handleMobileSelect(tab: DashboardRouteKey) {
  window.dispatchEvent(new CustomEvent('inferencex:tab-change'));
  track('tab_changed', { tab, surface: 'mobile_strip' });
}

function handleDesktopClick(tab: DashboardRouteKey) {
  window.dispatchEvent(new CustomEvent('inferencex:tab-change'));
  track('tab_changed', { tab });
}

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

  useLayoutEffect(() => {
    hasAnimatedRef.current = false;
    measure();
  }, [measure, gateUnlocked]);

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
  const search = useClientRouteSearch();
  const retainedModel = useSyncExternalStore(
    subscribeInferenceNavigationModel,
    getInferenceNavigationModel,
    () => undefined,
  );
  const unofficialIds = useMemo(() => {
    for (const [key, value] of new URLSearchParams(search)) {
      if (/^unofficialruns?$/iu.test(key) && value) return value;
    }
    return '';
  }, [search]);
  const tabHref = (path: string) => {
    const href = unofficialIds
      ? (profitRoutePathname(path, new URLSearchParams({ unofficialruns: unofficialIds })) ??
        `${path}?unofficialruns=${unofficialIds}`)
      : path;
    if (retainedModel && (path === '/inference' || path === '/zh/inference')) {
      return `${href}${unofficialIds ? '&' : '?'}g_model=${encodeURIComponent(retainedModel)}`;
    }
    return href;
  };

  return (
    <div className="mb-1 pt-3 lg:mb-2 lg:pt-0">
      <div className="vt-dashboard-tabs" data-slot="dashboard-navigation">
        <MobileTabStrip
          ariaLabel={locale === 'zh' ? '选择图表' : 'Select chart'}
          current={current}
          routes={[...PRIMARY_TABS, ...(lockedCurrentGatedTab ? [lockedCurrentGatedTab] : [])]}
          gatedRoutes={featureGateUnlocked ? GATED_TABS : []}
          gatedLabel={locale === 'zh' ? '隐藏' : 'Hidden'}
          tabLabel={tabLabel}
          tabHref={(path) => tabHref(localePath(path, locale))}
          isCurrentPage={(route) => {
            const enPath = pathname === '/zh' ? '/' : pathname.replace(/^\/zh(?=\/)/u, '');
            return enPath === route.path || enPath === route.canonicalPath;
          }}
          onSelect={handleMobileSelect}
        />

        <div className="hidden overflow-x-auto border-b border-border/30 lg:block">
          <nav
            ref={navRef}
            data-testid="chart-section-tabs"
            className="relative flex min-w-0 items-center gap-8"
          >
            {PRIMARY_TABS.map((route) => (
              <IntentPrefetchLink
                key={route.key}
                href={tabHref(localePath(route.path, locale))}
                data-testid={`tab-trigger-${route.key}`}
                data-ph-capture-attribute-tab={route.key}
                data-tab-active={current === route.key || undefined}
                onClick={() => handleDesktopClick(route.key)}
                className={cn(
                  tabLinkClass,
                  currentTabClass(current === route.key && !indicator),
                  current === route.key && 'text-foreground',
                )}
              >
                {tabLabel(route)}
              </IntentPrefetchLink>
            ))}
            {indicator && (
              <span
                aria-hidden
                className="tab-indicator bg-brand"
                style={{
                  transform: `translateX(${indicator.left}px) scaleX(${indicator.width})`,
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
      </div>
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
                <IntentPrefetchLink
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
                      ? 'bg-muted text-foreground font-medium'
                      : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground',
                  )}
                >
                  {tabLabel(route)}
                </IntentPrefetchLink>
              </li>
            );
          })}
        </ul>
      </PopoverContent>
    </Popover>
  );
}

function MobileTabStrip({
  ariaLabel,
  current,
  routes,
  gatedRoutes,
  gatedLabel,
  tabLabel,
  tabHref,
  isCurrentPage,
  onSelect,
}: {
  ariaLabel: string;
  current: DashboardRouteKey;
  routes: readonly DashboardRoute[];
  gatedRoutes: readonly DashboardRoute[];
  gatedLabel: string;
  tabLabel: (route: DashboardRoute) => string;
  tabHref: (path: string) => string;
  isCurrentPage: (route: DashboardRoute) => boolean;
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
      <IntentPrefetchLink
        key={route.key}
        href={tabHref(route.path)}
        aria-current={active ? 'page' : undefined}
        data-testid={`mobile-tab-${route.key}`}
        data-ph-capture-attribute-tab={route.key}
        onClick={(event) => {
          if (active && isCurrentPage(route)) {
            event.preventDefault();
            return;
          }
          onSelect(route.key);
        }}
        className={cn(
          'inline-flex min-h-11 shrink-0 items-center rounded-md border px-3 text-sm font-medium whitespace-nowrap',
          'transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          active
            ? 'border-border/40 bg-muted text-foreground'
            : 'border-transparent text-muted-foreground active:bg-muted/60',
        )}
      >
        {tabLabel(route)}
      </IntentPrefetchLink>
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
        className="no-scrollbar flex gap-2 overflow-x-auto overscroll-x-contain py-3"
      >
        {routes.map(renderPill)}
        {gatedRoutes.length > 0 && (
          <>
            <span
              aria-hidden
              className="shrink-0 self-center px-1 text-xs font-medium text-muted-foreground"
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
          'pointer-events-none absolute inset-y-0 left-0 w-6 bg-gradient-to-r from-background to-transparent transition-opacity',
          edges.start ? 'opacity-100' : 'opacity-0',
        )}
      />
      <span
        aria-hidden
        className={cn(
          'pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-background to-transparent transition-opacity',
          edges.end ? 'opacity-100' : 'opacity-0',
        )}
      />
    </div>
  );
}
