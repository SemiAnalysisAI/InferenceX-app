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

export function SequenceSelector({
  id = 'sequence-select',
  value,
  onChange,
  open,
  onOpenChange,
  availableSequences,
  'data-testid': testId,
}: SequenceSelectorProps) {
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
