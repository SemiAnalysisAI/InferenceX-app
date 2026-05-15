'use client';

import { ChevronDown } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useContext, useEffect, useRef, useState } from 'react';

import { track } from '@/lib/analytics';
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
import { UnofficialRunContext } from '@/components/unofficial-run-provider';
import { cn } from '@/lib/utils';

const FEATURE_GATE_KEY = 'inferencex-feature-gate';
const UNLOCK_SEQUENCE = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown'];

function useFeatureGate(): boolean {
  const [unlocked, setUnlocked] = useState(false);
  const sequenceRef = useRef<string[]>([]);

  useEffect(() => {
    if (typeof window !== 'undefined' && localStorage.getItem(FEATURE_GATE_KEY) === '1') {
      setUnlocked(true);
    }
  }, []);

  useEffect(() => {
    if (unlocked) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      sequenceRef.current.push(e.key);
      if (sequenceRef.current.length > UNLOCK_SEQUENCE.length) {
        sequenceRef.current = sequenceRef.current.slice(-UNLOCK_SEQUENCE.length);
      }
      if (
        sequenceRef.current.length === UNLOCK_SEQUENCE.length &&
        sequenceRef.current.every((k, i) => k === UNLOCK_SEQUENCE[i])
      ) {
        localStorage.setItem(FEATURE_GATE_KEY, '1');
        setUnlocked(true);
        window.dispatchEvent(new Event('inferencex:feature-gate:unlocked'));
        track('feature_gate_unlocked');
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [unlocked]);

  useEffect(() => {
    const handleLock = () => setUnlocked(false);
    const handleUnlock = () => setUnlocked(true);
    window.addEventListener('inferencex:feature-gate:locked', handleLock);
    window.addEventListener('inferencex:feature-gate:unlocked', handleUnlock);
    return () => {
      window.removeEventListener('inferencex:feature-gate:locked', handleLock);
      window.removeEventListener('inferencex:feature-gate:unlocked', handleUnlock);
    };
  }, []);

  return unlocked;
}

const VISIBLE_TABS = [
  { href: '/inference', label: 'Inference Performance', testId: 'tab-trigger-inference' },
  { href: '/evaluation', label: 'Accuracy Evals', testId: 'tab-trigger-evaluation' },
  { href: '/historical', label: 'Historical Trends', testId: 'tab-trigger-historical' },
  { href: '/calculator', label: 'TCO Calculator', testId: 'tab-trigger-calculator' },
  { href: '/gpu-specs', label: 'GPU Specs', testId: 'tab-trigger-gpu-specs' },
] as const;

const GATED_TABS = [
  { href: '/ai-chart', label: 'AI Chart', testId: 'tab-trigger-ai-chart' },
  { href: '/gpu-metrics', label: 'PowerX', testId: 'tab-trigger-gpu-metrics' },
  { href: '/submissions', label: 'Submissions', testId: 'tab-trigger-submissions' },
  { href: '/feedback', label: 'Feedback', testId: 'tab-trigger-feedback' },
] as const;

const TAB_VALUES = new Set([...VISIBLE_TABS, ...GATED_TABS].map((t) => t.href.slice(1)));
const GATED_VALUES = new Set(GATED_TABS.map((t) => t.href.slice(1)));

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

function activeTab(pathname: string): string {
  const seg = pathname.split('/').filter(Boolean)[0] || 'inference';
  return seg;
}

export function TabNav() {
  const pathname = usePathname();
  const router = useRouter();
  const featureGateUnlocked = useFeatureGate();
  const current = activeTab(pathname);
  const selectedTab = TAB_VALUES.has(current) ? current : '';

  // Preserve the `unofficialrun(s)` URL param across tab navigation so an
  // overlay loaded on /inference doesn't get dropped when switching to
  // /evaluation, etc. The URL is the source of truth (it's still set during
  // the in-flight fetch and even when the fetch fails), so we read it from
  // window.location and re-sync on pathname change, context update
  // (dismiss/clear writes via history.pushState), and popstate.
  const unofficialCtx = useContext(UnofficialRunContext);
  const ctxRunInfos = unofficialCtx?.unofficialRunInfos;
  const [unofficialIds, setUnofficialIds] = useState('');
  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const sync = () => {
      const sp = new URLSearchParams(window.location.search);
      for (const [k, v] of sp) {
        if (/^unofficialruns?$/iu.test(k) && v) {
          setUnofficialIds(v);
          return;
        }
      }
      setUnofficialIds('');
    };
    sync();
    window.addEventListener('popstate', sync);
    return () => window.removeEventListener('popstate', sync);
  }, [pathname, ctxRunInfos]);
  const tabHref = (path: string) =>
    unofficialIds ? `${path}?unofficialruns=${unofficialIds}` : path;

  const handleMobileChange = (value: string) => {
    window.dispatchEvent(new CustomEvent('inferencex:tab-change'));
    track('tab_changed', { tab: value });
    router.push(tabHref(`/${value}`));
  };

  const handleDesktopClick = (tab: string) => {
    window.dispatchEvent(new CustomEvent('inferencex:tab-change'));
    track('tab_changed', { tab });
  };

  return (
    <>
      {/* Mobile: Dropdown */}
      <div className="lg:hidden mb-4">
        <div className="w-full pb-6" />
        <Card>
          <div className="space-y-2">
            <Label htmlFor="chart-select">Select Chart</Label>
            <Select value={selectedTab} onValueChange={handleMobileChange}>
              <SelectTrigger id="chart-select" data-testid="mobile-chart-select" className="w-full">
                <SelectValue placeholder="Select Chart" />
              </SelectTrigger>
              <SelectContent>
                {VISIBLE_TABS.map((tab) => {
                  const value = tab.href.slice(1);
                  return (
                    <SelectItem key={value} value={value} data-ph-capture-attribute-tab={value}>
                      {tab.label}
                    </SelectItem>
                  );
                })}
                {featureGateUnlocked && (
                  <>
                    <SelectSeparator />
                    <SelectGroup>
                      <SelectLabel>Hidden</SelectLabel>
                      {GATED_TABS.map((tab) => {
                        const value = tab.href.slice(1);
                        return (
                          <SelectItem
                            key={value}
                            value={value}
                            data-ph-capture-attribute-tab={value}
                          >
                            {tab.label}
                          </SelectItem>
                        );
                      })}
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
            {VISIBLE_TABS.map((tab) => (
              <Link
                key={tab.href}
                href={tabHref(tab.href)}
                data-testid={tab.testId}
                data-ph-capture-attribute-tab={tab.href.slice(1)}
                onClick={() => handleDesktopClick(tab.href.slice(1))}
                className={cn(tabLinkClass, currentTabClass(current === tab.href.slice(1)))}
              >
                {tab.label}
              </Link>
            ))}
            {featureGateUnlocked && (
              <HiddenTabsPopover
                current={current}
                tabHref={tabHref}
                onSelect={handleDesktopClick}
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
}: {
  current: string;
  tabHref: (path: string) => string;
  onSelect: (tab: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const active = GATED_VALUES.has(current);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        data-testid="tab-trigger-hidden"
        data-ph-capture-attribute-tab="hidden"
        className={cn(tabLinkClass, currentTabClass(active), 'gap-1 cursor-pointer')}
      >
        Hidden
        <ChevronDown
          className={cn('size-4 transition-transform', open && 'rotate-180')}
          aria-hidden
        />
      </PopoverTrigger>
      <PopoverContent align="center" className="w-44 p-1" data-testid="tab-hidden-popover">
        <ul className="flex flex-col">
          {GATED_TABS.map((tab) => {
            const value = tab.href.slice(1);
            const isActive = current === value;
            return (
              <li key={tab.href}>
                <Link
                  href={tabHref(tab.href)}
                  data-testid={tab.testId}
                  data-ph-capture-attribute-tab={value}
                  onClick={() => {
                    setOpen(false);
                    onSelect(value);
                  }}
                  className={cn(
                    'block rounded-sm px-2 py-1.5 text-sm',
                    'transition-colors',
                    isActive
                      ? 'bg-accent text-secondary dark:text-primary font-medium'
                      : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                  )}
                >
                  {tab.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
