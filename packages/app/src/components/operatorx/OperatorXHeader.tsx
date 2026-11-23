'use client';

import { usePathname } from 'next/navigation';
import { type MouseEvent, type ReactNode, useMemo } from 'react';

import { ModelArchitectureInfoLink } from '@/components/inference/ui/ModelArchitectureInfoLink';
import { Card } from '@/components/ui/card';
import { ModelSelector } from '@/components/ui/chart-selectors';
import { DashboardSectionHeader } from '@/components/ui/dashboard-section-header';
import { IntentPrefetchLink } from '@/components/ui/intent-prefetch-link';
import { LabelWithTooltip } from '@/components/ui/label-with-tooltip';
import { ShareButton } from '@/components/ui/share-button';
import { tabsTriggerClassName } from '@/components/ui/tabs';
import { TooltipProvider } from '@/components/ui/tooltip';
import { useAvailability } from '@/hooks/api/use-availability';
import { useClientPathname } from '@/hooks/useClientPathname';
import { useClientSearch } from '@/hooks/useClientSearch';
import { track } from '@/lib/analytics/analytics';
import { type Model, isRegisteredModel } from '@/lib/catalog/data-mappings';
import { AGENTX_NEW_MODEL_DISPLAY_NAMES } from '@/lib/compare/compare-agentx';
import { useLocale } from '@/lib/i18n/use-locale';
import { pushRouterPathname } from '@/lib/routing/client-navigation';
import {
  DEFAULT_OPERATORX_CATEGORY,
  OPERATORX_CATEGORIES,
  operatorXCategoryForPathname,
  operatorXCategoryRouteForSelection,
  type OperatorXCategory,
} from '@/lib/routing/operatorx-category';
import { useFeatureGate } from '@/lib/runtime/use-feature-gate';
import { cn } from '@/lib/shared/utils';
import { resolveAvailableModels, selectableInferenceModels } from '@/providers/GlobalFilterContext';

const STRINGS = {
  en: {
    categories: 'OperatorX categories',
    experimental: 'Experimental',
    other: 'Other',
    otherReason: 'Operator shape lists that do not come from one model.',
  },
  zh: {
    categories: 'OperatorX 分类',
    experimental: '实验性',
    other: '其他',
    otherReason: '不来自单个模型的算子形状列表。',
  },
};

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
      <TooltipProvider delayDuration={0}>
        <div className="flex flex-col gap-4">
          <DashboardSectionHeader
            headingAs="h1"
            title="OperatorX"
            qualifier={STRINGS[locale].experimental}
            actions={<ShareButton />}
          />
          <nav
            aria-label={STRINGS[locale].categories}
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
      </TooltipProvider>
    </Card>
  );
}

/** One control in the header's control panel: its label with `?` help, then the control. */
export function ControlGroup({
  label,
  tooltip,
  htmlFor,
  className,
  children,
}: {
  label: string;
  tooltip: string;
  htmlFor?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn('min-w-0 space-y-1.5', className)}>
      <LabelWithTooltip htmlFor={htmlFor} label={label} tooltip={tooltip} />
      {children}
    </div>
  );
}

/** The InferenceX models the page lists: the inference page's selector list, in its order. */
export function useOperatorXModels(): string[] {
  const { data: availability } = useAvailability();
  const unlocked = useFeatureGate();
  return useMemo(
    () => selectableInferenceModels(resolveAvailableModels(availability, [], unlocked), unlocked),
    [availability, unlocked],
  );
}

/** The inference page's model selector, with any non-model choices in a trailing section. */
export function OperatorXModelSelector({
  id,
  value,
  models,
  other = [],
  onChange,
}: {
  id: string;
  value: string;
  models: string[];
  other?: readonly string[];
  onChange: (model: string) => void;
}) {
  const locale = useLocale();
  return (
    <ModelSelector
      id={id}
      value={value}
      onChange={onChange}
      availableModels={models}
      data-testid={id}
      trailing={
        isRegisteredModel(value) ? (
          <ModelArchitectureInfoLink model={value as Model} locale={locale} />
        ) : undefined
      }
      newModels={AGENTX_NEW_MODEL_DISPLAY_NAMES}
      extraSection={{
        label: STRINGS[locale].other,
        reason: STRINGS[locale].otherReason,
        options: other,
      }}
    />
  );
}
