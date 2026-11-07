'use client';

import dynamic from 'next/dynamic';
import { usePathname } from 'next/navigation';

import { Card } from '@/components/ui/card';
import { DashboardSectionHeader } from '@/components/ui/dashboard-section-header';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useOperatorXModel } from '@/hooks/api/use-operatorx';
import { useClientPathname } from '@/hooks/useClientPathname';
import { useClientSearch } from '@/hooks/useClientSearch';
import { track } from '@/lib/analytics/analytics';
import { useLocale } from '@/lib/i18n/use-locale';
import { replaceRouterPathname } from '@/lib/routing/client-navigation';
import {
  DEFAULT_OPERATORX_CATEGORY,
  isOperatorXCategory,
  OPERATORX_CATEGORIES,
  operatorXCategoryForPathname,
  operatorXCategoryRouteForSelection,
  type OperatorXCategory,
} from '@/lib/routing/operatorx-category';

import { ComparisonDashboard } from './ComparisonDashboard';
import { DEFAULT_MODEL, ModelViewLoading } from './model-view/shell';

const ModelView = dynamic(() => import('./model-view/ModelView').then((mod) => mod.ModelView), {
  loading: ModelViewLoading,
});

function selectCategory(value: string) {
  if (!isOperatorXCategory(value)) return;
  track('operatorx_category_selected', { category: value });
  replaceRouterPathname(
    operatorXCategoryRouteForSelection(window.location.pathname, value),
    ['workload', 'parallel'],
    { pageview: true },
  );
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
  const category: OperatorXCategory =
    operatorXCategoryForPathname(useClientPathname(usePathname())) ?? DEFAULT_OPERATORX_CATEGORY;
  return (
    <Tabs
      value={category}
      onValueChange={selectCategory}
      className="gap-4"
      data-testid="operatorx-page"
    >
      <Card>
        <DashboardSectionHeader
          headingAs="h1"
          title="OperatorX"
          qualifier={locale === 'zh' ? '实验性' : 'Experimental'}
        />
        <TabsList className="mt-4">
          {OPERATORX_CATEGORIES.map((c) => (
            <TabsTrigger key={c.slug} value={c.slug}>
              {c.label[locale]}
            </TabsTrigger>
          ))}
        </TabsList>
      </Card>
      {OPERATORX_CATEGORIES.map((c) => (
        <TabsContent key={c.slug} value={c.slug}>
          {c.slug === 'model'
            ? category === c.slug && <ModelViewTab />
            : category === c.slug && <ComparisonDashboard op={c.slug} />}
        </TabsContent>
      ))}
    </Tabs>
  );
}
