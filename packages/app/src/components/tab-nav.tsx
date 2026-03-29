'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

import { track } from '@/lib/analytics';
import { Card } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
        window.dispatchEvent(new Event('inferencex:powerx:unlocked'));
        track('powerx_unlocked');
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [unlocked]);

  useEffect(() => {
    const handleLock = () => setUnlocked(false);
    const handleUnlock = () => setUnlocked(true);
    window.addEventListener('inferencex:powerx:locked', handleLock);
    window.addEventListener('inferencex:powerx:unlocked', handleUnlock);
    return () => {
      window.removeEventListener('inferencex:powerx:locked', handleLock);
      window.removeEventListener('inferencex:powerx:unlocked', handleUnlock);
    };
  }, []);

  return unlocked;
}

const TAB_LINKS = [
  { href: '/inference', label: 'Inference Performance', testId: 'tab-trigger-inference' },
  { href: '/evaluation', label: 'Accuracy Evals', testId: 'tab-trigger-evaluation' },
  { href: '/historical', label: 'Historical Trends', testId: 'tab-trigger-historical' },
  { href: '/calculator', label: 'TCO Calculator', testId: 'tab-trigger-calculator' },
  { href: '/reliability', label: 'GPU Reliability', testId: 'tab-trigger-reliability' },
  { href: '/gpu-specs', label: 'GPU Specs', testId: 'tab-trigger-gpu-specs' },
  { href: '/gpu-metrics', label: 'PowerX', testId: 'tab-trigger-gpu-metrics', gated: true },
] as const;

function activeTab(pathname: string): string {
  const seg = pathname.split('/').filter(Boolean)[0] || 'inference';
  return seg;
}

export function TabNav() {
  const pathname = usePathname();
  const router = useRouter();
  const featureGateUnlocked = useFeatureGate();
  const current = activeTab(pathname);

  const handleMobileChange = (value: string) => {
    window.dispatchEvent(new CustomEvent('inferencex:tab-change'));
    track('tab_changed', { tab: value });
    router.push(`/${value}`);
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
            <Select value={current} onValueChange={handleMobileChange}>
              <SelectTrigger id="chart-select" data-testid="mobile-chart-select" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TAB_LINKS.map((tab) => {
                  if ('gated' in tab && tab.gated && !featureGateUnlocked) return null;
                  const value = tab.href.slice(1);
                  return (
                    <SelectItem key={value} value={value} data-ph-capture-attribute-tab={value}>
                      {tab.label}
                    </SelectItem>
                  );
                })}
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
            {TAB_LINKS.map((tab) => {
              if ('gated' in tab && tab.gated && !featureGateUnlocked) return null;
              return (
                <Link
                  key={tab.href}
                  href={tab.href}
                  data-testid={tab.testId}
                  data-ph-capture-attribute-tab={tab.href.slice(1)}
                  onClick={() => handleDesktopClick(tab.href.slice(1))}
                  className={cn(
                    'relative inline-flex items-center justify-center',
                    'text-base font-medium whitespace-nowrap',
                    'text-muted-foreground',
                    'border-b-2 border-transparent',
                    'transition-colors duration-200',
                    'focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring',
                    current === tab.href.slice(1)
                      ? 'border-secondary dark:border-primary text-secondary dark:text-primary'
                      : 'hover:border-muted-foreground/30',
                  )}
                >
                  {tab.label}
                </Link>
              );
            })}
          </nav>
        </Card>
      </div>
    </>
  );
}
