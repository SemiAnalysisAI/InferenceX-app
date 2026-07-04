'use client';

import { Info } from 'lucide-react';

import { LabelWithTooltip } from '@/components/ui/label-with-tooltip';
import { track } from '@/lib/analytics';
import { MultiSelect } from '@/components/ui/multi-select';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { TooltipContent, TooltipRoot, TooltipTrigger } from '@/components/ui/tooltip';
import {
  type Model,
  type Precision,
  type Sequence,
  type Percentile,
  PERCENTILE_OPTIONS,
  getModelCategory,
  getModelLabel,
  getPercentileLabel,
  getPrecisionLabel,
  getSequenceCategory,
  getSequenceLabel,
  groupByCategory,
  sequenceKind,
} from '@/lib/data-mappings';
import { useLocale } from '@/lib/use-locale';

const STRINGS = {
  en: {
    model: 'Model',
    modelTooltip: 'The language model being benchmarked.',
    islOsl: 'ISL / OSL',
    islOslTooltip:
      'Input Sequence Length / Output Sequence Length. Defines the number of input and output tokens for the benchmark (e.g., 1K/8K means 1,024 input tokens and 8,192 output tokens).',
    scenario: 'Scenario',
    scenarioTooltip:
      'Benchmark scenario. Fixed Sequence Length runs use a defined input/output token count (ISL/OSL). Agentic Traces replay real agentic workloads with variable inputs/outputs.',
    latencyPercentile: 'Latency Percentile',
    latencyPercentileTooltip:
      'Percentile of the latency distribution used for the chart x-axis on agentic runs.',
    precision: 'Precision',
    precisionTooltip:
      "Numerical precision used for model weights. Lower precision like 'FP4' uses less memory and increases throughput but may slightly reduce accuracy compared to higher precisions like 'FP8'.",
  },
  zh: {
    model: '模型',
    modelTooltip: '正在进行基准测试的语言模型。',
    islOsl: 'ISL / OSL',
    islOslTooltip:
      '输入序列长度 / 输出序列长度（Input Sequence Length / Output Sequence Length）。定义基准测试的输入和输出 token 数量（如 1K/8K 表示 1,024 个输入 token 和 8,192 个输出 token）。',
    scenario: '场景',
    scenarioTooltip:
      '基准测试场景。Fixed Sequence Length 使用预设的输入/输出 token 数（ISL/OSL）。Agentic Traces 回放具有可变输入/输出的真实智能体工作负载。',
    latencyPercentile: '延迟分位数',
    latencyPercentileTooltip: '用于智能体运行图表 X 轴的延迟分布分位数。',
    precision: '精度',
    precisionTooltip:
      '模型权重的数值精度。FP4 等低精度占用更少显存并提高吞吐量，但与 FP8 等高精度相比可能略微降低准确度。',
  },
} as const;

function CategorySectionTitle({ label, reason }: { label: string; reason: string }) {
  return (
    <span className="flex items-center gap-1">
      {label}
      <TooltipRoot>
        <TooltipTrigger asChild>
          <Info
            className="size-3 text-muted-foreground cursor-help"
            data-testid={`selector-category-${label.toLowerCase().replaceAll(' ', '-')}-info`}
          />
        </TooltipTrigger>
        <TooltipContent side="top" collisionPadding={10}>
          <span>{reason}</span>
        </TooltipContent>
      </TooltipRoot>
    </span>
  );
}

interface ModelSelectorProps {
  id?: string;
  value: string;
  onChange: (value: Model) => void;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  availableModels: string[];
  'data-testid'?: string;
}

export function ModelSelector({
  id = 'model-select',
  value,
  onChange,
  open,
  onOpenChange,
  availableModels,
  'data-testid': testId,
}: ModelSelectorProps) {
  const t = STRINGS[useLocale()];
  const groups = groupByCategory(availableModels, (m) => getModelCategory(m as Model));
  const sections = [
    {
      id: 'default',
      options: groups.default.map((model) => ({
        value: model,
        label: getModelLabel(model as Model),
      })),
    },
    ...(groups.experimental.length > 0
      ? [
          {
            id: 'experimental',
            header: 'Experimental Support (WIP)',
            options: groups.experimental.map((model) => ({
              value: model,
              label: getModelLabel(model as Model),
            })),
          },
        ]
      : []),
    ...(groups.maintenance.length > 0
      ? [
          {
            id: 'maintenance',
            header: (
              <CategorySectionTitle
                label="Maintenance Mode"
                reason="Updated at a lower priority because these models are irrelevant."
              />
            ),
            options: groups.maintenance.map((model) => ({
              value: model,
              label: getModelLabel(model as Model),
            })),
          },
        ]
      : []),
    ...(groups.deprecated.length > 0
      ? [
          {
            id: 'deprecated',
            header: (
              <CategorySectionTitle
                label="Deprecated"
                reason="Model is no longer actively benchmarked."
              />
            ),
            options: groups.deprecated.map((model) => ({
              value: model,
              label: getModelLabel(model as Model),
            })),
          },
        ]
      : []),
  ];

  return (
    <div className="flex flex-col space-y-1.5 lg:col-span-2">
      <LabelWithTooltip htmlFor={id} label={t.model} tooltip={t.modelTooltip} />
      <div>
        <MultiSelect
          sections={sections}
          value={[value]}
          onChange={(values) => {
            const next = values[0];
            if (!next) return;
            track('selector_model_changed', { model: next });
            onChange(next as Model);
          }}
          open={open}
          onOpenChange={onOpenChange}
          triggerId={id}
          triggerTestId={testId}
          placeholder="Model"
          minSelections={1}
          maxSelections={1}
          showClearAll={false}
          searchable={false}
          plainSelectedText
          showSelectionSummary={false}
        />
      </div>
    </div>
  );
}

interface SequenceSelectorProps {
  id?: string;
  value: string;
  onChange: (value: Sequence) => void;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  availableSequences: string[];
  'data-testid'?: string;
}

export function SequenceSelector({
  id = 'sequence-select',
  value,
  onChange,
  open,
  onOpenChange,
  availableSequences,
  'data-testid': testId,
}: SequenceSelectorProps) {
  const t = STRINGS[useLocale()];
  const groups = groupByCategory(availableSequences, (s) => getSequenceCategory(s as Sequence));
  const sections = [
    {
      id: 'default',
      options: groups.default.map((seq) => ({
        value: seq,
        label: getSequenceLabel(seq as Sequence),
      })),
    },
    ...(groups.deprecated.length > 0
      ? [
          {
            id: 'deprecated',
            header: (
              <CategorySectionTitle
                label="Deprecated"
                reason="CI capacity was reallocated to agentic coding and multi-turn chat scenarios."
              />
            ),
            options: groups.deprecated.map((seq) => ({
              value: seq,
              label: getSequenceLabel(seq as Sequence),
            })),
          },
        ]
      : []),
  ];

  return (
    <div className="flex flex-col space-y-1.5 lg:col-span-1">
      <LabelWithTooltip htmlFor={id} label={t.islOsl} tooltip={t.islOslTooltip} />
      <div>
        <MultiSelect
          sections={sections}
          value={[value]}
          onChange={(values) => {
            const next = values[0];
            if (!next) return;
            track('selector_sequence_changed', { sequence: next });
            onChange(next as Sequence);
          }}
          open={open}
          onOpenChange={onOpenChange}
          triggerId={id}
          triggerTestId={testId}
          placeholder="ISL / OSL"
          minSelections={1}
          maxSelections={1}
          showClearAll={false}
          searchable={false}
          plainSelectedText
          showSelectionSummary={false}
        />
      </div>
    </div>
  );
}

interface ScenarioSelectorProps {
  id?: string;
  value: string;
  onChange: (value: Sequence) => void;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  availableSequences: string[];
  'data-testid'?: string;
}

/**
 * Scenario selector — fixed-seq-len rows grouped under "Fixed Sequence Length",
 * agentic-trace rows rendered flat below. Label is "Scenario" (the ISL/OSL
 * framing only applies to the fixed-seq subset).
 */
export function ScenarioSelector({
  id = 'scenario-select',
  value,
  onChange,
  open,
  onOpenChange,
  availableSequences,
  'data-testid': testId,
}: ScenarioSelectorProps) {
  const t = STRINGS[useLocale()];
  const fixedSeq = availableSequences.filter((s) => sequenceKind(s as Sequence) === 'fixed-seq');
  const agentic = availableSequences.filter((s) => sequenceKind(s as Sequence) === 'agentic');
  const fixedGroups = groupByCategory(fixedSeq, (s) => getSequenceCategory(s as Sequence));

  return (
    <div className="flex flex-col space-y-1.5 lg:col-span-1">
      <LabelWithTooltip htmlFor={id} label={t.scenario} tooltip={t.scenarioTooltip} />
      <Select
        value={value}
        onValueChange={(v) => {
          track('selector_scenario_changed', { scenario: v });
          onChange(v as Sequence);
        }}
        open={open}
        onOpenChange={onOpenChange}
      >
        <SelectTrigger id={id} data-testid={testId} className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {/* Agentic first — preferred default scenario when available. */}
          {agentic.length > 0 && (
            <SelectGroup>
              <SelectLabel>Agentic</SelectLabel>
              {agentic.map((seq) => (
                <SelectItem key={seq} value={seq}>
                  {getSequenceLabel(seq as Sequence)}
                </SelectItem>
              ))}
            </SelectGroup>
          )}
          {fixedSeq.length > 0 && (
            <SelectGroup>
              <SelectLabel>Fixed Sequence Length</SelectLabel>
              {fixedGroups.default.map((seq) => (
                <SelectItem key={seq} value={seq}>
                  {getSequenceLabel(seq as Sequence)}
                </SelectItem>
              ))}
              {fixedGroups.deprecated.length > 0 && (
                <>
                  <SelectLabel>
                    <CategorySectionTitle
                      label="Deprecated"
                      reason="CI capacity was reallocated to agentic coding and multi-turn chat scenarios."
                    />
                  </SelectLabel>
                  {fixedGroups.deprecated.map((seq) => (
                    <SelectItem key={seq} value={seq}>
                      {getSequenceLabel(seq as Sequence)}
                    </SelectItem>
                  ))}
                </>
              )}
            </SelectGroup>
          )}
        </SelectContent>
      </Select>
    </div>
  );
}

interface PercentileSelectorProps {
  id?: string;
  value: string;
  onChange: (value: Percentile) => void;
  'data-testid'?: string;
}

/**
 * Latency percentile selector for agentic-trace charts. The selected value
 * rewrites the chart x-axis metric from `median_*` to `{percentile}_*`, so
 * picking p99 plots p99 e2e latency / interactivity instead of the median.
 */
export function PercentileSelector({
  id = 'percentile-select',
  value,
  onChange,
  'data-testid': testId,
}: PercentileSelectorProps) {
  const t = STRINGS[useLocale()];
  return (
    <div className="flex flex-col space-y-1.5 lg:col-span-1">
      <LabelWithTooltip
        htmlFor={id}
        label={t.latencyPercentile}
        tooltip={t.latencyPercentileTooltip}
      />
      <Select
        value={value}
        onValueChange={(v) => {
          track('selector_percentile_changed', { percentile: v });
          onChange(v as Percentile);
        }}
      >
        <SelectTrigger id={id} data-testid={testId} className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {PERCENTILE_OPTIONS.map((p) => (
            <SelectItem key={p} value={p}>
              {getPercentileLabel(p)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

interface PrecisionSelectorProps {
  id?: string;
  value: string[];
  onChange: (value: string[]) => void;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  availablePrecisions: string[];
  'data-testid'?: string;
}

export function PrecisionSelector({
  id = 'precision-select',
  value,
  onChange,
  open,
  onOpenChange,
  availablePrecisions,
  'data-testid': testId,
}: PrecisionSelectorProps) {
  const t = STRINGS[useLocale()];
  return (
    <div className="flex flex-col space-y-1.5 lg:col-span-1">
      <LabelWithTooltip htmlFor={id} label={t.precision} tooltip={t.precisionTooltip} />
      <div>
        <MultiSelect
          options={availablePrecisions.map((p) => ({
            value: p,
            label: getPrecisionLabel(p as Precision),
          }))}
          value={value}
          onChange={onChange}
          open={open}
          onOpenChange={onOpenChange}
          triggerId={id}
          triggerTestId={testId}
          placeholder=""
          minSelections={1}
          showClearAll={false}
          searchable={false}
        />
      </div>
    </div>
  );
}
