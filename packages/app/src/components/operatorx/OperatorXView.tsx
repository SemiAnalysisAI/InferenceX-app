'use client';

import { Card } from '@/components/ui/card';
import { Heading } from '@/components/ui/heading';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useClientSearch } from '@/hooks/useClientSearch';
import { replaceClientSearch } from '@/lib/client-navigation';

import { ComparisonDashboard } from './ComparisonDashboard';

const CATEGORIES = [
  { value: 'gemm', label: 'GEMM' },
  { value: 'moe', label: 'MoE' },
  { value: 'attention', label: 'Attention' },
] as const;

type Category = (typeof CATEGORIES)[number]['value'];

function isCategory(value: string | null): value is Category {
  return CATEGORIES.some((c) => c.value === value);
}

function selectCategory(value: string) {
  const params = new URLSearchParams(window.location.search);
  params.set('op', value);
  params.delete('workload');
  replaceClientSearch(params);
}

export default function OperatorXView() {
  const requested = new URLSearchParams(useClientSearch()).get('op');
  const category: Category = isCategory(requested) ? requested : 'gemm';
  return (
    <Tabs
      value={category}
      onValueChange={selectCategory}
      className="gap-4"
      data-testid="operatorx-page"
    >
      <Card>
        <Heading as="h1" level="card">
          OperatorX
        </Heading>
        <p className="mt-1 text-sm text-muted-foreground">
          Single-operator benchmarks: the same GEMM and MoE workloads timed on each GPU, grouped by
          the model they come from.
        </p>
        <TabsList className="mt-4">
          {CATEGORIES.map((c) => (
            <TabsTrigger key={c.value} value={c.value}>
              {c.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Card>
      {CATEGORIES.map((c) => (
        <TabsContent key={c.value} value={c.value}>
          {c.value === 'attention' ? (
            <Card className="py-6 text-center">
              <p className="text-sm text-muted-foreground">No attention results yet.</p>
            </Card>
          ) : (
            category === c.value && <ComparisonDashboard op={c.value} />
          )}
        </TabsContent>
      ))}
    </Tabs>
  );
}
