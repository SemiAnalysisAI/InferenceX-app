'use client';

import dynamic from 'next/dynamic';

import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Heading } from '@/components/ui/heading';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useOperatorXModel } from '@/hooks/api/use-operatorx';
import { useClientSearch } from '@/hooks/useClientSearch';
import { track } from '@/lib/analytics/analytics';
import { useLocale } from '@/lib/i18n/use-locale';
import { replaceClientSearch } from '@/lib/routing/client-navigation';

import { ComparisonDashboard } from './ComparisonDashboard';
import { DEFAULT_MODEL, ModelViewLoading } from './model-view/shell';

const ModelView = dynamic(() => import('./model-view/ModelView').then((mod) => mod.ModelView), {
  loading: ModelViewLoading,
});

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
  track('operatorx_category_selected', { category: value });
  const params = new URLSearchParams(window.location.search);
  params.set('op', value);
  params.delete('workload');
  params.delete('parallel');
  replaceClientSearch(params);
}

function ModelViewTab() {
  const search = new URLSearchParams(useClientSearch());
  const model = search.get('model') ?? DEFAULT_MODEL;
  const parallel = search.get('parallel');
  const gemm = useOperatorXModel('gemm', model, parallel);
  const moe = useOperatorXModel('moe', model, parallel);
  const attention = useOperatorXModel('attention', model, parallel);
  return <ModelView gemm={gemm} moe={moe} attention={attention} />;
}

export default function OperatorXView() {
  const locale = useLocale();
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
        <div className="flex items-baseline gap-2">
          <Heading as="h1" level="card">
            OperatorX
          </Heading>
          <span className="text-xs text-muted-foreground" data-testid="operatorx-maturity">
            {locale === 'zh' ? '实验性' : 'Experimental'}
          </span>
        </div>
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
            <EmptyState>{locale === 'zh' ? '暂无结果' : 'No results yet'}</EmptyState>
          ) : (
            category === c.value && <ComparisonDashboard op={c.value} />
          )}
        </TabsContent>
      ))}
    </Tabs>
  );
}
