'use client';

import { Info } from 'lucide-react';

import { LabelWithTooltip } from '@/components/ui/label-with-tooltip';
import { track } from '@/lib/analytics';
import { MultiSelect } from '@/components/ui/multi-select';
import { TooltipContent, TooltipRoot, TooltipTrigger } from '@/components/ui/tooltip';
import {
  type Model,
  type Precision,
  type Sequence,
  getModelCategory,
  getModelLabel,
  getPrecisionLabel,
  getSequenceCategory,
  getSequenceLabel,
  groupByCategory,
} from '@/lib/data-mappings';

function DeprecatedSectionTitle({ reason }: { reason: string }) {
  return (
    <span className="flex items-center gap-1">
      Deprecated
      <TooltipRoot>
        <TooltipTrigger asChild>
          <Info className="size-3 text-muted-foreground cursor-help" />
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
    ...(groups.deprecated.length > 0
      ? [
          {
            id: 'deprecated',
            header: <DeprecatedSectionTitle reason="Model is no longer actively benchmarked." />,
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
      <LabelWithTooltip
        htmlFor={id}
        label="Model"
        tooltip="The language model being benchmarked."
      />
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

function buildSequenceSections(availableSequences: string[]) {
  const groups = groupByCategory(availableSequences, (s) => getSequenceCategory(s as Sequence));
  return [
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
              <DeprecatedSectionTitle reason="CI capacity was reallocated to agentic coding and multi-turn chat scenarios." />
            ),
            options: groups.deprecated.map((seq) => ({
              value: seq,
              label: getSequenceLabel(seq as Sequence),
            })),
          },
        ]
      : []),
  ];
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
  const sections = buildSequenceSections(availableSequences);

  return (
    <div className="flex flex-col space-y-1.5 lg:col-span-1">
      <LabelWithTooltip
        htmlFor={id}
        label="ISL / OSL"
        tooltip="Input Sequence Length / Output Sequence Length. Defines the number of input and output tokens for the benchmark (e.g., 1K/8K means 1,024 input tokens and 8,192 output tokens)."
      />
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

interface MultiSequenceSelectorProps {
  id?: string;
  /** Selected sequences, primary-first. minSelections=1 is enforced. */
  value: string[];
  onChange: (value: Sequence[]) => void;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  availableSequences: string[];
  maxSelections?: number;
  'data-testid'?: string;
}

/**
 * Sequence picker that allows multiple ISL/OSL selections so the inference
 * chart can overlay e.g. 1K/1K and 8K/1K as separate series on the same
 * axes. The first selected value is treated as the "primary" sequence by
 * the data pipeline; additional picks become `extraSequences` and each
 * (hw, sequence) row gets a synth hwKey so it lands in its own legend line.
 */
export function MultiSequenceSelector({
  id = 'sequence-multiselect',
  value,
  onChange,
  open,
  onOpenChange,
  availableSequences,
  maxSelections = 3,
  'data-testid': testId,
}: MultiSequenceSelectorProps) {
  const sections = buildSequenceSections(availableSequences);

  return (
    <div className="flex flex-col space-y-1.5 lg:col-span-1">
      <LabelWithTooltip
        htmlFor={id}
        label="ISL / OSL"
        tooltip="Input Sequence Length / Output Sequence Length. Pick more than one to overlay multiple shapes on the same chart (e.g. 1K/1K + 8K/1K) — each (GPU, sequence) becomes its own legend line."
      />
      <div>
        <MultiSelect
          sections={sections}
          value={value}
          onChange={(values) => {
            if (values.length === 0) return;
            track('selector_sequence_changed', { sequence: values.join(',') });
            onChange(values as Sequence[]);
          }}
          open={open}
          onOpenChange={onOpenChange}
          triggerId={id}
          triggerTestId={testId}
          placeholder="ISL / OSL"
          minSelections={1}
          maxSelections={maxSelections}
          showClearAll={false}
          searchable={false}
          showSelectionSummary={false}
        />
      </div>
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
  return (
    <div className="flex flex-col space-y-1.5 lg:col-span-1">
      <LabelWithTooltip
        htmlFor={id}
        label="Precision"
        tooltip="Numerical precision used for model weights. Lower precision like 'FP4' uses less memory and increases throughput but may slightly reduce accuracy compared to higher precisions like 'FP8'."
      />
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
