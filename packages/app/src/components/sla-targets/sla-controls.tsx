'use client';

import { useEffect, useId, useState } from 'react';

import { SLA_EXAMPLE_TARGETS, type SlaTargets } from '@semianalysisai/inferencex-constants';

import { ControlPanel } from '@/components/ui/control-panel';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { LabelWithTooltip } from '@/components/ui/label-with-tooltip';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { track } from '@/lib/analytics/analytics';
import { SLA_AGENTIC_WORKLOAD } from '@/lib/sla-targets/dataset';
import { SLA_MAX_TARGET_MS } from '@/lib/sla-targets/evaluation';
import {
  attainmentFraction,
  attainmentPercent,
  parseTargetInput,
  SLA_ATTAINMENT_PERCENT_RANGE,
  SLA_DEFAULT_E2E_S,
  type SlaCostTier,
} from '@/lib/sla-targets/state';

import type { SlaStrings } from './sla-strings';

/**
 * A free numeric field. The typed text is kept as typed; the value is
 * committed only when it is a usable number, and is never rounded or snapped.
 */
function TargetField({
  id,
  label,
  help,
  value,
  max,
  invalidLabel,
  disabled,
  onCommit,
  testId,
}: {
  id: string;
  label: string;
  help: string;
  value: number;
  max: number;
  invalidLabel: string;
  disabled?: boolean;
  onCommit: (value: number) => void;
  testId: string;
}) {
  const [text, setText] = useState(String(value));
  useEffect(() => {
    setText((current) => (parseTargetInput(current, max) === value ? current : String(value)));
  }, [value, max]);
  const invalid = !disabled && parseTargetInput(text, max) === null;
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <LabelWithTooltip htmlFor={id} label={label} tooltip={help} />
      <Input
        id={id}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        value={text}
        disabled={disabled}
        aria-invalid={invalid}
        aria-describedby={invalid ? `${id}-error` : undefined}
        data-testid={testId}
        onChange={(event) => {
          setText(event.target.value);
          const parsed = parseTargetInput(event.target.value, max);
          if (parsed !== null) onCommit(parsed);
        }}
        onBlur={() => {
          if (parseTargetInput(text, max) === null) setText(String(value));
        }}
      />
      {invalid && (
        <p id={`${id}-error`} className="text-xs text-destructive">
          {invalidLabel}
        </p>
      )}
    </div>
  );
}

export function SlaControls({
  t,
  models,
  model,
  workloads,
  workload,
  targets,
  costTier,
  onModelChange,
  onWorkloadChange,
  onTargetsChange,
  onCostTierChange,
}: {
  t: SlaStrings;
  models: string[];
  model: string;
  workloads: string[];
  workload: string;
  targets: SlaTargets;
  costTier: SlaCostTier;
  onModelChange: (model: string) => void;
  onWorkloadChange: (workload: string) => void;
  onTargetsChange: (targets: SlaTargets) => void;
  onCostTierChange: (tier: SlaCostTier) => void;
}) {
  const id = useId();
  const [attainmentText, setAttainmentText] = useState(
    String(attainmentPercent(targets.requiredAttainment)),
  );
  useEffect(() => {
    const percent = attainmentPercent(targets.requiredAttainment);
    setAttainmentText((current) => (Number(current) === percent ? current : String(percent)));
  }, [targets.requiredAttainment]);
  const e2eOn = targets.maxE2eS !== null;
  const workloadLabel = (value: string) =>
    value === SLA_AGENTIC_WORKLOAD ? t.workloadAgentic : t.workloadFixed(value);

  return (
    <ControlPanel
      legend={t.controlsLegend}
      data-testid="sla-controls"
      className="grid-cols-2 gap-x-4 gap-y-3 md:grid-cols-3 lg:grid-cols-6"
    >
      <div className="col-span-2 flex min-w-0 flex-col gap-1.5 md:col-span-1 lg:col-span-2">
        <Label htmlFor={`${id}-model`}>{t.model}</Label>
        <Select
          value={model}
          onValueChange={(next) => {
            onModelChange(next);
            track('sla_targets_model_changed', { model: next });
          }}
        >
          <SelectTrigger id={`${id}-model`} data-testid="sla-model-select" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {models.map((option) => (
              <SelectItem key={option} value={option}>
                {option}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {workloads.length > 1 && (
        <div className="col-span-2 flex min-w-0 flex-col gap-1.5 md:col-span-1 lg:col-span-2">
          <Label htmlFor={`${id}-workload`}>{t.workload}</Label>
          <Select
            value={workload}
            onValueChange={(next) => {
              onWorkloadChange(next);
              track('sla_targets_workload_changed', { workload: next });
            }}
          >
            <SelectTrigger
              id={`${id}-workload`}
              data-testid="sla-workload-select"
              className="w-full"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {workloads.map((option) => (
                <SelectItem key={option} value={option}>
                  {workloadLabel(option)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
      <div className="col-span-2 flex min-w-0 flex-col gap-1.5 md:col-span-1 lg:col-span-2">
        <Label htmlFor={`${id}-cost`}>{t.costBasis}</Label>
        <Select
          value={costTier}
          onValueChange={(next) => {
            onCostTierChange(next as SlaCostTier);
            track('sla_targets_cost_basis_changed', { cost_basis: next });
          }}
        >
          <SelectTrigger id={`${id}-cost`} data-testid="sla-cost-select" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="hyperscaler">{t.costHyperscaler}</SelectItem>
            <SelectItem value="rental">{t.costRental}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <TargetField
        id={`${id}-ttft`}
        label={t.maxTtft}
        help={t.maxTtftHelp}
        value={targets.maxTtftMs}
        max={SLA_MAX_TARGET_MS}
        invalidLabel={t.invalidTarget}
        testId="sla-ttft-input"
        onCommit={(maxTtftMs) => onTargetsChange({ ...targets, maxTtftMs })}
      />
      <TargetField
        id={`${id}-tpot`}
        label={t.maxTpot}
        help={t.maxTpotHelp}
        value={targets.maxTpotMs}
        max={SLA_MAX_TARGET_MS}
        invalidLabel={t.invalidTarget}
        testId="sla-tpot-input"
        onCommit={(maxTpotMs) => onTargetsChange({ ...targets, maxTpotMs })}
      />
      <div className="flex min-w-0 flex-col gap-1.5">
        <LabelWithTooltip
          htmlFor={`${id}-attainment`}
          label={t.requiredAttainment}
          tooltip={t.requiredAttainmentHelp}
        />
        <Input
          id={`${id}-attainment`}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          value={attainmentText}
          data-testid="sla-attainment-input"
          onChange={(event) => {
            setAttainmentText(event.target.value);
            const percent = Number(event.target.value);
            const { min, max } = SLA_ATTAINMENT_PERCENT_RANGE;
            if (event.target.value.trim() !== '' && percent >= min && percent <= max) {
              onTargetsChange({
                ...targets,
                requiredAttainment: attainmentFraction(percent),
              });
            }
          }}
          onBlur={() => setAttainmentText(String(attainmentPercent(targets.requiredAttainment)))}
        />
      </div>
      <div className="col-span-2 flex min-w-0 flex-col gap-1.5 md:col-span-3">
        <div className="flex items-center gap-2">
          <Switch
            id={`${id}-e2e-toggle`}
            checked={e2eOn}
            aria-label={t.e2eToggle}
            data-testid="sla-e2e-toggle"
            onCheckedChange={(checked) => {
              onTargetsChange({ ...targets, maxE2eS: checked ? SLA_DEFAULT_E2E_S : null });
              track('sla_targets_e2e_toggled', { enabled: checked });
            }}
          />
          <LabelWithTooltip htmlFor={`${id}-e2e`} label={t.maxE2e} tooltip={t.maxE2eHelp} />
        </div>
        {e2eOn && (
          <Input
            id={`${id}-e2e`}
            type="text"
            inputMode="decimal"
            autoComplete="off"
            className="max-w-40"
            defaultValue={String(targets.maxE2eS)}
            key={e2eOn ? 'on' : 'off'}
            data-testid="sla-e2e-input"
            onChange={(event) => {
              const parsed = parseTargetInput(event.target.value, SLA_MAX_TARGET_MS / 1000);
              if (parsed !== null) onTargetsChange({ ...targets, maxE2eS: parsed });
            }}
          />
        )}
      </div>
      {targets.maxTtftMs === SLA_EXAMPLE_TARGETS.maxTtftMs &&
        targets.maxTpotMs === SLA_EXAMPLE_TARGETS.maxTpotMs &&
        targets.requiredAttainment === SLA_EXAMPLE_TARGETS.requiredAttainment &&
        targets.maxE2eS === null && (
          <p className="col-span-full text-xs text-muted-foreground" data-testid="sla-example-note">
            {t.exampleNote}
          </p>
        )}
    </ControlPanel>
  );
}
