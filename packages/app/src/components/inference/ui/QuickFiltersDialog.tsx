'use client';

import { Info, ListFilter } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import type { DeploymentMode, SpecMode } from '@/components/inference/types';
import type { PowerTier } from '@/lib/power-tier';
import { FRAMEWORK_FAMILIES } from '@/components/inference/utils/quickFilters';

import {
  useInferenceActions,
  useInferenceData,
  useInferenceFilters,
} from '@/components/inference/InferenceContext';
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
import { Label } from '@/components/ui/label';
import { MultiSelect } from '@/components/ui/multi-select';

const STRINGS = {
  en: {
    title: 'Quick Filters',
    description:
      'Narrow the chart by chip vendor, serving framework, deployment mode, speculative decoding, and power-measurement status. Selecting none in a group shows all.',
    agenticDescription:
      'Narrow the chart by chip vendor, serving framework, deployment mode, and power-measurement status. Selecting none in a group shows all.',
    selected: 'selected',
    all: 'All',
    bestPerSku: 'Best per SKU',
    bestPerSkuHint: 'Show only the best configuration for each chip',
    vendor: 'Vendor',
    framework: 'Framework',
    deployment: 'Deployment',
    singleNode: 'Single-node',
    multiNode: 'Multi-node',
    disaggregated: 'Disaggregated',
    specDecoding: 'Spec Decoding',
    power: 'Measured Power',
    certified: 'Validated',
    legacyTier: 'Historical',
    powerHelpLabel: 'About validated and historical power measurements',
    validatedTitle: 'Validated measurement',
    validatedDescription:
      'GPU power was recorded from runner telemetry using the current PowerX method and passed checks for benchmark-window coverage, expected GPU count, sample quality, and the energy definition.',
    historicalTitle: 'Historical measurement',
    historicalDescription:
      "Real GPU telemetry from an older run, but the record lacks information needed to confirm it meets today's method. This does not mean the measurement is wrong.",
    powerDefault:
      'Both are shown by default. Measurements that failed validation are not displayed.',
    noData: 'No data for the current selection',
    clear: 'Clear filters',
    done: 'Done',
  },
  zh: {
    title: '快捷筛选',
    description:
      '按芯片厂商、推理框架、部署模式、投机解码和功耗测量状态筛选图表。某组不选则显示全部。',
    agenticDescription:
      '按芯片厂商、推理框架、部署模式和功耗测量状态筛选图表。某组不选则显示全部。',
    selected: '项已选',
    all: '全部',
    bestPerSku: '每个 SKU 仅显示最佳配置',
    bestPerSkuHint: '每款芯片只显示表现最佳的配置',
    vendor: '厂商',
    framework: '框架',
    deployment: '部署模式',
    singleNode: '单节点',
    multiNode: '多节点聚合',
    disaggregated: '分离式',
    specDecoding: '投机解码',
    power: '实测功耗',
    certified: '已验证',
    legacyTier: '历史测量',
    powerHelpLabel: '了解已验证测量与历史测量',
    validatedTitle: '已验证测量',
    validatedDescription:
      '采用当前 PowerX 方法记录运行节点的 GPU 遥测功耗，并通过了基准测试时段覆盖率、预期 GPU 数量、采样质量和能耗定义检查。',
    historicalTitle: '历史测量',
    historicalDescription:
      '旧版运行产生的真实 GPU 遥测数据，但记录缺少按当前方法完成验证所需的信息。这并不表示测量结果有误。',
    powerDefault: '默认同时显示两类测量；未通过验证的测量不会显示。',
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
const POWER_TIERS: PowerTier[] = ['certified', 'legacy'];

export function QuickFiltersDialog({
  open,
  onOpenChange,
  bestPerSku,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Optional Best per SKU control (scatter chart only) — the chart owns the
   * toggle logic because overlay mode manages a temporary unified selection. */
  bestPerSku?: { checked: boolean; onCheckedChange: (checked: boolean) => void };
}) {
  const locale = useLocale();
  const t = STRINGS[locale];
  const {
    setQuickFilterVendors,
    setQuickFilterFrameworks,
    setQuickFilterDeployment,
    setQuickFilterSpec,
    setQuickFilterPower,
  } = useInferenceActions();
  const { selectedSequence, quickFilters } = useInferenceFilters();
  const { availableQuickFilters } = useInferenceData();
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
    key: 'vendor' | 'framework' | 'deployment' | 'spec' | 'power';
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
    // Shown for agentic too — the options auto-disable when no measured
    // telemetry exists for the current selection.
    {
      key: 'power' as const,
      label: t.power,
      options: POWER_TIERS.map((value) => ({
        value,
        label: value === 'certified' ? t.certified : t.legacyTier,
        available: availableQuickFilters.power.includes(value),
      })),
      selected: quickFilters.power,
    },
  ];

  const selectedCount = groups.reduce((count, group) => count + group.selected.length, 0);

  const handleGroupChange = (
    category: 'vendor' | 'framework' | 'deployment' | 'spec' | 'power',
    values: string[],
  ) => {
    const previous =
      category === 'vendor'
        ? quickFilters.vendors
        : category === 'framework'
          ? quickFilters.frameworks
          : category === 'deployment'
            ? quickFilters.deployment
            : category === 'power'
              ? quickFilters.power
              : quickFilters.spec;
    const changed = new Set([...previous, ...values]);
    for (const value of changed) {
      const wasActive = previous.includes(value);
      const isActive = values.includes(value);
      if (wasActive !== isActive) {
        track('inference_quick_filter_toggled', { category, value, active: isActive });
      }
    }
    if (category === 'vendor') setQuickFilterVendors(values);
    else if (category === 'framework') setQuickFilterFrameworks(values);
    else if (category === 'deployment') setQuickFilterDeployment(values as DeploymentMode[]);
    else if (category === 'power') setQuickFilterPower(values as PowerTier[]);
    else setQuickFilterSpec(values as SpecMode[]);
  };

  const clearFilters = () => {
    setQuickFilterVendors([]);
    setQuickFilterFrameworks([]);
    setQuickFilterDeployment([]);
    setQuickFilterSpec([]);
    setQuickFilterPower([]);
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
                className="rounded-full bg-brand/10 px-2 py-0.5 text-2xs font-medium text-brand"
                data-testid="quick-filters-selected-count"
              >
                {selectedCount} {t.selected}
              </span>
            )}
          </DialogTitle>
          <DialogDescription>{isAgentic ? t.agenticDescription : t.description}</DialogDescription>
        </DialogHeader>

        <div className="divide-y divide-border rounded-md border">
          {bestPerSku && (
            <section className="flex items-center justify-between gap-3 px-3 py-3">
              <div>
                <h3 className="text-xs font-semibold text-muted-foreground">{t.bestPerSku}</h3>
                <p className="mt-0.5 text-2xs text-muted-foreground/70">{t.bestPerSkuHint}</p>
              </div>
              <Switch
                data-testid="quick-filter-best-per-sku"
                checked={bestPerSku.checked}
                onCheckedChange={bestPerSku.onCheckedChange}
                aria-label={t.bestPerSku}
              />
            </section>
          )}
          {groups.map((group) => (
            <section
              key={group.key}
              className="grid gap-2 px-3 py-3 sm:grid-cols-[7rem_1fr] sm:items-start"
            >
              <div className="flex items-center gap-1 pt-1">
                <Label htmlFor={`quick-filter-${group.key}-select`}>{group.label}</Label>
                {group.key === 'power' && (
                  <Popover>
                    <PopoverTrigger asChild>
                      <button
                        type="button"
                        aria-label={t.powerHelpLabel}
                        data-testid="measured-power-help"
                        className="inline-flex size-5 items-center justify-center rounded-full text-muted-foreground/70 transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none"
                      >
                        <Info className="size-3.5" aria-hidden="true" />
                      </button>
                    </PopoverTrigger>
                    <PopoverContent align="start" className="w-80 space-y-3 text-xs">
                      <div>
                        <p className="font-semibold text-foreground">{t.validatedTitle}</p>
                        <p className="mt-1 text-muted-foreground">{t.validatedDescription}</p>
                      </div>
                      <div>
                        <p className="font-semibold text-foreground">{t.historicalTitle}</p>
                        <p className="mt-1 text-muted-foreground">{t.historicalDescription}</p>
                      </div>
                      <p className="border-t pt-2 text-muted-foreground">{t.powerDefault}</p>
                    </PopoverContent>
                  </Popover>
                )}
              </div>
              <MultiSelect
                options={group.options.map((option) => ({
                  value: option.value,
                  label: option.label,
                  disabled: !option.available && !group.selected.includes(option.value),
                  title: option.available ? undefined : t.noData,
                  testId: `quick-filter-${group.key}-${option.value}`,
                }))}
                value={[...group.selected]}
                onChange={(values) => handleGroupChange(group.key, values)}
                placeholder={t.all}
                ariaLabel={group.label}
                triggerId={`quick-filter-${group.key}-select`}
                triggerTestId={`quick-filter-${group.key}-select`}
                searchable={false}
                plainSelectedText
                showSelectionSummary={false}
                showClearAll={false}
              />
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
