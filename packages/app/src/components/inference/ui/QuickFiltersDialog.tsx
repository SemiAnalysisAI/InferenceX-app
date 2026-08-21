'use client';

import { ListFilter } from 'lucide-react';

import { useInference } from '@/components/inference/InferenceContext';
import type { DeploymentMode, SpecMode } from '@/components/inference/types';
import { FRAMEWORK_FAMILIES } from '@/components/inference/utils/quickFilters';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { track } from '@/lib/analytics';
import { Sequence } from '@/lib/data-mappings';
import { useLocale } from '@/lib/use-locale';
import { cn } from '@/lib/utils';

const STRINGS = {
  en: {
    title: 'Quick Filters',
    description:
      'Narrow the chart by chip vendor, serving framework, deployment mode, and speculative decoding. Selecting none in a group shows all.',
    agenticDescription:
      'Narrow the chart by chip vendor, serving framework, and deployment mode. Selecting none in a group shows all.',
    selected: 'selected',
    vendor: 'Vendor',
    framework: 'Framework',
    deployment: 'Deployment',
    singleNode: 'Single-node',
    multiNode: 'Multi-node',
    disaggregated: 'Disaggregated',
    specDecoding: 'Spec Decoding',
    noData: 'No data for the current selection',
    clear: 'Clear filters',
    done: 'Done',
  },
  zh: {
    title: '快捷筛选',
    description: '按 Chip 厂商、推理框架、部署模式和投机解码筛选图表。某组不选则显示全部。',
    agenticDescription: '按 Chip 厂商、推理框架和部署模式筛选图表。某组不选则显示全部。',
    selected: '项已选',
    vendor: '厂商',
    framework: '框架',
    deployment: '部署模式',
    singleNode: '单节点',
    multiNode: '多节点聚合',
    disaggregated: '分离式',
    specDecoding: '投机解码',
    noData: '当前选择无可用数据',
    clear: '清除筛选',
    done: '完成',
  },
} as const;

const VENDORS = [
  { value: 'NVIDIA', label: 'NVIDIA' },
  { value: 'AMD', label: 'AMD' },
] as const;
const DEPLOYMENT_MODES: DeploymentMode[] = ['single-node', 'multi-node', 'disagg'];
const SPEC_MODES: { value: SpecMode; label: string }[] = [
  { value: 'mtp', label: 'MTP' },
  { value: 'stp', label: 'STP' },
];

function toggleValue<T extends string>(current: T[], value: T): T[] {
  return current.includes(value) ? current.filter((item) => item !== value) : [...current, value];
}

export function QuickFiltersDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const locale = useLocale();
  const t = STRINGS[locale];
  const {
    selectedSequence,
    quickFilters,
    availableQuickFilters,
    setQuickFilterVendors,
    setQuickFilterFrameworks,
    setQuickFilterDeployment,
    setQuickFilterSpec,
  } = useInference();
  const isAgentic = selectedSequence === Sequence.AgenticTraces;

  const frameworkOptions = FRAMEWORK_FAMILIES.filter(
    (framework) =>
      availableQuickFilters.frameworks.includes(framework.key) ||
      quickFilters.frameworks.includes(framework.key),
  ).map((framework) => ({
    value: framework.key,
    label: framework.label,
    available: availableQuickFilters.frameworks.includes(framework.key),
  }));

  const groups: {
    key: 'vendor' | 'framework' | 'deployment' | 'spec';
    label: string;
    options: readonly { value: string; label: string; available: boolean }[];
    selected: readonly string[];
  }[] = [
    {
      key: 'vendor',
      label: t.vendor,
      options: VENDORS.map((option) => ({
        ...option,
        available: availableQuickFilters.vendors.includes(option.value),
      })),
      selected: quickFilters.vendors,
    },
    ...(frameworkOptions.length > 0
      ? [
          {
            key: 'framework' as const,
            label: t.framework,
            options: frameworkOptions,
            selected: quickFilters.frameworks,
          },
        ]
      : []),
    {
      key: 'deployment',
      label: t.deployment,
      options: DEPLOYMENT_MODES.map((value) => ({
        value,
        label:
          value === 'single-node'
            ? t.singleNode
            : value === 'multi-node'
              ? t.multiNode
              : t.disaggregated,
        available: availableQuickFilters.deployment.includes(value),
      })),
      selected: quickFilters.deployment,
    },
    ...(isAgentic
      ? []
      : [
          {
            key: 'spec' as const,
            label: t.specDecoding,
            options: SPEC_MODES.map((option) => ({
              ...option,
              available: availableQuickFilters.spec.includes(option.value),
            })),
            selected: quickFilters.spec,
          },
        ]),
  ];

  const selectedCount = groups.reduce((count, group) => count + group.selected.length, 0);

  const handleToggle = (
    category: 'vendor' | 'framework' | 'deployment' | 'spec',
    value: string,
  ) => {
    const wasActive =
      category === 'vendor'
        ? quickFilters.vendors.includes(value)
        : category === 'framework'
          ? quickFilters.frameworks.includes(value)
          : category === 'deployment'
            ? quickFilters.deployment.includes(value as DeploymentMode)
            : quickFilters.spec.includes(value as SpecMode);
    if (category === 'vendor') setQuickFilterVendors(toggleValue(quickFilters.vendors, value));
    else if (category === 'framework')
      setQuickFilterFrameworks(toggleValue(quickFilters.frameworks, value));
    else if (category === 'deployment')
      setQuickFilterDeployment(toggleValue(quickFilters.deployment, value as DeploymentMode));
    else setQuickFilterSpec(toggleValue(quickFilters.spec, value as SpecMode));
    track('inference_quick_filter_toggled', { category, value, active: !wasActive });
  };

  const clearFilters = () => {
    setQuickFilterVendors([]);
    setQuickFilterFrameworks([]);
    setQuickFilterDeployment([]);
    setQuickFilterSpec([]);
    track('inference_quick_filters_cleared', { source: 'dialog' });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-h-[85vh] overflow-y-auto sm:max-w-xl"
        data-testid="quick-filters-dialog"
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ListFilter className="size-4 text-brand" />
            {t.title}
            {selectedCount > 0 && (
              <span
                className="rounded-full bg-brand/10 px-2 py-0.5 text-[11px] font-medium text-brand"
                data-testid="quick-filters-selected-count"
              >
                {selectedCount} {t.selected}
              </span>
            )}
          </DialogTitle>
          <DialogDescription>{isAgentic ? t.agenticDescription : t.description}</DialogDescription>
        </DialogHeader>

        <div className="divide-y divide-border rounded-md border">
          {groups.map((group) => (
            <section
              key={group.key}
              className="grid gap-2 px-3 py-3 sm:grid-cols-[7rem_1fr] sm:items-start"
            >
              <h3 className="pt-1 text-xs font-semibold text-muted-foreground">{group.label}</h3>
              <div className="flex flex-wrap gap-1.5">
                {group.options.map((option) => {
                  const active = group.selected.includes(option.value);
                  const disabled = !option.available && !active;
                  return (
                    <Button
                      key={option.value}
                      type="button"
                      size="sm"
                      variant={active ? 'default' : 'outline'}
                      aria-pressed={active}
                      disabled={disabled}
                      title={disabled ? t.noData : undefined}
                      className={cn(
                        'h-7 rounded-full px-3 text-xs',
                        active && 'bg-brand hover:bg-brand/90',
                      )}
                      data-testid={`quick-filter-${group.key}-${option.value}`}
                      onClick={() => handleToggle(group.key, option.value)}
                    >
                      {option.label}
                    </Button>
                  );
                })}
              </div>
            </section>
          ))}
        </div>

        <DialogFooter className="flex-row justify-between sm:justify-between">
          <Button
            type="button"
            variant="ghost"
            disabled={selectedCount === 0}
            onClick={clearFilters}
          >
            {t.clear}
          </Button>
          <DialogClose asChild>
            <Button type="button">{t.done}</Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
