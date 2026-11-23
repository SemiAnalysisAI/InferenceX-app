'use client';

import { usePathname } from 'next/navigation';
import type { MouseEvent, ReactNode } from 'react';

import { Card } from '@/components/ui/card';
import { DashboardSectionHeader } from '@/components/ui/dashboard-section-header';
import { IntentPrefetchLink } from '@/components/ui/intent-prefetch-link';
import { LabelWithTooltip } from '@/components/ui/label-with-tooltip';
import { ShareButton } from '@/components/ui/share-button';
import { tabsTriggerClassName } from '@/components/ui/tabs';
import { useClientPathname } from '@/hooks/useClientPathname';
import { useClientSearch } from '@/hooks/useClientSearch';
import { track } from '@/lib/analytics/analytics';
import { useLocale } from '@/lib/i18n/use-locale';
import { pushRouterPathname } from '@/lib/routing/client-navigation';
import {
  DEFAULT_OPERATORX_CATEGORY,
  OPERATORX_CATEGORIES,
  operatorXCategoryForPathname,
  operatorXCategoryRouteForSelection,
  type OperatorXCategory,
} from '@/lib/routing/operatorx-category';

/** Category switches drop the per-view filters; every other param carries over. */
const CATEGORY_SCOPED_PARAMS = ['workload', 'parallel'] as const;

/**
 * Plain clicks swap the view in place; modified clicks fall through to the browser. Re-clicking
 * the current category is a no-op, so it keeps the view's filters.
 */
function selectCategory(
  event: MouseEvent<HTMLAnchorElement>,
  category: OperatorXCategory,
  active: boolean,
) {
  if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)
    return;
  event.preventDefault();
  if (active) return;
  track('operatorx_category_selected', { category });
  pushRouterPathname(
    operatorXCategoryRouteForSelection(window.location.pathname, category),
    CATEGORY_SCOPED_PARAMS,
    { pageview: true },
  );
}

export function useOperatorXCategory(): OperatorXCategory {
  return (
    operatorXCategoryForPathname(useClientPathname(usePathname())) ?? DEFAULT_OPERATORX_CATEGORY
  );
}

/**
 * The page's header card, laid out like the inference page's: title, the category tabs, then
 * the current view's controls. It stacks above the Model View's sticky GPU row (z-20), so the
 * model dropdown opens over it.
 */
export function OperatorXHeader({ children }: { children?: ReactNode }) {
  const locale = useLocale();
  const pathname = useClientPathname(usePathname());
  const category = useOperatorXCategory();
  const search = new URLSearchParams(useClientSearch());
  for (const param of CATEGORY_SCOPED_PARAMS) search.delete(param);
  const qs = search.toString();
  return (
    <Card className="relative z-30">
      <div className="flex flex-col gap-4">
        <DashboardSectionHeader
          headingAs="h1"
          title="OperatorX"
          qualifier={locale === 'zh' ? '实验性' : 'Experimental'}
          actions={<ShareButton />}
        />
        <nav
          aria-label={locale === 'zh' ? 'OperatorX 分类' : 'OperatorX categories'}
          className="inline-flex flex-wrap items-end gap-1"
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
                onClick={(event) => selectCategory(event, c.slug, active)}
              >
                {c.label[locale]}
              </IntentPrefetchLink>
            );
          })}
        </nav>
        {children}
      </div>
    </Card>
  );
}

/** One control in the header's control panel: its label with `?` help, then the control. */
export function ControlGroup({
  label,
  tooltip,
  htmlFor,
  children,
}: {
  label: string;
  tooltip: string;
  htmlFor?: string;
  children: ReactNode;
}) {
  return (
    <div className="min-w-0 space-y-1.5">
      <LabelWithTooltip htmlFor={htmlFor} label={label} tooltip={tooltip} />
      {children}
    </div>
  );
}
