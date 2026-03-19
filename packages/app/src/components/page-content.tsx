'use client';

import { track } from '@/lib/analytics';
import { useEffect, useRef, useState } from 'react';

import { GlobalFilterProvider } from '@/components/GlobalFilterContext';
import { EvaluationProvider } from '@/components/evaluation/EvaluationContext';
import EvaluationChartDisplay from '@/components/evaluation/ui/ChartDisplay';
import { GpuSpecsContent } from '@/components/gpu-specs/gpu-specs-content';
import GpuMetricsDisplay from '@/components/gpu-power/GpuPowerDisplay';
import HistoricalTrendsDisplay from '@/components/trends/HistoricalTrendsDisplay';
import { ExportNudge } from '@/components/export-nudge';
import { StarNudge } from '@/components/star-nudge';
import { InferenceProvider } from '@/components/inference/InferenceContext';
import InferenceChartDisplay from '@/components/inference/ui/ChartDisplay';
import { ReliabilityProvider } from '@/components/reliability/ReliabilityContext';
import ReliabilityChartDisplay from '@/components/reliability/ui/ChartDisplay';
import ThroughputCalculatorDisplay from '@/components/calculator/ThroughputCalculatorDisplay';
import { Card } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { UnofficialRunProvider } from '@/components/unofficial-run-provider';
import { getTabTitle, isValidTab } from '@/lib/tab-meta';

function getInitialTab(initialTab: string): string {
  if (typeof window !== 'undefined') {
    const hash = window.location.hash.slice(1);
    if (hash && isValidTab(hash)) {
      window.history.replaceState(null, '', `/${hash}`);
      return hash;
    }
  }
  return isValidTab(initialTab) ? initialTab : 'inference';
}

const POWERX_STORAGE_KEY = 'inferencex-powerx-unlocked';
const UNLOCK_SEQUENCE = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown'];

function usePowerXGate(): boolean {
  const [unlocked, setUnlocked] = useState(false);
  const sequenceRef = useRef<string[]>([]);

  // Check localStorage on mount
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

function ChartTabs({ initialTab }: { initialTab: string }) {
  const [activeTab, setActiveTab] = useState(() => getInitialTab(initialTab));
  const powerXUnlocked = usePowerXGate();

  useEffect(() => {
    document.title = getTabTitle(activeTab);
  }, [activeTab]);

  useEffect(() => {
    const handlePopState = () => {
      const pathTab = window.location.pathname.split('/').filter(Boolean)[0] || 'inference';
      if (isValidTab(pathTab)) {
        setActiveTab(pathTab);
      }
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const handleTabChange = (value: string) => {
    setActiveTab(value);
    window.history.pushState(null, '', `/${value}`);
    window.dispatchEvent(new CustomEvent('inferencex:tab-change'));
    track('tab_changed', { tab: value });
  };

  return (
    <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
      {/* Mobile: Dropdown */}
      <div className="sm:hidden mb-4">
        <div className="w-full border-t-2 border-secondary dark:border-primary pb-6" />
        <Card>
          <div className="space-y-2">
            <Label htmlFor="chart-select">Select Chart</Label>
            <Select value={activeTab} onValueChange={handleTabChange}>
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

      {/* Desktop: Tabs */}
      <TabsList data-testid="chart-section-tabs" className="hidden sm:flex mb-4">
        <TabsTrigger
          data-testid="tab-trigger-inference"
          data-ph-capture-attribute-tab="inference"
          value="inference"
        >
          Inference Performance
        </TabsTrigger>
        <TabsTrigger
          data-testid="tab-trigger-evaluation"
          data-ph-capture-attribute-tab="evaluation"
          value="evaluation"
        >
          Accuracy Evals
        </TabsTrigger>
        <TabsTrigger
          data-testid="tab-trigger-historical"
          data-ph-capture-attribute-tab="historical"
          value="historical"
        >
          Historical Trends
        </TabsTrigger>
        <TabsTrigger
          data-testid="tab-trigger-calculator"
          data-ph-capture-attribute-tab="calculator"
          value="calculator"
        >
          TCO Calculator
        </TabsTrigger>
        <TabsTrigger
          data-testid="tab-trigger-reliability"
          data-ph-capture-attribute-tab="reliability"
          value="reliability"
        >
          GPU Reliability
        </TabsTrigger>
        <TabsTrigger
          data-testid="tab-trigger-gpu-specs"
          data-ph-capture-attribute-tab="gpu-specs"
          value="gpu-specs"
        >
          GPU Specs
        </TabsTrigger>
        {powerXUnlocked && (
          <TabsTrigger
            data-testid="tab-trigger-gpu-metrics"
            data-ph-capture-attribute-tab="gpu-metrics"
            value="gpu-metrics"
          >
            PowerX
          </TabsTrigger>
        )}
      </TabsList>

      <GlobalFilterProvider>
        <InferenceProvider activeTab={activeTab}>
          <TabsContent value="inference">
            <InferenceChartDisplay />
          </TabsContent>

          <TabsContent value="historical">
            <HistoricalTrendsDisplay />
          </TabsContent>
        </InferenceProvider>

        <TabsContent value="evaluation">
          <EvaluationProvider>
            <EvaluationChartDisplay />
          </EvaluationProvider>
        </TabsContent>

        <TabsContent value="calculator">
          <ThroughputCalculatorDisplay />
        </TabsContent>

        <TabsContent value="reliability">
          <ReliabilityProvider>
            <ReliabilityChartDisplay />
          </ReliabilityProvider>
        </TabsContent>

        <TabsContent value="gpu-specs">
          <GpuSpecsContent />
        </TabsContent>

        {powerXUnlocked && (
          <TabsContent value="gpu-metrics">
            <GpuMetricsDisplay />
          </TabsContent>
        )}
      </GlobalFilterProvider>
    </Tabs>
  );
}

export function PageContent({ initialTab = 'inference' }: { initialTab?: string }) {
  return (
    <>
      <StarNudge />
      <ExportNudge />
      <UnofficialRunProvider>
        <main className="relative min-h-screen">
          <div className="container mx-auto px-4 lg:px-8 flex flex-col gap-16 lg:gap-4">
            <section>
              <Card data-testid="intro-section">
                <h2 className="text-lg font-semibold mb-2">
                  LLM inference performance is a major concern in providing AI services, but
                  accurate performance analysis remains elusive.
                </h2>
                <p className="text-muted-foreground mb-2">
                  The fast cadence of software development and model releases makes comparing
                  performance between setups difficult. Existing performance benchmarks quickly
                  become obsolete because they are static, and participants often game the
                  benchmarks with unrealistic, highly specific configurations.
                </p>
                <p className="text-muted-foreground mb-2">
                  <strong>InferenceX</strong> (formerly InferenceMAX) addresses these issues by
                  benchmarking popular models on major hardware platforms, updating benchmarks as
                  new software versions are released.
                </p>
                <p className="text-muted-foreground mb-2">
                  For each model and hardware combination, <strong>InferenceX</strong> sweeps
                  through different tensor parallel sizes and maximum concurrent requests,
                  presenting a throughput vs. latency graph for a complete picture. In terms of
                  software configurations, we ensure they are broadly applicable across different
                  serving scenarios, and we open-source the repo to encourage community
                  contributions.
                </p>
                <p className="text-muted-foreground">
                  We hope <strong>InferenceX</strong> provides the community with up-to-date and
                  realistic LLM inference performance insights. Learn more in our articles:{' '}
                  <a
                    href="https://newsletter.semianalysis.com/p/inferencemax-open-source-inference"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline font-medium"
                  >
                    v1
                  </a>
                  ,{' '}
                  <a
                    href="https://newsletter.semianalysis.com/p/inferencex-v2-nvidia-blackwell-vs"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline font-medium"
                  >
                    v2
                  </a>
                  .
                </p>
              </Card>
            </section>
            <ChartTabs initialTab={initialTab} />
          </div>
        </main>
      </UnofficialRunProvider>
    </>
  );
}
