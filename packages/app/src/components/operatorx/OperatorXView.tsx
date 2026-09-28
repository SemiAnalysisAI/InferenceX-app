'use client';

import { Card } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useClientSearch } from '@/hooks/useClientSearch';
import { replaceClientSearch } from '@/lib/client-navigation';

import { ComparisonDashboard } from './ComparisonDashboard';
import { ModelView } from './model-view/ModelView';

const CATEGORIES = [
  { value: 'gemm', label: 'GEMM' },
  { value: 'moe', label: 'MoE' },
  { value: 'attention', label: 'Attention' },
  { value: 'model', label: 'Model View' },
] as const;

type Category = (typeof CATEGORIES)[number]['value'];

function isCategory(value: string | null): value is Category {
  return CATEGORIES.some((c) => c.value === value);
}

function selectCategory(value: string) {
  const params = new URLSearchParams(window.location.search);
  params.set('op', value);
  params.delete('workload');
  params.delete('parallel');
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
        <h1 className="sr-only">OperatorX</h1>
        <TabsList>
          {CATEGORIES.map((c) => (
            <TabsTrigger key={c.value} value={c.value}>
              {c.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Card>
      {CATEGORIES.map((c) => (
        <TabsContent key={c.value} value={c.value}>
          {c.value === 'model'
            ? category === c.value && <ModelView />
            : category === c.value && <ComparisonDashboard op={c.value} />}
        </TabsContent>
      ))}
    </Tabs>
  );
}
