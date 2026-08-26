'use client';

import { ChevronDown } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';

import { track } from '@/lib/analytics';
import {
  DASHBOARD_ROUTES,
  dashboardRouteForPathname,
  getDashboardRoute,
  isDashboardRouteKey,
  type DashboardRoute,
  type DashboardRouteKey,
} from '@/lib/dashboard-routes';
import { localePath } from '@/lib/i18n';
import { TAB_LABELS_ZH } from '@/lib/tab-meta-zh';
import { useFeatureGate } from '@/lib/use-feature-gate';
import { Card } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useClientSearchParams } from '@/hooks/useClientSearch';
import { cn } from '@/lib/utils';

const TAB_LABELS_EN: Record<DashboardRouteKey, string> = {
  inference: 'Inference Performance',
  evaluation: 'Accuracy Evals',
  historical: 'Historical Trends',
  calculator: 'TCO Calculator',
  fleet: 'Fleet Lifecycle',
  reliability: 'Reliability',
  'gpu-specs': 'Chip Specs',
  submissions: 'Submissions',
  collectivex: 'CollectiveX',
  'ai-chart': 'AI Chart',
  'gpu-metrics': 'PowerX',
  'current-inferencex-image': 'Images',
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
  'focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring',
);

const currentTabClass = (active: boolean) =>
  active
    ? 'border-secondary dark:border-primary text-secondary dark:text-primary'
    : 'hover:border-muted-foreground/30';

function handleDesktopClick(tab: DashboardRouteKey) {
  window.dispatchEvent(new CustomEvent('inferencex:tab-change'));
  track('tab_changed', { tab });
}

export function TabNav() {
  const pathname = usePathname();
  const router = useRouter();
  const featureGateUnlocked = useFeatureGate();
  const locale = pathname === '/zh' || pathname.startsWith('/zh/') ? 'zh' : 'en';
  const current = dashboardRouteForPathname(pathname)?.key ?? 'inference';
  const selectedTab = getDashboardRoute(current).navGroup === 'footer-only' ? '' : current;
  const tabLabel = (route: DashboardRoute) =>
    locale === 'zh' ? TAB_LABELS_ZH[route.key] : TAB_LABELS_EN[route.key];

  const searchParams = useClientSearchParams();
  const unofficialIds = useMemo(() => {
    for (const [key, value] of searchParams) {
      if (/^unofficialruns?$/iu.test(key) && value) return value;
    }
    return '';
  }, [searchParams]);
  const tabHref = (path: string) =>
    unofficialIds ? `${path}?unofficialruns=${unofficialIds}` : path;

  const handleMobileChange = (value: string) => {
    if (!isDashboardRouteKey(value)) return;
    window.dispatchEvent(new CustomEvent('inferencex:tab-change'));
    track('tab_changed', { tab: value });
    router.push(tabHref(localePath(getDashboardRoute(value).path, locale)));
  };

  return (
    <>
      {/* Mobile: Dropdown */}
      <div className="lg:hidden mb-4">
        <div className="w-full pb-6" />
        <Card>
          <div className="space-y-2">
            <Label htmlFor="chart-select">{locale === 'zh' ? '选择图表' : 'Select Chart'}</Label>
            <Select value={selectedTab} onValueChange={handleMobileChange}>
              <SelectTrigger id="chart-select" data-testid="mobile-chart-select" className="w-full">
                <SelectValue placeholder={locale === 'zh' ? '选择图表' : 'Select Chart'} />
              </SelectTrigger>
              <SelectContent>
                {PRIMARY_TABS.map((route) => (
                  <SelectItem
                    key={route.key}
                    value={route.key}
                    data-ph-capture-attribute-tab={route.key}
                  >
                    {tabLabel(route)}
                  </SelectItem>
                ))}
                {featureGateUnlocked && (
                  <>
                    <SelectSeparator />
                    <SelectGroup>
                      <SelectLabel>{locale === 'zh' ? '隐藏' : 'Hidden'}</SelectLabel>
                      {GATED_TABS.map((route) => (
                        <SelectItem
                          key={route.key}
                          value={route.key}
                          data-ph-capture-attribute-tab={route.key}
                        >
                          {tabLabel(route)}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </>
                )}
              </SelectContent>
            </Select>
          </div>
        </Card>
      </div>

      {/* Desktop: Nav links */}
      <div className="hidden lg:flex flex-col mb-4">
        <Card className="overflow-x-auto py-6 md:py-6">
          <nav
            data-testid="chart-section-tabs"
            className="relative flex items-center justify-evenly min-w-0"
          >
            {PRIMARY_TABS.map((route) => (
              <Link
                key={route.key}
                href={tabHref(localePath(route.path, locale))}
                data-testid={`tab-trigger-${route.key}`}
                data-ph-capture-attribute-tab={route.key}
                onClick={() => handleDesktopClick(route.key)}
                className={cn(tabLinkClass, currentTabClass(current === route.key))}
              >
                {tabLabel(route)}
              </Link>
            ))}
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
        </Card>
      </div>
    </>
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
