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
  getModelCategory,
  getModelLabel,
  getPrecisionLabel,
  getSequenceCategory,
  getSequenceLabel,
  groupByCategory,
  Model,
  Precision,
  Sequence,
} from '@/lib/data-mappings';

function DeprecatedLabel({ reason }: { reason: string }) {
  return (
    <SelectLabel>
      <span className="flex items-center gap-1">
        Deprecated
        <TooltipRoot>
          <TooltipTrigger asChild>
            <Info className="h-3 w-3 text-muted-foreground cursor-help" />
          </TooltipTrigger>
          <TooltipContent side="top" collisionPadding={10}>
            <span>{reason}</span>
          </TooltipContent>
        </TooltipRoot>
      </span>
    </SelectLabel>
  );
}

interface ModelSelectorProps {
  id?: string;
  value: string;
  onChange: (value: Model) => void;
  availableModels: string[];
  'data-testid'?: string;
}

export function ModelSelector({
  id = 'model-select',
  value,
  onChange,
  availableModels,
  'data-testid': testId,
}: ModelSelectorProps) {
  const groups = groupByCategory(availableModels, (m) => getModelCategory(m as Model));

  return (
    <div className="flex flex-col space-y-1.5 lg:col-span-2">
      <LabelWithTooltip
        htmlFor={id}
        label="Model"
        tooltip="The language model being benchmarked."
      />
      <Select
        value={value}
        onValueChange={(v) => {
          track('selector_model_changed', { model: v });
          onChange(v as Model);
        }}
      >
        <SelectTrigger id={id} data-testid={testId} className="w-full">
          <SelectValue placeholder="Model" />
        </SelectTrigger>
        <SelectContent>
          {groups.default.map((model) => (
            <SelectItem key={model} value={model}>
              {getModelLabel(model as Model)}
            </SelectItem>
          ))}
          {groups.experimental.length > 0 && (
            <SelectGroup>
              <SelectLabel>Experimental Support (WIP)</SelectLabel>
              {groups.experimental.map((model) => (
                <SelectItem key={model} value={model}>
                  {getModelLabel(model as Model)}
                </SelectItem>
              ))}
            </SelectGroup>
          )}
          {groups.deprecated.length > 0 && (
            <SelectGroup>
              <DeprecatedLabel reason="Model is no longer actively benchmarked." />
              {groups.deprecated.map((model) => (
                <SelectItem key={model} value={model}>
                  {getModelLabel(model as Model)}
                </SelectItem>
              ))}
            </SelectGroup>
          )}
        </SelectContent>
      </Select>
    </div>
  );
}

interface SequenceSelectorProps {
  id?: string;
  value: string;
  onChange: (value: Sequence) => void;
  availableSequences: string[];
  'data-testid'?: string;
}

export function SequenceSelector({
  id = 'sequence-select',
  value,
  onChange,
  availableSequences,
  'data-testid': testId,
}: SequenceSelectorProps) {
  const groups = groupByCategory(availableSequences, (s) => getSequenceCategory(s as Sequence));

  return (
    <div className="flex flex-col space-y-1.5 lg:col-span-1">
      <LabelWithTooltip
        htmlFor={id}
        label="ISL / OSL"
        tooltip="Input Sequence Length / Output Sequence Length. Defines the number of input and output tokens for the benchmark (e.g., 1K/8K means 1,024 input tokens and 8,192 output tokens)."
      />
      <Select
        value={value}
        onValueChange={(v) => {
          track('selector_sequence_changed', { sequence: v });
          onChange(v as Sequence);
        }}
      >
        <SelectTrigger id={id} data-testid={testId} className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {groups.default.map((seq) => (
            <SelectItem key={seq} value={seq}>
              {getSequenceLabel(seq as Sequence)}
            </SelectItem>
          ))}
          {groups.deprecated.length > 0 && (
            <SelectGroup>
              <DeprecatedLabel reason="CI capacity was reallocated to agentic coding and multi-turn chat scenarios." />
              {groups.deprecated.map((seq) => (
                <SelectItem key={seq} value={seq}>
                  {getSequenceLabel(seq as Sequence)}
                </SelectItem>
              ))}
            </SelectGroup>
          )}
        </SelectContent>
      </Select>
    </div>
  );
}

interface PrecisionSelectorProps {
  id?: string;
  value: string[];
  onChange: (value: string[]) => void;
  availablePrecisions: string[];
  'data-testid'?: string;
}

export function PrecisionSelector({
  id = 'precision-select',
  value,
  onChange,
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
      <div data-testid={testId}>
        <MultiSelect
          options={availablePrecisions.map((p) => ({
            value: p,
            label: getPrecisionLabel(p as Precision),
          }))}
          value={value}
          onChange={onChange}
          placeholder=""
          minSelections={1}
          showClearAll={false}
          searchable={false}
        />
      </div>
    </div>
  );
}
