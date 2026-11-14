'use client';

import dynamic from 'next/dynamic';
import { usePathname } from 'next/navigation';
import type { MouseEvent } from 'react';

import { Card } from '@/components/ui/card';
import { DashboardSectionHeader } from '@/components/ui/dashboard-section-header';
import { IntentPrefetchLink } from '@/components/ui/intent-prefetch-link';
import { ShareButton } from '@/components/ui/share-button';
import { tabsTriggerClassName } from '@/components/ui/tabs';
import { useOperatorXModel } from '@/hooks/api/use-operatorx';
import { useClientPathname } from '@/hooks/useClientPathname';
import { useClientSearch } from '@/hooks/useClientSearch';
import { track } from '@/lib/analytics/analytics';
import { useLocale } from '@/lib/i18n/use-locale';
import { pushRouterPathname } from '@/lib/routing/client-navigation';
import {
  DEFAULT_OPERATORX_CATEGORY,
  DEFAULT_OPERATORX_MODEL,
  OPERATORX_CATEGORIES,
  operatorXCategoryForPathname,
  operatorXCategoryRouteForSelection,
  type OperatorXCategory,
} from '@/lib/routing/operatorx-category';

import { ComparisonDashboard } from './ComparisonDashboard';
import { ModelViewLoading } from './model-view/shell';

const ModelView = dynamic(() => import('./model-view/ModelView').then((mod) => mod.ModelView), {
  loading: ModelViewLoading,
});

/** Category switches drop the per-view filters; every other param carries over. */
const CATEGORY_SCOPED_PARAMS = ['workload', 'parallel'] as const;

/** Plain clicks swap the view in place; modified clicks fall through to the browser. */
function selectCategory(event: MouseEvent<HTMLAnchorElement>, category: OperatorXCategory) {
  if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)
    return;
  event.preventDefault();
  track('operatorx_category_selected', { category });
  pushRouterPathname(
    operatorXCategoryRouteForSelection(window.location.pathname, category),
    CATEGORY_SCOPED_PARAMS,
    { pageview: true },
  );
}

function ModelViewTab() {
  const search = new URLSearchParams(useClientSearch());
  const model = search.get('model') ?? DEFAULT_OPERATORX_MODEL;
  const parallel = search.get('parallel');
  const gemm = useOperatorXModel('gemm', model, parallel);
  const moe = useOperatorXModel('moe', model, parallel);
  const attention = useOperatorXModel('attention', model, parallel);
  return <ModelView gemm={gemm} moe={moe} attention={attention} />;
}

export default function OperatorXView() {
  const locale = useLocale();
  const pathname = useClientPathname(usePathname());
  const category: OperatorXCategory =
    operatorXCategoryForPathname(pathname) ?? DEFAULT_OPERATORX_CATEGORY;
  const search = new URLSearchParams(useClientSearch());
  for (const param of CATEGORY_SCOPED_PARAMS) search.delete(param);
  const qs = search.toString();
  return (
    <div className="flex flex-col gap-4" data-testid="operatorx-page">
      <Card>
        <DashboardSectionHeader
          headingAs="h1"
          title="OperatorX"
          qualifier={locale === 'zh' ? '实验性' : 'Experimental'}
          actions={<ShareButton />}
        />
        <nav
          aria-label={locale === 'zh' ? 'OperatorX 分类' : 'OperatorX categories'}
          className="mt-4 inline-flex flex-wrap items-end gap-1"
        >
          {OPERATORX_CATEGORIES.map((c) => {
            const active = category === c.slug;
            return (
              <IntentPrefetchLink
                key={c.slug}
                href={`${operatorXCategoryRouteForSelection(pathname, c.slug)}${qs ? `?${qs}` : ''}`}
                prefetch={active ? false : undefined}
                aria-current={active ? 'page' : undefined}
                data-state={active ? 'active' : 'inactive'}
                className={tabsTriggerClassName}
                onClick={(event) => selectCategory(event, c.slug)}
              >
                {c.label[locale]}
              </IntentPrefetchLink>
            );
          })}
        </nav>
      </Card>
      <div className="flex-1 pb-4">
        {category === 'model' ? (
          <ModelViewTab />
        ) : (
          <ComparisonDashboard key={category} op={category} />
        )}
      </div>
    </div>
  );
}
