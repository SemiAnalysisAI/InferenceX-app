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

const POWERX_STORAGE_KEY = 'inferencex-powerx-unlocked';
const UNLOCK_SEQUENCE = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown'];

function usePowerXGate(): boolean {
  const [unlocked, setUnlocked] = useState(false);
  const sequenceRef = useRef<string[]>([]);

  useEffect(() => {
    if (typeof window !== 'undefined' && localStorage.getItem(POWERX_STORAGE_KEY) === '1') {
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
        localStorage.setItem(POWERX_STORAGE_KEY, '1');
        setUnlocked(true);
        track('powerx_unlocked');
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [unlocked]);

  return unlocked;
}

const TAB_LINKS = [
  { href: '/inference', label: 'Inference Performance', testId: 'tab-trigger-inference' },
  { href: '/evaluation', label: 'Accuracy Evals', testId: 'tab-trigger-evaluation' },
  { href: '/historical', label: 'Historical Trends', testId: 'tab-trigger-historical' },
  { href: '/calculator', label: 'TCO Calculator', testId: 'tab-trigger-calculator' },
  { href: '/reliability', label: 'GPU Reliability', testId: 'tab-trigger-reliability' },
  { href: '/gpu-specs', label: 'GPU Specs', testId: 'tab-trigger-gpu-specs' },
] as const;

function activeTab(pathname: string): string {
  const seg = pathname.split('/').filter(Boolean)[0] || 'inference';
  return seg;
}

export function TabNav() {
  const pathname = usePathname();
  const router = useRouter();
  const powerXUnlocked = usePowerXGate();
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
        <div className="w-full border-t-2 border-brand pb-6" />
        <Card>
          <div className="space-y-2">
            <Label htmlFor="chart-select">Select Chart</Label>
            <Select value={current} onValueChange={handleMobileChange}>
              <SelectTrigger id="chart-select" data-testid="mobile-chart-select" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="inference" data-ph-capture-attribute-tab="inference">
                  Inference Performance
                </SelectItem>
                <SelectItem value="evaluation" data-ph-capture-attribute-tab="evaluation">
                  Accuracy Evals
                </SelectItem>
                <SelectItem value="historical" data-ph-capture-attribute-tab="historical">
                  Historical Trends
                </SelectItem>
                <SelectItem value="calculator" data-ph-capture-attribute-tab="calculator">
                  TCO Calculator
                </SelectItem>
                <SelectItem value="reliability" data-ph-capture-attribute-tab="reliability">
                  GPU Reliability
                </SelectItem>
                <SelectItem value="gpu-specs" data-ph-capture-attribute-tab="gpu-specs">
                  GPU Specs
                </SelectItem>
                {powerXUnlocked && (
                  <SelectItem value="gpu-metrics" data-ph-capture-attribute-tab="gpu-metrics">
                    PowerX
                  </SelectItem>
                )}
              </SelectContent>
            </Select>
          </div>
        </Card>
      </div>

      {/* Desktop: Nav links */}
      <div className="hidden lg:flex flex-col mb-4">
        <div className="w-full border-t-2 border-brand pb-6" />
        <nav
          data-testid="chart-section-tabs"
          className="relative inline-flex p-1 gap-1 items-center justify-center bg-transparent"
        >
          {TAB_LINKS.map(({ href, label, testId }) => (
            <Link
              key={href}
              href={href}
              data-testid={testId}
              data-ph-capture-attribute-tab={href.slice(1)}
              onClick={() => handleDesktopClick(href.slice(1))}
              className={cn(
                'relative inline-flex h-10 items-center justify-center gap-1.5 px-4 py-2.5',
                'text-base font-medium whitespace-nowrap',
                'text-foreground hover:text-foreground/80',
                'dark:hover:text-primary/80',
                'transition-colors duration-200',
                'focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring',
                current === href.slice(1) && 'border-b-2 border-secondary dark:border-primary',
              )}
            >
              {label}
            </Link>
          ))}
          {powerXUnlocked && (
            <Link
              href="/gpu-metrics"
              data-testid="tab-trigger-gpu-metrics"
              data-ph-capture-attribute-tab="gpu-metrics"
              onClick={() => handleDesktopClick('gpu-metrics')}
              className={cn(
                'relative inline-flex h-10 items-center justify-center gap-1.5 px-4 py-2.5',
                'text-base font-medium whitespace-nowrap',
                'text-foreground hover:text-foreground/80',
                'dark:hover:text-primary/80',
                'transition-colors duration-200',
                'focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring',
                current === 'gpu-metrics' && 'border-b-2 border-secondary dark:border-primary',
              )}
            >
              PowerX
            </Link>
          )}
        </nav>
      </div>
    </>
  );
}
